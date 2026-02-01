import { StrictMode, useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { routeTree } from './routeTree.gen';
import { runMigration, needsMigration } from './lib/data-migration';
import { startThemeSync } from './lib/theme';
import './index.css';

startThemeSync();

// 创建 QueryClient 实例
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 分钟
      retry: 1,
    },
  },
});

// 创建路由实例
const router = createRouter({ routeTree });

// 类型声明
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

// 应用包装器，处理数据迁移
function App() {
  const [ready, setReady] = useState(!needsMigration());

  useEffect(() => {
    if (!ready) {
      runMigration().finally(() => setReady(true));
    }
  }, [ready]);

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--paper)]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-[var(--ink-2)]">正在迁移数据...</p>
        </div>
      </div>
    );
  }

  return <RouterProvider router={router} />;
}

// 渲染应用
const rootElement = document.getElementById('root')!;
if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </StrictMode>
  );
}
