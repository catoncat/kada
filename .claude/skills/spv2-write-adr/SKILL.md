---
name: spv2-write-adr
description: 为 shooting-planner-v2 编写 ADR（Architecture Decision Record）记录关键取舍与长期影响。用于：ADR/决策/权衡/方案对比/要不要这样做/迁移策略/接口定稿。按 docs/adr/README.md 的命名规则输出到 docs/adr/NNNN-title.md；不写实现代码。
---

# spv2-write-adr

目标：把争议点/取舍写成可回溯的 ADR，明确选项、决策理由与迁移/回滚影响。

## 示例触发

- “这个点要不要写 ADR？给我对比 A/B 并做决策留痕”
- “我们在 localStorage vs Sidecar SQLite 上有争议，写一条 ADR”

## 必须先读（真相源）

- `docs/adr/README.md`
- `docs/templates/adr.md`
- 若涉及数据/API：`docs/engineering/contracts.md`、`docs/engineering/api.md`

## 输入（必须从用户获取；缺任何一项就停止并提问）

- 决策点一句话（为什么现在要做这个决策）
- 至少两个选项（A/B）
- 每个选项的：成本、风险、对现有数据/API/导出的影响
- 期望偏好（例如：更保守兼容 / 更激进简化）

## 输出

- 写入：`docs/adr/NNNN-kebab-case-title.md`
- 编号规则：扫描 `docs/adr/` 下现有 `NNNN-*.md`，取最大 NNNN + 1（不足 4 位左侧补 0）
- 内容结构以 `docs/templates/adr.md` 为骨架（背景/选项/决策/后果）

## 质量要求（必须包含）

- “后果”里必须写：正面影响、负面影响/代价、迁移要求、回滚方案
- 如 ADR 影响契约/API：在文末列出需要同步更新的文档路径（`docs/engineering/*`）

