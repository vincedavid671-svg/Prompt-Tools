# Passport Pantry — Project Overview

**Status:** working prototype, pre-alpha. Not deployed, no users, no accounts.
**Last reviewed:** 2026-09-21
**Reviewed at commit:** `c16be36`

---

## Read this first: the repository is not what its name says

This repository is `vincedavid671-svg/Prompt-Tools`, a **fork of
`jwangkun/Prompt-Tools`** — an unrelated open-source Chinese desktop
application for managing AI prompts, built with Tauri 2, Vite and TypeScript.

Passport Pantry was developed inside that fork, as a single subdirectory:

```
Prompt-Tools/                  <- forked Tauri prompt manager (NOT ours)
├── src/, src-tauri/           <- that application's source
├── package.json               <- that application's manifest
├── .github/workflows/         <- that application's CI, builds Tauri binaries
├── README.md                  <- that application's README, in Chinese
├── LICENSE                    <- MIT, "Copyright (c) 2025 [Your Name...]"
│
├── passport-pantry/           <- THE COOKING APPLICATION. This is our project.
└── docs/                      <- this handoff documentation
```

**Nothing outside `passport-pantry/` and `docs/` belongs to this product.**
A reviewing agent that runs `npm install` or `npm run build` at the repository
root is building the prompt manager, not the cooking app.

Extracting `passport-pantry/` into its own repository is the first
recommendation in `NEXT_STEPS.md`. It is a prerequisite for almost everything
else, and it is cheap to do now and expensive to do later.

---

## What the product is

A travel-memory recipe app. The premise: you ate something on a trip, you want
to cook it at home, and the hard part is not the recipe — it is knowing what
the ingredient is called where you live, whether anyone near you sells it, and
what to do when they do not.

Three ideas carry the product:

1. **Foundation and layers.** Every dish has a small set of non-negotiables
   that make it that dish, and a larger set of variables every cook moves
   around. Separating them teaches technique, structures comparison between
   versions, and solves attribution — a technique is not copyrightable, so the
   foundation can be written in our own words and other people's videos
   pointed at it.
2. **Location-relative difficulty.** Fish sauce is a shelf staple in Hanoi and
   a specialty import in Warsaw. The app resolves an ingredient to ranked
   stores *for the country you are shopping from*, and says plainly when
   nothing reliably carries it.
3. **Purchase-anchored pantry.** Stock is inferred from what you bought minus
   what logged cooks consumed. Users are never asked to weigh anything.

## Current scale

| | |
|---|---|
| Dishes | 43 |
| Countries (dishes) | 43 |
| Regions | 19 |
| Canonical ingredients | 178 |
| Localised ingredient names | 105 across 5 locales |
| Allergens tracked | 14 (US Big 9 + EU additions) |
| Diet profiles | 8 |
| Delivery/retail platforms | 24, reaching 87 shoppable countries |

## What this is *not* yet

- Not a multi-user product. There is no account system and no server.
- Not nutritionally sourced. No value carries a USDA FoodData Central id;
  every figure is a reference approximation, labelled as such in the UI.
- Not commerce-integrated. Store links are search-engine queries.
- Not kitchen-tested. Every recipe is labelled `Draft · untested` in the UI.

## Documentation map

| File | Answers |
|---|---|
| `PROJECT_OVERVIEW.md` | What is this, and what shape is the repo in |
| `CURRENT_STATUS.md` | What works, what half-works, what is broken |
| `ARCHITECTURE.md` | Stack, structure, runtime, data flow |
| `DATA_MODEL.md` | Entities, current vs. recommended relationships |
| `FEATURE_GAPS.md` | The 14-point capability audit, with evidence |
| `SETUP_INSTRUCTIONS.md` | Exact commands, requirements, recorded results |
| `NEXT_STEPS.md` | Ordered milestones and the reasoning behind the order |

## A note on tooling

Product documentation, research and requirements notes may live in Obsidian.
**The application itself must stay a conventional software project** — a
filesystem tree of source files under version control, buildable and runnable
without Obsidian. Nothing in this repository depends on Obsidian today, and
nothing should.
