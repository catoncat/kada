import { strict as assert } from 'node:assert';
import test from 'node:test';
import {
  parseProviderCapabilities,
  resolveReferenceImageSupportFromCapabilities,
  resolveOpenAIImageRouteFromCapabilities,
  detectProviderCapabilities,
} from './provider-capabilities';

test('parseProviderCapabilities returns null for invalid payload', () => {
  assert.equal(parseProviderCapabilities(null), null);
  assert.equal(parseProviderCapabilities(''), null);
  assert.equal(parseProviderCapabilities('{invalid json'), null);
});

test('resolveOpenAIImageRouteFromCapabilities respects persisted routing', () => {
  const capabilities = JSON.stringify({
    version: 2,
    detected_at: '2026-02-14T00:00:00.000Z',
    ttl_hours: 24,
    format: 'openai',
    routing_profile: 'openai_compat_full',
    probe_evidence: {
      chat_text: { status: 'supported' },
      image_text2image: { status: 'supported' },
      image_with_references: { status: 'supported' },
    },
  });

  assert.equal(
    resolveOpenAIImageRouteFromCapabilities(capabilities, false),
    'images',
  );
  assert.equal(
    resolveOpenAIImageRouteFromCapabilities(capabilities, true),
    'chat',
  );
  assert.equal(
    resolveReferenceImageSupportFromCapabilities(capabilities),
    'supported',
  );
});

test('parseProviderCapabilities upgrades legacy v1 payload', () => {
  const legacy = JSON.stringify({
    version: 1,
    detectedAt: '2026-02-14T00:00:00.000Z',
    format: 'openai',
    openai: {
      imagesEndpoint: { supported: true, reason: null },
      chatImage: { supported: false, reason: 'unsupported' },
      chatJsonMode: { supported: true, reason: null },
      imageRouting: {
        default: 'images',
        withReferences: 'images',
      },
    },
  });

  const parsed = parseProviderCapabilities(legacy);
  assert.ok(parsed);
  assert.equal(parsed?.version, 2);
  assert.equal(parsed?.probe_evidence.image_text2image.status, 'supported');
  assert.equal(
    parsed?.probe_evidence.image_with_references.status,
    'unsupported',
  );
});

test('resolveOpenAIImageRouteFromCapabilities forces chat in chat-only profile', () => {
  const capabilities = JSON.stringify({
    version: 2,
    detected_at: '2026-02-14T00:00:00.000Z',
    ttl_hours: 24,
    format: 'openai',
    routing_profile: 'openai_compat_chat_only',
    probe_evidence: {
      chat_text: { status: 'supported' },
      image_text2image: { status: 'unsupported' },
      image_with_references: { status: 'supported' },
    },
  });

  assert.equal(
    resolveOpenAIImageRouteFromCapabilities(capabilities, false),
    'chat',
  );
  assert.equal(
    resolveOpenAIImageRouteFromCapabilities(capabilities, true),
    'chat',
  );
});

test('resolveOpenAIImageRouteFromCapabilities falls back to images when missing', () => {
  assert.equal(resolveOpenAIImageRouteFromCapabilities(null, true), 'images');
  assert.equal(resolveOpenAIImageRouteFromCapabilities('{}', false), 'images');
});

test('detectProviderCapabilities returns base shape for non-openai providers', async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = (async () => {
    fetchCalled = true;
    throw new Error('should not be called');
  }) as typeof fetch;

  try {
    const result = await detectProviderCapabilities({
      format: 'gemini',
      baseUrl: 'https://example.com',
      apiKey: 'k',
      textModel: 'gemini-2.5-flash',
      imageModel: 'gemini-2.5-flash-image',
    });
    assert.equal(result.format, 'gemini');
    assert.equal(result.version, 2);
    assert.equal(result.routing_profile, 'native');
    assert.equal(result.ttl_hours, 24);
    assert.equal(result.probe_evidence.chat_text.status, 'unknown');
    assert.equal(fetchCalled, false);
    assert.equal(result.openai, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
