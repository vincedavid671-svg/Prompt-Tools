# Setup Instructions

**All commands below were executed during the review on 2026-09-21 at commit
`c16be36`. Recorded output is real, not illustrative.**

---

## Required software

| Software | Version required | Version tested | Needed for |
|---|---|---|---|
| Node.js | ≥ 18 (native `fetch`) | **v22.22.2** | All four `tools/` scripts |
| npm | any | 10.9.7 | Nothing in the cooking app; root app only |
| A modern browser | Chrome/Safari/Firefox current | — | Running the app |
| git | any | — | Version control |

**Not required:** no database server, no Docker, no Python, no Rust, no build
toolchain, no package install step. The cooking application has **zero
dependencies**.

> Rust and the Tauri CLI *are* required to build the application at the
> repository root — but that is the forked prompt manager, not this product.
> See `PROJECT_OVERVIEW.md`.

---

## Running the application

There is no server and no build.

```bash
cd passport-pantry
open prototype.html          # macOS
# xdg-open prototype.html    # Linux
# start prototype.html       # Windows
```

Or serve it, which is closer to how it behaves when published:

```bash
cd passport-pantry
python3 -m http.server 8000
# then open http://localhost:8000/prototype.html
```

### What works when opened from disk

Everything except three things that need the Claude Artifacts runtime:

| Works offline from `file://` | Needs the published runtime |
|---|---|
| All 4 tabs, all 43 recipes | Pantry persistence (`db`) |
| Pantry ledger (in memory, seeded) | Cook log persistence (`db`) |
| Shopping list and store ranking | Private food diary (`db` + `user`) |
| Allergen and diet engines | AI cooking coach (`sample`) |
| Nutrition, daily budget, yield correction | Method translation (`sample`) |
| Language switching, RTL Arabic | — |

Every capability call site is guarded, so absence degrades rather than throws.
The UI states which features are unavailable rather than failing silently.

---

## Environment variables

The **application reads none**. Copy `passport-pantry/.env.example` to `.env`
only if you intend to run the resolver scripts.

| Variable | Used by | Required? |
|---|---|---|
| `FDC_API_KEY` | `tools/fdc-resolve.mjs` | Yes, to resolve nutrition. Free key, no card. |
| `WIKIDATA_USER_AGENT` | `tools/names-resolve.mjs` | Optional; polite for bulk requests |
| `YOUTUBE_API_KEY` | — | Not yet used; reserved |
| `INSTACART_API_KEY`, `KROGER_*`, `SALLA_*`, `ZID_*` | — | Not yet used; reserved |

No secret is committed. `.env` is gitignored; `.env.example` holds names only.

---

## Test results — recorded 2026-09-21

### 1. Consistency suite ✅ PASS

```
$ cd passport-pantry && node tools/consistency-check.mjs

registry / dishes / diets / allergens / nutrition / budget / sourcing /
language / privacy / provenance   ← all sections silent = all passed

43 dishes · 43 countries · 19 regions · 178 ingredients · 14 allergens
· 8 diets · 5 locales · 105 localised ingredients · 87 served countries

All checks passed
exit=0
```

### 2. Ingester self-test ✅ PASS

```
$ node tools/jsonld-ingest.mjs --selftest

Quantity parsing:  9 forms incl. vulgar fractions, mixed numbers, ranges
Line parsing:      7 lines, incl. ounce and pound conversion to grams
Matching — the safety-critical part:
  ✓ tamari and soy sauce stay distinct (wheat-bearing vs not)
  ✓ unknown ingredients return null rather than a nearest guess
  ✓ ambiguous text never reaches high confidence
JSON-LD extraction:
  ✓ finds Recipe inside @graph, flattens HowToStep instructions
  ✓ description and images are never read into the draft

Parser tests passed
exit=0
```

### 3. `fdc-resolve.mjs` — argument handling ✅ / network ⚠️

```
$ node tools/fdc-resolve.mjs
No API key. Pass --key KEY or set FDC_API_KEY.
Free signup: https://fdc.nal.usda.gov/api-key-signup
exit=2                                        ← correct: refuses to proceed

$ node tools/fdc-resolve.mjs --key DUMMY --verify
Resolving 178 ingredients against FoodData Central
  ✗ flour   403 Forbidden for https://api.nal.usda.gov/.../search?...&api_key=KEY
  ... (178 failures)
Fibre available for 0 ingredients
--verify: nothing written.
exit=1                                        ← correct: non-zero on total failure
```

Two things this proves:
- **The API key is redacted in error output** (`api_key=KEY`). Verified at
  `fdc-resolve.mjs:327`.
- **The script refuses to write a partial table.** Nothing was modified.

The 403 came from this environment's outbound proxy and/or USDA rejecting the
dummy key; with only a dummy key the two cannot be distinguished. **The
resolver has never been run successfully against live USDA.** That is why all
178 nutrition rows lack an FDC id.

### 4. `names-resolve.mjs` — ✅ BUG-1 FIXED, re-verified

Before the fix, every lookup failed with 403 and the script still printed
`Every row now carries its Wikidata QID`, rewrote `prototype.html`, and exited
`0`. After the fix:

```
$ node tools/names-resolve.mjs
Note: 1 query(ies) match no app ingredient (harmless, but stale): miso
Resolving 63 ingredient names into: ar, es, fr
  ✗ cilantro   403 Forbidden
  ... (63 failures)

Nothing resolved. Not writing.
All 63 lookup(s) failed — check the network, the endpoint and any
User-Agent policy before re-running.
exit=2                                        ← refuses, changes nothing

$ diff prototype.html <copy taken before the run>
                                              ← byte-identical ✓

$ node tools/names-resolve.mjs --verify
exit=1                                        ← unchanged behaviour

$ node tools/names-resolve.mjs --force
Nothing resolved. Not writing.
exit=2                    ← --force correctly does NOT override this refusal
```

**Exit contract now:** `0` wrote everything · `1` wrote with gaps remaining ·
`2` refused and changed nothing.

**Not verifiable from here:** the successful-write path and the
failures-outnumber-successes refusal both need live Wikidata, which is
unreachable in this environment. The decision predicate was instead verified
across all six combinations of (resolved, failures, force), and the file
parses.

Still outstanding: the stale `miso` query matches no app ingredient. Harmless
warning, one-line fix, recorded as **BUG-2** and not yet approved.

### 5. Root Tauri project — ❌ does not build (expected)

```
$ npm test
> echo "No tests specified yet" && exit 0        ← stub, always passes

$ npm run build
src/main.ts(2,24): error TS2307: Cannot find module '@tauri-apps/api/core'
src/updater.ts(50,42): error TS7006: Parameter 'event' implicitly has 'any' type
... (dependencies absent)
```

Expected: `node_modules` is not present and is intentionally not shipped. This
is the forked prompt manager, not the cooking app. To build it you would need
`npm install` plus a Rust toolchain. **Not required for this product.**

### 6. CI — none runs

`.github/workflows/ci.yml` builds Tauri binaries on three platforms and does
not reference `passport-pantry/`. GitHub Actions is disabled repository-wide;
no workflow has ever run on this branch.

---

## Working with the resolvers

```bash
cd passport-pantry

# Nutrition — rewrites the NUTR block in place. Commit the diff.
node tools/fdc-resolve.mjs --key YOUR_KEY            # resolve and write
node tools/fdc-resolve.mjs --key YOUR_KEY --verify   # report drift, write nothing
node tools/fdc-resolve.mjs --key YOUR_KEY --only salt,flour

# Ingredient names — rewrites ING_L10N. READ BUG-1 FIRST.
node tools/names-resolve.mjs --langs ar,es,fr
node tools/names-resolve.mjs --verify

# Import a recipe draft. Never writes into the app.
node tools/jsonld-ingest.mjs --url https://example.com/some-recipe
node tools/jsonld-ingest.mjs --selftest
```

Responses are cached under `tools/.fdc-cache/` and `tools/.wd-cache/`, both now
gitignored. Re-runs are free and do not re-consume quota.

**Always run `node tools/consistency-check.mjs` after any resolver run and
before any commit.** Its `privacy` section is a regression guard for SEC-1: it
fails if any `state.db` call uses a literal path rather than one prefixed with
`state.privBase`. Verified by reintroducing the bug and watching it fail.

---

## Handoff package hygiene

Verified absent at review time: `node_modules`, `dist`, `dist-ssr`, `build`,
`.cache`, `.parcel-cache`, `coverage`, `out`, `target`, `src-tauri/target`, and
any `*.log`. Two empty cache directories created during testing were removed
and added to `.gitignore`.

Repository size is **10.3 MB**, of which 9.8 MB is `.git` history. The working
tree is 452 KB for the cooking app and ~3.1 MB for the inherited Tauri project.

No secrets are committed. A scan of all tracked files for key/token/password
patterns returned only a correct `${{ secrets.GITHUB_TOKEN }}` reference in the
inherited workflow and the two `api_key=${KEY}` URL constructions in
`fdc-resolve.mjs`, where `KEY` comes from argv or env at runtime.
