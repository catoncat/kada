import { eq } from 'drizzle-orm';
import { DEFAULT_PROMPT_RULES_V1, type PromptRuleKey, type PromptRulesV1 } from '../prompt-rules';
import { projects, sceneAssets, settings } from '../db/schema';

type Db = {
  select: (...args: any[]) => any;
};

type ImageOwner = {
  type: 'asset' | 'projectPlanVersion' | 'planScene';
  id: string;
  slot?: string;
};

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
  ruleKey: PromptRuleKey;
  ruleId: string;
  effectivePrompt: string;
  promptContext: Record<string, unknown>;
  renderedBlocks: RenderedPromptBlock[];
}

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

async function loadStudioPrompt(db: any): Promise<{ content: string; templateId?: string } | null> {
  const [templateSetting] = await db.select().from(settings).where(eq(settings.key, 'prompt_templates')).limit(1);
  if (!templateSetting?.value) return null;
  const data = safeJsonParse<{ templates?: Array<{ id: string; content: string; isDefault?: boolean }> }>(
    templateSetting.value,
  );
  const templates = data?.templates || [];
  const defaultTemplate = templates.find((t) => t && t.isDefault) || templates[0];
  if (!defaultTemplate?.content) return null;
  return { content: String(defaultTemplate.content), templateId: defaultTemplate.id };
}

async function loadPromptRules(db: any): Promise<PromptRulesV1> {
  const [ruleSetting] = await db.select().from(settings).where(eq(settings.key, 'prompt_rules')).limit(1);
  if (!ruleSetting?.value) return DEFAULT_PROMPT_RULES_V1;

  const parsed = safeJsonParse<PromptRulesV1>(ruleSetting.value);
  if (!parsed || parsed.version !== 1 || !parsed.rules) return DEFAULT_PROMPT_RULES_V1;
  return parsed;
}

function pickRuleKey(owner?: ImageOwner): PromptRuleKey {
  if (owner?.type === 'planScene') return 'image-generation:planScene';
  if (owner?.type === 'asset') return 'image-generation:asset';
  return 'image-generation:asset';
}

export async function buildImageEffectivePrompt(
  db: any,
  input: BuildImagePromptInput,
): Promise<BuildPromptResult> {
  const owner = input.owner;
  const ruleKey = pickRuleKey(owner);
  const rules = await loadPromptRules(db);
  const rule = rules.rules[ruleKey] || DEFAULT_PROMPT_RULES_V1.rules[ruleKey];

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

  for (const b of rule.blocks) {
    if (!b.enabled) continue;

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
      case 'freeText':
        text = b.content ? String(b.content).trim() : '';
        break;
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

  const promptContext: Record<string, unknown> = {
    version: 1,
    rule: { key: ruleKey, id: rule.id, name: rule.name },
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
    renderedBlocks,
  };

  return {
    ruleKey,
    ruleId: rule.id,
    effectivePrompt,
    promptContext,
    renderedBlocks,
  };
}

