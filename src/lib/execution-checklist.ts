import type {
  ExecutionChecklistSnapshot,
  GeneratedScene,
} from '@/components/plan/types';
import type { TaskPromptReferenceIdentityBinding } from '@/types/task-detail';

export const EXECUTION_CHECKLIST_STRATEGY_VERSION = 'v1';

function normalizeBindings(
  value: TaskPromptReferenceIdentityBinding[],
): TaskPromptReferenceIdentityBinding[] {
  return value
    .filter(
      (item): item is TaskPromptReferenceIdentityBinding =>
        Boolean(
          item &&
            typeof item.index === 'number' &&
            Number.isFinite(item.index) &&
            typeof item.image === 'string' &&
            item.image.trim(),
        ),
    )
    .map((item) => ({ ...item, image: item.image.trim() }))
    .sort((a, b) => a.index - b.index);
}

function hasCompleteIdentityMapping(
  bindings: TaskPromptReferenceIdentityBinding[],
  expectedPeopleCount: number,
): boolean {
  if (expectedPeopleCount <= 1) return true;
  if (bindings.length === 0) return false;
  const indices = new Set(bindings.map((item) => item.index));
  for (let i = 1; i <= expectedPeopleCount; i += 1) {
    if (!indices.has(i)) return false;
  }
  return true;
}

function getStorageKey(
  projectId: string,
  sceneIndex: number,
  planFingerprint: string,
): string {
  return `spv2:exec-checklist:${projectId}:${sceneIndex}:${planFingerprint}`;
}

export function buildScenePlanFingerprint(options: {
  scene: GeneratedScene;
  identityBindings?: TaskPromptReferenceIdentityBinding[];
  lockedAspectRatio?: string;
  strategyVersion?: string;
}): string {
  const {
    scene,
    identityBindings = [],
    lockedAspectRatio = 'photo',
    strategyVersion = EXECUTION_CHECKLIST_STRATEGY_VERSION,
  } = options;

  const bindingsPart = normalizeBindings(identityBindings)
    .map((item) => `${item.index}:${item.image}`)
    .join(',');

  return [
    scene.visualPrompt?.trim() || '',
    scene.sceneAssetImage?.trim() || '',
    bindingsPart,
    lockedAspectRatio,
    strategyVersion,
  ].join('|');
}

export function createExecutionChecklistSnapshot(options: {
  projectId: string;
  sceneIndex: number;
  scene: GeneratedScene;
  expectedPeopleCount: number;
  identityBindings?: TaskPromptReferenceIdentityBinding[];
  lockedAspectRatio?: string;
  strategyVersion?: string;
}): ExecutionChecklistSnapshot {
  const {
    projectId,
    sceneIndex,
    scene,
    expectedPeopleCount,
    identityBindings = [],
    lockedAspectRatio = 'photo',
    strategyVersion = EXECUTION_CHECKLIST_STRATEGY_VERSION,
  } = options;

  const normalizedBindings = normalizeBindings(identityBindings);
  const checks = {
    sceneReferenceReady: Boolean(scene.sceneAssetImage?.trim()),
    identityCollageReady:
      expectedPeopleCount <= 1 || normalizedBindings.length > 0,
    identityMappingComplete: hasCompleteIdentityMapping(
      normalizedBindings,
      expectedPeopleCount,
    ),
    aspectRatioLocked: Boolean(lockedAspectRatio.trim()),
    singleFrameDeclared: true,
  };

  const planFingerprint = buildScenePlanFingerprint({
    scene,
    identityBindings: normalizedBindings,
    lockedAspectRatio,
    strategyVersion,
  });

  return {
    projectId,
    sceneIndex,
    planFingerprint,
    lockedAspectRatio,
    expectedPeopleCount,
    strategyVersion,
    checks,
    allPassed: Object.values(checks).every(Boolean),
    confirmedAt: null,
    updatedAt: Date.now(),
  };
}

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function isValidSnapshot(
  value: unknown,
  expectedFingerprint: string,
): value is ExecutionChecklistSnapshot {
  if (!value || typeof value !== 'object') return false;
  const raw = value as Record<string, unknown>;
  return (
    typeof raw.projectId === 'string' &&
    typeof raw.sceneIndex === 'number' &&
    typeof raw.planFingerprint === 'string' &&
    raw.planFingerprint === expectedFingerprint &&
    typeof raw.lockedAspectRatio === 'string' &&
    typeof raw.expectedPeopleCount === 'number' &&
    typeof raw.strategyVersion === 'string' &&
    typeof raw.checks === 'object' &&
    raw.checks !== null &&
    typeof raw.allPassed === 'boolean' &&
    (typeof raw.confirmedAt === 'number' || raw.confirmedAt === null) &&
    typeof raw.updatedAt === 'number'
  );
}

export function readExecutionChecklistSnapshot(options: {
  projectId: string;
  sceneIndex: number;
  planFingerprint: string;
}): ExecutionChecklistSnapshot | null {
  if (!isBrowser()) return null;

  const key = getStorageKey(
    options.projectId,
    options.sceneIndex,
    options.planFingerprint,
  );
  const raw = window.localStorage.getItem(key);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (!isValidSnapshot(parsed, options.planFingerprint)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeExecutionChecklistSnapshot(
  snapshot: ExecutionChecklistSnapshot,
): void {
  if (!isBrowser()) return;
  const key = getStorageKey(
    snapshot.projectId,
    snapshot.sceneIndex,
    snapshot.planFingerprint,
  );
  window.localStorage.setItem(key, JSON.stringify(snapshot));
}

export function getExecutionChecklistSnapshot(options: {
  projectId: string;
  sceneIndex: number;
  scene: GeneratedScene;
  expectedPeopleCount: number;
  identityBindings?: TaskPromptReferenceIdentityBinding[];
  lockedAspectRatio?: string;
  strategyVersion?: string;
}): ExecutionChecklistSnapshot {
  const created = createExecutionChecklistSnapshot(options);
  const stored = readExecutionChecklistSnapshot({
    projectId: created.projectId,
    sceneIndex: created.sceneIndex,
    planFingerprint: created.planFingerprint,
  });
  return stored || created;
}

export function confirmExecutionChecklist(
  snapshot: ExecutionChecklistSnapshot,
): ExecutionChecklistSnapshot {
  const next: ExecutionChecklistSnapshot = {
    ...snapshot,
    confirmedAt: Date.now(),
    updatedAt: Date.now(),
  };
  writeExecutionChecklistSnapshot(next);
  return next;
}

export function isChecklistConfirmed(
  snapshot: ExecutionChecklistSnapshot | null | undefined,
): boolean {
  return Boolean(snapshot && snapshot.allPassed && snapshot.confirmedAt);
}
