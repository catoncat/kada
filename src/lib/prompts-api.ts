/**
 * Prompts API 客户端
 * 用于预览服务端拼接后的 effectivePrompt
 */

import { apiUrl } from './api-config';
import type { ArtifactOwnerType } from './artifacts-api';

export interface PromptOwner {
  type: ArtifactOwnerType;
  id: string;
  slot?: string;
}

export interface RenderedPromptBlock {
  id: string;
  kind: string;
  label: string;
  text: string;
}

export interface PreviewImagePromptResponse {
  effectivePrompt: string;
  rule: { key: string; id: string };
  renderedBlocks: RenderedPromptBlock[];
  promptContext?: Record<string, unknown>;
}

export async function previewImagePrompt(input: {
  prompt: string;
  owner?: PromptOwner;
  editInstruction?: string;
}): Promise<PreviewImagePromptResponse> {
  const res = await fetch(apiUrl('/api/prompts/preview-image'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || '预览 effectivePrompt 失败');
  }
  return data as PreviewImagePromptResponse;
}

