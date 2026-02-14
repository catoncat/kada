interface ProviderProbeInput {
  format: string;
  baseUrl: string;
  apiKey: string;
  textModel: string;
  imageModel: string;
}

export type OpenAIImageRoute = 'images' | 'chat';
export type ProviderRoutingProfile =
  | 'native'
  | 'openai_compat_chat_only'
  | 'openai_compat_full';
export type ProviderProbeStatus = 'supported' | 'unsupported' | 'unknown';

interface ProviderProbeEvidenceItem {
  status: ProviderProbeStatus;
  reason?: string | null;
  endpoint?: string | null;
  http_status?: number | null;
}

interface ProbeResult {
  supported: boolean;
  reason?: string | null;
  status?: number;
}

interface ProbeImageResult extends ProbeResult {
  responseKind?: 'b64_json' | 'url' | 'data_uri' | 'unknown';
}

export interface ProviderCapabilities {
  version: 2;
  format: string;
  routing_profile: ProviderRoutingProfile;
  detected_at: string;
  ttl_hours: number;
  probe_evidence: {
    chat_text: ProviderProbeEvidenceItem;
    image_text2image: ProviderProbeEvidenceItem;
    image_with_references: ProviderProbeEvidenceItem;
  };
  // 为兼容现有调用方保留 openai 结构
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

const CAPABILITY_TTL_HOURS = 24;
const ONE_PIXEL_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5s4f8AAAAASUVORK5CYII=';

function buildAuthHeaders(apiKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };
}

function unknownEvidence(reason: string): ProviderProbeEvidenceItem {
  return {
    status: 'unknown',
    reason,
    endpoint: null,
    http_status: null,
  };
}

function toProbeEvidence(
  probe: ProbeResult,
  endpoint: string,
): ProviderProbeEvidenceItem {
  return {
    status: probe.supported ? 'supported' : 'unsupported',
    reason: probe.reason || null,
    endpoint,
    http_status:
      typeof probe.status === 'number' && Number.isFinite(probe.status)
        ? probe.status
        : null,
  };
}

function boolFromEvidence(
  evidence: ProviderProbeEvidenceItem | undefined,
): boolean {
  return evidence?.status === 'supported';
}

function resolveProfile(params: {
  format: string;
  chatText: ProviderProbeEvidenceItem;
  imageText2Image: ProviderProbeEvidenceItem;
}): ProviderRoutingProfile {
  if (params.format !== 'openai') return 'native';
  if (
    params.chatText.status === 'supported' &&
    params.imageText2Image.status === 'supported'
  ) {
    return 'openai_compat_full';
  }
  if (params.chatText.status === 'supported') {
    return 'openai_compat_chat_only';
  }
  return 'native';
}

function resolveRoutingFromEvidence(params: {
  profile: ProviderRoutingProfile;
  imageText2Image: ProviderProbeEvidenceItem;
  imageWithReferences: ProviderProbeEvidenceItem;
}): { defaultRoute: OpenAIImageRoute; withReferencesRoute: OpenAIImageRoute } {
  if (params.profile === 'openai_compat_chat_only') {
    return { defaultRoute: 'chat', withReferencesRoute: 'chat' };
  }

  const defaultRoute: OpenAIImageRoute =
    params.imageText2Image.status === 'supported' ? 'images' : 'chat';
  const withReferencesRoute: OpenAIImageRoute =
    params.imageWithReferences.status === 'supported' ? 'chat' : defaultRoute;

  return { defaultRoute, withReferencesRoute };
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
  const match = value.match(
    /data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)/i,
  );
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

async function probeOpenAIChatText(provider: ProviderProbeInput): Promise<ProbeResult> {
  const endpoint = `${provider.baseUrl}/chat/completions`;
  const response = await fetchJsonWithTimeout(
    endpoint,
    {
      method: 'POST',
      headers: buildAuthHeaders(provider.apiKey),
      body: JSON.stringify({
        model: provider.textModel,
        stream: false,
        messages: [{ role: 'user', content: 'Reply with "ok".' }],
      }),
    },
    30000,
  );

  if (!response.ok) {
    const reason =
      response.reason ||
      response.data?.error?.message ||
      `HTTP ${response.status}`;
    return { supported: false, reason, status: response.status };
  }

  const rawContent = extractMessageContentAsText(
    response.data?.choices?.[0]?.message?.content,
  );
  if (!rawContent) {
    return { supported: false, reason: 'empty content', status: response.status };
  }
  return { supported: true, reason: null, status: response.status };
}

async function probeOpenAIImagesEndpoint(
  provider: ProviderProbeInput,
): Promise<ProbeImageResult> {
  const endpoint = `${provider.baseUrl}/images/generations`;
  const response = await fetchJsonWithTimeout(
    endpoint,
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
    return {
      supported: false,
      reason,
      responseKind: 'unknown',
      status: response.status,
    };
  }

  const parsed = hasUsableImageInImagesPayload(response.data);
  if (parsed.ok) {
    return {
      supported: true,
      responseKind: parsed.kind || 'unknown',
      reason: null,
      status: response.status,
    };
  }

  return {
    supported: false,
    reason: 'OpenAI images endpoint returned no usable image data',
    responseKind: 'unknown',
    status: response.status,
  };
}

async function probeOpenAIImageWithReferences(
  provider: ProviderProbeInput,
): Promise<ProbeResult> {
  const endpoint = `${provider.baseUrl}/chat/completions`;
  const response = await fetchJsonWithTimeout(
    endpoint,
    {
      method: 'POST',
      headers: buildAuthHeaders(provider.apiKey),
      body: JSON.stringify({
        model: provider.imageModel,
        stream: false,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Use the reference image and generate one new image only.',
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/png;base64,${ONE_PIXEL_PNG_BASE64}`,
                },
              },
            ],
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
    return { supported: false, reason, status: response.status };
  }

  if (hasUsableImageInChatPayload(response.data)) {
    return { supported: true, reason: null, status: response.status };
  }

  return {
    supported: false,
    reason: 'Chat completions returned no usable image payload',
    status: response.status,
  };
}

function buildLegacyOpenAIShape(params: {
  imageText2Image: ProbeImageResult;
  imageWithReferences: ProbeResult;
  chatText: ProbeResult;
  defaultRoute: OpenAIImageRoute;
  withReferencesRoute: OpenAIImageRoute;
}): NonNullable<ProviderCapabilities['openai']> {
  return {
    imagesEndpoint: {
      supported: params.imageText2Image.supported,
      reason: params.imageText2Image.reason || null,
      responseKind: params.imageText2Image.responseKind || 'unknown',
    },
    chatImage: {
      supported: params.imageWithReferences.supported,
      reason: params.imageWithReferences.reason || null,
    },
    chatJsonMode: {
      supported: params.chatText.supported,
      reason: params.chatText.reason || null,
    },
    imageRouting: {
      default: params.defaultRoute,
      withReferences: params.withReferencesRoute,
    },
  };
}

function fromLegacyV1(parsed: Record<string, unknown>): ProviderCapabilities {
  const format = typeof parsed.format === 'string' ? parsed.format : 'openai';
  const openai = parsed.openai as
    | {
        imagesEndpoint?: { supported?: boolean; reason?: string | null; responseKind?: ProbeImageResult['responseKind'] };
        chatImage?: { supported?: boolean; reason?: string | null };
        chatJsonMode?: { supported?: boolean; reason?: string | null };
        imageRouting?: { default?: OpenAIImageRoute; withReferences?: OpenAIImageRoute };
      }
    | undefined;

  const chatTextEvidence: ProviderProbeEvidenceItem = {
    status:
      typeof openai?.chatJsonMode?.supported === 'boolean'
        ? openai.chatJsonMode.supported
          ? 'supported'
          : 'unsupported'
        : 'unknown',
    reason: openai?.chatJsonMode?.reason || null,
    endpoint: '/chat/completions',
    http_status: null,
  };
  const imageText2ImageEvidence: ProviderProbeEvidenceItem = {
    status:
      typeof openai?.imagesEndpoint?.supported === 'boolean'
        ? openai.imagesEndpoint.supported
          ? 'supported'
          : 'unsupported'
        : 'unknown',
    reason: openai?.imagesEndpoint?.reason || null,
    endpoint: '/images/generations',
    http_status: null,
  };
  const imageWithReferencesEvidence: ProviderProbeEvidenceItem = {
    status:
      typeof openai?.chatImage?.supported === 'boolean'
        ? openai.chatImage.supported
          ? 'supported'
          : 'unsupported'
        : 'unknown',
    reason: openai?.chatImage?.reason || null,
    endpoint: '/chat/completions',
    http_status: null,
  };

  const profile = resolveProfile({
    format,
    chatText: chatTextEvidence,
    imageText2Image: imageText2ImageEvidence,
  });
  const routes = resolveRoutingFromEvidence({
    profile,
    imageText2Image: imageText2ImageEvidence,
    imageWithReferences: imageWithReferencesEvidence,
  });

  return {
    version: 2,
    format,
    routing_profile: profile,
    detected_at:
      typeof parsed.detectedAt === 'string'
        ? parsed.detectedAt
        : new Date().toISOString(),
    ttl_hours: CAPABILITY_TTL_HOURS,
    probe_evidence: {
      chat_text: chatTextEvidence,
      image_text2image: imageText2ImageEvidence,
      image_with_references: imageWithReferencesEvidence,
    },
    openai: {
      imagesEndpoint: {
        supported: boolFromEvidence(imageText2ImageEvidence),
        reason: imageText2ImageEvidence.reason || null,
        responseKind: openai?.imagesEndpoint?.responseKind || 'unknown',
      },
      chatImage: {
        supported: boolFromEvidence(imageWithReferencesEvidence),
        reason: imageWithReferencesEvidence.reason || null,
      },
      chatJsonMode: {
        supported: boolFromEvidence(chatTextEvidence),
        reason: chatTextEvidence.reason || null,
      },
      imageRouting: {
        default: openai?.imageRouting?.default || routes.defaultRoute,
        withReferences:
          openai?.imageRouting?.withReferences || routes.withReferencesRoute,
      },
    },
  };
}

export function parseProviderCapabilities(raw: unknown): ProviderCapabilities | null {
  if (!raw || typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return null;

    if (parsed.version === 2) {
      const format = typeof parsed.format === 'string' ? parsed.format : 'openai';
      const probeEvidence = parsed.probe_evidence as
        | ProviderCapabilities['probe_evidence']
        | undefined;
      if (!probeEvidence) return null;

      const profile =
        parsed.routing_profile === 'openai_compat_chat_only' ||
        parsed.routing_profile === 'openai_compat_full' ||
        parsed.routing_profile === 'native'
          ? parsed.routing_profile
          : resolveProfile({
              format,
              chatText: probeEvidence.chat_text,
              imageText2Image: probeEvidence.image_text2image,
            });

      const routes = resolveRoutingFromEvidence({
        profile,
        imageText2Image: probeEvidence.image_text2image,
        imageWithReferences: probeEvidence.image_with_references,
      });

      return {
        version: 2,
        format,
        routing_profile: profile,
        detected_at:
          typeof parsed.detected_at === 'string'
            ? parsed.detected_at
            : new Date().toISOString(),
        ttl_hours:
          typeof parsed.ttl_hours === 'number' && parsed.ttl_hours > 0
            ? parsed.ttl_hours
            : CAPABILITY_TTL_HOURS,
        probe_evidence: probeEvidence,
        openai:
          parsed.openai && typeof parsed.openai === 'object'
            ? (parsed.openai as ProviderCapabilities['openai'])
            : {
                imagesEndpoint: {
                  supported: boolFromEvidence(probeEvidence.image_text2image),
                  reason: probeEvidence.image_text2image.reason || null,
                  responseKind: 'unknown',
                },
                chatImage: {
                  supported: boolFromEvidence(probeEvidence.image_with_references),
                  reason: probeEvidence.image_with_references.reason || null,
                },
                chatJsonMode: {
                  supported: boolFromEvidence(probeEvidence.chat_text),
                  reason: probeEvidence.chat_text.reason || null,
                },
                imageRouting: {
                  default: routes.defaultRoute,
                  withReferences: routes.withReferencesRoute,
                },
              },
      };
    }

    if (parsed.version === 1) {
      return fromLegacyV1(parsed);
    }

    return null;
  } catch {
    return null;
  }
}

export function resolveReferenceImageSupportFromCapabilities(
  capabilitiesRaw: unknown,
): ProviderProbeStatus {
  const parsed = parseProviderCapabilities(capabilitiesRaw);
  if (!parsed) return 'unknown';
  return parsed.probe_evidence.image_with_references.status;
}

export function resolveOpenAIImageRouteFromCapabilities(
  capabilitiesRaw: unknown,
  hasReferences: boolean,
): OpenAIImageRoute {
  const parsed = parseProviderCapabilities(capabilitiesRaw);
  if (!parsed) return 'images';

  if (parsed.routing_profile === 'openai_compat_chat_only') {
    return 'chat';
  }

  const imageText2Image = parsed.probe_evidence.image_text2image.status;
  const imageWithReferences = parsed.probe_evidence.image_with_references.status;

  if (hasReferences) {
    if (imageWithReferences === 'supported') return 'chat';
    if (imageText2Image === 'supported') return 'images';
    return parsed.openai?.imageRouting?.withReferences || 'images';
  }

  if (imageText2Image === 'supported') return 'images';
  if (imageWithReferences === 'supported') return 'chat';
  return parsed.openai?.imageRouting?.default || 'images';
}

export async function detectProviderCapabilities(
  provider: ProviderProbeInput,
): Promise<ProviderCapabilities> {
  const defaultEvidence = {
    chat_text: unknownEvidence('probe skipped: non-openai provider'),
    image_text2image: unknownEvidence('probe skipped: non-openai provider'),
    image_with_references: unknownEvidence(
      'probe skipped: non-openai provider',
    ),
  };

  if (provider.format !== 'openai') {
    return {
      version: 2,
      format: provider.format,
      routing_profile: 'native',
      detected_at: new Date().toISOString(),
      ttl_hours: CAPABILITY_TTL_HOURS,
      probe_evidence: defaultEvidence,
    };
  }

  const chatText = await probeOpenAIChatText(provider);
  const imageText2Image = await probeOpenAIImagesEndpoint(provider);
  const imageWithReferences = await probeOpenAIImageWithReferences(provider);

  const chatTextEvidence = toProbeEvidence(chatText, '/chat/completions');
  const imageText2ImageEvidence = toProbeEvidence(
    imageText2Image,
    '/images/generations',
  );
  const imageWithReferencesEvidence = toProbeEvidence(
    imageWithReferences,
    '/chat/completions',
  );

  const profile = resolveProfile({
    format: provider.format,
    chatText: chatTextEvidence,
    imageText2Image: imageText2ImageEvidence,
  });
  const routes = resolveRoutingFromEvidence({
    profile,
    imageText2Image: imageText2ImageEvidence,
    imageWithReferences: imageWithReferencesEvidence,
  });

  return {
    version: 2,
    format: provider.format,
    routing_profile: profile,
    detected_at: new Date().toISOString(),
    ttl_hours: CAPABILITY_TTL_HOURS,
    probe_evidence: {
      chat_text: chatTextEvidence,
      image_text2image: imageText2ImageEvidence,
      image_with_references: imageWithReferencesEvidence,
    },
    openai: buildLegacyOpenAIShape({
      imageText2Image,
      imageWithReferences,
      chatText,
      defaultRoute: routes.defaultRoute,
      withReferencesRoute: routes.withReferencesRoute,
    }),
  };
}
