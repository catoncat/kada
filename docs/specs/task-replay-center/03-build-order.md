# Build Order：任务复盘中心（task-replay-center）

> 目标：把 `01-feature-spec.md` + `02-ux-spec.md` 拆成可执行的构建步骤（prompts），用于先计划再编码。

## 约束（必须遵守）

- 不要手改生成/产物：`dist/`、`src/routeTree.gen.ts`、`.tanstack/`、`src-tauri/target/`
- 任何契约/API 改动必须同步更新 `docs/engineering/contracts.md` / `docs/engineering/api.md`（先改文档再改代码）
- 本文只产出 prompts，不直接实施编码

---

## Step 1：对齐任务复盘数据契约

- 目标：
  - 在工程文档中明确“任务详情聚合视图（TaskDetailView）”的稳定字段，避免实现阶段反复改接口。
- 需要读的文件：
  - `docs/specs/task-replay-center/01-feature-spec.md`
  - `docs/specs/task-replay-center/02-ux-spec.md`
  - `docs/engineering/contracts.md`
- 需要改的文件：
  - `docs/engineering/contracts.md`
- Prompt（复制给 Coding Agent）：
  - 先只改文档，不写代码。
  - 在 `docs/engineering/contracts.md` 中新增 `TaskDetailView` 契约，至少包含：
    - `task`（基础字段）
    - `run`（含 `kind/status/effectivePrompt/promptContext/error/taskId`）
    - `artifacts[]`（含 `referenceImages/editInstruction/parentArtifactId`）
    - `timeline[]`（状态流转时间）
  - 明确“旧历史字段缺失时的兼容策略”：允许空值并返回 `missingFields` 或等价标识。
  - 明确“快照语义”：任务完成后显示内容不可被后续编辑覆盖。
- 自测命令：
  - `pnpm lint`
- 完成定义：
  - `docs/engineering/contracts.md` 可单独回答“任务详情接口应该返回什么字段、哪些可为空、如何兼容历史数据”。

## Step 2：对齐任务详情与重放 API 文档

- 目标：
  - 定义任务复盘中心所需最小 API：详情聚合、重放任务、错误语义。
- 需要读的文件：
  - `docs/specs/task-replay-center/01-feature-spec.md`
  - `docs/specs/task-replay-center/02-ux-spec.md`
  - `docs/engineering/api.md`
- 需要改的文件：
  - `docs/engineering/api.md`
- Prompt（复制给 Coding Agent）：
  - 先只改文档，不写代码。
  - 在 `docs/engineering/api.md` 新增/补齐：
    - `GET /api/tasks/:id/detail`（返回 `TaskDetailView`）
    - `POST /api/tasks/:id/replay`（按原参数复制创建新任务）
    - Replay 定稿口径：
      - `plan-generation`：可在文本降级能力可用时执行。
      - `image-generation`：无可用图片能力时直接阻断并返回可恢复错误。
  - 为上述接口补齐：
    - 请求/响应示例
    - `requestId` 幂等语义与去重响应示例
    - 失败码约定（404/400/401/403/408/500）
    - 兼容策略（历史任务字段缺失）
  - 保留现有 `GET /api/tasks` 与 `GET /api/tasks/:id` 语义不变。
- 自测命令：
  - `pnpm lint`
- 完成定义：
  - `docs/engineering/api.md` 中可以直接指导前后端各自实现，无需口头补充。

## Step 3：补齐 Sidecar 的任务-运行链路

- 目标：
  - 让每个任务都可追溯到 run/artifact，确保“任务详情可复盘”有真实数据源。
- 需要读的文件：
  - `sidecar/src/worker/index.ts`
  - `sidecar/src/worker/handlers/image-generation.ts`
  - `sidecar/src/worker/handlers/plan-generation.ts`
  - `sidecar/src/db/schema.ts`
  - `docs/engineering/contracts.md`
- 需要改的文件：
  - `sidecar/src/worker/index.ts`
  - `sidecar/src/worker/handlers/image-generation.ts`
  - `sidecar/src/worker/handlers/plan-generation.ts`
  - `sidecar/src/db/schema.ts`（若字段不足，按文档补齐）
  - `sidecar/src/db/index.ts`（如需兼容历史列）
- Prompt（复制给 Coding Agent）：
  - 先实现“链路完整性”再做新接口。
  - 调整 worker 执行链路：处理任务时把 `task.id` 传给 handler，并落盘到 `generation_runs.task_id`。
  - 对 `plan-generation` 也记录 run（至少保存最终使用的 prompt 与上下文摘要），避免仅有 task 没有 run。
  - 确保不破坏现有任务行为：失败仍写 `tasks.error`，成功仍写 `tasks.output`。
  - 如遇历史库缺列，补兼容逻辑而非破坏性迁移。
- 自测命令：
  - `pnpm dev:sidecar`
  - `pnpm validate`
- 完成定义：
  - 新创建的 `plan-generation` 与 `image-generation` 任务都能在 DB 中查到对应 `generation_runs.task_id`。

## Step 4：新增任务详情聚合接口

- 目标：
  - 提供前端一次请求即可渲染的任务详情数据，避免前端拼装多源数据。
- 需要读的文件：
  - `sidecar/src/routes/tasks.ts`
  - `sidecar/src/db/schema.ts`
  - `docs/engineering/api.md`
  - `docs/engineering/contracts.md`
- 需要改的文件：
  - `sidecar/src/routes/tasks.ts`
  - `sidecar/src/index.ts`（仅当需要注册新路由）
- Prompt（复制给 Coding Agent）：
  - 在 `tasks` 路由中实现 `GET /api/tasks/:id/detail`：
    - 查询 task
    - 通过 `generation_runs.task_id` 关联 run
    - 通过 `run.id` 关联 artifacts 列表
    - 组装 timeline（至少包含 pending/running/completed/failed 的时间点）
  - 返回结构严格对齐 `TaskDetailView`。
  - 对旧任务无 run/artifacts 的情况返回可解析的空结构，不报 500。
- 自测命令：
  - `pnpm dev:sidecar`
  - `pnpm dev:all`
- 完成定义：
  - 本地可通过接口拿到完整任务详情，且旧任务也能稳定返回。

## Step 5：实现任务重放（Replay）接口

- 目标：
  - 支持“按原参数再生成”，让复盘可以直接转为恢复动作。
- 需要读的文件：
  - `sidecar/src/routes/tasks.ts`
  - `docs/engineering/api.md`
  - `docs/specs/task-replay-center/02-ux-spec.md`
- 需要改的文件：
  - `sidecar/src/routes/tasks.ts`
  - `sidecar/src/db/schema.ts`（如需补 replay 关联字段，先评估）
- Prompt（复制给 Coding Agent）：
  - 实现 `POST /api/tasks/:id/replay`：
    - 必须接收 `requestId`
    - 复制原任务的 `type/input/relatedId/relatedMeta`
    - 创建新任务并返回新 `task.id`；若命中幂等去重，返回已有 `task.id` 与去重标记
  - 保持原任务不变（不覆盖历史）。
  - 对不可重放任务（缺输入/类型未知）返回 400 并给可读错误。
  - 语义上区分“重试失败任务”与“按原参数重放已完成任务”，可统一到底层创建逻辑。
  - 按任务类型执行定稿口径：
    - `plan-generation` 可降级
    - `image-generation` 无图片能力时阻断
- 自测命令：
  - `pnpm dev:sidecar`
  - `pnpm validate`
- 完成定义：
  - 任一历史任务都可触发重放并生成新任务记录，原任务仍可查看。

## Step 6：补齐前端任务详情类型与 API Hook

- 目标：
  - 让前端用强类型消费任务详情与重放接口，降低 UI 层解析错误。
- 需要读的文件：
  - `src/lib/tasks-api.ts`
  - `src/hooks/useTasks.ts`
  - `src/lib/artifacts-api.ts`
  - `docs/engineering/contracts.md`
- 需要改的文件：
  - `src/lib/tasks-api.ts`
  - `src/hooks/useTasks.ts`
  - `src/types/`（如需新增 `task-detail.ts`）
- Prompt（复制给 Coding Agent）：
  - 在前端新增 `TaskDetailView` 类型，并与后端返回结构对齐。
  - 新增 API client：
    - `fetchTaskDetail(id)`
    - `replayTask(id)`
  - 新增 hooks：
    - `useTaskDetail`
    - `useReplayTask`
  - 保持现有 `TaskQueueContext` 的列表轮询逻辑不回归。
- 自测命令：
  - `pnpm typecheck`
  - `pnpm validate`
- 完成定义：
  - 前端可以独立拿到任务详情并触发重放，类型检查通过。

## Step 7：重构任务中心为“列表 + 详情”

- 目标：
  - 从“仅摘要列表”升级为可复盘工作台，覆盖 Prompt/图像参数/结果/错误/恢复动作。
- 需要读的文件：
  - `src/components/TaskQueueDrawer.tsx`
  - `src/contexts/TaskQueueContext.tsx`
  - `docs/specs/task-replay-center/02-ux-spec.md`
- 需要改的文件：
  - `src/components/TaskQueueDrawer.tsx`
  - `src/components/`（新增 `TaskDetailPanel`、`TaskPromptSection` 等子组件；按项目结构拆分）
  - `src/lib/tasks-api.ts`（若 UI 需要补字段映射）
- Prompt（复制给 Coding Agent）：
  - 在不破坏现有入口的前提下，把任务抽屉改为“左列表右详情”。
  - 详情区至少包含：
    - 概览
    - 完整 Prompt（draft/effective + copy）
    - 图像参数（referenceImages/owner/editInstruction/options）
    - 产物与错误（run/artifact、错误文案、时间线）
  - 高级字段默认折叠，遵循“强引导但不打扰”。
  - 保留现有删除/重试能力并迁移到详情区主次按钮体系。
- 自测命令：
  - `pnpm dev:all`
  - `pnpm validate`
- 完成定义：
  - 用户可在任务中心完成“定位任务 → 看全量参数 → 执行恢复动作”完整路径。

## Step 8：打通来源跳转与恢复动作

- 目标：
  - 让任务详情操作后能无缝回到业务场景（项目结果页/场景编辑），形成闭环。
- 需要读的文件：
  - `src/components/TaskQueueDrawer.tsx`
  - `src/routes/project.$id.result.tsx`
  - `src/components/plan/SceneCard.tsx`
  - `docs/specs/task-replay-center/01-feature-spec.md`
- 需要改的文件：
  - `src/components/TaskQueueDrawer.tsx`
  - `src/routes/project.$id.result.tsx`
  - `src/components/plan/SceneCard.tsx`（如需补“查看最近任务”入口）
- Prompt（复制给 Coding Agent）：
  - 统一 `owner/relatedMeta` 到来源深链规则：
    - `planScene` 任务跳到结果页并定位 scene
    - 项目级任务跳到项目页面
  - 新增深链失效恢复页规则：
    - 任务不存在时展示“可恢复页”，提供：返回任务列表、查看同来源最近任务、跳转来源页面
  - 在任务详情里提供：
    - `跳转来源`
    - `按原参数再生成`
    - `复制复盘信息`
  - 触发动作后给明确反馈（成功/失败），避免静默。
- 自测命令：
  - `pnpm dev:all`
  - `pnpm tauri:dev`（可选，验证桌面壳下跳转与焦点）
- 完成定义：
  - 从任务详情点击来源跳转后，能稳定定位到正确项目/场景上下文。

## Step 9：补齐状态机、文案与可访问性

- 目标：
  - 对齐 UX Spec 的 Empty/Loading/Error 与 A11y 要求，避免“功能有了但不可用”。
- 需要读的文件：
  - `docs/specs/task-replay-center/02-ux-spec.md`
  - `src/components/TaskQueueDrawer.tsx`
  - `src/components/ui/*`（相关 Dialog/Sheet/Button 组件）
- 需要改的文件：
  - `src/components/TaskQueueDrawer.tsx`
  - 相关 UI 子组件文件（按实现拆分）
- Prompt（复制给 Coding Agent）：
  - 对照 UX Spec 补齐：
    - 3 个 Empty、3 个 Loading、6+ 个 Error 的可见状态和恢复路径
    - 明确可执行下一步（去设置/重试/清空筛选/查看来源）
  - A11y 最低要求：
    - 抽屉焦点管理
    - Esc 关闭
    - Enter 触发主动作
    - 必要 aria-label
  - 禁止只用 toast 承载关键错误，卡片或详情区域必须有持久反馈。
- 自测命令：
  - `pnpm validate`
  - `pnpm dev:all`
- 完成定义：
  - 关键失败场景下用户都能看到“为什么失败 + 下一步做什么”。

## Step 10：执行回归验证与交付检查

- 目标：
  - 在提交前验证“复盘中心 + 任务链路 + 跳转恢复”不回归。
- 需要读的文件：
  - `docs/specs/task-replay-center/01-feature-spec.md`
  - `docs/specs/task-replay-center/02-ux-spec.md`
  - `docs/specs/task-replay-center/03-build-order.md`
- 需要改的文件：
  - `src/**`、`sidecar/src/**`（仅修复回归问题）
  - 测试文件（如果当前工程已有覆盖路径，按需补充）
- Prompt（复制给 Coding Agent）：
  - 跑自动校验后做最小手工回归。
  - 自动校验：
    - `pnpm validate`
    - `pnpm test:run`
  - 手工回归最小清单：
    - 打开任务中心，验证列表+详情可用
    - 失败任务可重试，已完成任务可重放
    - 无 Provider 场景下：`plan-generation` 可按降级规则重放，`image-generation` 被阻断并给出可恢复提示
    - 连续点击重放不会创建重复任务（幂等生效）
    - `image-generation` 详情能看到完整 prompt 与图片参数
    - 来源跳转可定位正确项目/场景
    - 已删除任务深链打开时展示可恢复页（非裸 404）
    - 旧任务缺字段时不崩溃
  - 输出回归结论：通过项/失败项/剩余风险。
- 自测命令：
  - `pnpm validate`
  - `pnpm test:run`
  - `pnpm dev:all`
- 完成定义：
  - 验收标准对应路径全部有证据，且没有阻断上线的回归问题。
