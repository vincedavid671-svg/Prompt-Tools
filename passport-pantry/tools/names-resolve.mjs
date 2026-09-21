#!/usr/bin/env node
/**
 * Resolve ingredient names into many languages from Wikidata, and write
 * them into the ING_L10N table in prototype.html.
 *
 *   node tools/names-resolve.mjs --langs ar,es,fr
 *
 * Exit codes:
 *   0  wrote, everything resolved
 *   1  wrote, but some ingredients remain unresolved and keep their old names
 *   2  refused to write — nothing resolved, or failures outnumbered successes
 *      (--force overrides the second case, never the first),de,tr,id
 *   node tools/names-resolve.mjs --verify        # report, write nothing
 *   node tools/names-resolve.mjs --only cilantro,eggplant
 *
 * No API key. Wikidata asks for a descriptive User-Agent and reasonable
 * request rates; both are set below.
 *
 * WHY WIKIDATA AND NOT OPEN FOOD FACTS
 * Open Food Facts publishes an ingredients taxonomy with translations in
 * a great many languages and it is a better *food* dataset — but it is
 * licensed ODbL, which is share-alike for the database. Extracting a
 * substantial part into a commercial product carries an obligation to
 * license the derived database the same way. Wikidata is CC0: no
 * conditions, no share-alike, no attribution requirement. For something
 * intended to be sold, that difference matters more than the marginal
 * data quality, so Wikidata is the primary source here.
 *
 * If you decide the OFF taxonomy is worth the licence terms, its
 * ingredients file is the drop-in alternative and this script's shape
 * stays the same — only fetchLabels() changes.
 *
 * WHAT THIS DOES NOT SOLVE
 * Dictionary translation is not the same as the word a shopkeeper
 * recognises. Wikidata will tell you that coriander leaf is كزبرة خضراء;
 * it will not tell you that at Deserter's Bazaar in Tbilisi you ask for
 * ქინძი, or that the Thai market stall wants บัยมะกรูด rather than the
 * formal name. Those stay hand-curated in the `mkt` field, and this
 * script never overwrites them. That is the same split as the nutrition
 * resolver: the machine fills the bulk, a human fills the part that is
 * actually hard.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const ROOT   = path.resolve(import.meta.dirname, '..');
const TARGET = path.join(ROOT, 'prototype.html');
const CACHE  = path.join(import.meta.dirname, '.wd-cache');
const SEARCH = 'https://www.wikidata.org/w/api.php';
const SPARQL = 'https://query.wikidata.org/sparql';
const UA     = 'PassportPantry/0.1 (ingredient name resolution; contact: set-your-email-here)';

/**
 * The search phrase per ingredient, and `must`/`not` filters on the
 * matched item's description so we do not pick a band named Saffron or
 * a village named Basil. QIDs are deliberately NOT hardcoded: an invented
 * identifier is a fabricated citation, and the whole point of anchoring
 * to Wikidata is that the anchor can be checked.
 */
const MAP = {
  cilantro:   {q:'coriander',     must:['plant','herb','species']},
  eggplant:   {q:'eggplant',      must:['plant','species','vegetable']},
  scallion:   {q:'scallion',      must:['plant','species','vegetable']},
  pepper_bell:{q:'bell pepper',   must:['pepper','vegetable','cultivar']},
  onion:      {q:'onion',         must:['plant','species','vegetable']},
  garlic:     {q:'garlic',        must:['plant','species']},
  tomato:     {q:'tomato',        must:['plant','species','fruit','vegetable']},
  carrot:     {q:'carrot',        must:['plant','species','vegetable']},
  parsley:    {q:'parsley',       must:['plant','species','herb']},
  mint:       {q:'peppermint',    must:['plant','species','herb']},
  lemon:      {q:'lemon',         must:['fruit','species','citrus']},
  ginger:     {q:'ginger',        must:['plant','species','spice']},
  potato:     {q:'potato',        must:['plant','species','vegetable']},
  mushroom:   {q:'common mushroom', must:['fungus','species']},
  shallot:    {q:'shallot',       must:['plant','species','vegetable']},
  pineapple:  {q:'pineapple',     must:['plant','species','fruit']},
  lemongrass: {q:'lemongrass',    must:['plant','species','grass']},
  galangal:   {q:'galangal',      must:['plant','species','spice','rhizome']},
  tamarind:   {q:'tamarind',      must:['plant','species','tree','fruit']},
  turmeric:   {q:'turmeric',      must:['plant','species','spice']},
  cinnamon:   {q:'cinnamon',      must:['spice','bark','plant']},
  cardamom:   {q:'cardamom',      must:['spice','plant','species']},
  cumin:      {q:'cumin',         must:['plant','species','spice']},
  saffron:    {q:'saffron',       must:['spice'],  not:['song','album','film','band']},
  paprika:    {q:'paprika',       must:['spice','powder']},
  oregano:    {q:'oregano',       must:['plant','species','herb']},
  nutmeg:     {q:'nutmeg',        must:['spice','seed','plant']},
  clove_sp:   {q:'clove',         must:['spice','plant','bud']},
  bay:        {q:'bay leaf',      must:['leaf','spice','herb']},
  allspice:   {q:'allspice',      must:['spice','plant','species']},
  fenugreek:  {q:'fenugreek',     must:['plant','species','herb','spice']},
  salt:       {q:'table salt',    must:['salt','mineral','seasoning']},
  pepper:     {q:'black pepper',  must:['spice','plant','species']},
  flour:      {q:'wheat flour',   must:['flour','powder','food']},
  rice_long:  {q:'rice',          must:['cereal','grain','food','species']},
  pasta:      {q:'pasta',         must:['food','dish','noodle']},
  bulgur:     {q:'bulgur',        must:['food','cereal','wheat']},
  egg:        {q:'chicken egg',   must:['egg','food']},
  milk:       {q:'cow milk',      must:['milk','beverage','food']},
  butter:     {q:'butter',        must:['dairy','food','fat']},
  yogurt:     {q:'yogurt',        must:['dairy','food']},
  cream:      {q:'cream',         must:['dairy','food']},
  ghee:       {q:'ghee',          must:['butter','fat','food']},
  cheddar:    {q:'cheddar cheese',must:['cheese']},
  pecorino:   {q:'Pecorino Romano', must:['cheese']},
  tofu:       {q:'tofu',          must:['food','soy']},
  soy:        {q:'soy sauce',     must:['sauce','condiment','food']},
  fishsauce:  {q:'fish sauce',    must:['sauce','condiment','food']},
  vinegar_wh: {q:'vinegar',       must:['liquid','condiment','acid']},
  sesame_oil: {q:'sesame oil',    must:['oil','food']},
  oil_olive:  {q:'olive oil',     must:['oil','food']},
  sugar_wh:   {q:'sucrose',       must:['sugar','compound','sweetener']},
  peanut:     {q:'peanut',        must:['plant','species','legume','nut']},
  almond:     {q:'almond',        must:['nut','plant','species','seed']},
  cashew:     {q:'cashew',        must:['nut','plant','species','seed']},
  raisin:     {q:'raisin',        must:['dried','fruit','grape']},
  coconut_mk: {q:'coconut milk',  must:['milk','food','liquid']},
  gochujang:  {q:'gochujang',     must:['paste','condiment','sauce','food']},
  kimchi:     {q:'kimchi',        must:['food','dish','vegetable']},
  miso:       {q:'miso',          must:['paste','food','seasoning']},
  dashi:      {q:'dashi',         must:['broth','stock','soup','food']},
  mirin:      {q:'mirin',         must:['rice wine','condiment','seasoning']},
  chickpea:   {q:'chickpea',      must:['plant','species','legume']}
};

/* Names the script must never touch: culturally specific terms where a
   Wikidata label would be a formal translation rather than the word a
   market actually uses, and blends that differ by region. Curated by
   hand, in the app. */
const HAND_CURATED = [
  'limeleaf', 'baharat', 'loomi', 'berbere', 'donne', 'scotch',
  'gochugaru', 'methi', 'chili_kash', 'achiote', 'candlenut',
  'chili_guaj', 'chili_anch', 'paste_pnng', 'paste_aji', 'rice_bomba',
  'belacan', 'anchovy_dr', 'barberry', 'pandan', 'oil_dende', 'cheese_qrk',
  'jameed', 'doubanjiang', 'sorghum_lv', 'bread_flat', 'lingon', 'codsalt'
];

/* ------------------------------------------------------------------ */

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i === -1 ? d : (argv[i + 1] ?? true); };
const LANGS  = String(arg('langs', 'ar,es,fr')).split(',').map(s => s.trim()).filter(Boolean);
const VERIFY = argv.includes('--verify');
/* Escape hatch for a genuinely partial run: Wikidata really does lack labels
   for some items, and a human may want the rows that did resolve. It does not
   override the "nothing resolved" refusal — that is never legitimate. */
const FORCE  = argv.includes('--force');
const ONLY   = arg('only', null);

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function cached(url, accept){
  await mkdir(CACHE, {recursive:true});
  const f = path.join(CACHE, createHash('sha1').update(url).digest('hex') + '.json');
  if(existsSync(f)) return JSON.parse(await readFile(f, 'utf8'));
  const res = await fetch(url, {headers:{'User-Agent':UA, Accept:accept || 'application/json'}});
  if(!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const json = await res.json();
  await writeFile(f, JSON.stringify(json));
  await sleep(300);                                  // be a good citizen
  return json;
}

/** Find the best-matching Wikidata item for an ingredient. */
async function findItem(spec){
  const url = `${SEARCH}?action=wbsearchentities&format=json&language=en&uselang=en`
            + `&type=item&limit=12&origin=*&search=${encodeURIComponent(spec.q)}`;
  const res = await cached(url);
  const ranked = (res.search || [])
    .map(hit => {
      const d = (hit.description || '').toLowerCase();
      if(spec.not && spec.not.some(w => d.includes(w))) return null;
      // Prefer items whose description reads like a food, not a film.
      const score = (spec.must || []).reduce((n, w) => n + (d.includes(w) ? 10 : 0), 0);
      return {id:hit.id, label:hit.label, desc:hit.description || '', score};
    })
    .filter(x => x && x.score > 0)
    .sort((a, b) => b.score - a.score);
  return ranked[0] || null;
}

/** Pull labels for one item in the requested languages. */
async function fetchLabels(qid){
  const values = LANGS.map(l => `"${l}"`).join(' ');
  const query = `SELECT ?lang ?label WHERE {
    VALUES ?lang { ${values} }
    wd:${qid} rdfs:label ?label .
    FILTER(LANG(?label) = ?lang)
  }`;
  const url = `${SPARQL}?format=json&query=${encodeURIComponent(query)}`;
  const res = await cached(url, 'application/sparql-results+json');
  const out = {};
  (res.results?.bindings || []).forEach(b => { out[b.lang.value] = b.label.value; });
  return out;
}

/* ------------------------------------------------------------------ */

const src = await readFile(TARGET, 'utf8');
const i = src.indexOf('const ING = {'), j = src.indexOf('\n};', i);
const appIngredients = [...src.slice(i, j).matchAll(/^  (\w+):\s*\{n:/gm)].map(m => m[1]);

const ids = ONLY ? String(ONLY).split(',').map(s => s.trim()) : Object.keys(MAP);
const unknown = Object.keys(MAP).filter(id => !appIngredients.includes(id));
if(unknown.length){
  console.log(`Note: ${unknown.length} query(ies) match no app ingredient (harmless, but stale): ${unknown.join(', ')}\n`);
}

console.log(`Resolving ${ids.length} ingredient names into: ${LANGS.join(', ')}\n`);

const results = {}, failures = [], partial = [];
for(const id of ids){
  const spec = MAP[id];
  if(!spec){ failures.push({id, why:'not in MAP'}); continue; }
  try{
    const item = await findItem(spec);
    if(!item){ failures.push({id, why:'no acceptable Wikidata match', tried:spec.q}); console.log(`  ✗ ${id.padEnd(13)} no match for "${spec.q}"`); continue; }
    const labels = await fetchLabels(item.id);
    const missing = LANGS.filter(l => !labels[l]);
    results[id] = {qid:item.id, label:item.label, desc:item.desc, labels};
    if(missing.length) partial.push({id, missing});
    console.log(`  ✓ ${id.padEnd(13)} ${item.id.padEnd(10)} ${LANGS.map(l => labels[l] || '—').join(' · ')}`
      + `   (${item.desc.slice(0, 40)})`);
  }catch(e){
    failures.push({id, why:e.message});
    console.log(`  ✗ ${id.padEnd(13)} ${e.message}`);
  }
}

console.log(`\nResolved ${Object.keys(results).length}/${ids.length}`);
if(partial.length){
  console.log(`\n${partial.length} item(s) missing some languages — Wikidata simply has no label there:`);
  partial.forEach(p => console.log(`  ${p.id.padEnd(13)} missing ${p.missing.join(', ')}`));
  console.log('  These keep their existing name. A gap is better than a wrong word.');
}
if(failures.length){
  console.log(`\n${failures.length} unresolved — fix the query or hand-fill:`);
  failures.forEach(f => console.log(`  ${f.id.padEnd(13)} ${f.why}${f.tried ? ` ("${f.tried}")` : ''}`));
}

console.log(`\n${HAND_CURATED.length} ingredients are deliberately excluded and stay hand-curated:`);
console.log(`  ${HAND_CURATED.join(', ')}`);
console.log('  A dictionary label for these would be a formal translation, not the');
console.log('  word a market uses. Those are the ones worth a human.');

if(VERIFY){ console.log('\n--verify: nothing written.'); process.exit(failures.length ? 1 : 0); }

/* Merge into ING_L10N, never clobbering a curated value or an `mkt`. */
const ls = src.indexOf('const ING_L10N = {');
const le = src.indexOf('\n};', ls);
let block = src.slice(ls, le);
let added = 0, skipped = 0;
Object.entries(results).forEach(([id, r]) => {
  if(HAND_CURATED.includes(id)){ skipped++; return; }
  const row = new RegExp(`^  ${id}:\\s*\\{([^\\n]*)\\}`, 'm');
  const m = block.match(row);
  if(!m) return;
  let line = m[1];
  LANGS.forEach(l => {
    if(!r.labels[l]) return;
    const key = /^[a-z]{2}$/.test(l) ? l : `'${l}'`;
    const val = r.labels[l].replace(/'/g, "\\'");
    if(new RegExp(`(^|,)\\s*${l}:`).test(line) || line.includes(`'${l}':`)){
      line = line.replace(new RegExp(`((^|,)\\s*'?${l}'?:)'[^']*'`), `$1'${val}'`);
    }else{
      line += `,${key}:'${val}'`;
    }
  });
  line += `,wd:'${r.qid}'`;
  block = block.replace(row, `  ${id}:{${line}}`);
  added++;
});

/* ---------- refuse before writing ----------
   This block is BUG-1. An earlier version wrote unconditionally, then printed
   "Every row now carries its Wikidata QID" and exited 0 — even when all 63
   lookups had failed with 403 and nothing had been resolved. A caller, a CI
   job or an agent would have read that as success.

   fdc-resolve refuses on ANY failure because it rewrites a whole block and a
   missing row would be deleted. This script merges row by row and leaves
   unresolved ingredients at their curated values, so a partial run is
   legitimate. Two cases are not:

     - nothing resolved at all: never a real outcome, always a broken run
     - failures outnumber successes: the signature of a network or auth
       problem rather than of Wikidata genuinely lacking labels             */
const resolved = Object.keys(results).length;

if(resolved === 0){
  console.error('\nNothing resolved. Not writing.');
  console.error(failures.length
    ? `All ${failures.length} lookup(s) failed — check the network, the endpoint and any User-Agent policy before re-running.`
    : 'No ingredients were selected. Check --only.');
  process.exit(2);
}
if(failures.length > resolved && !FORCE){
  console.error(`\nNot writing: ${failures.length} failed against ${resolved} resolved.`);
  console.error('That ratio usually means the run is broken rather than that Wikidata');
  console.error('lacks the labels. Fix the cause and re-run — cached responses make');
  console.error('the re-run nearly free. Pass --force if the partial result is genuinely');
  console.error('what you want.');
  process.exit(2);
}

await writeFile(TARGET, src.slice(0, ls) + block + src.slice(le));

/* Say what was actually written. The old message asserted a state of the
   whole table; this one reports the run. */
console.log(`\nWrote ${added} row(s) into ${path.relative(ROOT, TARGET)}` +
            ` (${skipped} left to their curated values).`);
console.log(`Those ${added} now carry a Wikidata QID — check any of them at`);
console.log('https://www.wikidata.org/wiki/<QID>');

if(failures.length){
  console.log(`\n${failures.length} ingredient(s) remain unresolved and keep their existing names.`);
  console.log('Exiting 1 so a caller notices. The rows above were still written.');
  process.exit(1);
}
process.exit(0);
