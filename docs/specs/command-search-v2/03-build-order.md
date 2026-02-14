# Command Search V2 - Build Order

## 约束（执行前必读）

- 不要手改生成/产物：`dist/`、`src/routeTree.gen.ts`、`.tanstack/`、`src-tauri/target/`
- 任何契约/API 改动必须同步更新 `docs/engineering/contracts.md` / `docs/engineering/api.md`
- 本文档只产出 prompts，不直接实施编码

## Step 1. 对齐类型与范围模型

- 目标：统一 `SearchScope` 和 `SearchItemAction` 的表达，支持实体“可定位跳转”。
- 需要读的文件：
  - `docs/specs/command-search-v2/01-feature-spec.md`
  - `docs/specs/command-search-v2/02-ux-spec.md`
  - `src/lib/command-search/types.ts`
- 需要改的文件：
  - `src/lib/command-search/types.ts`
- Prompt：
  - 扩展 `SearchScope` 为 `global/project/assets-scenes/assets-models`。
  - 把 `SearchItemAction` 从简单 `to: string` 升级为结构化路由目标（`to/params/search`）。
  - 保持向后兼容：旧字段可临时保留一版并标记 deprecated。
- 自测命令：
  - `pnpm build`
- 完成定义：
  - 类型层支持所有 V2 scope 与实体落位跳转，不出现 TS 报错。

## Step 2. 重构 Provider 的 Scope 推断

- 目标：scope 自动推断由“仅 pathname”升级为“pathname + search 参数”。
- 需要读的文件：
  - `src/components/CommandSearch/CommandSearchProvider.tsx`
  - `src/routes/index.tsx`
- 需要改的文件：
  - `src/components/CommandSearch/CommandSearchProvider.tsx`
- Prompt：
  - 使用路由信息正确识别项目上下文（`/?project=<id>`）。
  - 在 `/assets/scenes` 自动设为 `assets-scenes`，在 `/assets/models` 设为 `assets-models`。
  - 保留 `Backspace` 清 scope 机制。
- 自测命令：
  - `pnpm dev:all`
- 完成定义：
  - 在不同页面打开 `⌘K` 时，scope chip 文案准确。

## Step 3. 扩展数据源覆盖（补模特）

- 目标：全局搜索对象覆盖项目/场景/模特。
- 需要读的文件：
  - `src/components/CommandSearch/use-command-search.ts`
  - `src/lib/model-assets-api.ts`
- 需要改的文件：
  - `src/components/CommandSearch/use-command-search.ts`
- Prompt：
  - 增加模特查询与检索映射，支持 name/appearancePrompt/标签关键词。
  - 按 scope 进行对象分组过滤。
- 自测命令：
  - `pnpm build`
- 完成定义：
  - 输入模特名称可在全局搜索结果中命中并可执行跳转。

## Step 4. 统一结果信息架构与排序

- 目标：减少“分组重复与顺序随机”的认知负担。
- 需要读的文件：
  - `src/components/CommandSearch/use-command-search.ts`
  - `src/lib/command-search/actions.ts`
  - `src/lib/command-search/navigation.ts`
- 需要改的文件：
  - `src/components/CommandSearch/use-command-search.ts`
  - `src/lib/command-search/actions.ts`
  - `src/lib/command-search/navigation.ts`
- Prompt：
  - 实现两套展示逻辑：无输入（最近+常用），有输入（对象优先+动作次级）。
  - 去除语义重复项（例如设置同时出现在多个同级分组）。
  - 明确排序：精确匹配 > 前缀匹配 > 包含匹配。
- 自测命令：
  - `pnpm dev:all`
- 完成定义：
  - 相同关键词在连续测试中结果顺序稳定，且首屏更符合用户预期。

## Step 5. 修复键盘交互冲突

- 目标：避免同一键盘事件被重复处理。
- 需要读的文件：
  - `src/components/CommandSearch/CommandSearchDialog.tsx`
- 需要改的文件：
  - `src/components/CommandSearch/CommandSearchDialog.tsx`
- Prompt：
  - 确认键盘监听只在一个层级处理（input 或容器二选一）。
  - 保证 `↑/↓/Enter/Esc/Backspace(scope)` 行为一致且无双触发。
- 自测命令：
  - `pnpm dev:all`
- 完成定义：
  - 手动连续按键测试无跳项、无重复执行。

## Step 6. 实现实体落位跳转

- 目标：搜索命中后跳转到“具体对象”，不是仅到列表页。
- 需要读的文件：
  - `src/components/CommandSearch/use-command-search.ts`
  - `src/routes/assets.scenes.tsx`
  - `src/routes/assets.models.tsx`
  - `src/routes/index.tsx`
- 需要改的文件：
  - `src/components/CommandSearch/use-command-search.ts`
  - `src/routes/assets.scenes.tsx`
  - `src/routes/assets.models.tsx`
  - `src/routes/index.tsx`
- Prompt：
  - 使用结构化 search 参数完成实体落位：`project`/`sceneId`/`modelId`。
  - 页面初始化时读取参数并选中对应实体。
- 自测命令：
  - `pnpm dev:all`
- 完成定义：
  - 从搜索点击某对象后，目标页自动高亮该对象。

## Step 7. 补齐空态/错误态与恢复路径

- 目标：所有不可用状态都有下一步动作。
- 需要读的文件：
  - `src/components/CommandSearch/CommandSearchDialog.tsx`
  - `src/components/CommandSearch/use-command-search.ts`
  - `docs/specs/command-search-v2/02-ux-spec.md`
- 需要改的文件：
  - `src/components/CommandSearch/CommandSearchDialog.tsx`
  - `src/components/CommandSearch/use-command-search.ts`
- Prompt：
  - 为“无结果/部分加载失败/目标不存在”补充明确文案和按钮。
  - 分组级错误要可单独重试，不影响其他分组。
- 自测命令：
  - `pnpm dev:all`
- 完成定义：
  - 任一失败场景下都能执行恢复操作（重试/清 scope/前往创建）。

## Step 8. 完成验收与回归

- 目标：确保功能可交付且无回归。
- 需要读的文件：
  - `docs/specs/command-search-v2/01-feature-spec.md`
  - `docs/specs/command-search-v2/02-ux-spec.md`
  - `docs/specs/command-search-v2/03-build-order.md`
- 需要改的文件：
  - 若有缺陷，按实际回改对应实现文件
- Prompt：
  - 按验收标准逐条自测，记录通过/失败项。
  - 对失败项补修并复测，最终输出验收结论。
- 自测命令：
  - `pnpm build`
  - `pnpm dev:all`
- 完成定义：
  - 验收标准全部通过，且关键路径（打开、搜索、执行、跳转、恢复）稳定。
