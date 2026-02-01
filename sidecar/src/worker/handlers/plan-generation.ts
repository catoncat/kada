/**
 * 预案生成任务处理器
 */

import { getDb } from '../../db';
import { providers, projects, sceneAssets, settings } from '../../db/schema';
import { eq } from 'drizzle-orm';

// ========== 导出的类型 ==========

export interface CustomerInfo {
  /** 客户类型 */
  type: 'child' | 'pregnant' | 'family' | 'parent_child' | 'couple' | 'individual';
  /** 年龄范围 */
  ageRange?: 'infant' | 'toddler' | 'preschool' | 'school_age' | 'teenager' | 'adult';
  /** 人数 */
  count?: number;
  /** 关系描述 */
  relation?: string;
  /** 备注 */
  notes?: string;
}

export interface StudioProfile {
  /** 业务类型 */
  businessType: 'consumer_studio' | 'commercial' | 'artistic';
  /** 目标客户群 */
  targetCustomers: string[];
  /** 拍摄风格 */
  shootingStyle?: string;
  /** 自定义 prompt 前缀 */
  promptPrefix?: string;
}

export interface SceneInfo {
  name: string;
  description: string;
  lighting: string;
  isOutdoor: boolean | null;
  style: { colorTone?: string; lightingMood?: string; era?: string } | null;
  tags: string[];
}

export interface PromptContext {
  projectTitle: string;
  scene: SceneInfo;
  customer?: CustomerInfo;
  studioProfile?: StudioProfile;
}

// ========== 内部类型 ==========

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

// ========== 标签映射 ==========

const CUSTOMER_TYPE_LABELS: Record<string, string> = {
  child: '儿童',
  pregnant: '孕妇',
  family: '家庭',
  parent_child: '亲子',
  couple: '情侣',
  individual: '个人',
};

const AGE_RANGE_LABELS: Record<string, string> = {
  infant: '婴儿(0-1岁)',
  toddler: '幼儿(1-3岁)',
  preschool: '学龄前(3-6岁)',
  school_age: '学龄(6-12岁)',
  teenager: '青少年(12-18岁)',
  adult: '成人(18岁以上)',
};

const BUSINESS_TYPE_LABELS: Record<string, string> = {
  consumer_studio: '消费级影楼',
  commercial: '商业摄影',
  artistic: '艺术摄影',
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

  // 获取工作室配置
  const [studioSetting] = await db
    .select()
    .from(settings)
    .where(eq(settings.key, 'studio_profile'))
    .limit(1);
  const studioProfile: StudioProfile | undefined = studioSetting?.value
    ? JSON.parse(studioSetting.value)
    : undefined;

  // 构建生成预案的 prompt
  const sceneInfo: SceneInfo = {
    name: scene.name,
    description: scene.description || '',
    lighting: scene.defaultLighting || '',
    isOutdoor: scene.isOutdoor,
    style: scene.style ? JSON.parse(scene.style) : null,
    tags: scene.tags ? JSON.parse(scene.tags) : [],
  };

  const customer: CustomerInfo | undefined = project.customer
    ? JSON.parse(project.customer)
    : undefined;

  // 使用自定义 prompt 或构建默认 prompt
  const prompt = customPrompt || buildGeneratePlanPrompt({
    projectTitle: project.title,
    scene: sceneInfo,
    customer,
    studioProfile,
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

// ========== Prompt 构建（核心改造） ==========

export function buildGeneratePlanPrompt(ctx: PromptContext): string {
  const { projectTitle, scene, customer, studioProfile } = ctx;

  // 场景风格描述
  const styleDesc = scene.style
    ? `色调${scene.style.colorTone === 'warm' ? '暖' : scene.style.colorTone === 'cool' ? '冷' : '中性'}，` +
      `光线${scene.style.lightingMood === 'soft' ? '柔和' : scene.style.lightingMood === 'dramatic' ? '戏剧性' : '自然'}，` +
      `风格${scene.style.era === 'modern' ? '现代' : scene.style.era === 'vintage' ? '复古' : '经典'}`
    : '';

  // 客户信息描述
  let customerDesc = '未指定';
  let customerTypeLabel = '人物';
  if (customer) {
    customerTypeLabel = CUSTOMER_TYPE_LABELS[customer.type] || customer.type;
    const parts: string[] = [customerTypeLabel];
    if (customer.ageRange) {
      parts.push(AGE_RANGE_LABELS[customer.ageRange] || customer.ageRange);
    }
    if (customer.count && customer.count > 1) {
      parts.push(`${customer.count}人`);
    }
    if (customer.relation) {
      parts.push(`(${customer.relation})`);
    }
    customerDesc = parts.join('，');
    if (customer.notes) {
      customerDesc += `\n- 特殊备注：${customer.notes}`;
    }
  }

  // 工作室定位描述
  let studioDesc = '消费级影楼（标准模式）';
  if (studioProfile) {
    const parts: string[] = [
      BUSINESS_TYPE_LABELS[studioProfile.businessType] || studioProfile.businessType,
    ];
    if (studioProfile.targetCustomers?.length) {
      parts.push(`服务对象：${studioProfile.targetCustomers.join('、')}`);
    }
    if (studioProfile.shootingStyle) {
      parts.push(`风格：${studioProfile.shootingStyle}`);
    }
    studioDesc = parts.join('，');
  }

  // 自定义前缀
  const customPrefix = studioProfile?.promptPrefix
    ? `\n## 工作室特殊要求\n${studioProfile.promptPrefix}\n`
    : '';

  // 根据客户类型生成动作建议
  const poseGuidance = getPoseGuidance(customer?.type);

  return `作为一个资深摄影师和创意导演，请为以下拍摄项目提供创意方案。
${customPrefix}
## 工作室定位
${studioDesc}

## 项目信息
- 项目名称：${projectTitle}

## 拍摄主体（客户信息）
- 客户类型：${customerDesc}

**重要说明**：拍摄主体是客户（${customerTypeLabel}），场景只是背景环境。预案应围绕如何展现客户的状态、情感和互动来设计，场景作为氛围和构图的辅助元素。

${poseGuidance}

## 拍摄场景（作为背景）
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
  "theme": "核心主题描述（围绕拍摄主体的情感/状态）",
  "creativeIdea": "具体的创意思路（如何展现客户特点、场景如何配合）",
  "copywriting": "核心文案（1句话，体现主题）",
  "scenes": [
    {
      "location": "在场景中的具体位置/构图",
      "description": "拍摄内容描述（重点描述客户的动作、表情、互动，以及如何与场景配合）",
      "shots": "拍摄手法建议（镜头焦段、角度、景别）",
      "lighting": "灯光布置建议",
      "visualPrompt": "A highly detailed English stable diffusion prompt. IMPORTANT: The MAIN SUBJECT must be the customer (${customerTypeLabel}), NOT the scene/background. Include: detailed subject description matching customer type, their pose, expression, interaction, clothing style; the scene '${scene.name}' as BACKGROUND. Style: photorealistic, professional portrait photography."
    }
  ]
}

## 注意事项
1. 生成 3-4 个不同的分镜场景
2. **核心要求**：每个场景的主角是客户（${customerTypeLabel}），不是场景本身
3. 动作和表情设计要符合客户特点
4. 每个 visualPrompt 必须使用英文，主体描述在前，场景背景在后
5. 其他内容使用中文
6. 请直接返回 JSON 内容，不要包含 markdown 代码块标记`;
}

// 根据客户类型生成动作指导
function getPoseGuidance(customerType?: string): string {
  switch (customerType) {
    case 'child':
      return `## 儿童拍摄要点
- 动作要自然活泼，抓拍为主
- 利用游戏、玩具引导自然表情
- 与场景元素互动（触摸、探索、奔跑）
- 注意安全，避免危险动作`;

    case 'pregnant':
      return `## 孕妇拍摄要点
- 动作要优雅舒缓，展现母性光辉
- 手部姿态常见：抚摸孕肚、托腹
- 可与准爸爸互动（相拥、牵手、亲吻孕肚）
- 注意舒适度，避免长时间同一姿势`;

    case 'family':
      return `## 家庭拍摄要点
- 展现家人间的自然互动和情感联结
- 安排有层次的站位/坐姿构图
- 捕捉真实的笑容和眼神交流
- 可设计有趣的互动环节（牵手、拥抱、嬉戏）`;

    case 'parent_child':
      return `## 亲子拍摄要点
- 强调亲子间的亲密互动
- 设计眼神交流、拥抱、玩耍场景
- 高度差利用（抱起、背着、蹲下平视）
- 抓拍自然温馨的瞬间`;

    case 'couple':
      return `## 情侣拍摄要点
- 展现两人间的情感和默契
- 自然的牵手、相拥、对视
- 设计有故事感的互动场景
- 注意两人的位置关系和肢体语言`;

    case 'individual':
      return `## 个人写真要点
- 引导自然放松的表情和姿态
- 多角度展现人物气质
- 利用场景元素丰富构图
- 注意手部和站姿的自然度`;

    default:
      return '';
  }
}

// ========== AI 调用 ==========

interface ProviderConfig {
  format: string;
  baseUrl: string;
  apiKey: string;
  textModel: string;
}

async function callAiGenerate(provider: ProviderConfig, prompt: string): Promise<string> {
  if (provider.format === 'gemini') {
    const url = `${provider.baseUrl}/models/${provider.textModel}:generateContent?key=${provider.apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    });
    if (!res.ok) throw new Error('Failed to generate text');
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  } else {
    const url = `${provider.baseUrl}/chat/completions`;
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
    if (!res.ok) throw new Error('Failed to generate text');
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  }
}
