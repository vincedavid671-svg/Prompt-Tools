# Next Steps

Ordered. The order is the recommendation — each milestone removes a constraint
the next one would otherwise hit.

**Milestone 1 is complete.** BUG-1 from Milestone 0 is also complete. Both were
approved and done after the initial review; see `CURRENT_STATUS.md` → *Fixed*.
Everything else below is unstarted and awaiting approval.

---

## Milestone 0 — Handoff hygiene · mostly done

1. ~~**Extract `passport-pantry/` into its own repository.**~~ — **decided
   against, for now.** The module stays in this repository with an enforced
   boundary instead. See `MODULE_BOUNDARY.md` for the rules, and §6 of that
   document for the three conditions that would justify revisiting:
   independent deployability, a second consumer, or a separate security and
   release lifecycle. **Done:** module manifest, boundary check wired into
   `npm run check`, purpose/dependencies/API/data-ownership documented.

   Still outstanding from this item: a LICENCE naming a real copyright holder
   for the module's own content, and a CI workflow that runs
   `cd passport-pantry && npm run check`. Neither requires extraction.
2. ~~Fix **BUG-1**~~ — **done.** `names-resolve.mjs` now refuses to write on a
   broken run and has an honest exit contract (0 wrote all / 1 wrote with gaps
   / 2 refused). **BUG-2** remains: a stale `miso` query in its MAP matches no
   app ingredient and prints a warning every run. One line.
3. Wire the consistency suite to a pre-commit hook or CI. It is the only
   automated protection the catalogue has and currently nothing runs it.

*Why first:* a boundary that is documented but not enforced decays quietly —
one import, one shared config, and a later extraction stops being cheap. The
check exists so the decision to stay stays reversible.

---

## ~~Milestone 1 — Fix the privacy defect~~ · **DONE**

`pantry` and `cooked` now write under `state.privBase`, as the food diary
already did, and a regression guard in the consistency suite fails the build if
any `db` call uses a literal path.

Two follow-ups this created, neither urgent:

- **Orphaned rows.** Anything written by the old shared behaviour still sits at
  the top level of the store. Treat as test data and drop.
- **Ratings are now explicitly personal.** The badges say *"your 3 cooks"*
  rather than *"from 3 cooks"*. A real community rating layer needs accounts
  and a separate moderated collection — folded into Milestone 5.

---

## Milestone 2 — Allergen tag review · **pass one done, pass two outstanding**

**Done:** systematic first pass, five defects found and fixed, regression test
added, and a per-ingredient sign-off sheet generated so pass two is a review
rather than a repeat. See `ALLERGEN_REVIEW.md`.

**Outstanding and unchanged in importance:** a qualified human has not signed
any of it. Also open from that pass, needing your decision: the diet
substitution path does not check the user's allergens (B1), and lupin — one of
the EU's declarable fourteen — is not tracked (C1).

Original scope, still the thing to do:

Have a second qualified pair of eyes review all 178 ingredients against the 14
allergens. Priority order: the `has` bucket, then `hidden`, then `check`.

Produce a signed-off checklist committed alongside the data, so the next
reviewer can see what was verified and when.

*Why before new features:* this is the largest unverified safety surface in the
product, it does not get easier as the catalogue grows, and no amount of test
coverage substitutes for it.

---

## Milestone 3 — Split Dish from Recipe · ~1 week · **the pivotal one**

Implement `Dish 1──n Recipe` per `DATA_MODEL.md` Part 3. The existing 43 become
43 dishes with one recipe each, `is_tested = false`, `author_id = NULL`.

Unblocks, in one change: multiple recipes per dish, creator attribution,
per-recipe ratings, recipe-level licensing, and a `Video` that can point at
*a version* of a dish rather than at a search query.

*Why here and not later:* the cost scales with catalogue size and with every
feature built on the fused shape. It is cheaper at 43 dishes than it will ever
be again.

---

## Milestone 4 — Run the resolvers · ~1 day, gated on network access

Obtain a free FDC key, run `fdc-resolve.mjs`, commit the resolved `NUTR` block.
Then `names-resolve.mjs` for the remaining 73 unlocalised ingredients.

Turns "no value is sourced" into "most values are sourced and cite an id", and
switches the provenance bar in the UI from amber to green. Note that the proxy
count will not fall much — USDA is a US database and this catalogue is not.

---

## Milestone 5 — Persistence and accounts · ~2 weeks

Shopping-list persistence is the most visible daily annoyance and is a
prerequisite for anything shared.

Recommendation: **delegate authentication.** Do not build password storage.
Email magic-link or an OAuth provider, with `User` holding no credentials
column. This is also the point to choose a real datastore — the data model is
relational and Postgres is the boring correct answer.

---

## Milestone 6 — Videos · ~1–2 weeks

YouTube Data API v3 for search and metadata; official embed for playback so the
creator keeps the view and the revenue. Two kinds from the start — `recipe` and
`technique` — per `DATA_MODEL.md` §1.4, because retrofitting the distinction
later means re-tagging every video.

Do not pull transcripts. `captions.download` only works on videos you own, and
the scraping libraries violate YouTube's developer policies. Description text
and metadata are the legitimate surface.

---

## Milestone 7 — Commerce · ~3+ weeks, revenue-gated

In the order the tiers actually pay off:

1. **Affiliate links** — Amazon.sa and Amazon US. Works today, no API gate.
2. **Instacart Developer Platform** — the one true cart API. US/Canada only.
3. **Kroger Cart API** — US only, OAuth.
4. **Salla / Zid merchant apps** — Saudi, per-merchant not per-shopper.

Everything else in `PLATFORMS` is vendor-side and cannot build a shopper's
basket. That finding is already documented and should not be re-litigated.

---

## Recommended next milestone

**Milestone 2 — the allergen tag review.**

Milestone 1 is done, BUG-1 is done, and the module boundary is now established
and enforced. What remains at the top of the list is the largest unverified
safety surface in the project: 178 ingredients tagged by hand against 14
allergens, where the test suite can prove the logic and can prove nothing about
an omitted tag.

It is not an engineering task, which is exactly why it keeps not happening. It
does not get easier as the catalogue grows.

The two small leftovers from Milestone 0 — a real LICENCE for the module and a
CI job running `npm run check` — are worth folding into whatever is done next,
since neither takes an hour.

---

## Explicitly not recommended

| Not this | Why |
|---|---|
| Rebuilding in React/Next/Vue now | The zero-dependency single file is an asset at this stage. Reach for a framework when accounts and routing arrive (Milestone 5), not before. |
| Rebuilding the app in Obsidian | Obsidian is for product documentation, research and notes. The application stays a conventional software project. |
| Importing a bulk recipe dataset | RecipeNLG and Recipe1M+ are non-commercial-licensed. Already assessed; see the PR description. |
| Adding dishes 44+ before Milestone 3 | Every dish added pre-split makes the split more expensive. |
| Scraping YouTube transcripts | Violates developer policy. Already assessed. |
| "Tidying" the honesty features | The `null` returns, the three allergen buckets, the refusal cases and the provenance flags are deliberate. See `CURRENT_STATUS.md`. |
