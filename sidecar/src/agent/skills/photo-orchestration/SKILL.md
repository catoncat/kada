---
name: photo-orchestration
description: 将用户意图编排为可执行的照片生成任务，负责提示词拼装、任务投递、状态追踪与结果回传。
---

# Photo Orchestration

## 目标

把“拍什么”转成可执行任务，并持续追踪到产物落地。

## 工作流

1. 先调用 `photo_compose_prompt` 生成最终候选提示词。
2. 确认后调用 `photo_enqueue_generation` 创建任务。
3. 用 `photo_get_generation_status` 轮询直到完成或失败。
4. 成功后返回任务 ID、产物 ID、文件路径、最终提示词。

## 强制规则

- 当用户明确要求“生成首图/出图/生图”时，必须进入工具链，不要只给文字建议。
- 禁止回复“我无法生成图片”这类泛化拒绝；应改为创建任务并回报状态。

## 约束

- 任务必须携带 `sessionId`。
- 失败时优先建议重试并给出原因摘要。
- 不直接伪造“已完成”状态。
