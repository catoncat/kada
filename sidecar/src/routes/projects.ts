import { Hono } from 'hono';
import { eq, and, inArray, desc, sql, isNull } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { getDb } from '../db';
import {
  projects,
  tasks,
  sceneAssets,
  settings,
  generationRuns,
  generationArtifacts,
  providers,
} from '../db/schema';
import {
  buildGeneratePlanPrompt,
  callAiGenerate,
  ensureGeneratedPlanScenes,
  type GeneratedPlan,
  type GeneratedScene,
  optimizePlanScenesPrompts,
  type PlanTextProviderConfig,
  type PromptContext,
} from '../worker/handlers/plan-generation';

export const projectRoutes = new Hono();

function safeParseJson<T>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function resolveSceneSlotCandidates(scene: { id?: string }, sceneIndex: number): string[] {
  const slots = [`scene:${sceneIndex}`];
  if (typeof scene.id === 'string' && scene.id.trim()) {
    slots.unshift(`scene:${scene.id.trim()}`);
  }
  return slots;
}

export function buildAppendScenePrompt(params: {
  projectTitle: string;
  projectPrompt?: string | null;
  sceneName: string;
  sceneDescription?: string | null;
  sceneLighting?: string | null;
  customerSummary: string;
  existingScenes: Array<{
    location?: string;
    description?: string;
    shots?: string;
    lighting?: string;
  }>;
}): string {
  const existingScenesSummary = params.existingScenes
    .map((scene, index) => {
      const parts = [
        `分镜 ${index + 1}`,
        scene.location ? `位置：${scene.location}` : null,
        scene.description ? `描述：${scene.description}` : null,
        scene.shots ? `镜头：${scene.shots}` : null,
        scene.lighting ? `灯光：${scene.lighting}` : null,
      ].filter(Boolean);
      return `- ${parts.join('；')}`;
    })
    .join('\n');

  return [
    '你是一位专业的儿童摄影师和创意导演。',
    '请在不重复已有分镜的前提下，为当前项目补充“1 个新分镜”。',
    '',
    `项目：${params.projectTitle}`,
    params.projectPrompt ? `项目提示词：${params.projectPrompt}` : null,
    `场景：${params.sceneName}`,
    params.sceneDescription ? `场景描述：${params.sceneDescription}` : null,
    params.sceneLighting ? `默认灯光：${params.sceneLighting}` : null,
    `拍摄主体：${params.customerSummary}`,
    '',
    '已有分镜：',
    existingScenesSummary || '- 暂无',
    '',
    '输出要求（严格 JSON，不要 markdown）：',
    '{',
    '  "location": "位置构图",',
    '  "description": "动作与互动描述",',
    '  "shots": "镜头建议",',
    '  "lighting": "灯光建议",',
    '  "visualPrompt": "最终用于生图的中文提示词"',
    '}',
    '',
    '要求：',
    '1. 全部中文。',
    '2. 主体是客户人物，场景只是背景。',
    '3. 新分镜必须与已有分镜区分明显。',
    '4. 不要输出多余字段。',
  ]
    .filter(Boolean)
    .join('\n');
}

export function parseGeneratedSceneText(raw: string): GeneratedScene {
  const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonText = jsonMatch?.[1]?.trim() || raw.trim();
  const parsed = JSON.parse(jsonText) as Record<string, unknown>;

  const toText = (value: unknown, fallback = ''): string =>
    typeof value === 'string' ? value.trim() : fallback;

  const visualPrompt = toText(parsed.visualPrompt);
  if (!visualPrompt) {
    throw new Error('AI 返回缺少 visualPrompt');
  }

  return {
    location: toText(parsed.location),
    description: toText(parsed.description),
    shots: toText(parsed.shots),
    lighting: toText(parsed.lighting),
    visualPrompt,
    selectedArtifactId: null,
  };
}

// 获取所有项目（带元数据）
projectRoutes.get('/', async (c) => {
  try {
    const db = getDb();
    const list = await db.select().from(projects).orderBy(desc(projects.updatedAt));

    // 获取所有项目 ID
    const projectIds = list.map((p) => p.id);

    // 批量获取任务信息
    const allTasks = projectIds.length > 0
      ? await db
          .select()
          .from(tasks)
          .where(inArray(tasks.relatedId, projectIds))
      : [];

    // 批量获取 generation runs（用于方案版本统计）
    const allRuns = projectIds.length > 0
      ? await db
          .select()
          .from(generationRuns)
          .where(
            and(
              inArray(generationRuns.relatedId, projectIds),
              eq(generationRuns.kind, 'plan-generation'),
              eq(generationRuns.status, 'succeeded')
            )
          )
      : [];

    // 批量获取预览图 artifacts（planScene：ownerId=projectId, ownerSlot=scene:n）
    const allArtifacts = projectIds.length > 0
      ? await db
          .select({
            ownerId: generationArtifacts.ownerId,
            ownerSlot: generationArtifacts.ownerSlot,
          })
          .from(generationArtifacts)
          .where(
            and(
              eq(generationArtifacts.ownerType, 'planScene'),
              inArray(generationArtifacts.ownerId, projectIds),
              isNull(generationArtifacts.deletedAt),
            )
          )
      : [];

    const previewSlotsByProject = new Map<string, Set<string>>();
    for (const a of allArtifacts) {
      if (!a.ownerId || !a.ownerSlot) continue;
      if (!a.ownerSlot.startsWith('scene:')) continue;
      if (!previewSlotsByProject.has(a.ownerId)) {
        previewSlotsByProject.set(a.ownerId, new Set());
      }
      previewSlotsByProject.get(a.ownerId)!.add(a.ownerSlot);
    }

    // 按项目分组任务
    const tasksByProject = new Map<string, typeof allTasks>();
    for (const task of allTasks) {
      if (!task.relatedId) continue;
      if (!tasksByProject.has(task.relatedId)) {
        tasksByProject.set(task.relatedId, []);
      }
      tasksByProject.get(task.relatedId)!.push(task);
    }

    // 按项目分组 runs
    const runsByProject = new Map<string, typeof allRuns>();
    for (const run of allRuns) {
      if (!run.relatedId) continue;
      if (!runsByProject.has(run.relatedId)) {
        runsByProject.set(run.relatedId, []);
      }
      runsByProject.get(run.relatedId)!.push(run);
    }

    // 解析 JSON 字段并聚合元数据
    const parsed = list.map((p) => {
      const projectTasks = tasksByProject.get(p.id) || [];
      const projectRuns = runsByProject.get(p.id) || [];

      // 计算任务状态
      const pendingTasks = projectTasks.filter((t) => t.status === 'pending').length;
      const runningTask = projectTasks.find((t) => t.status === 'running');

      // 最后的错误（最近失败的任务）
      const failedTasks = projectTasks
        .filter((t) => t.status === 'failed')
        .sort((a, b) => {
          const aTime = a.updatedAt?.getTime() || 0;
          const bTime = b.updatedAt?.getTime() || 0;
          return bTime - aTime;
        });
      const lastError = failedTasks.length > 0
        ? {
            type: failedTasks[0].type,
            message: failedTasks[0].error || '未知错误',
            taskId: failedTasks[0].id,
          }
        : undefined;

      // 方案版本数
      const planVersionCount = projectRuns.length;

      const customer = safeParseJson(p.customer);
      const generatedPlanRaw = safeParseJson<GeneratedPlan>(p.generatedPlan);
      const generatedPlan = generatedPlanRaw
        ? ensureGeneratedPlanScenes(generatedPlanRaw).plan
        : null;

      // 预览图进度（基于分镜列表，兼容 scene:index 与 scene:sceneId）
      let previewProgress: { done: number; total: number } | undefined;
      if (generatedPlan?.scenes && Array.isArray(generatedPlan.scenes)) {
        const scenes = generatedPlan.scenes;
        const total = scenes.length;
        const previewSlots = previewSlotsByProject.get(p.id) || new Set<string>();
        const doneFromArtifacts = scenes.filter((scene, sceneIndex) =>
          resolveSceneSlotCandidates(scene, sceneIndex).some((slot) =>
            previewSlots.has(slot),
          ),
        ).length;
        const doneFromPlan = scenes.filter((scene) => {
          const view = scene as unknown as {
            previewUrl?: string;
            previewArtifactPath?: string;
          };
          return Boolean(view.previewArtifactPath || view.previewUrl);
        }).length;
        const done = Math.max(doneFromArtifacts, doneFromPlan);
        if (total > 0) {
          previewProgress = { done, total };
        }
      }

      return {
        ...p,
        customer,
        generatedPlan,
        // 元数据
        planVersionCount: planVersionCount || undefined,
        currentPlanVersion: planVersionCount || undefined,
        previewProgress,
        pendingTasks: pendingTasks || undefined,
        runningTask: runningTask
          ? {
              id: runningTask.id,
              type: runningTask.type,
              progress: undefined, // 可以后续扩展进度
            }
          : undefined,
        lastError,
      };
    });

    return c.json({ data: parsed, total: parsed.length });
  } catch (error: unknown) {
    console.error('Get projects error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: `获取项目列表失败: ${message}` }, 500);
  }
});

// 获取单个项目
projectRoutes.get('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const db = getDb();

    const [project] = await db.select().from(projects).where(eq(projects.id, id));

    if (!project) {
      return c.json({ error: '项目不存在' }, 404);
    }

    // 解析 + 兼容化 generatedPlan（补 sceneId / selectedArtifactId）
    const generatedPlanRaw = safeParseJson<GeneratedPlan>(project.generatedPlan);
    const normalizedPlan = generatedPlanRaw
      ? ensureGeneratedPlanScenes(generatedPlanRaw)
      : null;
    let generatedPlan = normalizedPlan?.plan ?? null;
    let shouldPersistGeneratedPlan = Boolean(normalizedPlan?.changed);

    // 为 generatedPlan.scenes 注入预览图（优先 selectedArtifactId，回退最新）
    if (generatedPlan?.scenes && Array.isArray(generatedPlan.scenes) && generatedPlan.scenes.length > 0) {
      const artifacts = await db
        .select({
          id: generationArtifacts.id,
          ownerSlot: generationArtifacts.ownerSlot,
          filePath: generationArtifacts.filePath,
          createdAt: generationArtifacts.createdAt,
        })
        .from(generationArtifacts)
        .where(
          and(
            eq(generationArtifacts.ownerType, 'planScene'),
            eq(generationArtifacts.ownerId, id),
            isNull(generationArtifacts.deletedAt),
          ),
        )
        .orderBy(desc(generationArtifacts.createdAt));

      const artifactsBySlot = new Map<string, typeof artifacts>();
      const artifactsById = new Map<string, (typeof artifacts)[number]>();
      for (const artifact of artifacts) {
        if (artifact.id) {
          artifactsById.set(artifact.id, artifact);
        }
        if (!artifact.ownerSlot) continue;
        if (!artifactsBySlot.has(artifact.ownerSlot)) {
          artifactsBySlot.set(artifact.ownerSlot, []);
        }
        artifactsBySlot.get(artifact.ownerSlot)?.push(artifact);
      }

      let sceneSelectionChanged = false;
      const nextScenes = generatedPlan.scenes.map((scene, sceneIndex) => {
        const slotCandidates = resolveSceneSlotCandidates(scene, sceneIndex);
        const slotArtifacts = slotCandidates.flatMap(
          (slot) => artifactsBySlot.get(slot) || [],
        );

        const selectedArtifact =
          typeof scene.selectedArtifactId === 'string' &&
          scene.selectedArtifactId.trim()
            ? artifactsById.get(scene.selectedArtifactId.trim()) || null
            : null;
        const selectedInScene =
          selectedArtifact &&
          selectedArtifact.ownerSlot &&
          slotCandidates.includes(selectedArtifact.ownerSlot)
            ? selectedArtifact
            : null;
        const latestArtifact = slotArtifacts[0] || null;
        const resolvedArtifact = selectedInScene || latestArtifact;
        const resolvedSelectedId = resolvedArtifact?.id || null;

        if (scene.selectedArtifactId !== resolvedSelectedId) {
          sceneSelectionChanged = true;
        }

        const previewPath = resolvedArtifact?.filePath
          ? resolvedArtifact.filePath.startsWith('/')
            ? resolvedArtifact.filePath
            : `/${resolvedArtifact.filePath}`
          : null;

        return {
          ...scene,
          selectedArtifactId: resolvedSelectedId,
          previewArtifactPath: previewPath,
          previewUrl: previewPath,
        };
      });

      if (sceneSelectionChanged) {
        shouldPersistGeneratedPlan = true;
      }

      generatedPlan = {
        ...generatedPlan,
        scenes: nextScenes,
      };
    }

    if (shouldPersistGeneratedPlan && generatedPlan) {
      const scenesForStorage = generatedPlan.scenes.map((scene) => {
        const { previewArtifactPath, previewUrl, ...rest } =
          scene as unknown as Record<string, unknown>;
        return rest;
      });

      await db
        .update(projects)
        .set({
          generatedPlan: JSON.stringify({
            ...generatedPlan,
            scenes: scenesForStorage,
          }),
          updatedAt: new Date(),
        })
        .where(eq(projects.id, id));
    }

    const parsed = {
      ...project,
      customer: safeParseJson(project.customer),
      generatedPlan,
    };

    return c.json(parsed);
  } catch (error: unknown) {
    console.error('Get project error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: `获取项目失败: ${message}` }, 500);
  }
});

// 创建项目
projectRoutes.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const db = getDb();

    if (!body.title?.trim()) {
      return c.json({ error: '项目标题不能为空' }, 400);
    }

    const id = randomUUID();
    const now = new Date();

    const newProject = {
      id,
      title: body.title.trim(),
      projectPrompt: null,
      status: 'draft',
      selectedScene: null,
      customer: null,
      selectedModels: null,
      generatedPlan: null,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(projects).values(newProject);

    return c.json({
      ...newProject,
      customer: null,
      generatedPlan: null,
    }, 201);
  } catch (error: unknown) {
    console.error('Create project error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: `创建项目失败: ${message}` }, 500);
  }
});

// 更新项目
projectRoutes.put('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const db = getDb();

    // 检查是否存在
    const [existing] = await db.select().from(projects).where(eq(projects.id, id));
    if (!existing) {
      return c.json({ error: '项目不存在' }, 404);
    }

    const now = new Date();

    const updates: Record<string, unknown> = {
      updatedAt: now,
    };

    // 只更新提供的字段
    if (body.title !== undefined) updates.title = body.title.trim();
    if (body.projectPrompt !== undefined) {
      updates.projectPrompt = body.projectPrompt ? String(body.projectPrompt).trim() : null;
    }
    if (body.status !== undefined) updates.status = body.status;
    if (body.selectedScene !== undefined) {
      updates.selectedScene = body.selectedScene || null;
    }
    if (body.customer !== undefined) {
      updates.customer = body.customer ? JSON.stringify(body.customer) : null;
    }
    if (body.selectedModels !== undefined) {
      updates.selectedModels = body.selectedModels
        ? String(body.selectedModels)
        : null;
    }
    if (body.generatedPlan !== undefined) {
      if (body.generatedPlan) {
        const normalized = ensureGeneratedPlanScenes(
          body.generatedPlan as GeneratedPlan,
        );
        updates.generatedPlan = JSON.stringify(normalized.plan);
      } else {
        updates.generatedPlan = null;
      }
    }

    await db.update(projects).set(updates).where(eq(projects.id, id));

    // 获取更新后的数据
    const [updated] = await db.select().from(projects).where(eq(projects.id, id));

    return c.json({
      ...updated,
      customer: updated.customer ? JSON.parse(updated.customer) : null,
      generatedPlan: updated.generatedPlan ? JSON.parse(updated.generatedPlan) : null,
    });
  } catch (error: unknown) {
    console.error('Update project error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: `更新项目失败: ${message}` }, 500);
  }
});

// AI 补一条分镜（追加到末尾，或插入到指定分镜后）
projectRoutes.post('/:id/scenes/ai-append', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    const afterSceneId =
      typeof body.afterSceneId === 'string' && body.afterSceneId.trim()
        ? body.afterSceneId.trim()
        : null;
    const providerId =
      typeof body.providerId === 'string' && body.providerId.trim()
        ? body.providerId.trim()
        : null;

    const db = getDb();
    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    if (!project) {
      return c.json({ error: '项目不存在' }, 404);
    }

    if (!project.generatedPlan) {
      return c.json({ error: '当前项目尚未生成方案，无法补充分镜' }, 400);
    }

    if (!project.selectedScene) {
      return c.json({ error: '当前项目缺少场景配置，无法补充分镜' }, 400);
    }

    const [sceneAsset] = await db
      .select()
      .from(sceneAssets)
      .where(eq(sceneAssets.id, project.selectedScene))
      .limit(1);
    if (!sceneAsset) {
      return c.json({ error: '所选场景不存在' }, 400);
    }

    const generatedPlanRaw = safeParseJson<GeneratedPlan>(project.generatedPlan);
    if (!generatedPlanRaw || !Array.isArray(generatedPlanRaw.scenes)) {
      return c.json({ error: '当前方案数据无效，无法补充分镜' }, 400);
    }
    const normalizedPlan = ensureGeneratedPlanScenes(generatedPlanRaw).plan;

    const customer = safeParseJson<{
      people?: Array<{ role?: string; gender?: string; age?: number }>;
    }>(project.customer);
    const customerSummary =
      customer?.people && customer.people.length > 0
        ? customer.people
            .map((person) => {
              const parts = [
                typeof person.role === 'string' ? person.role.trim() : '',
                typeof person.gender === 'string' ? person.gender.trim() : '',
                typeof person.age === 'number' && Number.isFinite(person.age)
                  ? `${person.age}岁`
                  : '',
              ].filter(Boolean);
              return parts.join('，');
            })
            .filter(Boolean)
            .join('；')
        : '未提供';

    let providerRow;
    if (providerId) {
      [providerRow] = await db
        .select()
        .from(providers)
        .where(eq(providers.id, providerId))
        .limit(1);
    } else {
      [providerRow] = await db
        .select()
        .from(providers)
        .where(eq(providers.isDefault, true))
        .limit(1);
    }

    if (!providerRow) {
      return c.json({ error: '未配置可用的 AI Provider' }, 400);
    }
    if (!providerRow.textModel?.trim()) {
      return c.json({ error: '当前 Provider 未配置文本模型，无法补充分镜' }, 400);
    }

    const appendPrompt = buildAppendScenePrompt({
      projectTitle: project.title,
      projectPrompt: project.projectPrompt || null,
      sceneName: sceneAsset.name,
      sceneDescription: sceneAsset.description || null,
      sceneLighting: sceneAsset.defaultLighting || null,
      customerSummary,
      existingScenes: normalizedPlan.scenes.map((scene) => ({
        location: scene.location,
        description: scene.description,
        shots: scene.shots,
        lighting: scene.lighting,
      })),
    });

    const provider: PlanTextProviderConfig = {
      format: providerRow.format,
      baseUrl: providerRow.baseUrl,
      apiKey: providerRow.apiKey,
      textModel: providerRow.textModel,
    };
    const generatedText = await callAiGenerate(provider, appendPrompt);
    const newSceneDraft = parseGeneratedSceneText(generatedText);
    newSceneDraft.sceneAssetId = sceneAsset.id;
    newSceneDraft.sceneAssetImage = sceneAsset.primaryImage ?? undefined;

    const optimized = await optimizePlanScenesPrompts({
      db,
      provider: {
        id: providerRow.id,
        format: providerRow.format,
        baseUrl: providerRow.baseUrl,
        apiKey: providerRow.apiKey,
        textModel: providerRow.textModel,
        capabilities: providerRow.capabilities ?? null,
      },
      scenes: [newSceneDraft],
    });
    const sceneToInsert = optimized.scenes[0] || newSceneDraft;

    const nextScenes = [...normalizedPlan.scenes];
    let insertIndex = nextScenes.length;
    if (afterSceneId) {
      const afterIndex = nextScenes.findIndex(
        (scene) => scene.id === afterSceneId,
      );
      if (afterIndex >= 0) {
        insertIndex = afterIndex + 1;
      }
    }
    nextScenes.splice(insertIndex, 0, sceneToInsert);

    const finalPlan = ensureGeneratedPlanScenes({
      ...normalizedPlan,
      scenes: nextScenes,
    }).plan;

    await db
      .update(projects)
      .set({
        generatedPlan: JSON.stringify(finalPlan),
        updatedAt: new Date(),
      })
      .where(eq(projects.id, id));

    const insertedScene = finalPlan.scenes[insertIndex] || finalPlan.scenes.at(-1);
    const sceneIndex = insertedScene
      ? finalPlan.scenes.findIndex((scene) => scene.id === insertedScene.id)
      : -1;

    return c.json({
      scene: insertedScene || null,
      index: sceneIndex >= 0 ? sceneIndex : finalPlan.scenes.length - 1,
      preoptimization: optimized.summary,
    });
  } catch (error: unknown) {
    console.error('AI append scene error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: `补充分镜失败: ${message}` }, 500);
  }
});

// 删除项目
projectRoutes.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const db = getDb();

    // 检查是否存在
    const [existing] = await db.select().from(projects).where(eq(projects.id, id));
    if (!existing) {
      return c.json({ error: '项目不存在' }, 404);
    }

    await db.delete(projects).where(eq(projects.id, id));

    return c.json({ success: true });
  } catch (error: unknown) {
    console.error('Delete project error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: `删除项目失败: ${message}` }, 500);
  }
});

// 生成预案（支持 preview mode 和 customPrompt）
projectRoutes.post('/:id/generate', async (c) => {
  try {
    const projectId = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    const { mode = 'execute', customPrompt } = body as {
      mode?: 'preview' | 'execute';
      customPrompt?: string;
    };

    const db = getDb();

    // 获取项目
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
    if (!project) {
      return c.json({ error: '项目不存在' }, 404);
    }

    if (!project.selectedScene) {
      return c.json({ error: '请先选择场景' }, 400);
    }

    // 获取场景资产
    const [scene] = await db.select().from(sceneAssets).where(eq(sceneAssets.id, project.selectedScene));
    if (!scene) {
      return c.json({ error: '所选场景不存在' }, 400);
    }

    // 获取默认 Prompt 模板
    const [templateSetting] = await db
      .select()
      .from(settings)
      .where(eq(settings.key, 'prompt_templates'));
    let systemPrompt: string | undefined;
    if (templateSetting?.value) {
      try {
        const data = JSON.parse(templateSetting.value);
        const defaultTemplate = data.templates?.find((t: { isDefault: boolean }) => t.isDefault);
        systemPrompt = defaultTemplate?.content;
      } catch {
        // 解析失败，使用默认
      }
    }

    // 构建 prompt context
    const sceneInfo = {
      name: scene.name,
      description: scene.description || '',
      lighting: scene.defaultLighting || '',
      isOutdoor: scene.isOutdoor,
      style: scene.style ? JSON.parse(scene.style) : null,
      tags: scene.tags ? JSON.parse(scene.tags) : [],
    };

    const customer = project.customer ? JSON.parse(project.customer) : undefined;

    const promptContext: PromptContext = {
      projectTitle: project.title,
      projectPrompt: project.projectPrompt || undefined,
      scene: sceneInfo,
      customer,
      systemPrompt,
    };

    // Preview mode: 只返回 prompt，不创建任务
    if (mode === 'preview') {
      const prompt = buildGeneratePlanPrompt(promptContext);
      return c.json({ prompt });
    }

    // Execute mode: 创建任务
    // 检查是否已有进行中的生成任务
    const existingTasks = await db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.relatedId, projectId),
          eq(tasks.type, 'plan-generation'),
          inArray(tasks.status, ['pending', 'running'])
        )
      );

    if (existingTasks.length > 0) {
      return c.json({
        taskId: existingTasks[0].id,
        status: existingTasks[0].status,
        message: '已有生成任务进行中',
      });
    }

    // 创建新任务（传入 customPrompt 如果有的话）
    const taskId = randomUUID();
    const now = new Date();

    await db.insert(tasks).values({
      id: taskId,
      type: 'plan-generation',
      status: 'pending',
      input: JSON.stringify({ projectId, customPrompt }),
      relatedId: projectId,
      relatedMeta: project.title,
      createdAt: now,
      updatedAt: now,
    });

    return c.json({
      taskId,
      status: 'pending',
      message: '预案生成任务已创建',
    }, 201);
  } catch (error: unknown) {
    console.error('Generate plan error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: `创建生成任务失败: ${message}` }, 500);
  }
});

// 获取项目相关的任务
projectRoutes.get('/:id/tasks', async (c) => {
  try {
    const projectId = c.req.param('id');
    const db = getDb();

    const projectTasks = await db
      .select()
      .from(tasks)
      .where(eq(tasks.relatedId, projectId))
      .orderBy(tasks.createdAt);

    return c.json({
      tasks: projectTasks.map((t) => ({
        ...t,
        input: JSON.parse(t.input),
        output: t.output ? JSON.parse(t.output) : null,
      })),
    });
  } catch (error: unknown) {
    console.error('Get project tasks error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: `获取项目任务失败: ${message}` }, 500);
  }
});
