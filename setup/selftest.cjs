#!/usr/bin/env node
/* selftest.cjs — executable acceptance tests for every KlockSaver component. Zero deps.
   usage: node setup/selftest.cjs   (exit 0 = all pass; prints PASS/FAIL per test, ASCII only) */
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { spawnSync } = require('child_process');
const S = path.join(__dirname, '..', 'skill', 'scripts');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'kls-t-'));
const run = (script, args, opts) => spawnSync(process.execPath, [path.join(S, script), ...(args || [])], Object.assign({ encoding: 'utf8', cwd: TMP }, opts || {}));
let pass = 0, fail = 0;
function t(name, ok, info) {
  if (ok) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (info ? ' | ' + String(info).replace(/\s+/g, ' ').slice(0, 160) : '')); }
}

// 1. token_audit: prefix volatility in leading half -> HIGH
fs.writeFileSync(path.join(TMP, 'bad.md'), '# Prompt\nDate {{request_id}} ref 550e8400-e29b-41d4-a716-446655440000 2026-01-02T03:04\nbody line\n'.repeat(4));
let r = run('token_audit.cjs', [path.join(TMP, 'bad.md')]);
t('audit detects prefix risks', r.status === 0 && /HIGH/.test(r.stdout), r.stdout || r.stderr);

// 2. tok_reduce: errors kept, duplicates collapsed, --max respected
const noise = Array.from({ length: 120 }, (_, i) => 'progress chunk ' + i + ' fetched ok').join('\n') + '\nERROR: build failed at step 7\n' + Array.from({ length: 60 }, (_, i) => 'webpack entry ' + i + ' compiled').join('\n');
fs.writeFileSync(path.join(TMP, 'n.log'), noise);
r = run('tok_reduce.cjs', ['--input', path.join(TMP, 'n.log'), '--max', '80']);
t('reduce keeps errors + collapses dups', /ERROR: build failed/.test(r.stdout) && /×120|\×1[01]\d/.test(r.stdout), r.stdout);
t('reduce respects --max budget', /budget --max|\d+ lines ~\d+tok/.test(r.stdout) && r.stdout.split('\n').length < 180, r.stdout.slice(0, 120));

// 3. token_guard: deny cat-log (exit 2), allow piped + benign (exit 0)
const g = (cmd) => run('token_guard.cjs', [], { input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: cmd } }) });
t('guard blocks cat build.log', g('cat build.log').status === 2);
t('guard allows piped cat', g('cat build.log | tail -5').status === 0);
t('guard allows head -50 (small)', g('head -50 notes.txt').status === 0);
t('guard allows head -n 30 log', g('head -n 30 app.log').status === 0);
t('guard blocks head -5000 log', g('head -5000 big.log').status === 2);
t('guard blocks head -n 5000 log', g('head -n 5000 big.log').status === 2);
t('guard blocks head --lines=99999 log', g('head --lines=99999 big.log').status === 2);
t('guard allows filename with dash-digits', g('head notes-1234.txt').status === 0);
t('guard blocks find root', g('find / -name x').status === 2);
t('guard allows ls', g('ls -la').status === 0);

// 4. tok_read: outline lists headings
r = run('tok_read.cjs', [path.join(__dirname, '..', 'skill', 'SKILL.md'), '--outline']);
t('read outline finds sections', r.status === 0 && /#\s|Overview/i.test(r.stdout), r.stdout.slice(0, 100));

// 5. tok_usage: totals + cache rate + --prices cost line
fs.writeFileSync(path.join(TMP, 'u.jsonl'),
  '{"usage":{"input_tokens":100,"output_tokens":50,"cache_read_input_tokens":0}}\n' +
  '{"message":{"usage":{"input_tokens":2000,"output_tokens":300,"cache_read_input_tokens":1900,"cache_creation_input_tokens":100}}}\n');
r = run('tok_usage.cjs', [path.join(TMP, 'u.jsonl'), '--prices', '3,15,0.3,3.75']);
t('usage aggregates + prices', /CACHE HIT RATE/.test(r.stdout) && /est\. cost/.test(r.stdout) && /saved \d+%/.test(r.stdout), r.stdout.slice(0, 160));

// 6. installer dry-run touches nothing
const sd = path.join(TMP, 'skills'), sf = path.join(TMP, 'settings.json');
fs.writeFileSync(sf, '{"keep":1}');
r = spawnSync(process.execPath, [path.join(__dirname, 'install.cjs'), '--dry-run', '--skills-dir', sd, '--settings', sf], { encoding: 'utf8' });
t('installer dry-run is inert', r.status === 0 && /DRY RUN/.test(r.stdout) && !fs.existsSync(path.join(sd, 'klocksaver')) && JSON.parse(fs.readFileSync(sf, 'utf8')).keep === 1, r.stdout.slice(0, 160));

// 7. installer full round-trip in sandbox + uninstall restores
r = spawnSync(process.execPath, [path.join(__dirname, 'install.cjs'), '--yes', '--skills-dir', sd, '--settings', sf], { encoding: 'utf8' });
const installed = fs.existsSync(path.join(sd, 'klocksaver', 'SKILL.md')) && /klocksaver/.test(fs.readFileSync(sf, 'utf8'));
const r2 = spawnSync(process.execPath, [path.join(__dirname, 'install.cjs'), '--uninstall', '--skills-dir', sd, '--settings', sf], { encoding: 'utf8' });
t('installer round-trip + uninstall', r.status === 0 && installed && r2.status === 0 && JSON.parse(fs.readFileSync(sf, 'utf8')).keep === 1 && !/klocksaver/.test(fs.readFileSync(sf, 'utf8')), r.stdout.slice(0, 120));

console.log(`\n${pass} passed, ${fail} failed`);
fs.rmSync(TMP, { recursive: true, force: true });
process.exit(fail ? 1 : 0);
