/**
 * Provider 系统类型定义
 * 支持多种 API 提供商和格式
 */

export type ApiFormat = 'openai' | 'gemini' | 'local';

export type ModelCapability = 'text' | 'image' | 'code' | 'vision' | 'embedding';

export interface ModelInfo {
  id: string;
  name: string;
  description?: string;
  capabilities: ModelCapability[];
  provider?: string;
}

export interface ProviderConfig {
  id: string;
  name: string;
  format: ApiFormat;
  baseUrl: string;
  apiKey: string;
  textModel: string;
  imageModel: string;
  isDefault: boolean;
  isBuiltin?: boolean;
  isPreset?: boolean;
}

// 内置 Provider（本地模式）
export const BUILTIN_PROVIDERS: ProviderConfig[] = [
  {
    id: 'local',
    name: '本地模式',
    format: 'local',
    baseUrl: '',
    apiKey: '',
    textModel: 'gemini-nano',
    imageModel: '',
    isDefault: true,
    isBuiltin: true,
  },
];

// 预设模板（用于快速添加）
export const PRESET_TEMPLATES: Omit<ProviderConfig, 'id' | 'isDefault'>[] = [
  {
    name: 'Google AI Studio',
    format: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    apiKey: '',
    textModel: 'gemini-2.5-flash',
    imageModel: 'gemini-2.0-flash-exp-image-generation',
    isPreset: true,
  },
  {
    name: 'OpenRouter',
    format: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKey: '',
    textModel: 'google/gemini-2.5-flash',
    imageModel: 'google/gemini-3-pro-image-preview',
    isPreset: true,
  },
];

// Provider 服务接口
export interface ProviderService {
  listModels(): Promise<ModelInfo[]>;
  generateText(prompt: string): Promise<string>;
  generateImage(prompt: string): Promise<{ base64: string; mimeType: string }>;
}

// 存储结构
export interface ProvidersStorage {
  providers: ProviderConfig[];
  defaultProviderId: string;
}
