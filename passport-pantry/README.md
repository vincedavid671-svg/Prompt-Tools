# Passport Pantry

An app for cooking the dish you remember from a trip — properly, at home, with
the ingredients actually in your kitchen.

**Live prototype:** open `prototype.html`, or the published artifact link from
the session that created it.

This directory holds a working prototype and the decisions behind it. It is not
production code.

---

## The product in one paragraph

A traveller eats something that stays with them. Months later they want to make
it. Today that means a search, six blog pages of preamble, a recipe that assumes
ingredients they cannot find, and no idea whether what arrives resembles what
they remember. Passport Pantry goes country → dish → the foundation that makes
it that dish → a method with real temperatures and cues → a shopping list that
already knows what is in their cupboard → an estimate of what is left afterwards.

---

## Eleven mechanics, all demonstrated in the prototype

### 1. Foundation and layers

Every dish has a small set of non-negotiables and a large set of variables.
Khinkali is a stiff dough, a loose raw filling that makes its own broth, and a
pleated seal — everything else (lamb or beef, fenugreek or not, 18 pleats or 28)
is a layer.

This is the core data model, and it is doing three jobs at once:

- **It teaches.** A cook who understands the foundation can improvise; a cook
  following steps cannot.
- **It structures comparison.** Every creator's version is a set of layer
  choices against a shared foundation, so versions can be compared rather than
  ranked.
- **It solves attribution.** The foundation is our own description of an
  uncopyrightable technique. Other people's versions are indexed and linked to,
  never republished.

### 2. Ingredient normalization

`toGrams(ingredient, qty, unit)` converts native recipe units to grams using a
per-ingredient table — a clove of garlic is 5 g, a tablespoon of fish sauce is
18 g, a cup of flour is 125 g.

**Where the conversion is undefined the function returns `null` and the UI shows
the gap.** It never guesses. Nothing downstream — pantry, shopping list, scaling
— works without this table, and filling it out properly is the single largest
engineering task in the product.

### 3. The core loop: dish to pantry to shopping

The flow the product is built around:

1. **Click a dish.** Every ingredient line is checked against the pantry as it
   renders — *in pantry*, *only 210 g · short 190 g*, *none in pantry*, or *not
   tracked* where no gram conversion exists.
2. **Tick what you need.** Per ingredient, not per dish, because that is how
   people actually shop. "Add everything I'm short of" does the obvious bulk case.
3. **Shopping works out who has it.** For each ticked ingredient, the app ranks
   the stores that reliably carry it in the country you are shopping from.

**Difficulty is relative to where you are.** This is the part worth getting
right. Fish sauce is a specialty import in Warsaw and a shelf staple in Hanoi, so
a single global "specialty" label would be wrong everywhere except by accident.
Each ingredient carries a culinary channel (`sea`, `me`, `carib`, `cauc`, `pac`,
`asian`, `latin`, `euro`, `universal`), each country declares which channels are
simply everyday shopping there, and the same ingredient reads as *Everyday here*
in one country and a hunt in another:

| Fish sauce | Reads as | Where |
|---|---|---|
| Vietnam | Everyday here | Bách Hóa Xanh |
| Thailand | Everyday here | Tops / Gourmet Market |
| Saudi Arabia | Southeast Asian | Salla merchant, Zid, Lulu |
| United Kingdom | Southeast Asian | Amazon, then Tesco or Ocado worth checking |
| Poland | Southeast Asian | Amazon, then Glovo or Carrefour worth checking |

**These are sourcing judgements, not live stock, and the app says so.** No
catalogue API exists for most of these stores, so it reasons from what each one
reliably carries rather than pretending to know today's shelves. Two rules keep
the judgements honest:

- An ingredient that must arrive fresh is never routed to mail order. Makrut lime
  leaves, scotch bonnet, donne' sali and fresh grated coconut never appear under
  Amazon or a Salla merchant, in any country.
- A dead end is stated, not hidden. Across every ingredient and country pair,
  26% have no reliable source, and each one gets an explicit message with
  different advice depending on whether the item could ship at all.

Where a real catalogue API exists — Instacart, Kroger, a Salla merchant — this
same field is replaced by actual availability without the rest of the flow
changing.

### 4. Calories and macros, corrected for what you actually eat

Per serving: kcal, protein, carbohydrate, fat, and the share of energy each
macro contributes. It reads through `effectiveIngs()`, so swapping pork for
chicken moves the numbers, and per-serving figures are invariant under scaling —
tripling the batch does not change what one plate contains.

**The trap most recipe calorie counts fall into.** Summing raw ingredients
assumes you eat all of them. You do not:

| Dish | Raw sum | Actually eaten | Overcount avoided |
|---|---|---|---|
| Phở Gà | 1321 kcal | 659 kcal | **50%** |
| Chicken Tagine | 1058 kcal | 731 kcal | 31% |
| Lomo Saltado | 777 kcal | 701 kcal | 10% |
| Khinkali | 807 kcal | 770 kcal | 5% |

Phở is the extreme case and it is instructive: the carcass and every aromatic
are strained out and binned, and you eat roughly a third of the bird by weight.
Counting the whole chicken, the star anise and the charred onion would report a
bowl of chicken noodle soup at 1321 kcal. That is not a rounding error, it is
double.

So each recipe carries an `EATEN` map — the fraction of each ingredient's mass
actually consumed — with a written explanation shown in the UI wherever a
correction applies. Bones are discarded, frying oil mostly drains, potatoes are
peeled, khinkali knots are famously not eaten, and a whole scotch bonnet is
lifted out before serving.

**Tags need an absolute threshold, not just an energy share.** The first version
tagged Bangers and Mash "Low carb" at 54 g of carbohydrate, because the fat was
high enough to dominate the energy split. Correct arithmetic, useless advice, and
exactly the kind of thing that makes a dieting user stop trusting an app. Both
tests now have to pass: keto requires ≤10 g *and* ≤10% of energy; low carb
requires ≤30 g *and* ≤25%.

**Provenance is tracked per value.** `fdc` on a `NUTR` row is the switch and the
only thing separating a sourced number from a guess:

| Row | App behaviour |
|---|---|
| Has `fdc` | USDA-sourced; traceable at `fdc.nal.usda.gov/food-details/<id>` |
| No `fdc` | Counted as an approximation and labelled as one on every screen |

Each recipe shows *"N of M values resolved from USDA FoodData Central"*, and the
daily-budget disclaimer rewrites itself once the table is complete. Run
`node tools/fdc-resolve.mjs --key YOUR_KEY` to do that — see `tools/README.md`.
**As committed, the table is entirely approximations: no row carries an FDC id,
because inventing one would be a fabricated citation in a health context.**

Carbohydrate is **total** until the resolve brings fibre with it; **net carbs**
then appear wherever every counted ingredient has a fibre figure, and the keto and
low-carb tags switch to using the net number.

Some ingredients have no USDA entry at all — scotch bonnet, donne' sali, makrut
lime leaf, palm sugar, baharat, ají amarillo. The closest available food is used
and **flagged on the recipe as a proxy**, because a cited number that quietly
describes a different food is worse than an admitted estimate. A test keeps the
app's proxy list and the resolver's in step.

Remaining honest limits:
- Cooking losses beyond the yield map are not modelled: water evaporating from a
  reduction concentrates nothing nutritionally but changes portion size, and oil
  absorbed by frying is estimated rather than measured.
- It is informational, not medical or dietary advice, and says so.

### 5. Daily calorie budget

The feature that turns this from a reference into something you open every
evening. A **Today** tab with a target, a day log, and the question that actually
matters: *what can I cook with what's left?*

**Setting the target.** Either enter a figure you already have, or let the app
estimate it with Mifflin-St Jeor plus an activity multiplier — the standard
clinical equation:

    male:        10·kg + 6.25·cm − 5·age + 5
    female:      10·kg + 6.25·cm − 5·age − 161
    unspecified: 10·kg + 6.25·cm − 5·age − 78   (midpoint)

Times 1.2 to 1.9 for activity, plus a goal delta (−250, −500, 0, +350). The
working is shown on screen, not hidden, so the number is inspectable. Tests pin
the equation to hand-computed values.

**The macro framework** (balanced, high protein, low carb, keto) converts the
target into protein/carb/fat gram targets, and the Today view tracks each against
what has been logged. A test asserts all four frameworks reconcile back to the
calorie target within 3%.

**Logging.** Any dish logs at 0.5×, 1×, 1.5× or 2× a serving, and "I cooked this"
logs one serving automatically — so the cook log, the pantry depletion and the
day's calories all come from one action.

**The payoff.** Below the ring, the catalogue filtered to what fits in the
remaining budget, with anything within 150 kcal marked as just over. Go past the
target and it says so without moralising: *one day over target is not a problem;
a pattern of them is.*

#### The safety floor, and a bug worth recording

Weight-loss targets get checked against commonly cited floors — 1200 kcal, or
1500 for men — below which sustained intake is held to need professional
oversight.

The first implementation applied that floor to *any* target and offered the
mildest goal that would clear it. Test output showed it telling a 45 kg woman with
a normal BMI to **gain weight**. The bug was conceptual, not arithmetic: those
figures are floors for a *deliberate deficit*, not minimums every body must
exceed. A small, sedentary, older person can have a genuine maintenance
requirement near 1100 kcal, and flagging normal eating as dangerous — then
prescribing weight gain — would be wrong and would devalue every other warning
the app gives.

Corrected behaviour, each case covered by a test:

| Situation | Response |
|---|---|
| Deliberate deficit below the floor, easing the goal fixes it | Suggests the specific milder goal and its number |
| Deficit below the floor, maintenance is *also* below it | Says so and defers to a dietitian — no slider fixes this |
| Maintenance target below the floor | **No warning.** That is their requirement, not a crash diet |
| Any gaining target | No warning |
| Figure the user entered themselves | Noted where it sits, never overridden — if a dietitian set it, it stands |

The remedy never recommends a surplus as the way out of a deficit.

#### Privacy

A food diary and body-composition figures are personal health data, so they are
written to the viewer's **private** path (`data/users/<id>/`) via the `user`
capability, not the shared collections the pantry and cook log use. Without that
capability they stay in memory for the session rather than being written anywhere
another viewer could read, and the UI states which of the two is happening.

#### Honest limit

The budget inherits the nutrition table's uncertainty and compounds it across
everything logged in a day. Stated on the screen: useful for direction and habit,
not accurate enough to manage a medical condition on. **Wire FoodData Central
before shipping this feature to real users** — a diabetic counting carbohydrate on
approximations is a genuine harm, not a rough edge.

### 6. Allergens

A deliberately separate system from the diet engine, because the stakes differ.
Getting halal wrong is distressing. Getting peanut wrong puts someone in hospital.
Three consequences shape the design.

#### Hidden allergens are the point

Nobody with a fish allergy is surprised by mackerel. They are caught out by
Worcestershire sauce, which contains anchovy. The ones this leads with:

| Ingredient | Hidden allergen | Why it is missed |
|---|---|---|
| Soy sauce | **Wheat, gluten** | Most soy sauce is wheat-brewed. The single most missed allergen in Asian cooking |
| Shaoxing wine | **Wheat, gluten** | Fermented with wheat |
| Worcestershire sauce | **Fish** | Anchovy. A classic in British cooking |
| Stock cubes and cartons | **Celery**, often wheat | Almost universal and almost never expected |
| Thai curry paste | **Crustacean**, sometimes peanut | Shrimp paste is standard; brands vary enormously |
| Sausages | **Wheat** | Rusk or breadcrumb binder, plus sulphites |

A separate "easy to miss" block leads the panel, above the obvious conflicts.

#### Three buckets that are never merged

- **Contains** — a fact about the food itself.
- **Check the label** — a fact about commerce. The brand decides and the app cannot
  see the brand.
- **Advisory** — worth knowing, not treated as a conflict.

Collapsing the first two would either cry wolf or give false comfort, and both
destroy trust in an allergy tool. A test asserts a label-dependent allergen never
leaks into the "contains" bucket.

Coconut is the advisory case: US labelling classifies it as a tree nut, but most
people with tree-nut allergy tolerate it. Treated as a note with the reasoning
shown rather than a hard block, which would otherwise strip coconut out of half
the catalogue for no good reason.

#### The critical invariant

**No substitution offered for an allergen may itself contain that allergen.**
Trading peanut for cashew is worse than offering nothing. A test verifies this
across all 14 allergens against every substitutable ingredient, and swap targets
carry their own allergen tags — tamari is wheat-free but still soy; dairy-free
cheese is frequently cashew-based; seeds are often packed on tree-nut lines. Each
of those is surfaced as a caution on the swap button itself.

#### Where a dish cannot survive, it says so

Khinkali without wheat is not khinkali: the gluten network is what holds the broth
in under a hard boil. Rather than offer a swap that produces something else, the
app says exactly that. Same for jiaozi and the mince pie. An honest dead end beats
a substitution that fails in the pan.

Substitution notes describe the **structural** consequence, not just the flavour —
taking egg out of pastry is a mechanical change. Ground flax binds but will not
glaze; oil in mash carries no water so you use 20% less; rice flour has no gluten
network at all and cannot hold liquid in a dumpling.

#### What the app refuses to claim

Stated on the selector and again on every recipe panel:

> The app cannot make this dish safe for you. It reads a recipe; it does not read
> the label on what you buy, and it cannot see cross-contact in a factory, a bulk
> bin, or a kitchen. Check every product every time. If a reaction could be severe,
> this is a starting point for your own checking and nothing more.

Region matters too: the US Big 9 show by default, and the extra EU-declared
allergens (celery, mustard, sulphites, molluscs) appear when shopping from a
country that requires them, with a note about which regime applies.

### 7. Purchase-anchored pantry ledger

The differentiator, and the feature most likely to fail if built naively.

Every comparable app has died on the same rock: asking users to weigh and log
what they use. They stop within a week, the data goes stale, and a confidently
wrong inventory is worse than none.

The design that survives:

- **Never ask for a measurement.** The user taps "I cooked this" and the recipe's
  quantities are subtracted.
- **Anchor on the purchase.** A 10 oz jar bought through the app is the one
  high-confidence number in the system.
- **Present estimates as estimates.** "≈ 210 g left" with one-tap correction,
  never a ledger claiming precision it does not have.

### 8. Protein and dietary swaps

Religion and preference decide the protein long before taste does. The diet
engine holds eight profiles — halal, kosher, no pork, no beef, pescatarian,
vegetarian, vegan, none — as flag sets, and every ingredient carries flags in a
side map so the ingredient registry stays about measurement.

Three design decisions worth keeping:

- **`alcohol_derived` is separate from `alcohol`.** Most halal authorities accept
  vinegar made from wine because fermentation transforms it; plenty of people
  still avoid it. That is a warning, not a conflict, and the app does not decide
  it for anyone.
- **The app states its own limit.** It can check ingredients. It cannot tell you
  whether meat was halal-slaughtered — that depends on where you buy it. The
  halal profile says so on screen.
- **Every substitution says what you lose.** "Leaner, add a spoonful of oil —
  the pork fat was doing work you will otherwise miss." A swap presented as free
  is how people end up disappointed.

Swaps resolve in one function, `effectiveIng()`. Quantities, pantry coverage and
the shopping list all read through it, so a swap propagates without any of them
knowing diets exist.

### 9. Region browsing

The Atlas filters by region before country, because that is how travel memory is
organised — people remember *Southeast Asia* or *the Gulf*, not a country list.
Each region carries a line on what it is known for.

### 10. Global sourcing from a derived platform registry

The first version of this hand-curated a store list per country. That does not
scale past a handful of markets, and the product is global by definition — the
whole premise is that you ate something abroad and now want it at home, wherever
home is.

The fix is to invert it. **Most of the populated world is served by about twenty
platform operators**, so coverage is a property of the platform and a country's
store list is *derived*:

    storesFor(cc) = localSpecialists[cc] + platforms.filter(p => p.cc.includes(cc))

Adding a country becomes a two-letter code rather than a new list. 24 platforms
plus 12 local lists currently reach **83 countries**.

The operators that matter: Wolt (DoorDash-owned, Europe), Glovo (Delivery
Hero-owned, Europe/Africa/LatAm), Bolt Food, Grab and GrabMart (Southeast Asia,
which acquired foodpanda in 2026), Talabat and HungerStation and InstaShop
(Delivery Hero, Gulf), Deliveroo, Uber Eats, DoorDash, Instacart, Rappi (LatAm),
Blinkit and Swiggy (India), Getir (Turkey), Yango, Coupang (Korea), Meituan
(China), plus Carrefour, Lulu, Amazon and noon as retailers with wide
multi-country footprints.

Two design consequences worth keeping:

- **Local specialists are layered on only where they beat the platforms.** Salla
  and Zid in Saudi Arabia, H Mart in the US, Deserter's Bazaar in Tbilisi. Not a
  full list per country — just the cases where the global option is inadequate.
- **No delivery coverage is a real state, handled explicitly.** Jamaica and Guam
  have no platform at all, and 53 of 83 countries have no specialty source. The
  app says so and gives different advice — look for a diaspora grocer, or go to
  the market — instead of rendering an empty shelf. Specialty is the category
  that decides whether the dish tastes right, so silence there is the worst
  possible answer.

Country coverage is researched but not verified market by market, and platforms
enter and leave countries constantly. The tier assignments are the durable part;
treat coverage as a starting point that needs maintenance.

### 11. Community layer

Ratings and notes from people who actually cooked the dish, stored per-dish.
This is original user content, owned outright, and it is the only realistic way
to reach the long tail — no scraper finds Chamorro kelaguen or Jamaican rundown
in any depth, but home cooks will contribute both.

---

## Sourcing rules — non-negotiable

Attribution is not a licence. Crediting an author does not create a right to
republish their work. These rules keep the product defensible.

| Element | Treatment | Why |
|---|---|---|
| Ingredient lists and quantities | Ingest and store | Uncopyrightable — US Copyright Office Circular 33 |
| Plain procedural directions | Ingest structure, write our own text | The procedure is free; the prose is not |
| Headnotes, stories, essays | Never copy | Copyrightable literary expression |
| Photography | Never copy, never hotlink | Highest-risk element by a wide margin |
| Source credit and link | Always, prominently | Correct, and it keeps sources friendly |
| Ratings and cook notes | Ours | Original user-generated content |

Also: respect `robots.txt`, prefer sites' own schema.org/Recipe JSON-LD (which
is published to be machine-read), and run a takedown process from day one.

### YouTube specifically

| Do | Don't |
|---|---|
| YouTube Data API v3 for search and metadata | Scrape the site directly — prohibited by the API ToS |
| Official embedded player, attribution intact | Obscure or replace YouTube's attribution |
| Parse the video **description** for ingredients | Pull transcripts — `captions.download` requires owning the video, and the libraries that reverse-engineer the internal endpoint violate developer policy |
| Deep-link out so creators keep the view | Re-host or mirror video content |

Watch the quota: a Data API search costs 100 units against a 10,000/day default,
so roughly 100 searches per day before throttling. Cache aggressively and
pre-resolve videos per dish rather than searching per user request.

---

## Data sources

### Commerce: the APIs exist, they just point the wrong way

An earlier draft of this spec said there was "essentially no partner cart API"
outside the United States. That was wrong, and wrong in a way worth recording.

Saudi and Gulf platforms publish real, well-documented developer APIs. Talabat
has both a developer portal and a separate POS integration portal, plus Delivery
Hero's Q-Commerce Partner API. Jahez runs an integration portal and issues API
keys per restaurant. noon publishes API documentation covering catalogue, orders,
fulfilment and event notifications, with an OAuth 2.0 flow for integrators.
HungerStation integrates through middleware. Grubtech alone centralises Talabat,
Careem, noon, KeeTa and HungerStation across 28 markets.

**The problem is direction, not existence.** Every one of those APIs is
vendor-side: it lets a shop or restaurant receive, manage and fulfil orders that
customers place in the platform's own app. None of them lets a third-party
consumer app build a basket or place an order for a shopper. That is the opposite
of what this product needs, and no amount of partner onboarding turns one into
the other.

So the model is four tiers, and the tier is a property of each store:

| Tier | Meaning | Examples |
|---|---|---|
| `cart` | A documented API puts items in a shopper's cart | Instacart, Kroger (US only) |
| `merchant` | An API exists, authorised **per merchant** rather than per shopper | Salla, Zid (Saudi) |
| `affiliate` | Product links with commission, no cart | Amazon.sa, Amazon US, noon, Walmart |
| `link` | Deep link only — the API that exists is vendor-side | Nana, Talabat Mart, Carrefour, Lulu, Panda, Danube, Tamimi, HungerStation, Ninja |

**Salla and Zid are the real finding for Saudi Arabia.** Salla is a Saudi
e-commerce platform with roughly 80,000 active stores — locally described as the
Shopify of the Middle East — offering a Merchant REST API, an OAuth 2.0 Partners
authorisation service with scopes including `carts.read` and `orders.read_write`,
and signed webhooks. Zid is the Riyadh-based equivalent with an open API.

That is the closest thing in the Kingdom to what Instacart's developer platform
gives you in the US, with one structural difference that shapes the product:
**authorisation is granted per merchant, not per shopper.** A spice merchant,
butcher or specialty importer running on Salla can install your app, and from
then on you can build real carts against their catalogue. It does not give you
the hypermarkets, but specialty sourcing is exactly where users need the most
help — the `spec` category in the shopping list is the hardest one to satisfy and
the one where a generic deep link helps least.

**Amazon.sa has its own affiliate programme** at `affiliate-program.amazon.sa`,
with commission from roughly 1% to 10% by category and about 5% on home and
kitchen. So affiliate revenue is available in Saudi Arabia from launch. The
Creators API gate discussed below restricts the programmatic *product data* API,
not the affiliate links themselves — those two were conflated in an earlier
draft.

Revised sequencing:

1. **Deep links everywhere.** Works in every market, blocks on nothing.
2. **Amazon.sa and Amazon US affiliate links.** Revenue from day one, no API gate.
3. **Salla and Zid merchant apps.** Real carts for specialty ingredients in
   Saudi Arabia. Start with a handful of merchants who stock what the recipes
   actually need.
4. **Instacart and Kroger.** A US-only enhancement, not a global dependency.

Store coverage in the prototype is illustrative and per-market link formats are
unverified. The tier assignments are the part worth trusting; the URLs are not.

| Need | Source | Terms |
|---|---|---|
| Nutrition, calories, macros | USDA FoodData Central | CC0 public domain, free key, 1,000 req/hr — **resolver written (`tools/fdc-resolve.mjs`); run it to replace the approximations** |
| Grocery cart | Instacart Developer Platform (`/idp/v1/products/recipe`) | Partner approval required |
| Grocery cart, direct | Kroger Cart API | OAuth2 authorization code, user authorizes |
| Product links | Walmart affiliate / content provider API | Read-only, drives traffic out |
| Shelf-stable goods | Amazon Associates | See caveat below |

**Amazon caveat.** The PA-API is being retired during 2026 in favour of the
Creators API, which requires at least 10 qualified Associates referral sales in
the trailing 30 days before access is granted. This gates the programmatic
product-data API only — affiliate links themselves need just an Associates
account, and Amazon.sa runs its own programme. Reported sunset dates vary across
sources — verify directly with Amazon. Plan to launch without programmatic
Amazon access and treat it as a later addition.

**The app never holds a user's store credentials.** Carts are built through
partner APIs or deep links; the user checks out in their own account.

---

## Known gaps in the prototype

- Recipes are original drafts, **not kitchen-tested**. The UI labels them as such.
- Attribution slots are deliberately empty rather than filled with invented
  sources.
- Cart buttons are disabled — no partner credentials are wired up.
- The unit conversion table covers only the ingredients these eight recipes use.
- Allergen data is hand-authored per ingredient. It covers the 11 recipes here
  honestly, but every new ingredient needs its own allergen review — and a missed
  tag in this system is a safety issue, not a cosmetic one. This is the part of
  the data model that most needs a second pair of eyes before launch.
- Nutrition values are still approximations: the FoodData Central resolver is
  written and tested but has not been run, because `api.nal.usda.gov` is blocked
  by the egress policy of the environment this was built in. One command with a
  free key fixes it, and the app flips to sourced with no other change.
- Store links open a web search rather than a verified retailer URL, since
  deep-link formats have not been confirmed per retailer. The integration tier
  shown against each store is researched; the link is not.
- The diet engine checks ingredients only. Certification — halal slaughter,
  kosher supervision — is out of scope for an app and is stated as such in
  the UI.
- No YouTube API integration; the video panel links to a real YouTube search and
  documents what the built version does instead.

---

## Roadmap

**Now — validate**
Does the foundation-and-layers framing actually help someone cook better? 23
dishes is enough to find out. If it does not, nothing else matters.

### Catalogue as it stands

| Region | Dishes |
|---|---|
| Europe | Bangers and Mash, Cacio e Pepe, Paella Valenciana, Moussaka |
| Southeast Asia | Phở Gà, Phanaeng Curry, Rendang, Chicken Adobo |
| East Asia | Pork & Chive Jiaozi, Oyakodon, Kimchi Jjigae |
| Middle East | Chicken Kabsa, Menemen, Tabbouleh |
| Latin America | Lomo Saltado, Tacos al Pastor |
| South Asia | Butter Chicken |
| Caucasus | Khinkali |
| North Africa | Chicken Tagine |
| East Africa | Doro Wat |
| Caribbean | Rundown |
| Pacific Islands | Chicken Kelaguen |
| Oceania | Mince and Cheese Pie |

Three are vegetarian as written — Cacio e Pepe, Menemen, Tabbouleh — which the
first eleven were not, and the diet engine needs dishes that pass as well as
dishes that fail to be worth anything.

**Next — make the ledger real**
Extend the conversion table, add barcode scan for purchase anchoring, correction
flow, low-stock surfacing.

**Then — commerce**
Verified deep links per market first — they work everywhere and block on nothing.
Amazon.sa and Amazon US affiliate links second, for revenue with no API gate.
Salla and Zid merchant apps third, for real carts on specialty ingredients in
Saudi Arabia. Instacart and Kroger last, as a US-only enhancement rather than a
global dependency.

**Later — scale content**
Contributor programme for regional cooks, and YouTube variation indexing. The
FoodData Central resolve is no longer a later item — it is one command, and it
gates shipping the calorie budget to real users.

---

## Business model

Subscription is the business. Affiliate is a margin kicker that arrives in year
two if it arrives at all — grocery affiliate rates are thin and every programme
requires approval.

Model the per-user AI inference cost against the subscription price before
writing production code. An always-available cooking coach is a recurring
variable cost against fixed revenue, and that ratio decides whether this is a
business or a hobby.

---

## Prototype technical notes

Single self-contained HTML file. No build step, no dependencies. **23 dishes
across 12 regions and 23 countries**, 141 canonical ingredients, 14 allergens,
eight diet profiles, and 24 delivery platforms reaching 85 countries.

A consistency suite (not shipped in the file) checks: every recipe ingredient
exists in the registry and normalizes to grams; every substitution target exists
and is clean under the diet offering it; every platform's declared country
coverage resolves to a listed country; every listed country is reachable; and
every dish country is shoppable-from. Category gaps are reported rather than
asserted, because they are real — the UI handles them explicitly.

Three runtime capabilities when published as an artifact:

- `db` — pantry state and cook log, shared and durable. Degrades to in-memory
  when unavailable; the page still works.
- `sample` — the cooking coach. The page hides the feature when it is not
  granted rather than failing.
- `user` — identifies the viewer so the food diary and profile can be written to
  their own private path instead of shared storage.

Example pantry stock is shown on first load so the screen is not empty, and is
plainly labelled as example data until the viewer logs a cook or edits a line.
