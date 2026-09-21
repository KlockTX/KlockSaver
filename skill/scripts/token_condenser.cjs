#!/usr/bin/env node
/* token_condenser.cjs — PostToolUse hook: auto-condense oversized tool output (experimental).
   Emits {"hookSpecificOutput":{"hookEventName":"PostToolUse","updatedToolOutput":"..."}} when the
   tool result exceeds --threshold estimated tokens. Unknown stdin schema => silently allow (exit 0).
   First-time wiring: run `node token_condenser.cjs --print-stdin > condenser-payload.sample.json`
   registered as a PostToolUse hook, then adapt OUTPUT_KEY/INPUT paths to the real field names.
   Register in settings AFTER PreToolUse guard, matcher "Bash". */
'use strict';
const fs = require('fs');
const argv = process.argv;
const THRESH = (() => { const i = argv.indexOf('--threshold'); return i > 0 ? parseInt(argv[i + 1], 10) : 1200; })();
const ERROR_RE = /\b(error|errors|failed|failure|exception|traceback|fatal|panic|denied|cannot|couldn'?t|unhandled|warn(?:ing)?)\b|✖/i;
const est = (s) => Math.round(s.length / 3.6);

process.stdin.resume();
let raw = '';
process.stdin.on('data', (d) => raw += d);
process.stdin.on('end', () => {
  if (argv.includes('--print-stdin')) { fs.writeFileSync('condenser-payload.sample.json', raw || '{}'); console.log('[condenser] sample written'); process.exit(0); }
  let j; try { j = JSON.parse(raw || '{}'); } catch { process.exit(0); }
  const out = findToolOutput(j);
  if (!out || est(out) <= THRESH) process.exit(0);
  const condensed = condense(out);
  console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', updatedToolOutput:
    `[klocksaver condenser] ${(est(out) / 1000).toFixed(1)}k -> ${(est(condensed) / 1000).toFixed(1)}k tok\r\n` + condensed
    + `\r\n(full output condensed; rerun the command redirected to a file if exact text is needed)` } }));
  process.exit(0);
});

function findToolOutput(j) {
  const cands = [j.tool_response, j.toolResponse, j.tool_output, j.toolOutput, j.output, j.result];
  for (const c of cands) {
    if (typeof c === 'string' && c) return c;
    if (c && typeof c === 'object') {
      const inner = c.stdout || c.content || c.text;
      if (typeof inner === 'string' && inner) return inner;
      if (Array.isArray(inner)) { const t = inner.map(x => typeof x === 'string' ? x : (x && x.text) || '').join('\n'); if (t) return t; }
    }
  }
  if (typeof j.stdout === 'string' && j.tool_name) return j.stdout;
  return null;
}

function condense(text) {
  const lines = text.split(/\r?\n/);
  const recs = new Map();
  for (const l of lines) {
    const t = l.trim();
    if (!t) continue;
    if (t.length > 300) { if (ERROR_RE.test(t) && !recs.has('L' + t.slice(0, 120))) recs.set('L' + t.slice(0, 120), { line: t.slice(0, 300) + '...', rep: 1 }); continue; }
    const norm = t.replace(/\d+/g, '#');
    if (recs.has(norm)) { recs.get(norm).rep++; continue; }
    recs.set(norm, { line: l, rep: 1 });
  }
  const arr = [...recs.values()];
  const keep = new Set();
  arr.forEach((r, i) => { if (ERROR_RE.test(r.line)) for (let k = Math.max(0, i - 1); k <= Math.min(arr.length - 1, i + 2); k++) keep.add(k); });
  if (arr.length > 16) { for (let k = 0; k < 8; k++) keep.add(k); for (let k = arr.length - 8; k < arr.length; k++) keep.add(k); }
  return [...keep].sort((a, b) => a - b).map((i) => arr[i].line + (arr[i].rep > 1 ? `   [x${arr[i].rep} similar]` : '')).join('\n');
}
