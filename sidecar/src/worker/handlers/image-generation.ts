/**
 * 图片生成任务处理器
 * - 调用 AI 生成图片
 * - 落盘到 uploads 目录
 * - 创建 GenerationRun 和 GenerationArtifact 记录
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getDb } from '../../db';
import {
  providers,
  generationRuns,
  generationArtifacts,
} from '../../db/schema';
import { eq } from 'drizzle-orm';

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
  input: ImageGenerationInput
): Promise<ImageGenerationOutput> {
  const { prompt, providerId, owner, parentArtifactId, editInstruction, taskId } = input;

  if (!prompt) {
    throw new Error('prompt is required');
  }

  const db = getDb();
  const now = new Date();

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
    effectivePrompt: prompt,
    promptContext: JSON.stringify({ options: input.options }),
    parentRunId: null,
    taskId: taskId || null,
    createdAt: now,
    updatedAt: now,
  });

  try {
    // 3. 调用图片生成 API
    const result = await generateImage(provider, prompt);

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
      effectivePrompt: prompt,
      promptContext: JSON.stringify({ options: input.options }),
      referenceImages: input.referenceImages
        ? JSON.stringify(input.referenceImages)
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
      effectivePrompt: prompt,
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

async function generateImage(
  provider: Provider,
  prompt: string
): Promise<GenerateImageResult> {
  if (provider.format === 'gemini') {
    const url = `${provider.baseUrl}/models/${provider.imageModel}:generateContent?key=${provider.apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
      }),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(
        (errorData as { error?: { message?: string } }).error?.message ||
          `HTTP ${res.status}`
      );
    }

    const data = await res.json();
    const parts =
      (data as { candidates?: { content?: { parts?: Array<{ inlineData?: { data: string; mimeType?: string } }> } }[] })
        .candidates?.[0]?.content?.parts || [];

    for (const part of parts) {
      if (part.inlineData) {
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

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
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
