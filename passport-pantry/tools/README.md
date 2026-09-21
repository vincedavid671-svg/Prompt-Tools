# tools/

## fdc-resolve.mjs

Resolves every canonical ingredient against **USDA FoodData Central** and rewrites
the `NUTR` table in `prototype.html` with real, citable values.

```bash
node tools/fdc-resolve.mjs --key YOUR_KEY            # resolve and write
node tools/fdc-resolve.mjs --key YOUR_KEY --verify   # report drift, write nothing
node tools/fdc-resolve.mjs --key YOUR_KEY --only salt,flour   # spot-check a few
```

A free key takes about a minute: <https://fdc.nal.usda.gov/api-key-signup>.
FDC data is CC0 public domain. `FDC_API_KEY` works in place of `--key`.

### Why build time rather than runtime

Nutrient values for kosher salt do not change. Fetching them per page view would
burn the 1,000-requests-an-hour quota, add latency to every recipe open, and make
the app fail whenever USDA has an outage. So the script resolves once, the result
is committed, and the app ships a table it can cite. Responses are cached under
`.fdc-cache`, so re-runs after fixing a query cost almost no quota.

### What it does

1. Searches FDC for each ingredient using a hand-written query, restricted to
   **Foundation**, **SR Legacy** and **Survey (FNDDS)** data types.
2. Ranks candidates: Foundation first, then SR Legacy, then Survey, rejecting any
   whose description hits a `not` word and preferring plainer names.
3. Pulls energy, protein, carbohydrate, fat and fibre — trying nutrient numbers
   1008, then 2048, then 2047 for energy, because Foundation foods often carry
   Atwater-derived energy rather than the classic field.
4. Rewrites the `NUTR` block with an `fdc` id on every row.

### Deliberate exclusions and judgement calls

**Branded foods are excluded.** Their values are one manufacturer's label, not a
generic food. Including them would quietly make the table describe a product
nobody in another country can buy.

**Some ingredients have no USDA entry at all.** Scotch bonnet, donne' sali, makrut
lime leaf, palm sugar, preserved lemon, baharat, ají amarillo. The script uses the
closest available food and records why in `PROXY_NOTE`; the app mirrors that list
in `NUTR_PROXY` and shows it on the recipe. A cited number that silently describes
a different food is worse than an admitted estimate — a test asserts the two lists
stay in step.

**It refuses to write a partial table.** If any ingredient fails to resolve, the
script reports it and exits without touching the file, rather than leaving a mix
where some rows are sourced and the failures look identical to the rest. Fix the
query or fill that row by hand, then re-run.

**`--verify` reports drift.** Any resolved value more than 20% from the current
approximation is listed. That is a review prompt, not an error: some of the
approximations will be wrong, and a few of the queries will have picked the wrong
food. The drift report is how you tell which.

### What changes in the app afterwards

`fdc` is the provenance switch, and the only thing separating a sourced value from
a guess:

| Row | App behaviour |
|---|---|
| Has `fdc` | Counted as USDA-sourced; traceable at `fdc.nal.usda.gov/food-details/<id>` |
| No `fdc` | Counted as an approximation and labelled as one on every screen |

Each recipe shows a bar reading *"N of M values resolved from USDA FoodData
Central"*, and the daily-budget disclaimer rewrites itself once the table is fully
sourced. Nothing else needs changing — the switch is one field.

`fib` arrives with the resolve, which is what makes **net carbohydrate** possible.
It is shown only where every counted ingredient in a recipe carries fibre, and the
keto and low-carb tags then use the net figure rather than total carbs.

---

## names-resolve.mjs

Resolves ingredient names into many languages from **Wikidata**, and writes them
into `ING_L10N` in `prototype.html`.

```bash
node tools/names-resolve.mjs --langs ar,es,fr,de,tr,id
node tools/names-resolve.mjs --verify            # report, write nothing
node tools/names-resolve.mjs --only cilantro,eggplant
```

No API key. Wikidata asks for a descriptive User-Agent and sane request rates;
both are set. Responses cache to `.wd-cache`.

### Why Wikidata and not Open Food Facts

Open Food Facts publishes an ingredients taxonomy with translations in a great
many languages, and as a *food* dataset it is better. But it is licensed
**ODbL**, which is share-alike for the database: extracting a substantial part
into a commercial product carries an obligation to license the derived database
on the same terms.

**Wikidata is CC0** — no conditions, no share-alike, no attribution requirement.
For something intended to be sold, that difference outweighs the marginal data
quality. If you later decide OFF's terms are acceptable, its ingredients
taxonomy is a drop-in alternative and only `fetchLabels()` changes.

### How it works

1. **Search** Wikidata for each ingredient by English name.
2. **Rank** candidates by their description, so "saffron" resolves to the spice
   rather than a film or a band. Items whose description matches none of the
   expected words are rejected outright.
3. **Query** the SPARQL endpoint for that item's label in each target language.
4. **Write** the names back, along with the **QID** — the stable identifier that
   makes every name checkable at `wikidata.org/wiki/<QID>`.

QIDs are never hardcoded in this file. An invented identifier is a fabricated
citation, and the entire value of anchoring to Wikidata is that the anchor can
be checked.

### What it deliberately does not do

**Dictionary translation is not the word a shopkeeper recognises.** Wikidata will
tell you coriander leaf is كزبرة خضراء. It will not tell you that at Deserter's
Bazaar in Tbilisi you ask for ქინძი, or that the Thai stall wants ใบมะกรูด rather
than a formal botanical name.

So 16 ingredients are on a `HAND_CURATED` list the script never touches —
makrut lime leaf, baharat, loomi, berbere, donne' sali, gochugaru, kasuri methi,
achiote, candlenut and the rest. Those carry a separate `mkt` field: the exact
thing to say at the counter, transliterated where the script alone would not
help.

That is the same split as the nutrition resolver. The machine fills the bulk;
a human fills the part that is actually hard.

### A gap is better than a wrong word

Where Wikidata has no label in a target language, the script reports it and
leaves the existing name in place rather than substituting something
approximate. In a recipe app a wrong ingredient name sends someone home with the
wrong thing; a missing one sends them to ask.

---

## jsonld-ingest.mjs

Ingests structured recipe data from **schema.org/Recipe JSON-LD** — the markup
recipe sites publish deliberately so machines can read them.

```bash
node tools/jsonld-ingest.mjs --url https://example.com/a-recipe
node tools/jsonld-ingest.mjs --file urls.txt --out drafts/
node tools/jsonld-ingest.mjs --selftest        # parser tests, no network
```

### What it takes, and what it refuses to take

The project's sourcing rule, enforced in code rather than left to good
intentions:

| Field | Treatment |
|---|---|
| `recipeIngredient` | **Imported** — uncopyrightable fact |
| `recipeInstructions` | **Reference only**, into a field the app never reads |
| `description`, `headline` | **Never read** — the headnote is the copyrightable part |
| `image` | **Never read** |
| `author`, `publisher`, URL | **Always recorded** |

Extracted steps land in `stepsForReference` with a notice attached. The
procedure they describe is free to follow and re-describe; the sentences are the
author's. A human rewrites them and deletes the field.

**It never writes into `prototype.html`.** Output is a draft per recipe. A
finished dish also needs a foundation, its layers, a region, yield corrections
and a method in our own words — none of which come from markup.

### Ingredient parsing

`"1 1/2 cups all-purpose flour"` → `{qty: 1.5, unit: 'cup', text: 'all-purpose flour'}`

Handles vulgar fractions (`½`, `1½`), mixed numbers, ranges (takes the lower
bound — under-buying is recoverable, over-buying is waste), and converts
imperial weight to grams so the pantry ledger works. Preparation words are
stripped before matching: *finely chopped fresh flat-leaf parsley* and *parsley*
are the same ingredient.

### Matching is deliberately conservative

This is the part that matters. **The allergen engine and the nutrition table
both key off the canonical ingredient id.** Mapping `tamari` onto `soy` would
tell a coeliac that a wheat-free sauce contains wheat — or, reversed, that a
wheat-brewed one does not.

So matching has three outcomes and only the first is automatic:

| Confidence | Source | Action |
|---|---|---|
| `high` | Explicit alias, or exact registry name | Mapped |
| `medium` | Strong token overlap, clear winner | **Reported for a human to confirm** |
| `none` | Anything else | **Reported with the closest candidates** |

Nothing is ever guessed into place. An unknown ingredient must be added to the
registry with its gram conversions, nutrition row, sourcing channel, dietary
flags and **allergen tags** before a recipe using it can ship — and the tool
says so, because the allergen tag is the one a reviewer must not skip.

### Manners

Checks `robots.txt` before every origin and respects `Disallow` for `*`. Sends a
descriptive User-Agent. One request per second. None of that is optional if you
want the sites whose markup you are reading to stay friendly.

### Self-test

`--selftest` runs the parser against fixtures with no network: quantity forms,
line parsing including imperial conversion, the tamari/soy distinction, unknown
and ambiguous matching, and JSON-LD extraction from `@graph`.

It has already earned its place. It caught the walker returning every recipe
twice, because it descended into `@graph` explicitly and then reached it again
through the generic object walk — and `@graph` is what WordPress and Yoast emit,
so that was most recipe sites rather than an edge case.
