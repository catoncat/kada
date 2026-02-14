import { Hono } from 'hono';
import { getDb } from '../db';
import { providers } from '../db/schema';
import { eq } from 'drizzle-orm';
import { resolveOpenAIImageRouteFromCapabilities } from '../services/provider-capabilities';

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
  capabilities?: string | null;
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
  const parseDataUri = (
    value: string,
  ): { mimeType: string; data: string } | null => {
    const match = value.match(
      /data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)/i,
    );
    if (!match) return null;
    const mimeType = match[1] || 'image/png';
    const data = (match[2] || '').replace(/\s+/g, '');
    if (!data) return null;
    return { mimeType, data };
  };

  const extractImageFromChatResponse = (payload: any): { imageBase64: string; mimeType: string } | null => {
    const content = payload?.choices?.[0]?.message?.content;
    if (Array.isArray(content)) {
      for (const part of content) {
        const imageUrl = part?.image_url?.url;
        if (typeof imageUrl !== 'string' || !imageUrl.trim()) continue;
        const dataUri = parseDataUri(imageUrl);
        if (dataUri) {
          return { imageBase64: dataUri.data, mimeType: dataUri.mimeType };
        }
      }
    }
    const text = typeof content === 'string' ? content : '';
    const dataImageMatch = text.match(
      /data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)/i,
    );
    if (!dataImageMatch) return null;
    return {
      mimeType: dataImageMatch[1] || 'image/png',
      imageBase64: (dataImageMatch[2] || '').replace(/\s+/g, ''),
    };
  };

  const toDataUri = async (value: string): Promise<string | null> => {
    if (value.startsWith('data:')) return value;
    if (value.startsWith('http://') || value.startsWith('https://')) {
      try {
        const response = await fetch(value);
        if (!response.ok) return null;
        const mimeType =
          response.headers.get('content-type')?.split(';')[0] || 'image/jpeg';
        const base64 = Buffer.from(await response.arrayBuffer()).toString('base64');
        return `data:${mimeType};base64,${base64}`;
      } catch {
        return null;
      }
    }
    return `data:image/jpeg;base64,${value}`;
  };

  const buildOpenAIChatAspectRatioInstruction = (): string | null => {
    if (
      typeof options?.width === 'number' &&
      Number.isFinite(options.width) &&
      options.width > 0 &&
      typeof options?.height === 'number' &&
      Number.isFinite(options.height) &&
      options.height > 0
    ) {
      return `画幅硬约束：${Math.round(options.width)}x${Math.round(options.height)} 像素，保持对应比例。`;
    }
    const aspect = normalizeAspectRatioLabel(options?.aspectRatio);
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
  };

  const normalizeAspectRatioLabel = (value?: string): string | null => {
    if (!value || typeof value !== 'string') return null;
    const normalized = value.trim().toLowerCase();
    return normalized || null;
  };

  const resolveOpenAIRequestedSize = (): string | null => {
    if (
      typeof options?.width === 'number' &&
      Number.isFinite(options.width) &&
      options.width > 0 &&
      typeof options?.height === 'number' &&
      Number.isFinite(options.height) &&
      options.height > 0
    ) {
      return `${Math.round(options.width)}x${Math.round(options.height)}`;
    }

    const aspect = normalizeAspectRatioLabel(options?.aspectRatio);
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
  };

  const isUnsupportedOpenAIImageSizeError = (message: string): boolean => {
    const lower = message.toLowerCase();
    if (!lower.includes('size')) return false;
    return (
      lower.includes('invalid') ||
      lower.includes('unsupported') ||
      lower.includes('not supported') ||
      lower.includes('unknown') ||
      lower.includes('unrecognized')
    );
  };

  const requestedOpenAIImageSize = resolveOpenAIRequestedSize();

  const tryOpenAIImages = async (): Promise<{ image: { imageBase64: string; mimeType: string } | null; reason: string | null }> => {
    const url = `${provider.baseUrl}/images/generations`;
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
    if (!res.ok) {
      let errData = await res.json().catch(() => ({}));
      let reason =
        errData.error?.message || `Failed to generate image: HTTP ${res.status}`;
      if (
        requestedOpenAIImageSize &&
        isUnsupportedOpenAIImageSizeError(reason)
      ) {
        res = await callImages(false);
        if (!res.ok) {
          errData = await res.json().catch(() => ({}));
          reason =
            errData.error?.message ||
            `Failed to generate image: HTTP ${res.status}`;
        }
      }
      if (!res.ok) {
        return {
          image: null,
          reason,
        };
      }
    }

    const data = await res.json();
    const items = Array.isArray(data?.data) ? data.data : [];
    for (const item of items) {
      const b64 = typeof item?.b64_json === 'string' ? item.b64_json.trim() : '';
      if (b64) {
        return { image: { imageBase64: b64, mimeType: 'image/png' }, reason: null };
      }
      const maybeUrl = typeof item?.url === 'string' ? item.url.trim() : '';
      if (!maybeUrl) continue;
      const dataUri = parseDataUri(maybeUrl);
      if (dataUri) {
        return { image: { imageBase64: dataUri.data, mimeType: dataUri.mimeType }, reason: null };
      }
    }
    return { image: null, reason: 'OpenAI image response has no usable image data' };
  };

  const tryOpenAIChat = async (): Promise<{ image: { imageBase64: string; mimeType: string } | null; reason: string | null }> => {
    if (!Array.isArray(referenceImages) || referenceImages.length === 0) {
      return { image: null, reason: 'No reference images for chat multimodal route' };
    }
    const instructionLines = [
      '你是专业影楼摄影生成器，输出单张单帧静态成片。',
      '参考图硬约束：人物身份一致性 > 场景主题一致性 > 文本补充细节。',
      '相机与画面保持水平，禁止整幅画面旋转、斜切白边、歪框透视。',
    ];
    const aspectInstruction = buildOpenAIChatAspectRatioInstruction();
    if (aspectInstruction) instructionLines.push(aspectInstruction);
    instructionLines.push(`最终出图要求：${prompt}`);

    const multimodalContent: Array<
      { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }
    > = [{ type: 'text', text: instructionLines.join('\n') }];
    multimodalContent.push({
      type: 'text',
      text: '以下是参考图：请严格用于人物身份与场景氛围对齐。',
    });
    for (const ref of referenceImages) {
      if (typeof ref !== 'string' || !ref.trim()) continue;
      const dataUri = await toDataUri(ref.trim());
      if (!dataUri) continue;
      multimodalContent.push({ type: 'image_url', image_url: { url: dataUri } });
    }
    if (multimodalContent.length <= 1) {
      return { image: null, reason: 'No usable reference images for chat multimodal route' };
    }
    const res = await fetch(`${provider.baseUrl}/chat/completions`, {
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
      const errData = await res.json().catch(() => ({}));
      return {
        image: null,
        reason: errData.error?.message || `Chat fallback failed: HTTP ${res.status}`,
      };
    }
    const data = await res.json();
    const parsed = extractImageFromChatResponse(data);
    if (parsed) return { image: parsed, reason: null };
    return { image: null, reason: 'Chat multimodal route returned no image data' };
  };

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
    const hasReferences =
      Array.isArray(referenceImages) &&
      referenceImages.some((item) => typeof item === 'string' && item.trim());
    const primaryRoute = resolveOpenAIImageRouteFromCapabilities(
      provider.capabilities,
      Boolean(hasReferences),
    );

    const primaryResult =
      primaryRoute === 'chat'
        ? await tryOpenAIChat()
        : await tryOpenAIImages();
    if (primaryResult.image) {
      return primaryResult.image;
    }

    const secondaryRoute = primaryRoute === 'chat' ? 'images' : 'chat';
    const secondaryResult =
      secondaryRoute === 'chat'
        ? await tryOpenAIChat()
        : await tryOpenAIImages();
    if (secondaryResult.image) {
      return secondaryResult.image;
    }

    throw new Error(
      secondaryResult.reason || primaryResult.reason || 'OpenAI image generation failed',
    );
  }
}
