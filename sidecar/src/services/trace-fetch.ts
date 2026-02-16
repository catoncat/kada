import { providers } from '../db/schema';
import { getDb } from '../db';
import { getAgentTraceFlags } from '../config/agent-trace-flags';
import { getAgentTraceContext } from './agent-trace-context';
import { appendTraceLog, appendTraceWire } from './agent-trace-store';

const TRACKED_HOST_REFRESH_MS = 30_000;
const SENSITIVE_QUERY_KEY = /(?:api[_-]?key|token|password|secret|authorization)/i;

let installed = false;
let lastHostRefreshAt = 0;
let cachedProviderHosts = new Set<string>();

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function normalizeHost(value: string): string {
  return value.trim().toLowerCase();
}

function sanitizeUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    const params = new URLSearchParams(url.search);
    for (const key of params.keys()) {
      if (SENSITIVE_QUERY_KEY.test(key)) {
        params.set(key, '[REDACTED]');
      }
    }
    url.search = params.toString();
    return url.toString();
  } catch {
    return rawUrl;
  }
}

function sanitizeHeaders(headers: Headers): Record<string, string> {
  const picked: Record<string, string> = {};
  headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower === 'authorization' || lower === 'cookie' || lower === 'set-cookie') {
      picked[lower] = '[REDACTED]';
      return;
    }

    if (
      lower === 'content-type' ||
      lower === 'accept' ||
      lower === 'user-agent' ||
      lower.startsWith('x-request-') ||
      lower.startsWith('x-ratelimit')
    ) {
      picked[lower] = value;
    }
  });
  return picked;
}

async function refreshProviderHosts(force = false): Promise<void> {
  const now = Date.now();
  if (!force && now - lastHostRefreshAt < TRACKED_HOST_REFRESH_MS) {
    return;
  }
  lastHostRefreshAt = now;

  const flags = getAgentTraceFlags();
  const hosts = new Set<string>();

  for (const host of flags.providerHosts) {
    const normalized = normalizeHost(host);
    if (normalized) hosts.add(normalized);
  }

  try {
    const db = getDb();
    const rows = await db.select({ baseUrl: providers.baseUrl }).from(providers);
    for (const row of rows) {
      if (!row.baseUrl) continue;
      try {
        const parsed = new URL(row.baseUrl);
        const host = normalizeHost(parsed.host);
        const hostname = normalizeHost(parsed.hostname);
        if (host) hosts.add(host);
        if (hostname) hosts.add(hostname);
      } catch {
        // ignore malformed provider base url
      }
    }
  } catch {
    // ignore db refresh failures, keep cached set
  }

  cachedProviderHosts = hosts;
}

async function isTrackedProviderUrl(rawUrl: string): Promise<boolean> {
  await refreshProviderHosts();

  if (cachedProviderHosts.size === 0) {
    return false;
  }

  try {
    const url = new URL(rawUrl);
    const host = normalizeHost(url.host);
    const hostname = normalizeHost(url.hostname);
    return cachedProviderHosts.has(host) || cachedProviderHosts.has(hostname);
  } catch {
    return false;
  }
}

async function captureWireFromResponse(input: {
  traceId: string;
  requestId: string | null;
  sessionId: string | null;
  turnId: string | null;
  clientMessageId: string | null;
  url: string;
  method: string;
  response: Response;
  startedAt: number;
}): Promise<void> {
  const { response } = input;
  if (!response.body) {
    await appendTraceLog({
      traceId: input.traceId,
      requestId: input.requestId,
      sessionId: input.sessionId,
      turnId: input.turnId,
      clientMessageId: input.clientMessageId,
      channel: 'provider',
      event: 'provider.response_done',
      data: {
        url: sanitizeUrl(input.url),
        method: input.method,
        status: response.status,
        durationMs: Date.now() - input.startedAt,
        streamSampled: false,
      },
    });
    return;
  }

  const flags = getAgentTraceFlags();
  const maxSampleBytes = Math.min(flags.wireMaxFileBytes, 96 * 1024);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let chunkCount = 0;
  let sampleCount = 0;
  let done = false;

  while (!done) {
    const result = await reader.read();
    done = result.done;
    if (!result.value) continue;

    chunkCount += 1;
    bytes += result.value.byteLength;

    const text = decoder.decode(result.value, { stream: !done });
    if (text && sampleCount < 6) {
      sampleCount += 1;
      await appendTraceLog({
        traceId: input.traceId,
        requestId: input.requestId,
        sessionId: input.sessionId,
        turnId: input.turnId,
        clientMessageId: input.clientMessageId,
        channel: 'provider',
        event: 'provider.stream.chunk_sample',
        data: {
          url: sanitizeUrl(input.url),
          method: input.method,
          chunkIndex: chunkCount,
          chunkBytes: result.value.byteLength,
          preview: text.slice(0, 512),
        },
      });

      await appendTraceWire({
        traceId: input.traceId,
        event: 'provider.stream.chunk_sample',
        data: {
          url: sanitizeUrl(input.url),
          method: input.method,
          chunkIndex: chunkCount,
          chunkBytes: result.value.byteLength,
          preview: text.slice(0, 512),
        },
      });
    }

    if (bytes >= maxSampleBytes) {
      break;
    }
  }

  await appendTraceLog({
    traceId: input.traceId,
    requestId: input.requestId,
    sessionId: input.sessionId,
    turnId: input.turnId,
    clientMessageId: input.clientMessageId,
    channel: 'provider',
    event: 'provider.response_done',
    data: {
      url: sanitizeUrl(input.url),
      method: input.method,
      status: response.status,
      durationMs: Date.now() - input.startedAt,
      streamSampled: true,
      sampledChunks: chunkCount,
      sampledBytes: bytes,
    },
  });

  await appendTraceWire({
    traceId: input.traceId,
    event: 'provider.response_done',
    data: {
      url: sanitizeUrl(input.url),
      method: input.method,
      status: response.status,
      durationMs: Date.now() - input.startedAt,
      sampledChunks: chunkCount,
      sampledBytes: bytes,
    },
  });
}

export function installTraceFetchWrapper(): void {
  if (installed) return;

  const originalFetch = globalThis.fetch.bind(globalThis);

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const flags = getAgentTraceFlags();
    if (!flags.enabled) {
      return originalFetch(input, init);
    }

    const context = getAgentTraceContext();
    if (!context?.traceId) {
      return originalFetch(input, init);
    }

    const requestLike = input instanceof Request ? input : null;
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : requestLike?.url || '';
    const method = init?.method || requestLike?.method || 'GET';
    const requestHeaders = new Headers(init?.headers || requestLike?.headers);
    const startedAt = Date.now();

    const tracked = await isTrackedProviderUrl(url);
    if (!tracked) {
      return originalFetch(input, init);
    }

    const traceMeta = {
      traceId: context.traceId,
      requestId: context.requestId,
      sessionId: context.sessionId || null,
      turnId: context.turnId || null,
      clientMessageId: context.clientMessageId || null,
    };

    await appendTraceLog({
      ...traceMeta,
      channel: 'provider',
      event: 'provider.request',
      data: {
        method,
        url: sanitizeUrl(url),
        headers: sanitizeHeaders(requestHeaders),
      },
    });

    await appendTraceWire({
      traceId: traceMeta.traceId,
      event: 'provider.request',
      data: {
        requestId: traceMeta.requestId,
        sessionId: traceMeta.sessionId,
        turnId: traceMeta.turnId,
        clientMessageId: traceMeta.clientMessageId,
        method,
        url: sanitizeUrl(url),
        headers: sanitizeHeaders(requestHeaders),
      },
    });

    try {
      const response = await originalFetch(input, init);

      await appendTraceLog({
        ...traceMeta,
        channel: 'provider',
        event: 'provider.response_headers',
        data: {
          method,
          url: sanitizeUrl(url),
          status: response.status,
          statusText: response.statusText,
          durationMs: Date.now() - startedAt,
          headers: sanitizeHeaders(response.headers),
        },
      });

      await appendTraceWire({
        traceId: traceMeta.traceId,
        event: 'provider.response_headers',
        data: {
          method,
          url: sanitizeUrl(url),
          status: response.status,
          statusText: response.statusText,
          durationMs: Date.now() - startedAt,
          headers: sanitizeHeaders(response.headers),
        },
      });

      if (flags.wireEnabled || flags.level === 'wire') {
        const cloned = response.clone();
        void captureWireFromResponse({
          traceId: traceMeta.traceId,
          requestId: traceMeta.requestId,
          sessionId: traceMeta.sessionId,
          turnId: traceMeta.turnId,
          clientMessageId: traceMeta.clientMessageId,
          url,
          method,
          response: cloned,
          startedAt,
        }).catch(async (error) => {
          await appendTraceLog({
            ...traceMeta,
            channel: 'provider',
            event: 'provider.response_error',
            level: 'warn',
            ok: false,
            data: {
              method,
              url: sanitizeUrl(url),
              message: normalizeErrorMessage(error),
              phase: 'wire-capture',
            },
          });
        });
      } else {
        await appendTraceLog({
          ...traceMeta,
          channel: 'provider',
          event: 'provider.response_done',
          data: {
            method,
            url: sanitizeUrl(url),
            status: response.status,
            durationMs: Date.now() - startedAt,
          },
        });
      }

      return response;
    } catch (error) {
      await appendTraceLog({
        ...traceMeta,
        channel: 'provider',
        event: 'provider.response_error',
        level: 'error',
        ok: false,
        data: {
          method,
          url: sanitizeUrl(url),
          message: normalizeErrorMessage(error),
          durationMs: Date.now() - startedAt,
        },
      });
      throw error;
    }
  }) as typeof globalThis.fetch;

  installed = true;
}
