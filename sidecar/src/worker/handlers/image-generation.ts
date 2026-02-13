/**
 * 图片生成任务处理器
 * - 调用 AI 生成图片
 * - 落盘到 uploads 目录
 * - 创建 GenerationRun 和 GenerationArtifact 记录
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { getDb } from '../../db';
import {
  providers,
  generationRuns,
  generationArtifacts,
} from '../../db/schema';
import { eq } from 'drizzle-orm';
import { buildImageEffectivePrompt } from '../prompt-engine';
import {
  buildReferencePlanSummary,
  normalizeLocalUploadPath,
  resolveReferenceImages,
} from '../reference-image-planner';
import { optimizeImagePrompt } from '../prompt-optimizer';

const DEBUG_IMAGEGEN = process.env.SIDECAR_DEBUG_IMAGEGEN === '1';
const REFERENCE_IMAGE_MAX_EDGE = 1024;
const REFERENCE_IMAGE_JPEG_QUALITY = 78;

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
  sourceEffectivePrompt?: string;
  promptOptimization?: Record<string, unknown>;
  width?: number;
  height?: number;
  sizeBytes?: number;
  // 兼容旧接口（逐步弃用）
  imageBase64?: string;
}

interface GeminiReferenceImages {
  identity?: string[];
  scene?: string[];
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
  const sourceEffectivePrompt = composed.effectivePrompt || prompt;
  const promptContext = {
    ...composed.promptContext,
    options: input.options ?? null,
    parentArtifactId: parentArtifactId || null,
  };

  // 参考图分组：场景主题（最高优先级）+ 人物身份（次优先级）
  const modelRefImages: string[] = Array.isArray((composed.promptContext as any).modelReferenceImages)
    ? (composed.promptContext as any).modelReferenceImages
    : [];
  const modelReferenceSubjects = Array.isArray((composed.promptContext as any).modelReferenceSubjects)
    ? (composed.promptContext as any).modelReferenceSubjects
    : [];
  const resolvedReferences = await resolveReferenceImages({
    db,
    owner,
    editInstruction,
    modelReferenceImages: modelRefImages,
    modelReferenceSubjects,
    inputReferenceImages: input.referenceImages,
  });
  const allReferenceImages = resolvedReferences.allImages;
  const referencePlan = buildReferencePlanSummary(resolvedReferences);
  const resolvedGenerationOptions = await resolveImageGenerationOptions(
    input.options,
    resolvedReferences.sceneContextImages,
  );

  (promptContext as any).referenceImagesCount = allReferenceImages.length;
  (promptContext as any).referenceImagesByRole = {
    identity: resolvedReferences.modelIdentityImages,
    scene: resolvedReferences.sceneContextImages,
  };
  (promptContext as any).referencePlan = referencePlan;
  if (resolvedReferences.droppedGeneratedImages.length > 0) {
    (promptContext as any).droppedReferenceImages = resolvedReferences.droppedGeneratedImages;
  }
  (promptContext as any).options = resolvedGenerationOptions ?? null;

  // 1. 获取 provider（图片生成 + prompt 优化共用）
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

  // 2. Prompt 优化（失败自动回退 sourceEffectivePrompt）
  const optimized = await optimizeImagePrompt({
    db,
    providerId: providerId || null,
    provider: {
      id: provider.id,
      format: provider.format,
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
      textModel: provider.textModel,
    },
    draftPrompt: prompt,
    effectivePrompt: sourceEffectivePrompt,
    promptContext: composed.promptContext,
    referencePlan,
  });
  const renderPrompt = optimized.renderPrompt || sourceEffectivePrompt;
  (promptContext as any).promptOptimization = {
    ...optimized.meta,
    sourcePrompt: sourceEffectivePrompt,
    renderPrompt,
  };
  const effectivePrompt = renderPrompt;

  // 3. 创建 GenerationRun 记录
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
    // 4. 调用图片生成 API
    if (DEBUG_IMAGEGEN) console.log('[ImageGen] Calling generateImage API...');
    const result = await generateImage(
      provider,
      effectivePrompt,
      {
        identity: resolvedReferences.modelIdentityImages,
        scene: resolvedReferences.sceneContextImages,
      },
      resolvedGenerationOptions || undefined,
    );
    if (DEBUG_IMAGEGEN) {
      console.log(
        '[ImageGen] API returned, mimeType:',
        result.mimeType,
        'base64 length:',
        result.imageBase64?.length,
      );
    }

    // 5. 写入文件
    const { buffer, sizeBytes } = parseBase64Image(result.imageBase64);
    const ext = getExtension(result.mimeType);
    const filename = `${randomUUID()}.${ext}`;
    const uploadDir = getUploadDir();
    const filepath = path.join(uploadDir, filename);

    writeFileSync(filepath, buffer);

    // 6. 创建 GenerationArtifact 记录
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

    // 7. 更新 Run 状态为成功
    await db
      .update(generationRuns)
      .set({
        status: 'succeeded',
        updatedAt: new Date(),
      })
      .where(eq(generationRuns.id, runId));

    // 8. 返回结果
    return {
      artifactId,
      runId,
      filePath: `uploads/${filename}`,
      mimeType: result.mimeType,
      effectivePrompt,
      sourceEffectivePrompt,
      promptOptimization: (promptContext as any).promptOptimization,
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

const GEMINI_ASPECT_RATIOS: Array<{ label: string; value: number }> = [
  { label: '1:1', value: 1 },
  { label: '4:3', value: 4 / 3 },
  { label: '16:9', value: 16 / 9 },
  { label: '3:4', value: 3 / 4 },
  { label: '9:16', value: 9 / 16 },
];

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

function pickClosestGeminiAspectRatio(width: number, height: number): string {
  const ratio = width / height;
  let best = GEMINI_ASPECT_RATIOS[0];
  let bestDistance = Math.abs(ratio - best.value);
  for (const candidate of GEMINI_ASPECT_RATIOS.slice(1)) {
    const distance = Math.abs(ratio - candidate.value);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best.label;
}

async function inferAspectRatioFromSceneReferences(sceneImages: string[]): Promise<string | undefined> {
  for (const image of sceneImages) {
    const localUploadPath = normalizeLocalUploadPath(image);
    if (!localUploadPath) continue;
    const fullPath = path.join(getDataDir(), localUploadPath);
    if (!existsSync(fullPath)) continue;
    try {
      const metadata = await sharp(fullPath, { failOn: 'none' }).metadata();
      if (
        typeof metadata.width === 'number' &&
        metadata.width > 0 &&
        typeof metadata.height === 'number' &&
        metadata.height > 0
      ) {
        return pickClosestGeminiAspectRatio(metadata.width, metadata.height);
      }
    } catch {
      // ignore metadata errors and try next scene reference
    }
  }
  return undefined;
}

async function resolveImageGenerationOptions(
  rawOptions: Record<string, unknown> | undefined,
  sceneImages: string[],
): Promise<ImageGenerationOptions | null> {
  const baseOptions =
    rawOptions && typeof rawOptions === 'object'
      ? (rawOptions as ImageGenerationOptions)
      : null;
  const explicitAspectRatio =
    typeof baseOptions?.aspectRatio === 'string' && baseOptions.aspectRatio.trim()
      ? baseOptions.aspectRatio.trim()
      : null;

  let aspectRatio = explicitAspectRatio;
  if (!aspectRatio) {
    aspectRatio = await inferAspectRatioFromSceneReferences(sceneImages);
  }

  const resolved: ImageGenerationOptions = {
    ...(typeof baseOptions?.width === 'number' ? { width: baseOptions.width } : null),
    ...(typeof baseOptions?.height === 'number' ? { height: baseOptions.height } : null),
    ...(aspectRatio ? { aspectRatio } : null),
  };

  return Object.keys(resolved).length > 0 ? resolved : null;
}

async function optimizeReferenceImageBuffer(
  buffer: Buffer,
  fallbackMimeType: string,
): Promise<{ data: string; mimeType: string }> {
  try {
    const optimized = await sharp(buffer, { failOn: 'none' })
      .rotate()
      .resize(REFERENCE_IMAGE_MAX_EDGE, REFERENCE_IMAGE_MAX_EDGE, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: REFERENCE_IMAGE_JPEG_QUALITY, mozjpeg: true })
      .toBuffer();

    return {
      data: optimized.toString('base64'),
      mimeType: 'image/jpeg',
    };
  } catch (e) {
    if (DEBUG_IMAGEGEN) {
      console.warn('[ImageGen] Failed to optimize reference image, use original buffer:', e);
    }
    return {
      data: buffer.toString('base64'),
      mimeType: fallbackMimeType,
    };
  }
}

async function buildGeminiInlineDataPart(rawImage: string): Promise<any | null> {
  const raw = rawImage.trim();
  if (!raw) return null;

  if (raw.startsWith('data:')) {
    const match = raw.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return null;
    const mimeType = match[1] || 'image/jpeg';
    const buffer = Buffer.from(match[2], 'base64');
    const optimized = await optimizeReferenceImageBuffer(buffer, mimeType);
    return { inlineData: optimized };
  }

  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    try {
      const response = await fetch(raw);
      if (!response.ok) return null;
      const contentType = response.headers.get('content-type') || 'image/jpeg';
      const buffer = Buffer.from(await response.arrayBuffer());
      const optimized = await optimizeReferenceImageBuffer(buffer, contentType);
      return { inlineData: optimized };
    } catch (e) {
      console.warn('Failed to fetch reference image:', raw, e);
      return null;
    }
  }

  const localUploadPath = normalizeLocalUploadPath(raw);
  if (localUploadPath) {
    try {
      const fullPath = path.join(getDataDir(), localUploadPath);
      if (!existsSync(fullPath)) return null;
      const buffer = readFileSync(fullPath);
      const optimized = await optimizeReferenceImageBuffer(
        buffer,
        guessMimeTypeFromPath(localUploadPath),
      );
      return { inlineData: optimized };
    } catch (e) {
      console.warn('Failed to read reference image:', raw, e);
      return null;
    }
  }

  try {
    const buffer = Buffer.from(raw, 'base64');
    const optimized = await optimizeReferenceImageBuffer(buffer, 'image/jpeg');
    return { inlineData: optimized };
  } catch {
    return null;
  }
}

async function buildGeminiReferenceParts(referenceImages?: GeminiReferenceImages): Promise<any[]> {
  const parts: any[] = [];
  const identityImages = referenceImages?.identity || [];
  const sceneImages = referenceImages?.scene || [];

  if (sceneImages.length > 0) {
    parts.push({
      text: '以下是场景主题参考图：必须复现其布景主题、道具关系、色彩与光影氛围，输出应保持消费级影楼成片质感，避免普通生活抓拍感。',
    });
    for (const image of sceneImages) {
      const part = await buildGeminiInlineDataPart(image);
      if (part) parts.push(part);
    }
    parts.push({
      text: '场景参考图里若包含人物，只能提取环境与光影，不得沿用其中人物的脸、发型、服装、动作与人数。',
    });
  }

  if (identityImages.length > 0) {
    parts.push({
      text: '以下是人物身份参考图（硬约束）：只用于锁定人物身份特征（脸型、五官、年龄感、发型、肤色），不得继承参考图里的背景、服装和构图。',
    });
    for (const image of identityImages) {
      const part = await buildGeminiInlineDataPart(image);
      if (part) parts.push(part);
    }
    parts.push({
      text: '最终出图的人物数量、年龄感、亲属关系必须与文字描述一致，不得复用场景参考图中的人物。',
    });
  }

  if (sceneImages.length > 0) {
    parts.push({
      text: '场景主题用于锁定环境与氛围；文字用于补充人物关系、动作与镜头细节，不得改变身份约束。',
    });
  }

  if (identityImages.length > 0) {
    parts.push({
      text: '输出必须保持人物身份与身份参考图一致；服装与造型以文字分镜为准，并与场景主题保持一致。',
    });
  }

  return parts;
}

function buildAspectRatioInstruction(aspectRatio?: string): string | null {
  if (!aspectRatio || typeof aspectRatio !== 'string') return null;
  const raw = aspectRatio.trim();
  return raw ? raw : null;
}

function supportsGeminiImageConfigAspectRatio(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  if (!normalized) return false;
  return normalized.includes('flash-image') || normalized.includes('pro-image-preview');
}

async function generateImage(
  provider: Provider,
  prompt: string,
  referenceImages?: GeminiReferenceImages,
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
    const requestedAspectRatio = buildAspectRatioInstruction(parsedOptions?.aspectRatio);
    const canUseImageConfigAspectRatio = supportsGeminiImageConfigAspectRatio(provider.imageModel);
    const imageConfig =
      requestedAspectRatio && canUseImageConfigAspectRatio
        ? { aspectRatio: requestedAspectRatio }
        : null;

    const res = await fetch(`${provider.baseUrl}/models/${provider.imageModel}:generateContent?key=${provider.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [...requestParts, { text: prompt }] }],
        generationConfig: {
          responseModalities: ['IMAGE', 'TEXT'],
          ...(imageConfig ? { imageConfig } : null),
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
