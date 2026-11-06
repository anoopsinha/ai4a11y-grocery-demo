# Greenbasket: a simulated grocery store

A small practice store for building shopping adaptations with the
[AI for Accessibility Toolkit](https://github.com/AI-for-Accessibility-Collective/AI-for-Accessibility-Toolkit).
It is stocked for planning a few days of basic lunches and dinners, such as
chicken alfredo and chicken tacos, with ingredients that several meals share.

> This is a research prototype. The packaged products are real, but the
> prices and stock are made up, and nothing can be ordered. It is a safe
> place to try adaptations, and it does not show that they work on a real
> store.

![The Greenbasket store with the assistant sidebar open. The store shows chicken products; the sidebar lists the products it just added for chicken tacos, each with an Add button, and answers "which of those have dairy in them?" by naming the shredded cheese.](docs/screenshot.png)

*The store with the assistant open: it has just shopped for chicken tacos
and answered a question about dairy. You can type, or press Voice and talk.*

## Try it

The store is online at
[anoopsinha.github.io/ai4a11y-grocery-demo](https://anoopsinha.github.io/ai4a11y-grocery-demo/).
It is the same page as the local one. Your cart stays in your own browser.

## Run it

You need Node 20 or later.

```bash
npm ci           # the toolkit package, vendored in vendor/
npm start        # open http://127.0.0.1:5175/
npm test         # can the store supply every meal, and does the assistant understand its phrases?
```

## The assistant

The **Assistant** button opens a chat beside the store. You can type, or press
**Voice** and talk. It looks things up, fills the cart, plans meals and
places the simulated order, and it answers in plain sentences made to be
spoken as well as read:

- *do you have chicken breasts* · *how much is salmon* · *add two avocados*
- *what meals can you make* · *what do I need for chicken alfredo*
- *shop for chicken alfredo and chicken tacos for three days*: one product
  per ingredient goes in the cart, reusing what is already there, and it says
  what the meals share and what is out of stock, with a substitute to accept
- after a meal question: *shop for it*, *add them all*, or just *yes*
- *details on the fettuccine* · *what's in the salsa* · *more* (the rest of a list)
- *what's in my cart* · *remove the salsa* · *undo* · *place the order*
- *read replies aloud* · *speak slower* · *bigger text* · *I'm blind*

When it adds a meal it says how much of each thing went in (one pack or
piece per ingredient, with the size), whether that matches the days you
asked for, and offers details on any item; after details it asks whether
you have another question. Anything that is hard to undo (the order,
emptying the cart, a substitute) waits for a *yes*. Long lists are read a
few at a time: *more* continues.

**Voice.** With a model key the replies are spoken by Google's speech model
(voice `Sulafat` on `gemini-3.8-flash-lite-tts`; both can be changed in
`.env`, and `GEMINI_TTS_MODEL=off` keeps the browser's own voices). Without
one, the toolkit's speech block speaks with the best voice the browser has.
A reply is fetched in pieces so the first sentence starts sooner. The
microphone stays on while the assistant talks, but then it listens for one
thing only: *hey assistant*. Both words together stop the voice, and
whatever follows in the same breath ("hey assistant, add two avocados") is
the request. Anything else it hears meanwhile, mostly its own voice, is
ignored and the reply plays to the end. You can also press **Stop
speaking**, press Escape, or start typing. A small two-note sound plays while the assistant waits on the
model, with a soft tick while it is still waiting, and a short note when
the answer arrives.

**How it uses the toolkit.** The
[AI for Accessibility Toolkit](https://github.com/AI-for-Accessibility-Collective/AI-for-Accessibility-Toolkit)
runs in the browser, over a localStorage port
(`public/ports/local-storage-kv.js`). Its profile is the one place the
assistant keeps how it should speak and show itself: *read replies aloud*,
*speak slower* and *bigger text* write needs (`readAloud`, `readAloudRate`,
`textSize`) to the profile, and the page renders them with the toolkit's web
surface. The spoken replies go through the toolkit's speech block
(`speech.say()`) when there is no speech model, and the profile's speaking
rate applies either way. The microphone is the page's own
(`public/assistant/listen.js`): dictation with interim results, which the
toolkit's command listener does not give and barge-in needs. The toolkit is
vendored as a packed tarball in `vendor/`
(`npm run vendor` repacks it from a checkout next to this one; `vendor/PIN.txt`
says which commit).

**Simple phrases by rule, the rest by model.** `public/assistant/brain.js`
answers exact simple phrases itself, with no model and no network: yes, no,
more, stop, undo, the cart, the order, the voice and text settings, and
short commands of a few words such as *add two avocados* or *details on the
salsa*. Everything else goes to a model when one is reachable, which is the
usual case; without a model the same rules understand the longer phrases
above as a fallback, and that is what `npm test` checks. The model: on your own computer, put a Google AI key in `.env`
(`GEMINI_API_KEY`, see `.env.example`) and the server makes the call, so the
key never reaches the browser; on the hosted page, the sidebar's **Model**
section takes a key that stays in that browser. The model sees the shelves,
the meals and the cart as data and answers with one intent from a small
vocabulary, which `model.js` validates before anything acts on it. Without a
model the assistant says what it can do instead.

Voice input needs a browser with speech recognition (Chrome and Edge have it)
and permission to use the microphone.

## What is in it

About 280 products in 17 aisles, kept as a fixed snapshot in
`data/products.json`.

- **Packaged food** comes from [Open Food Facts](https://world.openfoodfacts.org):
  names, brands, pack sizes, pictures, ingredients, allergens and nutrition.
  `scripts/shelves.mjs` lists what each aisle stocks, one staple per line.
- **Produce and fresh meat** are written by hand in
  `scripts/counter-source.txt`, because loose food has no barcode. They carry
  the store's own name, "Greenbasket fresh", and have no label data. Their
  photos come from Wikimedia Commons and show the kind of food, not the exact
  item. Each product's details name the photographer and the licence.
- **The store is American.** Packaged products have a United States barcode,
  are listed for the United States and are described in English. Sizes and
  unit prices are in ounces, fluid ounces and pounds. Nutrition is per 100 g,
  because that is how the source records it.
- **Prices and stock are simulated.** Each is worked out from the product's
  barcode and pack size, so they stay the same every time, and a bigger pack
  costs less per ounce. They are not real American prices. About one packaged
  product in ten is out of stock, and one fresh item in twenty.
- **The store itself** has search, aisles, unit prices, an ingredients and
  allergens panel, substitutes for out-of-stock products, a cart, delivery
  times and a simulated checkout. The cart is kept in the browser.

`window.greenbasket` gives adapters and tests a read-only view of the
products, the cart and the substitute for a product.

## The meals it is stocked for

`data/recipes.json` lists 20 basic lunches and dinners as shopping lists, not
cooking instructions. `npm test` checks every ingredient against the shelves.
It fails when an ingredient is not sold at all. It only reports an ingredient
that is sold but out of stock, because that is the store behaving like a
store.

Right now every ingredient is sold. Four meals have an ingredient that is out
of stock: fresh tomatoes (both kinds), tomato soup and Caesar dressing.

## Known rough edges

Some of these are on purpose: they are the kind of barrier a real store has.

- **Substitutes are naive.** The store offers something in stock with a
  shared word in its name. Roma tomatoes get tomato sauce, and cherry
  tomatoes get ketchup.
- **Ingredient lists.** Most are built from Open Food Facts ingredient tags,
  in lower case, not the wording on the label. A few products have none.
- **Odd aisles and names.** The source's categories are broad, so crispbread
  is under bread and instant ramen under pasta. Some names are as contributors
  typed them.
- **One repeated photo.** Ground turkey and lean ground beef share a picture.
- **Tidier than a real store.** There are no pop-ups, no expiring delivery
  times and no endless scrolling.
- **The assistant is literal.** Its set phrases are listed above; wording
  far from them needs the model. It picks the cheapest in-stock product for
  an ingredient, which is sometimes a small pack.
- **The toolkit runs only in this browser.** The profile is local; it does
  not sync with a hosted toolkit, and the store registers no adapters.

## Change what the store sells

```bash
npm run fetch      # rebuild data/products.json from the shelf list and the counter
npm run counter    # rebuild the fresh counter after editing counter-source.txt
```

- **A packaged staple:** add a line to `scripts/shelves.mjs`, then
  `npm run fetch`. Search answers are kept in `.cache/`, so only the new line
  asks Open Food Facts. If a search fails, the script keeps what the last
  snapshot had.
- **A fresh item:** add a line to `scripts/counter-source.txt`, then
  `npm run counter` and `npm run fetch`. To choose a photo by eye, run
  `node scripts/build-counter.mjs --sheet sheet.html`, open the page, and put
  the number of the picture you want in `data/counter-photos.json`.
- **A meal:** add it to `data/recipes.json` and run `npm test`.

## License

The code and the hand-written content are licensed under
[Apache 2.0](LICENSE), like the toolkit. That covers the store page, the
assistant, the scripts, the fresh counter list and the meal list. The
toolkit package in `vendor/` is the Collective's, under the same licence.

The licence does not cover the product data or the pictures. They belong to
others and keep their own terms:

- **Packaged product data** is © Open Food Facts contributors, under the
  [Open Database License](https://opendatacommons.org/licenses/odbl/1-0/).
  The packaged entries in `data/products.json` are drawn from that database,
  so they stay under that licence. If you share them, credit Open Food Facts
  and keep the same licence.
- **Product pictures** are loaded from Open Food Facts and have their own
  licences. They are not stored in this repository.
- **Fresh counter photos** are loaded from Wikimedia Commons under Creative
  Commons or public-domain terms. The photographer, licence and source page
  of each are in `data/counter.json` and shown in the store.
- **Brand and product names** belong to their owners. Greenbasket is a made-up
  store and is not connected to any of them.
