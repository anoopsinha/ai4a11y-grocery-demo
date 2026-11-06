# Greenbasket: a simulated grocery store

A small practice store for building shopping adaptations with the
[AI for Accessibility Toolkit](https://github.com/AI-for-Accessibility-Collective/AI-for-Accessibility-Toolkit).
It is stocked for planning a few days of basic lunches and dinners, such as
chicken alfredo and chicken tacos, with ingredients that several meals share.

> This is a research prototype. The packaged products are real, but the
> prices and stock are made up, and nothing can be ordered. It is a safe
> place to try adaptations, and it does not show that they work on a real
> store.

## Run it

You need Node 20 or later. There is nothing to install.

```bash
npm start        # open http://127.0.0.1:5175/
npm test         # can the store supply every meal in data/recipes.json?
```

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
- **The toolkit is not connected.** There is no profile and there are no
  adapters yet.

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

## Data and photo licences

- Packaged product data © Open Food Facts contributors, under the
  [Open Database License](https://opendatacommons.org/licenses/odbl/1-0/).
  Product pictures are loaded from Open Food Facts and have their own licences.
- Fresh counter photos are loaded from Wikimedia Commons under Creative
  Commons or public-domain terms. The photographer, licence and source page of
  each are in `data/counter.json` and shown in the store.
