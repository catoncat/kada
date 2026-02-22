# Chat-First BDD 实施方案（Agent 作为唯一工作台）

更新时间：`2026-02-22`

关联执行蓝图：`docs/specs/agent-chat-bdd-implementation/01-implementation-plan.md`

## 1. 目标

把 `feature` 变成产品改造的可执行真相源：

1. 所有核心能力围绕 `/workspace`（Agent Chat）定义。
2. 每个产品改造先写 Gherkin 场景，再改代码。
3. 用 Playwright-BDD 执行场景，防止改造方向跑偏。

## 2. 技术选型

- Runner：`@playwright/test`
- BDD 层：`playwright-bdd`
- 关键原因：
  - 保留 Playwright 并行/重试/trace/report 能力
  - 用 Gherkin 做“产品行为规格”
  - 支持 `bddgen export`，可把步骤词典喂给 AI 生成场景

## 3. 落地结构

```txt
tests/bdd/
  features/chat-workbench/
    session-management.feature
    error-recovery.feature
    generation-tasks.feature
    chat-core-flow.feature
  steps/
    fixtures.ts
    workspace.steps.ts
    project-generation.steps.ts
    chat-core-flow.steps.ts
playwright-bdd.config.ts
```

## 4. 运行方式

```bash
pnpm bdd:export   # 导出步骤词典
pnpm bdd:gen      # 生成 Playwright 测试
pnpm bdd:smoke    # 运行烟测场景
pnpm bdd:test     # 全量运行
pnpm bdd:report   # 查看报告
```

说明：BDD 运行时自动启动 `pnpm dev:all`，并隔离 Sidecar 数据目录：`.tmp/bdd-data`；同时注入 `AGENT_ENABLE_DETERMINISTIC_RUNTIME=1`，用于 Phase 3 的可控流式场景。

## 5. AI 协作流程（防跑偏）

1. 先实现/维护 step definitions。
2. 执行 `pnpm bdd:export`，拿到“允许步骤清单”。
3. 用该清单约束 AI 生成 `.feature`。
4. 人工评审场景后，再进入编码。
5. PR 必须附带新/改场景与执行结果。

## 6. 当前已落地场景（Phase 1 + Phase 2 + Phase 3）

### Chat 工作台（UI）

- `session-management.feature`
  - 创建会话
  - 归档/恢复会话
  - 删除会话
- `error-recovery.feature`
  - 未配置 Provider 时的可诊断错误提示

### 生成编排能力（API 合约）

- `generation-tasks.feature`
  - 预览预案 prompt + 创建预案任务
  - 创建图片任务 + 校验恢复上下文 `sourceType=projectResult`

### Chat Core 流程（Runtime + API）

- `chat-core-flow.feature`
  - turn 流式完成（事件顺序校验）
  - 运行中 follow-up 入队并应用
  - 运行中 steer 入队并应用
  - 运行中 abort 后状态保持 `aborted`

## 7. 维护约束

1. 一条 Scenario 只表达一个行为规则。
2. 避免实现细节导向步骤（描述 what，不描述 how）。
3. 缺失步骤默认 `fail-on-gen`，禁止“场景存在但不可执行”。
4. 默认保留失败 trace：`trace: on-first-retry`。
