# 贡献指南（代码风格 / 验证 / PR）

## 代码风格与命名

- 缩进：2 空格；保持现有风格（常见为单引号与分号）。
- 组件：`PascalCase.tsx`；UI 原子组件多为 `kebab-case.tsx`（见 `src/components/ui/`）。
- Hooks：统一 `useXxx`，放在 `src/hooks/`。
- 分层：前端不要直接引用 Sidecar 内部实现；通过 `/api/*` 接口交互。

本仓库当前未配置 ESLint/Prettier 等统一格式化工具；改动请尽量保持 diff 小且风格一致。

## 本地验证（替代测试）

目前没有 `pnpm test` 脚本/测试框架。提交前至少完成：

```bash
pnpm build
pnpm dev:all
```

涉及桌面壳、权限、CSP、文件系统等问题时，额外用：

```bash
pnpm tauri:dev
```

## 提交信息与 PR

如果仓库未提供明确历史约定，建议使用 Conventional Commits：

- `feat(frontend): ...`
- `fix(sidecar): ...`
- `chore: ...` / `docs: ...` / `refactor: ...`

PR 请包含：

- 变更摘要（做了什么、为什么）
- 自测步骤（命令 + 预期结果）
- UI 变更截图/GIF（如有）
- 数据库迁移说明（如有 Drizzle 迁移）

## 安全与配置

- 不要提交密钥、Provider 凭据或包含敏感信息的日志。
- 本地数据库位于 `sidecar/data/`（已忽略）；不要把该目录加入版本控制。
- 新增外部网络域名/Provider 时，记得同步检查 Tauri 配置（CSP/权限）并在 PR 中说明。
