# KlockSaver（中文）

> [English](README.md) | **简体中文**

KlockSaver 是一套有实证依据的 AI Agent Token 成本优化工具套件。一条命令安装全部组件：策略技能、5 个零依赖 Node 命令行工具（审计 / 输出浓缩 / 限流读取 / 账单分析 / 守卫），以及一个硬性拦截 token 炸弹的 `PreToolUse` hook。节省效果是**确定性的**——不依赖模型"自觉"。

## 1. Agent 为什么费 Token：成本模型

```
总成本 = Σ每轮 [ (固定提示 + 累积历史 + 本轮工具返回) × input单价 + output × output单价 ]   # output 单价是 input 的 3–5 倍
```

四个结构性事实决定了 agent 会话的价格：

1. **历史的 O(N²) 累积。** 每轮调用都重发完整对话。若每轮净增 ~k token，第 *n* 轮携带 ~n·k 个 input token——累计输入随会话长度呈**平方**增长。同样的任务，两个工具 token 相差 70 倍，差异不在模型，在 harness 如何管理这个循环。
2. **固定提示被乘以 N。** 系统提示与工具定义每一轮都要重新付费。13k token 的系统提示 × 200 轮 ≈ 260 万 input token 的纯开销。
3. **prefill / decode 不对称。** 读输入可大规模并行（算力约束）；逐 token 生成要反复重读 KV 缓存（显存带宽约束）——这是 output 贵 3–5 倍的物理原因。
4. **注意力预算有限。** 自注意力对上下文是二次方的，窗口越填越稀释召回（Anthropic 称之为 "context rot"）。更大的窗口不是免费容量，是摊薄的智力。

## 2. 组件清单

| 层 | 组件 | 功能 |
|---|---|---|
| 策略 | `skill/SKILL.md` | 成本模型 + 按 ROI 排序的优化工作流：缓存 → 提示词瘦身 → 输出管控 → 压缩 → 减轮次 → 路由 → 子代理 |
| 知识 | `skill/references/playbook.md` | 带实测数据的证据手册与反模式目录 |
| CLI | `token_audit.cjs` | 估算文件 token 足迹；检出名中前缀缓存击穿风险（时间戳、UUID、动态变量） |
| CLI | `tok_reduce.cjs` | 管道过滤器：保留错误行±1上下文、重复行折叠（`[×N similar]`）、头尾取样 |
| CLI | `tok_read.cjs` | 限流读取器：`--outline` / `--grep 模式` / `--range A-B` 替代整文件灌入 |
| CLI | `tok_usage.cjs` | 会话 JSONL 账单：四路分解（未缓存输入/输出/缓存读/缓存写）、命中率诊断、Top 请求 |
| 强制 | `token_guard.cjs` | `PreToolUse` hook（退出码 2 + stderr）：拦截整读日志、`find /`、verbose 安装、>256KB 无限读取 |
| 安装 | `setup/install.cjs` | 一键、幂等、`--dry-run`、`--uninstall`、自动备份配置 |

## 3. 实测效果

本套件自己的夹具测试（可用 `AGENTS.md` 复现）：

- `tok_reduce`：126 行构建日志噪音（~1,216 tok）→ 5 行（~51 tok）= **-96%**，错误行零丢失；
- `token_guard`：`cat build.log` 被拦截（exit 2）并给出替代指引；正常命令放行（exit 0）；
- 安装器：安装 → 幂等重装 → 卸载全回环通过，settings 每次自动备份。

playbook 所编码策略的公开实测数据：

| 技术 | 结果 | 来源 |
|---|---|---|
| 前缀缓存友好布局 | 命中率 7%→74%，成本 **-59%** | DO Community 案例 |
| 缓存输入计费 | ≈ 正常输入价的 **10%**（重放前缀约 -86%） | Anthropic prompt caching 实测 |
| 布局稳定型压缩（TokenPilot） | 缓存 miss 590万→150万 tok，成本 **-87%**，性能无损 | arXiv 2606.17016 |
| 系统提示词瘦身 65k→13k | 评测不降反升 | Anthropic（Claude Code） |
| 提示词重构 / 选择性压缩 / 去格式化税 / 事件批处理 | 分工作流 **-29% / +5.5% / -3% / -23%** | GitHub Copilot 工程博客 |
| 子代理隔离 | worker 只回 ~1k token 摘要；多代理 ≈ chat 的 15 倍 token，但 token 量解释 ~80% 性能方差 | Anthropic 多代理研究系统 |
| Agentic 软件工程经济学 | commit +180% 而部署仅 +30%；<50% 补丁存活合并 → 追踪"验证税"而非原始 token | arXiv 2609.04681 |

## 4. 快速上手

需要 Node.js ≥ 18，零依赖。

```bash
node setup/install.cjs            # 安装技能 + 注册 hook
node setup/install.cjs --dry-run  # 预览，不写任何文件
node setup/install.cjs --uninstall
```

默认安装到 Qoder CLI 布局（`~/.qoder-cn/skills` + `~/.qoder-cn/settings.json`），可用 `--skills-dir` / `--settings` 覆盖。

**Agent 一键部署** —— 把这句话贴给你的编码 Agent：

> 克隆 `https://github.com/KlockTX/KlockSaver` 并运行 `node setup/install.cjs --yes`，然后按 `AGENTS.md` 的步骤验证安装。

## 5. CLI 用法

```bash
node ~/.qoder-cn/skills/klocksaver/scripts/token_audit.cjs ./my-agent --top 20
npm test 2>&1 | node ~/.qoder-cn/skills/klocksaver/scripts/tok_reduce.cjs
node ~/.qoder-cn/skills/klocksaver/scripts/tok_read.cjs bigsrc.ts --outline
node ~/.qoder-cn/skills/klocksaver/scripts/tok_usage.cjs ~/.qoder-cn/logs/runs/<session>/*.jsonl
```

也可以直接问 Agent："为什么这么费 token / 帮我优化这个项目的成本"——技能自动触发。

## 6. 三个杠杆

- **更便宜的 token**——前缀缓存：易变内容挪出稳定前缀（静态系统提示 → 工具定义 → 只增历史 → 动态尾部）。缓存输入按约一折计费。
- **更少的 token**——瘦身乘数最大的固定提示（模型本来就会的规则直接删）、管控并选择性压缩工具返回、逼近上限时压缩历史、状态外置到笔记/文件。
- **更少的轮次**——事件驱动替代轮询、预算熔断、结构化输出、模型路由（机械活用便宜模型）、高价值宽检索用子代理隔离。

三者正交：缓存折单价、瘦身减底数、compaction 压指数、路由换汇率、止损砍尾部。

## 7. 可移植性

Hook 的 JSON stdin 契约与"退出码 2 即拦截"语义遵循 [Qoder CLI](https://docs.qoder.com/zh/cli/hooks-reference) 使用的 Claude-Code 兼容规范。其他 harness 只需适配 `settings.json` 注册方式——5 个 CLI 均为独立程序，随处可用。

## 8. 参考文献

1. Anthropic —《Effective context engineering for AI agents》（注意力预算、context rot、compaction/笔记/子代理）
2. Anthropic —《How we built our multi-agent research system》（4×/15× token 经济学；token 量解释 80% 性能方差）
3. arXiv:2609.04681 —《Reliability, Verification, and Cost Economics in Agentic Software Engineering》（验证税；commit +180% / 部署 +30%）
4. arXiv:2606.17016 —《TokenPilot: Cache-Efficient Context Management for LLM Agents》（成本 -87%）
5. GitHub Blog —《How we make AI coding more cost efficient without sacrificing task quality》（分工作流实测 -29%、-23%、+5.5%；"更短的输出可能更贵"）
6. Liu et al. —《LongLLMLingua》（长文 2–5× 压缩）；《ACON: Optimizing Context Compression for Long-horizon LLM Agents》；《CompactionRL》
7. Sennrich et al. 2015 —《Neural Machine Translation with Subword Units》（BPE）；Karpathy `minbpe`；OpenAI `tiktoken`（byte-level/radix BPE）
8. Qoder 文档 —《Hooks 参考》（exit-2 拦截语义）；Anthropic prompt caching 计费（写缓存 +25%，读缓存 ≈ 1 折）
9. 社区实测 — 缓存命中率 7%→74% / 成本 -59%（DO Community）；Claude 缓存重放每轮约 -86%；英文中心分词器下中文 ≈ 1–2.5 token/字，中文优化词表约省 35%

## 许可

MIT
