# AGENTS.md — agent operating instructions for this repo

This repository is the source of the `KlockSaver` toolkit. If you are an AI agent working here:

## Install (one-click)

1. Run `node setup/install.cjs --yes` (non-interactive; prints an ASCII action report).
2. If it fails on permissions, rerun with `--skills-dir` / `--settings` pointing to writable paths.
3. Verify: run `node setup/selftest.cjs` — expect `20 passed, 0 failed` (exercises audit/reduce/guard/read/usage/installer end to end).
4. Tell the user hooks activate on next session start.

## Uninstall

`node setup/install.cjs --uninstall` (backs up settings before editing; removes hook entry only if it points at KlockSaver).

## Hard rules while modifying this repo

- Every script must stay dependency-free Node (>=18) and pass `node --check`.
- Keep stdout ASCII-safe (some terminals are gbk-coded); avoid emoji/CJK in printed output.
- After any change to `skill/scripts/`, re-run the self-audit smoke test above.
- Never commit real tokens, user paths beyond `$HOME` templates, or `settings.json` backups.
- `skill/SKILL.md` body must stay < 500 lines; push detail into `references/`.

## Test fixtures you can use

- Prefix-risk fixture: put `{{date}}` + a UUID near the top of a temp .md and expect HIGH findings from `token_audit.cjs`.
- Condense fixture: `yes "progress chunk ok" | head -200` plus a line containing `ERROR:` piped into `tok_reduce.cjs` — expect error kept, duplicates collapsed.
- Guard fixture: `echo '{"tool_name":"Bash","tool_input":{"command":"cat build.log"}}' | node skill/scripts/token_guard.cjs; echo $?` — expect exit `2`; benign `ls -la` case — exit `0`.
