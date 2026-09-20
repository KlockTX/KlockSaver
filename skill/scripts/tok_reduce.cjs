#!/usr/bin/env node
/* tok_reduce.cjs — condense verbose command output (build/test/logs) before it enters context.
   usage: <cmd> 2>&1 | node tok_reduce.cjs [--max N] [--keep-head 8] [--keep-tail 8]
          node tok_reduce.cjs --input file.log */
'use strict';
const fs = require('fs');
const argv = process.argv;
const opt = (n, d) => { const i = argv.indexOf(n); return i > 0 && argv[i + 1] ? parseInt(argv[i + 1], 10) : d; };
const KH = opt('--keep-head', 8), KT = opt('--keep-tail', 8);
const ERROR_RE = /\b(error|errors|failed|failure|exception|traceback|fatal|panic|denied|cannot|couldn'?t|unhandled|warn(?:ing)?)\b|✖/i;

let raw;
try { raw = fs.readFileSync(0, 'utf8'); }
catch { console.log('[tok_reduce] no input on stdin'); process.exit(0); }
if (argv.includes('--input')) raw = fs.readFileSync(argv[argv.indexOf('--input') + 1], 'utf8');

const lines = raw.split(/\r?\n/);
const recs = new Map(); // normalized -> {line, rep}
for (const l of lines) {
  const t = l.trim();
  if (!t) continue;
  if (t.length > 300) {
    if (ERROR_RE.test(t)) { const k = 'LONG:' + t.slice(0, 120); if (!recs.has(k)) recs.set(k, { line: t.slice(0, 300) + '…', rep: 1 }); }
    continue;
  }
  const norm = t.replace(/\d+/g, '#');
  if (recs.has(norm)) { recs.get(norm).rep++; continue; }
  recs.set(norm, { line: l, rep: 1 });
}
const arr = [...recs.values()];
const keep = new Set();
arr.forEach((r, i) => {
  if (ERROR_RE.test(r.line)) for (let k = Math.max(0, i - 1); k <= Math.min(arr.length - 1, i + 2); k++) keep.add(k);
});
if (arr.length > KH + KT) {
  for (let k = 0; k < KH; k++) keep.add(k);
  for (let k = arr.length - KT; k < arr.length; k++) keep.add(k);
}
const idxs = [...keep].sort((a, b) => a - b);
const body = [];
let last = -2;
for (const i of idxs) {
  if (i > last + 1) body.push(`… +${i - last - 1} quiet lines omitted`);
  body.push(arr[i].line + (arr[i].rep > 1 ? `   [×${arr[i].rep} similar]` : ''));
  last = i;
}
const result = body.join('\n');
const est = (s) => Math.round(s.length / 3.6);
process.stdout.write(`[tok_reduce] ${lines.length} lines ~${est(raw)}tok → ${body.length} lines ~${est(result)}tok\n`
  + (result || '[nothing matched, all output looked like noise]')
  + `\n(source had ${arr.length} distinct lines; rerun raw if exact text needed)\n`);
