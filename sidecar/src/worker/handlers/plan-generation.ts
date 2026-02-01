/**
 * 预案生成任务处理器
 * 使用 Prompt 模板系统来定制 AI 生成行为
 */

import { getDb } from '../../db';
import { providers, projects, sceneAssets, settings } from '../../db/schema';
import { eq } from 'drizzle-orm';

// ========== 类型定义 ==========

interface PlanGenerationInput {
  projectId: string;
  providerId?: string;
  customPrompt?: string;
}

interface GeneratedScene {
  location: string;
  description: string;
  shots: string;
  lighting: string;
  visualPrompt: string;
  sceneAssetId?: string;
  sceneAssetImage?: string;
}

interface GeneratedPlan {
  title: string;
  theme: string;
  creativeIdea: string;
  copywriting: string;
  scenes: GeneratedScene[];
}

interface PlanGenerationOutput {
  plan: GeneratedPlan;
}

interface SceneInfo {
  name: string;
  description: string;
  lighting: string;
  isOutdoor: boolean | null;
  style: { colorTone?: string; lightingMood?: string; era?: string } | null;
  tags: string[];
}

interface PromptTemplate {
  id: string;
  name: string;
  content: string;
  isDefault: boolean;
}

interface PromptTemplatesData {
  templates: PromptTemplate[];
}

/** 性别 */
type Gender = 'male' | 'female';

/** 拍摄人物 */
interface Person {
  id: string;
  role: string;
  gender?: Gender;
  age?: number;
}

/** 客户信息 */
interface CustomerInfo {
  people: Person[];
  notes?: string;
}

/** 性别标签 */
const GENDER_LABELS: Record<string, string> = {
  male: '男',
  female: '女',
};

// ========== 主处理函数 ==========

export async function planGenerationHandler(
  input: PlanGenerationInput
): Promise<PlanGenerationOutput> {
  const { projectId, providerId, customPrompt } = input;

  if (!projectId) {
    throw new Error('projectId is required');
  }

  const db = getDb();

  // 获取项目
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (!project) {
    throw new Error('项目不存在');
  }

  if (!project.selectedScene) {
    throw new Error('请先选择场景');
  }

  // 获取场景资产
  const [scene] = await db
    .select()
    .from(sceneAssets)
    .where(eq(sceneAssets.id, project.selectedScene))
    .limit(1);

  if (!scene) {
    throw new Error('所选场景不存在');
  }

  // 获取 provider
  let provider;
  if (providerId) {
    [provider] = await db
      .select()
      .from(providers)
      .where(eq(providers.id, providerId))
      .limit(1);
  } else {
    [provider] = await db
      .select()
      .from(providers)
      .where(eq(providers.isDefault, true))
      .limit(1);
  }

  if (!provider) {
    throw new Error('未配置 AI 提供商');
  }

  // 获取默认 Prompt 模板
  const [templateSetting] = await db
    .select()
    .from(settings)
    .where(eq(settings.key, 'prompt_templates'))
    .limit(1);

  let defaultTemplate: PromptTemplate | undefined;
  if (templateSetting?.value) {
    try {
      const data: PromptTemplatesData = JSON.parse(templateSetting.value);
      defaultTemplate = data.templates?.find(t => t.isDefault);
    } catch {
      // 解析失败，使用默认
    }
  }

  // 构建场景信息
  const sceneInfo: SceneInfo = {
    name: scene.name,
    description: scene.description || '',
    lighting: scene.defaultLighting || '',
    isOutdoor: scene.isOutdoor,
    style: scene.style ? JSON.parse(scene.style) : null,
    tags: scene.tags ? JSON.parse(scene.tags) : [],
  };

  // 解析客户信息
  const customer: CustomerInfo | undefined = project.customer
    ? JSON.parse(project.customer)
    : undefined;

  // 使用自定义 prompt 或构建默认 prompt
  const prompt = customPrompt || buildGeneratePlanPrompt({
    projectTitle: project.title,
    scene: sceneInfo,
    customer,
    systemPrompt: defaultTemplate?.content,
  });

  // 调用 AI 生成文本
  const planText = await callAiGenerate(provider, prompt);

  // 解析 AI 返回的 JSON
  let generatedPlan: GeneratedPlan;
  try {
    // 尝试提取 JSON（可能被包在 markdown 代码块中）
    const jsonMatch = planText.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, planText];
    generatedPlan = JSON.parse(jsonMatch[1]?.trim() || planText);
  } catch {
    throw new Error('AI 返回的预案格式无效');
  }

  // 为每个场景添加场景资产信息（用于图+文生图）
  if (generatedPlan.scenes && Array.isArray(generatedPlan.scenes)) {
    generatedPlan.scenes = generatedPlan.scenes.map((s: GeneratedScene) => ({
      ...s,
      sceneAssetId: scene.id,
      sceneAssetImage: scene.primaryImage ?? undefined,
    }));
  }

  // 更新项目
  const now = new Date();
  await db.update(projects).set({
    generatedPlan: JSON.stringify(generatedPlan),
    status: 'generated',
    updatedAt: now,
  }).where(eq(projects.id, projectId));

  return { plan: generatedPlan };
}

// ========== Prompt 构建 ==========

export interface PromptContext {
  projectTitle: string;
  scene: SceneInfo;
  customer?: CustomerInfo;
  systemPrompt?: string;
}

export function buildGeneratePlanPrompt(ctx: PromptContext): string {
  const { projectTitle, scene, customer, systemPrompt } = ctx;

  // 场景风格描述
  const styleDesc = scene.style
    ? `色调${scene.style.colorTone === 'warm' ? '暖' : scene.style.colorTone === 'cool' ? '冷' : '中性'}，` +
      `光线${scene.style.lightingMood === 'soft' ? '柔和' : scene.style.lightingMood === 'dramatic' ? '戏剧性' : '自然'}，` +
      `风格${scene.style.era === 'modern' ? '现代' : scene.style.era === 'vintage' ? '复古' : '经典'}`
    : '';

  // 构建客户信息描述
  let customerSection = '';
  let peopleDesc = '人物';
  if (customer && customer.people && customer.people.length > 0) {
    // 构建人物列表描述
    const peopleLines = customer.people.map((person) => {
      const parts: string[] = [person.role];
      if (person.gender) {
        parts.push(GENDER_LABELS[person.gender] || person.gender);
      }
      if (person.age !== undefined) {
        parts.push(`${person.age}岁`);
      }
      return `- ${parts.join('，')}`;
    });

    peopleDesc = customer.people.map(p => p.role).join('、');

    customerSection = `
## 拍摄主体（${customer.people.length}人）
${peopleLines.join('\n')}
${customer.notes ? `\n备注：${customer.notes}` : ''}

**重要说明**：拍摄主体是客户（${peopleDesc}），场景只是背景环境。预案应围绕如何展现客户的状态、情感和互动来设计。
`;
  }

  // 系统提示词（使用用户配置的模板或默认内容）
  const systemSection = systemPrompt || `你是一位专业的儿童摄影师和创意导演，服务于消费级影楼。

## 工作室定位
- 业务类型：儿童摄影
- 目标客户：0-12岁儿童及其家庭
- 拍摄风格：自然、活泼、温馨，捕捉童真瞬间

## 拍摄要点
- 以儿童为主体，场景作为背景烘托氛围
- 动作要自然，善于引导孩子的真实表情
- 注意安全，避免危险动作
- 利用游戏、玩具引导自然表情`;

  return `${systemSection}

---

请根据以上定位，为以下拍摄项目提供专业的创意方案。

## 项目信息
- 项目名称：${projectTitle}
${customerSection}
## 拍摄场景
- 场景名称：${scene.name}
- 场景描述：${scene.description || '无'}
- 场景类型：${scene.isOutdoor ? '户外' : '室内'}
- 默认灯光：${scene.lighting || '未指定'}
- 场景风格：${styleDesc || '未指定'}
- 场景标签：${scene.tags.join('、') || '无'}

## 输出要求
请以 JSON 格式返回，结构如下：
{
  "title": "预案名称",
  "theme": "核心主题描述",
  "creativeIdea": "具体的创意思路",
  "copywriting": "核心文案（1句话，体现主题）",
  "scenes": [
    {
      "location": "在场景中的具体位置/构图",
      "description": "拍摄内容描述（动作、表情、互动）",
      "shots": "拍摄手法建议（镜头焦段、角度、景别）",
      "lighting": "灯光布置建议",
      "visualPrompt": "A highly detailed English stable diffusion prompt for this scene. The subject should be the main focus with '${scene.name}' as background. Style: photorealistic, professional photography."
    }
  ]
}

## 注意事项
1. 生成 3-4 个不同的分镜场景
2. 每个场景的主角是拍摄主体，场景只是背景
3. 每个 visualPrompt 必须使用英文
4. 其他内容使用中文
5. 请直接返回 JSON 内容，不要包含 markdown 代码块标记`;
}

// ========== AI 调用 ==========

interface ProviderConfig {
  format: string;
  baseUrl: string;
  apiKey: string;
  textModel: string;
}

async function callAiGenerate(provider: ProviderConfig, prompt: string): Promise<string> {
  console.log('[AI] Calling provider:', provider.format, 'model:', provider.textModel);
  console.log('[AI] Prompt length:', prompt.length, 'chars');

  if (provider.format === 'gemini') {
    const url = `${provider.baseUrl}/models/${provider.textModel}:generateContent?key=${provider.apiKey.slice(0, 8)}...`;
    console.log('[AI] Gemini URL:', url);

    const res = await fetch(`${provider.baseUrl}/models/${provider.textModel}:generateContent?key=${provider.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error('[AI] Gemini error:', res.status, res.statusText, errorText);
      throw new Error(`AI 请求失败 (${res.status}): ${errorText.slice(0, 200)}`);
    }

    const data = await res.json();
    console.log('[AI] Gemini response received, candidates:', data.candidates?.length);
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  } else {
    const url = `${provider.baseUrl}/chat/completions`;
    console.log('[AI] OpenAI-compatible URL:', url);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify({
        model: provider.textModel,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error('[AI] OpenAI error:', res.status, res.statusText, errorText);
      throw new Error(`AI 请求失败 (${res.status}): ${errorText.slice(0, 200)}`);
    }

    const data = await res.json();
    console.log('[AI] OpenAI response received, choices:', data.choices?.length);
    return data.choices?.[0]?.message?.content || '';
  }
}
