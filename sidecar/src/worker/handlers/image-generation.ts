/**
 * 图片生成任务处理器
 * - 调用 AI 生成图片
 * - 落盘到 uploads 目录
 * - 创建 GenerationRun 和 GenerationArtifact 记录
 */

import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { getDb } from '../../db';
import {
  generationArtifacts,
  generationRuns,
  providers,
} from '../../db/schema';
import { buildImageEffectivePrompt } from '../prompt-engine';
import { optimizeImagePrompt } from '../prompt-optimizer';
import {
  buildReferencePlanSummary,
  normalizeLocalUploadPath,
  resolveReferenceImages,
} from '../reference-image-planner';
import {
  resolveOpenAIImageRouteFromCapabilities,
  resolveReferenceImageSupportFromCapabilities,
} from '../../services/provider-capabilities';

const DEBUG_IMAGEGEN = process.env.SIDECAR_DEBUG_IMAGEGEN === '1';
const REFERENCE_IMAGE_MAX_EDGE = 1024;
const REFERENCE_IMAGE_JPEG_QUALITY = 78;
const ASPECT_RATIO_TOLERANCE = 0.08;

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
  identityBindings?: Array<{ index: number; role?: string }>;
  identityCollageUsed?: boolean;
}

interface GenerationRunDiagnostics {
  effective_route: string | null;
  reference_count_sent: number;
  reference_support_status?: 'supported' | 'unsupported' | 'unknown';
  aspect_requested: string | null;
  aspect_actual: string | null;
  aspect_param_degraded: boolean;
  validation_fail_reasons: string[];
}

interface ValidationCheckResult {
  status: 'pass' | 'fail' | 'skip';
  reason: string;
}

interface GenerationValidation {
  overall: 'pass' | 'fail';
  checks: {
    non_empty_file: ValidationCheckResult;
    decodable_image: ValidationCheckResult;
    single_frame: ValidationCheckResult;
    width_height: ValidationCheckResult;
    aspect_ratio: ValidationCheckResult;
  };
  expected_aspect_ratio: number | null;
  actual_aspect_ratio: number | null;
  tolerance: number;
  fail_reasons: string[];
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
function parseBase64Image(base64: string): {
  buffer: Buffer;
  sizeBytes: number;
} {
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

function resolveExpectedAspectRatio(options?: ImageGenerationOptions): number | null {
  if (!options) return null;
  if (
    typeof options.width === 'number' &&
    Number.isFinite(options.width) &&
    options.width > 0 &&
    typeof options.height === 'number' &&
    Number.isFinite(options.height) &&
    options.height > 0
  ) {
    return options.width / options.height;
  }

  const aspect = normalizeAspectRatioLabel(options.aspectRatio);
  if (!aspect) return null;
  switch (aspect) {
    case 'photo':
    case 'portrait':
    case '3:4':
    case '3/4':
      return 3 / 4;
    case '9:16':
    case '9/16':
      return 9 / 16;
    case 'landscape':
    case '4:3':
    case '4/3':
      return 4 / 3;
    case '16:9':
    case '16/9':
      return 16 / 9;
    case 'square':
    case '1:1':
    case '1/1':
      return 1;
    default:
      return null;
  }
}

function resolveRequestedAspectLabel(options?: ImageGenerationOptions): string | null {
  if (!options) return null;
  if (
    typeof options.width === 'number' &&
    Number.isFinite(options.width) &&
    options.width > 0 &&
    typeof options.height === 'number' &&
    Number.isFinite(options.height) &&
    options.height > 0
  ) {
    return `${Math.round(options.width)}x${Math.round(options.height)}`;
  }
  return buildAspectRatioInstruction(options.aspectRatio);
}

function buildImageValidation(params: {
  mimeType: string;
  sizeBytes: number;
  width?: number;
  height?: number;
  metadata: sharp.Metadata | null;
  options?: ImageGenerationOptions;
}): GenerationValidation {
  const checks: GenerationValidation['checks'] = {
    non_empty_file: { status: 'pass', reason: '文件字节数大于 0。' },
    decodable_image: { status: 'pass', reason: '图片可解码。' },
    single_frame: { status: 'pass', reason: '产物为单帧静态图。' },
    width_height: { status: 'pass', reason: '宽高信息有效。' },
    aspect_ratio: { status: 'skip', reason: '未请求明确画幅，跳过比例校验。' },
  };

  if (!(params.sizeBytes > 0)) {
    checks.non_empty_file = { status: 'fail', reason: '文件字节数为 0。' };
  }

  const decodedWidth = params.metadata?.width;
  const decodedHeight = params.metadata?.height;
  const decodable =
    typeof decodedWidth === 'number' &&
    decodedWidth > 0 &&
    typeof decodedHeight === 'number' &&
    decodedHeight > 0;
  if (!decodable) {
    checks.decodable_image = {
      status: 'fail',
      reason: '图片无法解码或缺少宽高元数据。',
    };
  }

  const pages =
    typeof params.metadata?.pages === 'number' ? params.metadata.pages : 1;
  const isAnimatedMime = params.mimeType === 'image/gif';
  if (isAnimatedMime || pages > 1) {
    checks.single_frame = {
      status: 'fail',
      reason: `检测到多帧产物（mime=${params.mimeType}, pages=${pages}）。`,
    };
  }

  const widthValid =
    typeof params.width === 'number' &&
    params.width > 0 &&
    typeof params.height === 'number' &&
    params.height > 0;
  if (!widthValid) {
    checks.width_height = { status: 'fail', reason: '宽高为空或非正数。' };
  }

  const expectedAspect = resolveExpectedAspectRatio(params.options);
  const actualAspect =
    widthValid && typeof params.width === 'number' && typeof params.height === 'number'
      ? params.width / params.height
      : null;

  if (expectedAspect !== null) {
    if (actualAspect === null) {
      checks.aspect_ratio = {
        status: 'fail',
        reason: '已请求画幅但无法读取实际宽高。',
      };
    } else {
      const diff = Math.abs(actualAspect - expectedAspect);
      if (diff > ASPECT_RATIO_TOLERANCE) {
        checks.aspect_ratio = {
          status: 'fail',
          reason: `实际比例偏差过大（expected=${expectedAspect.toFixed(4)}, actual=${actualAspect.toFixed(4)}, diff=${diff.toFixed(4)}）。`,
        };
      } else {
        checks.aspect_ratio = {
          status: 'pass',
          reason: `画幅比例符合要求（expected=${expectedAspect.toFixed(4)}, actual=${actualAspect.toFixed(4)}）。`,
        };
      }
    }
  }

  const failReasons = Object.values(checks)
    .filter((item) => item.status === 'fail')
    .map((item) => item.reason);

  return {
    overall: failReasons.length > 0 ? 'fail' : 'pass',
    checks,
    expected_aspect_ratio: expectedAspect,
    actual_aspect_ratio: actualAspect,
    tolerance: ASPECT_RATIO_TOLERANCE,
    fail_reasons: failReasons,
  };
}

export async function imageGenerationHandler(
  input: ImageGenerationInput,
  context?: { taskId?: string },
): Promise<ImageGenerationOutput> {
  const { prompt, providerId, owner, parentArtifactId, editInstruction } =
    input;
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
  const modelRefImages: string[] = Array.isArray(
    (composed.promptContext as any).modelReferenceImages,
  )
    ? (composed.promptContext as any).modelReferenceImages
    : [];
  const modelReferenceSubjects = Array.isArray(
    (composed.promptContext as any).modelReferenceSubjects,
  )
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
    (promptContext as any).droppedReferenceImages =
      resolvedReferences.droppedGeneratedImages;
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
      capabilities: provider.capabilities,
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
  const diagnostics: GenerationRunDiagnostics = {
    effective_route: null,
    reference_count_sent: 0,
    aspect_requested: resolveRequestedAspectLabel(
      resolvedGenerationOptions || undefined,
    ),
    aspect_actual: null,
    aspect_param_degraded: false,
    validation_fail_reasons: [],
  };
  let validation: GenerationValidation | null = null;

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
    diagnostics: JSON.stringify(diagnostics),
    validation: null,
    parentRunId: null,
    taskId: taskId || null,
    createdAt: now,
    updatedAt: now,
  });

  try {
    if (provider.format === 'openai') {
      const hasReferences = allReferenceImages.length > 0;
      diagnostics.effective_route = resolveOpenAIImageRouteFromCapabilities(
        provider.capabilities,
        hasReferences,
      );
      diagnostics.reference_support_status =
        resolveReferenceImageSupportFromCapabilities(provider.capabilities);
      if (
        hasReferences &&
        diagnostics.reference_support_status !== 'supported'
      ) {
        diagnostics.validation_fail_reasons = [
          `当前 provider 不支持“带参考图”生图（status=${diagnostics.reference_support_status}）。`,
        ];
        throw new Error(
          `IMAGE_REFERENCE_UNSUPPORTED: current provider does not support image generation with references (status=${diagnostics.reference_support_status})`,
        );
      }
    } else {
      diagnostics.effective_route = `${provider.format}-native`;
      diagnostics.reference_count_sent = allReferenceImages.length;
    }

    // 4. 调用图片生成 API
    if (DEBUG_IMAGEGEN) console.log('[ImageGen] Calling generateImage API...');
    const result = await generateImage(
      provider,
      effectivePrompt,
      {
        identity: resolvedReferences.modelIdentityImages,
        scene: resolvedReferences.sceneContextImages,
        identityBindings: resolvedReferences.identityBindings.map(
          (binding) => ({
            index: binding.index,
            role: binding.role,
          }),
        ),
        identityCollageUsed: Boolean(resolvedReferences.identityCollageImage),
      },
      resolvedGenerationOptions || undefined,
    );
    if (result.runtimeDiagnostics?.effectiveRoute) {
      diagnostics.effective_route = result.runtimeDiagnostics.effectiveRoute;
    }
    if (typeof result.runtimeDiagnostics?.referenceCountSent === 'number') {
      diagnostics.reference_count_sent = result.runtimeDiagnostics.referenceCountSent;
    }
    if (result.aspectRatioRuntime) {
      (promptContext as any).aspectRatioRuntime = result.aspectRatioRuntime;
      diagnostics.aspect_requested = result.aspectRatioRuntime.requested;
      if (
        result.aspectRatioRuntime.retriedWithoutImageConfig ||
        result.aspectRatioRuntime.retriedWithoutSize
      ) {
        diagnostics.aspect_param_degraded = true;
      }
    }
    if (DEBUG_IMAGEGEN) {
      console.log(
        '[ImageGen] API returned, mimeType:',
        result.mimeType,
        'base64 length:',
        result.imageBase64?.length,
      );
    }

    // 5. 写入文件
    const imageBase64 = result.imageBase64?.trim();
    if (!imageBase64) {
      throw new Error('Image generation returned empty base64 payload');
    }
    const { buffer, sizeBytes } = parseBase64Image(imageBase64);
    if (sizeBytes <= 0) {
      throw new Error('Image generation returned empty image buffer');
    }
    let outputWidth = result.width;
    let outputHeight = result.height;
    let decodedMetadata: sharp.Metadata | null = null;
    try {
      decodedMetadata = await sharp(buffer, { failOn: 'none' }).metadata();
      if (!outputWidth && typeof decodedMetadata.width === 'number')
        outputWidth = decodedMetadata.width;
      if (!outputHeight && typeof decodedMetadata.height === 'number')
        outputHeight = decodedMetadata.height;
    } catch {
      // ignore metadata errors and keep nullable width/height
    }

    diagnostics.aspect_actual =
      typeof outputWidth === 'number' &&
      outputWidth > 0 &&
      typeof outputHeight === 'number' &&
      outputHeight > 0
        ? `${outputWidth}:${outputHeight}`
        : null;

    validation = buildImageValidation({
      mimeType: result.mimeType,
      sizeBytes,
      width: outputWidth,
      height: outputHeight,
      metadata: decodedMetadata,
      options: resolvedGenerationOptions || undefined,
    });
    diagnostics.validation_fail_reasons = validation.fail_reasons;
    if (validation.overall === 'fail') {
      throw new Error(
        `IMAGE_VALIDATION_FAILED: ${validation.fail_reasons.join(' | ')}`,
      );
    }

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
      width: outputWidth,
      height: outputHeight,
      sizeBytes,
      ownerType: owner?.type || null,
      ownerId: owner?.id || null,
      ownerSlot: owner?.slot || null,
      effectivePrompt,
      promptContext: JSON.stringify(promptContext),
      referenceImages:
        allReferenceImages.length > 0
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
        diagnostics: JSON.stringify(diagnostics),
        validation: JSON.stringify(validation),
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
      width: outputWidth,
      height: outputHeight,
      sizeBytes,
      // 兼容旧接口
      imageBase64,
    };
  } catch (error: unknown) {
    // 更新 Run 状态为失败
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    if (diagnostics.validation_fail_reasons.length === 0 && errorMessage) {
      diagnostics.validation_fail_reasons = [errorMessage];
    }
    await db
      .update(generationRuns)
      .set({
        status: 'failed',
        diagnostics: JSON.stringify(diagnostics),
        validation: validation ? JSON.stringify(validation) : null,
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
  capabilities?: string | null;
}

interface GenerateImageResult {
  imageBase64: string;
  mimeType: string;
  width?: number;
  height?: number;
  aspectRatioRuntime?: {
    requested: string | null;
    attemptedWithImageConfig?: boolean;
    retriedWithoutImageConfig?: boolean;
    appliedWithImageConfig?: boolean;
    attemptedWithSize?: boolean;
    retriedWithoutSize?: boolean;
    appliedWithSize?: boolean;
  };
  runtimeDiagnostics?: {
    effectiveRoute: string;
    referenceCountSent: number;
  };
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

async function inferAspectRatioFromSceneReferences(
  sceneImages: string[],
): Promise<string | null> {
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
  return null;
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
    typeof baseOptions?.aspectRatio === 'string' &&
    baseOptions.aspectRatio.trim()
      ? baseOptions.aspectRatio.trim()
      : null;

  let aspectRatio = explicitAspectRatio;
  if (!aspectRatio) {
    aspectRatio = await inferAspectRatioFromSceneReferences(sceneImages);
  }

  const resolved: ImageGenerationOptions = {
    ...(typeof baseOptions?.width === 'number'
      ? { width: baseOptions.width }
      : null),
    ...(typeof baseOptions?.height === 'number'
      ? { height: baseOptions.height }
      : null),
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
      console.warn(
        '[ImageGen] Failed to optimize reference image, use original buffer:',
        e,
      );
    }
    return {
      data: buffer.toString('base64'),
      mimeType: fallbackMimeType,
    };
  }
}

async function buildGeminiInlineDataPart(
  rawImage: string,
): Promise<any | null> {
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

async function buildGeminiReferenceParts(
  referenceImages?: GeminiReferenceImages,
): Promise<any[]> {
  const parts: any[] = [];
  const identityImages = referenceImages?.identity || [];
  const sceneImages = referenceImages?.scene || [];
  const identityBindings = Array.isArray(referenceImages?.identityBindings)
    ? referenceImages.identityBindings
        .filter((item) => item && typeof item.index === 'number')
        .sort((a, b) => a.index - b.index)
    : [];

  parts.push({
    text: '最终输出必须是单张单帧的完整摄影画面。禁止拼图、分屏、左右对比、多宫格、连环画排版、文字水印与边框版式。',
  });
  parts.push({
    text: '相机与画面保持水平，禁止整幅画面旋转、斜切白边、歪框透视。',
  });

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
    if (identityBindings.length > 0) {
      const mappingText = identityBindings
        .map((item) => {
          const role = item.role?.trim() || `角色${item.index}`;
          return `#${item.index}=${role}`;
        })
        .join('，');
      parts.push({
        text: `人物编号映射（硬约束，不可交换）：${mappingText}。`,
      });
    }
    if (referenceImages?.identityCollageUsed) {
      parts.push({
        text: '人物身份参考图为单张拼接图，红框编号与上述映射一一对应。',
      });
    }
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

function normalizeAspectRatioLabel(aspectRatio?: string): string | null {
  if (!aspectRatio || typeof aspectRatio !== 'string') return null;
  const normalized = aspectRatio.trim().toLowerCase();
  return normalized || null;
}

function resolveOpenAIRequestedSize(options?: ImageGenerationOptions): string | null {
  if (!options) return null;
  if (
    typeof options.width === 'number' &&
    Number.isFinite(options.width) &&
    options.width > 0 &&
    typeof options.height === 'number' &&
    Number.isFinite(options.height) &&
    options.height > 0
  ) {
    return `${Math.round(options.width)}x${Math.round(options.height)}`;
  }

  const aspect = normalizeAspectRatioLabel(options.aspectRatio);
  if (!aspect) return null;

  switch (aspect) {
    case 'photo':
    case 'portrait':
    case '3:4':
    case '3/4':
    case '9:16':
    case '9/16':
      return '1024x1792';
    case 'landscape':
    case '4:3':
    case '4/3':
    case '16:9':
    case '16/9':
      return '1792x1024';
    case 'square':
    case '1:1':
    case '1/1':
      return '1024x1024';
    default:
      return null;
  }
}

function isUnsupportedOpenAIImageSizeError(message: string): boolean {
  const lower = message.toLowerCase();
  if (!lower.includes('size')) return false;
  return (
    lower.includes('invalid') ||
    lower.includes('unsupported') ||
    lower.includes('not supported') ||
    lower.includes('unknown') ||
    lower.includes('unrecognized')
  );
}

function supportsGeminiImageConfigAspectRatio(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  if (!normalized) return false;
  return normalized.includes('image');
}

function isUnsupportedAspectRatioError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    (lower.includes('unknown name "aspectratio"') &&
      lower.includes('generation_config')) ||
    (lower.includes('cannot find field') && lower.includes('aspectratio')) ||
    (lower.includes('unknown name "imageconfig"') &&
      lower.includes('generation_config'))
  );
}

function flattenReferenceImageList(referenceImages?: GeminiReferenceImages): string[] {
  if (!referenceImages) return [];
  const merged = [...(referenceImages.scene || []), ...(referenceImages.identity || [])];
  return merged.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function buildOpenAIChatAspectRatioInstruction(
  options?: ImageGenerationOptions,
): string | null {
  if (!options) return null;
  if (
    typeof options.width === 'number' &&
    Number.isFinite(options.width) &&
    options.width > 0 &&
    typeof options.height === 'number' &&
    Number.isFinite(options.height) &&
    options.height > 0
  ) {
    return `画幅硬约束：${Math.round(options.width)}x${Math.round(options.height)} 像素，保持对应比例构图。`;
  }

  const aspect = normalizeAspectRatioLabel(options.aspectRatio);
  if (!aspect) return null;
  switch (aspect) {
    case 'photo':
    case 'portrait':
    case '3:4':
    case '3/4':
    case '9:16':
    case '9/16':
      return '画幅硬约束：竖版构图，优先 3:4 比例。';
    case 'landscape':
    case '4:3':
    case '4/3':
    case '16:9':
    case '16/9':
      return '画幅硬约束：横版构图，优先 4:3 或 16:9 比例。';
    case 'square':
    case '1:1':
    case '1/1':
      return '画幅硬约束：方形构图（1:1）。';
    default:
      return null;
  }
}

function buildOpenAIReferenceInstruction(
  prompt: string,
  referenceImages?: GeminiReferenceImages,
  options?: ImageGenerationOptions,
): string {
  const lines: string[] = [
    '你是专业影楼摄影生成器，必须输出单张单帧静态成片。',
    '禁止拼图、分屏、多宫格、海报边框、文字水印。',
    '相机与画面保持水平，禁止整幅画面旋转、斜切白边、歪框透视。',
  ];

  const sceneCount = referenceImages?.scene?.length || 0;
  const identityCount = referenceImages?.identity?.length || 0;
  if (sceneCount > 0) {
    lines.push(
      `你将收到 ${sceneCount} 张场景参考图：仅用于锁定布景主题、道具关系、色彩与光影氛围。`,
    );
  }
  if (identityCount > 0) {
    lines.push(
      `你将收到 ${identityCount} 张人物身份参考图：仅用于锁定人物脸部与年龄感，不继承其背景与构图。`,
    );
  }

  const bindings = Array.isArray(referenceImages?.identityBindings)
    ? referenceImages?.identityBindings
        .filter((item) => item && typeof item.index === 'number')
        .sort((a, b) => a.index - b.index)
    : [];
  if (bindings.length > 0) {
    const mapping = bindings
      .map((item) => `#${item.index}=${item.role?.trim() || `角色${item.index}`}`)
      .join('，');
    lines.push(`人物编号映射（硬约束，不可交换）：${mapping}。`);
  }

  lines.push('优先级：人物身份一致性 > 场景主题一致性 > 文本补充细节。');

  const aspectInstruction = buildOpenAIChatAspectRatioInstruction(options);
  if (aspectInstruction) lines.push(aspectInstruction);

  lines.push(`最终出图要求：${prompt}`);
  return lines.join('\n');
}

function normalizeOpenAIChatContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((item) => {
      if (typeof item === 'string') return item;
      if (!item || typeof item !== 'object') return '';
      const text = (item as { text?: unknown }).text;
      return typeof text === 'string' ? text : '';
    })
    .filter(Boolean)
    .join('\n');
}

function parseImageDataUri(value: string): { mimeType: string; data: string } | null {
  const match = value.match(/data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)/i);
  if (!match) return null;
  const mimeType = match[1] || 'image/png';
  const data = (match[2] || '').replace(/\s+/g, '');
  if (!data) return null;
  return { mimeType, data };
}

async function fetchRemoteImageAsGenerateResult(
  imageUrl: string,
): Promise<GenerateImageResult | null> {
  if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
    return null;
  }
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) return null;
    const mimeType =
      response.headers.get('content-type')?.split(';')[0].trim() || 'image/png';
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0) return null;
    return {
      imageBase64: buffer.toString('base64'),
      mimeType,
    };
  } catch {
    return null;
  }
}

function extractFirstMarkdownImageUrl(content: string): string | null {
  const dataImage = content.match(
    /!\[[^\]]*]\((data:image\/[a-zA-Z0-9.+-]+;base64,[^)]+)\)/i,
  );
  if (dataImage?.[1]) return dataImage[1];

  const remoteImage = content.match(/!\[[^\]]*]\((https?:\/\/[^)\s]+)\)/i);
  if (remoteImage?.[1]) return remoteImage[1];

  const directDataUri = content.match(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=\s]+/i);
  if (directDataUri?.[0]) return directDataUri[0];

  return null;
}

async function parseImageFromOpenAIChatResponseContent(
  content: unknown,
): Promise<GenerateImageResult | null> {
  if (Array.isArray(content)) {
    for (const item of content) {
      if (!item || typeof item !== 'object') continue;
      const maybeImageUrl = (item as { image_url?: { url?: unknown } }).image_url?.url;
      if (typeof maybeImageUrl !== 'string' || !maybeImageUrl.trim()) continue;
      const dataUri = parseImageDataUri(maybeImageUrl);
      if (dataUri) {
        return {
          imageBase64: dataUri.data,
          mimeType: dataUri.mimeType,
        };
      }
      const remoteImage = await fetchRemoteImageAsGenerateResult(maybeImageUrl);
      if (remoteImage) return remoteImage;
    }
  }

  const textContent = normalizeOpenAIChatContent(content);
  if (!textContent) return null;

  const imageUrl = extractFirstMarkdownImageUrl(textContent);
  if (!imageUrl) return null;

  const dataUri = parseImageDataUri(imageUrl);
  if (dataUri) {
    return {
      imageBase64: dataUri.data,
      mimeType: dataUri.mimeType,
    };
  }

  return fetchRemoteImageAsGenerateResult(imageUrl);
}

async function tryGenerateImageViaOpenAIChatCompletions(
  provider: Provider,
  prompt: string,
  referenceImages?: GeminiReferenceImages,
  options?: ImageGenerationOptions,
): Promise<GenerateImageResult | null> {
  const sceneRefs = (referenceImages?.scene || []).filter(
    (item): item is string => typeof item === 'string' && item.trim().length > 0,
  );
  const identityRefs = (referenceImages?.identity || []).filter(
    (item): item is string => typeof item === 'string' && item.trim().length > 0,
  );
  if (sceneRefs.length + identityRefs.length === 0) return null;

  const multimodalContent: Array<
    { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }
  > = [
    {
      type: 'text',
      text: buildOpenAIReferenceInstruction(prompt, referenceImages, options),
    },
  ];

  const appendReferenceBlock = async (
    label: string,
    refs: string[],
  ): Promise<number> => {
    if (refs.length === 0) return 0;
    multimodalContent.push({ type: 'text', text: label });
    let added = 0;
    for (const ref of refs) {
      const inlinePart = await buildGeminiInlineDataPart(ref);
      const inlineData = inlinePart?.inlineData as
        | { data?: string; mimeType?: string }
        | undefined;
      if (!inlineData?.data) continue;
      const mimeType = inlineData.mimeType || 'image/jpeg';
      multimodalContent.push({
        type: 'image_url',
        image_url: { url: `data:${mimeType};base64,${inlineData.data}` },
      });
      added += 1;
    }
    return added;
  };

  const sceneAdded = await appendReferenceBlock(
    '以下是场景主题参考图（只提取环境与光影信息，不继承其中人物特征）：',
    sceneRefs,
  );
  const identityAdded = await appendReferenceBlock(
    '以下是人物身份参考图（只提取人物身份特征，不继承背景与构图）：',
    identityRefs,
  );

  if (sceneAdded + identityAdded === 0) return null;

  const url = `${provider.baseUrl}/chat/completions`;
  if (DEBUG_IMAGEGEN) {
    console.log('[ImageGen] OpenAI multimodal chat URL:', url, {
      sceneRefs: sceneAdded,
      identityRefs: identityAdded,
    });
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify({
      model: provider.imageModel,
      stream: false,
      messages: [{ role: 'user', content: multimodalContent }],
    }),
  });

  if (!res.ok) {
    if (DEBUG_IMAGEGEN) {
      const err = await res.text().catch(() => '');
      console.log('[ImageGen] OpenAI multimodal chat failed:', res.status, err);
    }
    return null;
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: unknown } }>;
  };
  const parsed = await parseImageFromOpenAIChatResponseContent(
    data.choices?.[0]?.message?.content,
  );
  if (!parsed) return null;
  return {
    ...parsed,
    aspectRatioRuntime: {
      requested: resolveRequestedAspectLabel(options),
      attemptedWithSize: false,
      retriedWithoutSize: false,
      appliedWithSize: false,
    },
    runtimeDiagnostics: {
      effectiveRoute: 'openai-chat',
      referenceCountSent: sceneAdded + identityAdded,
    },
  };
}

async function generateImage(
  provider: Provider,
  prompt: string,
  referenceImages?: GeminiReferenceImages,
  options?: ImageGenerationOptions,
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
    const parsedOptions = options || null;
    const requestParts = await buildGeminiReferenceParts(referenceImages);
    const requestedAspectRatio = buildAspectRatioInstruction(
      parsedOptions?.aspectRatio,
    );
    const canUseImageConfigAspectRatio = supportsGeminiImageConfigAspectRatio(
      provider.imageModel,
    );
    const attemptedWithImageConfig = Boolean(
      requestedAspectRatio && canUseImageConfigAspectRatio,
    );
    let retriedWithoutImageConfig = false;

    const doGenerateRequest = async (withAspectRatio: boolean) => {
      const imageConfig =
        withAspectRatio && requestedAspectRatio && canUseImageConfigAspectRatio
          ? { aspectRatio: requestedAspectRatio }
          : null;
      return fetch(
        `${provider.baseUrl}/models/${provider.imageModel}:generateContent?key=${provider.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [...requestParts, { text: prompt }] }],
            generationConfig: {
              responseModalities: ['IMAGE', 'TEXT'],
              ...(imageConfig ? { imageConfig } : null),
            },
          }),
        },
      );
    };

    let res = await doGenerateRequest(true);

    if (DEBUG_IMAGEGEN)
      console.log('[ImageGen] Gemini response status:', res.status);

    if (!res.ok) {
      let errorData = await res.json().catch(() => ({}));
      const initialErrorMessage =
        (errorData as { error?: { message?: string } }).error?.message || '';

      if (
        requestedAspectRatio &&
        canUseImageConfigAspectRatio &&
        isUnsupportedAspectRatioError(initialErrorMessage)
      ) {
        if (DEBUG_IMAGEGEN) {
          console.warn(
            '[ImageGen] aspectRatio unsupported for model, retry without imageConfig',
          );
        }
        retriedWithoutImageConfig = true;
        res = await doGenerateRequest(false);
        if (!res.ok) {
          errorData = await res.json().catch(() => ({}));
        }
      }

      if (!res.ok && DEBUG_IMAGEGEN) {
        console.log('[ImageGen] Gemini error:', JSON.stringify(errorData));
      }

      if (!res.ok) {
        throw new Error(
          (errorData as { error?: { message?: string } }).error?.message ||
            `HTTP ${res.status}`,
        );
      }
    }

    const data = await res.json();
    if (DEBUG_IMAGEGEN)
      console.log('[ImageGen] Gemini response keys:', Object.keys(data));
    const responseParts =
      (
        data as {
          candidates?: {
            content?: {
              parts?: Array<{
                inlineData?: { data: string; mimeType?: string };
              }>;
            };
          }[];
        }
      ).candidates?.[0]?.content?.parts || [];

    if (DEBUG_IMAGEGEN)
      console.log('[ImageGen] Parts count:', responseParts.length);

    for (const part of responseParts) {
      if (part.inlineData) {
        const data = part.inlineData.data?.trim();
        if (!data) continue;
        if (DEBUG_IMAGEGEN)
          console.log(
            '[ImageGen] Found inlineData, mimeType:',
            part.inlineData.mimeType,
          );
        return {
          imageBase64: data,
          mimeType: part.inlineData.mimeType || 'image/png',
          aspectRatioRuntime: {
            requested: resolveRequestedAspectLabel(parsedOptions || undefined),
            attemptedWithImageConfig,
            retriedWithoutImageConfig,
            appliedWithImageConfig:
              attemptedWithImageConfig && !retriedWithoutImageConfig,
          },
          runtimeDiagnostics: {
            effectiveRoute: 'gemini-native',
            referenceCountSent: flattenReferenceImageList(referenceImages).length,
          },
        };
      }
    }

    throw new Error('No image in response');
  } else {
    // OpenAI 兼容格式（标准优先）
    const hasReferences = flattenReferenceImageList(referenceImages).length > 0;
    const requestedOpenAIImageSize = resolveOpenAIRequestedSize(options);
    const primaryRoute = resolveOpenAIImageRouteFromCapabilities(
      provider.capabilities,
      hasReferences,
    );

    const tryImagesRoute = async (): Promise<{
      image: GenerateImageResult | null;
      reason: string | null;
    }> => {
      const url = `${provider.baseUrl}/images/generations`;
      if (DEBUG_IMAGEGEN) console.log('[ImageGen] OpenAI URL:', url);
      const requestedAspectLabel = resolveRequestedAspectLabel(options);
      const attemptedWithSize = Boolean(requestedOpenAIImageSize);
      let retriedWithoutSize = false;
      const callImages = async (withSize: boolean) =>
        fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${provider.apiKey}`,
          },
          body: JSON.stringify({
            model: provider.imageModel,
            prompt,
            response_format: 'b64_json',
            ...(withSize && requestedOpenAIImageSize
              ? { size: requestedOpenAIImageSize }
              : null),
          }),
        });

      let res = await callImages(true);

      if (DEBUG_IMAGEGEN)
        console.log('[ImageGen] OpenAI response status:', res.status);

      if (!res.ok) {
        let errorData = await res.json().catch(() => ({}));
        let reason =
          (errorData as { error?: { message?: string } }).error?.message ||
          `HTTP ${res.status}`;

        if (
          requestedOpenAIImageSize &&
          isUnsupportedOpenAIImageSizeError(reason)
        ) {
          if (DEBUG_IMAGEGEN) {
            console.warn(
              '[ImageGen] OpenAI size unsupported, retry without size:',
              requestedOpenAIImageSize,
            );
          }
          retriedWithoutSize = true;
          res = await callImages(false);
          if (!res.ok) {
            errorData = await res.json().catch(() => ({}));
            reason =
              (errorData as { error?: { message?: string } }).error?.message ||
              `HTTP ${res.status}`;
          }
        }

        if (!res.ok && DEBUG_IMAGEGEN) {
          console.log('[ImageGen] OpenAI error:', JSON.stringify(errorData));
        }

        if (!res.ok) {
          return {
            image: null,
            reason,
          };
        }
      }

      const data = (await res.json()) as { data?: Array<{ b64_json?: string }> };
      const items = Array.isArray(data.data) ? data.data : [];
      for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        const b64 =
          typeof (item as { b64_json?: unknown }).b64_json === 'string'
            ? (item as { b64_json?: string }).b64_json?.trim() || ''
            : '';
        if (b64) {
          return {
            image: {
              imageBase64: b64,
              mimeType: 'image/png',
              aspectRatioRuntime: {
                requested: requestedAspectLabel,
                attemptedWithSize,
                retriedWithoutSize,
                appliedWithSize: attemptedWithSize && !retriedWithoutSize,
              },
              runtimeDiagnostics: {
                effectiveRoute: 'openai-images',
                referenceCountSent: 0,
              },
            },
            reason: null,
          };
        }

        const maybeUrl =
          typeof (item as { url?: unknown }).url === 'string'
            ? ((item as { url?: string }).url || '').trim()
            : '';
        if (!maybeUrl) continue;

        const dataUri = parseImageDataUri(maybeUrl);
        if (dataUri) {
          return {
            image: {
              imageBase64: dataUri.data,
              mimeType: dataUri.mimeType,
              aspectRatioRuntime: {
                requested: requestedAspectLabel,
                attemptedWithSize,
                retriedWithoutSize,
                appliedWithSize: attemptedWithSize && !retriedWithoutSize,
              },
              runtimeDiagnostics: {
                effectiveRoute: 'openai-images',
                referenceCountSent: 0,
              },
            },
            reason: null,
          };
        }

        const remoteImage = await fetchRemoteImageAsGenerateResult(maybeUrl);
        if (remoteImage) {
          return {
            image: {
              ...remoteImage,
              aspectRatioRuntime: {
                requested: requestedAspectLabel,
                attemptedWithSize,
                retriedWithoutSize,
                appliedWithSize: attemptedWithSize && !retriedWithoutSize,
              },
              runtimeDiagnostics: {
                effectiveRoute: 'openai-images',
                referenceCountSent: 0,
              },
            },
            reason: null,
          };
        }
      }

      return {
        image: null,
        reason: 'OpenAI image response has no usable image data',
      };
    };

    const tryChatRoute = async (): Promise<{
      image: GenerateImageResult | null;
      reason: string | null;
    }> => {
      if (!hasReferences) {
        return { image: null, reason: 'No reference images for chat multimodal route' };
      }
      const openAIChatImage = await tryGenerateImageViaOpenAIChatCompletions(
        provider,
        prompt,
        referenceImages,
        options,
      );
      return {
        image: openAIChatImage,
        reason: openAIChatImage ? null : 'Chat multimodal route returned no image',
      };
    };

    const primaryResult =
      primaryRoute === 'chat' ? await tryChatRoute() : await tryImagesRoute();
    if (primaryResult.image) return primaryResult.image;
    throw new Error(primaryResult.reason || 'OpenAI image generation failed');
  }
}
