import { Hono } from 'hono';
import { getDb } from '../db';
import { plans } from '../db/schema';
import { eq, desc } from 'drizzle-orm';
import { randomUUID } from 'crypto';

export const planRoutes = new Hono();

// 获取所有计划
planRoutes.get('/', async (c) => {
  const limit = parseInt(c.req.query('limit') || '20', 10);
  const db = getDb();
  const list = await db
    .select()
    .from(plans)
    .orderBy(desc(plans.createdAt))
    .limit(limit)
    .all();

  return c.json({
    plans: list.map((p) => ({
      ...p,
      data: JSON.parse(p.data),
    })),
  });
});

// 获取单个计划
planRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');
  const db = getDb();
  const [plan] = await db.select().from(plans).where(eq(plans.id, id)).limit(1);
  if (!plan) {
    return c.json({ error: 'Plan not found' }, 404);
  }
  return c.json({
    plan: {
      ...plan,
      data: JSON.parse(plan.data),
    },
  });
});

// 创建计划
planRoutes.post('/', async (c) => {
  const body = await c.req.json();
  const db = getDb();

  const id = randomUUID();
  const now = new Date();

  await db.insert(plans).values({
    id,
    title: body.title,
    kind: body.kind || 'single',
    data: JSON.stringify(body.data),
    createdAt: now,
    updatedAt: now,
  }).run();

  const [newPlan] = await db.select().from(plans).where(eq(plans.id, id)).limit(1);
  return c.json({
    plan: {
      ...newPlan,
      data: JSON.parse(newPlan!.data),
    },
  }, 201);
});

// 更新计划
planRoutes.put('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const db = getDb();

  await db.update(plans).set({
    title: body.title,
    data: JSON.stringify(body.data),
    updatedAt: new Date(),
  }).where(eq(plans.id, id)).run();

  const [updated] = await db.select().from(plans).where(eq(plans.id, id)).limit(1);
  return c.json({
    plan: {
      ...updated,
      data: JSON.parse(updated!.data),
    },
  });
});

// 删除计划
planRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const db = getDb();
  await db.delete(plans).where(eq(plans.id, id)).run();
  return c.json({ success: true });
});
