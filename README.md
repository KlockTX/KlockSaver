# token-saver

> **English** | [简体中文](README.zh-CN.md)

Evidence-based token cost optimization toolkit for AI agents. One command installs a skill (strategies + references), five zero-dependency Node CLIs (audit / condense / read-bound / billing / guard), and a PreToolUse hook that hard-blocks token bombs — deterministic savings, no model discretion required.

## What you get

| Layer | Component | What it does |
|---|---|---|
| Strategy | `skill/SKILL.md` | Cost model + ROI-ordered optimization workflow (cache → prompt slim → output caps → compaction → turns → routing → subagents) |
| Knowledge | `skill/references/playbook.md` | Evidence-backed playbook with measured numbers (Anthropic, GitHub Copilot, arXiv 2609.04681, TokenPilot, LLMLingua/ACON) |
| Tooling | `skill/scripts/token_audit.cjs` | Estimates per-file token footprint; flags prefix-cache-breaking volatility (timestamps, UUIDs, dynamic vars) |
| Tooling | `skill/scripts/tok_reduce.cjs` | Pipe filter: condenses verbose build/test/log output (error lines kept, duplicates collapsed) |
| Tooling | `skill/scripts/tok_read.cjs` | Token-bounded file reader: `--outline` / `--grep` / `--range` instead of whole-file dumps |
| Tooling | `skill/scripts/tok_usage.cjs` | Session JSONL bill analyzer: 4-way token split (uncached in / out / cache read / cache write) + cache hit-rate diagnosis |
| Enforcement | `skill/scripts/token_guard.cjs` | PreToolUse hook (exit 2 + stderr): blocks `cat` of big logs, `find /`, verbose installs, >256KB unlimited reads |

## Quick start (human)

Requires Node.js >= 18. No dependencies.

```bash
node setup/install.cjs            # install skill + register hook
node setup/install.cjs --uninstall
```

Install targets default to the Qoder CLI layout (`~/.qoder-cn/skills` + `~/.qoder-cn/settings.json`). Override:

```bash
node setup/install.cjs --skills-dir <path> --settings <path>
node setup/install.cjs --dry-run     # preview every action, touch nothing
```

## Quick start (agent one-shot)

Paste this to your coding agent:

> Clone this repo and run `node setup/install.cjs --yes`. Then read `AGENTS.md` and follow it to verify the install.

## Use it

After restart (hooks load at session start):

```bash
# audit a project's static footprint & cache risks
node ~/.qoder-cn/skills/token-saver/scripts/token_audit.cjs ./my-agent --top 20

# condense any verbose command
npm test 2>&1 | node ~/.qoder-cn/skills/token-saver/scripts/tok_reduce.cjs

# analyze a session bill
node ~/.qoder-cn/skills/token-saver/scripts/tok_usage.cjs ~/.qoder-cn/logs/runs/latest/*.jsonl
```

Or just ask your agent: "why is this so expensive / reduce token cost of this project" — the skill triggers automatically.

## The three levers (why it works)

```
total_cost = Σ_turns [ (fixed_prompt + accumulated_history + tool_result) × input_price
                     + output × output_price(3-5x) ]
```

- **Cheaper tokens**: prefix-cache-friendly layout (cached input ≈ 10% price).
- **Fewer tokens**: slim fixed prompt (multiplied every turn), cap tool outputs, compaction.
- **Fewer turns**: event-driven loops, budget circuit breakers, model routing.

## Portability

Hook JSON I/O and the exit-code-2 deny semantics follow the Claude-Code-compatible spec used by Qoder CLI. For other harnesses, adapt `settings.json` registration only — all five CLIs are standalone and work anywhere.

## License

MIT
