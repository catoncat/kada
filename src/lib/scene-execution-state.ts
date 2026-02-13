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
