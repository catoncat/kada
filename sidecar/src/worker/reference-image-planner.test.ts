import { strict as assert } from 'node:assert';
import test from 'node:test';
import {
  buildPreviewReferenceInputs,
  buildReferencePlanSummary,
  resolveReferenceImages,
} from './reference-image-planner';

function createDbStub(rows: Array<{ filePath: string | null }>) {
  return {
    select: () => ({
      from: () => ({
        where: async () => rows,
      }),
    }),
  };
}

test('resolveReferenceImages splits identity and scene with dedupe/limit', async () => {
  const db = createDbStub([]);
  const result = await resolveReferenceImages({
    db,
    modelReferenceImages: ['/uploads/model-a.jpg', 'uploads/model-b.jpg', 'https://img/model-c.jpg'],
    inputReferenceImages: [
      'uploads/model-a.jpg',
      '/uploads/scene-1.jpg',
      'uploads/scene-2.jpg',
      '/uploads/scene-3.jpg',
      '/uploads/scene-4.jpg',
      '/uploads/scene-5.jpg',
    ],
  });

  assert.deepEqual(result.modelIdentityImages, [
    '/uploads/model-a.jpg',
    '/uploads/model-b.jpg',
    'https://img/model-c.jpg',
  ]);
  assert.deepEqual(result.sceneContextImages, [
    '/uploads/scene-1.jpg',
    '/uploads/scene-2.jpg',
    '/uploads/scene-3.jpg',
    '/uploads/scene-4.jpg',
  ]);
  assert.equal(result.allImages.length, 7);
  assert.deepEqual(result.allImages, [
    '/uploads/scene-1.jpg',
    '/uploads/scene-2.jpg',
    '/uploads/scene-3.jpg',
    '/uploads/scene-4.jpg',
    '/uploads/model-a.jpg',
    '/uploads/model-b.jpg',
    'https://img/model-c.jpg',
  ]);
});

test('resolveReferenceImages keeps at least one identity image per subject when possible', async () => {
  const db = createDbStub([]);
  const result = await resolveReferenceImages({
    db,
    modelReferenceImages: [
      '/uploads/dad-1.jpg',
      '/uploads/mom-1.jpg',
      '/uploads/mom-2.jpg',
      '/uploads/mom-3.jpg',
      '/uploads/baby-1.jpg',
      '/uploads/baby-2.jpg',
      '/uploads/baby-3.jpg',
    ],
    modelReferenceSubjects: [
      {
        subjectId: 'dad',
        role: '爸爸',
        modelId: 'model-dad',
        images: ['/uploads/dad-1.jpg'],
      },
      {
        subjectId: 'mom',
        role: '妈妈',
        modelId: 'model-mom',
        images: ['/uploads/mom-1.jpg', '/uploads/mom-2.jpg', '/uploads/mom-3.jpg'],
      },
      {
        subjectId: 'baby',
        role: '宝宝',
        modelId: 'model-baby',
        images: ['/uploads/baby-1.jpg', '/uploads/baby-2.jpg', '/uploads/baby-3.jpg'],
      },
    ],
    inputReferenceImages: ['/uploads/scene-1.jpg'],
  });

  assert.equal(result.modelIdentityImages.length, 4);
  assert.ok(result.modelIdentityImages.includes('/uploads/dad-1.jpg'));
  assert.ok(result.modelIdentityImages.includes('/uploads/mom-1.jpg'));
  assert.ok(result.modelIdentityImages.includes('/uploads/baby-1.jpg'));
  assert.deepEqual(result.sceneContextImages, ['/uploads/scene-1.jpg']);
});

test('resolveReferenceImages drops generated image from same owner slot', async () => {
  const db = createDbStub([{ filePath: 'uploads/generated-1.jpg' }]);
  const result = await resolveReferenceImages({
    db,
    owner: { type: 'planScene', id: 'project-1', slot: 'scene:0' },
    inputReferenceImages: ['/uploads/generated-1.jpg', '/uploads/scene-keep.jpg'],
  });

  assert.deepEqual(result.sceneContextImages, ['/uploads/scene-keep.jpg']);
  assert.deepEqual(result.droppedGeneratedImages, ['/uploads/generated-1.jpg']);
});

test('buildPreviewReferenceInputs honors includeCurrentImageAsReference flag', () => {
  const withCurrent = buildPreviewReferenceInputs({
    referenceImages: ['/uploads/a.jpg'],
    currentImagePath: '/uploads/current.jpg',
    includeCurrentImageAsReference: true,
  });
  const withoutCurrent = buildPreviewReferenceInputs({
    referenceImages: ['/uploads/a.jpg'],
    currentImagePath: '/uploads/current.jpg',
    includeCurrentImageAsReference: false,
  });

  assert.deepEqual(withCurrent, ['/uploads/a.jpg', '/uploads/current.jpg']);
  assert.deepEqual(withoutCurrent, ['/uploads/a.jpg']);
});

test('buildReferencePlanSummary returns grouped counts and order', () => {
  const summary = buildReferencePlanSummary({
    modelIdentityImages: ['/uploads/model-a.jpg', '/uploads/model-b.jpg'],
    sceneContextImages: ['/uploads/scene-1.jpg'],
    allImages: ['/uploads/scene-1.jpg', '/uploads/model-a.jpg', '/uploads/model-b.jpg'],
    droppedGeneratedImages: ['/uploads/generated-1.jpg'],
  });

  assert.equal(summary.totalCount, 3);
  assert.deepEqual(summary.order, [
    '/uploads/scene-1.jpg',
    '/uploads/model-a.jpg',
    '/uploads/model-b.jpg',
  ]);
  assert.deepEqual(summary.byRole.identity, ['/uploads/model-a.jpg', '/uploads/model-b.jpg']);
  assert.deepEqual(summary.byRole.scene, ['/uploads/scene-1.jpg']);
  assert.deepEqual(summary.counts, { identity: 2, scene: 1 });
  assert.deepEqual(summary.droppedGeneratedImages, ['/uploads/generated-1.jpg']);
});
