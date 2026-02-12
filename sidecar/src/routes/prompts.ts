import { Hono } from 'hono';
import { getDb } from '../db';
import { buildImageEffectivePrompt } from '../worker/prompt-engine';

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

    if (!prompt) {
      return c.json({ error: 'prompt is required' }, 400);
    }

    const db = getDb();
    const composed = await buildImageEffectivePrompt(db, {
      prompt,
      owner,
      editInstruction: editInstruction || undefined,
    });

    return c.json({
      effectivePrompt: composed.effectivePrompt,
      rule: { key: composed.ruleKey, id: composed.ruleId },
      renderedBlocks: composed.renderedBlocks,
      promptContext: composed.promptContext,
    });
  } catch (error: unknown) {
    console.error('Preview image prompt error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: `预览失败: ${message}` }, 500);
  }
});

