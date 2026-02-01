/**
 * Artifacts 路由
 * 管理 GenerationArtifact（图片产物的版本管理）
 */

import { Hono } from 'hono';
import { getDb } from '../db';
import { generationArtifacts, sceneAssets } from '../db/schema';
import { eq, and, isNull, desc, sql, count } from 'drizzle-orm';
import { existsSync, unlinkSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

export const artifactsRoutes = new Hono();

// 获取数据目录
function getDataDir(): string {
  return process.env.DATA_DIR || path.join(process.cwd(), 'data');
}

/**
 * GET /api/artifacts
 * 查询 artifacts（按 owner 过滤）
 *
 * Query params:
 *   - ownerType: 'asset' | 'projectPlanVersion' | 'planScene'
 *   - ownerId: string
 *   - slot?: string (可选)
 *   - includeDeleted?: boolean (默认 false)
 */
artifactsRoutes.get('/', async (c) => {
  const db = getDb();
  const { ownerType, ownerId, slot, includeDeleted } = c.req.query();

  if (!ownerType || !ownerId) {
    return c.json({ error: 'ownerType and ownerId are required' }, 400);
  }

  // 构建查询条件
  const conditions = [
    eq(generationArtifacts.ownerType, ownerType),
    eq(generationArtifacts.ownerId, ownerId),
  ];

  if (slot) {
    conditions.push(eq(generationArtifacts.ownerSlot, slot));
  }

  if (includeDeleted !== 'true') {
    conditions.push(isNull(generationArtifacts.deletedAt));
  }

  const artifacts = await db
    .select()
    .from(generationArtifacts)
    .where(and(...conditions))
    .orderBy(desc(generationArtifacts.createdAt));

  // 获取当前版本指针
  let currentArtifactId: string | null = null;

  if (ownerType === 'asset') {
    const [asset] = await db
      .select({ primaryImage: sceneAssets.primaryImage })
      .from(sceneAssets)
      .where(eq(sceneAssets.id, ownerId))
      .limit(1);

    // primaryImage 存储的是 filePath，需要找对应的 artifactId
    if (asset?.primaryImage) {
      const [currentArtifact] = await db
        .select({ id: generationArtifacts.id })
        .from(generationArtifacts)
        .where(
          and(
            eq(generationArtifacts.filePath, asset.primaryImage.replace(/^\//, '')),
            isNull(generationArtifacts.deletedAt)
          )
        )
        .limit(1);

      currentArtifactId = currentArtifact?.id || null;
    }
  }

  return c.json({
    artifacts,
    currentArtifactId,
  });
});

/**
 * GET /api/artifacts/:id
 * 获取单个 artifact
 */
artifactsRoutes.get('/:id', async (c) => {
  const db = getDb();
  const id = c.req.param('id');

  const [artifact] = await db
    .select()
    .from(generationArtifacts)
    .where(eq(generationArtifacts.id, id))
    .limit(1);

  if (!artifact) {
    return c.json({ error: 'Artifact not found' }, 404);
  }

  return c.json({ artifact });
});

/**
 * POST /api/artifacts/:id/set-current
 * 将指定 artifact 设为当前版本
 *
 * 目前只支持 ownerType='asset' 的场景
 */
artifactsRoutes.post('/:id/set-current', async (c) => {
  const db = getDb();
  const id = c.req.param('id');

  // 获取 artifact
  const [artifact] = await db
    .select()
    .from(generationArtifacts)
    .where(
      and(eq(generationArtifacts.id, id), isNull(generationArtifacts.deletedAt))
    )
    .limit(1);

  if (!artifact) {
    return c.json({ error: 'Artifact not found or deleted' }, 404);
  }

  // 根据 ownerType 更新对应的指针
  if (artifact.ownerType === 'asset' && artifact.ownerId) {
    await db
      .update(sceneAssets)
      .set({
        primaryImage: `/${artifact.filePath}`,
        updatedAt: new Date(),
      })
      .where(eq(sceneAssets.id, artifact.ownerId));

    return c.json({ success: true });
  }

  // 其他 ownerType 暂未实现
  return c.json({ error: 'Unsupported ownerType for set-current' }, 400);
});

/**
 * DELETE /api/artifacts/:id
 * 删除 artifact（软删除 + 可选物理删除文件）
 *
 * Query params:
 *   - deleteFile: 'true' | 'false' (默认 true)
 */
artifactsRoutes.delete('/:id', async (c) => {
  const db = getDb();
  const id = c.req.param('id');
  const deleteFile = c.req.query('deleteFile') !== 'false';

  // 获取 artifact
  const [artifact] = await db
    .select()
    .from(generationArtifacts)
    .where(eq(generationArtifacts.id, id))
    .limit(1);

  if (!artifact) {
    return c.json({ error: 'Artifact not found' }, 404);
  }

  // 检查是否是当前版本（如果是，需要自动回退）
  if (artifact.ownerType === 'asset' && artifact.ownerId) {
    const [asset] = await db
      .select({ primaryImage: sceneAssets.primaryImage })
      .from(sceneAssets)
      .where(eq(sceneAssets.id, artifact.ownerId))
      .limit(1);

    const currentFilePath = asset?.primaryImage?.replace(/^\//, '');

    if (currentFilePath === artifact.filePath) {
      // 找到下一个最新版本
      const [nextArtifact] = await db
        .select()
        .from(generationArtifacts)
        .where(
          and(
            eq(generationArtifacts.ownerType, artifact.ownerType),
            eq(generationArtifacts.ownerId, artifact.ownerId),
            isNull(generationArtifacts.deletedAt)
          )
        )
        .orderBy(desc(generationArtifacts.createdAt))
        .limit(2); // 取两个，第一个是当前的

      // 获取第二个（如果有）
      const artifacts = await db
        .select()
        .from(generationArtifacts)
        .where(
          and(
            eq(generationArtifacts.ownerType, artifact.ownerType),
            eq(generationArtifacts.ownerId, artifact.ownerId),
            isNull(generationArtifacts.deletedAt)
          )
        )
        .orderBy(desc(generationArtifacts.createdAt))
        .limit(2);

      const fallback = artifacts.find((a) => a.id !== id);

      await db
        .update(sceneAssets)
        .set({
          primaryImage: fallback ? `/${fallback.filePath}` : null,
          updatedAt: new Date(),
        })
        .where(eq(sceneAssets.id, artifact.ownerId));
    }
  }

  // 软删除
  await db
    .update(generationArtifacts)
    .set({
      deletedAt: new Date(),
    })
    .where(eq(generationArtifacts.id, id));

  // 可选：物理删除文件
  if (deleteFile && artifact.filePath) {
    const dataDir = getDataDir();
    const fullPath = path.join(dataDir, artifact.filePath);
    if (existsSync(fullPath)) {
      try {
        unlinkSync(fullPath);
      } catch (err) {
        console.error('Failed to delete file:', fullPath, err);
      }
    }
  }

  return c.json({ success: true });
});

/**
 * GET /api/artifacts/stats
 * 获取存储统计信息
 */
artifactsRoutes.get('/stats', async (c) => {
  const db = getDb();
  const dataDir = getDataDir();
  const uploadDir = path.join(dataDir, 'uploads');

  // 统计 artifacts 数量
  const [activeResult] = await db
    .select({ count: count() })
    .from(generationArtifacts)
    .where(isNull(generationArtifacts.deletedAt));

  const [deletedResult] = await db
    .select({ count: count() })
    .from(generationArtifacts)
    .where(sql`${generationArtifacts.deletedAt} IS NOT NULL`);

  // 统计文件大小
  let totalSizeBytes = 0;
  let fileCount = 0;

  if (existsSync(uploadDir)) {
    try {
      const files = readdirSync(uploadDir);
      for (const file of files) {
        const filePath = path.join(uploadDir, file);
        const stats = statSync(filePath);
        if (stats.isFile()) {
          totalSizeBytes += stats.size;
          fileCount++;
        }
      }
    } catch (err) {
      console.error('Failed to read uploads directory:', err);
    }
  }

  return c.json({
    activeArtifacts: activeResult?.count ?? 0,
    deletedArtifacts: deletedResult?.count ?? 0,
    totalFiles: fileCount,
    totalSizeBytes,
    totalSizeMB: Math.round((totalSizeBytes / (1024 * 1024)) * 100) / 100,
  });
});

/**
 * POST /api/artifacts/cleanup
 * 清理已删除的 artifacts（物理删除文件）
 */
artifactsRoutes.post('/cleanup', async (c) => {
  const db = getDb();
  const dataDir = getDataDir();

  // 获取所有已软删除的 artifacts
  const deletedArtifacts = await db
    .select()
    .from(generationArtifacts)
    .where(sql`${generationArtifacts.deletedAt} IS NOT NULL`);

  let deletedCount = 0;
  let freedBytes = 0;

  for (const artifact of deletedArtifacts) {
    if (artifact.filePath) {
      const fullPath = path.join(dataDir, artifact.filePath);
      if (existsSync(fullPath)) {
        try {
          const stats = statSync(fullPath);
          unlinkSync(fullPath);
          freedBytes += stats.size;
          deletedCount++;
        } catch (err) {
          console.error('Failed to delete file:', fullPath, err);
        }
      }
    }
  }

  // 从数据库中永久删除记录
  await db
    .delete(generationArtifacts)
    .where(sql`${generationArtifacts.deletedAt} IS NOT NULL`);

  return c.json({
    deletedCount,
    freedBytes,
    freedMB: Math.round((freedBytes / (1024 * 1024)) * 100) / 100,
  });
});
