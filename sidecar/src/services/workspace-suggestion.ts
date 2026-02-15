import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { getDb } from '../db';
import { providers } from '../db/schema';

export type WorkspaceNodeType =
  | 'sceneAssetCard'
  | 'modelAssetCard'
  | 'note'
  | 'group';

export interface WorkspaceNodeInput {
  id: string;
  type: WorkspaceNodeType;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  groupId?: string | null;
  meta?: Record<string, unknown> | null;
}

export type WorkspaceCanvasOperation =
  | {
      type: 'addNode';
      node: Partial<WorkspaceNodeInput> & { type: WorkspaceNodeType; title?: string };
    }
  | {
      type: 'moveNode';
      nodeId: string;
      x: number;
      y: number;
    }
  | {
      type: 'groupNodes';
      nodeIds: string[];
      groupId?: string;
      title?: string;
    }
  | {
      type: 'updateNote';
      nodeId: string;
      content: string;
      title?: string;
    };

export interface WorkspaceActionCard {
  id: string;
  kind: 'addNode' | 'moveNode' | 'groupNodes' | 'updateNote';
  title: string;
  reason: string;
  operations: WorkspaceCanvasOperation[];
}

export interface WorkspaceSuggestionResult {
  assistantMessage: string;
  actionCards: WorkspaceActionCard[];
  rawText: string;
}

export class WorkspaceSuggestionError extends Error {
  status: number;
  code: string;

  constructor(options: { message: string; status: number; code: string }) {
    super(options.message);
    this.name = 'WorkspaceSuggestionError';
    this.status = options.status;
    this.code = options.code;
  }
}

interface ProviderLike {
  format: string;
  baseUrl: string;
  apiKey: string;
  textModel: string;
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function clampNumber(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function extractJsonBlock(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed;

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fencedMatch?.[1]) {
    const fenced = fencedMatch[1].trim();
    if (fenced.startsWith('{') && fenced.endsWith('}')) return fenced;
  }

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }

  throw new WorkspaceSuggestionError({
    message: 'AI 返回格式异常，未找到 JSON 内容。',
    status: 422,
    code: 'INVALID_ACTION_CARD',
  });
}

function normalizeActionCards(input: unknown): WorkspaceActionCard[] {
  if (!Array.isArray(input)) return [];

  const cards: WorkspaceActionCard[] = [];

  for (const rawCard of input) {
    if (!isRecord(rawCard)) continue;
    const kind =
      rawCard.kind === 'addNode' ||
      rawCard.kind === 'moveNode' ||
      rawCard.kind === 'groupNodes' ||
      rawCard.kind === 'updateNote'
        ? rawCard.kind
        : null;
    if (!kind) continue;

    const operationsRaw = Array.isArray(rawCard.operations)
      ? rawCard.operations
      : [];
    const operations: WorkspaceCanvasOperation[] = [];

    for (const rawOp of operationsRaw) {
      if (!isRecord(rawOp)) continue;
      const type = rawOp.type;
      if (type === 'addNode' && isRecord(rawOp.node)) {
        const node = rawOp.node;
        const nodeType =
          node.type === 'sceneAssetCard' ||
          node.type === 'modelAssetCard' ||
          node.type === 'note' ||
          node.type === 'group'
            ? node.type
            : null;
        if (!nodeType) continue;
        operations.push({
          type: 'addNode',
          node: {
            type: nodeType,
            title: typeof node.title === 'string' ? node.title.trim() : '',
            x: clampNumber(node.x, 40),
            y: clampNumber(node.y, 40),
            width: clampNumber(node.width, 220),
            height: clampNumber(node.height, 160),
            zIndex: clampNumber(node.zIndex, 1),
            groupId:
              typeof node.groupId === 'string' ? node.groupId.trim() : undefined,
            meta: isRecord(node.meta) ? node.meta : undefined,
          },
        });
        continue;
      }

      if (type === 'moveNode' && typeof rawOp.nodeId === 'string') {
        operations.push({
          type: 'moveNode',
          nodeId: rawOp.nodeId,
          x: clampNumber(rawOp.x, 0),
          y: clampNumber(rawOp.y, 0),
        });
        continue;
      }

      if (type === 'groupNodes' && Array.isArray(rawOp.nodeIds)) {
        const nodeIds = rawOp.nodeIds
          .filter((item): item is string => typeof item === 'string')
          .map((item) => item.trim())
          .filter(Boolean);
        if (nodeIds.length < 2) continue;
        operations.push({
          type: 'groupNodes',
          nodeIds,
          groupId: typeof rawOp.groupId === 'string' ? rawOp.groupId : undefined,
          title: typeof rawOp.title === 'string' ? rawOp.title : undefined,
        });
        continue;
      }

      if (
        type === 'updateNote' &&
        typeof rawOp.nodeId === 'string' &&
        typeof rawOp.content === 'string'
      ) {
        operations.push({
          type: 'updateNote',
          nodeId: rawOp.nodeId,
          content: rawOp.content,
          title: typeof rawOp.title === 'string' ? rawOp.title : undefined,
        });
      }
    }

    if (operations.length === 0) continue;

    cards.push({
      id:
        typeof rawCard.id === 'string' && rawCard.id.trim()
          ? rawCard.id.trim()
          : randomUUID(),
      kind,
      title:
        typeof rawCard.title === 'string' && rawCard.title.trim()
          ? rawCard.title.trim()
          : '建议动作',
      reason:
        typeof rawCard.reason === 'string' && rawCard.reason.trim()
          ? rawCard.reason.trim()
          : '根据当前上下文生成',
      operations,
    });
  }

  return cards;
}

async function resolveDefaultProvider(): Promise<ProviderLike> {
  const db = getDb();
  const [provider] = await db
    .select()
    .from(providers)
    .where(eq(providers.isDefault, true))
    .limit(1);

  if (!provider) {
    throw new WorkspaceSuggestionError({
      message: '未配置默认 Provider，无法使用工作台 Chat。',
      status: 400,
      code: 'PROVIDER_REQUIRED',
    });
  }

  if (!provider.textModel?.trim() || !provider.apiKey?.trim()) {
    throw new WorkspaceSuggestionError({
      message: '默认 Provider 缺少文本模型或 API Key。',
      status: 400,
      code: 'PROVIDER_REQUIRED',
    });
  }

  return {
    format: provider.format,
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey,
    textModel: provider.textModel,
  };
}

async function generateText(provider: ProviderLike, prompt: string): Promise<string> {
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
      const err = await res.text().catch(() => '');
      throw new WorkspaceSuggestionError({
        message: `建议生成失败（Gemini ${res.status}）${err ? `: ${err.slice(0, 160)}` : ''}`,
        status: 502,
        code: 'AI_UPSTREAM_ERROR',
      });
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== 'string' || !text.trim()) {
      throw new WorkspaceSuggestionError({
        message: '建议生成失败：模型未返回可用内容。',
        status: 502,
        code: 'AI_UPSTREAM_ERROR',
      });
    }
    return text;
  }

  const url = `${provider.baseUrl}/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify({
      model: provider.textModel,
      temperature: 0.5,
      messages: [
        {
          role: 'system',
          content:
            'You are an assistant for a creative canvas workspace. Always return concise actionable JSON.',
        },
        { role: 'user', content: prompt },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new WorkspaceSuggestionError({
      message: `建议生成失败（OpenAI ${res.status}）${err ? `: ${err.slice(0, 160)}` : ''}`,
      status: 502,
      code: 'AI_UPSTREAM_ERROR',
    });
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) {
    throw new WorkspaceSuggestionError({
      message: '建议生成失败：模型未返回可用内容。',
      status: 502,
      code: 'AI_UPSTREAM_ERROR',
    });
  }
  return text;
}

function buildSuggestionPrompt(input: {
  userInput: string;
  selectedNodes: WorkspaceNodeInput[];
  mentionScenes: Array<{ id: string; name: string; description?: string | null }>;
  mentionModels: Array<{ id: string; name: string; appearancePrompt?: string | null }>;
}): string {
  const selectedSummary = input.selectedNodes
    .slice(0, 12)
    .map((node) => ({
      id: node.id,
      type: node.type,
      title: node.title,
      x: node.x,
      y: node.y,
      meta: node.meta || {},
    }));

  const mentionScenes = input.mentionScenes.slice(0, 12).map((scene) => ({
    id: scene.id,
    name: scene.name,
    description: scene.description || '',
  }));

  const mentionModels = input.mentionModels.slice(0, 12).map((model) => ({
    id: model.id,
    name: model.name,
    appearancePrompt: model.appearancePrompt || '',
  }));

  return [
    '你是一个摄影创作工作台助手。',
    '目标：根据用户输入，生成“可由用户手动应用”的动作卡片，不要自动执行。',
    '输出必须是 JSON 对象，结构如下：',
    '{',
    '  "assistantMessage": "简洁中文回复，最多120字",',
    '  "actionCards": [',
    '    {',
    '      "id": "uuid",',
    '      "kind": "addNode|moveNode|groupNodes|updateNote",',
    '      "title": "动作标题",',
    '      "reason": "为什么建议",',
    '      "operations": [',
    '        { "type": "addNode", "node": { "type": "sceneAssetCard|modelAssetCard|note|group", "title": "...", "x": 120, "y": 80, "width": 220, "height": 160, "meta": {} } }',
    '      ]',
    '    }',
    '  ]',
    '}',
    '约束：',
    '1) 至多返回 3 张动作卡片；每张卡片至少 1 个 operation。',
    '2) 坐标以画布像素表示，优先在 0~2400 范围。',
    '3) 不要返回 markdown，不要返回解释性前后缀。',
    `用户输入：${input.userInput}`,
    `当前选中节点：${JSON.stringify(selectedSummary)}`,
    `@场景引用：${JSON.stringify(mentionScenes)}`,
    `@模特引用：${JSON.stringify(mentionModels)}`,
  ].join('\n');
}

export async function generateWorkspaceSuggestion(input: {
  userInput: string;
  selectedNodes: WorkspaceNodeInput[];
  mentionScenes: Array<{ id: string; name: string; description?: string | null }>;
  mentionModels: Array<{ id: string; name: string; appearancePrompt?: string | null }>;
}): Promise<WorkspaceSuggestionResult> {
  const userInput = normalizeText(input.userInput);
  if (!userInput) {
    throw new WorkspaceSuggestionError({
      message: '消息内容不能为空。',
      status: 400,
      code: 'INVALID_PAYLOAD',
    });
  }

  const provider = await resolveDefaultProvider();
  const prompt = buildSuggestionPrompt({
    userInput,
    selectedNodes: input.selectedNodes,
    mentionScenes: input.mentionScenes,
    mentionModels: input.mentionModels,
  });

  const rawText = await generateText(provider, prompt);
  const jsonText = extractJsonBlock(rawText);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new WorkspaceSuggestionError({
      message: 'AI 返回格式无法解析为动作卡片，请重试。',
      status: 422,
      code: 'INVALID_ACTION_CARD',
    });
  }

  if (!isRecord(parsed)) {
    throw new WorkspaceSuggestionError({
      message: 'AI 返回结构异常。',
      status: 422,
      code: 'INVALID_ACTION_CARD',
    });
  }

  const actionCards = normalizeActionCards(parsed.actionCards);
  const assistantMessage =
    typeof parsed.assistantMessage === 'string' && parsed.assistantMessage.trim()
      ? parsed.assistantMessage.trim()
      : '我给你整理了几条可直接应用的画布建议。';

  return {
    assistantMessage,
    actionCards,
    rawText,
  };
}
