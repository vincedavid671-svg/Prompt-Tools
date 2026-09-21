# Documentation index

Handoff documentation for **Passport Pantry**, the cooking application in
`../passport-pantry/`.

Start with `PROJECT_OVERVIEW.md` — it explains why this repository is named
after a different application. Then read `MODULE_BOUNDARY.md` before changing
anything at the module's edges; it is the governing document for what the
module may depend on, what may depend on it, and who owns which data.

| Document | Read it for |
|---|---|
| [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) | What the product is; the two-module repository; scale |
| [MODULE_BOUNDARY.md](MODULE_BOUNDARY.md) | **Governing document for the module's edges.** Purpose, dependencies, API boundaries, data ownership, and when to separate |
| [CURRENT_STATUS.md](CURRENT_STATUS.md) | Defects, risks, feature status, what this review changed |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Stack, file structure, storage, data flow |
| [DATA_MODEL.md](DATA_MODEL.md) | Entity definitions, current vs. recommended schema |
| [FEATURE_GAPS.md](FEATURE_GAPS.md) | The 14-point capability audit with evidence |
| [ALLERGEN_REVIEW.md](ALLERGEN_REVIEW.md) | **Safety.** Pass-one findings, and the sign-off sheet pass two works from |
| [SETUP_INSTRUCTIONS.md](SETUP_INSTRUCTIONS.md) | Exact commands and recorded test output |
| [NEXT_STEPS.md](NEXT_STEPS.md) | Ordered milestones, and what not to do |

**Scope rule:** Obsidian may hold product documentation, research,
requirements and development notes. The application itself remains a
conventional software project under version control.

Reviewed 2026-09-21 at commit `c16be36`.
