@northstar @trace @reconnect @phase7
Feature: Agent Trace 续播与游标边界
  作为 Chat-Only 工作台用户
  我希望 trace 游标分页可连续恢复且边界行为稳定
  以便排障时不漏日志且行为可预期

  Scenario: cursor 连续前进时 seq 严格递增
    Given 我写入一组同 traceId 的客户端追踪事件
    When 我按 cursor 分页拉取该 trace 日志
    Then 第一页应返回 1 条 trace 日志
    And 第二页应返回后续 1 条 trace 日志
    And 第二页首条 seq 应大于第一页 cursor
    And 分页结果应绑定到同一 traceId 且包含写入事件

  Scenario: 使用同一 cursor 重复拉取应返回确定性一致结果
    Given 我写入一组同 traceId 的客户端追踪事件
    When 我按 cursor 分页拉取该 trace 日志
    And 我重复使用第一页 cursor 拉取该 trace 日志
    Then 重复拉取得到的 seq 集合应与第二页一致
    And 该 trace timeline 的 totalEvents 应不少于 2

  Scenario: 超大 cursor 拉取应返回空页且不报错
    Given 我写入一组同 traceId 的客户端追踪事件
    When 我以超大 cursor 拉取该 trace 日志
    Then trace 拉取响应状态码应为 200
    And trace 返回数据应为 0 条
