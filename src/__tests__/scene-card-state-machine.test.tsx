import { describe, expect, it } from 'vitest';
import { resolveSceneExecutionState } from '@/lib/scene-execution-state';

describe('scene execution state machine', () => {
  it('prioritizes running status', () => {
    const state = resolveSceneExecutionState({
      checklistConfirmed: false,
      hasPreviewImage: false,
      latestTrack: {
        sceneIndex: 0,
        taskId: 't1',
        status: 'running',
        createdAt: null,
        updatedAt: null,
        error: null,
      },
      acceptance: null,
      manualPassed: false,
    });
    expect(state).toBe('running');
  });

  it('returns not_confirmed before generation state', () => {
    const state = resolveSceneExecutionState({
      checklistConfirmed: false,
      hasPreviewImage: true,
      latestTrack: {
        sceneIndex: 0,
        taskId: null,
        status: 'idle',
        createdAt: null,
        updatedAt: null,
        error: null,
      },
      acceptance: {
        overall: 'pass',
        passCount: 5,
        failCount: 0,
        unknownCount: 0,
        rules: [],
      },
      manualPassed: true,
    });
    expect(state).toBe('not_confirmed');
  });

  it('returns needs_info when acceptance contains unknown', () => {
    const state = resolveSceneExecutionState({
      checklistConfirmed: true,
      hasPreviewImage: true,
      latestTrack: {
        sceneIndex: 0,
        taskId: 't1',
        status: 'completed',
        createdAt: null,
        updatedAt: null,
        error: null,
      },
      acceptance: {
        overall: 'unknown',
        passCount: 4,
        failCount: 0,
        unknownCount: 1,
        rules: [],
      },
      manualPassed: false,
    });
    expect(state).toBe('needs_info');
  });

  it('returns passed only when manually confirmed', () => {
    const accepted = {
      overall: 'pass' as const,
      passCount: 5,
      failCount: 0,
      unknownCount: 0,
      rules: [],
    };
    expect(
      resolveSceneExecutionState({
        checklistConfirmed: true,
        hasPreviewImage: true,
        latestTrack: {
          sceneIndex: 0,
          taskId: 't1',
          status: 'completed',
          createdAt: null,
          updatedAt: null,
          error: null,
        },
        acceptance: accepted,
        manualPassed: false,
      }),
    ).toBe('generated_pending_review');

    expect(
      resolveSceneExecutionState({
        checklistConfirmed: true,
        hasPreviewImage: true,
        latestTrack: {
          sceneIndex: 0,
          taskId: 't1',
          status: 'completed',
          createdAt: null,
          updatedAt: null,
          error: null,
        },
        acceptance: accepted,
        manualPassed: true,
      }),
    ).toBe('passed');
  });
});
