# shooting-planner-v2：UX「先设计后编码」Skills 方案（项目级落地版）

本文件把 Sean Kochel 教程里的 **3-Step UX Design Workflow**（PM → UX → Tech Lead）落到本仓库，并扩展为 5 个可复用的 Skills，用于强制“先设计、再编码”，避免直接写出工程师审美的平庸 UI。

## 这套流程解决什么

把“我要做一个功能/改一段体验”的模糊需求，强制拆成：

1. **需求定义（PRD / Feature Spec）**
2. **UX 细化（UX Spec：心智模型 + IA + 状态机）**
3. **构建指令（Build Order：可复制给 Coding Agent 的微步骤 prompts）**
4. （可选）**UX 评审（验收场景与问题清单）**
5. （可选）**ADR 决策留痕（当出现方案分歧/取舍）**

并把所有阶段产出写入 `docs/`，成为长期真相源（对齐 `AGENTS.md`、`agent_docs/` 与 `docs/` 的维护约定）。

## 目录与文件落点（已决策）

### Skills 存放（项目级，repo 内）

- `.claude/skills/spv2-design-prd/`
- `.claude/skills/spv2-design-ux/`
- `.claude/skills/spv2-plan-build/`
- `.claude/skills/spv2-ux-review/`
- `.claude/skills/spv2-write-adr/`

为了让 Codex CLI 也复用同一套 skills，本仓库还会包含：

- `.codex/skills` → 符号链接到 `../.claude/skills`

### 功能规格/UX 文档落点（repo 内）

每个功能/改动使用一个 kebab-case 的 `<feature-slug>` 目录：

- `docs/specs/<feature-slug>/01-feature-spec.md`
- `docs/specs/<feature-slug>/02-ux-spec.md`
- `docs/specs/<feature-slug>/03-build-order.md`
- `docs/specs/<feature-slug>/04-ux-review.md`

ADR 落到：

- `docs/adr/NNNN-<kebab-case-title>.md`（见 `docs/adr/README.md`）

## 统一的强制 gating 规则（所有 skills 都遵循）

1. **必须确定 `feature-slug`**
   - 若用户没给：先要求用户给出（或先把功能名规范化为 kebab-case），否则停止。
2. **进入下一阶段前必须满足前置文件存在 + 最小结构完整**
   - 不满足：停止，只输出“需要补齐的问题清单 + 应创建/更新的文件路径”，不进入下一阶段写作。
3. **禁止写实现代码**
   - 这 5 个 skills 的输出全部是文档/清单/prompts，不做任何实现提交。
4. **对齐仓库约定**
   - 不要手改生成/产物：`dist/`、`src/routeTree.gen.ts`、`.tanstack/` 等（见 `AGENTS.md`）。
   - 不要提交密钥/Provider 凭据；避免在日志中输出敏感信息（见 `agent_docs/contributing.md`）。

## 5 个 Skills 的角色定位与 I/O 规范

### 1) spv2-design-prd（PM Phase）

- 输入（对话中必须拿到）
  - 功能一句话 + 目标用户/场景
  - MVP（必须/以后再说）
  - 成功标准（可验证）
  - 主流程（分步骤）+ 至少 2 个失败/异常场景
  - 约束：是否影响 Sidecar/API/数据契约/导出
  - `feature-slug`
- 输出
  - 写入 `docs/specs/<feature-slug>/01-feature-spec.md`
  - 骨架来源：`docs/templates/feature-spec.md`
- 必须明确
  - 是否需要同步更新 `docs/engineering/contracts.md` / `docs/engineering/api.md`
  - 若出现“方案取舍/争议点”，需触发 `spv2-write-adr`

### 2) spv2-design-ux（UX Phase）

- gating（必须满足）
  - `docs/specs/<feature-slug>/01-feature-spec.md` 存在
  - 且包含至少：交互与流程、验收标准
- 输入（对话中可选补充）
  - 交互取向偏好（保守可控 vs 自动省事）；未提供则默认“可控优先”
- 输出
  - 写入 `docs/specs/<feature-slug>/02-ux-spec.md`
- 必须覆盖（重点）
  - Mental Model（心智模型）
  - IA（信息架构）
  - Affordance（可发现性）
  - System Feedback（必须写“用户下一步怎么做/如何恢复”）
    - Empty States（至少 3 个）
    - Loading States（至少 3 个）
    - Error States（至少 6 个：无 Key/401/超时/模型不支持/JSON 不合法/图片生成失败等）

### 3) spv2-plan-build（Tech Lead Phase）

- gating（必须满足）
  - `01-feature-spec.md` 与 `02-ux-spec.md` 都存在
- 输出
  - 写入 `docs/specs/<feature-slug>/03-build-order.md`
- 每个 Step 必须包含
  - 目标（1–2 句）
  - 需要读的文件（具体路径）
  - 需要改的文件（具体路径；可 TBD 但要写如何确定）
  - **可复制给 Coding Agent 的 Prompt 文本**
  - 自测命令（优先引用 `package.json`/`agent_docs/commands.md`：`pnpm validate`、`pnpm test:run`、`pnpm dev:all`；涉及桌面壳用 `pnpm tauri:dev`）
  - 完成定义（可观察结果）

### 4) spv2-ux-review（UX Review，可选但推荐）

- gating（必须满足）
  - `docs/specs/<feature-slug>/02-ux-spec.md` 存在
- 输出
  - 写入 `docs/specs/<feature-slug>/04-ux-review.md`
- 内容要求
  - 问题清单（Blocker/Major/Minor）
  - 验收场景（10–20 条可执行场景，覆盖 Empty/Loading/Error/Success）
  - 文案与反馈质量检查（是否可恢复、是否给出下一步）

### 5) spv2-write-adr（Decision Log）

- 典型触发输入
  - “要不要这样做/两种方案/权衡/迁移策略/接口定稿/ADR”
- 输入（对话中必须拿到）
  - 明确的决策点
  - 至少 2 个选项（A/B）及其成本/风险/迁移影响
- 输出
  - 写入 `docs/adr/NNNN-<slug>.md`（编号规则：扫描现有 ADR，取最大 NNNN + 1）
  - 模板来源：`docs/templates/adr.md`

## 完整流程的使用场景（覆盖从 0 到可编码）

### 场景 1：最常见——UX 驱动的小功能改动

例：结果页“批量生成全部参考图”按钮重做（成本提示、可取消、失败可恢复）

1. 用 `spv2-design-prd` 写 `01-feature-spec.md`
2. 用 `spv2-design-ux` 写 `02-ux-spec.md`（重点状态机）
3. 用 `spv2-plan-build` 写 `03-build-order.md`（拿它去驱动编码）
4. （可选）用 `spv2-ux-review` 写 `04-ux-review.md` 作为回归 checklist
5. （有争议再用）`spv2-write-adr`

### 场景 2：涉及数据契约/API 的功能（强约束 + 留痕）

例：历史从 localStorage 迁移到 Sidecar `/api/plans`，并保持兼容

- `spv2-design-prd`：必须写迁移策略与回滚；明确是否更新 `docs/engineering/*`
- `spv2-write-adr`：对“单次迁移 vs 渐进双读”“失败回退策略”等做决策
- `spv2-design-ux`：补齐 Sidecar 不可用/加载失败等状态
- `spv2-plan-build`：把契约/API 文档更新与实现步骤一起拆成可执行 prompts

### 场景 3：纯 UX/一致性改造（不改契约但改大量交互）

例：设置页 Provider 管理（可发现性、错误反馈）重做

- `spv2-design-prd`：成功标准必须可验证（例如 60 秒内完成添加+测试成功）
- `spv2-design-ux`：重点 Empty/Loading/Error（拉模型列表、测试连接、401/403 等）
- `spv2-ux-review`：输出 10–20 条验收场景
- `spv2-plan-build`：输出可执行 prompts

### 场景 4：紧急修复（仍先写最小 PRD/UX）

例：图片生成失败时只显示“未知错误”，用户无法恢复

- `spv2-design-prd`：最小写清楚现象/损失/复现/成功标准
- `spv2-design-ux`：只聚焦 Error States + 恢复路径
- `spv2-plan-build`：拆成最小可执行 steps

## 使用/安装说明（面向团队）

- 这些 skills 是 **项目级（repo 内）**：在仓库根目录运行 Claude Code / Codex CLI 即可读取。
- `.codex/skills` 通过符号链接复用 `.claude/skills`，避免维护两份。
