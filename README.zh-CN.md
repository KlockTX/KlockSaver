# token-saver（中文）

> [English](README.md) | **简体中文**

面向 AI Agent 的、有实证依据的 Token 成本优化工具套件。一条命令即可完成安装：技能（策略手册 + 参考文档）、5 个零依赖 Node 命令行工具（审计 / 输出浓缩 / 限流读取 / 账单分析 / 守卫），以及一个 PreToolUse hook 用于硬性拦截 token 炸弹——节省是确定性的，不依赖模型自觉。

## 你将获得什么

| 层 | 组件 | 作用 |
|---|---|---|
| 策略 | `skill/SKILL.md` | 成本模型 + 按 ROI 排序的优化工作流（缓存 → 提示词瘦身 → 输出管控 → 压缩 → 减轮次 → 路由 → 子代理） |
| 知识 | `skill/references/playbook.md` | 带实测数据的证据手册（来自 Anthropic、GitHub Copilot、arXiv 2609.04681、TokenPilot、LLMLingua/ACON） |
| 工具 | `skill/scripts/token_audit.cjs` | 估算各文件 token 足迹；检出名中前缀缓存击穿风险（时间戳、UUID、动态变量） |
| 工具 | `skill/scripts/tok_reduce.cjs` | 管道过滤器：浓缩冗长的 build/test/日志输出（保留错误行、折叠重复行） |
| 工具 | `skill/scripts/tok_read.cjs` | 限流文件读取器：用 `--outline` / `--grep` / `--range` 替代整文件灌入 |
| 工具 | `skill/scripts/tok_usage.cjs` | 会话 JSONL 账单分析：四路 token 分解（未缓存输入 / 输出 / 缓存读 / 缓存写）+ 命中率诊断 |
| 强制 | `skill/scripts/token_guard.cjs` | PreToolUse hook（退出码 2 + stderr）：拦截整读大日志、`find /`、verbose 安装、>256KB 无限读取 |

## 快速上手（人类）

需要 Node.js >= 18，零依赖。

```bash
node setup/install.cjs            # 安装技能 + 注册 hook
node setup/install.cjs --uninstall
```

默认安装到 Qoder CLI 布局（`~/.qoder-cn/skills` + `~/.qoder-cn/settings.json`）。可覆盖：

```bash
node setup/install.cjs --skills-dir <路径> --settings <路径>
node setup/install.cjs --dry-run     # 预览所有动作，不写任何文件
```

## 快速上手（Agent 一键）

把这段话贴给你的编码 Agent：

> 克隆本仓库并运行 `node setup/install.cjs --yes`，然后阅读 `AGENTS.md` 并按其步骤验证安装。

## 使用

安装后重启会话（hooks 在会话启动时加载）：

```bash
# 审计项目的静态足迹与缓存风险
node ~/.qoder-cn/skills/token-saver/scripts/token_audit.cjs ./my-agent --top 20

# 浓缩任意冗长命令的输出
npm test 2>&1 | node ~/.qoder-cn/skills/token-saver/scripts/tok_reduce.cjs

# 分析会话账单
node ~/.qoder-cn/skills/token-saver/scripts/tok_usage.cjs ~/.qoder-cn/logs/runs/latest/*.jsonl
```

也可以直接问 Agent："为什么这么费 token / 帮我优化这个项目的成本"——技能会自动触发。

## 三个杠杆（为什么有效）

```
总成本 = Σ每轮 [ (固定提示 + 累积历史 + 工具返回) × input单价 + output × output单价(贵3-5倍) ]
```

- **更便宜的 token**：前缀缓存友好布局（缓存输入 ≈ 一折价）。
- **更少的 token**：瘦身固定提示（每轮乘数最大）、管控工具返回、历史压缩。
- **更少的轮次**：事件驱动循环、预算熔断、模型路由。

## 可移植性

Hook 的 JSON 输入输出与"退出码 2 即拦截"语义遵循 Qoder CLI 使用的 Claude-Code 兼容规范。其他 harness 只需适配 `settings.json` 注册方式——5 个 CLI 均为独立程序，随处可用。

## 许可

MIT
