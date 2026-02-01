import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { aiRoutes } from './routes/ai';
import { planRoutes } from './routes/plans';
import { providerRoutes } from './routes/providers';
import { initDatabase } from './db';

const app = new Hono();

// 中间件
app.use('*', logger());
app.use('*', cors({
  origin: ['http://localhost:1420', 'tauri://localhost'],
  credentials: true,
}));

// 健康检查
app.get('/health', (c) => c.json({ status: 'ok', timestamp: Date.now() }));

// API 路由
app.route('/api/ai', aiRoutes);
app.route('/api/plans', planRoutes);
app.route('/api/providers', providerRoutes);

// 初始化数据库并启动服务器
const PORT = parseInt(process.env.PORT || '3001', 10);

async function main() {
  await initDatabase();

  serve({
    fetch: app.fetch,
    port: PORT,
  }, (info) => {
    console.log(`🚀 Sidecar server running on http://localhost:${info.port}`);
  });
}

main().catch(console.error);
