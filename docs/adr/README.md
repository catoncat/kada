# ADR（Architecture Decision Records）

ADR 用于记录“会影响长期演进”的关键决策，避免团队反复讨论同一个问题，也方便未来回溯为什么这么做。

## 什么时候需要写 ADR

- 存储策略（localStorage vs Sidecar SQLite）
- Sidecar 如何随 Tauri 启动、端口与生命周期
- `/api` 的路由策略（相对路径、baseUrl、代理层）
- 预案数据结构是否调整、如何做版本迁移
- 安全模型（API Key 存放位置、导入导出、日志脱敏）

## 约定

- 文件命名：`NNNN-<kebab-case-title>.md`
- 每条 ADR 只解决一个决策点
- 需要包含：背景、选项、决策、后果、迁移计划（如有）

模板：`docs/templates/adr.md`

