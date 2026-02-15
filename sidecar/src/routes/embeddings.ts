import { Hono } from 'hono';
import {
  enqueueEmbeddingTask,
  getActiveEmbeddingProfile,
  getEmbeddingStatus,
  saveEmbeddingProfile,
  searchEmbeddings,
  setEmbeddingProfileStatus,
} from '../services/embedding/service';

export const embeddingsRoutes = new Hono();

embeddingsRoutes.get('/status', async (c) => {
  try {
    const status = await getEmbeddingStatus();
    return c.json(status);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ error: message || '获取 embedding 状态失败' }, 500);
  }
});

embeddingsRoutes.get('/profile', async (c) => {
  try {
    const profile = await getActiveEmbeddingProfile();
    return c.json({ profile });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ error: message || '获取 embedding profile 失败' }, 500);
  }
});

embeddingsRoutes.put('/profile', async (c) => {
  try {
    const body = await c.req.json();
    const { profile, needsReindex } = await saveEmbeddingProfile({
      id: typeof body.id === 'string' ? body.id : undefined,
      providerId:
        typeof body.providerId === 'string' ? body.providerId : null,
      endpoint: body.endpoint,
      apiKeyRef: typeof body.apiKeyRef === 'string' ? body.apiKeyRef : null,
      model: body.model,
      vectorDim: Number(body.vectorDim),
      normalize: body.normalize !== false,
    });

    let reindexTask = null;
    if (needsReindex) {
      await setEmbeddingProfileStatus(profile.id, 'reindexing');
      reindexTask = await enqueueEmbeddingTask({
        type: 'embedding-reindex',
        input: { profileId: profile.id },
        dedupeRunning: true,
      });
    }

    return c.json({
      profile,
      needsReindex,
      reindexTask,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ error: message || '保存 embedding profile 失败' }, 400);
  }
});

embeddingsRoutes.post('/index', async (c) => {
  try {
    const body = await c.req.json();
    const hasAssetId =
      typeof body.assetId === 'string' && body.assetId.trim().length > 0;
    const hasAssetIds = Array.isArray(body.assetIds) && body.assetIds.length > 0;
    const hasItems = Array.isArray(body.items) && body.items.length > 0;

    if (!hasAssetId && !hasAssetIds && !hasItems) {
      return c.json({ error: 'assetId/assetIds/items 至少提供一个' }, 400);
    }

    const task = await enqueueEmbeddingTask({
      type: 'embedding-index',
      input: {
        assetId: hasAssetId ? body.assetId.trim() : undefined,
        assetIds: hasAssetIds ? body.assetIds : undefined,
        imagePath: typeof body.imagePath === 'string' ? body.imagePath : undefined,
        profileId: typeof body.profileId === 'string' ? body.profileId : undefined,
        force: body.force === true,
        items: hasItems ? body.items : undefined,
      },
      relatedId: hasAssetId ? body.assetId.trim() : null,
    });

    return c.json({ task }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ error: message || '创建 embedding-index 任务失败' }, 500);
  }
});

embeddingsRoutes.post('/reindex', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const profileId =
      typeof body.profileId === 'string' ? body.profileId.trim() : '';
    const task = await enqueueEmbeddingTask({
      type: 'embedding-reindex',
      input: { profileId: profileId || undefined },
      dedupeRunning: true,
    });
    return c.json({ task }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ error: message || '创建 embedding-reindex 任务失败' }, 500);
  }
});

embeddingsRoutes.post('/search', async (c) => {
  try {
    const body = await c.req.json();
    if (body.queryType !== 'text' && body.queryType !== 'image') {
      return c.json({ error: 'queryType 必须是 text 或 image' }, 400);
    }

    const result = await searchEmbeddings({
      queryType: body.queryType,
      text: typeof body.text === 'string' ? body.text : undefined,
      imagePath: typeof body.imagePath === 'string' ? body.imagePath : undefined,
      imageBase64:
        typeof body.imageBase64 === 'string' ? body.imageBase64 : undefined,
      assetId: typeof body.assetId === 'string' ? body.assetId : undefined,
      topK:
        typeof body.topK === 'number' && Number.isFinite(body.topK)
          ? body.topK
          : undefined,
      candidateAssetIds: Array.isArray(body.candidateAssetIds)
        ? body.candidateAssetIds
        : undefined,
    });
    return c.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ error: message || 'embedding 搜索失败' }, 400);
  }
});
