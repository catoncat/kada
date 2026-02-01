import { Hono } from 'hono';
import { getDb } from '../db';
import { tasks } from '../db/schema';
import { eq, desc, and, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

export const taskRoutes = new Hono();

// 创建任务
taskRoutes.post('/', async (c) => {
  const body = await c.req.json();
  const { type, input, relatedId, relatedMeta } = body;

  if (!type || !input) {
    return c.json({ error: 'type and input are required' }, 400);
  }

  const db = getDb();
  const id = randomUUID();
  const now = new Date();

  await db.insert(tasks).values({
    id,
    type,
    status: 'pending',
    input: JSON.stringify(input),
    relatedId: relatedId || null,
    relatedMeta: relatedMeta || null,
    createdAt: now,
    updatedAt: now,
  });

  return c.json({ task: { id, type, status: 'pending' } }, 201);
});

// 获取单个任务
taskRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');
  const db = getDb();

  const [task] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);

  if (!task) {
    return c.json({ error: 'Task not found' }, 404);
  }

  return c.json({
    task: {
      ...task,
      input: JSON.parse(task.input),
      output: task.output ? JSON.parse(task.output) : null,
    },
  });
});

// 获取任务列表
taskRoutes.get('/', async (c) => {
  const db = getDb();
  const status = c.req.query('status');
  const type = c.req.query('type');
  const relatedId = c.req.query('relatedId');
  const limit = parseInt(c.req.query('limit') || '50', 10);

  let query = db.select().from(tasks);

  const conditions = [];
  if (status) {
    const statuses = status.split(',');
    conditions.push(inArray(tasks.status, statuses));
  }
  if (type) {
    conditions.push(eq(tasks.type, type));
  }
  if (relatedId) {
    conditions.push(eq(tasks.relatedId, relatedId));
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as typeof query;
  }

  const result = await query.orderBy(desc(tasks.createdAt)).limit(limit);

  return c.json({
    tasks: result.map((t) => ({
      ...t,
      input: JSON.parse(t.input),
      output: t.output ? JSON.parse(t.output) : null,
    })),
  });
});

// 删除/取消任务
taskRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const db = getDb();

  const [task] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);

  if (!task) {
    return c.json({ error: 'Task not found' }, 404);
  }

  // 只能删除 pending 或已完成的任务
  if (task.status === 'running') {
    return c.json({ error: 'Cannot delete running task' }, 400);
  }

  await db.delete(tasks).where(eq(tasks.id, id));

  return c.json({ success: true });
});

// 重试失败的任务
taskRoutes.post('/:id/retry', async (c) => {
  const id = c.req.param('id');
  const db = getDb();

  const [task] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);

  if (!task) {
    return c.json({ error: 'Task not found' }, 404);
  }

  // 只能重试 failed 状态的任务
  if (task.status !== 'failed') {
    return c.json({ error: 'Only failed tasks can be retried' }, 400);
  }

  // 重置为 pending 状态
  const now = new Date();
  await db
    .update(tasks)
    .set({
      status: 'pending',
      error: null,
      output: null,
      updatedAt: now,
    })
    .where(eq(tasks.id, id));

  const [updated] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);

  return c.json({
    task: {
      ...updated,
      input: JSON.parse(updated!.input),
      output: null,
    },
  });
});

// 批量查询任务状态（用于前端轮询）
taskRoutes.post('/batch-status', async (c) => {
  const body = await c.req.json();
  const { ids } = body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return c.json({ error: 'ids array is required' }, 400);
  }

  const db = getDb();
  const result = await db.select().from(tasks).where(inArray(tasks.id, ids));

  return c.json({
    tasks: result.map((t) => ({
      ...t,
      input: JSON.parse(t.input),
      output: t.output ? JSON.parse(t.output) : null,
    })),
  });
});
