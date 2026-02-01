---
name: spv2-plan-build
description: 为 shooting-planner-v2 生成 Build Order（把 PRD+UX Spec 拆成可复制给 Coding Agent 的微步骤 prompts），用于先计划再编码。用于：拆任务/实施步骤/build order/给 coding agent 的 prompt/执行清单。要求先有 01-feature-spec.md 与 02-ux-spec.md，输出到 docs/specs/FEATURE_SLUG/03-build-order.md；本技能不写实现代码。
---

# spv2-plan-build

目标：把 `01-feature-spec.md` + `02-ux-spec.md` 翻译成“可执行的构建指令序列”，让编码过程按步骤推进且每步可验证。

## 示例触发

- “基于 PRD+UX spec 生成 build order，我要能直接复制给 coding agent 执行”
- “把这个功能拆成 10 个小步，每步给具体 prompt + 自测命令”

## gating（不满足就停止，只输出待补齐清单）

必须存在：

- `docs/specs/FEATURE_SLUG/01-feature-spec.md`
- `docs/specs/FEATURE_SLUG/02-ux-spec.md`

## 必须先读（真相源）

- `docs/specs/FEATURE_SLUG/01-feature-spec.md`
- `docs/specs/FEATURE_SLUG/02-ux-spec.md`
- `agent_docs/commands.md`（自测命令）
- 按影响范围选择性阅读：`agent_docs/frontend.md`、`agent_docs/sidecar.md`、`docs/engineering/api.md`、`docs/engineering/contracts.md`

## 输出

- 写入：`docs/specs/FEATURE_SLUG/03-build-order.md`

## 文档顶部必须声明的约束

- 不要手改生成/产物：`dist/`、`src/routeTree.gen.ts`、`.tanstack/`、`src-tauri/target/`
- 任何契约/API 改动必须同步更新 `docs/engineering/contracts.md` / `docs/engineering/api.md`（或在步骤中包含“先改文档再改代码”）
- 本技能只产出 prompts，不直接实施编码

## 每个 Step 的固定模板（必须包含）

- Step 标题（动词开头）
- 目标（1–2 句）
- 需要读的文件（具体路径）
- 需要改的文件（具体路径；若不确定，写“如何确定”）
- Prompt（可直接复制给 Coding Agent 的指令文本；明确先后顺序与验收点）
- 自测命令（从 `package.json`/`agent_docs/commands.md` 选择：`pnpm validate`、`pnpm test:run`、`pnpm dev:all`；涉及桌面壳用 `pnpm tauri:dev`）
- 完成定义（可观察结果：UI 行为/API 返回/导出文件等）

