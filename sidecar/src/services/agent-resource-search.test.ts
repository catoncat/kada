import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { eq } from 'drizzle-orm';
import { getDb, initDatabase } from '../db';
import { modelAssets } from '../db/schema';
import {
  buildAgentMentionsContextBlock,
  resolveAgentMentionsForRuntime,
} from './agent-resource-search';

let dbReady = false;

async function ensureDb() {
  if (dbReady) return;
  await initDatabase();
  dbReady = true;
}

test('resolveAgentMentionsForRuntime degrades missing resources to dropped mentions', async () => {
  await ensureDb();

  const result = await resolveAgentMentionsForRuntime([
    {
      mentionId: 'mnt_missing_scene',
      kind: 'scene',
      resourceId: 'scene_not_exists',
      resourceTitle: 'missing scene',
      images: [],
    },
  ]);

  assert.equal(result.mentions.length, 0);
  assert.equal(result.dropped.length, 1);
  assert.match(result.dropped[0]?.reason || '', /^resource_not_found:scene:/);
});

test('resolveAgentMentionsForRuntime keeps valid images and drops invalid ones', async () => {
  await ensureDb();
  const db = getDb();

  const modelId = `model_${randomUUID()}`;
  const now = new Date();

  await db.insert(modelAssets).values({
    id: modelId,
    name: 'Mention Test Model',
    gender: 'female',
    ageRangeMin: 20,
    ageRangeMax: 30,
    appearancePrompt: '测试模特',
    primaryImage: '/uploads/mention-model-primary.jpg',
    referenceImages: JSON.stringify([
      '/uploads/mention-model-ref-a.jpg',
      '/uploads/mention-model-ref-b.jpg',
    ]),
    createdAt: now,
    updatedAt: now,
  });

  try {
    const result = await resolveAgentMentionsForRuntime([
      {
        mentionId: 'mnt_model_1',
        kind: 'model',
        resourceId: modelId,
        resourceTitle: 'Mention Test Model',
        images: [
          {
            id: 'custom-ref-a',
            resourceId: 'custom-ref-a',
            filePath: '/uploads/mention-model-ref-a.jpg',
          },
          {
            id: 'custom-invalid',
            resourceId: 'custom-invalid',
            filePath: '/uploads/mention-model-ref-missing.jpg',
          },
        ],
      },
    ]);

    assert.equal(result.mentions.length, 1);
    assert.equal(result.mentions[0]?.kind, 'model');
    assert.equal(result.mentions[0]?.resourceId, modelId);
    assert.equal(result.mentions[0]?.images.length, 1);
    assert.equal(
      result.mentions[0]?.images[0]?.filePath,
      '/uploads/mention-model-ref-a.jpg',
    );
    assert.equal(result.dropped.length, 1);
    assert.match(result.dropped[0]?.reason || '', /^image_not_found:/);
  } finally {
    await db.delete(modelAssets).where(eq(modelAssets.id, modelId));
  }
});

test('buildAgentMentionsContextBlock returns JSON block for runtime text injection', () => {
  const block = buildAgentMentionsContextBlock([
    {
      mentionId: 'mnt_1',
      kind: 'project',
      resourceId: 'project_1',
      resourceTitle: '项目A',
      images: [
        {
          id: 'img_1',
          kind: 'image',
          resourceId: 'img_1',
          filePath: '/uploads/project-a-1.jpg',
          label: '主图',
        },
      ],
    },
  ]);

  assert.match(block, /^\[MENTIONS_CONTEXT\]/);
  assert.match(block, /"resourceId": "project_1"/);
  assert.match(block, /\/uploads\/project-a-1\.jpg/);
  assert.match(block, /\[\/MENTIONS_CONTEXT\]$/);
});

