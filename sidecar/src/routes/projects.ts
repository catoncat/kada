import { Hono } from 'hono';
import { eq, and, inArray, desc, sql, isNull } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { getDb } from '../db';
import { projects, tasks, sceneAssets, settings, generationRuns, generationArtifacts } from '../db/schema';
import { buildGeneratePlanPrompt, type PromptContext } from '../worker/handlers/plan-generation';

export const projectRoutes = new Hono();

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

      // 预览图进度（简化版：基于 generatedPlan 中的场景数）
      let previewProgress: { done: number; total: number } | undefined;
      if (p.generatedPlan) {
        try {
          const plan = JSON.parse(p.generatedPlan);
          const scenes = plan.scenes || [];
          const total = scenes.length;
          // 统计有预览图的场景数：优先用 artifacts（更可靠），兼容旧字段 previewUrl
          const doneFromArtifacts = previewSlotsByProject.get(p.id)?.size ?? 0;
          const doneFromPlan = scenes.filter((s: { previewUrl?: string; previewArtifactPath?: string }) => s.previewArtifactPath || s.previewUrl).length;
          const done = Math.max(doneFromArtifacts, doneFromPlan);
          if (total > 0) {
            previewProgress = { done, total };
          }
        } catch {
          // 解析失败忽略
        }
      }

      return {
        ...p,
        selectedOutfits: p.selectedOutfits ? JSON.parse(p.selectedOutfits) : [],
        selectedProps: p.selectedProps ? JSON.parse(p.selectedProps) : [],
        params: p.params ? JSON.parse(p.params) : null,
        customer: p.customer ? JSON.parse(p.customer) : null,
        generatedPlan: p.generatedPlan ? JSON.parse(p.generatedPlan) : null,
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

    // 解析 JSON 字段
    const generatedPlan = project.generatedPlan ? JSON.parse(project.generatedPlan) : null;

    // 为 generatedPlan.scenes 注入预览图（来自 artifacts）
    if (generatedPlan?.scenes && Array.isArray(generatedPlan.scenes) && generatedPlan.scenes.length > 0) {
      const slots = generatedPlan.scenes.map((_: unknown, index: number) => `scene:${index}`);

      const artifacts = await db
        .select({
          ownerSlot: generationArtifacts.ownerSlot,
          filePath: generationArtifacts.filePath,
          createdAt: generationArtifacts.createdAt,
        })
        .from(generationArtifacts)
        .where(
          and(
            eq(generationArtifacts.ownerType, 'planScene'),
            eq(generationArtifacts.ownerId, id),
            inArray(generationArtifacts.ownerSlot, slots),
            isNull(generationArtifacts.deletedAt),
          )
        )
        .orderBy(desc(generationArtifacts.createdAt));

      const latestBySlot = new Map<string, string>();
      for (const a of artifacts) {
        if (!a.ownerSlot || !a.filePath) continue;
        if (!latestBySlot.has(a.ownerSlot)) {
          latestBySlot.set(a.ownerSlot, a.filePath);
        }
      }

      generatedPlan.scenes = generatedPlan.scenes.map((scene: Record<string, unknown>, index: number) => {
        const slot = `scene:${index}`;
        const filePath = latestBySlot.get(slot);
        if (!filePath) return scene;
        const previewPath = filePath.startsWith('/') ? filePath : `/${filePath}`;
        return {
          ...scene,
          previewArtifactPath: previewPath,
          // 兼容旧字段
          previewUrl: previewPath,
        };
      });
    }

    const parsed = {
      ...project,
      selectedOutfits: project.selectedOutfits ? JSON.parse(project.selectedOutfits) : [],
      selectedProps: project.selectedProps ? JSON.parse(project.selectedProps) : [],
      params: project.params ? JSON.parse(project.params) : null,
      customer: project.customer ? JSON.parse(project.customer) : null,
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
      selectedOutfits: null,
      selectedProps: null,
      params: null,
      customer: null,
      selectedModels: null,
      generatedPlan: null,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(projects).values(newProject);

    return c.json({
      ...newProject,
      selectedOutfits: [],
      selectedProps: [],
      params: null,
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
    if (body.selectedOutfits !== undefined) {
      updates.selectedOutfits = JSON.stringify(body.selectedOutfits);
    }
    if (body.selectedProps !== undefined) {
      updates.selectedProps = JSON.stringify(body.selectedProps);
    }
    if (body.params !== undefined) {
      updates.params = body.params ? JSON.stringify(body.params) : null;
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
      updates.generatedPlan = body.generatedPlan ? JSON.stringify(body.generatedPlan) : null;
    }

    await db.update(projects).set(updates).where(eq(projects.id, id));

    // 获取更新后的数据
    const [updated] = await db.select().from(projects).where(eq(projects.id, id));

    return c.json({
      ...updated,
      selectedOutfits: updated.selectedOutfits ? JSON.parse(updated.selectedOutfits) : [],
      selectedProps: updated.selectedProps ? JSON.parse(updated.selectedProps) : [],
      params: updated.params ? JSON.parse(updated.params) : null,
      customer: updated.customer ? JSON.parse(updated.customer) : null,
      generatedPlan: updated.generatedPlan ? JSON.parse(updated.generatedPlan) : null,
    });
  } catch (error: unknown) {
    console.error('Update project error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: `更新项目失败: ${message}` }, 500);
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
