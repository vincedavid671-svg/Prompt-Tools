#!/usr/bin/env node
/**
 * Module boundary check.
 *
 *   node tools/boundary-check.mjs
 *
 * Exits 0 when the boundary holds, 1 when it does not. No dependencies, no
 * network. Safe to run from anywhere; paths resolve from this file, not cwd.
 *
 * Passport Pantry is a separated module inside a repository whose root is an
 * unrelated forked application (jwangkun/Prompt-Tools). The decision is to
 * keep it here rather than extract it — see docs/MODULE_BOUNDARY.md. That
 * decision is only safe while the separation is real, and separation decays
 * quietly: one import, one shared config, one script reaching across, and a
 * later extraction stops being a `git subtree split`.
 *
 * So this asserts both directions:
 *
 *   OUTWARD  nothing in passport-pantry/ references anything above it
 *   INWARD   nothing outside passport-pantry/ references it, except the
 *            documentation that is supposed to
 *
 * The inward half is why this is a separate script from consistency-check.mjs:
 * that one loads the app and reasons about recipe data, and has no business
 * walking the rest of the repository.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const MODULE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = path.resolve(MODULE_DIR, '..');
const MODULE_NAME = path.basename(MODULE_DIR);

let fail = 0;
const bad = msg => { console.log('  x ' + msg); fail++; };
const rel = p => path.relative(REPO_ROOT, p);

const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', 'target',
                           '.fdc-cache', '.wd-cache', 'src-tauri']);
const TEXT = /\.(mjs|js|cjs|ts|tsx|json|html|css|yml|yaml|md|toml)$/;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) walk(full, out);
    else if (TEXT.test(entry)) out.push(full);
  }
  return out;
}

/* ---------- outward: the module must not reach up ---------- */
console.log(`\noutward — ${MODULE_NAME}/ must not reference anything above it`);

const OUTWARD_PATTERNS = [
  [/(?:from|require\()\s*['"]\.\.\/\.\.\//, 'imports from above the module root'],
  [/['"]\.\.\/\.\.\/[^'"]*['"]/, 'a path literal climbing above the module root'],
  [/\bprocess\.cwd\(\)/, 'process.cwd() — resolve from import.meta.url instead'],
  [/\/home\/|\/Users\/|[A-Z]:\\\\/, 'an absolute machine-specific path']
];

for (const file of walk(MODULE_DIR)) {
  if (file.endsWith('boundary-check.mjs')) continue;   // this file names the patterns
  const body = readFileSync(file, 'utf8');
  for (const [re, why] of OUTWARD_PATTERNS) {
    if (re.test(body)) bad(`${rel(file)} contains ${why}`);
  }
}

/* ---------- inward: nothing may depend on the module ---------- */
console.log(`inward — nothing outside ${MODULE_NAME}/ may depend on it`);

/* Documentation is supposed to reference the module; that is its job. Code and
   build configuration are not. */
const DOC_ONLY = /^(docs\/|README\.md$|MODULES?\.md$)/;

for (const file of walk(REPO_ROOT)) {
  const r = rel(file);
  if (r.startsWith(MODULE_NAME + path.sep) || r === MODULE_NAME) continue;
  const body = readFileSync(file, 'utf8');
  if (!body.includes(MODULE_NAME)) continue;
  if (DOC_ONLY.test(r)) continue;                      // prose pointing at us is fine
  if (r === '.gitignore') continue;                    // ignoring our caches is fine
  bad(`${r} references ${MODULE_NAME} — the repository must not depend on the module`);
}

/* ---------- the module must stay independently runnable ---------- */
console.log('self-sufficiency — the module must run without the repository root');

const pkgPath = path.join(MODULE_DIR, 'package.json');
if (!existsSync(pkgPath)) {
  bad('package.json is missing — the module has no manifest of its own');
} else {
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  if (pkg.name !== MODULE_NAME) bad(`package.json name is "${pkg.name}", expected "${MODULE_NAME}"`);
  if (!pkg.scripts?.test) bad('package.json declares no test script');
  const deps = {...(pkg.dependencies || {}), ...(pkg.devDependencies || {})};
  if (Object.keys(deps).length) {
    console.log(`  ! ${Object.keys(deps).length} dependency(ies) declared: ${Object.keys(deps).join(', ')}`);
    console.log('    Not a failure, but read the separate-release-cycle criterion in');
    console.log('    docs/MODULE_BOUNDARY.md — a supply chain is one of the triggers.');
  }
}

const rootPkgPath = path.join(REPO_ROOT, 'package.json');
if (existsSync(rootPkgPath)) {
  const rootPkg = JSON.parse(readFileSync(rootPkgPath, 'utf8'));
  const ws = JSON.stringify(rootPkg.workspaces || '');
  if (ws.includes(MODULE_NAME)) {
    console.log(`  ! root package.json lists ${MODULE_NAME} as a workspace.`);
    console.log('    Allowed, but it couples the module to the root toolchain and to a');
    console.log('    fork we do not own. See the note in passport-pantry/package.json.');
  }
}

console.log(fail
  ? `\n${fail} BOUNDARY VIOLATION(S) — see docs/MODULE_BOUNDARY.md`
  : '\nBoundary holds: no outward references, no inward dependencies, module runs standalone.');
process.exit(fail ? 1 : 0);
