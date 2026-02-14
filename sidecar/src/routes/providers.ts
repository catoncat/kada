import { Hono } from 'hono';
import { getDb } from '../db';
import { providers } from '../db/schema';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import {
  detectProviderCapabilities,
  type ProviderCapabilities,
} from '../services/provider-capabilities';

export const providerRoutes = new Hono();

function toCapabilitiesJson(value: ProviderCapabilities): string {
  return JSON.stringify(value);
}

function toProbeInput(source: {
  format: string;
  baseUrl: string;
  apiKey: string;
  textModel: string;
  imageModel: string;
}) {
  return {
    format: source.format,
    baseUrl: source.baseUrl,
    apiKey: source.apiKey,
    textModel: source.textModel,
    imageModel: source.imageModel,
  };
}

// 获取所有 Providers
providerRoutes.get('/', async (c) => {
  const db = getDb();
  const list = await db.select().from(providers).all();
  return c.json({ providers: list });
});

// 获取默认 Provider
providerRoutes.get('/default', async (c) => {
  const db = getDb();
  const [provider] = await db.select().from(providers).where(eq(providers.isDefault, true)).limit(1);
  return c.json({ provider: provider || null });
});

// 获取单个 Provider
providerRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');
  const db = getDb();
  const [provider] = await db.select().from(providers).where(eq(providers.id, id)).limit(1);
  if (!provider) {
    return c.json({ error: 'Provider not found' }, 404);
  }
  return c.json({ provider });
});

// 创建 Provider
providerRoutes.post('/', async (c) => {
  const body = await c.req.json();
  const db = getDb();

  const id = randomUUID();
  const now = new Date();
  const capabilities = await detectProviderCapabilities(toProbeInput(body));

  // 如果设为默认，先取消其他默认
  if (body.isDefault) {
    await db.update(providers).set({ isDefault: false }).run();
  }

  await db.insert(providers).values({
    id,
    name: body.name,
    format: body.format,
    baseUrl: body.baseUrl,
    apiKey: body.apiKey,
    textModel: body.textModel,
    imageModel: body.imageModel,
    capabilities: toCapabilitiesJson(capabilities),
    isDefault: body.isDefault || false,
    isBuiltin: body.isBuiltin || false,
    createdAt: now,
    updatedAt: now,
  }).run();

  const [newProvider] = await db.select().from(providers).where(eq(providers.id, id)).limit(1);
  return c.json({ provider: newProvider }, 201);
});

// 更新 Provider
providerRoutes.put('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const db = getDb();
  const [existing] = await db
    .select()
    .from(providers)
    .where(eq(providers.id, id))
    .limit(1);
  if (!existing) {
    return c.json({ error: 'Provider not found' }, 404);
  }

  const mergedForProbe = toProbeInput({
    format: body.format ?? existing.format,
    baseUrl: body.baseUrl ?? existing.baseUrl,
    apiKey: body.apiKey ?? existing.apiKey,
    textModel: body.textModel ?? existing.textModel,
    imageModel: body.imageModel ?? existing.imageModel,
  });
  const capabilityRelevantChanged = [
    'format',
    'baseUrl',
    'apiKey',
    'textModel',
    'imageModel',
  ].some((key) => key in body);
  const nextCapabilities =
    capabilityRelevantChanged || !existing.capabilities
      ? toCapabilitiesJson(await detectProviderCapabilities(mergedForProbe))
      : existing.capabilities;

  // 如果设为默认，先取消其他默认
  if (body.isDefault) {
    await db.update(providers).set({ isDefault: false }).run();
  }

  await db.update(providers).set({
    ...body,
    capabilities: nextCapabilities,
    updatedAt: new Date(),
  }).where(eq(providers.id, id)).run();

  const [updated] = await db.select().from(providers).where(eq(providers.id, id)).limit(1);
  return c.json({ provider: updated });
});

// 手动重探测能力（用于历史 provider 回填）
providerRoutes.post('/:id/redetect', async (c) => {
  const id = c.req.param('id');
  const db = getDb();
  const [existing] = await db
    .select()
    .from(providers)
    .where(eq(providers.id, id))
    .limit(1);
  if (!existing) {
    return c.json({ error: 'Provider not found' }, 404);
  }

  const capabilities = await detectProviderCapabilities(
    toProbeInput({
      format: existing.format,
      baseUrl: existing.baseUrl,
      apiKey: existing.apiKey,
      textModel: existing.textModel,
      imageModel: existing.imageModel,
    }),
  );

  await db
    .update(providers)
    .set({
      capabilities: toCapabilitiesJson(capabilities),
      updatedAt: new Date(),
    })
    .where(eq(providers.id, id))
    .run();

  const [updated] = await db.select().from(providers).where(eq(providers.id, id)).limit(1);
  return c.json({ provider: updated });
});

// 删除 Provider
providerRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const db = getDb();

  // 不能删除内置 Provider
  const [provider] = await db.select().from(providers).where(eq(providers.id, id)).limit(1);
  if (provider?.isBuiltin) {
    return c.json({ error: 'Cannot delete builtin provider' }, 400);
  }

  await db.delete(providers).where(eq(providers.id, id)).run();
  return c.json({ success: true });
});

// 设为默认
providerRoutes.post('/:id/set-default', async (c) => {
  const id = c.req.param('id');
  const db = getDb();

  await db.update(providers).set({ isDefault: false }).run();
  await db.update(providers).set({ isDefault: true, updatedAt: new Date() }).where(eq(providers.id, id)).run();

  return c.json({ success: true });
});
