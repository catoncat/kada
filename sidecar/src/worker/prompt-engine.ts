import { eq, inArray } from 'drizzle-orm';
import { projects, sceneAssets, settings, modelAssets } from '../db/schema';

const FALLBACK_STUDIO_PROMPT = `你是一位专业的儿童摄影师和创意导演，服务于消费级影楼。

## 工作室定位
- 业务类型：儿童摄影
- 目标客户：0-12岁儿童及其家庭
- 拍摄风格：自然、活泼、温馨，捕捉童真瞬间

## 拍摄要点
- 以儿童为主体，场景作为背景烘托氛围
- 动作要自然，善于引导孩子的真实表情
- 注意安全，避免危险动作
- 利用游戏、玩具引导自然表情`;

type Db = {
  select: (...args: any[]) => any;
};

type ImageOwner = {
  type: 'asset' | 'projectPlanVersion' | 'planScene';
  id: string;
  slot?: string;
};

type ComposerProfileKey = 'image-generation:planScene' | 'image-generation:asset';

type ComposerBlockKind =
  | 'studioPrompt'
  | 'projectPrompt'
  | 'customerInfo'
  | 'modelInfo'
  | 'selectedSceneAsset'
  | 'planScene'
  | 'asset'
  | 'draftPrompt'
  | 'editInstruction';

interface ComposerBlockDefinition {
  id: string;
  kind: ComposerBlockKind;
  label: string;
}

interface ComposerProfileDefinition {
  id: string;
  name: string;
  blocks: ComposerBlockDefinition[];
}

export interface BuildImagePromptInput {
  prompt: string;
  owner?: ImageOwner;
  editInstruction?: string;
}

export interface RenderedPromptBlock {
  id: string;
  kind: string;
  label: string;
  text: string;
}

export interface BuildPromptResult {
  composer: {
    key: ComposerProfileKey;
    id: string;
    name: string;
    version: string;
    mode: 'fixed';
  };
  effectivePrompt: string;
  promptContext: Record<string, unknown>;
  renderedBlocks: RenderedPromptBlock[];
}

const FIXED_IMAGE_COMPOSER_VERSION = 'fixed:v2';

const FIXED_COMPOSER_PROFILES: Record<ComposerProfileKey, ComposerProfileDefinition> = {
  'image-generation:planScene': {
    id: 'image-composer:planScene:fixed-v2',
    name: '场景预览图（固定编排）',
    blocks: [
      { id: 'studio', kind: 'studioPrompt', label: '全局工作室提示词' },
      { id: 'project', kind: 'projectPrompt', label: '项目信息' },
      { id: 'customer', kind: 'customerInfo', label: '客户信息' },
      { id: 'model-info', kind: 'modelInfo', label: '模特外观信息' },
      { id: 'scene-asset', kind: 'selectedSceneAsset', label: '已选场景资产' },
      { id: 'plan-scene', kind: 'planScene', label: '分镜场景' },
      { id: 'draft', kind: 'draftPrompt', label: '出图提示词（draft）' },
    ],
  },
  'image-generation:asset': {
    id: 'image-composer:asset:fixed-v2',
    name: '资产图片（固定编排）',
    blocks: [
      { id: 'studio', kind: 'studioPrompt', label: '全局工作室提示词' },
      { id: 'asset', kind: 'asset', label: '资产信息' },
      { id: 'draft', kind: 'draftPrompt', label: '出图提示词（draft）' },
    ],
  },
};

function safeJsonParse<T>(value: string | null | undefined): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function compactLines(text: string): string {
  return text
    .split('\n')
    .map((l) => l.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function getSceneIndexFromSlot(slot?: string): number | null {
  if (!slot) return null;
  if (!slot.startsWith('scene:')) return null;
  const raw = slot.split(':')[1] ?? '';
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function formatCustomerInfo(customer: any): string | null {
  if (!customer || typeof customer !== 'object') return null;
  const people = Array.isArray(customer.people) ? customer.people : [];
  const notes = typeof customer.notes === 'string' ? customer.notes.trim() : '';
  if (people.length === 0 && !notes) return null;

  const lines: string[] = [];
  if (people.length > 0) {
    lines.push(`## 客户信息（${people.length}人）`);
    for (const p of people) {
      if (!p || typeof p !== 'object') continue;
      const parts: string[] = [];
      if (typeof p.role === 'string' && p.role.trim()) parts.push(p.role.trim());
      if (typeof p.gender === 'string' && p.gender.trim()) parts.push(p.gender.trim());
      if (typeof p.age === 'number' && Number.isFinite(p.age)) parts.push(`${p.age}岁`);
      if (parts.length > 0) lines.push(`- ${parts.join('，')}`);
    }
  }
  if (notes) {
    lines.push(people.length > 0 ? '' : '## 客户备注');
    lines.push(`备注：${notes}`);
  }
  return compactLines(lines.join('\n'));
}

function formatSceneAsset(asset: any): string | null {
  if (!asset) return null;
  const name = typeof asset.name === 'string' ? asset.name.trim() : '';
  const description = typeof asset.description === 'string' ? asset.description.trim() : '';
  const defaultLighting = typeof asset.defaultLighting === 'string' ? asset.defaultLighting.trim() : '';
  const isOutdoor = asset.isOutdoor === true ? '是' : asset.isOutdoor === false ? '否' : '';

  const tags = safeJsonParse<string[]>(asset.tags) ?? [];
  const style = safeJsonParse<{ colorTone?: string; lightingMood?: string; era?: string }>(asset.style);

  const lines: string[] = [];
  lines.push('## 已选场景资产（背景环境）');
  if (name) lines.push(`- 名称：${name}`);
  if (description) lines.push(`- 描述：${description}`);
  if (defaultLighting) lines.push(`- 默认灯光：${defaultLighting}`);
  if (typeof isOutdoor === 'string' && isOutdoor) lines.push(`- 是否户外：${isOutdoor}`);
  if (tags.length > 0) lines.push(`- 标签：${tags.join('，')}`);
  if (style) {
    const styleParts = [style.colorTone, style.lightingMood, style.era].filter(Boolean);
    if (styleParts.length > 0) lines.push(`- 风格：${styleParts.join(' / ')}`);
  }
  return compactLines(lines.join('\n'));
}

function formatPlanScene(scene: any, sceneIndex: number | null): string | null {
  if (!scene || typeof scene !== 'object') return null;
  const location = typeof scene.location === 'string' ? scene.location.trim() : '';
  const description = typeof scene.description === 'string' ? scene.description.trim() : '';
  const shots = typeof scene.shots === 'string' ? scene.shots.trim() : '';
  const lighting = typeof scene.lighting === 'string' ? scene.lighting.trim() : '';

  if (!location && !description && !shots && !lighting) return null;

  const title = typeof sceneIndex === 'number' ? `## 分镜场景（第 ${sceneIndex + 1} 个）` : '## 分镜场景';
  const lines: string[] = [title];
  if (location) lines.push(`- 场景：${location}`);
  if (description) lines.push(`- 描述：${description}`);
  if (shots) lines.push(`- 镜头：${shots}`);
  if (lighting) lines.push(`- 灯光：${lighting}`);
  return compactLines(lines.join('\n'));
}

function formatModelInfo(
  models: Array<{ personRole: string; name: string; appearancePrompt: string }>,
): string | null {
  if (!models || models.length === 0) return null;
  const lines: string[] = [
    '## 人物外观描述（保持跨场景一致）',
    '约束：模特参考仅用于锁定人物身份，不继承其服装；服装与造型以分镜/场景文字描述为准。',
    '',
  ];
  for (const m of models) {
    lines.push(`### ${m.personRole}（模特：${m.name}）`);
    if (m.appearancePrompt) {
      lines.push(m.appearancePrompt);
    }
    lines.push('');
  }
  return compactLines(lines.join('\n'));
}

async function loadStudioPrompt(db: any): Promise<{ content: string; templateId?: string } | null> {
  const [templateSetting] = await db.select().from(settings).where(eq(settings.key, 'prompt_templates')).limit(1);
  if (!templateSetting?.value) return { content: FALLBACK_STUDIO_PROMPT, templateId: 'builtin-default' };
  const data = safeJsonParse<{ templates?: Array<{ id: string; content: string; isDefault?: boolean }> }>(
    templateSetting.value,
  );
  const templates = data?.templates || [];
  const defaultTemplate = templates.find((t) => t && t.isDefault) || templates[0];
  if (!defaultTemplate?.content) return { content: FALLBACK_STUDIO_PROMPT, templateId: 'builtin-default' };
  return { content: String(defaultTemplate.content), templateId: defaultTemplate.id };
}

function pickComposerProfileKey(owner?: ImageOwner): ComposerProfileKey {
  if (owner?.type === 'planScene') return 'image-generation:planScene';
  if (owner?.type === 'asset') return 'image-generation:asset';
  return 'image-generation:asset';
}

export async function buildImageEffectivePrompt(
  db: any,
  input: BuildImagePromptInput,
): Promise<BuildPromptResult> {
  const owner = input.owner;
  const composerKey = pickComposerProfileKey(owner);
  const composerProfile = FIXED_COMPOSER_PROFILES[composerKey];

  // ===== 预取上下文（按需） =====
  const studio = await loadStudioPrompt(db);

  let project: any = null;
  let projectCustomer: any = null;
  let selectedSceneAsset: any = null;
  let planScene: any = null;
  const sceneIndex = owner?.type === 'planScene' ? getSceneIndexFromSlot(owner.slot) : null;

  if (owner?.type === 'planScene') {
    const [p] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, owner.id))
      .limit(1);
    project = p || null;
    projectCustomer = safeJsonParse(project?.customer) ?? null;

    if (project?.selectedScene) {
      const [asset] = await db
        .select()
        .from(sceneAssets)
        .where(eq(sceneAssets.id, project.selectedScene))
        .limit(1);
      selectedSceneAsset = asset || null;
    }

    const plan = safeJsonParse<{ scenes?: unknown[] }>(project?.generatedPlan) ?? null;
    if (plan?.scenes && Array.isArray(plan.scenes) && typeof sceneIndex === 'number') {
      planScene = plan.scenes[sceneIndex] ?? null;
    }
  }

  // 加载模特映射数据
  let modelInfoData: Array<{ personRole: string; name: string; appearancePrompt: string }> = [];
  let modelReferenceImages: string[] = [];

  if (project) {
    const selectedModels = safeJsonParse<{ personModelMap?: Record<string, string> }>(project.selectedModels);
    const customerData = safeJsonParse<{ people?: Array<{ id: string; role: string }> }>(project.customer);
    const personModelMap = selectedModels?.personModelMap || {};
    const people = customerData?.people || [];

    const modelIds = [...new Set(Object.values(personModelMap))].filter(Boolean);

    if (modelIds.length > 0) {
      const models = await db.select().from(modelAssets).where(inArray(modelAssets.id, modelIds));
      const modelMap = new Map(models.map((m: any) => [m.id, m]));

      for (const person of people) {
        const modelId = personModelMap[person.id];
        if (!modelId) continue;
        const model = modelMap.get(modelId);
        if (!model) continue;

        if (model.appearancePrompt) {
          modelInfoData.push({
            personRole: person.role || '人物',
            name: model.name,
            appearancePrompt: model.appearancePrompt,
          });
        }

        // 收集参考图（优先级：主参考 > 辅助参考）
        if (model.primaryImage) {
          modelReferenceImages.push(model.primaryImage);
        }
        const refs = safeJsonParse<string[]>(model.referenceImages) ?? [];
        modelReferenceImages.push(...refs.slice(0, 2));
      }
    }
  }

  if (owner?.type === 'asset') {
    const [asset] = await db
      .select()
      .from(sceneAssets)
      .where(eq(sceneAssets.id, owner.id))
      .limit(1);
    selectedSceneAsset = asset || null;
  }

  // ===== 渲染 blocks =====
  const renderedBlocks: RenderedPromptBlock[] = [];

  for (const b of composerProfile.blocks) {
    let text = '';
    switch (b.kind) {
      case 'studioPrompt':
        text = studio?.content ? `## 全局工作室提示词\n${studio.content}` : '';
        break;
      case 'projectPrompt': {
        if (!project) break;
        const title = typeof project.title === 'string' ? project.title.trim() : '';
        const projectPrompt =
          typeof project.projectPrompt === 'string' ? project.projectPrompt.trim() : '';
        if (!title && !projectPrompt) break;
        const lines: string[] = ['## 项目信息'];
        if (title) lines.push(`- 标题：${title}`);
        if (projectPrompt) {
          lines.push('');
          lines.push('项目提示词：');
          lines.push(projectPrompt);
        }
        text = lines.join('\n');
        break;
      }
      case 'customerInfo':
        text = formatCustomerInfo(projectCustomer) || '';
        break;
      case 'modelInfo':
        text = formatModelInfo(modelInfoData) || '';
        break;
      case 'selectedSceneAsset':
        text = formatSceneAsset(selectedSceneAsset) || '';
        break;
      case 'planScene':
        text = formatPlanScene(planScene, sceneIndex) || '';
        break;
      case 'asset':
        text = formatSceneAsset(selectedSceneAsset) || '';
        break;
      case 'draftPrompt': {
        const draft = typeof input.prompt === 'string' ? input.prompt.trim() : '';
        text = draft ? `## 出图提示词（draft）\n${draft}` : '';
        break;
      }
      case 'editInstruction': {
        const ins = typeof input.editInstruction === 'string' ? input.editInstruction.trim() : '';
        text = ins ? `## 编辑指令\n${ins}` : '';
        break;
      }
      default:
        text = '';
    }

    text = compactLines(text);
    if (!text) continue;

    renderedBlocks.push({
      id: b.id,
      kind: b.kind,
      label: b.label,
      text,
    });
  }

  const effectivePrompt = compactLines(renderedBlocks.map((p) => p.text).join('\n\n'));

  const composer = {
    version: FIXED_IMAGE_COMPOSER_VERSION,
    key: composerKey,
    id: composerProfile.id,
    name: composerProfile.name,
    mode: 'fixed' as const,
  };

  const promptContext: Record<string, unknown> = {
    version: 2,
    composer,
    owner: owner || null,
    inputs: {
      draftPrompt: typeof input.prompt === 'string' ? input.prompt : null,
      editInstruction: typeof input.editInstruction === 'string' ? input.editInstruction : null,
    },
    sources: {
      studioTemplateId: studio?.templateId || null,
      projectId: owner?.type === 'planScene' ? owner.id : null,
      sceneIndex,
      selectedSceneAssetId:
        owner?.type === 'asset'
          ? owner.id
          : owner?.type === 'planScene'
            ? project?.selectedScene || null
            : null,
    },
    modelReferenceImages,
    renderedBlocks,
  };

  return {
    composer,
    effectivePrompt,
    promptContext,
    renderedBlocks,
  };
}
