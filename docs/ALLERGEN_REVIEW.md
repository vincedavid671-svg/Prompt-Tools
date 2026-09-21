# Allergen Review — Milestone 2

**Status: FIRST PASS COMPLETE. NOT SIGNED OFF.**
**Pass 1 by:** Claude (automated + systematic), 2026-09-21, commit `651d3e1`
**Pass 2 by:** _______________________  date: __________  ← **required before launch**

---

## What this is, and what it is not

The consistency suite proves the allergen *logic* is sound: across 14 allergens
× 43 dishes × every substitutable ingredient, no substitution offered for an
allergen contains that allergen, no label-dependent allergen leaks into the
"contains" bucket, and no dish gives a false all-clear. That has always passed.

**No test can prove a tag was not simply omitted.** 178 ingredients were tagged
by hand. An ingredient with no entry is treated as allergen-free, silently.
That is the gap this review exists to close, and the reason it cannot be closed
by software alone.

This document is **pass one**: a systematic sweep that found and fixed five
defects, plus a generated sign-off sheet so pass two is a review rather than a
repeat. Pass two needs a person with food-allergy or food-safety competence.
I am not that, and this document should not be read as if I were.

---

## Method

1. Dumped all 178 ingredients and their current tags from the running app,
   not from memory or from the source by eye.
2. Split them by risk: ingredients that **block** dishes (`has`), ingredients
   that only caution (`check`), ingredients with **no entry** that are offered
   as **substitutions**, and everything else.
3. Traced every substitution path — `ALT` (allergen) and `SUBS` (diet) — and
   asked of each target: *is this handed to someone avoiding the very thing it
   might contain?*
4. Scanned for **notes that name an allergen the tags omit**, on the reasoning
   that a note naming an allergen is the author having thought about it; if
   the tags disagree, one of the two is wrong.
5. Checked the tracked allergen list against the EU's declarable fourteen.

---

## Findings applied

All five are additions to the `check` bucket, which **cautions without
blocking**. That is the fail-safe direction: the cost of a wrong caution is a
label read unnecessarily; the cost of a missing one is not symmetrical.

### A1 · `flour_gf` — note said wheat, tag said gluten · **HIGH**

Note read *"uncertified ones may be milled alongside wheat"*, tag read
`check:['gluten']`. Shared milling is a **wheat** exposure. Because a
wheat-allergic user's allergy is `wheat` and not `gluten`, the caution never
fired for the exact person it was written for.

`check:['gluten']` → `check:['wheat','gluten']`

### A2 · `milk_oat` — same pattern · **HIGH**

Note read *"Oats are often processed with wheat"*, tag read `check:['gluten']`.
Offered as the milk substitute. Same fix, same reasoning.

### A3 · `flour_rice` — no entry at all, offered to wheat avoiders · **HIGH**

`ALT.flour` offers rice flour to people avoiding wheat and gluten, and rice
flour had **no allergen entry**, so it was presented as unconditionally clean.
Rice flour is naturally free of both and very commonly milled on shared lines
with wheat, and is rarely certified.

Added `check:['wheat','gluten']` with a note.

### A4 · `anchovy_dr` — crustacean cross-contact, in the crustacean swap · **HIGH**

Dried anchovy is the substitution offered when belacan is removed **for a
crustacean allergy**. Dried anchovies are routinely dried, sorted and packed
alongside dried shrimp in the same facilities, and sold from the same counter.

Added `check:['crustacean']` with a note naming why it matters here
specifically. The existing `has:['fish']` was already correct.

### A5 · `oil_veg` — "neutral cooking oil" in 18 of 43 dishes · **HIGH**

*Vegetable oil* is a category, not an ingredient. Depending on the country it
is soybean, sunflower, rapeseed or **groundnut** — and groundnut is the default
frying oil across West Africa, southern China and much of Southeast Asia, which
is a large share of this catalogue. It had no entry.

Added `check:['peanut','soy']`, `hidden:['peanut']`. The note records the real
nuance: highly refined peanut oil is exempt from EU and US declaration and is
tolerated by most peanut-allergic people; cold-pressed and gourmet peanut oil
is not.

**Effect:** a peanut-allergic user opening Jollof Rice now sees the oil under
*"easy to miss"*. Before this, they saw nothing.

### Regression test added

`consistency-check.mjs` now fails when a note names an allergen no bucket tags,
with negation handling so `"wheat-free"` and `"No soy, no wheat"` do not trip
it. Verified by reverting A1 and watching it fail. This closes the *class*, not
just the two instances.

---

## Findings NOT applied — these need your decision

### B1 · Diet substitutions are not checked against the user's allergens · **MEDIUM**

The two engines are asymmetric:

| Path | Function | Filters on allergens? |
|---|---|---|
| Allergen swaps | `safeAlts()` | **Yes** — drops targets that contain it, attaches a caution for label-dependent ones |
| Diet swaps | `cleanSubs()` | **No** — filters on diet flags only |

Reproduced: a **soy-allergic vegan** viewing Bacalhau à Brás is offered
`codsalt → tofu` as a vegan swap, with no soy caution on the button. The
allergen panel catches it *after* the swap is applied, so this is a missing
warning rather than a silent poisoning — but the warning belongs on the button.

Not fixed here because it is a change to engine behaviour, not to data, and the
review was scoped to data. It is my top recommendation for the next change.

### C1 · Lupin is not tracked · **MEDIUM**

The app tracks fourteen allergens, but not the EU's fourteen. It splits wheat
and gluten into two entries and **omits lupin**, which the EU requires to be
declared. Lupin flour appears in some gluten-free blends and in European baked
goods — directly relevant, since `flour_gf` is offered to wheat avoiders.

Adding a fifteenth allergen is a data and UI change. Worth doing; worth
deciding deliberately.

### D1 · Ground spices are tagged inconsistently · **LOW**

`achiote` carries `check:['wheat']` because achiote paste sometimes uses wheat
flour as a bulking agent. The same reasoning applies to other ground spices and
blends — `paprika`, `chili_kash`, `gochugaru` — which carry nothing. Either the
achiote tag is over-cautious or the others are under-tagged. One rule should
govern all of them.

### D2 · Fenugreek and peanut cross-reactivity · **LOW**

`fenugreek` and `methi` are legumes with documented cross-reactivity in some
peanut-allergic people. Not a declarable allergen anywhere. Advisory bucket at
most, and arguably out of scope for a fourteen-allergen model.

### D3 · `preslemon` · **LOW**

Commercially jarred preserved lemon sometimes carries sulphites. Home-made
does not. Currently untagged.

---

## What the tests can and cannot prove

| Proven automatically, every run | Requires a human |
|---|---|
| No substitution for an allergen contains that allergen | That an ingredient's tags are factually right |
| Label-dependent allergens never sit in "contains" | That no ingredient is missing a tag entirely |
| No dish gives a false all-clear | That "check the label" vs "contains" is the right call |
| Every note's named allergens are tagged | That the fourteen tracked are the right fourteen |
| Substitution targets exist and are registry members | That a note's real-world claim is accurate |

---

## Sign-off sheet

Tick each ingredient once its tags have been confirmed against a real product
label or an authoritative source. **·sub** marks an ingredient that is offered
as a substitution, which is where a wrong tag does the most damage.

Work down from Tier 1. If time runs out, the tiers are ordered so that stopping
early still leaves the riskiest half done.


### Tier 1 — declares `contains`. Blocks dishes. Highest scrutiny: a wrong entry here removes food someone could safely eat, a missing one is worse.

| ✓ | Ingredient | id | contains | check label | advisory | dishes |
|---|---|---|---|---|---|---|
| ☐ | All-purpose flour | `flour` | wheat gluten | — | — | 12 |
| ☐ | Egg | `egg` | egg | — | — | 11 |
| ☐ | Light soy sauce | `soy` | soy wheat gluten | — | — | 8 |
| ☐ | Butter | `butter` | milk | — | — | 7 |
| ☐ | Ghee | `ghee` | milk | — | — | 4 |
| ☐ | Whole milk | `milk` | milk | — | — | 4 |
| ☐ | Slivered almonds | `almond` | treenut | — | — | 3 |
| ☐ | Toasted sesame oil | `sesame_oil` | sesame | — | — | 3 |
| ☐ | Dried anchovies **·sub** | `anchovy_dr` | fish | crustacean | — | 2 |
| ☐ | White bread | `bread_wh` | wheat gluten | milk soy sesame | — | 2 |
| ☐ | Celery | `celery` | celery | — | — | 2 |
| ☐ | Double cream | `cream` | milk | — | — | 2 |
| ☐ | Sour cream | `cream_sour` | milk | — | — | 2 |
| ☐ | Fish sauce | `fishsauce` | fish | — | — | 2 |
| ☐ | Dried pasta | `pasta` | wheat gluten | — | — | 2 |
| ☐ | Roasted peanuts **·sub** | `peanut` | peanut | — | — | 2 |
| ☐ | Pecorino Romano | `pecorino` | milk | — | — | 2 |
| ☐ | Shaoxing wine | `shaoxing` | wheat gluten | — | — | 2 |
| ☐ | Worcestershire sauce | `worcester` | fish | soy sulphite | — | 2 |
| ☐ | Belacan (shrimp paste) | `belacan` | crustacean | — | — | 1 |
| ☐ | Flatbread (shrak, lavash) | `bread_flat` | wheat gluten | milk sesame | — | 1 |
| ☐ | Fine bulgur | `bulgur` | wheat gluten | — | — | 1 |
| ☐ | Candlenuts | `candlenut` | treenut | — | — | 1 |
| ☐ | Cashews | `cashew` | treenut | — | — | 1 |
| ☐ | Sharp cheddar | `cheddar` | milk | — | — | 1 |
| ☐ | Farmer cheese (twarog) | `cheese_qrk` | milk | — | — | 1 |
| ☐ | Salt cod (bacalhau) | `codsalt` | fish | — | — | 1 |
| ☐ | Dashi | `dashi` | fish | — | — | 1 |
| ☐ | Doubanjiang (broad bean chilli paste) | `doubanjiang` | wheat gluten | soy | — | 1 |
| ☐ | Firm white fish fillet | `fish_white` | fish | — | — | 1 |
| ☐ | Gochujang | `gochujang` | soy | wheat gluten | — | 1 |
| ☐ | Jameed (dried fermented yogurt) | `jameed` | milk | — | — | 1 |
| ☐ | Salted mackerel | `mackerel` | fish | — | — | 1 |
| ☐ | Wheat noodles, dried | `noodle_wh` | wheat gluten | — | — | 1 |
| ☐ | Puff pastry | `pastry_pf` | wheat gluten | milk soy | — | 1 |
| ☐ | Shortcrust pastry | `pastry_sh` | wheat gluten | milk soy | — | 1 |
| ☐ | Firm tofu | `tofu` | soy | — | — | 1 |
| ☐ | Plain whole-milk yogurt | `yogurt` | milk | — | — | 1 |
| ☐ | Tamari (wheat-free soy sauce) **·sub** | `tamari` | soy | — | — | 0 |

*39 ingredients.*

### Tier 2 — `check the label` or advisory only. Does not block. Verify the *reason* is right.

| ✓ | Ingredient | id | contains | check label | advisory | dishes |
|---|---|---|---|---|---|---|
| ☐ | Neutral cooking oil **·sub** | `oil_veg` | — | peanut soy | — | 18 |
| ☐ | Tomato paste | `tomato_pst` | — | celery | — | 7 |
| ☐ | Coconut milk | `coconut_mk` | — | — | treenut | 4 |
| ☐ | Raisins | `raisin` | — | sulphite | — | 4 |
| ☐ | Beef stock | `stock_beef` | — | celery wheat gluten soy | — | 3 |
| ☐ | Chicken stock **·sub** | `stock_chx` | — | celery wheat gluten soy | — | 3 |
| ☐ | Red wine | `wine_red` | — | sulphite | — | 3 |
| ☐ | Curry powder | `curry_pw` | — | mustard celery | — | 2 |
| ☐ | Garam masala | `garam` | — | mustard | — | 2 |
| ☐ | Red wine vinegar | `vinegar_rw` | — | sulphite | — | 2 |
| ☐ | Achiote paste | `achiote` | — | wheat | — | 1 |
| ☐ | Apricot jam | `apricot_j` | — | sulphite | — | 1 |
| ☐ | Smoked bacon lardons | `bacon` | — | milk soy sulphite | — | 1 |
| ☐ | Kabsa spice blend (baharat) | `baharat` | — | mustard celery | — | 1 |
| ☐ | Dried barberries | `barberry` | — | sulphite | — | 1 |
| ☐ | Berbere | `berbere` | — | mustard celery | — | 1 |
| ☐ | Coconut cream **·sub** | `coconut_ck` | — | — | treenut | 1 |
| ☐ | Fresh grated coconut | `coconut_fr` | — | — | treenut | 1 |
| ☐ | Aged kimchi | `kimchi` | — | fish crustacean | — | 1 |
| ☐ | Lingonberry preserve | `lingon` | — | sulphite | — | 1 |
| ☐ | Mirin | `mirin` | — | wheat | — | 1 |
| ☐ | Flat rice noodles, dried | `noodle_rice` | — | wheat | — | 1 |
| ☐ | Black olives | `olive_blk` | — | sulphite | — | 1 |
| ☐ | Green olives, cracked | `olive_grn` | — | sulphite | — | 1 |
| ☐ | Ají amarillo paste | `paste_aji` | — | sulphite | — | 1 |
| ☐ | Phanaeng curry paste | `paste_pnng` | — | crustacean fish soy peanut | — | 1 |
| ☐ | Pork sausages | `sausage_pork` | — | wheat gluten milk soy sulphite | — | 1 |
| ☐ | Smoked sausage (andouille) | `sausage_smk` | — | wheat gluten milk soy sulphite | — | 1 |
| ☐ | Corn tortillas | `tortilla` | — | wheat gluten | — | 1 |
| ☐ | Dairy-free hard cheese **·sub** | `cheese_df` | — | treenut soy | — | 0 |
| ☐ | Coconut aminos **·sub** | `coco_amino` | — | — | treenut | 0 |
| ☐ | Gluten-free flour blend **·sub** | `flour_gf` | — | wheat gluten | — | 0 |
| ☐ | Rice flour **·sub** | `flour_rice` | — | wheat gluten | — | 0 |
| ☐ | Dairy-free baking block **·sub** | `marg_df` | — | soy milk | — | 0 |
| ☐ | Oat milk, unsweetened **·sub** | `milk_oat` | — | wheat gluten | — | 0 |
| ☐ | Beef sausages | `sausage_bf` | — | wheat gluten milk soy sulphite | — | 0 |
| ☐ | Chicken sausages | `sausage_chk` | — | wheat gluten milk soy sulphite | — | 0 |
| ☐ | Pumpkin seeds **·sub** | `seed_pump` | — | treenut | — | 0 |
| ☐ | Sunflower seeds **·sub** | `seed_sun` | — | treenut | — | 0 |

*39 ingredients.*

### Tier 3 — no allergen entry, but offered as a substitution. Confirm each is genuinely clean, because it is handed to someone avoiding something.

| ✓ | Ingredient | id | contains | check label | advisory | dishes |
|---|---|---|---|---|---|---|
| ☐ | Olive oil **·sub** | `oil_olive` | — | — | — | 6 |
| ☐ | Bell pepper **·sub** | `pepper_bell` | — | — | — | 6 |
| ☐ | Basmati rice **·sub** | `rice_bas` | — | — | — | 3 |
| ☐ | Water **·sub** | `water` | — | — | — | 3 |
| ☐ | Ground flaxseed **·sub** | `flax` | — | — | — | 0 |

*5 ingredients.*

### Tier 4 — no allergen entry, not a substitution target. Fast scan: confirm nothing here should be tagged.

| ✓ | Ingredient | id | contains | check label | advisory | dishes |
|---|---|---|---|---|---|---|
| ☐ | Kosher salt | `salt` | — | — | — | 30 |
| ☐ | Yellow onion | `onion` | — | — | — | 29 |
| ☐ | Garlic | `garlic` | — | — | — | 28 |
| ☐ | Black peppercorns | `pepper` | — | — | — | 17 |
| ☐ | Tomato | `tomato` | — | — | — | 13 |
| ☐ | Dried red chili | `chili_dry` | — | — | — | 11 |
| ☐ | Fresh ginger | `ginger` | — | — | — | 11 |
| ☐ | Bay leaves | `bay` | — | — | — | 10 |
| ☐ | Cilantro | `cilantro` | — | — | — | 9 |
| ☐ | Long-grain rice | `rice_long` | — | — | — | 9 |
| ☐ | Green onion | `scallion` | — | — | — | 9 |
| ☐ | Chicken thighs, bone-in | `chicken_th` | — | — | — | 8 |
| ☐ | Potatoes | `potato` | — | — | — | 7 |
| ☐ | Ground turmeric | `turmeric` | — | — | — | 7 |
| ☐ | Carrot | `carrot` | — | — | — | 6 |
| ☐ | Flat-leaf parsley | `parsley` | — | — | — | 6 |
| ☐ | White sugar | `sugar_wh` | — | — | — | 5 |
| ☐ | Fresh thyme | `thyme` | — | — | — | 5 |
| ☐ | White vinegar | `vinegar_wh` | — | — | — | 5 |
| ☐ | Beef chuck | `beef_chuck` | — | — | — | 4 |
| ☐ | Ground beef, 20% fat | `beef_grd` | — | — | — | 4 |
| ☐ | Whole chicken | `chicken_wh` | — | — | — | 4 |
| ☐ | Cinnamon stick | `cinnamon` | — | — | — | 4 |
| ☐ | Coriander seed | `coriander_s` | — | — | — | 4 |
| ☐ | Cumin seed | `cumin` | — | — | — | 4 |
| ☐ | Lemon | `lemon` | — | — | — | 4 |
| ☐ | Green cardamom pods | `cardamom` | — | — | — | 3 |
| ☐ | Cucumber | `cucumber` | — | — | — | 3 |
| ☐ | Leg of lamb | `lamb_leg` | — | — | — | 3 |
| ☐ | Sweet paprika | `paprika` | — | — | — | 3 |
| ☐ | Ground pork, fatty | `pork_grd` | — | — | — | 3 |
| ☐ | Scotch bonnet pepper | `scotch` | — | — | — | 3 |
| ☐ | Pimento (allspice) berries | `allspice` | — | — | — | 2 |
| ☐ | Star anise | `anise` | — | — | — | 2 |
| ☐ | Beef sirloin | `beef_loin` | — | — | — | 2 |
| ☐ | Beef shank, boneless | `beef_shank` | — | — | — | 2 |
| ☐ | Chickpeas, cooked | `chickpea` | — | — | — | 2 |
| ☐ | Kashmiri chilli powder | `chili_kash` | — | — | — | 2 |
| ☐ | Garlic chives | `chives_g` | — | — | — | 2 |
| ☐ | Whole cloves | `clove_sp` | — | — | — | 2 |
| ☐ | Lime | `lime` | — | — | — | 2 |
| ☐ | Makrut lime leaves | `limeleaf` | — | — | — | 2 |
| ☐ | Loomi (dried black lime) | `loomi` | — | — | — | 2 |
| ☐ | Kasuri methi (dried fenugreek leaves) | `methi` | — | — | — | 2 |
| ☐ | Saffron threads | `saffron` | — | — | — | 2 |
| ☐ | Shallots | `shallot` | — | — | — | 2 |
| ☐ | Palm sugar | `sugar_palm` | — | — | — | 2 |
| ☐ | Rock sugar | `sugar_rock` | — | — | — | 2 |
| ☐ | Tamarind paste | `tamarind` | — | — | — | 2 |
| ☐ | Green bananas | `banana_grn` | — | — | — | 1 |
| ☐ | Thai basil | `basil_thai` | — | — | — | 1 |
| ☐ | Black-eyed peas, cooked | `bean_blackeye` | — | — | — | 1 |
| ☐ | Butter beans | `bean_butter` | — | — | — | 1 |
| ☐ | Flat green beans | `bean_green` | — | — | — | 1 |
| ☐ | Red kidney beans, cooked | `bean_kidney` | — | — | — | 1 |
| ☐ | Beetroot | `beet` | — | — | — | 1 |
| ☐ | Bok choy | `bok_choy` | — | — | — | 1 |
| ☐ | White cabbage | `cabbage` | — | — | — | 1 |
| ☐ | Caraway seed | `caraway` | — | — | — | 1 |
| ☐ | Ancho chillies, dried | `chili_anch` | — | — | — | 1 |
| ☐ | Guajillo chillies, dried | `chili_guaj` | — | — | — | 1 |
| ☐ | Fresh dill | `dill` | — | — | — | 1 |
| ☐ | Donne' sali (boonie pepper) | `donne` | — | — | — | 1 |
| ☐ | Aubergine | `eggplant` | — | — | — | 1 |
| ☐ | Fennel seed | `fennel_s` | — | — | — | 1 |
| ☐ | Blue fenugreek (utskho suneli) | `fenugreek` | — | — | — | 1 |
| ☐ | Galangal | `galangal` | — | — | — | 1 |
| ☐ | Ground ginger | `ginger_g` | — | — | — | 1 |
| ☐ | Gochugaru (Korean chilli flakes) | `gochugaru` | — | — | — | 1 |
| ☐ | Juniper berries | `juniper` | — | — | — | 1 |
| ☐ | Ground lamb | `lamb_grd` | — | — | — | 1 |
| ☐ | Lemongrass | `lemongrass` | — | — | — | 1 |
| ☐ | Brown lentils, dry | `lentil_br` | — | — | — | 1 |
| ☐ | Fresh mint | `mint` | — | — | — | 1 |
| ☐ | Mushrooms | `mushroom` | — | — | — | 1 |
| ☐ | Nutmeg | `nutmeg` | — | — | — | 1 |
| ☐ | Dende (red palm oil) | `oil_dende` | — | — | — | 1 |
| ☐ | Okra | `okra` | — | — | — | 1 |
| ☐ | Red onion | `onion_red` | — | — | — | 1 |
| ☐ | Dried oregano | `oregano` | — | — | — | 1 |
| ☐ | Pandan leaves | `pandan` | — | — | — | 1 |
| ☐ | Pineapple | `pineapple` | — | — | — | 1 |
| ☐ | Pork belly | `pork_belly` | — | — | — | 1 |
| ☐ | Pork shoulder | `pork_sh` | — | — | — | 1 |
| ☐ | Floury potatoes | `potato_fl` | — | — | — | 1 |
| ☐ | Preserved lemon | `preslemon` | — | — | — | 1 |
| ☐ | Rabbit | `rabbit` | — | — | — | 1 |
| ☐ | Bomba or Calasparra rice | `rice_bomba` | — | — | — | 1 |
| ☐ | Short-grain rice | `rice_short` | — | — | — | 1 |
| ☐ | Fresh rosemary | `rosemary` | — | — | — | 1 |
| ☐ | Sake | `sake` | — | — | — | 1 |
| ☐ | Waakye leaves (dried sorghum) | `sorghum_lv` | — | — | — | 1 |
| ☐ | Rice vinegar | `vinegar_rc` | — | — | — | 1 |
| ☐ | Ground white pepper | `whitepep` | — | — | — | 1 |
| ☐ | Ground chicken | `chicken_grd` | — | — | — | 0 |

*95 ingredients.*

---

## Recording pass two

When a reviewer completes a tier, record it here and commit the sheet with the
boxes ticked. The point is that the next person can see what was checked, by
whom, and when — not merely that "a review happened".

| Tier | Ingredients | Reviewer | Date | Notes |
|---|---|---|---|---|
| 1 — contains | 39 | | | |
| 2 — check/advisory | 39 | | | |
| 3 — untagged substitution targets | 5 | | | |
| 4 — untagged, remainder | 95 | | | |

**Until every tier is signed, the app's allergen output is a starting point for
a user's own checking and not a clearance.** The UI already says exactly that,
on every screen that touches allergens. Keep it saying so.
