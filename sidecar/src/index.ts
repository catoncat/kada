import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { aiRoutes } from './routes/ai';
import { providerRoutes } from './routes/providers';
import { taskRoutes } from './routes/tasks';
import { uploadRoutes } from './routes/upload';
import { assetsRoutes } from './routes/assets';
import { projectRoutes } from './routes/projects';
import { initDatabase } from './db';
import { startWorker } from './worker';

const app = new Hono();

// 中间件
app.use('*', logger());
app.use('*', cors({
  origin: ['http://localhost:1420', 'tauri://localhost'],
  credentials: true,
}));

// 健康检查
app.get('/health', (c) => c.json({ status: 'ok', timestamp: Date.now() }));

// 静态文件服务（上传的图片）
app.use('/uploads/*', serveStatic({ root: './data' }));

// API 路由
app.route('/api/ai', aiRoutes);
app.route('/api/providers', providerRoutes);
app.route('/api/tasks', taskRoutes);
app.route('/api/upload', uploadRoutes);
app.route('/api/assets', assetsRoutes);
app.route('/api/projects', projectRoutes);

// 初始化数据库并启动服务器
const PORT = parseInt(process.env.PORT || '3001', 10);

async function main() {
  await initDatabase();

  // 启动任务 Worker
  startWorker();

  serve({
    fetch: app.fetch,
    port: PORT,
  }, (info) => {
    console.log(`🚀 Sidecar server running on http://localhost:${info.port}`);
  });
}

main().catch(console.error);
