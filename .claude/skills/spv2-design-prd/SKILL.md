---
name: spv2-design-prd
description: 为 shooting-planner-v2 生成/更新 PRD/功能规格（Feature Spec），强制先设计后编码。用于：写 PRD/写需求/写功能规格/feature spec/整理需求/验收标准。输出到 docs/specs/FEATURE_SLUG/01-feature-spec.md；禁止写实现代码。
---

# spv2-design-prd

目标：把用户的想法整理成可验收、可实施的 Feature Spec（承担 PRD 角色），并对齐本仓库文档体系（`AGENTS.md`、`agent_docs/`、`docs/`）。

## 示例触发

- “给我写一个 feature spec：批量生成参考图要支持取消/失败重试”
- “把这个需求整理成 PRD，并补齐验收标准和失败场景”
- “我要做 XXX 功能，先写规格，不要写代码”

## 必须先读（真相源）

- `AGENTS.md`
- `docs/README.md`
- `docs/templates/feature-spec.md`
- 如涉及用户流程/页面状态：`docs/product/user-flows.md`

## 输入（必须从用户获取；缺任何一项就停止并提问）

- `FEATURE_SLUG`（kebab-case；将作为 `docs/specs/FEATURE_SLUG/` 目录名）
- App Overview：一句话描述用户价值
- Target Audience：谁在用、痛点是什么
- Core Features（MVP）：仅 3–5 个点，区分“必须有 / 以后再说”
- User Flow（High Level）：用户从入口到完成核心任务的路径
- Success Criteria：可验证的成功标准（至少 3 条）
- Failure Scenarios：至少 2 条失败/异常场景（按实际相关性写：无 Key、超时、模型不支持等）
- 约束：是否涉及 Sidecar/API/DB/导出/PPT/图片等

## 输出

- 写入：`docs/specs/FEATURE_SLUG/01-feature-spec.md`
- 结构必须以 `docs/templates/feature-spec.md` 为骨架（可补充，但不要删模板主标题层级）

## 工作流（严格按序）

1. 确认 `FEATURE_SLUG` 与功能边界（非目标也要写清楚）。
2. 基于模板生成/更新 `docs/specs/FEATURE_SLUG/01-feature-spec.md`：
   - “背景与目标”里必须包含 App Overview 与 Target Audience
   - “交互与流程”必须同时覆盖主流程与异常/边界流程
   - “验收标准”必须同时包含成功标准与失败/异常场景（每条可验证）
3. 在“数据与接口影响”里明确（若不确定也要写成待确认项）：
   - 是否需要同步更新 `docs/engineering/contracts.md`
   - 是否需要同步更新 `docs/engineering/api.md`
   - 是否存在方案分歧/取舍（如有，标记需要触发 `spv2-write-adr`）
4. 质量自检（任一不满足就停止并只输出待补齐问题清单）：
   - 文件包含模板的四个二级标题：背景与目标 / 交互与流程 / 数据与接口影响 / 验收标准
   - 验收标准可复现、可观察、可判定（避免“体验更好/更流畅”这类不可测描述）

## 不要做

- 不要写任何实现代码（前端/Sidecar/Rust 都不要）
- 不要修改生成/产物：`dist/`、`src/routeTree.gen.ts`、`.tanstack/`、`src-tauri/target/`
- 不要在文档中写入密钥、Provider 凭据或任何敏感信息

