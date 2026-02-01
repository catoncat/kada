---
name: spv2-design-ux
description: 为 shooting-planner-v2 生成 UX Spec（心智模型/信息架构/Empty-Loading-Error 状态机/组件交互细节），强制先 UX 后编码。用于：做 UX 设计/写 UX spec/空状态/错误处理/信息架构/交互细化。要求先有 docs/specs/FEATURE_SLUG/01-feature-spec.md，输出到 02-ux-spec.md；禁止写实现代码。
---

# spv2-design-ux

目标：把 `01-feature-spec.md` 翻译成可实现、可验收的 UX Specification，重点补齐“系统反馈”（Empty/Loading/Error）与恢复路径。

## 示例触发

- “基于 feature spec 写 UX spec，重点空状态/加载/错误处理”
- “把交互细化到组件行为和文案，不要写代码”
- “帮我设计异常流程：无 key/超时/模型不支持时怎么提示、怎么恢复”

## gating（不满足就停止，只输出待补齐清单）

必须存在：`docs/specs/FEATURE_SLUG/01-feature-spec.md`，且至少包含：

- `## 交互与流程`
- `## 验收标准`

## 必须先读（真相源）

- `docs/specs/FEATURE_SLUG/01-feature-spec.md`
- `docs/product/user-flows.md`
- `agent_docs/frontend.md`

## 输入（对话中可选；缺省则采用默认）

- 交互取向：更保守可控 / 更自动化省事（默认：保守可控）
- 风格偏好：极简 / 信息密集 / 强引导（默认：强引导但不打扰）

## 输出

- 写入：`docs/specs/FEATURE_SLUG/02-ux-spec.md`

## 必须输出的结构（按顺序）

1. Mental Model：用户如何理解这个界面（它像表单/向导/列表+详情/画布？）
2. Information Architecture（IA）：信息层级与默认焦点（什么最重要）
3. Affordance：关键按钮/交互区如何显性提示（避免“需要猜”）
4. System Feedback（每条都必须写“用户下一步怎么做/如何恢复”）
   - Empty States：至少 3 个（首次/无数据/无 Provider 或不可用）
   - Loading States：至少 3 个（提交生成/拉模型列表/批量生图或导出）
   - Error States：至少 6 个（按实际相关性取用）
     - 无 Key / 未配置 Provider
     - 401/403（鉴权失败）
     - 超时/网络不可用
     - 模型不支持（text/image 能力不匹配）
     - LLM 返回 JSON 不合法
     - 图片生成失败（含部分失败的恢复路径）
5. Component Detail：核心组件交互逻辑（与仓库现状对齐）
   - Sidebar（历史切换/删除/空态）
   - 结果页（单预案 vs 项目预案）
   - 设置（Provider 管理、主题示例编辑器）
6. Copy & Microcopy：错误/确认弹窗/按钮文案原则（必须给出可行动的下一步；避免“未知错误”）
7. A11y 最低要求：焦点管理、Esc 关闭、Enter 提交、必要 aria-label

## 不要做

- 不要写实现代码
- 不要引入与仓库技术栈不匹配的组件体系（本仓库：Base UI + Tailwind）

