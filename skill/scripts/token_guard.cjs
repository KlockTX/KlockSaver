#!/usr/bin/env node
/* token_guard.cjs — PreToolUse hook: deterministically block known token bombs.
   Receives hook JSON on stdin: {"tool_name":"Bash|Read","tool_input":{...}}
   Emits Claude-Code-compatible deny decision; exits 0 (allow) otherwise.
   Register in settings (see SKILL.md "Hooks" section). */
'use strict';
let raw = '';
process.stdin.on('data', d => raw += d);
process.stdin.on('end', () => {
  let j; try { j = JSON.parse(raw || '{}'); } catch { process.exit(0); }
  const name = j.tool_name || j.toolName || '';
  const input = j.tool_input || j.toolInput || {};
  const deny = (why) => {
    // Qoder CLI documented semantics: exit code 2 blocks the call; stderr is returned to the model.
    console.error('[klocksaver guard] ' + why);
    process.exit(2);
  };

  if (/^Bash$/i.test(name)) {
    const cmd = String(input.command || '');
    if (/\b(cat|head\s+-n?\s*9{3,}|less|more)\b.*\.(log|jsonl?|csv|txt)\b/i.test(cmd) && !/\||head/.test(cmd))
      return deny(`Reading whole log/data file into context. Pipe through: | node "$HOME/.qoder-cn/skills/klocksaver/scripts/tok_reduce.cjs" or grep the error lines only.`);
    if (/\bfind\s+\/(\s|$)/.test(cmd)) return deny(`Filesystem-wide find: output floods context. Scope to the project dir or use the Glob/Grep tool.`);
    if (/\bgrep\s+-r[^|]*\s\/(\s|$)/.test(cmd)) return deny(`Recursive grep from filesystem root. Scope the path, or use the Grep tool (already capped).`);
    if (/\b(npm|yarn|pnpm)\b.*(install|build|test)\b/.test(cmd) && !/\|.*(tail|grep|tok_reduce)/.test(cmd) && /--?(verbose|loglevel\s*=)/.test(cmd))
      return deny(`Verbose package-manager output into context. Drop --verbose or pipe: 2>&1 | node ~/.qoder-cn/skills/klocksaver/scripts/tok_reduce.cjs`);
  }
  if (/^Read$/i.test(name)) {
    const p = String(input.file_path || input.filePath || '');
    try {
      const st = require('fs').statSync(p);
      if (st.size > 256 * 1024 && input.limit == null)
        return deny(`File is ${(st.size / 1024 / 1024).toFixed(1)}MB with no limit — will blow the context. Use Grep first, then Read with offset/limit, or tok_read.cjs --outline.`);
    } catch { /* unreadable path: let normal flow handle it */ }
  }
  process.exit(0); // allow
});
