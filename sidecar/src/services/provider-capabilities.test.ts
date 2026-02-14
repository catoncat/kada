import { strict as assert } from 'node:assert';
import test from 'node:test';
import {
  parseProviderCapabilities,
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
    version: 1,
    detectedAt: '2026-02-14T00:00:00.000Z',
    format: 'openai',
    openai: {
      imageRouting: {
        default: 'images',
        withReferences: 'chat',
      },
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
    assert.equal(fetchCalled, false);
    assert.equal(result.openai, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
