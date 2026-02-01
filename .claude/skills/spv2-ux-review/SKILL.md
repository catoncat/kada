---
name: spv2-ux-review
description: 为 shooting-planner-v2 做 UX 评审并产出可执行验收清单（重点 Empty/Loading/Error 状态与可恢复路径）。用于：UX 评审/验收清单/回归场景/状态检查/文案校对。要求先有 docs/specs/FEATURE_SLUG/02-ux-spec.md，输出到 04-ux-review.md；不写实现代码。
---

# spv2-ux-review

目标：把 `02-ux-spec.md` 变成可执行的验收场景（QA/自测 checklist），并指出阻塞性 UX 风险。

## 示例触发

- “对这个 UX spec 做评审，输出验收场景清单”
- “帮我检查 empty/loading/error states 是否齐全且可恢复”

## gating（不满足就停止，只输出待补齐清单）

必须存在：`docs/specs/FEATURE_SLUG/02-ux-spec.md`

## 必须先读（真相源）

- `docs/specs/FEATURE_SLUG/02-ux-spec.md`
- `docs/product/user-flows.md`

## 输出

- 写入：`docs/specs/FEATURE_SLUG/04-ux-review.md`

## 必须输出的内容

1. 问题清单（按严重性）
   - Blocker：会导致任务无法完成或不可恢复
   - Major：显著增加认知负担/高概率误操作
   - Minor：一致性/微文案/可访问性等
2. 状态覆盖检查（逐条对照 UX Spec）
   - Empty / Loading / Error / Success 是否齐全
   - 每个状态是否给出“用户下一步怎么做/如何恢复”
3. 验收场景（10–20 条，可执行）
   - 至少覆盖：首次使用、无数据、无 Provider/无 Key、超时、模型不支持、部分失败与重试/恢复
4. 文案与反馈质量检查
   - 禁止“未知错误”；必须给出原因（若可判定）+ 建议动作

