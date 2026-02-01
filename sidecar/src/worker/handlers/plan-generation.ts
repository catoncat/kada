/**
 * 预案生成任务处理器
 */

import { getDb } from '../../db';
import { providers, projects, sceneAssets } from '../../db/schema';
import { eq } from 'drizzle-orm';

interface PlanGenerationInput {
  projectId: string;
  providerId?: string;
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

export async function planGenerationHandler(
  input: PlanGenerationInput
): Promise<PlanGenerationOutput> {
  const { projectId, providerId } = input;

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

  // 构建生成预案的 prompt
  const sceneInfo = {
    name: scene.name,
    description: scene.description || '',
    lighting: scene.defaultLighting || '',
    isOutdoor: scene.isOutdoor,
    style: scene.style ? JSON.parse(scene.style) : null,
    tags: scene.tags ? JSON.parse(scene.tags) : [],
  };

  const prompt = buildGeneratePlanPrompt(project.title, sceneInfo);

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

// ========== 内部函数 ==========

interface SceneInfo {
  name: string;
  description: string;
  lighting: string;
  isOutdoor: boolean | null;
  style: { colorTone?: string; lightingMood?: string; era?: string } | null;
  tags: string[];
}

function buildGeneratePlanPrompt(projectTitle: string, scene: SceneInfo): string {
  const styleDesc = scene.style
    ? `色调${scene.style.colorTone === 'warm' ? '暖' : scene.style.colorTone === 'cool' ? '冷' : '中性'}，` +
      `光线${scene.style.lightingMood === 'soft' ? '柔和' : scene.style.lightingMood === 'dramatic' ? '戏剧性' : '自然'}，` +
      `风格${scene.style.era === 'modern' ? '现代' : scene.style.era === 'vintage' ? '复古' : '经典'}`
    : '';

  return `作为一个资深摄影师和创意导演，请为以下拍摄项目提供创意方案。

## 项目信息
- 项目名称：${projectTitle}
- 拍摄场景：${scene.name}
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
  "creativeIdea": "具体的创意思路和风格建议（2-3句话）",
  "copywriting": "核心旁白或宣传文案（1句话）",
  "scenes": [
    {
      "location": "具体拍摄位置/构图",
      "description": "场景内容描述（包括模特动作、表情、道具使用）",
      "shots": "拍摄手法建议（镜头焦段、角度、景别）",
      "lighting": "灯光布置建议",
      "visualPrompt": "A highly detailed English stable diffusion prompt for this scene. Include: subject description, pose, clothing, lighting setup, camera angle, mood, color palette. Must reference the scene characteristics: ${scene.name}${scene.description ? ', ' + scene.description : ''}. Style: photorealistic, professional photography."
    }
  ]
}

## 注意事项
1. 生成 3-4 个不同的分镜场景
2. 每个 visualPrompt 必须使用英文，且要详细描述以便生成精确的参考图
3. visualPrompt 需要融入场景的特点（${scene.name}）
4. 请直接返回 JSON 内容，不要包含 markdown 代码块标记
5. 其他内容使用中文`;
}

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
