@northstar @recovery @phase5
Feature: 任务恢复与重放
  作为 Chat-Only 工作台用户
  我希望失败任务可以被恢复或重放
  以便不中断当前工作流

  Scenario: failed 图片任务可 retry 回 pending
    Given 我准备了一个失败的图片任务
    When 我重试该失败任务
    Then 重试后的任务状态应为 "pending"
    And 该任务详情恢复上下文 sourceType 应为 "projectResult"

  Scenario: replay 同 requestId 应命中幂等去重
    Given 我准备了一个可重放的预案任务
    When 我以 requestId "bdd-replay-fixed" 重放该任务
    And 我再次以相同 requestId "bdd-replay-fixed" 重放该任务
    Then 第二次重放应返回 deduped 为 true
    And 两次重放返回的任务 ID 应一致

  Scenario: replay 缺失 requestId 应返回 400
    Given 我准备了一个可重放的预案任务
    When 我重放该任务但不传 requestId
    Then 重放请求应返回 400

  Scenario: retry 非 failed 任务应返回 400
    Given 我准备了一个非 failed 的图片任务
    When 我重试该非 failed 任务
    Then 重试请求应返回 400
