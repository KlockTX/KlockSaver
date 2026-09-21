---
name: klocksaver
description: Evidence-based token cost optimization for AI agent work. Use when the user wants to reduce token usage or API cost of an agent/prompt/harness, asks "为什么这么费token"、"怎么省token"、"成本优化", needs prompt caching layout advice, context compaction design, or auditing a project's token consumption (system prompts, tool definitions, tool outputs, loop rounds). Also use for writing new system prompts or tool schemas where cost matters.
---

# KlockSaver

## Overview

Reduce agent token cost along three orthogonal levers: **fewer tokens** (slim footprints, compress history), **cheaper tokens** (prefix caching, model routing), **fewer turns** (loop orchestration). Apply strategies in the ROI order below; each is backed by measured data in `references/playbook.md`.

## Cost Model (why these rules work)

```
total = Σ_turn [ (fixed_prompt + accumulated_history + tool_result) × input_price
               + output × output_price ]
```

- History is re-sent every turn → accumulation is O(N²); fixed prompt is multiplied by N.
- Output tokens cost 3–5× input; cached-input tokens cost ~10% of normal input.
- Attention is quadratic → context has a budget; "context rot" makes bigger windows worse, not better.

## Workflow

### Step 1 — Audit

Run the bundled auditor on the target (it is dependency-free):

```bash
node <skill-dir>/scripts/token_audit.cjs <file-or-dir> [--top 15]
```

It reports: per-file estimated tokens, prefix-breaking volatility risks (timestamps, UUIDs, dynamic placeholders in leading sections), oversized prompts/tools, and a prioritized finding list. If the target is an API bill or behavior question rather than files, audit instead by inspecting a representative request trace: identify the largest repeated blocks (system prompt, tool results, logs) and count turns.

### Step 2 — Apply by ROI order

Fix in this sequence; stop when budget goal is met. Consult `references/playbook.md` for implementation detail of any item.

1. **Restore prefix-cache hits (price lever, zero quality loss)** — move volatile content (dates, request IDs, random values, per-user vars) OUT of the stable prefix. Layout: static system prompt → tool definitions → stable history → append-only tail. Check platform minimum cached length and TTL vs request cadence.
2. **Slim fixed prompt (multiplier lever)** — cut examples/rules until eval-neutral. Precedent: Claude Code system prompt −80% with no regression. Remove format taxes (line-number prefixes, boilerplate), converge tool set to zero-overlap, self-contained, fewest count.
3. **Cap tool outputs (increment lever)** — truncate/paginate aggressively; compress predictable noise (build/test logs) but keep source code verbatim; always leave a retrieval pointer back to full data.
4. **Compaction & notes for long sessions** — substitute old tool results with placeholders first, summarize only near the ceiling, preserve architecture decisions + TODOs; externalize state to files (NOTES.md pattern) or explicit state objects instead of replaying history.
5. **Reduce turns** — event notification instead of polling background tasks; batch independent operations; structured output limits; budget circuit-breakers per task (stop-loss when a loop repeats the same failure).
6. **Route models** — small/cheap models for extraction, summarization, classification, retries; frontier model for planning and final decisions.
7. **Subagent isolation** — heavy exploration in isolated windows returning ≤~1–2k token reports. NOTE: multi-agent ≈15× chat tokens overall; only for high-value tasks.

### Step 3 — Verify end-to-end

- Measure per TASK, not per call: a "shorter" output that adds one retry turn usually raises total cost.
- Keep a behavior regression check (eval set or sampled tasks) before/after any prompt or tool change.
- Re-run the auditor and compare estimated tokens; report before/after in the final answer.

## Iron Rules

- Never break byte-level prefix stability for cached requests: nothing volatile above the tail.
- Never compress irreversibly without a recovery path to the original data.
- Never claim savings without an end-to-end (turns × tokens) measurement.
- Prefer deleting instructions to adding clarifications; the model is smarter than your rules.
- Chinese/CJK text tokenizes ~1 token/char in English-centric tokenizers; tokenizer-friendly models can save ~35% for CJK workloads.

## Modes

- **Optimize an existing agent/codebase**: Steps 1→3, patch code (prompt files, tool schemas, output caps, cache layout).
- **Review a prompt/config before ship**: Step 1 + Step 2 items 1–2 + concise findings list.
- **Explain/diagnose a bill**: reconstruct cost model from request logs, rank contributors, recommend top 3 fixes with estimated savings.

## Enforcement Toolkit (deterministic, model-independent)

Soft prompt rules are probabilistic; these tools enforce savings mechanically. All zero-dependency Node scripts under `<skill-dir>/scripts/`.

1. **`tok_reduce.cjs` — output condenser (increment control).** Pipe any verbose command through it before output reaches context:
   `<cmd> 2>&1 | node <skill-dir>/scripts/tok_reduce.cjs`
   Keeps error lines (±1 context), collapses duplicate lines to `[×N similar]`, head/tail samples. Tested at ~1200→50 tokens on build-log noise. Prefer it whenever a command may emit >100 lines of predictable output.
2. **`tok_read.cjs` — token-bounded file reader.** Use instead of whole-file reads on large files:
   `node <skill-dir>/scripts/tok_read.cjs <file> --outline` (structure map) then `--grep PAT -C 2` or `--range A-B` for targeted windows. Output is line-numbered with a pointer to what was skipped.
3. **`tok_usage.cjs` — bill analyzer.** `node <skill-dir>/scripts/tok_usage.cjs <session.jsonl|dir>`
   Aggregates uncached-input / output / cache-read / cache-write (Claude Code & OpenAI-style usage fields), computes cache hit rate with remediation advice, ranks top requests. Run this before recommending optimizations on any real bill.
4. **`token_guard.cjs` — PreToolUse hook (hard blocking).** Denies token bombs at the gate via exit code 2 + stderr reason (Qoder-documented semantics): whole-file `cat` of logs, `find /`, verbose installs, >256KB unlimited Reads — each denial points to the right tool above. Registration (already configured in user settings.json when applicable):
   ```json
   { "hooks": { "PreToolUse": [ { "matcher": "Bash|Read",
       "hooks": [ { "type": "command",
         "command": "node \"<skill-dir>/scripts/token_guard.cjs\"" } ] } ] } }
   ```

5. **`token_condenser.cjs` — experimental PostToolUse auto-condense (optional).** Rewrites oversized Bash/tool output via `updatedToolOutput` when it exceeds ~1200 estimated tokens (errors kept, noise collapsed). The exact PostToolUse stdin field names are not documented; run once with `--print-stdin` to capture a real payload and adjust `findToolOutput()` before relying on it — safe no-op on unknown shapes. Registration mirrors the guard, under `"PostToolUse"`.

When optimizing a project's harness, recommend porting these patterns (output caps at the tool layer, event-not-poll loops, cache-aware layout) into its own code — see playbook §1–§3 for the production precedents.

## Resources

- `scripts/token_audit.cjs` — dependency-free token & prefix-cache-risk auditor.
- `scripts/tok_reduce.cjs` — verbose-output condenser (pipe filter).
- `scripts/tok_read.cjs` — token-bounded file reader (outline/grep/range/head/tail).
- `scripts/tok_usage.cjs` — session-log bill analyzer (4-way token split + cache hit rate).
- `scripts/token_guard.cjs` — PreToolUse hook that hard-blocks known token bombs.
- `scripts/token_condenser.cjs` — experimental PostToolUse auto-condense (needs --print-stdin wiring).
- `references/playbook.md` — detailed evidence-backed strategies: cache layout rules, compaction designs (Codex/Claude Code/OpenCode), compression research (LLMLingua/ACON/TokenPilot), routing, subagent economics, measurement tooling.
