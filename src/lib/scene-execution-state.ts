import type {
  AcceptanceResult,
  SceneExecutionState,
  SceneTaskTrack,
} from '@/components/plan/types';

export interface ResolveSceneExecutionStateInput {
  checklistConfirmed: boolean;
  hasPreviewImage: boolean;
  latestTrack?: SceneTaskTrack | null;
  acceptance?: AcceptanceResult | null;
  manualPassed?: boolean;
}

export interface ResolveExecuteActionGuardInput {
  executionState: SceneExecutionState;
  isGenerating?: boolean;
  hasVisualPrompt: boolean;
}

export function resolveSceneExecutionState(
  input: ResolveSceneExecutionStateInput,
): SceneExecutionState {
  const {
    checklistConfirmed,
    hasPreviewImage,
    latestTrack,
    acceptance,
    manualPassed = false,
  } = input;

  if (latestTrack?.status === 'pending' || latestTrack?.status === 'running') {
    return 'running';
  }

  if (!checklistConfirmed) {
    return 'not_confirmed';
  }

  if (latestTrack?.status === 'failed') {
    return 'failed';
  }

  if (!hasPreviewImage) {
    return 'not_generated';
  }

  if (acceptance?.unknownCount && acceptance.unknownCount > 0) {
    return 'needs_info';
  }

  if (!acceptance || acceptance.failCount > 0 || acceptance.overall !== 'pass') {
    return 'generated_pending_review';
  }

  if (manualPassed) {
    return 'passed';
  }

  return 'generated_pending_review';
}

export function resolveExecuteActionGuard(
  input: ResolveExecuteActionGuardInput,
): { disabled: boolean; reason: string | null } {
  const { executionState, isGenerating = false, hasVisualPrompt } = input;

  if (isGenerating) {
    return {
      disabled: true,
      reason: '任务创建中，请稍候。',
    };
  }

  if (executionState === 'running') {
    return {
      disabled: true,
      reason: '该场景正在执行中。',
    };
  }

  if (executionState === 'not_confirmed') {
    return {
      disabled: true,
      reason: '请先确认执行清单。',
    };
  }

  if (!hasVisualPrompt) {
    return {
      disabled: true,
      reason: '请先补充 visualPrompt。',
    };
  }

  return {
    disabled: false,
    reason: null,
  };
}
