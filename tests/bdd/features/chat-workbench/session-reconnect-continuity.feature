@northstar @reconnect @events @phase8
Feature: 会话事件断线续播连续性
  作为 Chat-Only 工作台用户
  我希望在中途断线后可以按 cursor 续拉事件
  以便恢复时不重不漏

  Scenario: 运行中记录 cursor 后可续拉剩余事件
    Given 我准备了用于断线续播验证的 Deterministic 会话
    When 我启动流式 turn 并在运行中记录第一页事件游标
    And 我在 turn 完成后基于该游标续拉事件
    Then 续拉事件的首条 seq 应大于第一页 cursor
    And 首次与续拉事件合并后应覆盖完整事件序列
    And 续拉结果应包含事件类型 "turn.completed"
    And 断线续播场景会话状态最终应为 "idle"

  Scenario: 使用相同游标重复续拉应返回相同 seq 集合
    Given 我准备了用于断线续播验证的 Deterministic 会话
    When 我启动流式 turn 并在运行中记录第一页事件游标
    And 我在 turn 完成后基于该游标续拉事件
    And 我再次使用同一游标续拉会话事件
    Then 重复续拉的 seq 集合应与上次一致
