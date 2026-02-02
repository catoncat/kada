# 前端开发指南

## 目录与路由

- 入口：`src/main.tsx`
- 路由：`src/routes/`（TanStack Router 文件路由）
- 自动生成：`src/routeTree.gen.ts`（不要手改）

## 状态管理

- 服务端状态：TanStack Query（`@tanstack/react-query`）
- Provider 挂载于 `src/main.tsx`
- API hooks 位于 `src/hooks/`（`useProviders.ts`, `usePlans.ts`, `useHistory.ts`, `useAI.ts`）
- API 客户端位于 `src/lib/`（`provider-api.ts`, `plans-api.ts`, `ai-client.ts`）

## 组件分层

- `src/components/ui/`：可复用 UI 原子组件（偏基础能力，文件多用 `kebab-case.tsx`）
- `src/components/`：业务组件（多用 `PascalCase.tsx`）
- `src/hooks/`：自定义 Hooks（命名 `useXxx`）
- `src/lib/`：工具函数与领域逻辑（例如 `src/lib/utils.ts` 的 `cn()` 用于类名合并）

## 样式与资源

- 全局样式：`src/index.css`
- 静态资源：`public/`
- Tailwind：尽量保持 class 列表可读；复杂条件类名统一走 `cn()` 合并。

## 滚动与布局规范（重要）

目标：避免「双滚动」、避免“该固定的不固定”，让页面在桌面壳里保持一致的滚动体验。

1. **路由页面根节点避免使用 `h-screen` / `min-h-screen`**
   - AppShell 本身已经控制了主内容区的高度与滚动容器；页面再用 `h-screen` 很容易导致外层容器出现额外滚动，进而把内部的 header / toolbar 一起滚走。
   - 推荐：路由页面根节点优先用 `h-full min-h-0` 贴合父容器。

2. **单列页面（如 Assets / Settings）**
   - 默认由 AppShell 的内容容器负责滚动即可。
   - 若该页面需要自己管理滚动（例如内部要固定工具栏），最外层用：`h-full min-h-0 flex flex-col`，滚动区用：`flex-1 min-h-0 overflow-y-auto`。

3. **分栏/多滚动区页面（如 Projects：左列表 + 右侧详情）**
   - 页面根：`h-full min-h-0 flex overflow-hidden`（禁止让外层滚动）。
   - 每一栏：`min-h-0 flex flex-col`。
   - 栏内滚动区：`flex-1 min-h-0 overflow-y-auto`。
   - 需要固定的区域（标题栏/筛选栏/操作栏）放在滚动区之外，并加 `shrink-0`。

4. **宽度与溢出（防横向滚动）**
   - 横向 `flex` 的可伸缩子项要加 `min-w-0`，长文本加 `truncate`，避免撑破造成横向滚动条。
   - 详情内容区建议使用 `max-w-4xl mx-auto`（或按页面复杂度选择 `max-w-5xl`），避免超宽行影响阅读。

5. **成功提示/关键提示的位置**
   - 用户需要立即注意的提示，优先放在固定区域（如标题栏下方的固定提示条），不要放在长列表的最底部。

## 路径别名

前端支持 `@/* → ./src/*` 的别名导入；新增模块时优先使用别名保持路径稳定：

```ts
import { cn } from '@/lib/utils';
```
