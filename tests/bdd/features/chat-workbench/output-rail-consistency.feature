@northstar @output-rail
Feature: 产物栏输出一致性
  作为 Chat-Only 工作台用户
  我希望会话快照与 outputs 列表保持一致
  以便产物栏展示稳定可靠

  @phase6 @phase7
  Scenario: 会话快照与 outputs 过滤结果一致
    Given 我准备了一个包含 photo 与 copy 输出的会话
    When 我读取该会话快照与 outputs 列表
    Then 会话快照中的 outputs 数应为 2
    And outputs 列表按 kind "photo" 过滤应仅返回 1 条
    And outputs 列表按 kind "copy" 过滤应仅返回 1 条
    And 会话快照与 outputs 列表的 ID 集合应一致
    And outputs 列表按 photo turnId 过滤应返回 1 条 photo 输出
    And outputs 列表按 copy turnId 过滤应返回 1 条 copy 输出

  @phase6 @phase7 @negative
  Scenario: 不存在 turnId 的过滤结果应为空
    Given 我准备了一个包含 photo 与 copy 输出的会话
    When 我按不存在的 turnId 过滤 outputs 列表
    Then 不存在 turnId 过滤结果应为 0 条

  @phase6 @phase7 @negative
  Scenario: refId 为空的 copy 输出可稳定读取
    Given 我准备了一个包含 photo 与 copy 输出的会话
    When 我读取该会话快照与 outputs 列表
    Then outputs 列表按 kind "copy" 过滤应仅返回 1 条
    And copy 输出的 refId 应为 null
