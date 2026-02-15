import type { ExtensionFactory } from '@mariozechner/pi-coding-agent';
import { Type } from '@sinclair/typebox';
import { and, eq, isNull } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { getDb } from '../../db';
import { generationArtifacts, providers, settings, tasks } from '../../db/schema';
import {
  resolveOpenAIImageRouteFromCapabilities,
  resolveReferenceImageSupportFromCapabilities,
} from '../../services/provider-capabilities';
import type { RuntimeToolDefinition } from './tool-definitions';

export interface RuntimeProviderLike {
  id: string;
  format: string;
  baseUrl: string;
  apiKey: string;
  textModel: string;
  imageModel: string;
}

export interface PhotoCopyExtensionDeps {
  sessionId: string;
  getProvider: () => Promise<RuntimeProviderLike>;
  emitRuntimeEvent: (type: string, payload: unknown) => Promise<void> | void;
}

interface CreateImageTaskInput {
  sessionId: string;
  prompt: string;
  providerId?: string;
  referenceImages?: string[];
  options?: Record<string, unknown>;
  owner?: {
    type: 'asset' | 'projectPlanVersion' | 'planScene';
    id: string;
    slot?: string;
  };
}

const AGENT_IMAGE_PROVIDER_SETTING_KEY = 'agent.image_provider_id';
const AGENT_IMAGE_PROVIDER_WITH_REFS_SETTING_KEY =
  'agent.image_provider_with_refs_id';

function safeJsonParse(value: string | null | undefined): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function hasNonEmptyReferenceImages(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  return value.some((item) => typeof item === 'string' && item.trim().length > 0);
}

async function getSettingString(key: string): Promise<string | null> {
  const db = getDb();
  const [row] = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  if (!row || !row.value) return null;
  const raw = row.value.trim();
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed === 'string' && parsed.trim()) return parsed.trim();
  } catch {
    // ignore
  }

  return raw;
}

function scoreImageProvider(
  provider: {
    id: string;
    format: string;
    capabilities: string | null;
    isDefault: boolean | null;
  },
  input: {
    textProviderId: string;
    requiresReferences: boolean;
  },
): number {
  let score = 0;

  if (provider.id === input.textProviderId) score += 8;
  if (provider.isDefault) score += 4;

  if (provider.format === 'gemini') {
    // gemini 原生通常更稳定支持图像生成与参考图
    score += input.requiresReferences ? 60 : 40;
    return score;
  }

  if (provider.format === 'openai') {
    const route = resolveOpenAIImageRouteFromCapabilities(
      provider.capabilities,
      input.requiresReferences,
    );
    const refSupport = resolveReferenceImageSupportFromCapabilities(
      provider.capabilities,
    );

    if (route === 'images') score += 30;
    if (route === 'chat') score += 25;

    if (input.requiresReferences) {
      if (refSupport === 'supported') score += 25;
      if (refSupport === 'unknown') score += 8;
      if (refSupport === 'unsupported') score -= 8;
    }
    return score;
  }

  score += 1;
  return score;
}

async function resolveImageProviderId(input: {
  explicitProviderId?: string;
  textProviderId: string;
  requiresReferences: boolean;
}): Promise<string | undefined> {
  if (input.explicitProviderId?.trim()) return input.explicitProviderId.trim();

  const withRefsSetting = await getSettingString(
    AGENT_IMAGE_PROVIDER_WITH_REFS_SETTING_KEY,
  );
  if (input.requiresReferences && withRefsSetting) {
    return withRefsSetting;
  }

  const genericSetting = await getSettingString(AGENT_IMAGE_PROVIDER_SETTING_KEY);
  if (genericSetting) {
    return genericSetting;
  }

  const db = getDb();
  const rows = await db
    .select({
      id: providers.id,
      format: providers.format,
      capabilities: providers.capabilities,
      imageModel: providers.imageModel,
      apiKey: providers.apiKey,
      isDefault: providers.isDefault,
    })
    .from(providers);

  const candidates = rows
    .filter((row) => row.imageModel.trim().length > 0)
    .filter((row) => {
      if (row.format === 'local') return true;
      return row.apiKey.trim().length > 0;
    })
    .map((row) => ({
      ...row,
      score: scoreImageProvider(
        {
          id: row.id,
          format: row.format,
          capabilities: row.capabilities || null,
          isDefault: row.isDefault ?? null,
        },
        {
          textProviderId: input.textProviderId,
          requiresReferences: input.requiresReferences,
        },
      ),
    }))
    .sort((a, b) => b.score - a.score);

  if (candidates.length === 0) return input.textProviderId;
  return candidates[0].id;
}

async function generateText(provider: RuntimeProviderLike, prompt: string): Promise<string> {
  if (provider.format === 'gemini') {
    const url = `${provider.baseUrl}/models/${provider.textModel}:generateContent?key=${provider.apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`Gemini 文案生成失败: ${response.status} ${errorText.slice(0, 200)}`);
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== 'string' || !text.trim()) {
      throw new Error('Gemini 未返回有效文案');
    }
    return text.trim();
  }

  const url = `${provider.baseUrl}/chat/completions`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify({
      model: provider.textModel,
      temperature: 0.6,
      messages: [
        {
          role: 'system',
          content: '你是摄影营销文案助手，输出简洁、可发布的中文内容。',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`OpenAI 兼容文案生成失败: ${response.status} ${errorText.slice(0, 200)}`);
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('文案模型未返回有效内容');
  }

  return text.trim();
}

export function createPhotoCopyExtension(deps: PhotoCopyExtensionDeps): ExtensionFactory {
  return (pi) => {
    pi.registerTool({
      name: 'photo_compose_prompt',
      label: 'Compose Photo Prompt',
      description: '按资源与风格约束拼装照片生成提示词。',
      parameters: Type.Object({
        intent: Type.String({ description: '拍摄意图' }),
        sceneContext: Type.Optional(Type.String({ description: '场景上下文' })),
        modelContext: Type.Optional(Type.String({ description: '模特上下文' })),
        style: Type.Optional(Type.String({ description: '风格标签' })),
        aspectRatio: Type.Optional(Type.String({ description: '画幅，如 3:4 / 16:9' })),
      }),
      async execute(_toolCallId, params) {
        const parts = [
          `创作目标：${compactWhitespace(params.intent)}`,
          params.sceneContext ? `场景信息：${compactWhitespace(params.sceneContext)}` : '',
          params.modelContext ? `人物信息：${compactWhitespace(params.modelContext)}` : '',
          params.style ? `风格关键词：${compactWhitespace(params.style)}` : '',
          params.aspectRatio ? `画幅约束：${compactWhitespace(params.aspectRatio)}` : '',
          '输出要求：高质量摄影风格，主体清晰，光线自然，避免畸形结构。',
        ].filter(Boolean);

        const composedPrompt = parts.join('\n');

        return {
          content: [{ type: 'text', text: composedPrompt }],
          details: {
            composedPrompt,
          },
        };
      },
    });

    pi.registerTool({
      name: 'photo_enqueue_generation',
      label: 'Enqueue Photo Generation',
      description: '创建图片生成任务并返回任务 ID。',
      parameters: Type.Object({
        prompt: Type.String({ description: '最终生成提示词' }),
        providerId: Type.Optional(Type.String({ description: '可选 Provider ID' })),
        referenceImages: Type.Optional(Type.Array(Type.String())),
        ownerType: Type.Optional(Type.Union([
          Type.Literal('asset'),
          Type.Literal('projectPlanVersion'),
          Type.Literal('planScene'),
        ])),
        ownerId: Type.Optional(Type.String()),
        ownerSlot: Type.Optional(Type.String()),
      }),
      async execute(_toolCallId, params) {
        const db = getDb();
        const now = new Date();
        const taskId = randomUUID();
        const textProvider = await deps.getProvider();
        const providerId = await resolveImageProviderId({
          explicitProviderId: params.providerId,
          textProviderId: textProvider.id,
          requiresReferences: hasNonEmptyReferenceImages(params.referenceImages),
        });

        const input: CreateImageTaskInput = {
          sessionId: deps.sessionId,
          prompt: params.prompt,
          providerId,
          referenceImages: params.referenceImages,
        };

        if (params.ownerType && params.ownerId) {
          input.owner = {
            type: params.ownerType,
            id: params.ownerId,
            slot: params.ownerSlot,
          };
        }

        await db.insert(tasks).values({
          id: taskId,
          type: 'image-generation',
          status: 'pending',
          input: JSON.stringify(input),
          output: null,
          error: null,
          relatedId: params.ownerId || null,
          relatedMeta: params.ownerSlot || null,
          createdAt: now,
          updatedAt: now,
        });

        await deps.emitRuntimeEvent('photo.task.created', {
          taskId,
          status: 'pending',
          providerId: providerId || null,
          prompt: params.prompt,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ taskId, status: 'pending', providerId: providerId || null }),
            },
          ],
          details: { taskId, status: 'pending', providerId: providerId || null },
        };
      },
    });

    pi.registerTool({
      name: 'photo_get_generation_status',
      label: 'Get Photo Generation Status',
      description: '查询图片生成任务状态，若完成则返回产物信息。',
      parameters: Type.Object({
        taskId: Type.String({ description: '任务 ID' }),
      }),
      async execute(_toolCallId, params) {
        const db = getDb();
        const [task] = await db
          .select()
          .from(tasks)
          .where(eq(tasks.id, params.taskId))
          .limit(1);

        if (!task) {
          throw new Error(`任务不存在: ${params.taskId}`);
        }

        const taskOutput = safeJsonParse(task.output);

        const payload: Record<string, unknown> = {
          taskId: task.id,
          status: task.status,
          error: task.error,
          output: taskOutput,
          updatedAt: task.updatedAt ? task.updatedAt.toISOString() : null,
        };

        if (task.status === 'completed') {
          const artifactId =
            typeof (taskOutput as Record<string, unknown> | null)?.artifactId === 'string'
              ? ((taskOutput as Record<string, unknown>).artifactId as string)
              : null;

          if (artifactId) {
            const [artifact] = await db
              .select()
              .from(generationArtifacts)
              .where(
                and(eq(generationArtifacts.id, artifactId), isNull(generationArtifacts.deletedAt)),
              )
              .limit(1);

            payload.artifact = artifact
              ? {
                  id: artifact.id,
                  filePath: artifact.filePath,
                  mimeType: artifact.mimeType,
                  width: artifact.width,
                  height: artifact.height,
                }
              : null;
          }

          await deps.emitRuntimeEvent('photo.ready', payload);
        } else {
          await deps.emitRuntimeEvent('photo.task.updated', payload);
        }

        return {
          content: [{ type: 'text', text: JSON.stringify(payload) }],
          details: payload,
        };
      },
    });

    pi.registerTool({
      name: 'copy_generate_variants',
      label: 'Generate Copy Variants',
      description: '根据上下文生成多条文案候选（标题/短句/平台版本）。',
      parameters: Type.Object({
        brief: Type.String({ description: '文案目标与背景' }),
        tone: Type.Optional(Type.String({ description: '语气（如 高级、轻松、温暖）' })),
        channels: Type.Optional(Type.Array(Type.String({ description: '渠道名称，如 小红书/朋友圈/电商详情' }))),
      }),
      async execute(_toolCallId, params) {
        const provider = await deps.getProvider();
        const channelText = Array.isArray(params.channels) && params.channels.length > 0
          ? params.channels.join('、')
          : '通用';
        const tone = params.tone?.trim() || '自然、专业';

        const prompt = [
          '请输出中文营销文案，返回结构化文本。',
          `目标简介：${params.brief}`,
          `语气：${tone}`,
          `渠道：${channelText}`,
          '请按以下格式输出：',
          '标题：...',
          '短句：...',
          '渠道版本：',
          '- 渠道A：...',
          '- 渠道B：...',
        ].join('\n');

        const text = await generateText(provider, prompt);
        const payload = {
          brief: params.brief,
          tone,
          channels: params.channels || [],
          content: text,
        };

        await deps.emitRuntimeEvent('copy.ready', payload);

        return {
          content: [{ type: 'text', text }],
          details: payload,
        };
      },
    });

    pi.registerTool({
      name: 'copy_rewrite_by_tone',
      label: 'Rewrite Copy By Tone',
      description: '按目标语气改写现有文案。',
      parameters: Type.Object({
        source: Type.String({ description: '原始文案' }),
        tone: Type.String({ description: '目标语气，如 高级、轻松、极简' }),
      }),
      async execute(_toolCallId, params) {
        const provider = await deps.getProvider();
        const prompt = [
          '请将以下中文文案改写为指定语气，保留核心信息，避免冗长。',
          `目标语气：${params.tone}`,
          '原文：',
          params.source,
        ].join('\n');

        const rewritten = await generateText(provider, prompt);
        const payload = {
          source: params.source,
          tone: params.tone,
          rewritten,
        };

        await deps.emitRuntimeEvent('copy.ready', payload);

        return {
          content: [{ type: 'text', text: rewritten }],
          details: payload,
        };
      },
    });
  };
}

export async function createPhotoCopyToolDefinitions(
  deps: PhotoCopyExtensionDeps,
): Promise<RuntimeToolDefinition[]> {
  const definitions: RuntimeToolDefinition[] = [];

  const extension = createPhotoCopyExtension(deps);
  await extension({
    registerTool(tool: RuntimeToolDefinition) {
      definitions.push(tool);
    },
  } as any);

  return definitions;
}
