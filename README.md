# KlockSaver

> **English** | [简体中文](README.zh-CN.md)

KlockSaver is an evidence-based token cost optimization toolkit for AI agents. One command installs everything: a strategy skill, five zero-dependency Node CLIs (audit / condense / bounded-read / bill-analysis / guard), and a `PreToolUse` hook that hard-blocks token bombs. The savings are **deterministic** — they do not depend on the model "behaving well."

## 1. Why agents burn tokens: the cost model

```
total_cost = Σ_turn [ (fixed_prompt + accumulated_history + latest_tool_result) × input_price
                    + output_tokens × output_price ]        # output priced 3–5× input
```

Four structural facts make agent sessions expensive:

1. **O(N²) history accumulation.** Every turn re-sends the entire conversation. If a turn adds ~k tokens, turn *n* carries ~n·k input tokens — cumulative input grows with the **square** of session length. Harness design, not the model, is why two tools doing the same task can differ 70× in tokens.
2. **The fixed prompt is multiplied by N.** System prompts and tool definitions are re-paid every single turn. A 13k-token system prompt × 200 turns ≈ 2.6M input tokens of pure overhead.
3. **Prefill vs decode asymmetry.** Reading input is parallelizable (compute-bound); generating output re-reads the KV cache every step (memory-bandwidth-bound) — hence the 3–5× price of output tokens.
4. **Finite attention budget.** Self-attention is quadratic over the context; recall degrades smoothly as windows fill ("context rot", Anthropic). Bigger windows are not free — they dilute, not add, intelligence.

## 2. What you get

| Layer | Component | Function |
|---|---|---|
| Strategy | `skill/SKILL.md` | Cost model + ROI-ordered optimization workflow: cache → prompt slimming → output caps → compaction → turn reduction → routing → subagents |
| Knowledge | `skill/references/playbook.md` | Evidence manual with measured numbers and anti-pattern catalog |
| CLI | `token_audit.cjs` | Estimates per-file token footprint; flags prefix-cache-breaking volatility (timestamps, UUIDs, dynamic vars) |
| CLI | `tok_reduce.cjs` | Pipe filter for verbose output: keeps error lines ±1 context, collapses duplicates (`[×N similar]`), head/tail sampling |
| CLI | `tok_read.cjs` | Token-bounded reader: `--outline` / `--grep PAT` / `--range A-B` instead of whole-file context dumps |
| CLI | `tok_usage.cjs` | Session JSONL bill analysis: 4-way split (uncached input / output / cache-read / cache-write), cache hit-rate diagnosis, top requests |
| Enforcement | `token_guard.cjs` | `PreToolUse` hook (exit code 2 + stderr): blocks whole-file `cat` of logs, `find /`, verbose installs, >256KB unlimited reads |
| Installer | `setup/install.cjs` | One-shot, idempotent, `--dry-run`, `--uninstall`, auto-backup of settings |

## 3. Measured effect

Our own fixture tests (this repo, reproducible via `AGENTS.md`):

- `tok_reduce`: 126-line build-log noise (~1,216 tok) → 5 lines (~51 tok) = **-96%**, zero error lines lost.
- `token_guard`: `cat build.log` → blocked (exit 2) with actionable redirection; benign commands pass (exit 0).
- Installer: full install → idempotent re-install → uninstall round-trip, settings always backed up.

Published measurements for the strategies the playbook encodes:

| Technique | Result | Source |
|---|---|---|
| Prefix-cache-friendly layout | hit rate 7% → 74%, cost **-59%** | DO Community case study |
| Cached-input billing | ≈ **10%** of normal input price (~-86% on replayed prefix) | Anthropic prompt caching measurements |
| Layout-stable compaction (TokenPilot) | cache misses 5.9M → 1.5M tok, cost **-87%**, no perf loss | arXiv 2606.17016 |
| System-prompt slimming 65k → 13k | evals unchanged or improved | Anthropic (Claude Code) |
| Prompt rework / selective compression / format-tax removal / event-batching | **-29% / +5.5% / -3% / -23%** per workflow | GitHub Copilot engineering blog |
| Subagent isolation | worker returns ~1k-token digests; multi-agent ≈ 15× chat tokens but explains ~80% of performance variance | Anthropic multi-agent research system |
| Agentic SE economics | commits +180% but deploys only +30%; <50% patches survive merge → track "Verification Tax", not raw tokens | arXiv 2609.04681 |

## 4. Quick start

Requires Node.js ≥ 18. No dependencies.

```bash
node setup/install.cjs            # install skill + register hook
node setup/install.cjs --dry-run  # preview, touch nothing
node setup/install.cjs --uninstall
```

Defaults target the Qoder CLI layout (`~/.qoder-cn/skills` + `~/.qoder-cn/settings.json`). Override with `--skills-dir` / `--settings`.

**Agent one-shot** — paste to your coding agent:

> Clone `https://github.com/KlockTX/KlockSaver` and run `node setup/install.cjs --yes`, then follow `AGENTS.md` to verify the install.

## 5. Using the CLIs

```bash
node ~/.qoder-cn/skills/klocksaver/scripts/token_audit.cjs ./my-agent --top 20
npm test 2>&1 | node ~/.qoder-cn/skills/klocksaver/scripts/tok_reduce.cjs
node ~/.qoder-cn/skills/klocksaver/scripts/tok_read.cjs bigsrc.ts --outline
node ~/.qoder-cn/skills/klocksaver/scripts/tok_usage.cjs ~/.qoder-cn/logs/runs/<session>/*.jsonl
```

Or simply ask your agent "why is this so expensive / reduce token cost" — the skill triggers automatically.

## 6. The three levers

- **Cheaper tokens** — prefix caching: keep volatile content out of the stable prefix (static system prompt → tool defs → append-only history → volatile tail). Cached input bills at ~10%.
- **Fewer tokens** — slim the fixed multiplier (delete instructions the model follows anyway), cap and selectively compress tool results, compact history near the ceiling, externalize state to notes/files.
- **Fewer turns** — event-driven completion instead of polling, budget circuit-breakers, structured output, model routing (cheap for mechanical work), subagent isolation for high-value wide-search tasks.

Orthogonal by design: caching discounts the rate, slimming cuts the base, compaction tames the exponent, routing converts currency, stop-loss trims the tail.

## 7. Portability

The hook's JSON stdin contract and exit-code-2 deny semantics follow the Claude-Code-compatible spec used by [Qoder CLI](https://docs.qoder.com/zh/cli/hooks-reference). Other harnesses only need to adapt the `settings.json` registration — all five CLIs are standalone.

## 8. References

1. Anthropic — *Effective context engineering for AI agents* (attention budget, context rot, compaction/notes/subagents) — anthropic.com/engineering/effective-context-engineering-for-ai-agents
2. Anthropic — *How we built our multi-agent research system* (4×/15× token economics; token volume explains 80% of variance)
3. arXiv:2609.04681 — *Reliability, Verification, and Cost Economics in Agentic Software Engineering* (Verification Tax; +180% commits / +30% deploys)
4. arXiv:2606.17016 — *TokenPilot: Cache-Efficient Context Management for LLM Agents* (-87% cost)
5. GitHub Blog — *How we make AI coding more cost efficient without sacrificing task quality* (per-workflow A/B: -29%, -23%, +5.5%; "shorter outputs can cost more")
6. Liu et al. — *LongLLMLingua: Prompt Compression for Long Context* (2–5× compression); *ACON: Optimizing Context Compression for Long-horizon LLM Agents*; *CompactionRL*
7. Sennrich et al. 2015 — *Neural Machine Translation with Subword Units* (BPE); Karpathy `minbpe`; OpenAI `tiktoken` (radix/byte-level BPE)
8. Qoder Docs — *Hooks reference* (exit-2 deny semantics); Anthropic prompt caching billing (cache write +25%, cache read ≈ 10%)
9. Community measurements — cache hit-rate 7%→74% / -59% cost (DO Community); Claude caching -86% per repeated turn; CJK ≈ 1–2.5 tok/char in English-centric tokenizers vs ~35% savings with CJK-optimized vocab

## License

MIT
