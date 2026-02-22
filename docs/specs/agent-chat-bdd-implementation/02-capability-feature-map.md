# Agent Chat BDD 能力映射总览（Capability → Feature）

更新时间：`2026-02-22`
关联计划：`docs/specs/agent-chat-bdd-implementation/01-implementation-plan.md`

---

## 1. 当前测试资产快照

- Feature 文件数：**9**
- Scenario 数：**22**
- 执行层级：
  - Smoke（本地快速）：`@smoke`，当前 **4** 条
  - PR Gate（PR/Push）：`@phase2-@phase6`，当前 **14** 条
  - Full（Nightly/手动）：全量 **22** 条

---

## 2. 业务能力 → BDD Feature 映射

| 业务能力域 | 验证目标 | Feature / Scenario 覆盖 | 主要标签 | 主要层级 |
|---|---|---|---|---|
| 会话生命周期管理 | 会话可创建、归档/恢复、删除，且状态可见 | `session-management.feature`（3 条） | `@smoke @northstar` | UI + API |
| 关键依赖错误反馈 | 未配置 Provider 时给出可诊断错误 | `error-recovery.feature`（1 条） | `@smoke @error` | UI + API |
| 生成任务编排 | 预案 preview/execute、图片任务恢复上下文 | `generation-tasks.feature`（2 条） | `@northstar @workflow @phase2` | API 合约 |
| Chat Core 控制流 | turn 流式、follow-up/steer 入队、abort 语义 | `chat-core-flow.feature`（4 条） | `@northstar @chat-core @phase3` | Runtime + API |
| 多会话并发隔离 | 并发不串线；中断 A 不影响 B | `multi-session-parity.feature`（2 条） | `@northstar @isolation @phase4` | Runtime + API |
| 资源检索与 mention 上下文 | 搜索 project/scene/model；mention 成功+降级；image mention 成功+image_not_found 降级 | `resource-context.feature`（4 条） | `@northstar @resource @phase4` | API + Runtime 注入 |
| 失败恢复与幂等重放 | failed retry；replay requestId 幂等；错误分支（缺 requestId / 非 failed retry） | `task-recovery.feature`（4 条） | `@northstar @recovery @phase5` | API 合约 |
| 产物栏一致性 | session 快照 outputs 与 outputs 过滤一致 + ID 集合一致性 | `output-rail-consistency.feature`（1 条） | `@northstar @output-rail @phase6` | API 读模型一致性 |
| Trace 连续性 | trace 分页 cursor 连续；timeline 计数不丢失；traceId/event 绑定正确 | `agent-trace-continuity.feature`（1 条） | `@northstar @trace @phase6` | 可观测性 API |

---

## 3. Feature 文件索引

- `tests/bdd/features/chat-workbench/session-management.feature`
- `tests/bdd/features/chat-workbench/error-recovery.feature`
- `tests/bdd/features/chat-workbench/generation-tasks.feature`
- `tests/bdd/features/chat-workbench/chat-core-flow.feature`
- `tests/bdd/features/chat-workbench/multi-session-parity.feature`
- `tests/bdd/features/chat-workbench/resource-context.feature`
- `tests/bdd/features/chat-workbench/task-recovery.feature`
- `tests/bdd/features/chat-workbench/output-rail-consistency.feature`
- `tests/bdd/features/chat-workbench/agent-trace-continuity.feature`

---

## 4. 执行策略映射（CI）

- PR/Push：`pnpm bdd:pr-gate`
  - 覆盖：`@phase2/@phase3/@phase4/@phase5/@phase6` 共 **14** 条（核心能力门禁）
- Nightly/Manual：`pnpm bdd:test`
  - 覆盖：全量 **22** 条（含 runtime / 资源 / 恢复 / trace / output）

产物归档（CI artifacts）：
- `playwright-report`
- `test-results`（含 cucumber json）

---

## 5. 当前覆盖边界与下一步建议

### 已覆盖强项

1. Chat-Only 主链路的关键控制行为（turn / steer / follow-up / abort）。
2. 多会话并发隔离。
3. 任务失败恢复与重放幂等。
4. 产物栏输出读取一致性与 trace 连续性。

### 下一步可补强（建议）

1. `output-rail` 失败分支（例如 refId 缺失、产物软删后展示策略）。
2. `trace` 异常分支（空页、错 cursor、跨 trace 混查）。
3. 提升失败路径占比（建议达到成功路径 60%+）。
