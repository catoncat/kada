import { strict as assert } from 'node:assert';
import test from 'node:test';
import { optimizePlanScenesPrompts } from './plan-generation';

function createDbStub() {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [],
        }),
      }),
    }),
  };
}

const providerStub = {
  id: 'provider-local',
  format: 'local',
  baseUrl: 'http://localhost:11434/v1',
  apiKey: '',
  textModel: 'qwen3',
  capabilities: null,
};

test('optimizePlanScenesPrompts writes optimized promptMeta when optimizer succeeds', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                renderPrompt: '优化后的分镜提示词',
                assumptions: [],
                conflicts: [],
              }),
            },
          },
        ],
      }),
    }) as Response) as typeof fetch;

  try {
    const result = await optimizePlanScenesPrompts({
      db: createDbStub(),
      provider: providerStub,
      scenes: [
        {
          location: '中景',
          description: '描述',
          shots: '拍摄建议',
          lighting: '灯光',
          visualPrompt: '原始提示词',
        },
      ],
    });

    assert.equal(result.summary.totalScenes, 1);
    assert.equal(result.summary.optimized, 1);
    assert.equal(result.summary.fallback, 0);
    assert.equal(result.scenes[0].visualPrompt, '优化后的分镜提示词');
    assert.equal(result.scenes[0].promptMeta?.status, 'optimized');
    assert.equal(result.scenes[0].promptMeta?.sourcePrompt, '原始提示词');
    assert.equal(result.scenes[0].promptMeta?.optimizedPrompt, '优化后的分镜提示词');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('optimizePlanScenesPrompts falls back per-scene and keeps batch alive', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: 'this is not json',
            },
          },
        ],
      }),
    }) as Response) as typeof fetch;

  try {
    const result = await optimizePlanScenesPrompts({
      db: createDbStub(),
      provider: providerStub,
      scenes: [
        {
          location: '场景1',
          description: '描述1',
          shots: '拍摄建议1',
          lighting: '灯光1',
          visualPrompt: '提示词1',
        },
        {
          location: '场景2',
          description: '描述2',
          shots: '拍摄建议2',
          lighting: '灯光2',
          visualPrompt: '',
        },
      ],
    });

    assert.equal(result.summary.totalScenes, 2);
    assert.equal(result.summary.fallback, 1);
    assert.equal(result.summary.skipped, 1);
    assert.equal(result.summary.failed, 0);
    assert.equal(result.scenes[0].visualPrompt, '提示词1');
    assert.equal(result.scenes[0].promptMeta?.status, 'fallback');
    assert.equal(result.scenes[1].promptMeta?.status, 'skipped');
    assert.equal(result.scenes[1].promptMeta?.reason, 'EMPTY_VISUAL_PROMPT');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

