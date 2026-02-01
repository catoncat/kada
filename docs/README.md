# 产品与重构文档（索引）

这套文档的目标是：**让团队在重构与持续开发阶段有共同语言、共同边界和共同"真相源"**。内容以"能指导决策与落地"为标准，避免写成大而全的说明书。

## 如何使用

1. 想快速理解产品：先读 `docs/product/overview.md`，再读 `docs/product/user-flows.md`。
2. **想了解 v2 重构计划**：读 `docs/refactor/v2-roadmap.md`（资产驱动 + 图文生图）。
3. 想改接口/数据：先确认 `docs/engineering/contracts.md` 与 `docs/engineering/api.md`，必要时写 ADR。

开发命令与仓库协作约定不放在这里，见根目录的 `AGENTS.md` 与 `agent_docs/`。

## 文档结构

- `docs/product/`：产品定位、核心概念、用户流程与交互状态
- `docs/engineering/`：系统边界、数据契约、API 参考
- `docs/refactor/`：重构路线图、已知问题清单
  - **`v2-roadmap.md`**：当前进行中的 v2 重构（资产驱动 + 图文生图）
- `docs/adr/`：关键决策记录
- `docs/templates/`：写新功能规格/ADR 的模板

## 维护约定

- **契约优先**：凡是影响数据结构、API、本地存储键、导出格式的改动，必须先更新文档再改代码。
- **决策留痕**：出现"要不要这样做"的争议点，写一条 ADR。
- **小步更新**：每次 PR 至少更新 1 处文档（如果本次改动影响用户流程/接口/数据）。

