# Agent Chat BDD 能力映射总览（Capability → Feature）

更新时间：`2026-02-23`
关联计划：`docs/specs/agent-chat-bdd-implementation/01-implementation-plan.md`

---

## 1. 当前测试资产快照

- Feature 文件数：**13**
- Scenario 数：**38**
- 执行层级：
  - Smoke（本地快速）：`@smoke and not @wip`，当前 **4** 条
  - PR Gate（PR/Push）：`not @wip`，当前 **38** 条
  - Full（Nightly/手动）：全量 **38** 条

---

## 2. 业务能力 → BDD Feature 映射

| 业务能力域 | 验证目标 | Feature / Scenario 覆盖 | 主要标签 | 主要层级 |
|---|---|---|---|---|
| 会话生命周期管理 | 会话可创建、归档/恢复、删除，且状态可见 | `session-management.feature`（3 条） | `@smoke @northstar @phase1` | UI + API |
| 关键依赖错误反馈 | 未配置 Provider 时给出可诊断错误 | `error-recovery.feature`（1 条） | `@smoke @error @phase1` | UI + API |
| 生成任务编排 | 预案 preview/execute、图片任务恢复上下文 | `generation-tasks.feature`（2 条） | `@northstar @workflow @phase2` | API 合约 |
| Chat Core 控制流 | turn 流式、follow-up/steer 入队、abort 语义 | `chat-core-flow.feature`（4 条） | `@northstar @chat-core @phase3` | Runtime + API |
| Chat 队列语义 | 多 follow-up 顺序、steer 优先级、abort 后不再应用队列 | `chat-queue-semantics.feature`（3 条） | `@northstar @chat-core @queue @phase7` | Runtime + API |
| 多会话并发隔离 | 并发不串线；中断 A 不影响 B | `multi-session-parity.feature`（2 条） | `@northstar @isolation @phase4` | Runtime + API |
| 资源检索与 mention 上下文 | 搜索 project/scene/model；mention 成功+降级；image mention 成功+image_not_found 降级 | `resource-context.feature`（4 条） | `@northstar @resource @phase4` | API + Runtime 注入 |
| 失败恢复与幂等重放 | failed retry；replay requestId 幂等；错误分支（缺 requestId / 非 failed retry） | `task-recovery.feature`（4 条） | `@northstar @recovery @phase5` | API 合约 |
| 产物栏一致性/边界 | session 快照 outputs 与 outputs 过滤一致；不存在 turnId 空结果；copy refId 为 null | `output-rail-consistency.feature`（3 条） | `@northstar @output-rail` + 场景级 `@phase6/@phase7/@negative` | API 读模型一致性 |
| Trace 连续性/续播 | cursor 连续分页、非法 cursor 降级、超大 cursor 空页、重复 cursor 确定性 | `agent-trace-continuity.feature`（4 条） | `@northstar @trace @reconnect` + 场景级 `@phase6/@phase7` | 可观测性 API |
| Turn 冲突矩阵 | running/idle 下 turn 与控制动作冲突语义稳定 | `turn-conflict-matrix.feature`（3 条） | `@northstar @chat-core @conflict @phase8` | Runtime + API |
| 会话断线续播 | 运行中记录 cursor，完成后续拉事件不重不漏 | `session-reconnect-continuity.feature`（2 条） | `@northstar @reconnect @events @phase8` | Runtime + 事件 API |
| Provider 错误分类 | 401/429/不可达按 auth/rate_limit/network 归类 | `provider-error-taxonomy.feature`（3 条） | `@northstar @provider @error @phase8` | Provider Trace 可观测性 |

---

## 3. Feature 文件索引

- `tests/bdd/features/chat-workbench/session-management.feature`
- `tests/bdd/features/chat-workbench/error-recovery.feature`
- `tests/bdd/features/chat-workbench/generation-tasks.feature`
- `tests/bdd/features/chat-workbench/chat-core-flow.feature`
- `tests/bdd/features/chat-workbench/chat-queue-semantics.feature`
- `tests/bdd/features/chat-workbench/multi-session-parity.feature`
- `tests/bdd/features/chat-workbench/resource-context.feature`
- `tests/bdd/features/chat-workbench/task-recovery.feature`
- `tests/bdd/features/chat-workbench/output-rail-consistency.feature`
- `tests/bdd/features/chat-workbench/agent-trace-continuity.feature`
- `tests/bdd/features/chat-workbench/turn-conflict-matrix.feature`
- `tests/bdd/features/chat-workbench/session-reconnect-continuity.feature`
- `tests/bdd/features/chat-workbench/provider-error-taxonomy.feature`

---

## 4. 执行策略映射（CI）

- PR/Push：`pnpm bdd:pr-gate`
  - 覆盖：`not @wip` 全量门禁（当前 **38** 条）
- Nightly/Manual：`pnpm bdd:test`
  - 覆盖：全量 **38** 条（含 runtime / 资源 / 恢复 / trace / output / conflict / reconnect / provider taxonomy）

产物归档（CI artifacts）：
- `playwright-report`
- `test-results`（含 cucumber json）

---

## 5. 当前覆盖边界与下一步建议

### 已覆盖强项

1. Chat-Only 主链路的关键控制行为（turn / steer / follow-up / abort）。
2. 队列语义（顺序、优先级、中断后边界）。
3. 多会话并发隔离与 turn 冲突矩阵（running/idle 语义）。
4. 任务失败恢复与重放幂等。
5. 产物栏输出读取一致性与边界分支。
6. trace 连续分页、续播确定性与游标边界。
7. Provider 失败可观测分类（auth / rate_limit / network）。

### 下一步可补强（建议）

1. Queue/Abort 并发竞争下的稳定性（高并发 follow-up/steer 压测）。
2. Trace API 过滤组合（traceId + channel + event + cursor）的交叉覆盖。
3. 失败路径占比持续提升（目标：失败/边界场景 ≥ 成功场景的 60%）。
