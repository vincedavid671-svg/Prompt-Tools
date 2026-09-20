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
