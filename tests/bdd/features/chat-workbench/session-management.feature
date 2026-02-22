@smoke @northstar @phase1
Feature: Chat 工作台会话管理
  作为使用 Chat 工作台的用户
  我希望在同一界面里完成会话管理
  以便把工作流完全收敛在 Agent Chat 内

  Background:
    Given 我在 Chat 工作台页面
    And Agent 会话列表已清空

  Scenario: 创建会话后成为当前会话
    When 我新建一个会话
    Then 会话列表里应该出现 1 个活跃会话
    And 当前会话应被选中
    And 当前状态栏应该显示 "空闲"

  Scenario: 会话可以归档后再恢复
    Given 我新建一个会话
    When 我把当前会话归档
    Then 会话列表里应该出现 0 个活跃会话
    When 我展开已归档会话并恢复当前会话
    Then 会话列表里应该出现 1 个活跃会话

  Scenario: 会话可以删除
    Given 我新建一个会话
    When 我删除当前会话
    Then 会话列表里应该出现 0 个活跃会话
