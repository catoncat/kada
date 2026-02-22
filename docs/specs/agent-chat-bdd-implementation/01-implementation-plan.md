# Agent Chat BDD 全量实施计划（执行蓝图）

更新时间：`2026-02-22`
负责人：`Agent + 产品 + 前端 + Sidecar`

---

## 1. 目标与原则

### 1.1 目标

把 BDD 作为 **Chat-Only 工作台** 的唯一行为约束层：

1. 所有核心产品能力以 `/workspace` 场景描述为入口。
2. 所有关键改造必须先新增/修改 `.feature`，再改实现。
3. 通过自动化执行保证改造不跑偏。

### 1.2 原则

1. **Scenario 描述 What，不描述 How**（避免 UI 实现细节绑死）。
2. **每个 Scenario 只验证一个业务规则**。
3. **先稳定再覆盖**：先做 deterministic 可回放场景，再扩覆盖面。
4. **先 smoke 再 full**：PR 保证烟测，夜间跑全量。

---

## 2. 当前基线（已完成）

### 2.1 已落地提交

- `9eed1cc`：接入 Playwright-BDD 框架（Phase 1）
- `33fd558`：补充生成任务编排场景（Phase 2）
- `f49d1fb`：deterministic runtime 测试模式（Phase 3 支撑）
- `56ee297`：Chat Core Flow 场景（Phase 3）
- `7ee4c74`：并发隔离 + 资源上下文场景（Phase 4）
- `21b69e8`：任务恢复与 image mention 完整路径（Phase 5）
- `（Phase 6）`：output rail + trace continuity 场景（本轮提交）

### 2.2 已落地文件

- 配置与命令
  - `playwright-bdd.config.ts`
  - `package.json`（`bdd:*` scripts）
- 场景与步骤
  - `tests/bdd/features/chat-workbench/session-management.feature`
  - `tests/bdd/features/chat-workbench/error-recovery.feature`
  - `tests/bdd/features/chat-workbench/generation-tasks.feature`
  - `tests/bdd/features/chat-workbench/chat-core-flow.feature`
  - `tests/bdd/features/chat-workbench/multi-session-parity.feature`
  - `tests/bdd/features/chat-workbench/resource-context.feature`
  - `tests/bdd/features/chat-workbench/task-recovery.feature`
  - `tests/bdd/features/chat-workbench/output-rail-consistency.feature`
  - `tests/bdd/features/chat-workbench/agent-trace-continuity.feature`
  - `tests/bdd/steps/fixtures.ts`
  - `tests/bdd/steps/workspace.steps.ts`
  - `tests/bdd/steps/project-generation.steps.ts`
  - `tests/bdd/steps/chat-core-flow.steps.ts`
  - `tests/bdd/steps/multi-session-parity.steps.ts`
  - `tests/bdd/steps/resource-context.steps.ts`
  - `tests/bdd/steps/task-recovery.steps.ts`
  - `tests/bdd/steps/output-rail-consistency.steps.ts`
  - `tests/bdd/steps/agent-trace-continuity.steps.ts`
  - `tests/bdd/steps/helpers/sqlite-db.ts`
- Runtime 测试支撑
  - `sidecar/src/agent/runtime/deterministic-runtime.ts`
  - `sidecar/src/agent/runtime/runtime-router.ts`
- 文档
  - `docs/dev/agent-chat-bdd-framework.md`

### 2.3 当前可运行命令

```bash
pnpm bdd:export
pnpm bdd:gen
pnpm bdd:smoke
pnpm bdd:test
pnpm bdd:report
```

---

## 3. 范围定义

### 3.1 本计划覆盖（In Scope）

1. Agent Chat 主流程行为（会话、turn、steer、follow-up、abort）。
2. 与生成链路强相关的 API 合约行为（projects/tasks/agent）。
3. 错误恢复与可操作反馈（recoverable path）。
4. CI 上的稳定执行和结果产出（trace/report）。

### 3.2 本计划不覆盖（Out of Scope）

1. PPT 导出相关 BDD（按当前决策暂缓）。
2. 视觉像素级回归（不作为当前主目标）。
3. 外部模型输出质量评估（本计划关注“系统行为”，不评估“模型聪明程度”）。

---

## 4. 实施阶段与里程碑

## Phase 1（已完成）框架接入

- BDD 配置、脚本、CI smoke、基础场景。
- DoD：`pnpm bdd:smoke` 稳定通过。

## Phase 2（已完成）编排能力场景

- 预案任务创建、图片任务创建、恢复上下文校验。
- DoD：`generation-tasks.feature` 稳定通过。

## Phase 3（已完成，优先级 P0）Chat Core Flow

### 目标

补全 Chat 主链路的关键行为，形成产品北极星场景集。

### 已完成任务

1. 新增场景：`chat-core-flow.feature`
   - turn 流式完成
   - 运行中 follow-up 入队并可观测
   - 运行中 steer 生效
   - abort 后状态回落
2. 新增 steps：`chat-core-flow.steps.ts`
3. 引入 deterministic 运行模式（测试专用）
   - 通过 `AGENT_ENABLE_DETERMINISTIC_RUNTIME=1` 启用
   - 仅对 `providerId="__bdd_deterministic__"` 的会话生效
   - 避免依赖真实 Provider/LLM 波动
4. 增加事件与状态断言
   - SSE 事件序列
   - 会话状态（idle / aborted）

### 完成标准（已达成）

- `@northstar` 标签场景新增 4 条并稳定通过。
- `pnpm bdd:test` 全量通过，`pnpm bdd:smoke` 保持稳定。

## Phase 4（已完成，P1）资源与上下文注入

### 目标

验证 Chat 输入中的资源语义（含 mention）真实进入运行链路。

### 已完成任务

1. 新增场景：`multi-session-parity.feature`
   - 双会话并发 turn 不串线
   - 中断会话 A 不影响会话 B 完成
2. 新增场景：`resource-context.feature`
   - 资源检索覆盖 `project/scene/model`
   - turn 中 mention 成功解析 + 失效降级（drop）
   - image kind mention 成功解析
3. 新增步骤实现
   - `multi-session-parity.steps.ts`
   - `resource-context.steps.ts`

### 完成标准（已达成）

- 并发隔离（BDD-005）稳定通过。
- 资源上下文（BDD-006）含 image 成功路径稳定通过。

## Phase 5（已完成，P1）任务恢复与可恢复反馈

### 目标

把“失败后下一步怎么做”从文案要求变成可执行验收。

### 已完成任务

1. 新增场景：`task-recovery.feature`
   - failed 图片任务 retry 回 pending
   - replay/retry 行为正确
   - replay 同 requestId 命中幂等去重
2. 新增 steps：`task-recovery.steps.ts`
3. 校验点落地
   - `/api/tasks/:id/detail` recoveryContext
   - 失败任务可执行下一步动作（retry/replay）

### 完成标准（已达成）

- 失败恢复场景已纳入全量 BDD 执行并稳定通过。
- 每个失败场景包含明确恢复动作断言。

## Phase 6（进行中，P2）可观测与治理固化

### 目标

把 BDD 变成团队默认流程，并补齐“产物栏 + trace”可观测验收。

### 已完成任务

1. 新增 `output-rail-consistency.feature`
   - 会话快照 `outputs` 与 `/outputs` 过滤结果一致
   - kind / turnId 过滤返回稳定
2. 新增 `agent-trace-continuity.feature`
   - trace `cursor` 分页连续拉取
   - timeline `totalEvents` 不丢失

### 剩余任务

1. CI 分层
   - PR：`bdd:smoke`
   - Nightly/手动：`bdd:test`
2. 报告归档
   - Playwright HTML
   - Cucumber JSON
   - trace/video（失败场景）
3. 规范固化
   - PR 模板要求：关联 feature 文件
   - 需求评审模板：先给 Scenario 清单

### 阶段 DoD

- 所有 Agent 相关 PR 必须关联至少 1 条 BDD 场景。
- 新需求进入开发前有 feature 草案。

---

## 5. 场景清单（Backlog）

| ID | 场景文件 | 业务目标 | 优先级 | 状态 |
|---|---|---|---|---|
| BDD-001 | session-management.feature | 会话生命周期 | P0 | ✅ |
| BDD-002 | error-recovery.feature | 关键依赖缺失反馈 | P0 | ✅ |
| BDD-003 | generation-tasks.feature | 生成任务编排 | P0 | ✅ |
| BDD-004 | chat-core-flow.feature | turn/steer/follow-up/abort | P0 | ✅ |
| BDD-005 | multi-session-parity.feature | 多会话并发隔离 | P0 | ✅ |
| BDD-006 | resource-context.feature | 自然语言资源调用 + mention | P1 | ✅ |
| BDD-007 | task-recovery.feature | 失败恢复路径 | P1 | ✅ |
| BDD-008 | output-rail-consistency.feature | 产物链路一致性 | P1 | ✅ |
| BDD-009 | agent-trace-continuity.feature | trace 连续性与分页一致性 | P1 | ✅ |

---

## 6. 技术设计要点（下一步实现约束）

### 6.1 测试分层

1. **UI 行为层**：验证 `/workspace` 的可见行为。
2. **API 合约层**：验证 `/api/agent`、`/api/projects`、`/api/tasks`。
3. **Runtime 事件层**：验证事件顺序和关键字段。

### 6.2 稳定性策略

1. 默认 `workers=1`（BDD 全量阶段）。
2. `trace: on-first-retry`。
3. 每次运行隔离 `DATA_DIR=.tmp/bdd-data`。
4. 对波动场景优先引入 deterministic runtime。

### 6.3 AI 协作策略

1. `pnpm bdd:export` 作为 AI 场景生成输入。
2. AI 只允许使用导出的 steps。
3. 场景评审通过后才进入编码。

---

## 7. 执行顺序（下一轮）

1. CI 增加分层执行（PR smoke + 夜间 full）。
2. 在 CI 归档 Playwright HTML + Cucumber JSON + 失败 trace/video。
3. 更新 PR/需求模板，强制关联 BDD 场景。
4. 跑通 `bdd:test` 并将失败报告归档。

---

## 8. 验收标准（全局）

1. 北极星流程（创建 -> 执行 -> 调整 -> 恢复）可由 BDD 自动验证。
2. 关键错误都能给出下一步动作且有测试断言。
3. PR 级 smoke 稳定，夜间全量稳定。
4. 场景文档可直接作为产品行为说明（Living Spec）。

---

## 9. 新对话启动指令（复制即可）

```text
请按 docs/specs/agent-chat-bdd-implementation/01-implementation-plan.md 推进 Phase 6 收口：
1) CI 分层（PR 跑 bdd:smoke，Nightly 跑 bdd:test）；
2) 归档 BDD 报告（HTML + Cucumber JSON + 失败 trace/video）；
3) 更新 PR/需求模板，要求关联 BDD 场景；
4) 跑 pnpm bdd:test 并提交。
```
