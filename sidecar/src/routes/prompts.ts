import { Hono } from 'hono';
import { getDb } from '../db';
import { buildImageEffectivePrompt } from '../worker/prompt-engine';
import {
  buildPreviewReferenceInputs,
  buildReferencePlanSummary,
  resolveReferenceImages,
} from '../worker/reference-image-planner';
import { optimizeImagePrompt } from '../worker/prompt-optimizer';

export const promptsRoutes = new Hono();

type Owner = {
  type: 'asset' | 'projectPlanVersion' | 'planScene';
  id: string;
  slot?: string;
};

function isOwner(value: unknown): value is Owner {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (v.type !== 'asset' && v.type !== 'projectPlanVersion' && v.type !== 'planScene') return false;
  if (typeof v.id !== 'string' || !v.id.trim()) return false;
  if (v.slot !== undefined && typeof v.slot !== 'string') return false;
  return true;
}

/**
 * POST /api/prompts/preview-image
 * 预览图片生成的 effectivePrompt（服务端拼接后的最终提示词）
 */
promptsRoutes.post('/preview-image', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    const owner = isOwner(body.owner) ? body.owner : undefined;
    const editInstruction =
      typeof body.editInstruction === 'string' ? body.editInstruction.trim() : undefined;
    const providerId = typeof body.providerId === 'string' ? body.providerId.trim() : '';
    const referenceImages = Array.isArray(body.referenceImages)
      ? body.referenceImages.filter((item: unknown): item is string => typeof item === 'string')
      : undefined;
    const currentImagePath =
      typeof body.currentImagePath === 'string' ? body.currentImagePath.trim() : '';
    const includeCurrentImageAsReference =
      typeof body.includeCurrentImageAsReference === 'boolean'
        ? body.includeCurrentImageAsReference
        : true;

    if (!prompt) {
      return c.json({ error: 'prompt is required' }, 400);
    }

    const db = getDb();
    const composed = await buildImageEffectivePrompt(db, {
      prompt,
      owner,
      editInstruction: editInstruction || undefined,
    });
    const modelRefImages: string[] = Array.isArray((composed.promptContext as any).modelReferenceImages)
      ? (composed.promptContext as any).modelReferenceImages
      : [];
    const previewReferenceInputs = buildPreviewReferenceInputs({
      referenceImages,
      currentImagePath: currentImagePath || null,
      includeCurrentImageAsReference,
    });
    const resolvedReferences = await resolveReferenceImages({
      db,
      owner,
      editInstruction,
      modelReferenceImages: modelRefImages,
      inputReferenceImages: previewReferenceInputs,
    });
    const referencePlan = buildReferencePlanSummary(resolvedReferences);
    const optimized = await optimizeImagePrompt({
      db,
      providerId: providerId || null,
      draftPrompt: prompt,
      effectivePrompt: composed.effectivePrompt,
      promptContext: composed.promptContext,
      referencePlan,
    });
    const previewPromptContext = {
      ...composed.promptContext,
      referencePlan,
      promptOptimization: {
        ...optimized.meta,
        sourcePrompt: composed.effectivePrompt,
        renderPrompt: optimized.renderPrompt,
      },
    };
    const sources =
      composed.promptContext && typeof composed.promptContext.sources === 'object'
        ? (composed.promptContext.sources as Record<string, unknown>)
        : null;
    const studioTemplateId =
      sources && typeof sources.studioTemplateId === 'string'
        ? sources.studioTemplateId
        : null;

    return c.json({
      effectivePrompt: composed.effectivePrompt,
      renderPrompt: optimized.renderPrompt,
      promptOptimization: optimized.meta,
      composer: composed.composer,
      studioTemplateId,
      promptContext: previewPromptContext,
      referencePlan,
    });
  } catch (error: unknown) {
    console.error('Preview image prompt error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: `预览失败: ${message}` }, 500);
  }
});
