import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { getDb } from '../db';
import { sceneAssets } from '../db/schema';

export const assetsRoutes = new Hono();

// 获取所有场景资产
assetsRoutes.get('/scenes', async (c) => {
  try {
    const db = getDb();
    const scenes = await db.select().from(sceneAssets).orderBy(sceneAssets.createdAt);

    // 解析 JSON 字段
    const parsed = scenes.map((s) => ({
      ...s,
      tags: s.tags ? JSON.parse(s.tags) : [],
      style: s.style ? JSON.parse(s.style) : null,
    }));

    return c.json({ data: parsed, total: parsed.length });
  } catch (error: unknown) {
    console.error('Get scenes error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: `获取场景列表失败: ${message}` }, 500);
  }
});

// 获取单个场景资产
assetsRoutes.get('/scenes/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const db = getDb();

    const [scene] = await db.select().from(sceneAssets).where(eq(sceneAssets.id, id));

    if (!scene) {
      return c.json({ error: '场景不存在' }, 404);
    }

    // 解析 JSON 字段
    const parsed = {
      ...scene,
      tags: scene.tags ? JSON.parse(scene.tags) : [],
      style: scene.style ? JSON.parse(scene.style) : null,
    };

    return c.json(parsed);
  } catch (error: unknown) {
    console.error('Get scene error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: `获取场景失败: ${message}` }, 500);
  }
});

// 创建场景资产
assetsRoutes.post('/scenes', async (c) => {
  try {
    const body = await c.req.json();
    const db = getDb();

    const id = randomUUID();
    const now = new Date();

    const newScene = {
      id,
      name: body.name,
      description: body.description || null,
      primaryImage: body.primaryImage || null,
      defaultLighting: body.defaultLighting || null,
      tags: body.tags ? JSON.stringify(body.tags) : null,
      isOutdoor: body.isOutdoor ?? false,
      style: body.style ? JSON.stringify(body.style) : null,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(sceneAssets).values(newScene);

    // 返回解析后的数据
    return c.json({
      ...newScene,
      tags: body.tags || [],
      style: body.style || null,
    }, 201);
  } catch (error: unknown) {
    console.error('Create scene error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: `创建场景失败: ${message}` }, 500);
  }
});

// 更新场景资产
assetsRoutes.put('/scenes/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const db = getDb();

    // 检查是否存在
    const [existing] = await db.select().from(sceneAssets).where(eq(sceneAssets.id, id));
    if (!existing) {
      return c.json({ error: '场景不存在' }, 404);
    }

    const now = new Date();

    const updates: Record<string, unknown> = {
      updatedAt: now,
    };

    // 只更新提供的字段
    if (body.name !== undefined) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description;
    if (body.primaryImage !== undefined) updates.primaryImage = body.primaryImage;
    if (body.defaultLighting !== undefined) updates.defaultLighting = body.defaultLighting;
    if (body.tags !== undefined) updates.tags = JSON.stringify(body.tags);
    if (body.isOutdoor !== undefined) updates.isOutdoor = body.isOutdoor;
    if (body.style !== undefined) updates.style = JSON.stringify(body.style);

    await db.update(sceneAssets).set(updates).where(eq(sceneAssets.id, id));

    // 获取更新后的数据
    const [updated] = await db.select().from(sceneAssets).where(eq(sceneAssets.id, id));

    return c.json({
      ...updated,
      tags: updated.tags ? JSON.parse(updated.tags) : [],
      style: updated.style ? JSON.parse(updated.style) : null,
    });
  } catch (error: unknown) {
    console.error('Update scene error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: `更新场景失败: ${message}` }, 500);
  }
});

// 删除场景资产
assetsRoutes.delete('/scenes/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const db = getDb();

    // 检查是否存在
    const [existing] = await db.select().from(sceneAssets).where(eq(sceneAssets.id, id));
    if (!existing) {
      return c.json({ error: '场景不存在' }, 404);
    }

    await db.delete(sceneAssets).where(eq(sceneAssets.id, id));

    return c.json({ success: true });
  } catch (error: unknown) {
    console.error('Delete scene error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: `删除场景失败: ${message}` }, 500);
  }
});
