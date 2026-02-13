import { Hono } from 'hono';
import { getDb } from '../db';
import { providers } from '../db/schema';
import { eq } from 'drizzle-orm';

export const aiRoutes = new Hono();

// 获取模型列表
aiRoutes.post('/models', async (c) => {
  const body = await c.req.json();
  const { providerId, provider: bodyProvider } = body;

  const db = getDb();
  let provider = bodyProvider;

  if (!provider) {
    if (providerId) {
      [provider] = await db.select().from(providers).where(eq(providers.id, providerId)).limit(1);
    } else {
      [provider] = await db.select().from(providers).where(eq(providers.isDefault, true)).limit(1);
    }
  }

  if (!provider) {
    return c.json({ error: 'No provider configured' }, 400);
  }

  try {
    const models = await fetchModels(provider);
    return c.json({ models });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// 生成文本
aiRoutes.post('/generate', async (c) => {
  const body = await c.req.json();
  const { prompt, providerId, provider: bodyProvider } = body;

  const db = getDb();
  let provider = bodyProvider;

  if (!provider) {
    if (providerId) {
      [provider] = await db.select().from(providers).where(eq(providers.id, providerId)).limit(1);
    } else {
      [provider] = await db.select().from(providers).where(eq(providers.isDefault, true)).limit(1);
    }
  }

  if (!provider) {
    return c.json({ error: 'No provider configured' }, 400);
  }

  try {
    const result = await generateText(provider, prompt);
    return c.json({ text: result });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// 生成图片
aiRoutes.post('/generate-image', async (c) => {
  const body = await c.req.json();
  const { prompt, providerId, provider: bodyProvider, referenceImages, options } = body;

  const db = getDb();
  let provider = bodyProvider;

  if (!provider) {
    if (providerId) {
      [provider] = await db.select().from(providers).where(eq(providers.id, providerId)).limit(1);
    } else {
      [provider] = await db.select().from(providers).where(eq(providers.isDefault, true)).limit(1);
    }
  }

  if (!provider) {
    return c.json({ error: 'No provider configured' }, 400);
  }

  try {
    const result = await generateImage(provider, prompt, referenceImages, options);
    return c.json(result);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// 测试连接
aiRoutes.post('/test', async (c) => {
  const body = await c.req.json();
  const { format, baseUrl, apiKey, model } = body;

  try {
    let testUrl: string;
    let testOptions: RequestInit;

    if (format === 'gemini') {
      testUrl = `${baseUrl}/models/${model}?key=${apiKey}`;
      testOptions = { method: 'GET' };
    } else {
      testUrl = `${baseUrl}/models`;
      testOptions = {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` },
      };
    }

    const response = await fetch(testUrl, testOptions);
    if (response.ok) {
      return c.json({ success: true, message: '连接成功' });
    } else {
      const data = await response.json().catch(() => ({}));
      return c.json({ success: false, message: data.error?.message || `HTTP ${response.status}` });
    }
  } catch (error: any) {
    return c.json({ success: false, message: error.message });
  }
});

// ========== 内部函数 ==========

interface Provider {
  format: string;
  baseUrl: string;
  apiKey: string;
  textModel: string;
  imageModel: string;
}

async function fetchModels(provider: Provider) {
  if (provider.format === 'gemini') {
    const url = `${provider.baseUrl}/models?key=${provider.apiKey}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch models');
    const data = await res.json();
    return (data.models || []).map((m: any) => ({
      id: m.name?.replace('models/', '') || m.name,
      name: m.displayName || m.name,
      description: m.description,
    }));
  } else {
    const url = `${provider.baseUrl}/models`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${provider.apiKey}` },
    });
    if (!res.ok) throw new Error('Failed to fetch models');
    const data = await res.json();
    return (data.data || []).map((m: any) => ({
      id: m.id,
      name: m.id,
      description: m.description,
    }));
  }
}

async function generateText(provider: Provider, prompt: string): Promise<string> {
  if (provider.format === 'gemini') {
    const url = `${provider.baseUrl}/models/${provider.textModel}:generateContent?key=${provider.apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    });
    if (!res.ok) throw new Error('Failed to generate text');
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  } else {
    const url = `${provider.baseUrl}/chat/completions`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify({
        model: provider.textModel,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) throw new Error('Failed to generate text');
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  }
}

interface ImageGenerationOptions {
  width?: number;
  height?: number;
  aspectRatio?: string;
}

async function generateImage(
  provider: Provider,
  prompt: string,
  referenceImages?: string[],
  options?: ImageGenerationOptions
): Promise<{ imageBase64: string; mimeType: string }> {
  if (provider.format === 'gemini') {
    // Gemini API 支持图+文生图
    const url = `${provider.baseUrl}/models/${provider.imageModel}:generateContent?key=${provider.apiKey}`;

    // 构建 parts 数组
    const parts: any[] = [];

    // 添加参考图片（如果有）
    if (referenceImages && referenceImages.length > 0) {
      for (const img of referenceImages) {
        // 支持 base64 或 URL
        if (img.startsWith('data:')) {
          // data:image/jpeg;base64,xxx 格式
          const match = img.match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            parts.push({
              inlineData: {
                mimeType: match[1],
                data: match[2],
              },
            });
          }
        } else if (img.startsWith('http')) {
          // 从 URL 获取图片并转为 base64
          try {
            const response = await fetch(img);
            if (response.ok) {
              const buffer = await response.arrayBuffer();
              const base64 = Buffer.from(buffer).toString('base64');
              const contentType = response.headers.get('content-type') || 'image/jpeg';
              parts.push({
                inlineData: {
                  mimeType: contentType,
                  data: base64,
                },
              });
            }
          } catch (e) {
            console.warn('Failed to fetch reference image:', img, e);
          }
        } else {
          // 假设是纯 base64
          parts.push({
            inlineData: {
              mimeType: 'image/jpeg',
              data: img,
            },
          });
        }
      }
    }

    // 添加文本提示
    parts.push({ text: prompt });

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          responseModalities: ['IMAGE', 'TEXT'],
          ...(options?.aspectRatio
            ? {
                imageConfig: {
                  aspectRatio: options.aspectRatio,
                },
              }
            : {}),
        },
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error?.message || 'Failed to generate image');
    }

    const data = await res.json();
    const responseParts = data.candidates?.[0]?.content?.parts || [];
    for (const part of responseParts) {
      if (part.inlineData) {
        return {
          imageBase64: part.inlineData.data,
          mimeType: part.inlineData.mimeType || 'image/png',
        };
      }
    }
    throw new Error('No image in response');
  } else {
    // OpenAI 格式（目前大多数不支持图+文，仅使用 prompt）
    const url = `${provider.baseUrl}/images/generations`;
    const requestBody: any = {
      model: provider.imageModel,
      prompt,
      response_format: 'b64_json',
    };

    // 添加尺寸参数
    if (options?.width && options?.height) {
      requestBody.size = `${options.width}x${options.height}`;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error?.message || 'Failed to generate image');
    }

    const data = await res.json();
    return {
      imageBase64: data.data?.[0]?.b64_json || '',
      mimeType: 'image/png',
    };
  }
}
