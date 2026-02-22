# Feature Intake（含 BDD 场景清单）

## 1) 目标与范围

- 背景：
- 用户价值：
- In Scope：
- Out of Scope：

## 2) 关键状态机（可选）

- Empty：
- Loading：
- Error：
- Recover：

## 3) BDD 场景清单（必填）

> 至少 1 条北极星 Scenario，且每条只验证一个业务规则。

- Feature 文件：`tests/bdd/features/chat-workbench/<feature>.feature`

### Scenario 草案

1. Given ... When ... Then ...
2. Given ... When ... Then ...

## 4) 验收与回归

- Smoke 标签：`@smoke` / `@northstar`
- 需要新增 steps：
- 回归命令：
  - `pnpm bdd:smoke`
  - `pnpm bdd:test`
