# Current Status

**Reviewed 2026-09-21 at commit `c16be36`.** Every claim here was verified
against code or a recorded command run; see `SETUP_INSTRUCTIONS.md` for raw
output.

---

## One-line verdict

A genuinely good prototype of a hard product, with unusually honest data
handling, sitting in the wrong repository, with a data model that cannot
express its own core thesis. The privacy defect and the tooling bug found in
this review are **fixed** — see *Fixed* below.

---

## Fixed since the review

### SEC-1 — Pantry and cook log are shared across all viewers · **FIXED**

All eight `db` call sites now write under `state.privBase`
(`data/users/<uid>/`), the path the food diary already used. Verified: a source
scan finds no remaining literal collection path.

Consequences deliberately accepted:

- **Persistence now requires both `db` and `user`.** Without a private path
  there is nowhere safe to write, so the pantry stays in memory for the
  session. Losing a pantry on reload is an annoyance; writing one where others
  can read it is not. The Pantry tab now states which of the two is happening.
- **Ratings became personal, so the copy changed.** A shared `cooked`
  collection made "★ 4.2 from 3 cooks" read as a community average. It never
  was one, and now it certainly is not, so the badges read *"★ 4.2 · your 3
  cooks"* and *"You have not cooked this yet"*. A real community layer needs
  accounts and a separate moderated collection — Milestone 5.

A regression guard was added to the consistency suite: it fails the build if
any `state.db.collection(...)` or `state.db.doc(...)` call uses a literal path
instead of one prefixed with `state.privBase`. Verified by reintroducing the
bug, watching the suite fail, and reverting.

### BUG-1 — `names-resolve.mjs` reported success after total failure · **FIXED**

It now refuses to write in two cases, and reports what it actually did:

| Exit | Meaning |
|---|---|
| `0` | Wrote; everything resolved |
| `1` | Wrote; some ingredients stayed unresolved and keep their existing names |
| `2` | Refused to write; nothing was changed |

Refusals: **nothing resolved at all** (never legitimate — `--force` does not
override it) and **failures outnumbering successes** (the signature of a
network or User-Agent problem; `--force` does override this one).

The closing message now reports the run rather than asserting a state of the
whole table.

This is deliberately *less* strict than `fdc-resolve.mjs`, which refuses on any
failure. That script rewrites the whole `NUTR` block, where a missing row would
be deleted; this one merges row by row and leaves unresolved ingredients at
their curated values, so a legitimate partial run must stay possible.

Verified: total-failure run exits 2 and leaves `prototype.html` byte-identical
(the old version rewrote it), `--verify` still exits 1, and `--force` correctly
does not override the nothing-resolved refusal. The successful-write path and
the ratio refusal could not be exercised end-to-end because Wikidata is
unreachable from this environment; the decision predicate was verified across
all six input combinations instead.

---

## Defects

### ~~SEC-1 — Pantry and cook log are shared across all viewers~~ · **FIXED, kept for history**

`initCaps()` subscribes to, and `savePantryItem()` / `cookDish()` write to,
**unnamespaced** collections:

```js
state.db.collection('pantry')                       // prototype.html ~3402
state.db.doc('pantry/' + id).set(...)               // ~3430
state.db.collection('cooked')                       // ~3408
state.db.collection('cooked').add(entry)            // ~3565
```

Meanwhile the food diary and body profile *are* namespaced:

```js
state.privBase = 'data/users/' + uid + '/';         // ~3389
```

**Impact.** Anyone who opens the published link reads and writes everyone
else's pantry, and everyone's cook log — which carries a free-text `note`
field and star ratings. What a person buys and eats is personal data. The
in-app copy promises privacy for the *diary* and says nothing about the
pantry, so the promise is narrower than a reader would assume.

**Fixed.** Both now route through `privBase`. Any rows written by the old
shared behaviour are orphaned at the top level and should be treated as test
data and dropped.

### ~~BUG-1 — `names-resolve.mjs` reports success after total failure~~ · **FIXED, kept for history**

With every one of 63 lookups returning 403, the script printed
`Wrote 0 rows`, then `Every row now carries its Wikidata QID`, rewrote
`prototype.html`, and **exited 0**.

Three problems: a false success claim, an unconditional write, and a zero exit
code that would make CI or a scripted pipeline treat a total failure as a pass.
`fdc-resolve.mjs` handles the same situation correctly (exit 1, writes
nothing). The two scripts should share that posture.

**Fixed.** All three: refuses when nothing resolved, refuses when failures
outnumber successes, and the closing message reports the run.

### BUG-2 — Stale resolver query · **LOW**

`names-resolve.mjs` reports: `1 query(ies) match no app ingredient (harmless,
but stale): miso`. Left over from the `doubanjiang` work. Remove or map it.

### RISK-1 — Allergen tags are hand-authored and cannot be tested · **HIGH**

The consistency suite proves the allergen *logic* is sound across 14 allergens
× 43 dishes × every substitutable ingredient. Nothing can prove a tag was not
simply omitted. 178 ingredients were tagged by hand.

This is not a bug — it is an unverified surface, and it is the largest one in
the project. It needs a human domain review before anyone cooks from this.

### RISK-2 — Zero sourced nutrition values · **MEDIUM**

No row in `NUTR` carries an `fdc` id; all 178 are reference approximations and
42 are explicit proxy matches. The UI is honest about this on every screen. The
resolver is written, tested and unrun because no live USDA call has succeeded.

The calorie budget is therefore suitable for direction and habit, and not for
managing a medical condition. The app says so.

### RISK-3 — Shared repository with a forked upstream · **MEDIUM (was HIGH)**

The product lives inside a fork of an unrelated third-party Chinese desktop
application. **Downgraded** after the owner's decision to keep it here as a
separated module with an enforced boundary — see `MODULE_BOUNDARY.md`.

What the boundary now handles: coupling is zero in both directions and
`boundary-check.mjs` fails the build if that changes, so extraction remains a
one-command operation whenever §6 of that document says it is time.

What remains genuinely unresolved:

- A reviewer's first instinct (`npm install`, `npm run build`) at the root
  still builds the prompt manager. Mitigated by a pointer in the root README
  and by the module having its own `package.json` and scripts.
- CI still builds the wrong thing — no workflow runs `npm run check`.
- The MIT `LICENSE` still reads `Copyright (c) 2025 [Your Name or
  Organization]`, and the module has no licence of its own.
- The commit history of two unrelated products is interleaved. Only extraction
  fixes that, and it is not currently worth extraction.

### RISK-4 — Single 327 KB file · **MEDIUM**

`prototype.html` is 4,400+ lines of data and code in one file. It has been
workable so far and keeps the zero-dependency property. It will not survive
multiple recipes per dish, accounts, or a second developer without merge pain.

### PRIV-1 — Third-party font request · **LOW**

The page loads Google Fonts on every open, sending the viewer's IP and
user-agent to Google before any interaction. Self-hosting the two families
removes the request and the dependency.

---

## Feature status

See `FEATURE_GAPS.md` for the full fourteen-point audit with evidence.

**Complete (10):** country/region browsing · 43-dish catalogue ·
foundation-and-layers · canonical ingredients with refuse-to-guess unit
normalisation · five-locale ingredient naming with market phrases and RTL ·
allergen engine with three non-merging buckets · diet engine, 8 profiles ·
nutrition with yield correction · daily calorie budget with a correct safety
floor · location-relative sourcing across 87 countries.

**Partial (4):** pantry (works; now private per viewer, persists only when both
capabilities are present) · shopping list (works; not persisted) · cooking steps (content only; no guided mode) · translation (105
of 178 ingredients).

**Absent (5):** multiple recipes per dish · recipe videos · technique videos ·
user accounts · retailer APIs.

---

## What was changed during this review

Deliberately minimal. No feature changes, no framework changes, no redesign.

| Change | Why |
|---|---|
| **Fixed SEC-1** in `prototype.html` | Approved after the review. Pantry and cook log now write under the viewer's private path. |
| **Fixed BUG-1** in `tools/names-resolve.mjs` | Approved after the review. Refuses to write on a broken run; honest exit codes. |
| **Added** a privacy regression guard to the suite | So SEC-1 cannot silently return. |
| **Added** `passport-pantry/package.json` | Module manifest: own name, own scripts, zero dependencies, deliberately not a root workspace. |
| **Added** `tools/boundary-check.mjs` | Enforces `MODULE_BOUNDARY.md` in both directions. Verified by introducing a violation each way. |
| **Added** `docs/MODULE_BOUNDARY.md` | Purpose, dependencies, API boundaries, data ownership, and the criteria for later separation. |
| **Added** `passport-pantry/tools/consistency-check.mjs` | The suite existed only outside the repository. A handoff whose tests cannot be run by the recipient is not a handoff. Rewritten to be self-contained: it extracts the script block from `prototype.html` itself. Verified: exit 0. |
| **Added** `passport-pantry/.env.example` | Variable names only, no values. |
| **Added** `docs/` (7 files) | This documentation. |
| **Updated** `.gitignore` | Added the two resolver cache directories and `.env` patterns. Neither was previously ignored. |
| **Removed** two empty cache directories | Created by test runs; not source. |

No source file was deleted. `prototype.html` and the three original tools are
untouched.

---

## Quality signals worth preserving

Noted because a new agent might "clean them up" and lose something:

- `toGrams()` returns `null` rather than a guess when a conversion is
  undefined, and every caller propagates it.
- The allergen engine keeps *contains* / *check the label* / *advisory* as
  three buckets that never merge, and `safeAlts()` filters on `has` while
  attaching a caution for `check`.
- Four dishes refuse to offer a substitution and explain why instead.
- Nutrition is corrected for what is actually eaten (`EATEN`), with a written
  justification per correction (`EATEN_NOTE`).
- No fabricated identifiers: the provenance check fails the build if an FDC id
  or Wikidata QID appears without a resolver run.
- The safety floor fires only on a deliberate deficit — an earlier version told
  a 45 kg woman with a normal BMI to gain weight.
- Commerce tiers describe what each API can *actually* do; most are vendor-side
  and cannot build a shopper's basket, and the code says so.
