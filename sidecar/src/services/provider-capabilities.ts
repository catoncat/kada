interface ProviderProbeInput {
  format: string;
  baseUrl: string;
  apiKey: string;
  textModel: string;
  imageModel: string;
}

export type OpenAIImageRoute = 'images' | 'chat';

export interface ProviderCapabilities {
  version: 1;
  detectedAt: string;
  format: string;
  openai?: {
    imagesEndpoint: {
      supported: boolean;
      reason?: string | null;
      responseKind?: 'b64_json' | 'url' | 'data_uri' | 'unknown';
    };
    chatImage: {
      supported: boolean;
      reason?: string | null;
    };
    chatJsonMode: {
      supported: boolean;
      reason?: string | null;
    };
    imageRouting: {
      default: OpenAIImageRoute;
      withReferences: OpenAIImageRoute;
    };
  };
}

function buildAuthHeaders(apiKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };
}

async function fetchJsonWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = 25000,
): Promise<{ ok: boolean; status: number; data: any; reason?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'REQUEST_FAILED';
    return { ok: false, status: 0, data: null, reason };
  } finally {
    clearTimeout(timer);
  }
}

function parseDataUri(value: string): { mimeType: string; data: string } | null {
  const match = value.match(/data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)/i);
  if (!match) return null;
  const mimeType = match[1] || 'image/png';
  const data = (match[2] || '').replace(/\s+/g, '');
  if (!data) return null;
  return { mimeType, data };
}

function hasUsableImageInImagesPayload(payload: any): {
  ok: boolean;
  kind?: 'b64_json' | 'url' | 'data_uri' | 'unknown';
} {
  const items = Array.isArray(payload?.data) ? payload.data : [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const b64 =
      typeof (item as { b64_json?: unknown }).b64_json === 'string'
        ? (item as { b64_json?: string }).b64_json?.trim() || ''
        : '';
    if (b64) return { ok: true, kind: 'b64_json' };
    const maybeUrl =
      typeof (item as { url?: unknown }).url === 'string'
        ? ((item as { url?: string }).url || '').trim()
        : '';
    if (!maybeUrl) continue;
    if (parseDataUri(maybeUrl)) return { ok: true, kind: 'data_uri' };
    if (maybeUrl.startsWith('http://') || maybeUrl.startsWith('https://')) {
      return { ok: true, kind: 'url' };
    }
  }
  return { ok: false, kind: 'unknown' };
}

function extractMessageContentAsText(content: unknown): string {
  if (typeof content === 'string') return content.trim();
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => {
      if (!part || typeof part !== 'object') return '';
      const text = (part as { text?: unknown }).text;
      return typeof text === 'string' ? text : '';
    })
    .join('\n')
    .trim();
}

function hasUsableImageInChatPayload(payload: any): boolean {
  const content = payload?.choices?.[0]?.message?.content;
  if (Array.isArray(content)) {
    for (const part of content) {
      if (!part || typeof part !== 'object') continue;
      const imageUrl = (part as { image_url?: { url?: unknown } }).image_url?.url;
      if (typeof imageUrl !== 'string' || !imageUrl.trim()) continue;
      if (parseDataUri(imageUrl)) return true;
      if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
        return true;
      }
    }
  }

  const text = extractMessageContentAsText(content);
  if (!text) return false;
  if (/!\[[^\]]*]\((https?:\/\/[^)\s]+)\)/i.test(text)) return true;
  if (/!\[[^\]]*]\((data:image\/[a-zA-Z0-9.+-]+;base64,[^)]+)\)/i.test(text))
    return true;
  if (/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=\s]+/i.test(text))
    return true;
  return false;
}

function parseJsonCandidate(raw: string): any | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) {
      try {
        return JSON.parse(fenced[1].trim());
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function probeOpenAIImagesEndpoint(
  provider: ProviderProbeInput,
): Promise<{ supported: boolean; reason?: string | null; responseKind?: 'b64_json' | 'url' | 'data_uri' | 'unknown' }> {
  const response = await fetchJsonWithTimeout(
    `${provider.baseUrl}/images/generations`,
    {
      method: 'POST',
      headers: buildAuthHeaders(provider.apiKey),
      body: JSON.stringify({
        model: provider.imageModel,
        prompt: 'Generate a simple black square on plain white background.',
        response_format: 'b64_json',
      }),
    },
    60000,
  );

  if (!response.ok) {
    const reason =
      response.reason ||
      response.data?.error?.message ||
      `HTTP ${response.status}`;
    return { supported: false, reason, responseKind: 'unknown' };
  }

  const parsed = hasUsableImageInImagesPayload(response.data);
  if (parsed.ok) {
    return {
      supported: true,
      responseKind: parsed.kind || 'unknown',
      reason: null,
    };
  }

  return {
    supported: false,
    reason: 'OpenAI images endpoint returned no usable image data',
    responseKind: 'unknown',
  };
}

async function probeOpenAIChatImage(
  provider: ProviderProbeInput,
): Promise<{ supported: boolean; reason?: string | null }> {
  const response = await fetchJsonWithTimeout(
    `${provider.baseUrl}/chat/completions`,
    {
      method: 'POST',
      headers: buildAuthHeaders(provider.apiKey),
      body: JSON.stringify({
        model: provider.imageModel,
        stream: false,
        messages: [
          {
            role: 'user',
            content:
              'Generate exactly one image of a simple black square on white background. Return image only.',
          },
        ],
      }),
    },
    60000,
  );

  if (!response.ok) {
    const reason =
      response.reason ||
      response.data?.error?.message ||
      `HTTP ${response.status}`;
    return { supported: false, reason };
  }

  if (hasUsableImageInChatPayload(response.data)) {
    return { supported: true, reason: null };
  }

  return {
    supported: false,
    reason: 'Chat completions returned no usable image payload',
  };
}

async function probeOpenAIChatJsonMode(
  provider: ProviderProbeInput,
): Promise<{ supported: boolean; reason?: string | null }> {
  const response = await fetchJsonWithTimeout(
    `${provider.baseUrl}/chat/completions`,
    {
      method: 'POST',
      headers: buildAuthHeaders(provider.apiKey),
      body: JSON.stringify({
        model: provider.textModel,
        stream: false,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'user',
            content: 'Return JSON only: {"ok":true}',
          },
        ],
      }),
    },
    30000,
  );

  if (!response.ok) {
    const reason =
      response.reason ||
      response.data?.error?.message ||
      `HTTP ${response.status}`;
    return { supported: false, reason };
  }

  const rawContent = extractMessageContentAsText(
    response.data?.choices?.[0]?.message?.content,
  );
  if (!rawContent) {
    return { supported: false, reason: 'empty content' };
  }
  const parsed = parseJsonCandidate(rawContent);
  if (parsed && typeof parsed === 'object') {
    return { supported: true, reason: null };
  }

  return { supported: false, reason: 'content is not valid JSON object' };
}

export function parseProviderCapabilities(raw: unknown): ProviderCapabilities | null {
  if (!raw || typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw) as ProviderCapabilities;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function resolveOpenAIImageRouteFromCapabilities(
  capabilitiesRaw: unknown,
  hasReferences: boolean,
): OpenAIImageRoute {
  const parsed = parseProviderCapabilities(capabilitiesRaw);
  const routing = parsed?.openai?.imageRouting;
  if (routing) {
    return hasReferences ? routing.withReferences : routing.default;
  }
  return 'images';
}

export async function detectProviderCapabilities(
  provider: ProviderProbeInput,
): Promise<ProviderCapabilities> {
  const base: ProviderCapabilities = {
    version: 1,
    detectedAt: new Date().toISOString(),
    format: provider.format,
  };

  if (provider.format !== 'openai') {
    return base;
  }

  const imagesEndpoint = await probeOpenAIImagesEndpoint(provider);
  const chatImage = await probeOpenAIChatImage(provider);
  const chatJsonMode = await probeOpenAIChatJsonMode(provider);

  const defaultRoute: OpenAIImageRoute = imagesEndpoint.supported
    ? 'images'
    : chatImage.supported
      ? 'chat'
      : 'images';
  const withReferences: OpenAIImageRoute = chatImage.supported
    ? 'chat'
    : defaultRoute;

  return {
    ...base,
    openai: {
      imagesEndpoint,
      chatImage,
      chatJsonMode,
      imageRouting: {
        default: defaultRoute,
        withReferences,
      },
    },
  };
}
