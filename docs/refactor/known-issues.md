# 已知问题与技术债（来自代码审阅）

本清单用于重构排期与风险评估，优先记录“会影响正确性/可维护性/打包可用性”的问题。

## 运行与打包一致性

1. **前端 API 路径依赖 dev proxy**
   - 前端请求写成相对路径 `/api/*`，在 Vite dev 通过 proxy 转发到 `:3001`。
   - Tauri 打包后不再有 Vite proxy，需要明确如何访问 Sidecar（baseUrl/路由/拦截策略）。

2. **Sidecar 二进制命名与 Tauri 配置可能不一致**
   - Sidecar 构建脚本输出 `src-tauri/binaries/sidecar-<targetTriple>`。
   - `src-tauri/tauri.conf.json` 目前配置的 externalBin 是 `binaries/sidecar`。

3. **Tauri 侧未看到 Sidecar 启动逻辑**
   - Rust `src-tauri/src/lib.rs` 目前仅初始化插件，未负责启动/监管 Sidecar。

## 数据与模块重复

4. **Provider/Plans 存储存在“双轨”**
   - 前端：Provider 与历史用 localStorage。
   - Sidecar：也实现了 providers/plans/settings 表与 CRUD，但前端目前未接入。

5. **重复的 prompt/标题实现**
   - 代码中存在多份 buildProjectPrompt/buildProjectTitle 等逻辑的重复版本，容易漂移。

6. **疑似未使用的旧 API client**
   - `src/lib/api.ts` 以 `/api/providers` 为核心，但当前 UI 的 Provider 管理走 `provider-storage`。

## 体验与一致性

7. **项目模式的 globalStyle 可能未被持久化到最终数据结构**
   - UI 传入了 `globalStyle`，但当前 normalize 逻辑未显式保留（需要确认是否要进入 ProjectPlan 存储/导出）。

8. **编辑 visualPrompt 的持久化时机不直观**
   - 编辑 textarea 不会立刻写回历史；点击“重新生成”才会写回并生成图片。

9. **批量出图缺少取消/队列管理**
   - 目前用 `setTimeout` 逐个触发，用户无法中途停止，失败重试策略也不统一。

## 工程化

10. **缺少测试/统一 lint/format**
   - 当前没有 `pnpm test`，也未配置 ESLint/Prettier；重构期容易引入回归。

