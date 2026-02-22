@northstar @output-rail @negative @phase7
Feature: 产物栏一致性边界场景
  作为 Chat-Only 工作台用户
  我希望 outputs 在边界情况下也保持一致
  以便产物栏展示稳定可靠

  Scenario: 会话快照与 outputs 列表 ID 集合一致
    Given 我准备了一个包含 photo 与 copy 输出的会话
    When 我读取该会话快照与 outputs 列表
    Then 会话快照中的 outputs 数应为 2
    And 会话快照与 outputs 列表的 ID 集合应一致

  Scenario: 不存在 turnId 的过滤结果应为空
    Given 我准备了一个包含 photo 与 copy 输出的会话
    When 我按不存在的 turnId 过滤 outputs 列表
    Then 不存在 turnId 过滤结果应为 0 条

  Scenario: refId 为空的 copy 输出可稳定读取
    Given 我准备了一个包含 photo 与 copy 输出的会话
    When 我读取该会话快照与 outputs 列表
    Then outputs 列表按 kind "copy" 过滤应仅返回 1 条
    And copy 输出的 refId 应为 null
