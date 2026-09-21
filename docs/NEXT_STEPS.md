# Next Steps

Ordered. The order is the recommendation — each milestone removes a constraint
the next one would otherwise hit.

**Nothing below has been started. Awaiting approval.**

---

## Milestone 0 — Handoff hygiene · ~half a day · no approval needed to plan

1. **Extract `passport-pantry/` into its own repository.**
   `git subtree split` or a fresh repo preserving the 14 commits that touch it.
   Then: its own README, its own LICENCE with a real copyright holder, `docs/`
   moved to the new root, and a CI workflow that actually runs
   `tools/consistency-check.mjs`.
2. Fix **BUG-1** and **BUG-2** in `names-resolve.mjs` — an hour of work that
   stops a silent failure from reaching a commit.
3. Wire the consistency suite to a pre-commit hook or CI. It is the only
   automated protection the catalogue has and currently nothing runs it.

*Why first:* everything after this is more expensive while the product lives
inside someone else's forked application, and while a resolver can report
success after failing.

---

## Milestone 1 — Fix the privacy defect · ~1 day · **do this before any demo**

Route `pantry` and `cooked` through `state.privBase`, as the food diary already
is. Treat existing rows as test data and drop them.

*Why here:* it is small, it is shipped behaviour, and it is the one defect that
would be embarrassing in front of a user or an investor.

---

## Milestone 2 — Allergen tag review · ~2–3 days, mostly not engineering

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

**Milestone 0 plus Milestone 1**, together, as one piece of work before any
feature development.

They are roughly a day and a half combined. They fix the two things that are
actually wrong right now — a product living in a stranger's repository, and a
shared pantry that should be private — and they put the test suite somewhere a
reviewing agent can run it. Everything else is a choice about direction;
these two are just correct.

If only one thing is approved, make it Milestone 1.

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
