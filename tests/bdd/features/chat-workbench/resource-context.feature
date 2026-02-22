@northstar @resource
Feature: 资源检索与 mention 上下文注入
  作为 Chat-Only 工作台的用户
  我希望在对话中稳定引用项目资源
  以便 Agent 按上下文执行并在资源缺失时给出降级路径

  Scenario: 资源搜索返回已创建的 project/scene/model
    Given 我准备了资源上下文验证数据
    When 我搜索 Agent 资源关键词
    Then 搜索结果应包含已创建的 "project" 资源
    And 搜索结果应包含已创建的 "scene" 资源
    And 搜索结果应包含已创建的 "model" 资源

  Scenario: mention 解析支持成功与降级并写入 user entry
    Given 我准备了资源上下文验证数据
    When 我发送包含有效与失效 mention 的 turn
    Then 本轮 user entry 应包含 1 条解析成功 mention
    And 本轮 user entry 应包含 1 条 mention drop 且原因包含 "resource_not_found"
    And mention 场景执行后会话状态应为 "idle"

  Scenario: image mention 能被成功解析并写入 turn entry
    Given 我准备了资源上下文验证数据
    And 我写入一条可检索的图片产物
    When 我发送仅包含有效 image mention 的 turn
    Then 本轮 user entry 应包含 1 条 kind 为 "image" 的 mention
    And 本轮 user entry mention drop 数应为 0
    And mention 场景执行后会话状态应为 "idle"
