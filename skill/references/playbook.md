# Token Saver Playbook — Evidence-Backed Strategies

Load sections as needed. Each item cites measured results where available.

## 1. Prefix Caching / Prompt Caching (price lever — do first)

Mechanics: server stores KV matrices of the request prefix; billing on cache-read
input is ~10% of normal (Anthropic; measured "first round +25% write cost, each
subsequent round −86%"). OpenAI-style caching discounts cached input ~50-90%.
Cache matching is BYTE-EXACT from token 0 onward.

Layout rule (top → bottom):
1. Static system prompt (never changes across requests)
2. Tool definitions (stable serialization; beware key-order jitter in JSON)
3. Append-only conversation history / tool results (only grows at tail)
4. Volatile content: dates, request IDs, user context, RAG results — LAST

Killers to hunt (see token_audit.cjs patterns):
- `{{date}}`, timestamps, UUIDs, nonce, session_id inside prefix
- `new Date().toISOString()`, `Date.now()`, `randomUUID()` serialized into requests
- Non-deterministic JSON serialization (re-ordering keys of tool schemas)
- SDK/model field switching mid-session (different cache namespace)

Checklist: respect platform minimum cached prefix length (e.g. 1024/2048 tokens);
align cache TTL with real request cadence; monitor hit-rate as a first-class metric
(one published case: hit rate 7% → 74% gave −59% total inference cost with layout
restructure alone).

TokenPilot (arXiv 2606.17016): static placeholders for volatile system variables +
utility-based batch eviction → cache misses 5.9M → 1.5M tokens, −87% cost, no
performance loss. Lesson: evict in whole segments at the tail, never mutate mid-prefix.

## 2. Fixed-Footprint Slimming (multiplier lever)

The fixed prompt is multiplied by every turn. Evidence:
- Anthropic cut Claude Code system prompt 65k → 13k tokens (~−80%) with internal
  coding evals unchanged or improved. Over-specification and example-stuffing
  CONSTRAIN model capability rather than help.
- GitHub Copilot prompt rework: −1300 tokens/interaction → −29% normalized hourly
  cost (guarded by automated behavioral-regression loop).
- Removing mandatory line-number prefixes from file views: −~3% daily inference.

How-to:
- Delete instructions the base model follows anyway; keep only genuinely
  non-obvious policies. Prefer "why" over stacked MUSTs.
- Start minimal; add rules/examples only in response to observed failures.
- Isolate sections with XML/heading tags; small models need more explicitness,
  frontier models need less.
- Tools: zero overlap, self-contained descriptions, minimal count, bounded return
  sizes. Large capability matrices cause choice paralysis + context pollution.

## 3. Tool-Output & Increment Control

Measured drains (Copilot): repeated build/test logs, redundant retrieval turns
while background tasks finish. Fixes:
- Selective compression: source code verbatim; terminal noise condensed → +5.5%
  efficiency. Noise is high-probability/low-information; code is not.
- Every compressed payload keeps a pointer/path back to the full version
  ("safety cache") — prevents expensive re-execution retries.
- Cap max bytes per tool result; prefer grep/pagination over whole-file reads.
- Batch background-task completions into one notification: −23% token spend.
- Event-driven > polling: never re-render context while waiting.

## 4. Compaction & Memory for Long Sessions

Production compaction designs:
- Codex CLI: near window ceiling → model writes a "status report", report replaces
  the exchange, USER messages preserved verbatim.
- Claude Code: graduated pipeline — (a) replace stale tool outputs with
  placeholders, (b) truncate tail only (head stays cache-stable), (c) 9-section
  structured summary as last resort; triggers at window−13k tokens or overflow error.
- OpenCode: act only if reclaim >20k tokens, protect newest 40k + active
  instructions; timestamp-mark old entries; background 5-category summary; replay
  last user message immediately.

Compaction targets: keep architectural decisions, constraints, open TODOs;
discard raw tool payloads and duplicated function returns.

Alternative memory (cheaper than summarizing):
- Structured note-taking: agent writes progress/state to files (NOTES.md), reads
  on demand — near-zero context cost across sessions.
- Explicit state objects (SKILL.state pattern): carry current state, not history.
- Subagent reports: exploration in isolated windows, return ~1-2k token digests.

Research line: LLMLingua/LongLLMLingua (perplexity-based prompt compression,
2-5× on long contexts); ACON (compression tuned for long-horizon agents);
CompactionRL (RL-trained self-compaction).

## 5. Turn & Loop Economics

- Agent ≈ 4× chat tokens; multi-agent ≈ 15× chat (Anthropic multi-agent research
  system). Token volume explained 80% of performance variance there — spend where
  value is.
- arXiv 2609.04681: +180% commits but only +30% deploys; <50% of patches survive
  merge; million-token sessions with near-zero success recur. Costs compound in
  retry loops on unfamiliar ecosystems.
- Circuit breakers: per-task token budget; on second identical failure, change
  strategy or escalate to human. Track "production-qualified change", not diffs.
- Structured/constrained output limits the 3-5× priced tokens.

## 6. Model Routing / Cascade

Cheap models for mechanical work (extract, summarize, classify, first-pass
attempts, retries); frontier for planning, code edits requiring taste, final
integration. Published routing frameworks (RouteLLM and successors) report
order-of-magnitude cost cuts at near-eval parity for routable workloads;
engineering roundups claim up to ~25× on well-partitioned pipelines. Gateway
practices: same provider for cache affinity; pin model version to keep cache
namespaces stable.

## 7. Tokenizer & Language Layer

- BPE/byte-level BPE (tiktoken, minbpe): 1 English token ≈ 4 chars ≈ 0.75 words;
  CJK ≈ 1-2.5 tokens per char in English-centric models; expanded-Chinese-vocab
  domestic models ≈ −35% tokens for CJK content.
- Cost comparisons across providers must normalize by tokens-per-task, not
  per-character — tokenizer differences silently shift the ratio.
- JSON/code punctuation tokenizes less efficiently than prose; compact
  serialization (no pretty-print) in tool payloads saves tokens.

## 8. Measurement & Governance

- Tools: tiktoken / provider tokenizers for exact counts; `usage` fields per
  response (input, output, cache-read, cache-write — log ALL four); ccusage and
  OTel pipelines for Claude Code-style sessions.
- Attribute cost per task/session/user, not per API call (FinOps-for-AI).
- Per-workflow independent measurement — prevents "savings" that are just cost
  transfers between services (Copilot methodology note).
- Remember the Verification Tax: human review/rollback of agent output often
  exceeds model spend; the goal is end-to-end unit economics.

## Anti-pattern catalog

| Anti-pattern | Why it hurts | Fix |
|---|---|---|
| Timestamp in system prompt | kills every cache hit | move to tail or remove |
| Re-reading whole file after each edit | O(n) history growth | hold diff/edit anchors, tail-truncate stale reads |
| Polling background jobs in-loop | duplicated turns | completion events, batched |
| "Add more examples to fix behavior" | grows fixed multiplier, may hurt | eval-neutral minimal prompt; fix via context/tool design |
| Aggressive summary w/o pointers | retry loops cost more than original | compressed + recoverable |
| Optimizing single-call tokens only | "shorter outputs can cost more" | measure turns × tokens per task |
| Multi-agent for cheap tasks | 15× cost | route by task value |
