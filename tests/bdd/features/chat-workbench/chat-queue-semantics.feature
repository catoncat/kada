@northstar @chat-core @queue @phase7
Feature: Chat 队列语义稳定性
  作为 Chat-Only 工作台用户
  我希望 follow-up / steer / abort 的队列语义稳定
  以避免运行时改动导致行为回归

  Background:
    Given 我准备了用于 Chat Core 验证的 Deterministic 会话

  Scenario: 多个 follow-up 按发送顺序应用
    When 我启动一个流式 turn "请持续输出，方便插入多条 follow-up"
    And 我在 turn 运行中发送 follow-up "补充A"
    And 我在 turn 运行中发送 follow-up "补充B"
    Then turn 流应包含 follow-up 入队并应用事件
    And follow-up 应按发送顺序被应用为 "补充A,补充B"
    And 该会话状态最终应为 "idle"

  Scenario: steer 应优先于 follow-up 应用
    When 我启动一个流式 turn "请持续输出，方便同时插入 steer 与 follow-up"
    And 我在 turn 运行中发送 follow-up "补充普通细节"
    And 我在 turn 运行中发送 steer "先改成更轻松语气"
    Then turn 流应包含 steer 入队并应用事件
    And turn 流应包含 follow-up 入队并应用事件
    And steer 应在 follow-up 之前被应用
    And 该会话状态最终应为 "idle"

  Scenario: abort 后不应继续应用排队消息
    When 我启动一个流式 turn "请持续输出，随后我会中断"
    And 我在 turn 运行中发送 follow-up "中断后不应再应用"
    And 我在 turn 运行中执行 abort
    Then turn 流应包含事件 "session.aborted"
    And abort 之后不应出现事件 "followup.applied,steer.applied"
    And turn 应以 aborted 语义结束
    And 该会话状态最终应为 "aborted"
