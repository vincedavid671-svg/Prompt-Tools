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
| Nutrition, calories, macros | USDA FoodData Central | CC0 public domain, free key, 1,000 req/hr |
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
- Nutrition and calorie data are not wired up; the diet engine covers
  religious and preference restrictions only, not macros.
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
Does the foundation-and-layers framing actually help someone cook better? Eleven
dishes is enough to find out. If it does not, nothing else matters.

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
