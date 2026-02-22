@northstar @chat-core @conflict @phase8
Feature: Turn 冲突矩阵
  作为 Chat-Only 工作台用户
  我希望 running/idle 下的 turn 与控制动作冲突语义稳定
  以避免并发操作导致状态错乱

  Scenario: running 中再次发起 turn 会返回 SESSION_RUNNING
    Given 我准备了用于 Chat Core 验证的 Deterministic 会话
    When 我启动一个流式 turn "请持续输出，方便我发起二次 turn"
    And 我在 turn 运行中再次发起 turn "这条 turn 不应被受理"
    Then 二次 turn 请求应返回 409 与错误码 "SESSION_RUNNING"
    And turn 流应按顺序包含事件 "turn.started,assistant.completed,turn.completed"
    And 该会话状态最终应为 "idle"

  Scenario: running 中 follow-up 与 steer 请求可受理
    Given 我准备了用于 Chat Core 验证的 Deterministic 会话
    When 我启动一个流式 turn "请持续输出，方便我插入 follow-up 与 steer"
    And 我在 turn 运行中发送 follow-up "补充A"
    And 我在 turn 运行中发送 steer "优先改写语气"
    Then turn 流应包含 follow-up 入队并应用事件
    And turn 流应包含 steer 入队并应用事件
    And 该会话状态最终应为 "idle"

  Scenario: idle 状态执行 abort 会返回 SESSION_NOT_RUNNING
    Given 我准备了用于 Chat Core 验证的 Deterministic 会话
    When 我在会话空闲时执行 abort
    Then abort 请求应返回 409 与错误码 "SESSION_NOT_RUNNING"
