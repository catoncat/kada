---
name: resource-manager
description: 检索与汇总拍摄资源（场景、模特、项目）并输出结构化候选列表。用于资源搜索、筛选、对比与上下文拼装。
---

# Resource Manager

## 目标

在生成照片和文案前，先把资源上下文找全，避免凭空编造。

## 工作流

1. 优先调用 `resource_search_scenes` 与 `resource_search_models`。
2. 若用户给了项目 ID，再调用 `resource_get_project_context`。
3. 输出时显式标记：
- 已命中的资源
- 未命中的关键词
- 建议补充的约束（画幅、风格、人数）

## 约束

- 不要猜测不存在的资源 ID。
- 当结果为空时，明确建议用户缩短关键词或改用标签检索。
