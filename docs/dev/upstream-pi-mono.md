# 上游参考：pi-mono（必读）

本项目 Agent 能力与交互设计以 `pi-mono` 作为上游参考基线。

## 本地参考路径

- `/Users/envvar/Gao/projects/shooting-planner-v2/.upstream/pi-mono`

> 该目录用于对照阅读，不纳入本仓版本控制。

## 同步上游

在仓库根目录执行：

```bash
mkdir -p .upstream
if [ -d .upstream/pi-mono/.git ]; then
  git -C .upstream/pi-mono fetch --depth 1 origin main
  git -C .upstream/pi-mono reset --hard FETCH_HEAD
else
  git clone --depth 1 https://github.com/badlogic/pi-mono.git .upstream/pi-mono
fi
git -C .upstream/pi-mono rev-parse --short HEAD
```

## 重点对齐范围

1. Agent 行为与工具链：`.upstream/pi-mono/packages/coding-agent`
2. 终端渲染/折叠交互：`.upstream/pi-mono/packages/tui`
3. Web 聊天组件设计：`.upstream/pi-mono/packages/web-ui`
4. 通用运行时能力：`.upstream/pi-mono/packages/agent-core`

## 开发约束

1. 涉及 Agent 会话、事件、toolResult 展示变更时，先查上游对应实现与契约，再改本仓。
2. 记录本次参考的上游 commit（PR 描述或提交信息中注明）。
3. 不直接修改 `.upstream/pi-mono`；若需长期定制，在本仓实现并写明偏离原因。

## 参考检索顺序（强制）

1. 先查 Pi 社区包：`https://pi.dev/packages`
2. 再查上游源码：`.upstream/pi-mono`（必要时看 `https://github.com/badlogic/pi-mono`）
3. 再做业界对标（至少覆盖以下开源仓）：
   - Codex: `https://github.com/openai/codex`
   - Claude Code: `https://github.com/anthropics/claude-code`
   - OpenCode: `https://github.com/opencode-ai/opencode`
4. 最后才自研：若未找到可复用方案，必须在实现说明中记录“为何不复用”。

## 给 Codex 的落地要求（避免“瞎开发”）

1. 交互类需求（toolResult/TUI/Web）先检索：

```bash
rg -n "toolResult|collapse|expand|stream|summary|detail|render|diff" \
  .upstream/pi-mono/packages/tui \
  .upstream/pi-mono/packages/web-ui \
  .upstream/pi-mono/packages/coding-agent
```

2. 方案说明中必须引用上游对照点（至少 2 处代码位置）。
3. 无上游依据时，再参考 Codex / Claude Code / OpenCode 的公开实现。
4. 实施前若无“上游对照结论”，视为信息不足，不应直接定稿 UI。

## 对照结果落档

- Agent 上游差异与去重清单：`docs/dev/agent-upstream-gap.md`
