/**
 * 图片生成任务处理器
 */

import { getDb } from '../../db';
import { providers } from '../../db/schema';
import { eq } from 'drizzle-orm';

interface ImageGenerationInput {
  prompt: string;
  providerId?: string;
}

interface ImageGenerationOutput {
  imageBase64: string;
  mimeType: string;
}

export async function imageGenerationHandler(
  input: ImageGenerationInput
): Promise<ImageGenerationOutput> {
  const { prompt, providerId } = input;

  if (!prompt) {
    throw new Error('prompt is required');
  }

  const db = getDb();

  // 获取 provider
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

  // 调用图片生成 API
  return await generateImage(provider, prompt);
}

interface Provider {
  format: string;
  baseUrl: string;
  apiKey: string;
  imageModel: string;
}

async function generateImage(
  provider: Provider,
  prompt: string
): Promise<ImageGenerationOutput> {
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
      throw new Error(errorData.error?.message || `HTTP ${res.status}`);
    }

    const data = await res.json();
    const parts = data.candidates?.[0]?.content?.parts || [];

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
      throw new Error(errorData.error?.message || `HTTP ${res.status}`);
    }

    const data = await res.json();
    return {
      imageBase64: data.data?.[0]?.b64_json || '',
      mimeType: 'image/png',
    };
  }
}
