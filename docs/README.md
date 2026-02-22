# 文档总索引（统一入口）

本仓库文档已统一在 `docs/` 下，目标是提供单一真相源，避免历史双轨维护。

## 快速导航

1. 产品与流程：`docs/product/overview.md`、`docs/product/user-flows.md`
2. 工程契约与 API：`docs/engineering/contracts.md`、`docs/engineering/api.md`
   - Agent `@` 引用实现：`docs/engineering/agent-mentions.md`
3. 日常开发与协作：`docs/dev/commands.md`、`docs/dev/contributing.md`
   - 上游 Agent 参考基线：`docs/dev/upstream-pi-mono.md`
   - Agent 上游差异与去重清单：`docs/dev/agent-upstream-gap.md`
   - Agent 上游差异实施进度：`docs/dev/agent-upstream-gap-progress.md`
   - Agent 保留能力偏离与 SLA：`docs/dev/agent-upstream-deviations.md`
   - Chat-First BDD 框架：`docs/dev/agent-chat-bdd-framework.md`
4. 架构与端侧规范：`docs/dev/architecture.md`、`docs/dev/frontend.md`
5. 重构路线：`docs/refactor/v2-roadmap.md`
6. BDD 实施计划：`docs/specs/agent-chat-bdd-implementation/01-implementation-plan.md`
7. 设计先行流程：`docs/dev/skills.md`
8. 决策记录：`docs/adr/README.md`

## 目录说明

- `docs/dev/`：开发与协作指南（历史协作文档已迁移）
- `docs/product/`：产品定位、流程、品牌
- `docs/engineering/`：工程契约、运行时、API
- `docs/refactor/`：当前仍有效的重构路线
- `docs/specs/`：功能规格、UX 规格、Build Order、评审产物
- `docs/adr/`：架构决策记录
- `docs/templates/`：Feature Spec / ADR 模板

## 已清理的过时文档

- `docs/refactor/known-issues.md`（问题已全部关闭，内容过期）
- `docs/refactor/roadmap.md`（已完成版路线图，已被 `v2-roadmap.md` 取代）
- `docs/engineering/system-map.md`（与当前实现偏差较大，已下线）

## 维护约定

- 契约优先：影响数据结构、API、导出格式时，先更新文档再改代码。
- 决策留痕：出现方案取舍时，新增 ADR。
- 链接可达：新增文档必须在本索引或对应子目录索引可发现。
