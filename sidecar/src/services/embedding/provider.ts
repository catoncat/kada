import path from 'node:path';
import { readFile } from 'node:fs/promises';

export interface EmbeddingProviderConfig {
  endpoint: string;
  apiKey?: string | null;
  model: string;
  timeoutMs?: number;
}

export interface EmbedTextInput {
  text: string;
  config: EmbeddingProviderConfig;
}

export interface EmbedImageInput {
  imagePath?: string;
  imageBase64?: string;
  mimeType?: string;
  config: EmbeddingProviderConfig;
}

export interface EmbeddingProvider {
  embedText(input: EmbedTextInput): Promise<number[]>;
  embedImage(input: EmbedImageInput): Promise<number[]>;
}

interface BodyCandidate {
  name: string;
  body: Record<string, unknown>;
}

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'number');
}

function extractEmbedding(payload: any): number[] | null {
  const candidates: unknown[] = [
    payload?.data?.[0]?.embedding,
    payload?.data?.[0]?.embeddings,
    payload?.data?.[0]?.values,
    payload?.embedding,
    payload?.embeddings?.[0],
    payload?.embeddings?.float?.[0],
    payload?.vectors?.[0],
    payload?.result?.data?.[0]?.embedding,
    payload?.output?.[0]?.embedding,
  ];

  for (const candidate of candidates) {
    if (isNumberArray(candidate)) return candidate;
    if (
      candidate &&
      typeof candidate === 'object' &&
      isNumberArray((candidate as Record<string, unknown>).values)
    ) {
      return (candidate as { values: number[] }).values;
    }
  }

  return null;
}

function normalizeEndpoint(endpoint: string): string {
  const trimmed = endpoint.trim();
  if (!trimmed) {
    throw new Error('Embedding endpoint is required');
  }
  if (
    /(\/embeddings|\/embed|\/multimodal-embeddings)(\?|$)/i.test(trimmed)
  ) {
    return trimmed;
  }
  return `${trimmed.replace(/\/+$/, '')}/embeddings`;
}

function inferMimeType(filePath?: string, fallback = 'image/jpeg'): string {
  if (!filePath) return fallback;
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.bmp') return 'image/bmp';
  if (ext === '.heic') return 'image/heic';
  return fallback;
}

function ensureModel(config: EmbeddingProviderConfig): string {
  const model = config.model.trim();
  if (!model) throw new Error('Embedding model is required');
  return model;
}

function buildHeaders(config: EmbeddingProviderConfig): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (config.apiKey?.trim()) {
    headers.Authorization = `Bearer ${config.apiKey.trim()}`;
  }
  return headers;
}

async function toDataUri(input: EmbedImageInput): Promise<string> {
  if (input.imageBase64?.trim()) {
    const raw = input.imageBase64.trim();
    if (raw.startsWith('data:image/')) {
      return raw;
    }
    const mimeType = input.mimeType || 'image/jpeg';
    return `data:${mimeType};base64,${raw}`;
  }

  if (!input.imagePath) {
    throw new Error('imagePath or imageBase64 is required');
  }

  const fileBuffer = await readFile(input.imagePath);
  const mimeType = input.mimeType || inferMimeType(input.imagePath);
  return `data:${mimeType};base64,${fileBuffer.toString('base64')}`;
}

async function safeReadJson(response: Response): Promise<any> {
  const raw = await response.text();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
}

export class ApiMultimodalEmbeddingProvider implements EmbeddingProvider {
  async embedText(input: EmbedTextInput): Promise<number[]> {
    const text = input.text.trim();
    if (!text) throw new Error('text is required');

    const model = ensureModel(input.config);
    return this.requestEmbedding(input.config, [
      { name: 'openai:text:string', body: { model, input: text } },
      { name: 'openai:text:list', body: { model, input: [text] } },
      { name: 'jina:text:object', body: { model, input: [{ text }] } },
      {
        name: 'cohere:text:list',
        body: { model, texts: [text], input_type: 'search_query' },
      },
      {
        name: 'voyage:text:list',
        body: {
          model,
          input: [{ type: 'text', text }],
        },
      },
    ]);
  }

  async embedImage(input: EmbedImageInput): Promise<number[]> {
    const model = ensureModel(input.config);
    const dataUri = await toDataUri(input);

    return this.requestEmbedding(input.config, [
      {
        name: 'openai:multimodal:image_url',
        body: {
          model,
          input: [{ type: 'input_image', image_url: dataUri }],
        },
      },
      {
        name: 'jina:multimodal:object',
        body: {
          model,
          input: [{ image: dataUri }],
        },
      },
      {
        name: 'voyage:multimodal',
        body: {
          model,
          input: [{ type: 'image_base64', image_base64: dataUri }],
        },
      },
      {
        name: 'cohere:image:list',
        body: {
          model,
          images: [dataUri],
          input_type: 'image',
        },
      },
      {
        name: 'openai:image:data_uri',
        body: {
          model,
          input: [dataUri],
        },
      },
    ]);
  }

  private async requestEmbedding(
    config: EmbeddingProviderConfig,
    candidates: BodyCandidate[],
  ): Promise<number[]> {
    const endpoint = normalizeEndpoint(config.endpoint);
    const headers = buildHeaders(config);
    const timeoutMs = config.timeoutMs ?? 45_000;
    const errors: string[] = [];

    for (const candidate of candidates) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(candidate.body),
          signal: controller.signal,
        });
        const payload = await safeReadJson(response);
        if (!response.ok) {
          const message =
            payload?.error?.message ||
            payload?.message ||
            payload?.raw ||
            `HTTP ${response.status}`;
          errors.push(`[${candidate.name}] ${String(message)}`);
          continue;
        }

        const embedding = extractEmbedding(payload);
        if (embedding && embedding.length > 0) {
          return embedding;
        }
        errors.push(`[${candidate.name}] response has no embedding field`);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error || 'Unknown');
        errors.push(`[${candidate.name}] ${message}`);
      } finally {
        clearTimeout(timer);
      }
    }

    throw new Error(
      `Embedding API request failed. Tried ${candidates.length} formats.\n${errors.join('\n')}`,
    );
  }
}
