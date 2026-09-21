# Data Model

**Current state and recommended target.** No migration has been performed; this
document is a proposal plus an accurate record of what exists today.

---

## Part 1 — Distinctions that must not be collapsed

These six pairs are the vocabulary of the product. Several are currently
conflated in code, which is the main reason this document exists.

### 1.1 Dish vs. Recipe

| | Dish | Recipe |
|---|---|---|
| Is | The culturally named thing | One person's method for making it |
| Example | Khinkali | "Nino's khinkali, 20 pleats, lamb" |
| Cardinality | One per name | **Many per dish** |
| Owns | Country, region, native name, foundation, layers | Ingredients, steps, yield, servings, author, rating |
| Changes | Almost never | Constantly; every cook has one |

**Today these are the same object.** `R` is a flat array of 43 entries where
each entry carries dish identity (`country`, `flag`, `dish`, `native`,
`region`) *and* recipe content (`ings`, `steps`, `serves`, `time`) on the same
record, keyed by one id. `CRAFT[id]` — the foundation and layers, which are
dish-level truths — is keyed by that same id.

Verified: all 43 `dish` names are unique, so there is exactly one recipe per
dish and no collision is being masked.

**Why this matters more than it looks.** The product thesis is that a dish has
a foundation and that individual cooks vary the layers. That thesis is not
expressible in the current schema. You cannot hold two khinkali recipes, cannot
attribute a recipe to a creator, cannot rate recipes against each other, and
cannot point a YouTube video at "a version of this dish" — because there is no
such entity. This is the single most consequential modelling debt in the
project.

### 1.2 Ingredient vs. Ingredient Alias

| | Ingredient (canonical) | Alias |
|---|---|---|
| Is | The thing itself | A name for the thing |
| Identity | Stable id, e.g. `eggplant` | No identity of its own |
| Carries | Nutrition, allergens, unit conversions, sourcing channel | Locale, script, register |
| Count | 178 | 105 ingredients × up to 5 locales, plus market names |

An alias **never** changes what the ingredient is. `eggplant` / `aubergine` /
`باذنجان` / `berenjena` are one row with four labels. The allergen engine and
the nutrition table key off the canonical id alone, which is why the ingester's
matcher is conservative: a wrong alias match is a safety bug, not a cosmetic
one.

Today: aliases live in `ING_L10N[id]`, one flat object per ingredient with a
key per locale plus an optional `mkt` — the phrase to say at a market counter,
which is register, not translation (`ใบมะกรูด · bai makrut`).

### 1.3 Equivalent name vs. Substitution

This is the distinction most likely to get someone hurt if blurred.

| | Equivalent name (alias) | Substitution |
|---|---|---|
| Same food? | **Yes** | **No** |
| Changes the dish? | No | Yes, always |
| Changes allergens? | **Never** | **Frequently — that is often the point** |
| Reversible? | Symmetric | Directional |
| Example | cilantro = fresh coriander | soy sauce → tamari |

`cilantro → coriander` is a label change. `soy sauce → tamari` is a different
product: one is brewed with wheat, one is not. Treating a substitution as an
alias would tell a coeliac that soy sauce is gluten-free.

Today, correctly separated into two tables with different purposes:

- **`SUBS`** — *diet* substitutions. Filtered by `cleanSubs()` against the
  active diet's `avoid` list.
- **`ALT`** — *allergen* substitutions. Filtered by `safeAlts()`, which removes
  any target that **contains** the allergen and attaches a `caution` when the
  target is merely **label-dependent** for it.

Both carry a mandatory prose note stating what the swap costs. Substitutions
are directional and are not inverted automatically.

### 1.4 Recipe video vs. Technique video

| | Recipe video | Technique video |
|---|---|---|
| Attaches to | A specific recipe | A skill, reusable across dishes |
| Example | "Nino makes khinkali" | "How to pleat a dumpling" |
| Reusable? | No | Yes — pleating serves khinkali, jiaozi, momo |
| Lifecycle | Dies with the recipe | Outlives any dish |

**Neither exists today.** The recipe view renders one outbound link to a
YouTube *search results page* built from the dish name. No API call, no stored
video, no id, no technique concept anywhere in the codebase.

### 1.5 Pantry quantity vs. Required quantity

| | Pantry quantity | Required quantity |
|---|---|---|
| Question | "How much do I have?" | "How much does this need?" |
| Source | Purchase minus inferred depletion | Recipe line × serving multiplier |
| Certainty | **Estimate** — labelled as such | Exact, from the recipe |
| Stored | `{bought, left}` in grams | `{i, q, u}`, native units |
| Mutable by | Cooking, refilling, correcting | Only editing the recipe |

Never compare them without normalising: `needOf()` runs the recipe line through
`toGrams()` first. `toGrams()` returns **`null`**, not a guess, when a
conversion is undefined — the UI then shows the gap. `shortfallOf()` propagates
that null so an unconvertible line is never silently treated as "you have
enough".

### 1.6 Country vs. Region — and the two different roles a country plays

A country appears in this system in **two unrelated roles**, and they are
currently two separate tables that happen to hold country names:

| Role | Table | Keyed by | Example |
|---|---|---|---|
| **Origin** — where a dish comes from | `REGION_OF` | Country *name* string | `Georgia → Caucasus` |
| **Market** — where the user is shopping | `COUNTRIES` | ISO 3166-1 alpha-2 | `GE → {n:'Georgia', f:'🇬🇪'}` |

They are joined only by string comparison of the display name. That join is
fragile and is enforced today by a test, not by the schema.

---

## Part 2 — Current model (as built)

```
REGION_OF: { "<country name>": "<region name>" }      19 regions
REGION_NOTE: { "<region name>": "<prose>" }

R: [ {                          ← Dish AND Recipe, fused
     id, country, flag, dish, native, region, blurb, serves, time, level,
     ings: [ { i, q, u } ],     ← FK to ING by id, native units
     steps: [ { h, t, heat? } ] ← ordered by array position only
} ]                             43 entries

CRAFT: { "<dish id>": { foundation, layers: [ {w, o} ] } }

ING:       { "<ing id>": { n, buy, conv: { unit: grams } } }    178
ING_L10N:  { "<ing id>": { "en-US", "en-GB", ar, es, fr, mkt? } } 105
NUTR:      { "<ing id>": { k, p, c, f, fib?, fdc? } }
ALLERGEN:  { "<ing id>": { has[], check[], hidden[], advisory[], note? } }
FLAGS:     { "<ing id>": [ diet flags ] }
SOURCE:    { "<ing id>": { oc, keep? } }
ALT:       { "<ing id>": [ { to, note } ] }     allergen substitutions
SUBS:      { "<ing id>": [ { to, note } ] }     diet substitutions
EATEN:     { "<dish id>": { "<ing id>": fraction } }

COUNTRIES: { "<cc>": { n, f } }                  87 served
PLATFORMS: { "<key>": { n, t, tier, for[], d, cc[] } }   24
LOCAL:     { "<cc>": [ { n, t, tier, for[], d } ] }
STORE_META:{ "<store name>": { strong[], wide?, ships? } }   ← joined by NAME

runtime (db):
  pantry/<ing id>            { bought, left, at }     SHARED — defect SEC-1
  cooked/<autoId>            { dishId, rating, note, at }  SHARED — defect SEC-1
  data/users/<uid>/profile   { mode, sex, age, height, weight, ... }  private
  data/users/<uid>/days/<d>  { entries: [...] }                       private
```

### Weaknesses in the current model

| # | Issue | Consequence |
|---|---|---|
| DM-1 | Dish and Recipe fused | No multiple recipes, no attribution, no per-recipe ratings |
| DM-2 | Recipe steps are array positions | Cannot reference, reorder, or attach a technique video to a step |
| DM-3 | `STORE_META` joined to stores by display name | A typo silently drops a store's sourcing profile |
| DM-4 | Dish origin joined to market registry by country *name* | String join; enforced by test, not schema |
| DM-5 | `EATEN` keyed by dish id, not recipe id | Yield corrections cannot vary per recipe |
| DM-6 | No `Video`, no `Technique`, no `User`, no `Retailer` entity | Four of the twelve requested entities do not exist |
| DM-7 | No `ShoppingList` entity — it is `state.need`, in memory | List does not survive a reload; cannot be shared or have multiple lists |
| DM-8 | Aliases are columns, not rows | Adding a locale is a schema change across 105 objects |

---

## Part 3 — Recommended model

Relational, normalised, one table per entity. Written as SQL-ish DDL because
that is unambiguous; it does not mandate a specific database.

```
Region          id, slug, name, note
Country         id, iso2, name, flag_emoji, region_id → Region
                -- ONE country table serving both roles; a dish references it
                -- as origin, a user references it as market.

Dish            id, slug, name, native_name, country_id → Country,
                sub_region_note, blurb,
                foundation            -- dish-level truth, moved off Recipe
Layer           id, dish_id → Dish, position, heading, options_prose

Recipe          id, dish_id → Dish, title, author_id → User, source_url,
                servings, total_minutes, difficulty,
                is_tested BOOL,        -- gates the "Draft · untested" badge
                licence, attribution_required BOOL
                -- MANY per dish. This is DM-1 resolved.
RecipeStep      id, recipe_id → Recipe, position, heading, body, heat_note,
                technique_id → Technique NULL   -- step-level technique link
RecipeIngredient id, recipe_id → Recipe, ingredient_id → Ingredient,
                quantity NUMERIC, unit, preparation_note, position,
                eaten_fraction NUMERIC DEFAULT 1   -- DM-5 resolved

Ingredient      id, slug, canonical_name, purchase_class, sourcing_channel,
                keep_class, nutrition_id → Nutrition
IngredientAlias id, ingredient_id → Ingredient, locale, name,
                kind ENUM('dictionary','market','regional'),
                UNIQUE(ingredient_id, locale, kind)     -- DM-8 resolved
UnitConversion  id, ingredient_id → Ingredient, unit, grams
                -- NULL row absent = undefined, never guessed

Nutrition       id, kcal, protein_g, carb_g, fat_g, fibre_g NULL,
                fdc_id NULL, is_proxy BOOL, proxy_note NULL
Allergen        id, code, label, us_declared BOOL, eu_declared BOOL
IngredientAllergen ingredient_id, allergen_id,
                relation ENUM('contains','check_label','advisory'),
                is_hidden BOOL, note
                -- The three buckets become one column. They must never merge.

IngredientSubstitution
                id, from_ingredient_id, to_ingredient_id,
                reason ENUM('diet','allergen'),
                note TEXT NOT NULL,          -- what it costs; never optional
                directional BOOL DEFAULT TRUE
DishSubstitutionBlock
                id, dish_id, allergen_id, explanation
                -- the "no substitution saves this dish" case

User            id, created_at, locale, market_country_id → Country
                -- No credentials column; delegate auth (see NEXT_STEPS)
UserAllergen    user_id, allergen_id
UserDiet        user_id, diet_code

PantryItem      id, user_id → User, ingredient_id → Ingredient,
                bought_grams, remaining_grams, last_updated
                UNIQUE(user_id, ingredient_id)        -- SEC-1 resolved
ShoppingList    id, user_id → User, name, created_at, market_country_id
ShoppingListItem id, list_id → ShoppingList, ingredient_id,
                grams NULL, native_qty_text NULL, checked BOOL,
                source_recipe_id → Recipe NULL         -- DM-7 resolved
CookLog         id, user_id → User, recipe_id → Recipe, servings,
                rating NULL, note NULL, cooked_at        -- SEC-1 resolved

Technique       id, slug, name, description
                -- "pleating", "cracking coconut cream", "building a roux"
Video           id, provider ENUM('youtube'), provider_video_id,
                title, channel, duration_s, published_at,
                kind ENUM('recipe','technique'),         -- 1.4 resolved
                recipe_id → Recipe NULL,
                technique_id → Technique NULL,
                CHECK (kind='recipe' AND recipe_id IS NOT NULL
                    OR kind='technique' AND technique_id IS NOT NULL)

Retailer        id, name, kind, integration_tier
                ENUM('cart','merchant','affiliate','link','none'),
                api_base NULL, affiliate_tag NULL
RetailerCountry retailer_id, country_id            -- DM-3/DM-4 resolved: FK
RetailerChannel retailer_id, sourcing_channel, confidence
                ENUM('strong','wide')
                -- replaces STORE_META's join-by-display-name
```

### Relationship summary

```
Region 1──n Country 1──n Dish 1──n Recipe 1──n RecipeStep
                                     │              └──0..1 Technique
                                     └──n RecipeIngredient n──1 Ingredient
Ingredient 1──n IngredientAlias
Ingredient 1──n UnitConversion
Ingredient 1──1 Nutrition
Ingredient n──n Allergen      (via IngredientAllergen, 3 relation kinds)
Ingredient n──n Ingredient    (via IngredientSubstitution, directional)
User 1──n PantryItem n──1 Ingredient
User 1──n ShoppingList 1──n ShoppingListItem n──1 Ingredient
User 1──n CookLog n──1 Recipe
Recipe 1──n Video (kind='recipe')
Technique 1──n Video (kind='technique')
Retailer n──n Country
Retailer n──n sourcing_channel
```

### Migration notes

- The catalogue is small (43 dishes, 178 ingredients). A one-off export script
  reading the object literals and emitting seed SQL is a day of work, not a
  project.
- Migrate `Ingredient` and its satellites **first**. They are the most
  referenced and the most stable.
- Splitting Dish from Recipe is mechanical for the existing 43: each becomes
  one Dish with exactly one Recipe, `is_tested = false`, `author_id = NULL`.
- **Do not migrate `pantry`/`cooked` as-is.** They are currently shared across
  all viewers; they must be re-keyed by `user_id` during migration, and any
  existing rows should be treated as test data and dropped.
