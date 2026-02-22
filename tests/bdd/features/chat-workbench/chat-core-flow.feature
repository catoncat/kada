@northstar @chat-core
Feature: Chat Core 流程编排
  作为 Chat-Only 工作台的用户
  我希望 turn / follow-up / steer / abort 行为稳定可验证
  以便关键对话链路在迭代中不会回归

  Scenario: turn 可以流式完成
    Given 我准备了用于 Chat Core 验证的 Deterministic 会话
    When 我启动一个流式 turn "请给我一个本次拍摄的开场建议"
    Then turn 流应按顺序包含事件 "turn.started,assistant.delta,assistant.completed,turn.completed"
    And 该会话状态最终应为 "idle"

  Scenario: 运行中 follow-up 会入队并应用
    Given 我准备了用于 Chat Core 验证的 Deterministic 会话
    When 我启动一个流式 turn "请连续输出内容，方便我插入 follow-up"
    And 我在 turn 运行中发送 follow-up "补充镜头运动建议"
    Then turn 流应包含 follow-up 入队并应用事件
    And 该会话状态最终应为 "idle"

  Scenario: 运行中 steer 会入队并应用
    Given 我准备了用于 Chat Core 验证的 Deterministic 会话
    When 我启动一个流式 turn "请连续输出内容，方便我插入 steer"
    And 我在 turn 运行中发送 steer "改为轻松自然的语气继续"
    Then turn 流应包含 steer 入队并应用事件
    And 该会话状态最终应为 "idle"

  Scenario: 运行中 abort 会中断当前 turn
    Given 我准备了用于 Chat Core 验证的 Deterministic 会话
    When 我启动一个流式 turn "请生成一段较长的响应"
    And 我在 turn 运行中执行 abort
    Then turn 流应包含事件 "session.aborted"
    And 该会话状态最终应为 "aborted"
