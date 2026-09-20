#!/usr/bin/env node
/**
 * Resolve Passport Pantry's canonical ingredients against USDA FoodData
 * Central and rewrite the NUTR table in prototype.html with real,
 * traceable values.
 *
 *   node tools/fdc-resolve.mjs --key YOUR_KEY            # resolve and write
 *   node tools/fdc-resolve.mjs --key YOUR_KEY --verify   # report drift only
 *   node tools/fdc-resolve.mjs --key YOUR_KEY --only salt,flour
 *
 * A free key takes about a minute: https://fdc.nal.usda.gov/api-key-signup
 * FDC data is CC0 public domain. The API allows 1,000 requests an hour per
 * IP, so responses are cached under tools/.fdc-cache and re-runs are free.
 *
 * Why a build-time script rather than a call from the app: nutrient values
 * for "kosher salt" do not change, so fetching them per page view would
 * burn quota, add latency, and make the app fail when USDA is down. Resolve
 * once, commit the result, and the app ships a table it can cite.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const ROOT  = path.resolve(import.meta.dirname, '..');
const TARGET = path.join(ROOT, 'prototype.html');
const CACHE  = path.join(import.meta.dirname, '.fdc-cache');
const API    = 'https://api.nal.usda.gov/fdc/v1';

/* FDC nutrient numbers. Energy is the awkward one: Foundation foods often
   carry Atwater-derived energy (2047/2048) instead of, or alongside, the
   classic 1008. Take them in preference order. */
const N = {
  energy: ['1008', '2048', '2047'],
  protein: ['1003'],
  fat:     ['1004'],
  carb:    ['1005'],
  fibre:   ['1079']
};

/* Data types in preference order. Foundation is the most rigorous, SR
   Legacy the broadest. Survey (FNDDS) describes prepared dishes, useful
   for things like pastry. Branded is deliberately excluded: those values
   are one manufacturer's label, not a generic food, and would silently
   make the table about a product nobody in another country can buy. */
const TYPES = ['Foundation', 'SR Legacy', 'Survey (FNDDS)'];

/**
 * The map that matters. `q` is the search phrase, `must` are words that
 * have to appear in the chosen food's description, `not` rules out the
 * classic mismatches, and `type` narrows the data type where the generic
 * search picks badly. Everything here is a judgement about which USDA food
 * best represents the ingredient a cook actually buys — review it rather
 * than trusting it.
 */
const MAP = {
  flour:       {q:'wheat flour white all-purpose enriched bleached', not:['self-rising','cake','bread flour']},
  water:       {q:'water bottled generic'},
  salt:        {q:'salt table', not:['substitute']},
  pepper:      {q:'spices black pepper'},
  beef_grd:    {q:'ground beef 80% lean meat 20% fat raw'},
  pork_grd:    {q:'pork ground raw'},
  beef_loin:   {q:'beef loin top sirloin steak separable lean raw'},
  chicken_wh:  {q:'chicken whole raw meat and skin'},
  chicken_th:  {q:'chicken thigh meat and skin raw'},
  mackerel:    {q:'fish mackerel salted'},
  onion:       {q:'onions raw', not:['dehydrated','young green','welsh']},
  onion_red:   {q:'onions red raw', not:['dehydrated']},
  scallion:    {q:'onions spring or scallions including tops and bulb raw'},
  garlic:      {q:'garlic raw', not:['powder','salt']},
  ginger:      {q:'ginger root raw'},
  cilantro:    {q:'coriander leaves cilantro raw'},
  chives_g:    {q:'chives raw'},
  tomato:      {q:'tomatoes red ripe raw year round average'},
  pepper_bell: {q:'peppers sweet green raw'},
  thyme:       {q:'thyme fresh'},
  scotch:      {q:'peppers hot chili red raw'},
  donne:       {q:'peppers hot chili red raw'},
  chili_dry:   {q:'spices pepper red or cayenne'},
  basil_thai:  {q:'basil fresh'},
  limeleaf:    {q:'lime peel raw'},
  soy:         {q:'soy sauce made from soy and wheat shoyu', not:['low sodium','tamari']},
  shaoxing:    {q:'alcoholic beverage wine cooking'},
  vinegar_rw:  {q:'vinegar red wine'},
  sesame_oil:  {q:'oil sesame salad or cooking'},
  oil_veg:     {q:'oil vegetable canola industrial'},
  oil_olive:   {q:'oil olive salad or cooking'},
  fishsauce:   {q:'fish sauce ready to serve'},
  sugar_palm:  {q:'sugars granulated'},
  sugar_rock:  {q:'sugars granulated'},
  coconut_ck:  {q:'nuts coconut cream canned sweetened', not:['sweetened']},
  coconut_mk:  {q:'nuts coconut milk canned liquid expressed from grated meat and water'},
  coconut_fr:  {q:'nuts coconut meat raw'},
  peanut:      {q:'peanuts all types dry-roasted without salt'},
  paste_pnng:  {q:'curry paste', type:'Survey (FNDDS)'},
  paste_aji:   {q:'peppers hot chili red canned'},
  fenugreek:   {q:'spices fenugreek seed'},
  anise:       {q:'spices anise seed'},
  cinnamon:    {q:'spices cinnamon ground'},
  coriander_s: {q:'spices coriander seed'},
  allspice:    {q:'spices allspice ground'},
  turmeric:    {q:'spices turmeric ground'},
  ginger_g:    {q:'spices ginger ground'},
  saffron:     {q:'spices saffron'},
  preslemon:   {q:'lemon peel raw'},
  olive_grn:   {q:'olives pickled canned or bottled green'},
  lemon:       {q:'lemon juice raw'},
  noodle_rice: {q:'rice noodles dry'},
  rice_long:   {q:'rice white long-grain regular raw unenriched'},
  potato:      {q:'potatoes flesh and skin raw'},
  whitepep:    {q:'spices pepper white'},
  banana_grn:  {q:'plantains green raw'},
  sausage_pork:{q:'pork sausage link or patty raw'},
  sausage_chk: {q:'sausage chicken raw', type:'Survey (FNDDS)'},
  sausage_bf:  {q:'sausage beef raw', type:'Survey (FNDDS)'},
  lamb_grd:    {q:'lamb ground raw'},
  lamb_leg:    {q:'lamb leg whole separable lean and fat raw'},
  chicken_grd: {q:'chicken ground raw'},
  mushroom:    {q:'mushrooms white raw'},
  butter:      {q:'butter salted', not:['whipped','light']},
  ghee:        {q:'butter oil anhydrous ghee'},
  milk:        {q:'milk whole 3.25% milkfat', not:['chocolate','dry']},
  cheddar:     {q:'cheese cheddar', not:['low fat','nonfat']},
  egg:         {q:'egg whole raw fresh'},
  stock_beef:  {q:'soup beef broth or bouillon canned ready to serve'},
  stock_chx:   {q:'soup chicken broth canned ready to serve'},
  worcester:   {q:'sauce worcestershire'},
  vinegar_rc:  {q:'vinegar rice'},
  tomato_pst:  {q:'tomato products canned paste without salt added'},
  pastry_sh:   {q:'pie crust standard-type dry form', type:'Survey (FNDDS)'},
  pastry_pf:   {q:'puff pastry frozen ready to bake', type:'Survey (FNDDS)'},
  rice_bas:    {q:'rice white long-grain regular raw unenriched'},
  carrot:      {q:'carrots raw'},
  baharat:     {q:'spices curry powder'},
  loomi:       {q:'lime peel raw'},
  cardamom:    {q:'spices cardamom'},
  clove_sp:    {q:'spices cloves ground'},
  bay:         {q:'spices bay leaf'},
  almond:      {q:'nuts almonds', not:['oil','butter','milk','paste']},
  raisin:      {q:'raisins seedless', not:['golden']},
  potato_fl:   {q:'potatoes russet flesh and skin raw'}
};

/* Ingredients where the best available USDA food is a stand-in rather than
   the real thing. Recorded so the app can flag them instead of implying a
   precision the match does not have. */
const PROXY_NOTE = {
  scotch:     'USDA has no scotch bonnet; generic hot chilli used.',
  donne:      "USDA has no donne' sali; generic hot chilli used.",
  sugar_palm: 'USDA has no palm sugar; granulated sugar used. Real palm sugar is slightly lower in sucrose and carries trace minerals.',
  sugar_rock: 'Rock sugar treated as granulated sucrose.',
  limeleaf:   'No makrut lime leaf entry; lime peel used. Contributes negligible mass to a dish anyway.',
  loomi:      'No dried lime entry; lime peel used. Mostly not eaten.',
  preslemon:  'No preserved lemon entry; lemon peel used. Real preserved lemon is far higher in sodium.',
  baharat:    'No baharat entry; curry powder used as a mixed-spice proxy.',
  paste_pnng: 'Curry paste formulations vary enormously between brands and households.',
  paste_aji:  'No ají amarillo entry; canned hot chilli used.',
  rice_bas:   'Basmati treated as generic long-grain white rice.',
  shaoxing:   'Generic cooking wine used.',
  mackerel:   'Salted mackerel before desalting; boiling and soaking lower the sodium considerably.'
};

/* ------------------------------------------------------------------ */

const argv = process.argv.slice(2);
const arg = (name, def) => {
  const i = argv.indexOf('--' + name);
  return i === -1 ? def : (argv[i + 1] ?? true);
};
const KEY     = arg('key', process.env.FDC_API_KEY);
const VERIFY  = argv.includes('--verify');
const ONLY    = arg('only', null);
const PAGESIZE = 10;

if(!KEY){
  console.error('No API key. Pass --key KEY or set FDC_API_KEY.');
  console.error('Free signup: https://fdc.nal.usda.gov/api-key-signup');
  process.exit(2);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function cached(url){
  await mkdir(CACHE, {recursive:true});
  const file = path.join(CACHE, createHash('sha1').update(url).digest('hex') + '.json');
  if(existsSync(file)) return JSON.parse(await readFile(file, 'utf8'));
  let res, attempt = 0;
  while(true){
    res = await fetch(url);
    if(res.status === 429){                      // quota: back off and retry
      attempt++;
      if(attempt > 5) throw new Error('rate limited five times; try again later');
      const wait = 60_000 * attempt;
      console.error(`  rate limited, waiting ${wait / 1000}s`);
      await sleep(wait);
      continue;
    }
    break;
  }
  if(!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url.replace(KEY, 'KEY')}`);
  const json = await res.json();
  await writeFile(file, JSON.stringify(json));
  await sleep(250);                              // stay well inside 1000/hour
  return json;
}

/** Nutrient lookup that tolerates both the search and detail shapes. */
function nutrient(food, numbers){
  const rows = food.foodNutrients || [];
  for(const num of numbers){
    for(const r of rows){
      const n = String(r.nutrientNumber ?? r.nutrient?.number ?? '');
      if(n === num){
        const v = r.value ?? r.amount;
        if(typeof v === 'number') return v;
      }
    }
  }
  return null;
}

function scoreFood(food, spec){
  const d = (food.description || '').toLowerCase();
  if(spec.must && !spec.must.every(w => d.includes(w.toLowerCase()))) return -1;
  if(spec.not  &&  spec.not.some(w => d.includes(w.toLowerCase()))) return -1;
  let s = 100 - (TYPES.indexOf(food.dataType) * 20);
  if(TYPES.indexOf(food.dataType) === -1) return -1;     // Branded and friends
  s -= Math.min(30, d.length / 6);                       // prefer plainer names
  return s;
}

async function resolveOne(id, spec){
  const type = spec.type ? spec.type : TYPES.join(',');
  const url = `${API}/foods/search?query=${encodeURIComponent(spec.q)}`
            + `&dataType=${encodeURIComponent(type)}&pageSize=${PAGESIZE}&api_key=${KEY}`;
  const res = await cached(url);
  const ranked = (res.foods || [])
    .map(f => ({f, s:scoreFood(f, spec)}))
    .filter(x => x.s >= 0)
    .sort((a, b) => b.s - a.s);
  if(!ranked.length) return {id, error:'no acceptable match', tried:spec.q};

  const pick = ranked[0].f;
  // The search payload usually carries the nutrients already; fall back to
  // the detail endpoint when energy is missing.
  let food = pick;
  if(nutrient(food, N.energy) === null){
    food = await cached(`${API}/food/${pick.fdcId}?api_key=${KEY}`);
  }
  const k = nutrient(food, N.energy);
  const p = nutrient(food, N.protein);
  const c = nutrient(food, N.carb);
  const f = nutrient(food, N.fat);
  const fib = nutrient(food, N.fibre);
  if(k === null || p === null || c === null || f === null){
    return {id, error:'match found but missing core nutrients', fdc:pick.fdcId, desc:pick.description};
  }
  return {
    id, fdc:pick.fdcId, desc:pick.description, dataType:pick.dataType,
    k:round(k), p:round(p), c:round(c), f:round(f),
    fib:fib === null ? null : round(fib),
    alternatives:ranked.slice(1, 4).map(x => `${x.f.fdcId} ${x.f.description}`)
  };
}
const round = v => Math.round(v * 10) / 10;

/** Pull the current NUTR block out of the page so we can diff and rewrite. */
async function readCurrent(){
  const src = await readFile(TARGET, 'utf8');
  const start = src.indexOf('const NUTR = {');
  if(start === -1) throw new Error('NUTR table not found in prototype.html');
  const end = src.indexOf('\n};', start);
  if(end === -1) throw new Error('NUTR table not terminated');
  const block = src.slice(start, end + 3);
  const cur = {};
  for(const m of block.matchAll(/(\w+):\{k:([\d.]+),p:([\d.]+),c:([\d.]+),f:([\d.]+)/g)){
    cur[m[1]] = {k:+m[2], p:+m[3], c:+m[4], f:+m[5]};
  }
  return {src, start, end:end + 3, block, cur};
}

function renderBlock(rows){
  const keys = Object.keys(MAP);
  const width = Math.max(...keys.map(k => k.length));
  const lines = keys.map(id => {
    const r = rows[id];
    if(!r || r.error) return null;
    const parts = [`k:${r.k}`, `p:${r.p}`, `c:${r.c}`, `f:${r.f}`];
    if(r.fib !== null && r.fib !== undefined) parts.push(`fib:${r.fib}`);
    parts.push(`fdc:${r.fdc}`);
    return `  ${(id + ':').padEnd(width + 1)} {${parts.join(',')}},`
         + (PROXY_NOTE[id] ? `   // proxy: ${PROXY_NOTE[id]}` : '');
  }).filter(Boolean);
  return 'const NUTR = {\n'
       + '  /* Resolved from USDA FoodData Central (CC0) by tools/fdc-resolve.mjs\n'
       + `     on ${new Date().toISOString().slice(0, 10)}. Every row carries its FDC id;\n`
       + '     look one up at https://fdc.nal.usda.gov/food-details/<id>\n'
       + '     Rows marked "proxy" are the closest available USDA food, not the\n'
       + '     ingredient itself — the app flags these in the UI. */\n'
       + lines.join('\n') + '\n};';
}

/* ------------------------------------------------------------------ */

const ids = ONLY ? String(ONLY).split(',').map(s => s.trim()) : Object.keys(MAP);
const {src, start, end, cur} = await readCurrent();
const rows = {}, failures = [], drift = [];

console.log(`Resolving ${ids.length} ingredients against FoodData Central\n`);

for(const id of ids){
  const spec = MAP[id];
  if(!spec){ failures.push({id, error:'not in MAP'}); continue; }
  try{
    const r = await resolveOne(id, spec);
    rows[id] = r;
    if(r.error){
      failures.push(r);
      console.log(`  ✗ ${id.padEnd(13)} ${r.error}`);
      continue;
    }
    const was = cur[id];
    const dk = was ? Math.abs(r.k - was.k) / Math.max(was.k, 1) * 100 : 0;
    if(was && dk >= 20) drift.push({id, was:was.k, now:r.k, pct:Math.round(dk)});
    console.log(`  ✓ ${id.padEnd(13)} ${String(r.fdc).padEnd(8)} ${String(r.k).padStart(5)} kcal`
      + `  ${dk >= 20 ? `(was ${was.k}, ${Math.round(dk)}% off)` : ''}`
      + `  ${r.desc.slice(0, 52)}`);
  }catch(e){
    failures.push({id, error:e.message});
    console.log(`  ✗ ${id.padEnd(13)} ${e.message}`);
  }
}

console.log(`\nResolved ${Object.values(rows).filter(r => !r.error).length}/${ids.length}`);

if(drift.length){
  console.log(`\n${drift.length} value(s) more than 20% from the approximation — worth eyeballing:`);
  drift.sort((a, b) => b.pct - a.pct)
       .forEach(d => console.log(`  ${d.id.padEnd(13)} ${d.was} → ${d.now} kcal (${d.pct}%)`));
}

if(failures.length){
  console.log(`\n${failures.length} unresolved — decide these by hand rather than guessing:`);
  failures.forEach(f => console.log(`  ${f.id.padEnd(13)} ${f.error}${f.tried ? ` (query: "${f.tried}")` : ''}`));
}

const fibreCount = Object.values(rows).filter(r => !r.error && r.fib !== null).length;
console.log(`\nFibre available for ${fibreCount} ingredients — enough for net carbs where all of a recipe's ingredients have it.`);

if(VERIFY){
  console.log('\n--verify: nothing written.');
  process.exit(failures.length ? 1 : 0);
}
if(ONLY){
  console.log('\n--only: partial run, not rewriting the table. Drop --only to write.');
  process.exit(0);
}
if(failures.length){
  console.log('\nNot writing: resolve or hand-fill the failures first, then re-run.');
  console.log('Cached responses mean the re-run costs almost no quota.');
  process.exit(1);
}

await writeFile(TARGET, src.slice(0, start) + renderBlock(rows) + src.slice(end));
console.log(`\nWrote ${Object.keys(rows).length} rows into ${path.relative(ROOT, TARGET)}.`);
console.log('Every value now carries an FDC id, and the app will show itself as USDA-sourced.');
