import { strict as assert } from 'node:assert';
import test from 'node:test';
import { optimizeImagePrompt } from './prompt-optimizer';

function createDbStub(options?: {
  providerRows?: Array<Record<string, unknown>>;
  settingRows?: Array<Record<string, unknown>>;
}) {
  const providerRows = options?.providerRows ?? [];
  const settingRows = options?.settingRows ?? [];
  let callCount = 0;

  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            callCount += 1;
            // provider 查询一般在前，setting 查询通常在后
            if (providerRows.length > 0 && callCount === 1) {
              return providerRows;
            }
            return settingRows;
          },
        }),
      }),
    }),
  };
}

test('optimizeImagePrompt returns optimized prompt when model returns valid json', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                renderPrompt: '最终执行提示词',
                assumptions: ['保持人物年龄不变'],
                conflicts: [],
              }),
            },
          },
        ],
      }),
    }) as Response) as typeof fetch;

  try {
    const result = await optimizeImagePrompt({
      db: createDbStub(),
      provider: {
        id: 'provider-local',
        format: 'local',
        baseUrl: 'http://localhost:11434/v1',
        apiKey: '',
        textModel: 'qwen3',
      },
      draftPrompt: '草稿提示词',
      effectivePrompt: '拼接后的提示词',
    });

    assert.equal(result.renderPrompt, '最终执行提示词');
    assert.equal(result.meta.status, 'optimized');
    assert.deepEqual(result.meta.assumptions, ['保持人物年龄不变']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('optimizeImagePrompt falls back when model output is not parseable', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: '这是一段非 JSON 文本',
            },
          },
        ],
      }),
    }) as Response) as typeof fetch;

  try {
    const result = await optimizeImagePrompt({
      db: createDbStub(),
      provider: {
        id: 'provider-local',
        format: 'local',
        baseUrl: 'http://localhost:11434/v1',
        apiKey: '',
        textModel: 'qwen3',
      },
      draftPrompt: '草稿提示词',
      effectivePrompt: '拼接后的提示词',
    });

    assert.equal(result.renderPrompt, '拼接后的提示词');
    assert.equal(result.meta.status, 'fallback');
    assert.equal(result.meta.reason, 'OPTIMIZER_OUTPUT_PARSE_FAILED');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('optimizeImagePrompt skips when no text-capable provider', async () => {
  const result = await optimizeImagePrompt({
    db: createDbStub({ providerRows: [] }),
    providerId: 'missing-provider',
    draftPrompt: '草稿提示词',
    effectivePrompt: '拼接后的提示词',
  });

  assert.equal(result.renderPrompt, '拼接后的提示词');
  assert.equal(result.meta.status, 'skipped');
});
