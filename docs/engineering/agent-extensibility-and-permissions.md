# Agent 可扩展能力与权限分层（讨论稿）

> 基线：`AGENT-PI-LANDING-2026-02-15`  
> 目标：允许用户配置 skills / workflow / script，同时保持运行时安全可控。

## 1. 设计目标

- 用户可以在 `/workspace` 自定义 Agent 行为，而不是仅使用内置固定流程。
- 支持从“提示与编排”逐步升级到“脚本执行”。
- 平台可精确控制每个会话的工具权限，避免默认开放高风险能力。

## 2. 能力层（用户视角）

### 2.1 Skill（低风险）

- 形态：`SKILL.md`（规则、步骤、约束、输出格式）。
- 本质：影响模型提示词与流程偏好，不直接执行系统命令。
- 使用场景：摄影风格规范、文案模板、团队 SOP。

### 2.2 Workflow（中风险）

- 形态：声明式步骤（调用已有工具，不允许任意 shell）。
- 示例：`photo_compose_prompt -> photo_enqueue_generation -> photo_get_generation_status`。
- 使用场景：把多步操作固化为一键流程。

### 2.3 ScriptTool（高风险）

- 形态：可注册脚本命令（例如 `pnpm run xxx`）。
- 要求：必须是“注册过的工具”，不可让用户直接输入任意命令。
- 使用场景：高级团队的自动化流水线。

## 3. 权限层（平台视角）

能力配置与系统权限分离：用户可配置流程，不代表自动获得高权限执行能力。

### 3.1 默认权限建议

- 默认启用：资源检索、生图、文案（当前 extension 工具）。
- 默认禁用：`bash`、任意写文件、任意编辑代码。

### 3.2 分级权限建议

- `viewer`：`read/grep/find/ls`（只读分析）。
- `editor`：增加 `edit/write`（受工作目录限制）。
- `operator`：增加受限 `bash`（命令白名单 + 参数校验）。

## 4. 运行时加载模型

每个 Agent 会话携带独立 profile：

- `skills`: 该会话启用哪些 skills。
- `workflows`: 允许调用哪些 workflow。
- `capabilities`: 内置工具能力开关（read/edit/write/bash 等）。
- `scriptTools`: 可用脚本工具列表（仅白名单内）。

运行时根据 profile 组装工具，不使用全局固定工具集合。

## 5. 安全护栏（Script/Bash 必须）

- `cwd` 白名单：限制命令执行目录。
- 命令白名单：限制可执行命令与参数模板。
- 超时与资源限制：防止长时间阻塞与资源耗尽。
- 输出截断与脱敏：避免日志泄漏敏感信息。
- 审计：记录 tool call、命令、exit code、耗时、发起人。

## 6. API 与数据建议（草案）

### 6.1 数据实体

- `agent_profiles`
- `agent_profile_skills`
- `agent_workflows`
- `agent_script_tools`
- `agent_session_profile_snapshot`（会话启动时快照，便于回放）

### 6.2 API（示意）

- `GET/POST /api/agent/profiles`
- `GET/PUT /api/agent/profiles/:id`
- `GET/POST /api/agent/workflows`
- `GET/POST /api/agent/script-tools`
- `POST /api/agent/sessions` 支持 `profileId`

## 7. 分阶段落地

1. Phase 1：开放用户可配置 Skills + Workflow（不开放任意脚本）。  
2. Phase 2：开放注册式 ScriptTool（白名单执行，不开放自由 bash）。  
3. Phase 3：按 profile 灰度开放 `read/edit/write/bash`（默认仍关闭高风险能力）。

## 8. 当前实现与本稿关系

- 当前实现已经具备 extension 工具注册与 skills path 注入能力，可作为 Phase 1 基础。
- 当前 `coding-agent` 通过 `tools: []` 禁用了内置 coding tools，符合“默认最小权限”原则。
- 后续要做的是“会话级可配置注入”，不是全局打开高权限工具。
