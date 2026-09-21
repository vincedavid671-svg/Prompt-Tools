# Architecture

**Reviewed at commit `c16be36`. No frameworks were changed during this review.**

---

## 1. Technology stack

### The cooking application

| Layer | Technology | Notes |
|---|---|---|
| Language | Vanilla ES2020+ JavaScript | No transpilation |
| Markup | Single HTML5 file | `passport-pantry/prototype.html`, 327 KB |
| Styling | Hand-written CSS custom properties | Light/dark via `prefers-color-scheme`, RTL supported |
| Framework | **None** | No React, Vue, Svelte, or router |
| Build | **None** | No bundler, no transpiler, no package.json |
| Dependencies | **Zero** at runtime | Only external request is Google Fonts |
| Templating | Template literals returning HTML strings | Re-render assigns `innerHTML` wholesale |
| Persistence | Claude Artifacts runtime capabilities | `db`, `sample`, `user` — see §4 |

### The build-time tooling

| Script | Runtime | Network | Purpose |
|---|---|---|---|
| `tools/consistency-check.mjs` | Node ≥ 18 | none | Data invariant suite |
| `tools/fdc-resolve.mjs` | Node ≥ 18 | USDA FDC | Resolve nutrition, rewrite `NUTR` |
| `tools/names-resolve.mjs` | Node ≥ 18 | Wikidata | Resolve names, rewrite `ING_L10N` |
| `tools/jsonld-ingest.mjs` | Node ≥ 18 | target site | Parse schema.org/Recipe into drafts |

All four are plain ES modules (`.mjs`), no dependencies, run with bare `node`.

### Not our stack

The repository root is a **Tauri 2 + Vite + TypeScript** desktop application
(the forked prompt manager). It has its own `package.json`, `tsconfig.json`,
`vite.config.ts`, `src-tauri/` Rust crate and CI workflows. See
`PROJECT_OVERVIEW.md`. Do not conflate the two.

### The module boundary

Passport Pantry is a separated module inside that repository, by decision, with
its own `package.json` (zero dependencies, own scripts) and a boundary enforced
by `tools/boundary-check.mjs`:

- nothing in `passport-pantry/` references anything above it
- nothing outside `passport-pantry/` depends on it, except prose in `/docs`
- the module runs standalone — `npm run check` needs no install and no root

`MODULE_BOUNDARY.md` is the governing document, including the three conditions
that would justify extracting it later. Read it before changing an import, a
manifest, or a storage path.

---

## 2. Application structure

`prototype.html` is one file in a deliberate order: data first, then pure
functions, then state, then rendering, then events. Approximate line map at
commit `c16be36`:

| Lines | Block | What it is |
|---|---|---|
| 1–430 | `<style>` | Design tokens, layout, dark mode, RTL overrides |
| 431–460 | Shell markup | Header, tab bar, `<main id="main">` |
| ~460–610 | `ING` | Canonical ingredient registry, 178 entries |
| ~610–640 | `FLAGS` | Diet flags per ingredient |
| ~650–800 | `LOCALES`, `T`, `ING_L10N` | 5 locales, 44 UI strings, 105 localised names |
| ~820–1010 | `ALLERGENS`, `ALLERGEN`, `ALT`, `CANNOT_SUB` | Allergen engine data |
| ~1010–1070 | `DIETS`, `SUBS` | Diet profiles and diet substitutions |
| ~1070–1110 | `REGION_OF`, `REGION_NOTE` | Geography |
| ~1110–1340 | `TIERS`, `PLATFORMS`, `LOCAL`, `COUNTRIES` | Commerce registry |
| ~1350–1500 | `NUTR`, `ACTIVITY`, `GOALS`, `FLOOR`, `FRAMEWORKS` | Nutrition + budget |
| ~1500–1620 | `NUTR_PROXY`, `EATEN`, `EATEN_NOTE`, `nutritionOf` | Provenance + yield |
| ~1620–1800 | `OC_LABEL`, `SOURCE`, `NATIVE`, `STORE_META`, `sourcesFor` | Sourcing engine |
| ~1800–2900 | `R` | The 43 recipes |
| ~2900–3330 | `CRAFT` | Foundation and layers per dish |
| ~3330–3420 | `toGrams`, `EXAMPLE_PANTRY`, `state`, `initCaps` | Units, seed, state |
| ~3420–3600 | Diet/allergen/pantry mechanics | `effectiveIng`, `allergyCheck`, `cookDish` |
| ~3600–4240 | `viewAtlas`, `viewRecipe`, `viewPantry`, `viewToday`, `viewList` | Views |
| ~4240–4420 | `render`, event delegation, `runCoach` | Wiring |

### Rendering model

Four views, selected by `state.view`, plus a nested recipe detail selected by
`state.dishId`:

```
render()
  ├─ state.view === 'atlas'  → dishId ? viewRecipe() : viewAtlas()
  ├─ state.view === 'today'  → viewToday()
  ├─ state.view === 'pantry' → viewPantry()
  └─ else                    → viewList()
```

Each view returns an HTML string. `render()` assigns it to `el.innerHTML` and
scrolls to top. There is no virtual DOM, no diffing, no component lifecycle,
and no router — **navigation state is not in the URL**, so pages are not
linkable, bookmarkable, or back-button aware.

### Event model

Two delegated listeners on `#main` (`click`, `change`) plus one on `#tabs` and
one `keydown`. Handlers match on `data-*` attributes. This is why full
re-render is safe: no listeners are bound to replaced nodes.

### The one architectural seam worth knowing

`effectiveIng(recipeId, ing)` is the single place an ingredient swap is
applied. Quantities, pantry coverage, nutrition and the shopping list all read
through `effectiveIngs(r)`, so a substitution propagates everywhere without any
of those systems knowing that diets or allergens exist. Preserve this seam.

---

## 3. Data-storage approach

**There is no database.** There is no server, no ORM, no migration system, no
schema file.

Two tiers:

### Tier 1 — the catalogue (static, in-source)

Recipes, ingredients, allergens, nutrition, stores and translations are
**JavaScript object literals inside `prototype.html`**, loaded when the file
parses. They are read-only at runtime. They are edited by hand or rewritten by
the resolver scripts, and they are versioned in git like source code.

Consequence: **content changes require a code deploy.** There is no CMS, no
admin UI, and no way for a non-engineer to add a dish.

### Tier 2 — user state (runtime, per-viewer)

Provided by the Claude Artifacts runtime when the page is published, degrading
to in-memory when absent:

| Capability | Used for | Path | Scope |
|---|---|---|---|
| `db` | Pantry stock | `data/users/<uid>/pantry/<ingredientId>` | Private per viewer |
| `db` | Cook log + ratings + notes | `data/users/<uid>/cooked/<autoId>` | Private per viewer |
| `db` | Food diary | `data/users/<uid>/days/<date>` | Private per viewer |
| `db` | Body profile, target | `data/users/<uid>/profile` | Private per viewer |
| `user` | Opaque viewer id | — | Identity only, not an account |
| `sample` | Cooking coach, method translation | — | Per-call |

> **Was SEC-1, now fixed.** `pantry` and `cooked` were previously written to
> unnamespaced collections, so every viewer of a published page read and wrote
> the same ones. All storage now goes under `data/users/<uid>/`. Persistence
> therefore requires **both** the `db` and `user` capabilities: without a
> private path the app keeps state in memory rather than writing it somewhere
> shared. The consistency suite now fails the build if any `db` call uses a
> literal path.

`state.db` and `state.sample` are null when the file is opened directly from
disk. Every call site is guarded, so the app runs fully offline minus
persistence, the coach and translation.

---

## 4. Data flow

```
prototype.html parses
        │
        ├─ object literals become the catalogue (read-only)
        │
        └─ initCaps()  ──► window.claude.use('db' | 'sample' | 'user')
                             │            │
                     null on failure      ├─ subscribe pantry   (shared)
                     → in-memory only     ├─ subscribe cooked   (shared)
                                          └─ read private profile/days

user picks a dish
        │
  effectiveIngs(r) ── applies state.swaps ──► one ingredient list
        │
        ├─ coverage()       → pantry shortfall per line
        ├─ nutritionOf()    → kcal/macros, via EATEN yield correction
        ├─ allergyCheck()   → contains / check / advisory buckets
        └─ dietCheck()      → conflicts + rescuable substitutions

user ticks ingredients → state.need
        │
  sourcesFor(id, cc) ── NATIVE + SOURCE + STORE_META + PLATFORMS ──►
        └─ ranked stores, or an explicit "nothing here carries this"

user logs a cook
        │
  cookDish() ── subtract needOf() from pantry, floor at 0 ──► db write
```

---

## 5. Build-time pipeline (all currently unrun against live upstreams)

```
USDA FoodData Central ──► fdc-resolve.mjs  ──► rewrites NUTR in prototype.html
Wikidata              ──► names-resolve.mjs ──► rewrites ING_L10N
any schema.org/Recipe ──► jsonld-ingest.mjs ──► JSON draft, NEVER writes the app
prototype.html        ──► consistency-check.mjs ──► exit 0/1
```

`fdc-resolve.mjs` refuses to write a partial table and cross-checks that every
ingredient the app defines has a query (`checkCoverage()`), because an earlier
version would have silently deleted ten nutrition rows.

`names-resolve.mjs` now has an equivalent guard, tuned to the fact that it
merges row by row rather than rewriting a block: it refuses when nothing
resolved, and when failures outnumber successes. Exit `0` wrote everything,
`1` wrote with gaps, `2` refused and changed nothing. This was **BUG-1**.

---

## 6. Deployment

Today: published as a Claude Artifact (private link). No CI, no hosting, no
domain, no analytics, no error reporting.

`.github/workflows/ci.yml` exists but belongs to the forked Tauri app, builds
desktop binaries on three platforms, and **does not touch `passport-pantry/`**.
GitHub Actions is in any case disabled repository-wide, so no workflow has ever
run on this branch.
