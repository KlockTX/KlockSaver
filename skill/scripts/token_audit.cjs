#!/usr/bin/env node
/* token_audit.cjs — estimate token footprint & flag prefix-cache risks in prompt/config files. Zero deps. */
'use strict';
const fs = require('fs');
const path = require('path');

const ARGS = process.argv.slice(2);
const TOP_IDX = ARGS.indexOf('--top');
const TOP = TOP_IDX >= 0 ? parseInt(ARGS[TOP_IDX + 1], 10) || 15 : 15;
const TARGETS = ARGS.filter((a, i) => !a.startsWith('--') && !(TOP_IDX >= 0 && i === TOP_IDX + 1));
if (!TARGETS.length) {
  console.log('usage: node token_audit.cjs <file-or-dir> [...] [--top N]');
  process.exit(0);
}

const SCAN_EXT = new Set(['.md', '.txt', '.json', '.yaml', '.yml', '.toml', '.prompt', '.tpl', '.hbs', '.mustache']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'vendor', '__pycache__']);
const CODE_HINT = /(prompt|system|instruction|agent|tool|template|schema|config)/i;

function walk(p, out) {
  let st;
  try { st = fs.statSync(p); } catch { return out; }
  if (st.isFile()) { out.push(p); return out; }
  for (const e of fs.readdirSync(p, { withFileTypes: true })) {
    if (e.isDirectory() && (SKIP_DIRS.has(e.name) || e.name.startsWith('.'))) continue;
    walk(path.join(p, e.name), out);
  }
  return out;
}

// Heuristic token estimate: CJK ~1.3 tok/char (English-centric BPE), other non-ASCII ~1, ASCII ~0.28 (≈1/3.6).
function estTokens(text) {
  let cjk = 0, other = 0, ascii = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0);
    if (c >= 0x3040 && c <= 0x9fff || c >= 0xac00 && c <= 0xd7af || c >= 0xf900 && c <= 0xfaff) cjk++;
    else if (c > 0x7f) other++;
    else ascii++;
  }
  return { tokens: Math.round(cjk * 1.3 + other + ascii * 0.28), cjk, ascii };
}

const VOLATILE = [
  [/\{\{\s*(now|date|time|timestamp|uuid|request_?id|session_?id|random|nonce|hash)\s*\}\}/gi, 'template var: dynamic value in prompt'],
  [/\$\{\s*(Date\.now\(\)|new Date\(\)|crypto\.randomUUID|uuid|timestamp|nonce)/gi, 'interpolation: dynamic value in prompt'],
  [/\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/g, 'literal datetime string'],
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, 'literal UUID (per-request breakage risk)'],
  [/\b(current|today'?s)\s+(date|time|datetime)\b/gi, 'injected current-date placeholder'],
];
const VOLATILE_CODE = [
  [/new Date\(\)\.toISOString\(\)/g, 'runtime timestamp likely serialized into request'],
  [/Date\.now\(\)/g, 'runtime clock value likely serialized into request'],
  [/randomUUID\(\)|uuidv4\(\)/g, 'runtime UUID likely serialized into request'],
];

const files = [];
for (const t of TARGETS) walk(path.resolve(t), files);
const report = [];
for (const f of files) {
  const ext = path.extname(f).toLowerCase();
  const isScan = SCAN_EXT.has(ext) || CODE_HINT.test(path.basename(f)) || /\.(c|m)?(js|ts|py|go|rs|java)$/i.test(f);
  if (!isScan) continue;
  let text;
  try { text = fs.readFileSync(f, 'utf8'); } catch { continue; }
  if (text.length > 2_000_000) text = text.slice(0, 2_000_000);
  const { tokens } = estTokens(text);
  if (tokens < 50) continue;
  const findings = [];
  const lines = text.split('\n');
  const firstHalf = lines.slice(0, Math.max(1, Math.floor(lines.length / 2))).join('\n');
  for (const [re, msg] of VOLATILE) {
    const hits = firstHalf.match(re);
    if (hits) findings.push({ sev: 'HIGH', msg: `${msg} ×${hits.length} (in leading half of file — breaks prefix cache)`, sample: hits[0].slice(0, 60) });
  }
  if (/\.(c|m)?(js|ts|py|go|rs|java)$/i.test(f)) {
    for (const [re, msg] of VOLATILE_CODE) {
      const hits = text.match(re);
      if (hits) findings.push({ sev: 'MED', msg: `${msg} ×${hits.length}`, sample: hits[0].slice(0, 60) });
    }
  }
  // JSON tool schemas: property bloat
  if (ext === '.json') {
    try {
      const j = JSON.parse(text);
      const tools = Array.isArray(j) ? j : j.tools || j.functions || [];
      for (const t of tools) {
        const props = countProps(t);
        if (props > 15) findings.push({ sev: 'MED', msg: `tool "${t.name || '?'}" has ${props} schema properties — consider splitting/removing` });
      }
    } catch { /* non-JSON-shaped, skip */ }
  }
  if (tokens > 5000 && !ext.match(/\.(js|ts|py|go|rs|java)$/)) findings.push({ sev: 'MED', msg: `large static footprint: ~${tokens} tokens re-sent every request` });
  report.push({ file: path.relative(process.cwd(), f) || f, tokens, findings });
}

report.sort((a, b) => b.tokens - a.tokens);
const total = report.reduce((s, r) => s + r.tokens, 0);
console.log(`TOKEN AUDIT — ${report.length} files, ~${fmt(total)} est. tokens total\n`);
for (const r of report.slice(0, TOP)) {
  console.log(`${fmt(r.tokens).padStart(9)} tok  ${r.file}`);
  for (const fi of r.findings) console.log(`            [${fi.sev}] ${fi.msg}${fi.sample ? ` | e.g. "${fi.sample}"` : ''}`);
}
if (report.length > TOP) console.log(`… +${report.length - TOP} more files (raise --top)`);
const highs = report.filter(r => r.findings.some(f => f.sev === 'HIGH'));
console.log(`\nSUMMARY: ${highs.length} files with prefix-cache-breaking content; top-3 files hold ${report.slice(0, 3).reduce((s, r) => s + r.tokens, 0) ? Math.round(report.slice(0, 3).reduce((s, r) => s + r.tokens, 0) / (total || 1) * 100) : 0}% of estimated tokens.`);
console.log('Estimates are heuristic (CJK×1.3, ASCII×0.28). Validate exact counts with tiktoken/manufacturer tokenizer before billing claims.');

function countProps(t, n = 0) {
  const s = t?.function?.parameters || t?.parameters || t?.input_schema;
  if (!s || typeof s !== 'object') return n;
  for (const k of ['properties']) if (s[k]) n += Object.keys(s[k]).length;
  for (const v of Object.values(s)) if (v && typeof v === 'object') n = countPropsLike(v, n);
  return n;
}
function countPropsLike(o, n) {
  if (o.properties) n += Object.keys(o.properties).length;
  for (const v of Object.values(o)) if (v && typeof v === 'object') n = countPropsLike(v, n);
  return n;
}
function fmt(n) { return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n); }
