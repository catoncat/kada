@northstar @isolation @phase4
Feature: 多会话并发隔离
  作为 Chat-Only 工作台的用户
  我希望多个会话并发执行时互不干扰
  以避免串线或状态污染

  Scenario: 两个会话并发 turn 时事件不串线
    Given 我准备了两个用于并发验证的 Deterministic 会话
    When 我在会话 A 启动流式 turn "A 会话需要一段风格化建议"
    And 我在会话 B 启动流式 turn "B 会话需要另一段风格化建议"
    Then 两个会话应出现并发运行窗口
    And 会话 A 的 turn 流中不应出现会话 B 的 sessionId
    And 会话 B 的 turn 流中不应出现会话 A 的 sessionId
    And 会话 A 状态最终应为 "idle"
    And 会话 B 状态最终应为 "idle"

  Scenario: 中断会话 A 不影响会话 B 完成
    Given 我准备了两个用于并发验证的 Deterministic 会话
    When 我在会话 A 启动流式 turn "A 会话执行较长输出"
    And 我在会话 B 启动流式 turn "B 会话继续执行"
    And 两个会话应出现并发运行窗口
    And 我在会话 A 运行中执行 abort
    Then 会话 A 状态最终应为 "aborted"
    And 会话 B 的 turn 流应包含事件 "turn.completed"
    And 会话 B 的 turn 流不应包含事件 "session.aborted"
    And 会话 B 状态最终应为 "idle"
