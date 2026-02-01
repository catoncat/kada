import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';
import './index.css';

// 创建路由实例
const router = createRouter({ routeTree });

// 类型声明
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

// 渲染应用
const rootElement = document.getElementById('root')!;
if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>
  );
}
