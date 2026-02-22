@smoke @error @phase1
Feature: Chat 工作台错误反馈
  作为使用 Chat 工作台的用户
  我希望系统在关键依赖缺失时给出明确错误
  以便我知道下一步该怎么恢复

  Background:
    Given 我在 Chat 工作台页面
    And Agent 会话列表已清空
    And 我新建一个会话

  Scenario: 未配置 Provider 时发送消息会提示可诊断错误
    When 我发送消息 "请帮我生成首版拍摄方案"
    Then 我应该看到错误提示包含 "未配置 Provider"
