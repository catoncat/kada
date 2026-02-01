# 前端开发指南

## 目录与路由

- 入口：`src/main.tsx`
- 路由：`src/routes/`（TanStack Router 文件路由）
- 自动生成：`src/routeTree.gen.ts`（不要手改）

## 组件分层

- `src/components/ui/`：可复用 UI 原子组件（偏基础能力，文件多用 `kebab-case.tsx`）
- `src/components/`：业务组件（多用 `PascalCase.tsx`）
- `src/hooks/`：自定义 Hooks（命名 `useXxx`）
- `src/lib/`：工具函数与领域逻辑（例如 `src/lib/utils.ts` 的 `cn()` 用于类名合并）

## 样式与资源

- 全局样式：`src/index.css`
- 静态资源：`public/`
- Tailwind：尽量保持 class 列表可读；复杂条件类名统一走 `cn()` 合并。

## 路径别名

前端支持 `@/* → ./src/*` 的别名导入；新增模块时优先使用别名保持路径稳定：

```ts
import { cn } from '@/lib/utils';
```
