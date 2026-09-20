#!/usr/bin/env node
/* tok_read.cjs — token-bounded file reader: read structure/targeted windows instead of whole files.
   usage: node tok_read.cjs <file> [--outline | --grep PAT [-C 2] | --range A-B | --head N | --tail N] [--max 400 lines] */
'use strict';
const fs = require('fs');
const argv = process.argv;
const file = argv[2];
if (!file) { console.log('usage: node tok_read.cjs <file> [--outline | --grep PAT [-C n] | --range A-B | --head N | --tail N]'); process.exit(0); }
const src = fs.readFileSync(file, 'utf8');
const lines = src.split(/\r?\n/);
const opt = (n, d) => { const i = argv.indexOf(n); return i > 0 ? argv[i + 1] : d; };
const flag = (n) => argv.includes(n);
const numbered = (i) => `${String(i + 1).padStart(5)}| ${lines[i]}`;
const out = [];

if (flag('--outline')) {
  const ext = file.split('.').pop().toLowerCase();
  const pats = {
    md: /^#{1,4}\s/, py: /^(\s*)(def |class )/, js: /^\s*(export |function |class |const .*=>)/, ts: /^\s*(export |function |class |interface |type )/,
    json: /^ {0,4}"/, java: /^\s*(public |private |class |interface |void )/, go: /^\s*(func |type |package )/, rs: /^\s*(pub |fn |struct |impl |use )/,
  };
  const re = pats[ext] || pats.md || /^(#|\w+)/;
  lines.forEach((l, i) => { if (re.test(l)) out.push(numbered(i)); });
} else if (flag('--grep')) {
  const re = new RegExp(opt('--grep'), 'i');
  const C = parseInt(opt('-C', '2'), 10);
  const hits = [];
  lines.forEach((l, i) => { if (re.test(l)) hits.push(i); });
  const shown = new Set();
  hits.forEach((h) => {
    for (let k = Math.max(0, h - C); k <= Math.min(lines.length - 1, h + C); k++) shown.add(k);
    if (shown.size > 400) return;
  });
  [...shown].sort((a, b) => a - b).forEach((i) => out.push(numbered(i)));
  out.push(`-- ${hits.length} match(es) for /${opt('--grep')}/`);
} else if (flag('--range')) {
  const [a, b] = opt('--range').split('-').map(Number);
  for (let i = a - 1; i <= Math.min(b, lines.length) - 1; i++) out.push(numbered(i));
} else if (flag('--head')) {
  for (let i = 0; i < parseInt(opt('--head'), 10); i++) out.push(numbered(i));
} else if (flag('--tail')) {
  for (let i = Math.max(0, lines.length - parseInt(opt('--tail'), 10)); i < lines.length; i++) out.push(numbered(i));
} else {
  const n = parseInt(opt('--max', '200'), 10);
  for (let i = 0; i < Math.min(n, lines.length); i++) out.push(numbered(i));
  if (lines.length > n) out.push(`… file has ${lines.length} lines; use --grep/--range/--outline/--head/--tail for the rest`);
}
console.log(out.join('\n'));
