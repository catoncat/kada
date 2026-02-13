import { beforeEach, describe, expect, it } from 'vitest';
import type { GeneratedScene } from '@/components/plan/types';
import {
  buildScenePlanFingerprint,
  confirmExecutionChecklist,
  createExecutionChecklistSnapshot,
  getExecutionChecklistSnapshot,
  readExecutionChecklistSnapshot,
} from '@/lib/execution-checklist';

function createMemoryLocalStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
}

const baseScene: GeneratedScene = {
  location: '室内窗边',
  description: '宝宝看向镜头',
  shots: '35mm 半身',
  lighting: '柔光',
  visualPrompt: 'a kid near window',
  sceneAssetImage: '/uploads/scene.png',
};

describe('execution-checklist', () => {
  beforeEach(() => {
    (globalThis as any).window = {
      localStorage: createMemoryLocalStorage(),
    };
  });

  it('creates checklist with expected checks', () => {
    const snapshot = createExecutionChecklistSnapshot({
      projectId: 'p1',
      sceneIndex: 0,
      scene: baseScene,
      expectedPeopleCount: 2,
      identityBindings: [{ index: 1, image: '/a.png' }],
    });

    expect(snapshot.checks.sceneReferenceReady).toBe(true);
    expect(snapshot.checks.identityCollageReady).toBe(true);
    expect(snapshot.checks.identityMappingComplete).toBe(false);
    expect(snapshot.allPassed).toBe(false);
  });

  it('invalidates snapshot when fingerprint changes', () => {
    const fp1 = buildScenePlanFingerprint({ scene: baseScene });
    const fp2 = buildScenePlanFingerprint({
      scene: { ...baseScene, visualPrompt: 'updated prompt' },
    });
    expect(fp1).not.toBe(fp2);
  });

  it('persists confirmation and can read back', () => {
    const snapshot = getExecutionChecklistSnapshot({
      projectId: 'p1',
      sceneIndex: 1,
      scene: { ...baseScene },
      expectedPeopleCount: 1,
      identityBindings: [],
    });
    const confirmed = confirmExecutionChecklist(snapshot);
    const loaded = readExecutionChecklistSnapshot({
      projectId: 'p1',
      sceneIndex: 1,
      planFingerprint: confirmed.planFingerprint,
    });
    expect(loaded?.confirmedAt).toBeTypeOf('number');
    expect(loaded?.allPassed).toBe(true);
  });
});
