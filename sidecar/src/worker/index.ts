/**
 * 任务 Worker
 * 后台轮询处理 pending 任务
 */

import { getDb } from '../db';
import { tasks } from '../db/schema';
import { eq } from 'drizzle-orm';
import { imageGenerationHandler } from './handlers/image-generation';
import { planGenerationHandler } from './handlers/plan-generation';

interface TaskHandlerContext {
  taskId: string;
  taskType: string;
  relatedId?: string | null;
}

// 任务处理器注册表
type TaskHandler = (input: any, context: TaskHandlerContext) => Promise<any>;

const DEBUG_WORKER = process.env.SIDECAR_DEBUG_WORKER === '1';

const handlers: Record<string, TaskHandler> = {
  'image-generation': imageGenerationHandler,
  'plan-generation': planGenerationHandler,
};

// Worker 状态
let isRunning = false;
let pollInterval: ReturnType<typeof setInterval> | null = null;

/**
 * 启动 Worker
 */
export async function startWorker(intervalMs = 1000) {
  if (isRunning) return;
  isRunning = true;

  // 清理服务器重启前遗留的 stale 任务
  await cleanupStaleTasks();

  console.log('🔄 Task worker started');

  pollInterval = setInterval(async () => {
    await processNextTask();
  }, intervalMs);
}

/**
 * 清理 stale 任务（服务器重启时遗留的 running 状态任务）
 */
async function cleanupStaleTasks() {
  const db = getDb();

  // 将所有 running 状态的任务标记为失败（服务器重启导致中断）
  await db
    .update(tasks)
    .set({
      status: 'failed',
      error: '服务器重启导致任务中断，请重试',
      updatedAt: new Date(),
    })
    .where(eq(tasks.status, 'running'));

  console.log('🧹 Cleaned up stale running tasks');
}

/**
 * 停止 Worker
 */
export function stopWorker() {
  if (!isRunning) return;
  isRunning = false;

  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }

  console.log('⏹️ Task worker stopped');
}

/**
 * 处理下一个 pending 任务
 */
async function processNextTask() {
  const db = getDb();

  // 获取一个 pending 任务
  const [task] = await db
    .select()
    .from(tasks)
    .where(eq(tasks.status, 'pending'))
    .limit(1);

  if (!task) return;

  if (DEBUG_WORKER) {
    console.log(`[Worker] Found pending task: ${task.id} (${task.type})`);
  }

  const handler = handlers[task.type];
  if (!handler) {
    // 未知任务类型，标记为失败
    await db
      .update(tasks)
      .set({
        status: 'failed',
        error: `Unknown task type: ${task.type}`,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, task.id));
    return;
  }

  // 标记为 running
  await db
    .update(tasks)
    .set({
      status: 'running',
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, task.id));

  try {
    const input = JSON.parse(task.input);
    const output = await handler(input, {
      taskId: task.id,
      taskType: task.type,
      relatedId: task.relatedId,
    });

    // 标记为 completed
    await db
      .update(tasks)
      .set({
        status: 'completed',
        output: JSON.stringify(output),
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, task.id));

    console.log(`✅ Task ${task.id} (${task.type}) completed`);
  } catch (error: any) {
    // 标记为 failed
    await db
      .update(tasks)
      .set({
        status: 'failed',
        error: error.message || 'Unknown error',
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, task.id));

    console.error(`❌ Task ${task.id} (${task.type}) failed:`, error.message);
  }
}

/**
 * 注册自定义处理器
 */
export function registerHandler(type: string, handler: TaskHandler) {
  handlers[type] = handler;
}
