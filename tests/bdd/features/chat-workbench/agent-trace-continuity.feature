@northstar @trace
Feature: Agent Trace 连续性
  作为 Chat-Only 工作台用户
  我希望 trace 日志支持游标连续拉取
  以便排查问题时不会漏事件

  Scenario: trace 日志可按 cursor 连续分页
    Given 我写入一组同 traceId 的客户端追踪事件
    When 我按 cursor 分页拉取该 trace 日志
    Then 第一页应返回 1 条 trace 日志
    And 第二页应返回后续 1 条 trace 日志
    And 第二页首条 seq 应大于第一页 cursor
    And 该 trace timeline 的 totalEvents 应不少于 2
