import { describe, expect, it } from 'vitest';
import type { GeneratedScene } from '@/components/plan/types';
import { evaluateSceneAcceptance } from '@/lib/acceptance-rules';
import type { Task } from '@/lib/tasks-api';
import type { TaskDetailView } from '@/types/task-detail';

const baseScene: GeneratedScene = {
  location: '草地',
  description: '亲子互动',
  shots: '50mm',
  lighting: '自然光',
  visualPrompt: 'family on grass',
  sceneAssetImage: '/uploads/scene.png',
};

function createTask(overrides?: Partial<Task>): Task {
  return {
    id: 'task-1',
    type: 'image-generation',
    status: 'completed',
    input: {
      options: { aspectRatio: 'photo' },
    },
    output: {
      mimeType: 'image/png',
    },
    error: null,
    relatedId: 'p1',
    relatedMeta: null,
    createdAt: '2025-01-01T10:00:00.000Z',
    updatedAt: '2025-01-01T10:01:00.000Z',
    ...overrides,
  };
}

function createDetail(overrides?: Partial<TaskDetailView>): TaskDetailView {
  return {
    task: {
      id: 'task-1',
      type: 'image-generation',
      status: 'completed',
      input: {},
      output: {},
      error: null,
      relatedId: 'p1',
      relatedMeta: null,
      createdAt: null,
      updatedAt: null,
    },
    run: {
      id: 'run-1',
      kind: 'image-generation',
      status: 'succeeded',
      relatedType: 'project',
      relatedId: 'p1',
      effectivePrompt: 'prompt',
      promptContext: {
        referencePlan: {
          identityBindings: [
            { index: 1, image: '/i1.png' },
            { index: 2, image: '/i2.png' },
          ],
        },
      },
      parentRunId: null,
      taskId: 'task-1',
      error: null,
      createdAt: null,
      updatedAt: null,
    },
    artifacts: [
      {
        id: 'a1',
        runId: 'run-1',
        type: 'image',
        mimeType: 'image/png',
        filePath: '/uploads/a1.png',
        width: 1024,
        height: 768,
        sizeBytes: 100,
        ownerType: 'planScene',
        ownerId: 'p1',
        ownerSlot: 'scene:0',
        effectivePrompt: 'prompt',
        promptContext: null,
        referenceImages: [],
        editInstruction: null,
        parentArtifactId: null,
        createdAt: null,
        deletedAt: null,
      },
    ],
    timeline: [],
    recoveryContext: {
      sourceType: 'projectResult',
      projectId: 'p1',
      sceneIndex: 0,
    },
    missingFields: [],
    ...overrides,
  };
}

describe('acceptance-rules', () => {
  it('returns unknown when no task exists', () => {
    const result = evaluateSceneAcceptance({
      scene: baseScene,
      expectedPeopleCount: 2,
      latestTask: null,
      latestTaskDetail: null,
    });
    expect(result.overall).toBe('unknown');
    expect(result.unknownCount).toBeGreaterThan(0);
  });

  it('fails when aspect ratio mismatches and output is gif', () => {
    const result = evaluateSceneAcceptance({
      scene: baseScene,
      expectedPeopleCount: 2,
      lockedAspectRatio: 'photo',
      latestTask: createTask({
        input: { options: { aspectRatio: 'landscape' } },
        output: { mimeType: 'image/gif' },
      }),
      latestTaskDetail: createDetail({
        artifacts: [
          {
            ...createDetail().artifacts[0],
            mimeType: 'image/gif',
          },
        ],
      }),
    });
    expect(result.overall).toBe('fail');
    expect(result.rules.find((item) => item.key === 'aspectRatio')?.status).toBe(
      'fail',
    );
    expect(result.rules.find((item) => item.key === 'singleFrame')?.status).toBe(
      'fail',
    );
  });

  it('passes when all constraints are satisfied', () => {
    const result = evaluateSceneAcceptance({
      scene: baseScene,
      expectedPeopleCount: 2,
      lockedAspectRatio: 'photo',
      latestTask: createTask(),
      latestTaskDetail: createDetail(),
    });
    expect(result.overall).toBe('pass');
    expect(result.failCount).toBe(0);
    expect(result.unknownCount).toBe(0);
  });
});
