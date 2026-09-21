#!/usr/bin/env node
/**
 * Passport Pantry — consistency suite.
 *
 *   node tools/consistency-check.mjs
 *
 * Exits 0 when every check passes, 1 otherwise. No dependencies, no network.
 *
 * The app is a single HTML file, so this script extracts the <script> body,
 * evaluates it with the DOM stubbed out, and asserts the invariants that data
 * edits are most likely to break. It is the only automated protection the
 * catalogue has, and it is deliberately blunt: it checks facts about the data,
 * not the rendering.
 *
 * What it cannot do: the allergen tags are hand-authored per ingredient. These
 * tests prove the LOGIC is sound across every allergen and every dish. Nothing
 * here can prove that a tag was not simply omitted. That remains a human
 * review task and is recorded as such in docs/FEATURE_GAPS.md.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TARGET = path.join(HERE, '..', 'prototype.html');

/* ---------- load the app with the DOM stubbed ---------- */
const html = readFileSync(TARGET, 'utf8');
const open = html.indexOf('<script>');
const close = html.lastIndexOf('</script>');
if (open === -1 || close === -1) {
  console.error('Could not find the script block in prototype.html');
  process.exit(2);
}
const src = html.slice(open + 8, close)
  .replace(/^render\(\);$/m, '')
  .replace(/^initCaps\(\);$/m, '')
  .replace(/document\.getElementById\('tabs'\)\.addEventListener[\s\S]*?\n\}\);/, '')
  .replace(/el\.addEventListener\([\s\S]*?\n\}\);/g, '');

const stubEl = {
  innerHTML: '', hidden: true, value: '', textContent: '',
  addEventListener() {}, querySelector: () => null, querySelectorAll: () => [],
  setAttribute() {}, getAttribute: () => null
};
globalThis.document = {
  getElementById: () => stubEl, querySelectorAll: () => [],
  documentElement: stubEl, addEventListener() {}
};
globalThis.window = { matchMedia: () => ({ matches: false, addEventListener() {} }) };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const m = new Function(src + `
  return {R, ING, NUTR, NUTR_PROXY, FLAGS, DIETS, SUBS, ALT, ALLERGEN, ALLERGENS,
          CANNOT_SUB, CRAFT, REGION_OF, REGION_NOTE, EATEN, EATEN_NOTE, COUNTRIES,
          PLATFORMS, LOCAL, SERVED, LOCALES, T, ING_L10N, SOURCE, NATIVE, OC_LABEL,
          TIERS, FLOOR, toGrams, flagsOf, ocOf, keepOf, sourcesFor, storesFor,
          nutritionOf, allergensOf, allergyCheck, safeAlts, dietCheck, cleanSubs,
          dishStatus, effectiveIngs, byId, state, ingName, bmr, computedTarget,
          targetOf, floorWarning, macroTargets, fitsToday};
`)();

let fail = 0;
const bad = msg => { console.log('  x ' + msg); fail++; };
const section = t => console.log('\n' + t);

/* ---------- registry integrity ---------- */
section('registry');
m.R.forEach(r => r.ings.forEach(i => {
  if (!m.ING[i.i]) bad(`${r.id}: unknown ingredient "${i.i}"`);
  else if (m.toGrams(i.i, i.q, i.u) === null) bad(`${r.id}: ${i.i} has no "${i.u}" conversion`);
  if (m.ING[i.i] && !m.NUTR[i.i]) bad(`${r.id}: ${i.i} has no nutrition row`);
}));
Object.keys(m.FLAGS).forEach(k => { if (!m.ING[k]) bad(`FLAGS key "${k}" not in registry`); });
Object.keys(m.NUTR).forEach(k => { if (!m.ING[k]) bad(`NUTR key "${k}" not in registry`); });
Object.keys(m.ALLERGEN).forEach(k => { if (!m.ING[k]) bad(`ALLERGEN key "${k}" not in registry`); });
Object.keys(m.SOURCE).forEach(k => { if (!m.ING[k]) bad(`SOURCE key "${k}" not in registry`); });
Object.keys(m.ING).forEach(k => { if (!m.NUTR[k]) bad(`${k}: in ING with no NUTR row`); });
Object.keys(m.ING_L10N).forEach(k => { if (!m.ING[k]) bad(`ING_L10N key "${k}" not in registry`); });
Object.keys(m.NUTR_PROXY).forEach(k => { if (!m.ING[k]) bad(`NUTR_PROXY key "${k}" not in registry`); });
Object.entries(m.SOURCE).forEach(([id, v]) => {
  if (v.oc && !m.OC_LABEL[v.oc]) bad(`SOURCE ${id} uses unlabelled channel "${v.oc}"`);
});

/* ---------- dish metadata ---------- */
section('dishes');
const ids = new Set();
m.R.forEach(r => {
  if (ids.has(r.id)) bad(`duplicate dish id "${r.id}"`); ids.add(r.id);
  if (!m.CRAFT[r.id]) bad(`${r.id}: no CRAFT entry`);
  else {
    if (!m.CRAFT[r.id].foundation) bad(`${r.id}: CRAFT has no foundation`);
    if ((m.CRAFT[r.id].layers || []).length < 3) bad(`${r.id}: fewer than three layers`);
  }
  if (!m.REGION_OF[r.country]) bad(`${r.id}: country "${r.country}" has no region`);
  else if (!m.REGION_NOTE[m.REGION_OF[r.country]]) bad(`${r.id}: region has no note`);
  if (!m.EATEN[r.id]) bad(`${r.id}: no EATEN entry (use {} for none)`);
  if (!r.blurb || !r.serves || !r.steps.length) bad(`${r.id}: incomplete metadata`);
});
Object.entries(m.EATEN).forEach(([id, map]) => {
  const r = m.byId(id);
  if (!r) return bad(`EATEN entry for unknown dish "${id}"`);
  Object.keys(map).forEach(ing => {
    if (!r.ings.find(i => i.i === ing)) bad(`${id}: EATEN names "${ing}", not in the recipe`);
  });
  if (Object.keys(map).length && !m.EATEN_NOTE[id]) bad(`${id}: yield correction with no explanation`);
});
Object.keys(m.CRAFT).forEach(id => { if (!m.byId(id)) bad(`CRAFT entry for unknown dish "${id}"`); });

/* ---------- diets ---------- */
section('diets');
Object.entries(m.SUBS).forEach(([from, opts]) => {
  if (!m.ING[from]) bad(`SUBS key "${from}" not in registry`);
  opts.forEach(o => { if (!m.ING[o.to]) bad(`SUBS ${from} -> unknown "${o.to}"`); });
});
Object.keys(m.DIETS).forEach(dk => {
  m.state.diet = dk;
  m.R.forEach(r => m.dietCheck(r).conflicts.forEach(c =>
    m.cleanSubs(c.ing.i).forEach(sb => {
      const v = m.flagsOf(sb.to).filter(f => m.DIETS[dk].avoid.includes(f));
      if (v.length) bad(`${dk}: ${r.id} offers ${sb.to}, still ${v.join('/')}`);
    })));
});
m.state.diet = 'halal';
if (!m.dietCheck(m.byId('khinkali')).conflicts.length) bad('halal: khinkali (pork) shows no conflict');
if (m.dietCheck(m.byId('kabsa')).conflicts.length) bad('halal: kabsa should have no conflicts');
if (m.dishStatus(m.byId('khinkali')) !== 'swap') bad('halal: khinkali should be rescuable');
m.state.diet = 'vegan';
if (!m.dietCheck(m.byId('nasi_lemak')).conflicts.length) bad('vegan: nasi lemak shows no conflict');
m.state.diet = 'none';

/* ---------- allergens ----------
   The invariant, stated the way the app's three buckets state it: an
   alternative may never CONTAIN the allergen being avoided. It may be
   label-dependent for it — a dairy-free spread that may carry milk traces is
   still the right advice — but only if the caution is attached to that
   specific button, never silently. Both halves are asserted. */
section('allergens');
Object.entries(m.ALT).forEach(([from, opts]) => {
  if (!m.ING[from]) bad(`ALT key "${from}" not in registry`);
  opts.forEach(o => { if (!m.ING[o.to]) bad(`ALT ${from} -> unknown "${o.to}"`); });
});
Object.keys(m.ALLERGENS).forEach(ak => {
  m.state.allergies = [ak];
  Object.keys(m.ALT).forEach(from => {
    const carries = m.allergensOf(from);
    if (![...carries.has, ...carries.check].includes(ak)) return;
    m.safeAlts(from).forEach(sb => {
      const t = m.allergensOf(sb.to);
      if (t.has.includes(ak)) bad(`${ak}: ${from} -> ${sb.to} contains ${ak}`);
      if (t.check.includes(ak) && !sb.caution.includes(ak))
        bad(`${ak}: ${from} -> ${sb.to} label-dependent for ${ak} with no caution shown`);
    });
  });
});
Object.keys(m.ALLERGENS).forEach(ak => {
  m.state.allergies = [ak];
  m.R.forEach(r => {
    const direct = m.effectiveIngs(r).some(i => {
      const a = m.allergensOf(i.i); return [...a.has, ...a.check].includes(ak);
    });
    const res = m.allergyCheck(r);
    if (direct && !(res.contains.length || res.check.length))
      bad(`${ak}: ${r.id} contains it and the panel is clear`);
  });
});
/* Label-dependent allergens must never leak into the "contains" bucket.
   Every allergen is selected at once so a single pass covers the catalogue. */
m.state.allergies = Object.keys(m.ALLERGENS);
m.R.forEach(r => {
  m.allergyCheck(r).contains.forEach(c => {
    const a = m.allergensOf(c.ing.i);
    c.which.forEach(w => {
      if (!a.has.includes(w)) bad(`${r.id}: "${w}" is label-dependent but sits in contains`);
    });
  });
});
m.state.allergies = [];
Object.entries(m.CANNOT_SUB).forEach(([id, map]) => {
  if (!m.byId(id)) bad(`CANNOT_SUB for unknown dish "${id}"`);
  Object.keys(map).forEach(k => { if (!m.ALLERGENS[k]) bad(`CANNOT_SUB ${id}: unknown allergen "${k}"`); });
});

/* ---------- nutrition ----------
   Atwater only bounds these rows from below. USDA carbohydrate includes fibre,
   so p*4 + c*4 + f*9 legitimately runs ABOVE the stated energy for anything
   fibrous — every spice in the table does this. It can only fall meaningfully
   BELOW when a macro is missing or mistyped, which is the bug worth catching.
   Alcohol and vinegar are excluded outright: ethanol and acetic acid carry
   energy that appears in none of the three macro columns. */
section('nutrition');
m.R.forEach(r => {
  const n = m.nutritionOf(r);
  if (!(n.k > 0)) bad(`${r.id}: zero or missing calories`);
  if (n.k > 1200) bad(`${r.id}: ${Math.round(n.k)} kcal per serving — check the yield correction`);
  if (n.missing) bad(`${r.id}: ${n.missing} ingredient(s) uncountable`);
});
const energyOutsideMacros = id =>
  m.flagsOf(id).some(f => f === 'alcohol' || f === 'alcohol_derived') || /^vinegar_/.test(id);
Object.keys(m.NUTR).forEach(k => {
  const v = m.NUTR[k];
  if (v.fdc !== undefined && !/^\d+$/.test(String(v.fdc))) bad(`${k}: malformed fdc id`);
  if ([v.k, v.p, v.c, v.f].some(x => typeof x !== 'number' || x < 0)) bad(`${k}: malformed macro row`);
  if (energyOutsideMacros(k)) return;
  const atwater = v.p * 4 + v.c * 4 + v.f * 9;
  if (v.k > 0 && atwater < v.k * 0.75)
    bad(`${k}: macros imply only ${Math.round(atwater)} kcal against a stated ${v.k}`);
});

/* ---------- daily budget ---------- */
section('budget');
const p1 = { mode: 'calc', sex: 'male', age: 40, height: 178, weight: 82, activity: 1.375, goal: 'maintain', framework: 'balanced' };
const expect = Math.round(10 * 82 + 6.25 * 178 - 5 * 40 + 5);
if (Math.round(m.bmr(p1)) !== expect) bad(`Mifflin-St Jeor: got ${Math.round(m.bmr(p1))}, expected ${expect}`);
const small = { ...p1, sex: 'female', weight: 45, height: 160, age: 30 };
if (m.floorWarning({ ...small, goal: 'gain' })) bad('safety floor fired on a deliberate surplus');
if (m.floorWarning({ ...small, goal: 'maintain' })) bad('safety floor fired on maintenance');
if (!m.floorWarning({ ...small, goal: 'lose', activity: 1.2 })) bad('safety floor did not fire on a deficit below the floor');

/* ---------- sourcing ---------- */
section('sourcing');
m.SERVED.forEach(cc => { if (!m.storesFor(cc).length) bad(`${cc}: served but has no stores`); });
Object.values(m.PLATFORMS).forEach(p => p.cc.forEach(cc => {
  if (!m.COUNTRIES[cc]) bad(`platform ${p.n} covers "${cc}", not a listed country`);
}));
Object.keys(m.LOCAL).forEach(cc => { if (!m.COUNTRIES[cc]) bad(`LOCAL has "${cc}", not a listed country`); });
[...Object.values(m.PLATFORMS), ...Object.values(m.LOCAL).flat()].forEach(s => {
  if (!s.for || !s.for.length) bad(`store "${s.n}" serves no category`);
  if (!m.TIERS[s.tier]) bad(`store "${s.n}" has unknown tier "${s.tier}"`);
});
const MAIL_ORDER = ['Amazon', 'noon', 'Salla merchants', 'Zid merchants'];
m.SERVED.forEach(cc => Object.keys(m.ING).forEach(id => {
  if (m.keepOf(id) !== 'fresh') return;
  m.sourcesFor(id, cc).list.forEach(x => {
    if (MAIL_ORDER.includes(x.store.n)) bad(`${cc}: fresh-only ${id} routed to mail order (${x.store.n})`);
  });
}));
m.R.forEach(r => {
  if (!Object.keys(m.COUNTRIES).some(cc => m.COUNTRIES[cc].n === r.country))
    bad(`${r.id}: country "${r.country}" is not in the market registry`);
});

/* ---------- language ---------- */
section('language');
const langs = Object.keys(m.LOCALES);
Object.entries(m.T).forEach(([k, row]) => langs.forEach(l => {
  if (!row[l]) bad(`T.${k} missing ${l}`);
}));
langs.forEach(l => {
  m.state.lang = l;
  Object.keys(m.ING).forEach(id => { if (!m.ingName(id)) bad(`${id}: no name in ${l}`); });
});
m.state.lang = 'en-US';
Object.entries(m.ING_L10N).forEach(([id, row]) => {
  langs.forEach(l => { if (!row[l]) bad(`ING_L10N ${id} missing ${l}`); });
});

/* The module boundary is deliberately NOT checked here. It is owned entirely
   by tools/boundary-check.mjs, which can see the whole repository — this file
   only ever loads the app and reasons about recipe data. Duplicating the
   patterns across both scripts is how two checks drift apart, and the first
   version of this file proved it by tripping its own pattern list.
   Run both with `npm run check`. */

/* ---------- privacy ----------
   Regression guard for SEC-1. Everything a viewer creates — pantry, cook log,
   diary, body profile — is personal and must be written under that viewer's
   own path. An earlier version wrote the pantry and cook log to shared
   top-level collections, so every viewer of a published page read and wrote
   the same ones. This asserts at the source level that no db access uses a
   literal path: every call must be prefixed with state.privBase. */
section('privacy');
const DB_CALL = /state\.db\.(?:collection|doc)\(\s*([^)]*?)\)/g;
for (const [whole, arg] of src.matchAll(DB_CALL)) {
  if (!arg.includes('state.privBase')) {
    bad(`db access not namespaced to the viewer: ${whole.trim()}`);
  }
}
if (!/const canPersist\s*=/.test(src)) {
  bad('canPersist() is missing — the UI cannot tell the viewer whether anything is saved');
}

/* ---------- provenance ----------
   Neither resolver has been run, so no row may carry an identifier. A
   fabricated FDC id or QID in a health context is worse than an admitted gap. */
section('provenance');
if (/fdc:\s*\d/.test(src)) bad('a committed NUTR row carries an FDC id — verify it was resolved, not invented');
if (/wd:\s*'Q\d/.test(src)) bad('a committed name carries a Wikidata QID — verify it was resolved, not invented');

const regions = new Set(m.R.map(r => m.REGION_OF[r.country]));
console.log(
  `\n${m.R.length} dishes · ${new Set(m.R.map(r => r.country)).size} countries · ${regions.size} regions`
  + ` · ${Object.keys(m.ING).length} ingredients · ${Object.keys(m.ALLERGENS).length} allergens`
  + ` · ${Object.keys(m.DIETS).length} diets · ${langs.length} locales`
  + ` · ${Object.keys(m.ING_L10N).length} localised ingredients · ${m.SERVED.length} served countries`);
console.log(fail ? `\n${fail} FAILURE(S)` : '\nAll checks passed');
process.exit(fail ? 1 : 0);
