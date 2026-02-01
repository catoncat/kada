/**
 * 模型能力分类器
 * 根据模型 ID 和描述推断模型能力
 */

import type { ModelCapability } from '@/types/provider';

// 已知的图片生成模型关键词
const IMAGE_MODEL_KEYWORDS = [
  'image',
  'dall-e',
  'flux',
  'stable-diffusion',
  'midjourney',
  'imagen',
];

// 已知的代码模型关键词
const CODE_MODEL_KEYWORDS = [
  'codex',
  'coder',
  'code',
  'codestral',
  'deepseek-coder',
  'starcoder',
];

// 已知的视觉理解模型关键词
const VISION_MODEL_KEYWORDS = [
  'vision',
  '4v',
  '-v',
  'visual',
  '看图',
  'multimodal',
];

// 已知的 embedding 模型关键词
const EMBEDDING_MODEL_KEYWORDS = [
  'embed',
  'embedding',
  'text-embedding',
];

export function inferModelCapabilities(model: {
  id: string;
  name?: string;
  description?: string;
}): ModelCapability[] {
  const text = `${model.id} ${model.name || ''} ${model.description || ''}`.toLowerCase();
  const caps: ModelCapability[] = [];

  // 图片生成
  if (IMAGE_MODEL_KEYWORDS.some(kw => text.includes(kw))) {
    caps.push('image');
  }

  // 代码专用
  if (CODE_MODEL_KEYWORDS.some(kw => text.includes(kw))) {
    caps.push('code');
  }

  // 视觉理解
  if (VISION_MODEL_KEYWORDS.some(kw => text.includes(kw))) {
    caps.push('vision');
  }

  // Embedding
  if (EMBEDDING_MODEL_KEYWORDS.some(kw => text.includes(kw))) {
    caps.push('embedding');
  }

  // 默认都支持文本生成（除了纯 embedding 和纯 image 模型）
  if (!caps.includes('embedding') && !caps.some(c => c === 'image' && caps.length === 1)) {
    caps.push('text');
  }

  // 如果是 image 模型但没有其他能力，也加上 text（大多数可以返回文本）
  if (caps.length === 0) {
    caps.push('text');
  }

  return caps;
}

// 获取能力对应的图标
export function getCapabilityIcon(cap: ModelCapability): string {
  switch (cap) {
    case 'text': return '📝';
    case 'image': return '🎨';
    case 'code': return '💻';
    case 'vision': return '👁';
    case 'embedding': return '🔢';
    default: return '•';
  }
}

// 获取能力对应的颜色 class
export function getCapabilityColor(cap: ModelCapability): string {
  switch (cap) {
    case 'text': return 'bg-gray-100 text-gray-700';
    case 'image': return 'bg-purple-100 text-purple-700';
    case 'code': return 'bg-blue-100 text-blue-700';
    case 'vision': return 'bg-green-100 text-green-700';
    case 'embedding': return 'bg-yellow-100 text-yellow-700';
    default: return 'bg-gray-100 text-gray-700';
  }
}
