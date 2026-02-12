/**
 * 图片生成任务处理器
 * - 调用 AI 生成图片
 * - 落盘到 uploads 目录
 * - 创建 GenerationRun 和 GenerationArtifact 记录
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getDb } from '../../db';
import {
  providers,
  generationRuns,
  generationArtifacts,
} from '../../db/schema';
import { eq } from 'drizzle-orm';
import { buildImageEffectivePrompt } from '../prompt-engine';

const DEBUG_IMAGEGEN = process.env.SIDECAR_DEBUG_IMAGEGEN === '1';

export interface ImageGenerationInput {
  prompt: string;
  providerId?: string;
  referenceImages?: string[];
  options?: Record<string, unknown>;
  // owner 信息（用于归属 artifact）
  owner?: {
    type: 'asset' | 'projectPlanVersion' | 'planScene';
    id: string;
    slot?: string;
  };
  parentArtifactId?: string;
  editInstruction?: string;
  // 可选：关联的 task ID
  taskId?: string;
}

export interface ImageGenerationOutput {
  artifactId: string;
  runId: string;
  filePath: string;
  mimeType: string;
  effectivePrompt: string;
  width?: number;
  height?: number;
  sizeBytes?: number;
  // 兼容旧接口（逐步弃用）
  imageBase64?: string;
}

// 获取上传目录
function getUploadDir(): string {
  const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
  const uploadDir = path.join(dataDir, 'uploads');
  if (!existsSync(uploadDir)) {
    mkdirSync(uploadDir, { recursive: true });
  }
  return uploadDir;
}

// 从 base64 解析图片信息
function parseBase64Image(base64: string): { buffer: Buffer; sizeBytes: number } {
  const buffer = Buffer.from(base64, 'base64');
  return { buffer, sizeBytes: buffer.length };
}

// 获取文件扩展名
function getExtension(mimeType: string): string {
  const map: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
  };
  return map[mimeType] || 'png';
}

export async function imageGenerationHandler(
  input: ImageGenerationInput,
  context?: { taskId?: string },
): Promise<ImageGenerationOutput> {
  const { prompt, providerId, owner, parentArtifactId, editInstruction } = input;
  const taskId = input.taskId || context?.taskId;

  if (DEBUG_IMAGEGEN) {
    console.log(
      '[ImageGen] Handler called with prompt:',
      prompt?.slice(0, 50) + '...',
    );
  }

  if (!prompt) {
    throw new Error('prompt is required');
  }

  const db = getDb();
  const now = new Date();

  // 0. 统一 Prompt 编排（服务端生成 effectivePrompt + promptContext）
  const composed = await buildImageEffectivePrompt(db, {
    prompt,
    owner,
    editInstruction,
  });
  const effectivePrompt = composed.effectivePrompt || prompt;
  const promptContext = {
    ...composed.promptContext,
    options: input.options ?? null,
    parentArtifactId: parentArtifactId || null,
  };

  // 合并模特参考图到 referenceImages
  const modelRefImages: string[] = Array.isArray((composed.promptContext as any).modelReferenceImages)
    ? (composed.promptContext as any).modelReferenceImages
    : [];
  const allReferenceImages = [
    ...modelRefImages,                // 模特参考图（最高优先级）
    ...(input.referenceImages ?? []), // 原有参考图
  ].slice(0, 8); // 总数上限 8 张

  (promptContext as any).referenceImagesCount = allReferenceImages.length;

  // 1. 获取 provider
  let provider;
  if (providerId) {
    [provider] = await db
      .select()
      .from(providers)
      .where(eq(providers.id, providerId))
      .limit(1);
  } else {
    [provider] = await db
      .select()
      .from(providers)
      .where(eq(providers.isDefault, true))
      .limit(1);
  }

  if (DEBUG_IMAGEGEN) {
    console.log(
      '[ImageGen] Provider:',
      provider ? `${provider.id} (${provider.format})` : 'NOT FOUND',
    );
  }

  if (!provider) {
    throw new Error('No provider configured');
  }

  // 2. 创建 GenerationRun 记录
  const runId = `gr_${randomUUID()}`;
  const kind = editInstruction ? 'image-edit' : 'image-generation';

  await db.insert(generationRuns).values({
    id: runId,
    kind,
    trigger: 'worker',
    status: 'running',
    relatedType: owner?.type,
    relatedId: owner?.id,
    effectivePrompt,
    promptContext: JSON.stringify(promptContext),
    parentRunId: null,
    taskId: taskId || null,
    createdAt: now,
    updatedAt: now,
  });

  try {
    // 3. 调用图片生成 API
    if (DEBUG_IMAGEGEN) console.log('[ImageGen] Calling generateImage API...');
    const result = await generateImage(
      provider,
      effectivePrompt,
      allReferenceImages,
      input.options,
    );
    if (DEBUG_IMAGEGEN) {
      console.log(
        '[ImageGen] API returned, mimeType:',
        result.mimeType,
        'base64 length:',
        result.imageBase64?.length,
      );
    }

    // 4. 写入文件
    const { buffer, sizeBytes } = parseBase64Image(result.imageBase64);
    const ext = getExtension(result.mimeType);
    const filename = `${randomUUID()}.${ext}`;
    const uploadDir = getUploadDir();
    const filepath = path.join(uploadDir, filename);

    writeFileSync(filepath, buffer);

    // 5. 创建 GenerationArtifact 记录
    const artifactId = `ga_${randomUUID()}`;

    await db.insert(generationArtifacts).values({
      id: artifactId,
      runId,
      type: 'image',
      mimeType: result.mimeType,
      filePath: `uploads/${filename}`,
      width: result.width,
      height: result.height,
      sizeBytes,
      ownerType: owner?.type || null,
      ownerId: owner?.id || null,
      ownerSlot: owner?.slot || null,
      effectivePrompt,
      promptContext: JSON.stringify(promptContext),
      referenceImages: allReferenceImages.length > 0
        ? JSON.stringify(allReferenceImages)
        : null,
      editInstruction: editInstruction || null,
      parentArtifactId: parentArtifactId || null,
      createdAt: now,
      deletedAt: null,
    });

    // 6. 更新 Run 状态为成功
    await db
      .update(generationRuns)
      .set({
        status: 'succeeded',
        updatedAt: new Date(),
      })
      .where(eq(generationRuns.id, runId));

    // 7. 返回结果
    return {
      artifactId,
      runId,
      filePath: `uploads/${filename}`,
      mimeType: result.mimeType,
      effectivePrompt,
      width: result.width,
      height: result.height,
      sizeBytes,
      // 兼容旧接口
      imageBase64: result.imageBase64,
    };
  } catch (error: unknown) {
    // 更新 Run 状态为失败
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await db
      .update(generationRuns)
      .set({
        status: 'failed',
        error: JSON.stringify({ message: errorMessage }),
        updatedAt: new Date(),
      })
      .where(eq(generationRuns.id, runId));

    throw error;
  }
}

interface Provider {
  format: string;
  baseUrl: string;
  apiKey: string;
  imageModel: string;
}

interface GenerateImageResult {
  imageBase64: string;
  mimeType: string;
  width?: number;
  height?: number;
}

interface ImageGenerationOptions {
  width?: number;
  height?: number;
  aspectRatio?: string;
}

function getDataDir(): string {
  return process.env.DATA_DIR || path.join(process.cwd(), 'data');
}

function guessMimeTypeFromPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'image/jpeg';
}

function normalizeLocalUploadPath(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  if (raw.startsWith('/uploads/')) return raw.slice(1);
  if (raw.startsWith('uploads/')) return raw;
  return null;
}

async function buildGeminiReferenceParts(referenceImages?: string[]): Promise<any[]> {
  const parts: any[] = [];
  if (!referenceImages || referenceImages.length === 0) return parts;

  for (const img of referenceImages) {
    if (typeof img !== 'string' || !img.trim()) continue;
    const raw = img.trim();

    if (raw.startsWith('data:')) {
      const match = raw.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        parts.push({
          inlineData: {
            mimeType: match[1],
            data: match[2],
          },
        });
      }
      continue;
    }

    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      try {
        const response = await fetch(raw);
        if (!response.ok) continue;
        const buffer = await response.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        const contentType = response.headers.get('content-type') || 'image/jpeg';
        parts.push({ inlineData: { mimeType: contentType, data: base64 } });
      } catch (e) {
        console.warn('Failed to fetch reference image:', raw, e);
      }
      continue;
    }

    const localUploadPath = normalizeLocalUploadPath(raw);
    if (localUploadPath) {
      try {
        const fullPath = path.join(getDataDir(), localUploadPath);
        if (!existsSync(fullPath)) continue;
        const buffer = readFileSync(fullPath);
        parts.push({
          inlineData: {
            mimeType: guessMimeTypeFromPath(localUploadPath),
            data: buffer.toString('base64'),
          },
        });
      } catch (e) {
        console.warn('Failed to read reference image:', raw, e);
      }
      continue;
    }

    // 兜底：假设是纯 base64（jpeg）
    parts.push({
      inlineData: {
        mimeType: 'image/jpeg',
        data: raw,
      },
    });
  }

  return parts;
}

async function generateImage(
  provider: Provider,
  prompt: string,
  referenceImages?: string[],
  options?: Record<string, unknown>
): Promise<GenerateImageResult> {
  if (DEBUG_IMAGEGEN) {
    console.log(
      '[ImageGen] generateImage called, format:',
      provider.format,
      'model:',
      provider.imageModel,
    );
  }

  if (provider.format === 'gemini') {
    if (DEBUG_IMAGEGEN) {
      console.log('[ImageGen] Gemini request:', {
        baseUrl: provider.baseUrl,
        model: provider.imageModel,
      });
    }
    const parsedOptions = (options && typeof options === 'object' ? options : null) as ImageGenerationOptions | null;
    const requestParts = await buildGeminiReferenceParts(referenceImages);

    const res = await fetch(`${provider.baseUrl}/models/${provider.imageModel}:generateContent?key=${provider.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [...requestParts, { text: prompt }] }],
        generationConfig: {
          responseModalities: ['IMAGE', 'TEXT'],
          ...(parsedOptions?.aspectRatio ? { aspectRatio: parsedOptions.aspectRatio } : null),
        },
      }),
    });

    if (DEBUG_IMAGEGEN) console.log('[ImageGen] Gemini response status:', res.status);

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      if (DEBUG_IMAGEGEN) console.log('[ImageGen] Gemini error:', JSON.stringify(errorData));
      throw new Error(
        (errorData as { error?: { message?: string } }).error?.message ||
          `HTTP ${res.status}`
      );
    }

    const data = await res.json();
    if (DEBUG_IMAGEGEN) console.log('[ImageGen] Gemini response keys:', Object.keys(data));
    const responseParts =
      (data as { candidates?: { content?: { parts?: Array<{ inlineData?: { data: string; mimeType?: string } }> } }[] })
        .candidates?.[0]?.content?.parts || [];

    if (DEBUG_IMAGEGEN) console.log('[ImageGen] Parts count:', responseParts.length);

    for (const part of responseParts) {
      if (part.inlineData) {
        if (DEBUG_IMAGEGEN) console.log('[ImageGen] Found inlineData, mimeType:', part.inlineData.mimeType);
        return {
          imageBase64: part.inlineData.data,
          mimeType: part.inlineData.mimeType || 'image/png',
        };
      }
    }

    throw new Error('No image in response');
  } else {
    // OpenAI 兼容格式
    const url = `${provider.baseUrl}/images/generations`;
    if (DEBUG_IMAGEGEN) console.log('[ImageGen] OpenAI URL:', url);
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify({
        model: provider.imageModel,
        prompt,
        response_format: 'b64_json',
      }),
    });

    if (DEBUG_IMAGEGEN) console.log('[ImageGen] OpenAI response status:', res.status);

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      if (DEBUG_IMAGEGEN) console.log('[ImageGen] OpenAI error:', JSON.stringify(errorData));
      throw new Error(
        (errorData as { error?: { message?: string } }).error?.message ||
          `HTTP ${res.status}`
      );
    }

    const data = (await res.json()) as { data?: Array<{ b64_json?: string }> };
    return {
      imageBase64: data.data?.[0]?.b64_json || '',
      mimeType: 'image/png',
    };
  }
}
