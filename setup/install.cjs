#!/usr/bin/env node
/* install.cjs — one-shot installer for the klocksaver toolkit.
   Copies skill/ into the CLI skills dir and registers the PreToolUse guard hook.
   usage: node setup/install.cjs [--yes] [--dry-run] [--skills-dir DIR] [--settings FILE] [--uninstall]
   Zero dependencies. ASCII-only output (gbk-console safe). */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null; };
const DRY = flag('--dry-run');
const HOME = os.homedir();
const SKILLS = opt('--skills-dir') || path.join(HOME, '.qoder-cn', 'skills');
const SETTINGS = opt('--settings') || path.join(HOME, '.qoder-cn', 'settings.json');
const SRC = path.join(__dirname, '..', 'skill');
const DEST = path.join(SKILLS, 'klocksaver');
const GUARD = 'token_guard.cjs';

const log = (...a) => console.log(...a);
function backup(f) {
  if (!fs.existsSync(f)) return null;
  const b = f + '.bak-' + Date.now();
  if (!DRY) fs.copyFileSync(f, b);
  return b;
}
function copyTree(src, dest) {
  let n = 0;
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dest, e.name);
    if (e.isDirectory()) n += copyTree(s, d);
    else { if (!DRY) fs.copyFileSync(s, d); n++; }
  }
  return n;
}
function hookCommand() {
  const p = path.join(DEST, 'scripts', GUARD).replace(/\\/g, '/');
  return 'node "' + p + '"';
}
function alreadyRegistered(hooks) {
  const list = (hooks && hooks.PreToolUse) || [];
  return list.some((grp) => (grp.hooks || []).some((h) => String(h.command || '').includes(GUARD) && String(h.command || '').includes('klocksaver')));
}

if (flag('--uninstall')) {
  if (!fs.existsSync(SETTINGS)) { log('[uninstall] no settings file at', SETTINGS); process.exit(0); }
  const settings = JSON.parse(fs.readFileSync(SETTINGS, 'utf8'));
  const pre = (settings.hooks && settings.hooks.PreToolUse) || [];
  const kept = pre.filter((grp) => !(grp.hooks || []).some((h) => String(h.command || '').includes(GUARD) && String(h.command || '').includes('klocksaver')));
  if (kept.length === pre.length) log('[uninstall] klocksaver hook not registered; nothing to do');
  else {
    settings.hooks.PreToolUse = kept;
    if (!settings.hooks.PreToolUse.length) delete settings.hooks.PreToolUse;
    if (!Object.keys(settings.hooks).length) delete settings.hooks;
    const b = backup(SETTINGS);
    if (!DRY) fs.writeFileSync(SETTINGS, JSON.stringify(settings, null, 2) + '\n');
    log('[uninstall] hook removed' + (b ? ' (settings backed up: ' + b + ')' : ''));
    log('[uninstall] skill files kept at ' + DEST + ' - delete manually if desired');
  }
  process.exit(0);
}

log('== klocksaver installer ' + (DRY ? '(DRY RUN - nothing will be written)' : '') + ' ==');
log('skills dir :', SKILLS);
log('settings   :', SETTINGS);

// preflight: source integrity
if (!fs.existsSync(path.join(SRC, 'SKILL.md'))) { log('[FAIL] repo layout broken: skill/SKILL.md not found next to setup/'); process.exit(1); }

// step 1: copy skill
try {
  if (fs.existsSync(DEST)) {
    const b = DEST + '.old-' + Date.now();
    if (!DRY) fs.renameSync(DEST, b);
    log('[1/3] existing install moved aside ->', path.basename(b));
  }
  const n = copyTree(SRC, DEST);
  log('[1/3] installed', n, 'files ->', DEST);
} catch (e) { log('[FAIL] copy:', e.message, '\n  retry with --skills-dir <writable path>'); process.exit(1); }

// step 2: syntax-check installed scripts
try {
  const { execFileSync } = require('child_process');
  const dir = path.join(DEST, 'scripts');
  if (!DRY) for (const f of fs.readdirSync(dir)) if (f.endsWith('.cjs')) execFileSync(process.execPath, ['--check', path.join(dir, f)], { stdio: 'pipe' });
  log('[2/3] script syntax check: OK');
} catch (e) { log('[FAIL] syntax check:', String(e.stderr || e.message).slice(0, 200)); process.exit(1); }

// step 3: register hook
try {
  let settings = {};
  if (fs.existsSync(SETTINGS)) settings = JSON.parse(fs.readFileSync(SETTINGS, 'utf8'));
  settings.hooks = settings.hooks || {};
  if (alreadyRegistered(settings.hooks)) {
    log('[3/3] hook already registered: skipped (idempotent)');
  } else {
    settings.hooks.PreToolUse = settings.hooks.PreToolUse || [];
    settings.hooks.PreToolUse.unshift({ matcher: 'Bash|Read', hooks: [{ type: 'command', command: hookCommand() }] });
    if (fs.existsSync(SETTINGS)) { const b = backup(SETTINGS); log('      settings backed up ->', path.basename(b)); }
    if (!DRY) fs.writeFileSync(SETTINGS, JSON.stringify(settings, null, 2) + '\n');
    log('[3/3] PreToolUse guard hook registered');
  }
} catch (e) { log('[FAIL] settings merge:', e.message, '\n  your settings.json was NOT modified; retry with --settings <path>'); process.exit(1); }

log('\nDONE. Hooks take effect from the NEXT session. Try:');
log('  node "' + path.join(DEST, 'scripts', 'token_audit.cjs') + '" <your-project>');
if (!flag('--yes') && !DRY) log('(tip: paste AGENTS.md into your agent for self-verification steps)');
