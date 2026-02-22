@northstar @provider @error @phase8
Feature: Provider 错误分类
  作为 Chat-Only 工作台用户
  我希望 Provider 失败可被稳定归类
  以便快速采取恢复动作

  Scenario: Provider 返回 401 时归类为 auth
    Given 我准备一个会返回 401 的 Provider 会话
    When 我发送一次会触发 Provider 调用的 turn
    Then 本轮调用应记录 Provider 错误轨迹
    And Provider 轨迹状态码应为 401
    And 错误应被归类为 "auth"

  Scenario: Provider 返回 429 时归类为 rate_limit
    Given 我准备一个会返回 429 的 Provider 会话
    When 我发送一次会触发 Provider 调用的 turn
    Then 本轮调用应记录 Provider 错误轨迹
    And Provider 轨迹状态码应为 429
    And 错误应被归类为 "rate_limit"

  Scenario: Provider 不可达时归类为 network
    Given 我准备一个不可达的 Provider 会话
    When 我发送一次会触发 Provider 调用的 turn
    Then 本轮调用应记录 Provider 错误轨迹
    And Provider 轨迹事件应为 "provider.response_error"
    And 错误应被归类为 "network"
