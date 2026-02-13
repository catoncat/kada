import type {
  AcceptanceResult,
  AcceptanceRuleResult,
  GeneratedScene,
} from '@/components/plan/types';
import type { Task } from '@/lib/tasks-api';
import type {
  TaskDetailView,
  TaskPromptContext,
  TaskPromptReferenceIdentityBinding,
  TaskPromptReferencePlan,
} from '@/types/task-detail';

export interface AcceptanceEvaluationInput {
  scene: GeneratedScene;
  expectedPeopleCount: number;
  lockedAspectRatio?: string;
  latestTask?: Task | null;
  latestTaskDetail?: TaskDetailView | null;
}

export interface AcceptanceFixTemplate {
  editInstruction: string;
  options: {
    aspectRatio: string;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function safeString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeBindings(
  value: unknown,
): TaskPromptReferenceIdentityBinding[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (item): item is TaskPromptReferenceIdentityBinding =>
        Boolean(
          item &&
            typeof item === 'object' &&
            typeof (item as TaskPromptReferenceIdentityBinding).index ===
              'number' &&
            typeof (item as TaskPromptReferenceIdentityBinding).image ===
              'string',
        ),
    )
    .sort((a, b) => a.index - b.index);
}

function getPromptContext(
  detail?: TaskDetailView | null,
): TaskPromptContext | null {
  if (!detail) return null;
  if (detail.run?.promptContext && typeof detail.run.promptContext === 'object') {
    return detail.run.promptContext as TaskPromptContext;
  }
  const artifactPromptContext = detail.artifacts[0]?.promptContext;
  if (artifactPromptContext && typeof artifactPromptContext === 'object') {
    return artifactPromptContext as TaskPromptContext;
  }
  return null;
}

export function extractIdentityBindings(
  promptContext?: TaskPromptContext | null,
): TaskPromptReferenceIdentityBinding[] {
  if (!promptContext || typeof promptContext !== 'object') return [];
  const referencePlan = promptContext.referencePlan as
    | TaskPromptReferencePlan
    | undefined;
  return normalizeBindings(referencePlan?.identityBindings);
}

function hasCompleteMapping(
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

function getAspectRatioFromTask(task?: Task | null): string | null {
  if (!task || !isRecord(task.input)) return null;
  const options = task.input.options;
  if (!isRecord(options)) return null;
  return safeString(options.aspectRatio);
}

function getLatestMimeType(options: {
  task?: Task | null;
  detail?: TaskDetailView | null;
}): string | null {
  const fromArtifact = safeString(options.detail?.artifacts?.[0]?.mimeType);
  if (fromArtifact) return fromArtifact;
  if (!options.task || !isRecord(options.task.output)) return null;
  return safeString(options.task.output.mimeType);
}

function buildRuleSummary(
  rules: AcceptanceRuleResult[],
): Pick<AcceptanceResult, 'overall' | 'passCount' | 'failCount' | 'unknownCount'> {
  const passCount = rules.filter((item) => item.status === 'pass').length;
  const failCount = rules.filter((item) => item.status === 'fail').length;
  const unknownCount = rules.filter((item) => item.status === 'unknown').length;

  if (failCount > 0) {
    return { overall: 'fail', passCount, failCount, unknownCount };
  }
  if (unknownCount > 0) {
    return { overall: 'unknown', passCount, failCount, unknownCount };
  }
  return { overall: 'pass', passCount, failCount, unknownCount };
}

export function evaluateSceneAcceptance(
  input: AcceptanceEvaluationInput,
): AcceptanceResult {
  const {
    scene,
    expectedPeopleCount,
    lockedAspectRatio = 'photo',
    latestTask,
    latestTaskDetail,
  } = input;

  if (!latestTask) {
    const noTaskRules: AcceptanceRuleResult[] = [
      {
        key: 'people',
        label: '人数',
        status: 'unknown',
        reason: '尚未生成任务，无法检查人数注入一致性。',
      },
      {
        key: 'identity',
        label: '身份',
        status: 'unknown',
        reason: '尚未生成任务，无法检查编号映射。',
      },
      {
        key: 'aspectRatio',
        label: '画幅',
        status: 'unknown',
        reason: '尚未生成任务，无法检查画幅锁定。',
      },
      {
        key: 'singleFrame',
        label: '单帧',
        status: 'unknown',
        reason: '尚未生成任务，无法检查输出格式。',
      },
      {
        key: 'constraints',
        label: '约束完整性',
        status: scene.sceneAssetImage ? 'unknown' : 'fail',
        reason: scene.sceneAssetImage
          ? '尚未生成任务，缺少参考图注入记录。'
          : '缺少场景参考图，无法满足执行清单。',
      },
    ];
    return {
      ...buildRuleSummary(noTaskRules),
      rules: noTaskRules,
    };
  }

  const promptContext = getPromptContext(latestTaskDetail);
  const identityBindings = extractIdentityBindings(promptContext);
  const mappingComplete = hasCompleteMapping(identityBindings, expectedPeopleCount);

  const peopleRule: AcceptanceRuleResult = !promptContext
    ? {
        key: 'people',
        label: '人数',
        status: 'unknown',
        reason: '缺少 promptContext，无法检查人数注入一致性。',
      }
    : expectedPeopleCount <= 1
      ? {
          key: 'people',
          label: '人数',
          status: identityBindings.length <= 1 ? 'pass' : 'fail',
          reason:
            identityBindings.length <= 1
              ? '单人场景注入满足约束。'
              : '单人场景检测到多条身份映射，可能注入异常。',
        }
      : identityBindings.length === 0
        ? {
            key: 'people',
            label: '人数',
            status: 'fail',
            reason: `期望 ${expectedPeopleCount} 人，但未检测到编号映射注入。`,
          }
        : {
            key: 'people',
            label: '人数',
            status: mappingComplete ? 'pass' : 'fail',
            reason: mappingComplete
              ? `编号映射覆盖 ${expectedPeopleCount} 人。`
              : `编号映射不完整，期望 ${expectedPeopleCount} 人。`,
          };

  const identityRule: AcceptanceRuleResult = !promptContext
    ? {
        key: 'identity',
        label: '身份',
        status: 'unknown',
        reason: '缺少 promptContext，无法核验 identityBindings。',
      }
    : expectedPeopleCount <= 1
      ? {
          key: 'identity',
          label: '身份',
          status: 'pass',
          reason: '单人场景默认通过身份映射校验。',
        }
      : {
          key: 'identity',
          label: '身份',
          status: mappingComplete ? 'pass' : 'fail',
          reason: mappingComplete
            ? 'identityBindings 与期望人数匹配。'
            : 'identityBindings 缺号或数量不一致。',
        };

  const aspectRatioInTask = getAspectRatioFromTask(latestTask);
  const aspectRatioRule: AcceptanceRuleResult = !aspectRatioInTask
    ? {
        key: 'aspectRatio',
        label: '画幅',
        status: 'unknown',
        reason: '任务未记录 aspectRatio，无法确认是否锁定。',
      }
    : {
        key: 'aspectRatio',
        label: '画幅',
        status: aspectRatioInTask === lockedAspectRatio ? 'pass' : 'fail',
        reason:
          aspectRatioInTask === lockedAspectRatio
            ? `画幅已锁定为 ${lockedAspectRatio}。`
            : `当前画幅为 ${aspectRatioInTask}，与锁定值 ${lockedAspectRatio} 不一致。`,
      };

  const mimeType = getLatestMimeType({
    task: latestTask,
    detail: latestTaskDetail,
  });
  const singleFrameRule: AcceptanceRuleResult = !mimeType
    ? {
        key: 'singleFrame',
        label: '单帧',
        status: 'unknown',
        reason: '缺少产物 MIME 信息，无法确认是否为静态图。',
      }
    : mimeType === 'image/gif'
      ? {
          key: 'singleFrame',
          label: '单帧',
          status: 'fail',
          reason: '当前产物为 GIF 动图，违反单帧静态图约束。',
        }
      : mimeType.startsWith('image/')
        ? {
            key: 'singleFrame',
            label: '单帧',
            status: 'pass',
            reason: `当前产物为 ${mimeType}，符合静态图约束。`,
          }
        : {
            key: 'singleFrame',
            label: '单帧',
            status: 'unknown',
            reason: `当前产物类型为 ${mimeType}，无法确定是否为静态图。`,
          };

  const constraintsRule: AcceptanceRuleResult = !scene.sceneAssetImage
    ? {
        key: 'constraints',
        label: '约束完整性',
        status: 'fail',
        reason: '缺少 scene 参考图。',
      }
    : expectedPeopleCount > 1 && identityBindings.length === 0
      ? {
          key: 'constraints',
          label: '约束完整性',
          status: 'fail',
          reason: '多人场景缺少 identity 编号映射。',
        }
      : expectedPeopleCount > 1 && !mappingComplete
        ? {
            key: 'constraints',
            label: '约束完整性',
            status: 'fail',
            reason: '多人映射存在缺号，约束不完整。',
          }
        : {
            key: 'constraints',
            label: '约束完整性',
            status: 'pass',
            reason: 'scene/identity 约束信息完整。',
          };

  const rules: AcceptanceRuleResult[] = [
    peopleRule,
    identityRule,
    aspectRatioRule,
    singleFrameRule,
    constraintsRule,
  ];

  return {
    ...buildRuleSummary(rules),
    rules,
  };
}

export function buildAcceptanceFixTemplate(options: {
  acceptance: AcceptanceResult;
  lockedAspectRatio?: string;
}): AcceptanceFixTemplate {
  const lockedAspectRatio = options.lockedAspectRatio || 'photo';
  const failedOrUnknownRules = options.acceptance.rules.filter(
    (item) => item.status !== 'pass',
  );
  const issueText =
    failedOrUnknownRules.length > 0
      ? failedOrUnknownRules.map((item) => item.label).join('、')
      : '验收项';

  return {
    editInstruction: `修复以下问题：${issueText}。保持人物数量与身份映射一致，画幅固定为 ${lockedAspectRatio}，输出单帧静态图。`,
    options: {
      aspectRatio: lockedAspectRatio,
    },
  };
}
