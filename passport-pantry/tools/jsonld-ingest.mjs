#!/usr/bin/env node
/**
 * Ingest structured recipe data from schema.org/Recipe JSON-LD.
 *
 *   node tools/jsonld-ingest.mjs --url https://example.com/some-recipe
 *   node tools/jsonld-ingest.mjs --file urls.txt --out drafts/
 *   node tools/jsonld-ingest.mjs --selftest        # parser tests, no network
 *
 * WHY THIS SOURCE
 * Recipe sites publish schema.org markup deliberately, so that search
 * engines and assistants can read their recipes. It is the sanctioned
 * machine-readable channel, unlike scraping the rendered page.
 *
 * WHAT IT TAKES AND WHAT IT REFUSES TO TAKE
 * The rule from the project README, enforced here in code rather than
 * left to good intentions:
 *
 *   ingredients + quantities  -> imported          (uncopyrightable fact)
 *   method as STRUCTURE       -> reference only     (procedure is free,
 *                                                    the wording is not)
 *   headnote / description    -> never read
 *   photographs               -> never read
 *   author + source URL       -> always recorded
 *
 * Extracted steps are written into a `stepsForReference` field that the
 * app never reads. A human rewrites them. This is not a formality: the
 * prose is the copyrightable part, and an ingester that quietly copied it
 * would hand the project the exact liability the whole design avoids.
 *
 * IT DOES NOT WRITE INTO prototype.html
 * Output is a draft per recipe. A finished dish also needs a foundation,
 * its layers, a region, yield corrections and a method in our own words —
 * none of which come from markup. The machine does the parsing; a person
 * does the cooking and the writing.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const ROOT   = path.resolve(import.meta.dirname, '..');
const TARGET = path.join(ROOT, 'prototype.html');
const UA     = 'PassportPantry/0.1 (recipe structured-data ingest; contact: set-your-email-here)';

/* ---------- units ---------- */
const UNITS = {
  cup:'cup', cups:'cup', c:'cup',
  tablespoon:'tbsp', tablespoons:'tbsp', tbsp:'tbsp', tbs:'tbsp', tb:'tbsp', T:'tbsp',
  teaspoon:'tsp', teaspoons:'tsp', tsp:'tsp', ts:'tsp', t:'tsp',
  gram:'g', grams:'g', g:'g', gr:'g',
  kilogram:'kg', kilograms:'kg', kg:'kg',
  ounce:'oz', ounces:'oz', oz:'oz',
  pound:'lb', pounds:'lb', lb:'lb', lbs:'lb',
  milliliter:'ml', milliliters:'ml', millilitre:'ml', millilitres:'ml', ml:'ml',
  liter:'l', liters:'l', litre:'l', litres:'l', l:'l',
  clove:'clove', cloves:'clove',
  bunch:'bunch', bunches:'bunch',
  sprig:'bunch', sprigs:'bunch',
  pinch:'pinch', pinches:'pinch',
  piece:'piece', pieces:'piece', whole:'piece'
};
/* Conversions into the units the app actually stores. Imperial weight and
   volume have to become metric or nothing downstream works. */
const TO_APP = {
  oz:{unit:'g', factor:28.3495},
  lb:{unit:'g', factor:453.592},
  kg:{unit:'g', factor:1000},
  l: {unit:'ml', factor:1000}
};

const VULGAR = {'½':0.5,'⅓':1/3,'⅔':2/3,'¼':0.25,'¾':0.75,'⅛':0.125,'⅜':0.375,'⅝':0.625,'⅞':0.875,'⅕':0.2,'⅖':0.4,'⅗':0.6,'⅘':0.8,'⅙':1/6,'⅚':5/6};

/* Words that describe preparation or size rather than identity. Stripped
   before matching, because "finely chopped fresh flat-leaf parsley" and
   "parsley" are the same ingredient. */
const NOISE = new Set(`fresh freshly finely coarsely roughly thinly thickly chopped minced
diced sliced grated shredded crushed ground crumbled torn julienned cubed
large medium small extra big whole halved quartered peeled seeded stemmed
trimmed rinsed drained cooked uncooked raw dried packed loosely firmly
optional divided plus more for to taste garnish serving room temperature
good quality best any about approximately roughly heaped level generous
scant such as preferably ideally organic free range unsalted salted`.split(/\s+/));

/**
 * Recipe-site phrasing that maps onto a canonical ingredient but would not
 * match by tokens alone. Conservative by design: every entry here is a
 * judgement, and a wrong one silently corrupts allergens and nutrition.
 */
const ALIAS = {
  'soy sauce':'soy', 'light soy sauce':'soy', 'dark soy sauce':'soy', 'shoyu':'soy',
  'tamari':'tamari', 'coconut aminos':'coco_amino',
  'all purpose flour':'flour', 'plain flour':'flour', 'ap flour':'flour', 'white flour':'flour',
  'kosher salt':'salt', 'sea salt':'salt', 'table salt':'salt', 'fine salt':'salt',
  'black pepper':'pepper', 'peppercorns':'pepper', 'black peppercorns':'pepper',
  'white pepper':'whitepep',
  'olive oil':'oil_olive', 'extra virgin olive oil':'oil_olive',
  'vegetable oil':'oil_veg', 'neutral oil':'oil_veg', 'canola oil':'oil_veg', 'sunflower oil':'oil_veg',
  'sesame oil':'sesame_oil', 'toasted sesame oil':'sesame_oil',
  'fish sauce':'fishsauce', 'nam pla':'fishsauce', 'nuoc mam':'fishsauce',
  'coconut milk':'coconut_mk', 'coconut cream':'coconut_ck',
  'spring onion':'scallion', 'spring onions':'scallion', 'green onion':'scallion',
  'green onions':'scallion', 'scallion':'scallion', 'scallions':'scallion',
  'cilantro':'cilantro', 'coriander leaves':'cilantro', 'fresh coriander':'cilantro',
  'coriander seed':'coriander_s', 'ground coriander':'coriander_s',
  'aubergine':'eggplant', 'eggplant':'eggplant',
  'courgette':null, 'zucchini':null,
  'bell pepper':'pepper_bell', 'red bell pepper':'pepper_bell', 'capsicum':'pepper_bell',
  'yellow onion':'onion', 'brown onion':'onion', 'white onion':'onion', 'onion':'onion',
  'red onion':'onion_red', 'shallot':'shallot', 'shallots':'shallot',
  'garlic':'garlic', 'garlic cloves':'garlic', 'cloves garlic':'garlic',
  'ginger':'ginger', 'fresh ginger':'ginger', 'ginger root':'ginger',
  'ground ginger':'ginger_g',
  'chicken thighs':'chicken_th', 'chicken thigh':'chicken_th',
  'bone in chicken thighs':'chicken_th', 'boneless chicken thighs':'chicken_th',
  'whole chicken':'chicken_wh', 'chicken':'chicken_th',
  'ground beef':'beef_grd', 'beef mince':'beef_grd', 'minced beef':'beef_grd',
  'ground pork':'pork_grd', 'pork mince':'pork_grd', 'minced pork':'pork_grd',
  'ground lamb':'lamb_grd', 'lamb mince':'lamb_grd',
  'pork belly':'pork_belly', 'pork shoulder':'pork_sh', 'pork butt':'pork_sh',
  'beef chuck':'beef_chuck', 'chuck steak':'beef_chuck', 'stewing beef':'beef_chuck',
  'heavy cream':'cream', 'double cream':'cream', 'whipping cream':'cream',
  'whole milk':'milk', 'milk':'milk',
  'plain yogurt':'yogurt', 'natural yoghurt':'yogurt', 'greek yogurt':'yogurt', 'yogurt':'yogurt',
  'unsalted butter':'butter', 'butter':'butter', 'ghee':'ghee',
  'eggs':'egg', 'egg':'egg', 'large eggs':'egg',
  'parmesan':'pecorino', 'pecorino romano':'pecorino', 'pecorino':'pecorino',
  'cheddar':'cheddar', 'sharp cheddar':'cheddar', 'mature cheddar':'cheddar',
  'basmati rice':'rice_bas', 'long grain rice':'rice_long', 'jasmine rice':'rice_long',
  'short grain rice':'rice_short', 'sushi rice':'rice_short',
  'rice noodles':'noodle_rice', 'flat rice noodles':'noodle_rice',
  'tomato paste':'tomato_pst', 'tomato puree':'tomato_pst', 'tomato purée':'tomato_pst',
  'tomatoes':'tomato', 'tomato':'tomato', 'plum tomatoes':'tomato',
  'potatoes':'potato', 'potato':'potato', 'russet potatoes':'potato_fl', 'floury potatoes':'potato_fl',
  'carrots':'carrot', 'carrot':'carrot',
  'lemon juice':'lemon', 'lemon':'lemon', 'lemons':'lemon',
  'flat leaf parsley':'parsley', 'italian parsley':'parsley', 'parsley':'parsley',
  'mint':'mint', 'fresh mint':'mint',
  'thyme':'thyme', 'fresh thyme':'thyme',
  'bay leaves':'bay', 'bay leaf':'bay',
  'cinnamon stick':'cinnamon', 'cinnamon sticks':'cinnamon', 'ground cinnamon':'cinnamon',
  'star anise':'anise', 'cardamom pods':'cardamom', 'green cardamom':'cardamom',
  'whole cloves':'clove_sp', 'cloves':'clove_sp',
  'turmeric':'turmeric', 'ground turmeric':'turmeric',
  'cumin':'cumin', 'cumin seeds':'cumin', 'ground cumin':'cumin',
  'paprika':'paprika', 'sweet paprika':'paprika', 'smoked paprika':'paprika',
  'saffron':'saffron', 'saffron threads':'saffron',
  'nutmeg':'nutmeg', 'oregano':'oregano', 'dried oregano':'oregano',
  'allspice':'allspice', 'pimento':'allspice',
  'garam masala':'garam', 'kashmiri chilli powder':'chili_kash', 'kashmiri chili powder':'chili_kash',
  'kasuri methi':'methi', 'dried fenugreek leaves':'methi',
  'gochujang':'gochujang', 'gochugaru':'gochugaru', 'korean chilli flakes':'gochugaru',
  'kimchi':'kimchi', 'dashi':'dashi', 'mirin':'mirin', 'sake':'sake',
  'shaoxing wine':'shaoxing', 'shaoxing rice wine':'shaoxing',
  'rice vinegar':'vinegar_rc', 'white vinegar':'vinegar_wh', 'distilled vinegar':'vinegar_wh',
  'red wine vinegar':'vinegar_rw', 'red wine':'wine_red',
  'worcestershire sauce':'worcester', 'worcestershire':'worcester',
  'sugar':'sugar_wh', 'white sugar':'sugar_wh', 'granulated sugar':'sugar_wh',
  'caster sugar':'sugar_wh', 'palm sugar':'sugar_palm', 'rock sugar':'sugar_rock',
  'peanuts':'peanut', 'roasted peanuts':'peanut',
  'almonds':'almond', 'flaked almonds':'almond', 'slivered almonds':'almond',
  'cashews':'cashew', 'cashew nuts':'cashew',
  'raisins':'raisin', 'sultanas':'raisin',
  'green olives':'olive_grn', 'olives':'olive_grn',
  'preserved lemon':'preslemon', 'preserved lemons':'preslemon',
  'lemongrass':'lemongrass', 'galangal':'galangal', 'tamarind paste':'tamarind',
  'tamarind':'tamarind', 'candlenuts':'candlenut',
  'kaffir lime leaves':'limeleaf', 'makrut lime leaves':'limeleaf', 'lime leaves':'limeleaf',
  'thai basil':'basil_thai', 'holy basil':'basil_thai',
  'dried red chillies':'chili_dry', 'dried red chilies':'chili_dry', 'dried chillies':'chili_dry',
  'scotch bonnet':'scotch', 'scotch bonnet pepper':'scotch',
  'guajillo chiles':'chili_guaj', 'guajillo chillies':'chili_guaj',
  'ancho chiles':'chili_anch', 'ancho chillies':'chili_anch',
  'achiote paste':'achiote', 'annatto paste':'achiote',
  'corn tortillas':'tortilla', 'tortillas':'tortilla',
  'pineapple':'pineapple', 'firm tofu':'tofu', 'tofu':'tofu',
  'chicken stock':'stock_chx', 'chicken broth':'stock_chx',
  'beef stock':'stock_beef', 'beef broth':'stock_beef',
  'bulgur':'bulgur', 'fine bulgur':'bulgur',
  'mushrooms':'mushroom', 'button mushrooms':'mushroom',
  'green beans':'bean_green', 'butter beans':'bean_butter', 'lima beans':'bean_butter',
  'rosemary':'rosemary', 'berbere':'berbere', 'baharat':'baharat',
  'dried lime':'loomi', 'black lime':'loomi', 'loomi':'loomi',
  'blue fenugreek':'fenugreek', 'utskho suneli':'fenugreek',
  'puff pastry':'pastry_pf', 'shortcrust pastry':'pastry_sh', 'pie crust':'pastry_sh',
  'pasta':'pasta', 'spaghetti':'pasta', 'tonnarelli':'pasta', 'bucatini':'pasta',
  'salted mackerel':'mackerel', 'green bananas':'banana_grn', 'plantains':'banana_grn',
  'garlic chives':'chives_g', 'chinese chives':'chives_g',
  'curry paste':'paste_pnng', 'panang curry paste':'paste_pnng', 'phanaeng curry paste':'paste_pnng',
  'aji amarillo paste':'paste_aji', 'ají amarillo paste':'paste_aji',
  'rabbit':'rabbit', 'bomba rice':'rice_bomba', 'paella rice':'rice_bomba'
};

/* ---------- parsing ---------- */

/** "1 1/2", "1½", "½", "2.5", "2-3" -> a number, or null. */
function parseQty(str){
  if(!str) return null;
  let s = str.trim();
  // a range takes its lower bound: under-buying is recoverable, over is waste
  const range = s.match(/^([\d.\/\s½⅓⅔¼¾⅛⅜⅝⅞⅕⅖⅗⅘⅙⅚]+)\s*(?:-|–|to)\s*[\d.\/\s]+/);
  if(range) s = range[1].trim();
  let total = 0, found = false;
  for(const ch of s){ if(VULGAR[ch]){ total += VULGAR[ch]; found = true; } }
  s = s.replace(/[½⅓⅔¼¾⅛⅜⅝⅞⅕⅖⅗⅘⅙⅚]/g, ' ').trim();
  const frac = s.match(/(\d+)\s*\/\s*(\d+)/);
  if(frac){ total += Number(frac[1]) / Number(frac[2]); found = true; s = s.replace(frac[0], ' ').trim(); }
  const whole = s.match(/\d+(?:\.\d+)?/);
  if(whole){ total += Number(whole[0]); found = true; }
  return found ? Math.round(total * 1000) / 1000 : null;
}

function normalise(text){
  return text.toLowerCase()
    .replace(/\([^)]*\)/g, ' ')                       // parentheticals are asides
    .replace(/,.*$/, ' ')                             // "onion, finely chopped"
    .replace(/[^a-zÀ-ɏ\s-]/g, ' ')
    .split(/\s+/).filter(w => w && !NOISE.has(w))
    .join(' ').trim();
}

/** "2 tbsp soy sauce" -> {qty, unit, text} */
function parseIngredient(raw){
  let s = String(raw).replace(/\s+/g, ' ').trim();
  const qty = parseQty(s);
  // strip the leading quantity so the unit is the next token
  s = s.replace(/^[\d.\/\s½⅓⅔¼¾⅛⅜⅝⅞⅕⅖⅗⅘⅙⅚]+(?:-|–|to)?\s*[\d.\/\s½⅓⅔¼¾⅛⅜⅝⅞]*/, '').trim();
  let unit = null;
  const first = s.split(/\s+/)[0] || '';
  const key = first.replace(/[^A-Za-z]/g, '');
  const lower = key.toLowerCase();
  if(UNITS[key] || UNITS[lower]){
    unit = UNITS[key] || UNITS[lower];
    s = s.slice(first.length).trim();
    if(/^(of|de|di)\b/i.test(s)) s = s.replace(/^\w+\s*/, '');
  }
  return {qty, unit, text:normalise(s), rawText:s.trim()};
}

/** Convert into a unit the app stores, where a conversion exists. */
function toAppUnit(qty, unit){
  if(qty === null || !unit) return {qty, unit};
  const c = TO_APP[unit];
  if(!c) return {qty, unit};
  return {qty:Math.round(qty * c.factor * 100) / 100, unit:c.unit};
}

/**
 * Map parsed text onto a canonical ingredient id.
 *
 * Conservative on purpose. A wrong mapping is not a cosmetic error: the
 * allergen engine and the nutrition table both key off the id, so mapping
 * "tamari" onto `soy` would tell a coeliac that a wheat-free sauce
 * contains wheat, or worse, the reverse. Anything short of certain is
 * reported for a human instead of guessed.
 */
function matchIngredient(text, registry){
  if(!text) return {id:null, confidence:'none'};
  if(Object.prototype.hasOwnProperty.call(ALIAS, text)){
    const id = ALIAS[text];
    return id ? {id, confidence:'high', via:'alias'} : {id:null, confidence:'none', via:'alias-null'};
  }
  const exact = registry.find(r => r.name === text);
  if(exact) return {id:exact.id, confidence:'high', via:'name'};

  const tokens = new Set(text.split(' '));
  const scored = registry.map(r => {
    const rt = new Set(r.name.split(' '));
    let hit = 0; tokens.forEach(t => { if(rt.has(t)) hit++; });
    return {r, score:hit / Math.max(rt.size, tokens.size)};
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score);

  if(!scored.length) return {id:null, confidence:'none'};
  // A clear winner is still only a suggestion for a person to confirm.
  if(scored[0].score >= 0.85 && (!scored[1] || scored[1].score < scored[0].score - 0.2)){
    return {id:scored[0].r.id, confidence:'medium', via:'tokens',
            alternatives:scored.slice(1, 3).map(x => x.r.id)};
  }
  return {id:null, confidence:'none',
          candidates:scored.slice(0, 4).map(x => `${x.r.id} (${Math.round(x.score * 100)}%)`)};
}

/* ---------- JSON-LD extraction ---------- */

/**
 * Walk a JSON-LD document for Recipe nodes.
 *
 * `seen` is not an optimisation. Without it the walker descends into
 * `@graph` explicitly and then reaches it again through Object.values,
 * returning every recipe twice — and `@graph` is what WordPress and Yoast
 * emit, so that is most recipe sites rather than an edge case.
 */
function collectRecipes(node, out = [], seen = new Set()){
  if(!node || typeof node !== 'object') return out;
  if(seen.has(node)) return out;
  seen.add(node);
  if(Array.isArray(node)){ node.forEach(n => collectRecipes(n, out, seen)); return out; }
  const type = node['@type'];
  const types = Array.isArray(type) ? type : [type];
  if(types.includes('Recipe') && !out.includes(node)) out.push(node);
  Object.values(node).forEach(v => { if(v && typeof v === 'object') collectRecipes(v, out, seen); });
  return out;
}

function extractJsonLd(html){
  const out = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while((m = re.exec(html))){
    try{ collectRecipes(JSON.parse(m[1].trim()), out); }
    catch{ /* a malformed block is not worth failing the whole page over */ }
  }
  return out;
}

const asText = v => {
  if(!v) return null;
  if(typeof v === 'string') return v;
  if(Array.isArray(v)) return v.map(asText).filter(Boolean).join(', ');
  if(typeof v === 'object') return v.name || v['@id'] || null;
  return null;
};
function flattenInstructions(v, out = []){
  if(!v) return out;
  if(typeof v === 'string'){ out.push(v); return out; }
  if(Array.isArray(v)){ v.forEach(x => flattenInstructions(x, out)); return out; }
  if(typeof v === 'object'){
    if(v.itemListElement) return flattenInstructions(v.itemListElement, out);
    if(v.text) out.push(v.text);
    else if(v.name) out.push(v.name);
  }
  return out;
}

/* ---------- robots.txt ---------- */

const robotsCache = new Map();
async function allowedByRobots(url){
  const u = new URL(url);
  const origin = u.origin;
  if(!robotsCache.has(origin)){
    let rules = [];
    try{
      const res = await fetch(origin + '/robots.txt', {headers:{'User-Agent':UA}});
      if(res.ok){
        const txt = await res.text();
        let applies = false;
        txt.split('\n').forEach(line => {
          const l = line.split('#')[0].trim();
          const [k, ...rest] = l.split(':');
          const key = (k || '').trim().toLowerCase();
          const val = rest.join(':').trim();
          if(key === 'user-agent') applies = (val === '*');
          else if(applies && key === 'disallow' && val) rules.push(val);
        });
      }
    }catch{ /* unreachable robots.txt is treated as no rules, per convention */ }
    robotsCache.set(origin, rules);
  }
  const rules = robotsCache.get(origin);
  return !rules.some(r => u.pathname.startsWith(r));
}

/* ---------- registry from the app ---------- */

async function loadRegistry(){
  const src = await readFile(TARGET, 'utf8');
  const i = src.indexOf('const ING = {'), j = src.indexOf('\n};', i);
  return [...src.slice(i, j).matchAll(/^  (\w+):\s*\{n:'([^']+)'/gm)]
    .map(m => ({id:m[1], name:normalise(m[2])}));
}

/* ---------- one recipe ---------- */

async function ingest(url, registry){
  if(!await allowedByRobots(url)) throw new Error('disallowed by robots.txt');
  const res = await fetch(url, {headers:{'User-Agent':UA, Accept:'text/html'}});
  if(!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const recipes = extractJsonLd(await res.text());
  if(!recipes.length) throw new Error('no schema.org/Recipe markup on the page');
  const r = recipes[0];

  const ingredients = (r.recipeIngredient || r.ingredients || []).map(raw => {
    const p = parseIngredient(raw);
    const conv = toAppUnit(p.qty, p.unit);
    const m = matchIngredient(p.text, registry);
    return {raw, qty:conv.qty, unit:conv.unit, text:p.text, ...m};
  });

  return {
    source:{
      url,
      author: asText(r.author),
      publisher: asText(r.publisher),
      datePublished: r.datePublished || null,
      license: r.license || r.isBasedOn || null,
      fetchedAt: new Date().toISOString()
    },
    dish:{
      name: asText(r.name),
      yield: asText(r.recipeYield),
      totalTime: r.totalTime || null,
      cuisine: asText(r.recipeCuisine)
    },
    ingredients,
    stepsForReference: flattenInstructions(r.recipeInstructions),
    _notice:
      'stepsForReference holds the ORIGINAL wording and must not be copied into ' +
      'the app. The procedure it describes is free to follow and re-describe; the ' +
      'sentences are the author\'s. Rewrite them, credit the source, and delete ' +
      'this field from the draft once you have.',
    _stillNeeded:[
      'method rewritten in our own words',
      'foundation and layers written',
      'region and country assigned',
      'yield corrections where bones, peel or frying oil are not eaten',
      'allergen review for any ingredient new to the registry',
      'someone cooking it before the untested label comes off'
    ]
  };
}

/* ---------- self test ---------- */

function selftest(){
  let fail = 0; const bad = m => { console.log('  ✗ ' + m); fail++; };
  const reg = [
    {id:'soy', name:'light soy sauce'}, {id:'tamari', name:'tamari wheat-free soy sauce'},
    {id:'flour', name:'all-purpose flour'}, {id:'onion', name:'yellow onion'},
    {id:'garlic', name:'garlic'}, {id:'chicken_th', name:'chicken thighs bone-in'},
    {id:'gochujang', name:'gochujang'}, {id:'salt', name:'kosher salt'}
  ];

  console.log('Quantity parsing:');
  [['2',2],['1/2',0.5],['1 1/2',1.5],['½',0.5],['1½',1.5],['2.5',2.5],['2-3',2],['¾',0.75],
   ['a pinch',null]].forEach(([inp, want]) => {
    const got = parseQty(inp);
    if(got !== want && !(want !== null && Math.abs(got - want) < 0.001)) bad(`"${inp}" -> ${got}, expected ${want}`);
  });
  console.log('  9 forms including vulgar fractions, mixed numbers and ranges');

  console.log('\nLine parsing:');
  const cases = [
    ['2 tablespoons soy sauce',            {qty:2, unit:'tbsp', text:'soy sauce'}],
    ['1 1/2 cups all-purpose flour',       {qty:1.5, unit:'cup', text:'all-purpose flour'}],
    ['3 cloves garlic, finely minced',     {qty:3, unit:'clove', text:'garlic'}],
    ['½ tsp kosher salt',                  {qty:0.5, unit:'tsp', text:'kosher salt'}],
    ['1 large yellow onion, thinly sliced',{qty:1, unit:null, text:'yellow onion'}],
    ['8 oz chicken thighs',                {qty:226.8, unit:'g', text:'chicken thighs'}],
    ['1 lb pork shoulder',                 {qty:453.59, unit:'g', text:'pork shoulder'}]
  ];
  cases.forEach(([raw, want]) => {
    const p = parseIngredient(raw);
    const c = toAppUnit(p.qty, p.unit);
    if(c.qty !== want.qty) bad(`"${raw}" qty ${c.qty} expected ${want.qty}`);
    if(c.unit !== want.unit) bad(`"${raw}" unit ${c.unit} expected ${want.unit}`);
    if(p.text !== want.text) bad(`"${raw}" text "${p.text}" expected "${want.text}"`);
  });
  console.log('  ' + cases.length + ' lines, including ounce and pound conversion to grams');

  console.log('\nMatching — the safety-critical part:');
  // tamari must never collapse into soy: one contains wheat, one does not
  const t = matchIngredient('tamari', reg);
  if(t.id !== 'tamari') bad(`tamari matched ${t.id}, must be tamari — soy sauce contains wheat, tamari does not`);
  const s = matchIngredient('soy sauce', reg);
  if(s.id !== 'soy') bad(`soy sauce matched ${s.id}`);
  console.log('  ✓ tamari and soy sauce stay distinct (wheat-bearing vs not)');

  const junk = matchIngredient('dragonfruit powder', reg);
  if(junk.id !== null) bad(`unknown ingredient matched ${junk.id} instead of being reported`);
  if(junk.confidence !== 'none') bad('unknown ingredient did not report low confidence');
  console.log('  ✓ unknown ingredients return null rather than a nearest guess');

  const amb = matchIngredient('sauce', reg);
  if(amb.confidence === 'high') bad('an ambiguous word was matched with high confidence');
  console.log('  ✓ ambiguous text never reaches high confidence');

  console.log('\nJSON-LD extraction:');
  const html = `<html><head>
    <script type="application/ld+json">
    {"@context":"https://schema.org","@graph":[
      {"@type":"WebPage","name":"ignore me"},
      {"@type":"Recipe","name":"Test Dish","author":{"@type":"Person","name":"A Cook"},
       "recipeYield":"4 servings","recipeCuisine":"Test",
       "recipeIngredient":["2 tablespoons soy sauce","3 cloves garlic"],
       "recipeInstructions":[{"@type":"HowToStep","text":"Do the first thing."},
                             {"@type":"HowToStep","text":"Then the second."}],
       "description":"A headnote that must never be read."}]}
    </script></head><body></body></html>`;
  const found = extractJsonLd(html);
  if(found.length !== 1) bad(`expected 1 recipe in @graph, got ${found.length}`);
  if(found[0] && found[0].name !== 'Test Dish') bad('wrong node picked out of @graph');
  const steps = flattenInstructions(found[0].recipeInstructions);
  if(steps.length !== 2) bad(`expected 2 steps, got ${steps.length}`);
  console.log('  ✓ finds Recipe inside @graph, flattens HowToStep instructions');

  // the description must never appear in anything we emit
  const emitted = JSON.stringify({
    ingredients:(found[0].recipeIngredient || []).map(parseIngredient),
    stepsForReference:steps
  });
  if(emitted.includes('headnote')) bad('the description leaked into the output');
  console.log('  ✓ description and images are never read into the draft');

  console.log(fail ? `\n${fail} FAILURES` : '\nParser tests passed');
  process.exit(fail ? 1 : 0);
}

/* ---------- main ---------- */

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i === -1 ? d : (argv[i + 1] ?? true); };
if(argv.includes('--selftest')) selftest();

const OUT  = String(arg('out', path.join(import.meta.dirname, 'drafts')));
const URL_ = arg('url', null);
const FILE = arg('file', null);
if(!URL_ && !FILE){
  console.error('Give --url <url>, --file <list.txt>, or --selftest.');
  process.exit(2);
}

const urls = URL_ ? [String(URL_)]
  : (await readFile(String(FILE), 'utf8')).split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));

const registry = await loadRegistry();
console.log(`Registry: ${registry.length} canonical ingredients`);
console.log(`Ingesting ${urls.length} URL(s)\n`);
await mkdir(OUT, {recursive:true});

let ok = 0;
const needsHuman = [];
for(const url of urls){
  try{
    const draft = await ingest(url, registry);
    const slug = (draft.dish.name || 'recipe').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
    const file = path.join(OUT, `${slug}.json`);
    await writeFile(file, JSON.stringify(draft, null, 2));

    const high = draft.ingredients.filter(i => i.confidence === 'high').length;
    const med  = draft.ingredients.filter(i => i.confidence === 'medium');
    const none = draft.ingredients.filter(i => i.confidence === 'none');
    ok++;
    console.log(`  ✓ ${(draft.dish.name || slug).slice(0, 44).padEnd(46)} ${high} mapped, ${med.length} to confirm, ${none.length} unknown`);
    if(med.length || none.length) needsHuman.push({slug, med, none});
    await new Promise(r => setTimeout(r, 1000));          // one request a second
  }catch(e){
    console.log(`  ✗ ${url.slice(0, 60).padEnd(62)} ${e.message}`);
  }
}

console.log(`\n${ok}/${urls.length} ingested into ${path.relative(ROOT, OUT)}/`);

if(needsHuman.length){
  console.log('\nIngredients needing a decision — nothing was guessed:');
  needsHuman.forEach(n => {
    console.log(`\n  ${n.slug}`);
    n.med.forEach(i => console.log(`    confirm  "${i.text}" -> ${i.id}${i.alternatives?.length ? `  (or ${i.alternatives.join(', ')})` : ''}`));
    n.none.forEach(i => console.log(`    unknown  "${i.text}"${i.candidates?.length ? `  closest: ${i.candidates.join(', ')}` : ''}`));
  });
  console.log('\n  An unknown ingredient needs adding to the registry with its gram');
  console.log('  conversions, nutrition row, sourcing channel, dietary flags and');
  console.log('  allergen tags before any recipe using it can ship. The allergen');
  console.log('  tag is the one a reviewer must not skip.');
}

console.log('\nThese are drafts, not recipes. Each still needs its method rewritten,');
console.log('its foundation and layers written, and someone to cook it. Nothing here');
console.log('was written into prototype.html and nothing should be by a script.');
