import {
  formatPayloadForDisplay,
  sanitizeTextForDisplay,
} from '@/lib/agent-display';
import type { AgentEntry } from '@/types/agent';

export interface OptimisticUserMessage {
  id: string;
  text: string;
  createdAt: string;
}

export interface StreamingInsertion {
  id: string;
  clientMessageId: string;
  text: string;
  position: number;
  seq: number;
  createdAt?: string;
}

interface ParsedAssistantPayload {
  text: string;
  turnId: string | null;
  stopReason: string | null;
  errorMessage: string | null;
}

export interface AgentMessageRow {
  kind: 'message';
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: string | null;
  optimistic?: boolean;
}

export interface AgentSummaryRow {
  kind: 'summary';
  id: string;
  title: string;
  detail: string;
  createdAt: string | null;
  level: 'info' | 'error';
  category?: 'system' | 'tool';
}

export type AgentMessageListRow = AgentMessageRow | AgentSummaryRow;

function toPayloadRecord(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== 'object') return {};
  return payload as Record<string, unknown>;
}

function extractText(payload: unknown): string {
  const row = toPayloadRecord(payload);

  if (typeof row.text === 'string' && row.text.trim()) {
    return sanitizeTextForDisplay(row.text.trim());
  }

  if (typeof row.delta === 'string' && row.delta.trim()) {
    return sanitizeTextForDisplay(row.delta.trim());
  }

  if (typeof row.message === 'string' && row.message.trim()) {
    return sanitizeTextForDisplay(row.message.trim());
  }

  return '';
}

function extractAssistantText(payload: unknown): string {
  const row = toPayloadRecord(payload);

  if (typeof row.text === 'string' && row.text.trim()) {
    return sanitizeTextForDisplay(row.text.trim());
  }

  if (typeof row.delta === 'string' && row.delta.trim()) {
    return sanitizeTextForDisplay(row.delta.trim());
  }

  return '';
}

function parseAssistantPayload(payload: unknown): ParsedAssistantPayload {
  const row = toPayloadRecord(payload);
  const text = extractAssistantText(payload);

  const turnId =
    typeof row.turnId === 'string' && row.turnId.trim()
      ? row.turnId.trim()
      : null;

  const stopReason =
    typeof row.stopReason === 'string' && row.stopReason.trim()
      ? row.stopReason.trim()
      : null;

  const errorMessage =
    typeof row.errorMessage === 'string' && row.errorMessage.trim()
      ? row.errorMessage.trim()
      : typeof row.message === 'string' && row.message.trim()
        ? row.message.trim()
        : null;

  return {
    text,
    turnId,
    stopReason,
    errorMessage,
  };
}

function summaryTitleForAssistant(payload: ParsedAssistantPayload): {
  title: string;
  level: 'info' | 'error';
} {
  if (payload.stopReason === 'toolUse') {
    return {
      title: '工具调用中',
      level: 'info',
    };
  }

  if (payload.stopReason === 'aborted') {
    return {
      title: '回合已停止',
      level: 'info',
    };
  }

  if (payload.stopReason === 'error') {
    return {
      title: payload.errorMessage
        ? `回合失败：${sanitizeTextForDisplay(payload.errorMessage, 80)}`
        : '回合失败',
      level: 'error',
    };
  }

  return {
    title: '系统消息',
    level: 'info',
  };
}

function fallbackMessageText(payload: unknown): string {
  return formatPayloadForDisplay(payload);
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') return {};
  return value as Record<string, unknown>;
}

function firstNonEmptyLine(value: string): string {
  const line = value
    .split('\n')
    .map((item) => item.trim())
    .find((item) => item.length > 0);
  return line || '';
}

function shortId(value: string): string {
  if (value.length <= 12) return value;
  return value.slice(0, 8);
}

function parseJsonString(value: unknown): unknown | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function getToolResultText(result: Record<string, unknown>): string {
  const content = Array.isArray(result.content) ? result.content : [];
  for (const item of content) {
    const row = toRecord(item);
    if (typeof row.text === 'string' && row.text.trim()) {
      return row.text.trim();
    }
  }
  if (typeof result.message === 'string' && result.message.trim()) {
    return result.message.trim();
  }
  return '';
}

function scalarToText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
}

function pickScalarLines(
  source: Record<string, unknown>,
  keys: string[],
): string[] {
  const lines: string[] = [];
  for (const key of keys) {
    const value = scalarToText(source[key]);
    if (!value) continue;
    lines.push(`${key}: ${value}`);
  }
  return lines;
}

function firstReadableLines(input: string, maxLines = 10): string[] {
  return input
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, maxLines);
}

function collectScalarLinesFromValue(
  value: unknown,
  options?: {
    prefix?: string;
    depth?: number;
    maxLines?: number;
  },
): string[] {
  const prefix = options?.prefix || '';
  const depth = options?.depth ?? 0;
  const maxLines = options?.maxLines ?? 14;
  if (depth > 3) return [];

  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) return [];
    return [prefix ? `${prefix}: ${text}` : text];
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    const text = String(value);
    return [prefix ? `${prefix}: ${text}` : text];
  }
  if (!value || typeof value !== 'object') {
    return [];
  }

  const lines: string[] = [];
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      if (lines.length >= maxLines) break;
      const subLines = collectScalarLinesFromValue(value[index], {
        prefix: prefix ? `${prefix}[${index}]` : `[${index}]`,
        depth: depth + 1,
        maxLines: maxLines - lines.length,
      });
      lines.push(...subLines);
    }
    return lines.slice(0, maxLines);
  }

  const keys = Object.keys(value as Record<string, unknown>);
  for (const key of keys) {
    if (lines.length >= maxLines) break;
    const subLines = collectScalarLinesFromValue(
      (value as Record<string, unknown>)[key],
      {
        prefix: prefix ? `${prefix}.${key}` : key,
        depth: depth + 1,
        maxLines: maxLines - lines.length,
      },
    );
    lines.push(...subLines);
  }

  return lines.slice(0, maxLines);
}

function toolResultDetail(payload: unknown): string {
  const row = toRecord(payload);
  const enhancedDetail = scalarToText(row.enhancedDetail);
  if (enhancedDetail) {
    return sanitizeTextForDisplay(enhancedDetail, 1800);
  }

  const readableDetail = scalarToText(row.readableDetail);
  if (readableDetail) {
    return sanitizeTextForDisplay(readableDetail, 1800);
  }

  const toolName =
    typeof row.toolName === 'string' && row.toolName.trim()
      ? row.toolName.trim()
      : 'tool';
  const result = toRecord(row.result);
  const details = toRecord(result.details);
  const rawText = getToolResultText(result);
  const parsedFromText = toRecord(parseJsonString(rawText));
  const merged = { ...parsedFromText, ...details };

  if (
    toolName === 'photo_enqueue_generation' ||
    toolName === 'photo_get_generation_status'
  ) {
    const lines = pickScalarLines(merged, [
      'status',
      'taskId',
      'providerId',
      'updatedAt',
      'error',
    ]);
    if (lines.length > 0) return sanitizeTextForDisplay(lines.join('\n'), 800);
  }

  if (toolName === 'copy_generate_variants' && rawText) {
    const lines = firstReadableLines(rawText, 16);
    if (lines.length > 0) return sanitizeTextForDisplay(lines.join('\n'), 1800);
  }

  if (rawText) {
    const parsed = parseJsonString(rawText);
    if (parsed && typeof parsed === 'object') {
      const parsedLines = pickScalarLines(toRecord(parsed), [
        'status',
        'taskId',
        'providerId',
        'updatedAt',
        'error',
        'message',
      ]);
      if (parsedLines.length > 0) {
        return sanitizeTextForDisplay(parsedLines.join('\n'), 1200);
      }

      const extractedLines = collectScalarLinesFromValue(parsed, {
        maxLines: 14,
      });
      if (extractedLines.length > 0) {
        return sanitizeTextForDisplay(extractedLines.join('\n'), 1500);
      }
    }

    const readableLines = firstReadableLines(rawText, 14);
    if (readableLines.length > 0) {
      return sanitizeTextForDisplay(readableLines.join('\n'), 1500);
    }
  }

  const detailLines = pickScalarLines(details, [
    'status',
    'taskId',
    'providerId',
    'updatedAt',
    'error',
    'message',
  ]);
  if (detailLines.length > 0) {
    return sanitizeTextForDisplay(detailLines.join('\n'), 1200);
  }

  const extractedLines = collectScalarLinesFromValue(result, {
    maxLines: 14,
  });
  if (extractedLines.length > 0) {
    return sanitizeTextForDisplay(extractedLines.join('\n'), 1500);
  }

  if (import.meta.env.DEV) {
    return formatPayloadForDisplay(result);
  }

  return '';
}

function toolResultTitle(payload: unknown): string {
  const row = toRecord(payload);
  const enhancedSummary = scalarToText(row.enhancedSummary);
  if (enhancedSummary) {
    return sanitizeTextForDisplay(enhancedSummary, 120);
  }

  const summary = scalarToText(row.summary);
  if (summary) {
    return sanitizeTextForDisplay(summary, 120);
  }

  const toolName =
    typeof row.toolName === 'string' && row.toolName.trim()
      ? row.toolName.trim()
      : 'tool';

  const result = toRecord(row.result);
  const details = toRecord(result.details);
  const rawText = getToolResultText(result);
  const jsonText = parseJsonString(rawText);
  const parsedText = toRecord(jsonText);
  const merged = { ...parsedText, ...details };

  if (
    (toolName === 'photo_enqueue_generation' ||
      toolName === 'photo_get_generation_status') &&
    typeof merged.status === 'string'
  ) {
    const task =
      typeof merged.taskId === 'string' ? ` ${shortId(merged.taskId)}` : '';
    return `${merged.status}${task}`;
  }

  if (toolName === 'copy_generate_variants') {
    const titleLine = rawText
      .split('\n')
      .map((item) => item.trim())
      .find((item) => item.startsWith('标题：'));
    if (titleLine) return sanitizeTextForDisplay(titleLine, 120);
  }

  const firstLine = firstNonEmptyLine(rawText);
  if (firstLine) {
    return sanitizeTextForDisplay(firstLine, 120);
  }

  return toolName;
}

export function buildAgentMessageRows(input: {
  entries: AgentEntry[];
  optimisticUserMessages?: OptimisticUserMessage[];
}): AgentMessageListRow[] {
  const { entries, optimisticUserMessages = [] } = input;
  const rows: AgentMessageListRow[] = [];

  const assistantTurnWithFinalText = new Set<string>();

  for (const entry of entries) {
    if (entry.entryType !== 'assistant') continue;
    const parsed = parseAssistantPayload(entry.payload);
    if (parsed.turnId && parsed.text) {
      assistantTurnWithFinalText.add(parsed.turnId);
    }
  }

  for (const entry of entries) {
    if (
      entry.entryType !== 'user' &&
      entry.entryType !== 'assistant' &&
      entry.entryType !== 'toolResult'
    ) {
      continue;
    }

    if (entry.entryType === 'user') {
      const text = extractText(entry.payload) || fallbackMessageText(entry.payload);
      rows.push({
        kind: 'message',
        id: entry.id,
        role: 'user',
        text,
        createdAt: entry.createdAt,
      });
      continue;
    }

    if (entry.entryType === 'toolResult') {
      const row = toRecord(entry.payload);
      const isError = Boolean(row.isError);
      rows.push({
        kind: 'summary',
        id: `${entry.id}:tool-result`,
        title: toolResultTitle(entry.payload),
        detail: toolResultDetail(entry.payload),
        createdAt: entry.createdAt,
        level: isError ? 'error' : 'info',
        category: 'tool',
      });
      continue;
    }

    const parsed = parseAssistantPayload(entry.payload);
    if (parsed.text) {
      rows.push({
        kind: 'message',
        id: entry.id,
        role: 'assistant',
        text: parsed.text,
        createdAt: entry.createdAt,
      });
      continue;
    }

    // 有最终正文时，隐藏同 turn 的 toolUse 中转消息，避免聊天正文被 JSON 噪音干扰。
    if (
      parsed.stopReason === 'toolUse' &&
      parsed.turnId &&
      assistantTurnWithFinalText.has(parsed.turnId)
    ) {
      continue;
    }

    if (
      parsed.stopReason !== 'toolUse' &&
      parsed.stopReason !== 'error' &&
      parsed.stopReason !== 'aborted'
    ) {
      continue;
    }

    const summary = summaryTitleForAssistant(parsed);
    rows.push({
      kind: 'summary',
      id: `${entry.id}:summary`,
      title: summary.title,
      detail: formatPayloadForDisplay(entry.payload),
      createdAt: entry.createdAt,
      level: summary.level,
      category: 'system',
    });
  }

  for (const optimistic of optimisticUserMessages) {
    rows.push({
      kind: 'message',
      id: optimistic.id,
      role: 'user',
      text: sanitizeTextForDisplay(optimistic.text),
      createdAt: optimistic.createdAt,
      optimistic: true,
    });
  }

  return rows;
}
