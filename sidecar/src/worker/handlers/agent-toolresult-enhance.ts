import { eq } from 'drizzle-orm';
import { getAgentFlags } from '../../config/agent-flags';
import { getDb } from '../../db';
import { providers } from '../../db/schema';
import { appendAgentEvent } from '../../services/agent-event-store';
import {
  findLatestCompletedReadabilityBySourceHash,
  getToolResultReadabilityByEntryId,
  updateToolResultReadabilityStatus,
} from '../../services/agent-toolresult-readability-store';
import { parseProviderCapabilities } from '../../services/provider-capabilities';

const ENHANCE_TIMEOUT_MS = 1800;
const ENHANCED_VERSION = 1;
const MAX_SUMMARY_CHARS = 72;
const MAX_DETAIL_CHARS = 500;
const MAX_SOURCE_CHARS = 8000;

interface EnhanceTaskInput {
  sessionId: string;
  turnId?: string | null;
  entryId: string;
  toolCallId?: string | null;
  toolName?: string;
  providerId?: string | null;
  sourceHash: string;
  sourceSize?: number;
  sourcePayload?: unknown;
  locale?: string;
  queuedAt?: string;
}

interface TextProvider {
  id: string;
  format: string;
  baseUrl: string;
  apiKey: string;
  textModel: string;
  capabilities?: string | null;
}

interface EnhancementOutput {
  summary: string;
  detail: string;
  confidence: number;
  reason: string;
  evidence: string[];
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') return {};
  return value as Record<string, unknown>;
}

function toText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
}

function clampText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function extractJsonCandidate(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return text.slice(start, end + 1);
  }
  return null;
}

function parseJsonSafe(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

function firstNonEmptyString(values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function parseEnhancementOutput(raw: string): EnhancementOutput | null {
  const candidate = extractJsonCandidate(raw);
  if (!candidate) return null;
  const parsed = parseJsonSafe(candidate);
  if (!parsed || typeof parsed !== 'object') return null;
  const row = parsed as Record<string, unknown>;

  const summary = firstNonEmptyString([
    row.summary,
    row.title,
    row.headline,
  ]);
  const detail = firstNonEmptyString([
    row.detail,
    row.details,
    row.description,
  ]);
  if (!summary || !detail) return null;

  const confidenceRaw =
    typeof row.confidence === 'number' && Number.isFinite(row.confidence)
      ? row.confidence
      : 0.5;
  const confidence = Math.max(0, Math.min(1, Number(confidenceRaw.toFixed(2))));
  const reason =
    firstNonEmptyString([row.reason, row.rationale, row.why]) || 'RULE_SAFE';
  const evidence = toStringArray(row.evidence).slice(0, 10);

  return {
    summary: clampText(normalizeWhitespace(summary), MAX_SUMMARY_CHARS),
    detail: clampText(detail.trim(), MAX_DETAIL_CHARS),
    confidence,
    reason,
    evidence,
  };
}

function normalizeForMatch(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function extractRiskTokens(value: string): string[] {
  const set = new Set<string>();
  const push = (raw: string) => {
    const token = raw.trim();
    if (!token) return;
    set.add(token.toLowerCase());
  };

  for (const match of value.matchAll(
    /(?:\/|[a-zA-Z]:\\)[^\s"'`，。；、]{3,}/g,
  )) {
    push(match[0]);
  }

  for (const match of value.matchAll(
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
  )) {
    push(match[0]);
  }

  for (const match of value.matchAll(
    /\b[a-zA-Z0-9_-]*\d{2,}[a-zA-Z0-9_-]*\b/g,
  )) {
    push(match[0]);
  }

  for (const match of value.matchAll(/\b\d{2,}\b/g)) {
    push(match[0]);
  }

  return Array.from(set).slice(0, 40);
}

function verifyEvidenceAgainstSource(input: {
  summary: string;
  detail: string;
  evidence: string[];
  source: string;
}): { ok: boolean; reason?: string } {
  const sourceNormalized = normalizeForMatch(input.source);

  const missingEvidence = input.evidence
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => !sourceNormalized.includes(normalizeForMatch(item)));

  if (missingEvidence.length > 0) {
    return {
      ok: false,
      reason: `EVIDENCE_NOT_FOUND:${missingEvidence.slice(0, 3).join('|')}`,
    };
  }

  const tokenText = `${input.summary}\n${input.detail}`;
  const riskTokens = extractRiskTokens(tokenText);
  const missingTokens = riskTokens.filter(
    (token) => !sourceNormalized.includes(token),
  );

  if (missingTokens.length > 0) {
    return {
      ok: false,
      reason: `TOKEN_NOT_FOUND:${missingTokens.slice(0, 6).join('|')}`,
    };
  }

  return { ok: true };
}

function buildSourceText(payload: unknown): string {
  const row = toRecord(payload);
  const result = toRecord(row.result);
  const content = Array.isArray(result.content) ? result.content : [];
  const contentText = content
    .map((item) => toRecord(item))
    .map((item) => toText(item.text))
    .filter(Boolean)
    .join('\n');
  const detailText = toText(row.readableDetail) || toText(row.detail);
  const summaryText = toText(row.summary);
  const fallback = JSON.stringify(payload ?? null, null, 2) || '';
  return [summaryText, detailText, contentText, fallback]
    .filter(Boolean)
    .join('\n\n')
    .trim();
}

function buildEnhancePrompt(input: {
  toolName: string;
  locale: string;
  sourceText: string;
  ruleSummary: string;
  ruleDetail: string;
}): string {
  const sourceText = clampText(input.sourceText, MAX_SOURCE_CHARS);
  return `你是 toolResult 可读化增强器。你的任务是在不改变事实的前提下，提高可读性。

硬性约束：
1. 只能基于给定原文，不得编造。
2. summary 最长 ${MAX_SUMMARY_CHARS} 字符，detail 最长 ${MAX_DETAIL_CHARS} 字符。
3. summary/detail 中出现的路径、ID、数字必须在原文出现。
4. 输出语言：${input.locale || 'zh-CN'}。
5. 必须输出严格 JSON，不要 markdown。

输出 JSON schema：
{
  "summary": "string",
  "detail": "string",
  "confidence": "0~1 number",
  "reason": "string",
  "evidence": ["string"]
}

规则层摘要：
${input.ruleSummary || '(empty)'}

规则层详情：
${input.ruleDetail || '(empty)'}

toolName:
${input.toolName}

原始结果（可能含日志/JSON）：
${sourceText}`;
}

function isUnsupportedResponseFormatError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    (lower.includes('unknown') && lower.includes('response_format')) ||
    (lower.includes('unsupported') && lower.includes('response_format')) ||
    (lower.includes('unrecognized') && lower.includes('response_format'))
  );
}

function extractOpenAIMessageText(message: unknown): string {
  const row = toRecord(message);
  const content = row.content;
  if (typeof content === 'string' && content.trim()) {
    return content.trim();
  }
  if (Array.isArray(content)) {
    const merged = content
      .map((part) => toRecord(part))
      .map((part) => toText(part.text))
      .filter(Boolean)
      .join('\n')
      .trim();
    if (merged) return merged;
  }
  return '';
}

function hasTextCapability(provider: TextProvider | null): boolean {
  if (!provider) return false;
  if (!provider.textModel?.trim()) return false;
  if (provider.format === 'local') return true;
  return provider.apiKey?.trim().length > 0;
}

async function resolveTextProvider(
  providerId?: string | null,
): Promise<TextProvider | null> {
  const db = getDb();
  const trimmedId = typeof providerId === 'string' ? providerId.trim() : '';

  const [selected] = trimmedId
    ? await db
        .select()
        .from(providers)
        .where(eq(providers.id, trimmedId))
        .limit(1)
    : await db.select().from(providers).where(eq(providers.isDefault, true)).limit(1);

  const provider = selected
    ? selected
    : (await db.select().from(providers).limit(1))[0];
  if (!provider) return null;

  return {
    id: provider.id,
    format: provider.format,
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey,
    textModel: provider.textModel,
    capabilities: provider.capabilities,
  };
}

function toFetchError(fallback: string, body: unknown): Error {
  const payload = toRecord(body);
  const apiError = toRecord(payload.error);
  const message =
    toText(apiError.message) || toText(payload.message) || fallback;
  return new Error(message);
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function callTextModel(
  provider: TextProvider,
  prompt: string,
  timeoutMs: number,
): Promise<string> {
  if (provider.format === 'gemini') {
    const url = `${provider.baseUrl}/models/${provider.textModel}:generateContent?key=${provider.apiKey}`;
    const res = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      },
      timeoutMs,
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw toFetchError(`Gemini failed: HTTP ${res.status}`, data);
    }

    const parts = toRecord(data).candidates;
    if (!Array.isArray(parts) || parts.length === 0) {
      throw new Error('Gemini failed: empty response');
    }
    const first = toRecord(parts[0]);
    const content = toRecord(first.content);
    const text = Array.isArray(content.parts)
      ? content.parts
          .map((part) => toRecord(part))
          .map((part) => toText(part.text))
          .filter(Boolean)
          .join('\n')
          .trim()
      : '';
    if (!text) {
      throw new Error('Gemini failed: empty text');
    }
    return text;
  }

  const url = `${provider.baseUrl}/chat/completions`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (provider.format !== 'local' && provider.apiKey?.trim()) {
    headers.Authorization = `Bearer ${provider.apiKey}`;
  }

  const capabilities = parseProviderCapabilities(provider.capabilities);
  const chatJsonModeSupported = capabilities?.openai?.chatJsonMode?.supported;
  const bodyWithJsonMode = {
    model: provider.textModel,
    temperature: 0.2,
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
  };
  const bodyFallback = {
    model: provider.textModel,
    temperature: 0.2,
    messages: [{ role: 'user', content: prompt }],
  };

  let res = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers,
      body: JSON.stringify(
        chatJsonModeSupported === false ? bodyFallback : bodyWithJsonMode,
      ),
    },
    timeoutMs,
  );
  let data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const message = toText(toRecord(toRecord(data).error).message);
    if (isUnsupportedResponseFormatError(message)) {
      res = await fetchWithTimeout(
        url,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(bodyFallback),
        },
        timeoutMs,
      );
      data = await res.json().catch(() => ({}));
    }
  }

  if (!res.ok) {
    throw toFetchError(`Chat failed: HTTP ${res.status}`, data);
  }

  const text = extractOpenAIMessageText(
    toRecord(data).choices && Array.isArray(toRecord(data).choices)
      ? toRecord((toRecord(data).choices as unknown[])[0]).message
      : null,
  );
  if (!text) {
    throw new Error('Chat failed: empty text');
  }
  return text;
}

function parseTaskInput(value: unknown): EnhanceTaskInput {
  const row = toRecord(value);
  const sessionId = toText(row.sessionId);
  const entryId = toText(row.entryId);
  const sourceHash = toText(row.sourceHash);
  if (!sessionId || !entryId || !sourceHash) {
    throw new Error('INVALID_TASK_INPUT');
  }

  return {
    sessionId,
    turnId: toText(row.turnId) || null,
    entryId,
    toolCallId: toText(row.toolCallId) || null,
    toolName: toText(row.toolName) || '',
    providerId: toText(row.providerId) || null,
    sourceHash,
    sourceSize:
      typeof row.sourceSize === 'number' && Number.isFinite(row.sourceSize)
        ? row.sourceSize
        : undefined,
    sourcePayload: row.sourcePayload,
    locale: toText(row.locale) || 'zh-CN',
    queuedAt: toText(row.queuedAt) || undefined,
  };
}

function isAbortTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return message.includes('abort') || message.includes('timeout');
}

export async function agentToolResultEnhanceHandler(
  input: unknown,
): Promise<{
  status: 'completed' | 'failed' | 'skipped';
  entryId: string;
  cacheHit?: boolean;
  reason?: string;
}> {
  const startedAt = Date.now();
  const task = parseTaskInput(input);
  const flags = getAgentFlags();

  if (!flags.toolResultEnhancement) {
    await updateToolResultReadabilityStatus({
      entryId: task.entryId,
      status: 'skipped',
      error: 'FEATURE_DISABLED',
      latencyMs: Date.now() - startedAt,
    });
    return {
      status: 'skipped',
      entryId: task.entryId,
      reason: 'FEATURE_DISABLED',
    };
  }

  const current = await getToolResultReadabilityByEntryId(task.entryId);
  if (!current) {
    return {
      status: 'skipped',
      entryId: task.entryId,
      reason: 'READABILITY_NOT_FOUND',
    };
  }

  const cache = await findLatestCompletedReadabilityBySourceHash({
    sessionId: task.sessionId,
    sourceHash: task.sourceHash,
    excludeEntryId: task.entryId,
  });

  if (cache?.enhancedSummary && cache.enhancedDetail) {
    const enhancedAt = new Date().toISOString();
    await updateToolResultReadabilityStatus({
      entryId: task.entryId,
      status: 'completed',
      enhancedSummary: cache.enhancedSummary,
      enhancedDetail: cache.enhancedDetail,
      enhancedConfidence: cache.enhancedConfidence ?? 0.92,
      enhancedModel: cache.enhancedModel || null,
      enhancedReason: 'CACHE_HIT',
      latencyMs: Date.now() - startedAt,
      error: null,
    });

    await appendAgentEvent({
      sessionId: task.sessionId,
      turnId: task.turnId || null,
      eventType: 'tool.result.enhanced',
      payload: {
        entryId: task.entryId,
        enhancedVersion: ENHANCED_VERSION,
        enhancedAt,
        cacheHit: true,
      },
    });

    return {
      status: 'completed',
      entryId: task.entryId,
      cacheHit: true,
    };
  }

  const provider = await resolveTextProvider(task.providerId);
  if (!provider || !hasTextCapability(provider)) {
    await updateToolResultReadabilityStatus({
      entryId: task.entryId,
      status: 'skipped',
      error: provider ? 'TEXT_CAPABILITY_UNAVAILABLE' : 'NO_PROVIDER',
      latencyMs: Date.now() - startedAt,
    });
    return {
      status: 'skipped',
      entryId: task.entryId,
      reason: provider ? 'TEXT_CAPABILITY_UNAVAILABLE' : 'NO_PROVIDER',
    };
  }

  const payload = toRecord(task.sourcePayload);
  const sourceText = buildSourceText(payload);
  const toolName = toText(payload.toolName) || task.toolName || 'tool';
  const ruleSummary = toText(payload.summary) || current.ruleSummary;
  const ruleDetail = toText(payload.readableDetail) || current.ruleDetail;

  try {
    const prompt = buildEnhancePrompt({
      toolName,
      locale: task.locale || 'zh-CN',
      sourceText,
      ruleSummary,
      ruleDetail,
    });
    const raw = await callTextModel(provider, prompt, ENHANCE_TIMEOUT_MS);
    const enhanced = parseEnhancementOutput(raw);
    if (!enhanced) {
      throw new Error('ENHANCE_OUTPUT_PARSE_FAILED');
    }

    const verifyResult = verifyEvidenceAgainstSource({
      summary: enhanced.summary,
      detail: enhanced.detail,
      evidence: enhanced.evidence,
      source: sourceText,
    });
    if (!verifyResult.ok) {
      throw new Error(verifyResult.reason || 'EVIDENCE_VERIFY_FAILED');
    }

    const enhancedAt = new Date().toISOString();
    await updateToolResultReadabilityStatus({
      entryId: task.entryId,
      status: 'completed',
      enhancedSummary: enhanced.summary,
      enhancedDetail: enhanced.detail,
      enhancedConfidence: enhanced.confidence,
      enhancedModel: provider.textModel,
      enhancedReason: enhanced.reason,
      latencyMs: Date.now() - startedAt,
      error: null,
    });

    await appendAgentEvent({
      sessionId: task.sessionId,
      turnId: task.turnId || null,
      eventType: 'tool.result.enhanced',
      payload: {
        entryId: task.entryId,
        enhancedVersion: ENHANCED_VERSION,
        enhancedAt,
        confidence: enhanced.confidence,
      },
    });

    return {
      status: 'completed',
      entryId: task.entryId,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateToolResultReadabilityStatus({
      entryId: task.entryId,
      status: 'failed',
      latencyMs: Date.now() - startedAt,
      error: isAbortTimeoutError(error) ? 'ENHANCE_TIMEOUT' : message,
    });
    return {
      status: 'failed',
      entryId: task.entryId,
      reason: message,
    };
  }
}
