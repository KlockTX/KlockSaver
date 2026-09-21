#!/usr/bin/env node
/* tok_usage.cjs — aggregate token usage from session JSONL logs (Claude Code / generic usage records).
   usage: node tok_usage.cjs <file.jsonl|dir> [...] [--prices "model=in,=out,cacheRead,cacheWrite per MTok"]
   Reports: per-category totals, cache hit rate, top requests by cost. */
'use strict';
const fs = require('fs');
const path = require('path');
const argv = process.argv.slice(2);
const pricesOpt = (() => { const i = argv.indexOf('--prices'); return i >= 0 && argv[i + 1] ? argv[i + 1].split(',').map(Number) : null; })();
const args = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1] === '--prices'));
if (!args.length) { console.log('usage: node tok_usage.cjs <file.jsonl|dir> [...] [--prices "in,out,cacheRead,cacheWrite per MTok USD"]'); process.exit(0); }

const files = [];
for (const a of args) {
  let st; try { st = fs.statSync(a); } catch { continue; }
  if (st.isDirectory()) {
    for (const e of fs.readdirSync(a)) if (/\.(jsonl|json|log)$/i.test(e)) files.push(path.join(a, e));
  } else {
    files.push(a);
  }
}

const T = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, requests: 0, files: 0 };
const top = [];
for (const f of files) {
  let text; try { text = fs.readFileSync(f, 'utf8'); } catch { continue; }
  T.files++;
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let j; try { j = JSON.parse(line); } catch { continue; }
    const u = j.usage || (j.message && j.message.usage) || j.tokenUsage || j.tokens;
    if (!u || typeof u !== 'object') continue;
    const inp = u.input_tokens ?? u.prompt_tokens ?? u.promptTokens ?? 0;
    const out = u.output_tokens ?? u.completion_tokens ?? u.completionTokens ?? 0;
    const cr = u.cache_read_input_tokens ?? u.cached_tokens ?? u.cacheReadTokens ?? 0;
    const cw = u.cache_creation_input_tokens ?? u.cacheWriteTokens ?? 0;
    if (!inp && !out) continue;
    T.requests++; T.input += inp - Math.min(inp, cr); T.output += out; T.cacheRead += cr; T.cacheWrite += cw;
    top.push({ f: path.basename(f), in: inp, out, cr, s: inp + out });
  }
}
if (!T.requests) { console.log('[tok_usage] no usage records found in', T.files, 'file(s) — expected JSONL with usage{input_tokens,output_tokens,...} per line'); process.exit(0); }
top.sort((a, b) => b.s - a.s);
const total = T.input + T.output + T.cacheRead + T.cacheWrite;
const hitRate = total ? Math.round(T.cacheRead / total * 100) : 0;
console.log(`TOKEN USAGE — ${T.requests} requests across ${T.files} file(s)`);
console.log(`  uncached input : ${fmt(T.input)}`);
console.log(`  output         : ${fmt(T.output)}   (priced 3-5x input)`);
console.log(`  cache read     : ${fmt(T.cacheRead)}`);
console.log(`  cache write    : ${fmt(T.cacheWrite)}`);
console.log(`  total          : ${fmt(total)}`);
if (pricesOpt && pricesOpt.length === 4 && pricesOpt.every(n => !isNaN(n))) {
  const [pi, po, pcr, pcw] = pricesOpt;
  const cost = (T.input * pi + T.output * po + T.cacheRead * pcr + T.cacheWrite * pcw) / 1e6;
  const nocache = (T.input + T.cacheRead) * pi + T.output * po;
  console.log(`  est. cost       : $${cost.toFixed(3)} (prices in/out/cR/cW per MTok) | without cache: $${nocache.toFixed(3)} | saved ${nocache > 0 ? Math.max(0, Math.round((1 - cost / nocache) * 100)) : 0}%`);
}
console.log(`\nCACHE HIT RATE: ${hitRate}%  → ${advice(hitRate)}`);
console.log(`\nTOP ${Math.min(10, top.length)} requests by tokens:`);
for (const t of top.slice(0, 10)) console.log(`  ${fmt(t.s).padStart(9)} tok  in:${fmt(t.in)} out:${fmt(t.out)} cacheR:${fmt(t.cr)}  ${t.f}`);

function fmt(n) { return n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n); }
function advice(h) {
  if (h >= 70) return 'healthy — keep prefix layout stable';
  if (h >= 30) return 'MEDIUM: hunt volatile values (timestamps/ids) entering the prefix; check TTL vs request cadence';
  return 'LOW: nearly every turn re-pays prefill — audit prefix layout FIRST (playbook §1) before any other optimization';
}
