# Current Status

**Reviewed 2026-09-21 at commit `c16be36`.** Every claim here was verified
against code or a recorded command run; see `SETUP_INSTRUCTIONS.md` for raw
output.

---

## One-line verdict

A genuinely good prototype of a hard product, with unusually honest data
handling, sitting in the wrong repository, with one real privacy defect, one
real tooling bug, and a data model that cannot express its own core thesis.

---

## Defects

### SEC-1 — Pantry and cook log are shared across all viewers · **HIGH**

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

**Fix.** Route both through `privBase` exactly as the diary does, and treat
existing rows as test data. Small change, high value. Do it first.

### BUG-1 — `names-resolve.mjs` reports success after total failure · **MEDIUM**

With every one of 63 lookups returning 403, the script printed
`Wrote 0 rows`, then `Every row now carries its Wikidata QID`, rewrote
`prototype.html`, and **exited 0**.

Three problems: a false success claim, an unconditional write, and a zero exit
code that would make CI or a scripted pipeline treat a total failure as a pass.
`fdc-resolve.mjs` handles the same situation correctly (exit 1, writes
nothing). The two scripts should share that posture.

**Fix.** Refuse to write when `added === 0`; exit non-zero when the failure
count exceeds a threshold; make the closing message conditional on what was
actually written.

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

### RISK-3 — Wrong repository · **HIGH (process, not code)**

The product lives inside a fork of an unrelated third-party Chinese desktop
application. Consequences: a reviewer's first instinct (`npm install`,
`npm run build`) builds the wrong thing; CI builds the wrong thing; the README
describes the wrong thing; the MIT `LICENSE` still reads
`Copyright (c) 2025 [Your Name or Organization]`; and the commit history of two
unrelated products is interleaved.

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

**Partial (4):** pantry (works; shared — SEC-1) · shopping list (works; not
persisted) · cooking steps (content only; no guided mode) · translation (105
of 178 ingredients).

**Absent (5):** multiple recipes per dish · recipe videos · technique videos ·
user accounts · retailer APIs.

---

## What was changed during this review

Deliberately minimal. No feature changes, no framework changes, no redesign.

| Change | Why |
|---|---|
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
