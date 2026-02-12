import { Hono } from 'hono';
import { getDb } from '../db';
import {
  tasks,
  generationRuns,
  generationArtifacts,
  providers,
  taskReplayRequests,
} from '../db/schema';
import { eq, desc, and, inArray, isNull } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

export const taskRoutes = new Hono();

type JsonObject = Record<string, unknown>;
type ProviderRow = typeof providers.$inferSelect;
type TaskRow = typeof tasks.$inferSelect;
type GenerationRunRow = typeof generationRuns.$inferSelect;

const DEBUG_TASKS = process.env.SIDECAR_DEBUG_TASKS === '1';
const IDEMPOTENCY_WINDOW_MS = 60_000;

function parseJsonSafely<T>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function toIso(value: Date | number | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function toEpochMs(value: Date | number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.getTime();
}

function hasTextCapability(provider: ProviderRow | null): boolean {
  if (!provider) return false;

  const hasModel = provider.textModel.trim().length > 0;
  if (!hasModel) return false;

  // local provider 允许无 key，其他 provider 需要 key
  if (provider.format === 'local') return true;
  return provider.apiKey.trim().length > 0;
}

function hasImageCapability(provider: ProviderRow | null): boolean {
  if (!provider) return false;

  const hasModel = provider.imageModel.trim().length > 0;
  if (!hasModel) return false;

  if (provider.format === 'local') return true;
  return provider.apiKey.trim().length > 0;
}

async function resolveProviderForInput(
  input: JsonObject,
): Promise<ProviderRow | null> {
  const db = getDb();

  const providerId = typeof input.providerId === 'string'
    ? input.providerId.trim()
    : '';

  if (providerId) {
    const [provider] = await db
      .select()
      .from(providers)
      .where(eq(providers.id, providerId))
      .limit(1);
    return provider || null;
  }

  const [defaultProvider] = await db
    .select()
    .from(providers)
    .where(eq(providers.isDefault, true))
    .limit(1);

  return defaultProvider || null;
}

function buildTimeline(task: TaskRow, run: GenerationRunRow | null) {
  const timeline: Array<{ status: string; at: string }> = [];

  const createdAt = toIso(task.createdAt);
  if (createdAt) {
    timeline.push({ status: 'pending', at: createdAt });
  }

  if (run) {
    const runCreatedAt = toIso(run.createdAt);
    if (runCreatedAt) {
      timeline.push({ status: 'running', at: runCreatedAt });
    }
  }

  const updatedAt = toIso(task.updatedAt);
  if (task.status !== 'pending' && updatedAt) {
    timeline.push({ status: task.status, at: updatedAt });
  }

  return timeline;
}

function buildRecoveryContext(task: TaskRow, input: JsonObject | null) {
  const owner = input?.owner;
  const ownerType =
    owner && typeof owner === 'object' && typeof owner.type === 'string'
      ? owner.type
      : null;
  const ownerId =
    owner && typeof owner === 'object' && typeof owner.id === 'string'
      ? owner.id
      : null;
  const ownerSlot =
    owner && typeof owner === 'object' && typeof owner.slot === 'string'
      ? owner.slot
      : null;

  const sceneMatch = ownerSlot ? ownerSlot.match(/^scene:(\d+)$/) : null;
  const sceneIndex = sceneMatch ? Number(sceneMatch[1]) : null;

  let sourceType: 'projectResult' | 'project' | 'assets' = 'project';
  if (task.type === 'plan-generation' || ownerType === 'planScene') {
    sourceType = 'projectResult';
  } else if (ownerType === 'asset') {
    sourceType = 'assets';
  }

  return {
    sourceType,
    projectId: ownerType === 'planScene' ? ownerId || task.relatedId : task.relatedId,
    sceneIndex,
  };
}

// 创建任务
taskRoutes.post('/', async (c) => {
  const body = await c.req.json();
  const { type, input, relatedId, relatedMeta } = body;

  if (DEBUG_TASKS) {
    console.log('[Tasks] Creating task:', { type, relatedId, hasInput: !!input });
  }

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

  if (DEBUG_TASKS) {
    console.log('[Tasks] Task created:', id);
  }

  return c.json({ task: { id, type, status: 'pending' } }, 201);
});

// 获取任务详情（task + run + artifacts 聚合）
taskRoutes.get('/:id/detail', async (c) => {
  const id = c.req.param('id');
  const db = getDb();

  const [task] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
  if (!task) {
    return c.json({ error: 'Task not found' }, 404);
  }

  const taskInput = parseJsonSafely<JsonObject>(task.input);
  const taskOutput = parseJsonSafely<unknown>(task.output || undefined);

  const [run] = await db
    .select()
    .from(generationRuns)
    .where(eq(generationRuns.taskId, task.id))
    .orderBy(desc(generationRuns.createdAt))
    .limit(1);

  const artifacts = run
    ? await db
        .select()
        .from(generationArtifacts)
        .where(
          and(
            eq(generationArtifacts.runId, run.id),
            isNull(generationArtifacts.deletedAt),
          ),
        )
        .orderBy(desc(generationArtifacts.createdAt))
    : [];

  const missingFields: string[] = [];
  if (!run) {
    missingFields.push('run', 'artifacts');
  } else if (artifacts.length === 0) {
    missingFields.push('artifacts');
  }

  return c.json({
    detail: {
      task: {
        ...task,
        input: taskInput ?? { _raw: task.input },
        output: task.output ? (taskOutput ?? { _raw: task.output }) : null,
        createdAt: toIso(task.createdAt),
        updatedAt: toIso(task.updatedAt),
      },
      run: run
        ? {
            ...run,
            promptContext: parseJsonSafely<JsonObject>(run.promptContext),
            error: parseJsonSafely<JsonObject>(run.error) || (run.error ? { message: run.error } : null),
            createdAt: toIso(run.createdAt),
            updatedAt: toIso(run.updatedAt),
          }
        : null,
      artifacts: artifacts.map((artifact) => ({
        ...artifact,
        promptContext: parseJsonSafely<JsonObject>(artifact.promptContext),
        referenceImages: parseJsonSafely<string[]>(artifact.referenceImages) || [],
        createdAt: toIso(artifact.createdAt),
        deletedAt: toIso(artifact.deletedAt),
      })),
      timeline: buildTimeline(task, run || null),
      recoveryContext: buildRecoveryContext(task, taskInput),
      missingFields,
    },
  });
});

// 按原参数重放（创建新任务，保留原任务）
taskRoutes.post('/:id/replay', async (c) => {
  const sourceTaskId = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const requestId = typeof body.requestId === 'string' ? body.requestId.trim() : '';

  if (!requestId) {
    return c.json({ error: 'requestId is required' }, 400);
  }

  const db = getDb();

  const [sourceTask] = await db
    .select()
    .from(tasks)
    .where(eq(tasks.id, sourceTaskId))
    .limit(1);

  if (!sourceTask) {
    return c.json({ error: 'Task not found' }, 404);
  }

  if (sourceTask.type !== 'plan-generation' && sourceTask.type !== 'image-generation') {
    return c.json({
      error: `Task type does not support replay: ${sourceTask.type}`,
      code: 'TASK_TYPE_NOT_REPLAYABLE',
    }, 400);
  }

  const sourceInput = parseJsonSafely<JsonObject>(sourceTask.input);
  if (!sourceInput) {
    return c.json({
      error: 'Task input is missing or invalid',
      code: 'TASK_INPUT_INVALID',
    }, 400);
  }

  const provider = await resolveProviderForInput(sourceInput);

  if (sourceTask.type === 'plan-generation' && !hasTextCapability(provider)) {
    return c.json({
      error: '当前无可用文本能力，无法重放该预案任务。',
      code: 'TEXT_CAPABILITY_UNAVAILABLE',
      recoverableActions: ['open-provider-settings'],
    }, 400);
  }

  if (sourceTask.type === 'image-generation' && !hasImageCapability(provider)) {
    return c.json({
      error: '当前无可用图片能力，无法重放该图片任务。',
      code: 'IMAGE_CAPABILITY_UNAVAILABLE',
      recoverableActions: ['open-provider-settings'],
    }, 400);
  }

  const now = new Date();
  const replayKey = `${sourceTask.id}:${requestId}`;

  const [existingReplay] = await db
    .select()
    .from(taskReplayRequests)
    .where(eq(taskReplayRequests.id, replayKey))
    .limit(1);

  if (existingReplay) {
    const createdAtMs = toEpochMs(existingReplay.createdAt);
    if (createdAtMs !== null && now.getTime() - createdAtMs <= IDEMPOTENCY_WINDOW_MS) {
      const [existingTask] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.id, existingReplay.newTaskId))
        .limit(1);

      if (existingTask) {
        return c.json({
          task: {
            id: existingTask.id,
            type: existingTask.type,
            status: existingTask.status,
          },
          replayOfTaskId: sourceTask.id,
          deduped: true,
        });
      }
    }
  }

  const newTaskId = randomUUID();

  await db.insert(tasks).values({
    id: newTaskId,
    type: sourceTask.type,
    status: 'pending',
    input: sourceTask.input,
    relatedId: sourceTask.relatedId,
    relatedMeta: sourceTask.relatedMeta,
    createdAt: now,
    updatedAt: now,
  });

  if (existingReplay) {
    await db
      .update(taskReplayRequests)
      .set({
        newTaskId,
        createdAt: now,
      })
      .where(eq(taskReplayRequests.id, replayKey));
  } else {
    await db.insert(taskReplayRequests).values({
      id: replayKey,
      sourceTaskId: sourceTask.id,
      newTaskId,
      createdAt: now,
    });
  }

  return c.json({
    task: {
      id: newTaskId,
      type: sourceTask.type,
      status: 'pending',
    },
    replayOfTaskId: sourceTask.id,
    deduped: false,
  }, 201);
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
