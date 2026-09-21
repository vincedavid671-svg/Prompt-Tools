# Feature Gaps — Capability Audit

Answers the fourteen-point support question. Every row was verified against
code at commit `c16be36`; the evidence column names the symbol or line so the
claim can be rechecked rather than trusted.

**Legend:** ✅ works · 🟡 partial · ❌ absent

---

## The audit

| # | Capability | | Evidence | What is actually true |
|---|---|---|---|---|
| 1 | Countries & regions | ✅ | `COUNTRIES`, `REGION_OF`, `REGION_NOTE` | 43 dish countries in 19 regions; 87 shoppable countries. Two separate tables joined by country-name string, not FK. |
| 2 | Dishes | ✅ | `R[]`, 43 entries | Each has origin, native name, blurb, difficulty, time, foundation and ≥3 layers. |
| 3 | **Multiple recipes per dish** | ❌ | `R[]` flat; all 43 `dish` names unique | **Not supported.** Dish and Recipe are one object. No author, no per-recipe rating, no versions. See `DATA_MODEL.md` §1.1 / DM-1. |
| 4 | Canonical ingredients | ✅ | `ING`, 178 entries | Stable ids, purchase class, unit conversions. `toGrams()` returns `null` rather than guessing. |
| 5 | Alternate & regional names | ✅ | `ING_L10N`, 105 entries | 5 locales incl. RTL Arabic. 28 carry a `mkt` market phrase. 28 culturally specific names excluded from automation and hand-curated. |
| 6 | Ingredient substitutions | ✅ | `SUBS` (diet), `ALT` (allergen), `CANNOT_SUB` | Correctly split by reason. Every entry carries a prose cost. Four dishes decline to substitute and say why. |
| 7 | Virtual pantry | 🟡 | `state.pantry`, `EXAMPLE_PANTRY`, `savePantryItem()` | Works, but ships seeded with 16 example items (labelled in UI) and **writes to a shared collection** — see SEC-1. |
| 8 | Pantry→recipe matching | ✅ | `coverage()`, `shortfallOf()`, `needOf()` | Per line: have / partial / none / not-tracked. Unconvertible units propagate as `null`, never as "enough". |
| 9 | Shopping lists | 🟡 | `state.need`, `buildList()` | One in-memory list. **Not persisted** — lost on reload. No multiple lists, no sharing, no check-off. DM-7. |
| 10 | Guided cooking steps | 🟡 | `r.steps[]`, `viewRecipe()` | Numbered steps with heat notes, rendered well. Not *guided*: no step-by-step mode, no timers, no progress, no wake-lock, no hands-free. |
| 11 | YouTube videos | ❌ | `ytUrl`, line ~3727 | One outbound link to a YouTube **search results page**. No Data API, no stored video, no embed, no metadata. The UI documents the intended design inline. |
| 12 | Technique videos | ❌ | — | No `Technique` entity anywhere. Not modelled, not stubbed. |
| 13 | User accounts | ❌ | `state.user.id()`, `privBase` | No auth, no registration, no login, no session, no password, no email. The `user` capability yields an opaque viewer id used only as a storage path segment. |
| 14 | Retailer / delivery integration | ❌ | `PLATFORMS`, `LOCAL`, `sourcesFor()`, line ~4214 | 24 platforms and their coverage are **catalogued**, and each is tiered by what its API can actually do. Zero API calls are made. Every store link is a DuckDuckGo search query. |

**Score: 5 complete, 4 partial, 5 absent.**

---

## Complete and working

- Country/region browsing with a written note per region
- The 43-dish catalogue with foundation-and-layers per dish
- Canonical ingredient registry with unit normalisation that refuses to guess
- Five-locale ingredient naming, including market phrases and RTL
- The allergen engine: three buckets that never merge, hidden-allergen
  surfacing, substitution filtering, and per-dish refusal where no swap saves
  the dish
- The diet engine: 8 profiles, conflict detection, rescuable-dish status
- Nutrition per serving with yield correction for what is actually eaten
- Daily calorie budget with Mifflin-St Jeor, macro frameworks, and a safety
  floor that fires only on deliberate deficits
- Location-relative sourcing: 178 ingredients × 87 countries, with explicit
  dead ends rather than empty screens
- The consistency suite: `tools/consistency-check.mjs`, exits 0/1

## Partial

| Feature | Works | Missing |
|---|---|---|
| Pantry | Ledger, depletion, refill, example seed | Per-user isolation (SEC-1); manual correction UI; barcode/receipt capture; expiry |
| Shopping list | Per-ingredient ticking, shortfall maths, ranked stores, hardest-first ordering | Persistence, multiple lists, check-off, sharing, quantity editing |
| Cooking steps | Content, heat notes, translation | Step mode, timers, progress, screen wake-lock, voice |
| Nutrition | Structure, yield correction, proxy flagging, net carbs when fibre known | **No sourced values at all** — 0 of 178 carry an FDC id |
| Translation | 5 locales, RTL, safety copy never machine-translated | Only 105 of 178 ingredients localised; method translation requires the `sample` capability |

## Absent

Multiple recipes per dish · recipe videos · technique videos · user accounts ·
retailer APIs · content management · offline/PWA · URL routing · analytics ·
error reporting · rate limiting · backup and restore.

---

## Placeholder and mock data

| What | Where | Honest in UI? |
|---|---|---|
| Example pantry, 16 items | `EXAMPLE_PANTRY` | ✅ banner: "Showing example stock" |
| All 43 recipes untested | `R[]` | ✅ badge: `Draft · untested` |
| Empty attribution slot | `viewRecipe()` | ✅ "No source attached" |
| 0/178 nutrition values sourced | `NUTR` | ✅ provenance bar per recipe |
| 42 proxy nutrition matches | `NUTR_PROXY` | ✅ "Closest match, not exact" |
| Store availability | `sourcesFor()` | ✅ "sourcing judgements, not live stock" |
| YouTube panel | `viewRecipe()` | ✅ states what the built version would do |

No `TODO`, `FIXME`, `mock`, or `lorem` markers exist in the source. The project
labels its own gaps in user-facing copy rather than in comments — unusual, and
worth preserving.

---

## Risk ranking of the gaps

| Rank | Gap | Why it ranks here |
|---|---|---|
| 1 | Shared pantry/cook log (SEC-1) | Privacy defect in shipped behaviour |
| 2 | Unverified allergen tags | Safety-critical, hand-authored, untestable by the suite |
| 3 | No multiple recipes per dish | Blocks the core product thesis; costs more the longer it waits |
| 4 | No sourced nutrition | Calorie feature is unsuitable for anyone managing a condition |
| 5 | No accounts | Blocks every multi-user feature and any commerce |
| 6 | No shopping-list persistence | Most visible day-to-day annoyance |
| 7 | No videos | Named product feature, entirely unbuilt |
| 8 | No retailer APIs | Revenue path, but correctly deferred — most APIs point the wrong way |
