import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono, type MiddlewareHandler } from 'hono';
import { cors } from 'hono/cors';
import { execSync } from 'node:child_process';
import { aiRoutes } from './routes/ai';
import { providerRoutes } from './routes/providers';
import { taskRoutes } from './routes/tasks';
import { uploadRoutes } from './routes/upload';
import { assetsRoutes } from './routes/assets';
import { modelAssetsRoutes } from './routes/model-assets';
import { projectRoutes } from './routes/projects';
import { settingsRoutes } from './routes/settings';
import { artifactsRoutes } from './routes/artifacts';
import { promptsRoutes } from './routes/prompts';
import { workspaceRoutes } from './routes/workspace';
import { agentRoutes } from './routes/agent';
import { embeddingsRoutes } from './routes/embeddings';
import { initDatabase } from './db';
import { startWorker } from './worker';
import { initializeVectorEngine } from './services/embedding/vector-engine';

const app = new Hono();

const ROOT_TRACE_ENABLED = process.env.SIDECAR_TRACE_ROOT === '1';
const ROOT_TRACE_INTERVAL_MS = Number(process.env.SIDECAR_TRACE_ROOT_INTERVAL_MS || '30000') || 30_000;
let lastRootTraceAt = 0;

function createRequestLogger(options?: { skipPaths?: ReadonlySet<string> }): MiddlewareHandler {
  const skipPaths = options?.skipPaths ?? new Set<string>();
  return async (c, next) => {
    const method = c.req.method;
    const path = c.req.path;
    const rawUrl = c.req.raw.url;
    const parsed = new URL(rawUrl, 'http://localhost');
    const pathWithQuery = `${parsed.pathname}${parsed.search}`;
    const shouldLog = !skipPaths.has(path);

    if (ROOT_TRACE_ENABLED && path === '/' && Date.now() - lastRootTraceAt > ROOT_TRACE_INTERVAL_MS) {
      lastRootTraceAt = Date.now();
      const userAgent = c.req.header('user-agent') ?? '';
      const referer = c.req.header('referer') ?? '';
      const incoming = (c.env as any)?.incoming;
      const remoteAddress = incoming?.socket?.remoteAddress;
      const remotePort = incoming?.socket?.remotePort;

      let owner = '';
      if (typeof remotePort === 'number' && remotePort > 0) {
        try {
          owner = execSync(`lsof -nP -iTCP:${remotePort} 2>/dev/null | tail -n +2 | head -n 1`, {
            encoding: 'utf8',
          }).trim();
        } catch {
          // ignore
        }
      }

      console.warn(
        `[root-trace] ${method} / ua="${userAgent}" referer="${referer}" remote=${remoteAddress ?? '-'}:${remotePort ?? '-'} owner="${owner}"`,
      );
    }

    if (shouldLog) console.log(`<-- ${method} ${pathWithQuery}`);
    const start = Date.now();
    try {
      await next();
    } finally {
      if (shouldLog) console.log(`--> ${method} ${pathWithQuery} ${c.res.status} ${Date.now() - start}ms`);
    }
  };
}

// 中间件
app.use(
  '*',
  createRequestLogger({
    // 根路径会被某些本地工具/运行时探测，避免刷屏；同时我们会给 / 提供 204 响应（见下方路由）。
    skipPaths: new Set<string>(['/', '/favicon.ico']),
  }),
);
app.use('*', cors({
  origin: ['http://localhost:1420', 'tauri://localhost'],
  credentials: true,
}));

// 根路径（本地开发时可能被运行时/工具探测），返回 204 避免 404 噪音
app.get('/', (c) => c.body(null, 204));
app.on('HEAD', '/', (c) => c.body(null, 204));

// 健康检查
app.get('/health', (c) => c.json({ status: 'ok', timestamp: Date.now() }));

// 静态文件服务（上传的图片）
app.use('/uploads/*', serveStatic({ root: './data' }));

// API 路由
app.route('/api/ai', aiRoutes);
app.route('/api/providers', providerRoutes);
app.route('/api/tasks', taskRoutes);
app.route('/api/upload', uploadRoutes);
app.route('/api/assets/models', modelAssetsRoutes);
app.route('/api/assets', assetsRoutes);
app.route('/api/projects', projectRoutes);
app.route('/api/settings', settingsRoutes);
app.route('/api/artifacts', artifactsRoutes);
app.route('/api/prompts', promptsRoutes);
app.route('/api/workspace', workspaceRoutes);
app.route('/api/agent', agentRoutes);
app.route('/api/embeddings', embeddingsRoutes);

// 初始化数据库并启动服务器
const PORT = parseInt(process.env.PORT || '3001', 10);

async function main() {
  await initDatabase();
  initializeVectorEngine();

  // 启动任务 Worker（包含 stale 任务清理）
  await startWorker();

  serve({
    fetch: app.fetch,
    port: PORT,
  }, (info) => {
    console.log(`🚀 Sidecar server running on http://localhost:${info.port}`);
  });
}

main().catch(console.error);
