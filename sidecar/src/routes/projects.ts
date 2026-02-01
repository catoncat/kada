import { Hono } from 'hono';
import { eq, and, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { getDb } from '../db';
import { projects, tasks, sceneAssets } from '../db/schema';

export const projectRoutes = new Hono();

// 获取所有项目
projectRoutes.get('/', async (c) => {
  try {
    const db = getDb();
    const list = await db.select().from(projects).orderBy(projects.createdAt);

    // 解析 JSON 字段
    const parsed = list.map((p) => ({
      ...p,
      selectedOutfits: p.selectedOutfits ? JSON.parse(p.selectedOutfits) : [],
      selectedProps: p.selectedProps ? JSON.parse(p.selectedProps) : [],
      params: p.params ? JSON.parse(p.params) : null,
      generatedPlan: p.generatedPlan ? JSON.parse(p.generatedPlan) : null,
    }));

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
    const parsed = {
      ...project,
      selectedOutfits: project.selectedOutfits ? JSON.parse(project.selectedOutfits) : [],
      selectedProps: project.selectedProps ? JSON.parse(project.selectedProps) : [],
      params: project.params ? JSON.parse(project.params) : null,
      generatedPlan: project.generatedPlan ? JSON.parse(project.generatedPlan) : null,
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
      status: 'draft',
      selectedScene: null,
      selectedOutfits: null,
      selectedProps: null,
      params: null,
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

// 生成预案（创建任务）
projectRoutes.post('/:id/generate', async (c) => {
  try {
    const projectId = c.req.param('id');
    const db = getDb();

    // 获取项目
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
    if (!project) {
      return c.json({ error: '项目不存在' }, 404);
    }

    if (!project.selectedScene) {
      return c.json({ error: '请先选择场景' }, 400);
    }

    // 检查场景是否存在
    const [scene] = await db.select().from(sceneAssets).where(eq(sceneAssets.id, project.selectedScene));
    if (!scene) {
      return c.json({ error: '所选场景不存在' }, 400);
    }

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
      // 返回已有任务
      return c.json({
        taskId: existingTasks[0].id,
        status: existingTasks[0].status,
        message: '已有生成任务进行中',
      });
    }

    // 创建新任务
    const taskId = randomUUID();
    const now = new Date();

    await db.insert(tasks).values({
      id: taskId,
      type: 'plan-generation',
      status: 'pending',
      input: JSON.stringify({ projectId }),
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
