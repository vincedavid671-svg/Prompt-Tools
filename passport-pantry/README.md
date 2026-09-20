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

## Seven mechanics, all demonstrated in the prototype

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

### 3. Purchase-anchored pantry ledger

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

### 4. Protein and dietary swaps

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

### 5. Region browsing

The Atlas filters by region before country, because that is how travel memory is
organised — people remember *Southeast Asia* or *the Gulf*, not a country list.
Each region carries a line on what it is known for.

### 6. Region-aware store routing

See the commerce section below. Store lists are per market, and the prototype
ships Saudi Arabia, UAE, US, UK and New Zealand.

### 7. Community layer

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

### Commerce is not a global problem with one answer

The first draft of this spec assumed Instacart and Kroger. That is a US answer,
and it does not port.

**Outside the United States there is essentially no partner cart API.** The Gulf
market is retailer apps (Carrefour, Lulu, Panda, Danube, Tamimi) plus
aggregators (Nana, Talabat Mart, Ninja, HungerStation Market, Noon Minutes,
InstaShop) — none of which publish a recipe-to-cart developer API. Nana is the
closest structural analogue to Instacart in Saudi Arabia because it aggregates
multiple supermarkets, but it is not an integration target today.

So the architecture is **deep links, with cart integration as a US-only
enhancement** — and that inverts the roadmap in a useful way:

| | US | Everywhere else |
|---|---|---|
| Cart integration | Instacart, Kroger | None available |
| Launch blocker | Partner approval | None |
| User experience | Items land in cart | One extra tap, same result |

International launch is *easier* than US launch, because nothing waits on a
partner agreement. Build deep links first; they work in every market including
the US, and cart APIs become an upgrade for one market rather than a dependency
for all of them.

Store coverage in the prototype is illustrative. Every link must be verified per
market before launch, and the list should be maintained per country rather than
inferred.

| Need | Source | Terms |
|---|---|---|
| Nutrition, calories, macros | USDA FoodData Central | CC0 public domain, free key, 1,000 req/hr |
| Grocery cart | Instacart Developer Platform (`/idp/v1/products/recipe`) | Partner approval required |
| Grocery cart, direct | Kroger Cart API | OAuth2 authorization code, user authorizes |
| Product links | Walmart affiliate / content provider API | Read-only, drives traffic out |
| Shelf-stable goods | Amazon Associates | See caveat below |

**Amazon caveat.** PA-API is being retired during 2026 in favour of the Creators
API, which requires at least 10 qualified Associates referral sales in the
trailing 30 days before access is granted. Reported sunset dates vary across
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
- Nutrition and calorie data are not wired up; the diet engine covers
  religious and preference restrictions only, not macros.
- Store links open a web search rather than a verified retailer URL, since
  deep-link formats have not been confirmed per retailer.
- The diet engine checks ingredients only. Certification — halal slaughter,
  kosher supervision — is out of scope for an app and is stated as such in
  the UI.
- No YouTube API integration; the video panel links to a real YouTube search and
  documents what the built version does instead.

---

## Roadmap

**Now — validate**
Does the foundation-and-layers framing actually help someone cook better? Eleven
dishes is enough to find out. If it does not, nothing else matters.

**Next — make the ledger real**
Extend the conversion table, add barcode scan for purchase anchoring, correction
flow, low-stock surfacing.

**Then — commerce**
Verified deep links per market first — they work everywhere and block on nothing.
Instacart partner application second, as a US-only enhancement. Kroger OAuth
third. Amazon last, once referral volume clears the Creators API threshold.

**Later — scale content**
Contributor programme for regional cooks, YouTube variation indexing, nutrition
from FoodData Central, diet filters.

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

Single self-contained HTML file. No build step, no dependencies. Eleven dishes
across nine regions, 85 canonical ingredients, five markets, eight diet
profiles.

Two runtime capabilities when published as an artifact:

- `db` — pantry state and cook log, shared and durable. Degrades to in-memory
  when unavailable; the page still works.
- `sample` — the cooking coach. The page hides the feature when it is not
  granted rather than failing.

Example pantry stock is shown on first load so the screen is not empty, and is
plainly labelled as example data until the viewer logs a cook or edits a line.
