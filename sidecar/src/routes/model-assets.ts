import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { getDb } from '../db';
import { modelAssets, type ModelAsset } from '../db/schema';

export const modelAssetsRoutes = new Hono();

// 解析 JSON 字段
function parseModelAsset(m: typeof modelAssets.$inferSelect) {
  return {
    ...m,
    referenceImages: m.referenceImages ? JSON.parse(m.referenceImages) : [],
  };
}

// 获取模特列表
modelAssetsRoutes.get('/', async (c) => {
  try {
    const db = getDb();
    const models: ModelAsset[] = await db
      .select()
      .from(modelAssets)
      .orderBy(modelAssets.createdAt);

    const parsed = models.map(parseModelAsset);
    return c.json({ data: parsed, total: parsed.length });
  } catch (error: unknown) {
    console.error('Get models error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: `获取模特列表失败: ${message}` }, 500);
  }
});

// 自动匹配（必须在 /:id 之前注册）
modelAssetsRoutes.post('/auto-match', async (c) => {
  try {
    const body = await c.req.json();
    const { people } = body as {
      people: Array<{ id: string; role: string; gender?: string; age?: number }>;
    };

    if (!Array.isArray(people)) {
      return c.json({ error: '缺少 people 参数' }, 400);
    }

    const db = getDb();

    // 查询所有可用模特（统一为全局语义）
    const allModels = await db.select().from(modelAssets);

    const matches: Record<string, Array<{ modelId: string; name: string; score: number }>> = {};

    for (const person of people) {
      const scored: Array<{ modelId: string; name: string; score: number }> = [];

      for (const model of allModels) {
        let score = 0;

        // 性别匹配
        if (person.gender && model.gender && person.gender === model.gender) {
          score += 50;
        }

        // 年龄在范围内
        if (person.age != null) {
          const min = model.ageRangeMin ?? 0;
          const max = model.ageRangeMax ?? 999;
          if (person.age >= min && person.age <= max) {
            score += 40;
          }
        }

        if (score > 0) {
          scored.push({ modelId: model.id, name: model.name, score });
        }
      }

      // 按分数降序，取 Top 3
      scored.sort((a, b) => b.score - a.score);
      matches[person.id] = scored.slice(0, 3);
    }

    return c.json({ matches });
  } catch (error: unknown) {
    console.error('Auto-match error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: `自动匹配失败: ${message}` }, 500);
  }
});

// 获取单个模特
modelAssetsRoutes.get('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const db = getDb();

    const [model] = await db.select().from(modelAssets).where(eq(modelAssets.id, id));

    if (!model) {
      return c.json({ error: '模特不存在' }, 404);
    }

    return c.json(parseModelAsset(model));
  } catch (error: unknown) {
    console.error('Get model error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: `获取模特失败: ${message}` }, 500);
  }
});

// 创建模特
modelAssetsRoutes.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const db = getDb();

    if (!body.name) {
      return c.json({ error: '名称不能为空' }, 400);
    }

    const id = randomUUID();
    const now = new Date();

    const newModel = {
      id,
      name: body.name,
      gender: body.gender || null,
      ageRangeMin: body.ageRangeMin ?? null,
      ageRangeMax: body.ageRangeMax ?? null,
      appearancePrompt: body.appearancePrompt || null,
      primaryImage: body.primaryImage || null,
      referenceImages: body.referenceImages ? JSON.stringify(body.referenceImages) : null,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(modelAssets).values(newModel);

    return c.json(
      {
        ...newModel,
        referenceImages: body.referenceImages || [],
      },
      201,
    );
  } catch (error: unknown) {
    console.error('Create model error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: `创建模特失败: ${message}` }, 500);
  }
});

// 更新模特
modelAssetsRoutes.put('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const db = getDb();

    const [existing] = await db.select().from(modelAssets).where(eq(modelAssets.id, id));
    if (!existing) {
      return c.json({ error: '模特不存在' }, 404);
    }

    const now = new Date();
    const updates: Record<string, unknown> = { updatedAt: now };

    if (body.name !== undefined) updates.name = body.name;
    if (body.gender !== undefined) updates.gender = body.gender;
    if (body.ageRangeMin !== undefined) updates.ageRangeMin = body.ageRangeMin;
    if (body.ageRangeMax !== undefined) updates.ageRangeMax = body.ageRangeMax;
    if (body.appearancePrompt !== undefined) updates.appearancePrompt = body.appearancePrompt;
    if (body.primaryImage !== undefined) updates.primaryImage = body.primaryImage;
    if (body.referenceImages !== undefined) updates.referenceImages = JSON.stringify(body.referenceImages);

    await db.update(modelAssets).set(updates).where(eq(modelAssets.id, id));

    const [updated] = await db.select().from(modelAssets).where(eq(modelAssets.id, id));

    return c.json(parseModelAsset(updated));
  } catch (error: unknown) {
    console.error('Update model error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: `更新模特失败: ${message}` }, 500);
  }
});

// 删除模特
modelAssetsRoutes.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const db = getDb();

    const [existing] = await db.select().from(modelAssets).where(eq(modelAssets.id, id));
    if (!existing) {
      return c.json({ error: '模特不存在' }, 404);
    }

    await db.delete(modelAssets).where(eq(modelAssets.id, id));

    return c.json({ success: true });
  } catch (error: unknown) {
    console.error('Delete model error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: `删除模特失败: ${message}` }, 500);
  }
});
