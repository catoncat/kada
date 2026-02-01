/**
 * Settings API 路由
 * 键值存储，支持 JSON 值的自动序列化/反序列化
 */

import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { getDb } from '../db';
import { settings } from '../db/schema';

export const settingsRoutes = new Hono();

// 获取设置项
settingsRoutes.get('/:key', async (c) => {
  try {
    const key = c.req.param('key');
    const db = getDb();

    const [setting] = await db
      .select()
      .from(settings)
      .where(eq(settings.key, key));

    if (!setting) {
      return c.json({ key, value: null });
    }

    // 尝试解析 JSON
    try {
      return c.json({ key, value: JSON.parse(setting.value) });
    } catch {
      return c.json({ key, value: setting.value });
    }
  } catch (error: unknown) {
    console.error('Get setting error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: `获取设置失败: ${message}` }, 500);
  }
});

// 更新设置项（upsert）
settingsRoutes.put('/:key', async (c) => {
  try {
    const key = c.req.param('key');
    const body = await c.req.json();
    const db = getDb();

    const value =
      typeof body.value === 'string'
        ? body.value
        : JSON.stringify(body.value);

    const now = new Date();

    // SQLite upsert
    await db
      .insert(settings)
      .values({ key, value, updatedAt: now })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value, updatedAt: now },
      });

    // 返回解析后的值
    try {
      return c.json({ key, value: JSON.parse(value) });
    } catch {
      return c.json({ key, value });
    }
  } catch (error: unknown) {
    console.error('Update setting error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: `更新设置失败: ${message}` }, 500);
  }
});

// 删除设置项
settingsRoutes.delete('/:key', async (c) => {
  try {
    const key = c.req.param('key');
    const db = getDb();

    await db.delete(settings).where(eq(settings.key, key));

    return c.json({ success: true });
  } catch (error: unknown) {
    console.error('Delete setting error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: `删除设置失败: ${message}` }, 500);
  }
});

// 批量获取多个设置项
settingsRoutes.post('/batch', async (c) => {
  try {
    const body = await c.req.json();
    const keys: string[] = body.keys || [];
    const db = getDb();

    if (keys.length === 0) {
      return c.json({ data: {} });
    }

    const results = await db.select().from(settings);
    const filtered = results.filter((s) => keys.includes(s.key));

    const data: Record<string, unknown> = {};
    for (const setting of filtered) {
      try {
        data[setting.key] = JSON.parse(setting.value);
      } catch {
        data[setting.key] = setting.value;
      }
    }

    return c.json({ data });
  } catch (error: unknown) {
    console.error('Batch get settings error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: `批量获取设置失败: ${message}` }, 500);
  }
});
