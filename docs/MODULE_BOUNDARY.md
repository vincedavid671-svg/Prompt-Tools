# Module Boundary — Passport Pantry

**Decision (owner, 2026-09-21):** Passport Pantry stays in this repository as a
clearly separated module. It is **not** extracted into its own repository yet.
Separation criteria are recorded in §6 and are the conditions under which that
decision should be revisited.

This supersedes the earlier "extract first" recommendation in `NEXT_STEPS.md`.

---

## 1. Purpose

Passport Pantry is a travel-memory recipe application. A traveller ate
something abroad and wants to cook it at home; the recipe is the easy part.
The hard parts — what the ingredient is called where you live, whether anyone
near you sells it, what to do when they do not, and whether it is safe for you
to eat — are what the module exists to solve.

It owns five problem domains, and it owns them completely:

| Domain | What it decides |
|---|---|
| **Catalogue** | Which dishes exist, where they are from, what makes each one itself (foundation) and what cooks vary (layers) |
| **Ingredients** | The canonical registry, unit normalisation, names across five locales including market register |
| **Safety** | Allergen classification in three non-merging buckets, diet profiles, and which substitutions are honest |
| **Nutrition** | Per-serving energy and macros corrected for what is actually eaten, with provenance tracked per value |
| **Sourcing** | Which shops in which country plausibly carry a given ingredient, and when the answer is "none" |

It is **not** a general-purpose recipe library, a nutrition API, or a shopping
SDK. If it ever becomes one of those for a second consumer, see §6.

---

## 2. What the module contains

```
passport-pantry/
├── package.json            module manifest — name, scripts, zero dependencies
├── .env.example            variable names only; the app reads none of them
├── README.md               the product spec: mechanics, rules, known gaps
├── prototype.html          THE APPLICATION — single self-contained file
└── tools/
    ├── README.md           how to run each tool and the judgement calls inside
    ├── consistency-check.mjs   data invariants + the SEC-1 privacy guard
    ├── boundary-check.mjs      enforces this document
    ├── fdc-resolve.mjs         USDA FoodData Central → NUTR
    ├── names-resolve.mjs       Wikidata → ING_L10N
    └── jsonld-ingest.mjs       schema.org/Recipe → draft JSON
```

Documentation lives in `/docs` at the repository root by instruction. If the
module is ever extracted, `/docs` moves with it — it documents this module,
not the repository.

---

## 3. Dependencies

### Runtime dependencies: none

`dependencies` and `devDependencies` are both empty, and that is a deliberate
property rather than an accident of youth. The application is one HTML file
with no build step; the tools are plain Node ES modules using only the standard
library. **Nothing in this module requires `npm install`.**

The single external runtime request is a Google Fonts stylesheet, which sends
the viewer's IP to Google on page load. Recorded as PRIV-1 in
`CURRENT_STATUS.md`; self-hosting the two families removes it.

### Build-time external services, all optional

| Service | Used by | Required? | Licence of the data |
|---|---|---|---|
| USDA FoodData Central | `fdc-resolve.mjs` | No — the app ships with approximations | CC0, public domain |
| Wikidata | `names-resolve.mjs` | No — names are hand-curated otherwise | CC0 |
| Any schema.org/Recipe page | `jsonld-ingest.mjs` | No — used to draft new dishes | Per-site; ingredients only |

All three are **build-time**, never called from the running application.
Nutrient values for kosher salt do not change, so they are resolved once and
committed. This keeps the app working when those services are down, and keeps
zero API keys in the browser.

### Repository-root dependencies: none

The module does not use the root `package.json`, `tsconfig.json`,
`vite.config.ts`, the `src-tauri` Rust crate, or any root dependency. It is
deliberately **not** registered in a root `workspaces` field — the root is a
fork of an upstream project we do not own, and a zero-dependency package gains
nothing from hoisting while gaining rebase conflicts.

---

## 4. API boundaries

The module currently has **no programmatic API**. It is an application, not a
library: nothing imports it and it exports nothing. That is the cleanest
possible boundary and it is worth keeping until there is a second consumer.

### The boundary, stated as rules

| Direction | Rule | Enforced by |
|---|---|---|
| **Outward** | Nothing in `passport-pantry/` may import, read or reference anything above its own directory | `boundary-check.mjs`, outward pass |
| **Outward** | No `process.cwd()`, no absolute machine paths — resolve from `import.meta.url` | same |
| **Inward** | Nothing outside `passport-pantry/` may depend on it. Prose in `/docs` and the root README may *point* at it; code and build config may not | `boundary-check.mjs`, inward pass |
| **Self-sufficiency** | The module must declare its own manifest and test script, and run without the repository root | same |

Run it: `cd passport-pantry && npm run test:boundary`. It exits 1 on a breach
and names the file. Both directions were verified by deliberately introducing
a violation and watching the check fail.

### Internal seams worth preserving

Within the module, two seams carry the design and should survive refactoring:

- **`effectiveIng(recipeId, ing)`** — the single point where an ingredient swap
  is applied. Quantities, pantry coverage, nutrition and the shopping list all
  read through `effectiveIngs(r)`, so a substitution propagates without any of
  those systems knowing diets or allergens exist.
- **`toGrams(id, qty, unit)`** — returns `null`, never a guess, when a
  conversion is undefined. Every caller propagates the null. This is what keeps
  the pantry ledger honest.

### If a programmatic API is ever needed

Export from a single entry point (`index.mjs`), and export the *data* and the
*pure functions* — the catalogue, `toGrams`, `nutritionOf`, `allergyCheck`,
`sourcesFor`. Do not export rendering or state. The moment a second consumer
exists, §6 applies.

---

## 5. Data ownership

### Data the module owns outright

Catalogue data lives as object literals inside `prototype.html` and is
versioned as source. The module is the sole author and the sole authority for:

| Data | Shape | Authority |
|---|---|---|
| Dishes, recipes, steps, foundation/layers | `R`, `CRAFT` | Written for this project; original prose, untested |
| Canonical ingredients, unit conversions | `ING` | Hand-authored |
| Allergen classification | `ALLERGEN`, `ALT`, `CANNOT_SUB` | **Hand-authored and unverified — see RISK-1** |
| Diet profiles and substitutions | `DIETS`, `SUBS`, `FLAGS` | Hand-authored |
| Nutrition | `NUTR`, `NUTR_PROXY`, `EATEN` | Approximations until `fdc-resolve` runs |
| Ingredient names, five locales | `ING_L10N` | Hand-curated; 28 excluded from automation permanently |
| Geography and commerce registries | `COUNTRIES`, `REGION_OF`, `PLATFORMS`, `LOCAL` | Researched, tiered by what each API can actually do |

**No other part of this repository reads or writes any of it.**

### Data the module holds on behalf of a viewer

Written through the Claude Artifacts `db` capability, **entirely under the
viewer's own private path** since the SEC-1 fix:

```
data/users/<uid>/profile          body composition, calorie target
data/users/<uid>/days/<date>      food diary
data/users/<uid>/pantry/<ingId>   pantry stock        (was shared — SEC-1)
data/users/<uid>/cooked/<autoId>  cook log, ratings, free-text notes
```

Ownership rules the module commits to:

1. **The viewer owns all of it.** A pantry is a record of what someone buys and
   eats; a cook log carries their notes. None of it is the publisher's.
2. **No shared writes.** Persistence requires both the `db` and `user`
   capabilities, because without a private path there is nowhere safe to write.
   Absent either, state stays in memory and the UI says so. Losing a pantry on
   reload is an annoyance; writing one where others can read it is not.
3. **No cross-module access.** Nothing outside this module may read these
   paths. There is nothing outside this module that could.
4. **Ratings are personal, not community.** A shared cook log once made the
   rating badge read as an aggregate. It is now explicitly *your* cooks. A real
   community layer needs accounts and a separate moderated collection.

### Data the module deliberately does not own

Attribution for recipes sourced from elsewhere. `jsonld-ingest.mjs` imports
ingredients and quantities — uncopyrightable fact — records author and source
URL, and **never reads** headnotes, descriptions or images. Attribution slots
in the app are left visibly empty rather than filled with invented sources.

---

## 6. When to separate

Keep it here until **any one** of these becomes true. Each is a fact about the
world, not a matter of taste.

### 6.1 It becomes independently deployable

*Trigger:* the module gains its own build, its own hosting target, or a deploy
that must happen without deploying the root application.

*Today:* false. There is no build and no deploy — it is opened as a file or
published as an artifact.

### 6.2 It is reused by more than one application

*Trigger:* a second consumer imports it, or the catalogue is served to another
front-end.

*Today:* false, and `boundary-check.mjs` fails the build if anything starts to.
The first legitimate second consumer is the signal, not an argument for
pre-emptive extraction.

### 6.3 It needs a separate security or release lifecycle

*Trigger:* any of —
- the module acquires runtime dependencies and therefore a supply chain
- it starts holding credentials, or handling authentication
- it needs to ship a security fix on a timeline the root application cannot
  meet, or vice versa
- it needs its own version numbers, changelog, or release tags

*Today:* false, but **closest to true of the three.** The allergen data is
safety-critical and hand-authored; a correction there is a different kind of
urgency from a prompt-manager feature. If the root application ever gains a
release cadence that would delay an allergen fix, extract that week.

### 6.4 Two conditions that are not triggers

- **"The repository is confusingly named."** It is, and that is a
  documentation problem solved by `PROJECT_OVERVIEW.md` and the pointer in the
  root README. Not a reason to move code.
- **"The module got big."** Size alone is not a coupling problem. The boundary
  check is what matters, and it currently passes.

### If extraction happens

Because coupling is zero in both directions, it is mechanical:

```bash
git subtree split --prefix=passport-pantry -b passport-pantry-only
# push that branch to a new repository; move /docs to its root
```

Nothing needs unwinding. That property is the whole point of enforcing the
boundary now, and it is worth more than the extraction itself — it means the
decision stays cheap to reverse in either direction.

---

## 7. Checking the boundary

```bash
cd passport-pantry
npm test              # data invariants + SEC-1 privacy guard
npm run test:boundary # this document, enforced
npm run check         # all three suites
```

No `npm install` required. Node 18+.

`boundary-check.mjs` also emits non-failing warnings when the module gains its
first dependency, or when the root registers it as a workspace — both are legal
but both move §6.3 closer, and a warning at the moment it happens is more
useful than a rule nobody reads.
