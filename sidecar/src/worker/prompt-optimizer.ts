import { eq } from 'drizzle-orm';
import { providers, settings } from '../db/schema';
import type { ReferencePlanSummary } from './reference-image-planner';

const OPTIMIZER_TEMPLATE_SETTING_KEY = 'prompt_optimizer_template_v1';

const DEFAULT_OPTIMIZER_TEMPLATE = `你是影楼图片生成提示词优化器。你的目标是把输入提示词整理成更清晰、更可执行的最终出图文本，同时保持事实不变。

硬性约束：
1. 不得编造输入中不存在的人物、年龄、关系、场景、服装、道具、镜头或灯光。
2. 人物身份必须稳定，不可改变人物数量、身份和年龄。
3. 优化重点是消歧、结构化和可执行性，不是改主题。
4. 如存在参考图，人物数量与身份一致性是硬约束，不得被场景参考图覆盖。
5. 如存在场景主题参考图，必须保持其主题布景、道具和光影氛围，不得退化成普通生活照。
6. 输出风格需符合消费级影楼成片质感（主体明确、布景有主题、用光干净）。
7. 输出必须是单张单帧画面，禁止拼图、分屏、多宫格、连环画排版、边框海报感。
8. 输出必须是中文，且只输出 JSON。`;

const DEFAULT_OUTPUT_SCHEMA = `{
  "renderPrompt": "string, 优化后的最终出图提示词（中文）",
  "assumptions": ["string, 可选，补充了哪些保守假设；没有可返回空数组"],
  "conflicts": ["string, 可选，输入中的冲突或歧义；没有可返回空数组"],
  "negativePrompt": "string, 可选，目前仅回显，不保证被图像 provider 消费"
}`;

type TextProvider = {
  id: string;
  format: string;
  baseUrl: string;
  apiKey: string;
  textModel: string;
};

interface OptimizerTemplateConfig {
  version: number;
  template: string;
  outputSchema?: string;
}

export interface PromptOptimizationMeta {
  status: 'optimized' | 'fallback' | 'skipped';
  reason?: string | null;
  providerId?: string | null;
  providerFormat?: string | null;
  textModel?: string | null;
  assumptions: string[];
  conflicts: string[];
  negativePrompt?: string | null;
}

export interface OptimizeImagePromptInput {
  db: any;
  effectivePrompt: string;
  draftPrompt?: string | null;
  providerId?: string | null;
  provider?: TextProvider | null;
  referencePlan?: ReferencePlanSummary | null;
  promptContext?: Record<string, unknown> | null;
}

export interface OptimizeImagePromptResult {
  renderPrompt: string;
  meta: PromptOptimizationMeta;
}

function buildReferenceBindingDeclaration(referencePlan?: ReferencePlanSummary | null): string {
  if (!referencePlan || referencePlan.totalCount <= 0) return '';

  const sceneCount = referencePlan.counts.scene;
  const identityCount = referencePlan.counts.identity;
  const lines: string[] = ['【参考图绑定声明】'];

  if (sceneCount > 0) {
    lines.push(
      `- 已注入场景主题参考图（${sceneCount}张）：优先锁定布景主题、道具关系、色彩与光影氛围。`,
    );
  }

  if (identityCount > 0) {
    lines.push(
      `- 已注入人物身份参考图（${identityCount}张）：仅用于锁定人物身份，不继承其背景与构图。`,
    );
  }

  lines.push('- 优先级：人物数量与身份一致性（硬约束） > 场景主题一致性 > 文本补充细节。');
  lines.push('- 禁止退化为普通生活抓拍照，需保持影楼专业成片质感。');
  lines.push('- 仅允许单张单帧完整画面，禁止拼图、分屏、多宫格、连环画排版。');
  return lines.join('\n');
}

function appendReferenceBindingDeclaration(
  renderPrompt: string,
  referencePlan?: ReferencePlanSummary | null,
): string {
  const trimmed = renderPrompt.trim();
  if (!trimmed) return trimmed;
  const declaration = buildReferenceBindingDeclaration(referencePlan);
  if (!declaration) return trimmed;
  if (trimmed.includes('【参考图绑定声明】')) return trimmed;
  return `${trimmed}\n\n${declaration}`;
}

function parseJsonSafely<T>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
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

function extractJsonCandidate(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }

  return null;
}

function parseOptimizerOutput(raw: string): {
  renderPrompt: string | null;
  assumptions: string[];
  conflicts: string[];
  negativePrompt: string | null;
} {
  const candidate = extractJsonCandidate(raw);
  const parsed = candidate ? parseJsonSafely<Record<string, unknown>>(candidate) : null;
  if (!parsed) {
    return {
      renderPrompt: null,
      assumptions: [],
      conflicts: [],
      negativePrompt: null,
    };
  }

  const renderPrompt =
    typeof parsed.renderPrompt === 'string' && parsed.renderPrompt.trim()
      ? parsed.renderPrompt.trim()
      : null;

  const assumptions = toStringArray(parsed.assumptions);
  const conflicts = toStringArray(parsed.conflicts);
  const negativePrompt =
    typeof parsed.negativePrompt === 'string' && parsed.negativePrompt.trim()
      ? parsed.negativePrompt.trim()
      : null;

  return {
    renderPrompt,
    assumptions,
    conflicts,
    negativePrompt,
  };
}

function hasTextCapability(provider: TextProvider | null): boolean {
  if (!provider) return false;
  if (!provider.textModel?.trim()) return false;
  if (provider.format === 'local') return true;
  return provider.apiKey?.trim().length > 0;
}

async function resolveTextProvider(
  db: any,
  providerId?: string | null,
): Promise<TextProvider | null> {
  if (providerId && providerId.trim()) {
    const [selected] = await db
      .select()
      .from(providers)
      .where(eq(providers.id, providerId.trim()))
      .limit(1);
    if (!selected) return null;
    return {
      id: selected.id,
      format: selected.format,
      baseUrl: selected.baseUrl,
      apiKey: selected.apiKey,
      textModel: selected.textModel,
    };
  }

  const [defaultProvider] = await db
    .select()
    .from(providers)
    .where(eq(providers.isDefault, true))
    .limit(1);
  if (!defaultProvider) return null;

  return {
    id: defaultProvider.id,
    format: defaultProvider.format,
    baseUrl: defaultProvider.baseUrl,
    apiKey: defaultProvider.apiKey,
    textModel: defaultProvider.textModel,
  };
}

async function loadOptimizerTemplate(db: any): Promise<{
  version: number;
  template: string;
  outputSchema: string;
}> {
  const [setting] = await db
    .select()
    .from(settings)
    .where(eq(settings.key, OPTIMIZER_TEMPLATE_SETTING_KEY))
    .limit(1);

  if (!setting?.value) {
    return {
      version: 1,
      template: DEFAULT_OPTIMIZER_TEMPLATE,
      outputSchema: DEFAULT_OUTPUT_SCHEMA,
    };
  }

  const parsedObj = parseJsonSafely<OptimizerTemplateConfig>(setting.value);
  if (parsedObj && typeof parsedObj.template === 'string' && parsedObj.template.trim()) {
    return {
      version:
        typeof parsedObj.version === 'number' && Number.isFinite(parsedObj.version)
          ? parsedObj.version
          : 1,
      template: parsedObj.template.trim(),
      outputSchema:
        typeof parsedObj.outputSchema === 'string' && parsedObj.outputSchema.trim()
          ? parsedObj.outputSchema.trim()
          : DEFAULT_OUTPUT_SCHEMA,
    };
  }

  if (typeof setting.value === 'string' && setting.value.trim()) {
    return {
      version: 1,
      template: setting.value.trim(),
      outputSchema: DEFAULT_OUTPUT_SCHEMA,
    };
  }

  return {
    version: 1,
    template: DEFAULT_OPTIMIZER_TEMPLATE,
    outputSchema: DEFAULT_OUTPUT_SCHEMA,
  };
}

function pickPromptContextForOptimizer(
  promptContext?: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!promptContext || typeof promptContext !== 'object') return null;
  const picked: Record<string, unknown> = {};
  for (const key of ['composer', 'owner', 'sources', 'inputs']) {
    if (key in promptContext) {
      picked[key] = promptContext[key];
    }
  }
  return Object.keys(picked).length > 0 ? picked : null;
}

function buildReferenceSummaryText(referencePlan?: ReferencePlanSummary | null): string {
  if (!referencePlan) return '无';
  const lines: string[] = [
    `总数: ${referencePlan.totalCount}`,
    `identity(${referencePlan.counts.identity}): ${referencePlan.byRole.identity.join(' | ') || '无'}`,
    `scene(${referencePlan.counts.scene}): ${referencePlan.byRole.scene.join(' | ') || '无'}`,
  ];
  if (referencePlan.droppedGeneratedImages.length > 0) {
    lines.push(`已过滤历史生成图: ${referencePlan.droppedGeneratedImages.join(' | ')}`);
  }
  return lines.join('\n');
}

function buildOptimizerPrompt(input: {
  template: string;
  outputSchema: string;
  draftPrompt?: string | null;
  effectivePrompt: string;
  referencePlan?: ReferencePlanSummary | null;
  promptContext?: Record<string, unknown> | null;
}): string {
  const context = pickPromptContextForOptimizer(input.promptContext);
  const contextText = context ? JSON.stringify(context, null, 2) : 'null';
  const draftPrompt = input.draftPrompt?.trim() || '(empty)';
  const refSummary = buildReferenceSummaryText(input.referencePlan);

  return `${input.template}

## 输入
- draftPrompt:
${draftPrompt}

- effectivePrompt（优化前）:
${input.effectivePrompt}

- 参考图摘要:
${refSummary}

- promptContext:
${contextText}

## 输出格式（严格 JSON，不要 markdown）
${input.outputSchema}

仅输出一个 JSON 对象。`;
}

async function callTextModel(provider: TextProvider, prompt: string): Promise<string> {
  if (provider.format === 'gemini') {
    const url = `${provider.baseUrl}/models/${provider.textModel}:generateContent?key=${provider.apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(
        (err as { error?: { message?: string } })?.error?.message ||
          `Gemini optimize failed: HTTP ${res.status}`,
      );
    }
    const data = await res.json();
    const parts = (data as any)?.candidates?.[0]?.content?.parts;
    if (!Array.isArray(parts) || parts.length === 0) {
      throw new Error('Gemini optimize failed: empty response');
    }
    const text = parts
      .map((part: any) => (typeof part?.text === 'string' ? part.text : ''))
      .join('\n')
      .trim();
    if (!text) {
      throw new Error('Gemini optimize failed: empty text');
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

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: provider.textModel,
      temperature: 0.2,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { error?: { message?: string } })?.error?.message ||
        `Chat optimize failed: HTTP ${res.status}`,
    );
  }

  const data = await res.json();
  const content = (data as any)?.choices?.[0]?.message?.content;
  if (typeof content === 'string' && content.trim()) {
    return content.trim();
  }
  if (Array.isArray(content)) {
    const merged = content
      .map((part: any) => (typeof part?.text === 'string' ? part.text : ''))
      .join('\n')
      .trim();
    if (merged) return merged;
  }
  throw new Error('Chat optimize failed: empty text');
}

export async function optimizeImagePrompt(
  input: OptimizeImagePromptInput,
): Promise<OptimizeImagePromptResult> {
  const sourcePrompt = input.effectivePrompt?.trim();
  if (!sourcePrompt) {
    return {
      renderPrompt: '',
      meta: {
        status: 'skipped',
        reason: 'EMPTY_EFFECTIVE_PROMPT',
        assumptions: [],
        conflicts: [],
        providerId: null,
        providerFormat: null,
        textModel: null,
      },
    };
  }

  const provider = input.provider || (await resolveTextProvider(input.db, input.providerId));
  if (!provider || !hasTextCapability(provider)) {
    const finalPrompt = appendReferenceBindingDeclaration(sourcePrompt, input.referencePlan);
    return {
      renderPrompt: finalPrompt,
      meta: {
        status: 'skipped',
        reason: provider ? 'TEXT_CAPABILITY_UNAVAILABLE' : 'NO_PROVIDER',
        assumptions: [],
        conflicts: [],
        providerId: provider?.id || null,
        providerFormat: provider?.format || null,
        textModel: provider?.textModel || null,
      },
    };
  }

  try {
    const template = await loadOptimizerTemplate(input.db);
    const optimizerPrompt = buildOptimizerPrompt({
      template: template.template,
      outputSchema: template.outputSchema,
      draftPrompt: input.draftPrompt,
      effectivePrompt: sourcePrompt,
      referencePlan: input.referencePlan,
      promptContext: input.promptContext,
    });
    const raw = await callTextModel(provider, optimizerPrompt);
    const parsed = parseOptimizerOutput(raw);
    if (!parsed.renderPrompt) {
      const finalPrompt = appendReferenceBindingDeclaration(sourcePrompt, input.referencePlan);
      return {
        renderPrompt: finalPrompt,
        meta: {
          status: 'fallback',
          reason: 'OPTIMIZER_OUTPUT_PARSE_FAILED',
          assumptions: [],
          conflicts: [],
          providerId: provider.id,
          providerFormat: provider.format,
          textModel: provider.textModel,
        },
      };
    }

    const finalPrompt = appendReferenceBindingDeclaration(parsed.renderPrompt, input.referencePlan);
    return {
      renderPrompt: finalPrompt,
      meta: {
        status: 'optimized',
        reason: null,
        assumptions: parsed.assumptions,
        conflicts: parsed.conflicts,
        negativePrompt: parsed.negativePrompt,
        providerId: provider.id,
        providerFormat: provider.format,
        textModel: provider.textModel,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'PROMPT_OPTIMIZER_ERROR';
    const finalPrompt = appendReferenceBindingDeclaration(sourcePrompt, input.referencePlan);
    return {
      renderPrompt: finalPrompt,
      meta: {
        status: 'fallback',
        reason: message,
        assumptions: [],
        conflicts: [],
        providerId: provider.id,
        providerFormat: provider.format,
        textModel: provider.textModel,
      },
    };
  }
}
