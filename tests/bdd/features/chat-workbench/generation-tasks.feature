@northstar @workflow
Feature: 方案与生图任务编排能力
  作为 Chat-Only 工作台的用户
  我希望底层生成能力能被稳定调用
  以便 Agent 可以用自然语言编排方案和出图动作

  Scenario: 预览并创建预案生成任务
    Given 我准备了可用于生成的项目上下文
    When 我预览预案生成提示词
    Then 预览结果应包含非空 prompt
    When 我执行预案生成任务
    Then 系统应返回 pending 的预案任务
    And 项目任务列表应包含该预案任务

  Scenario: 创建图片任务后可提供恢复上下文
    Given 我准备了可用于生成的项目上下文
    When 我创建图片生成任务
    Then 系统应返回 pending 的图片任务
    And 图片任务详情的恢复上下文应标记为 "projectResult"
