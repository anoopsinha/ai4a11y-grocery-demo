# Greenbasket: a simulated grocery store

A small practice store for building shopping adaptations with the
[AI for Accessibility Toolkit](https://github.com/AI-for-Accessibility-Collective/AI-for-Accessibility-Toolkit).

> This is a research prototype. The products are real, but the prices and
> stock are made up, and nothing can be ordered. It is a safe place to try
> adaptations, and it does not show that they work on a real store.

## Run it

You need Node 20 or later. There is nothing to install.

```bash
npm start        # open http://127.0.0.1:5175/
```

## What is in it

- **Products** come from [Open Food Facts](https://world.openfoodfacts.org):
  names, brands, pack sizes, pictures, ingredients, allergens and nutrition.
  They are kept as a fixed snapshot in `data/products.json`.
- **Prices and stock are simulated.** Each is worked out from the product's
  barcode, so they stay the same every time. About one product in ten is out
  of stock and one in ten is low, so substitutions can be tried.
- **The store** has search, aisles, unit prices, an ingredients and allergens
  panel, substitutes for out-of-stock products, a cart, delivery times and a
  simulated checkout. The cart is kept in the browser.

`window.greenbasket` gives adapters and tests a read-only view of the
products, the cart and the substitute for a product.

## Refresh the products

```bash
npm run fetch
```

The Open Food Facts search allows about ten requests a minute. The script
keeps the aisles it already has, so run it again if an aisle comes back empty.

## Not built yet

- The snapshot has 40 products in four aisles (bread, milk, yogurt, cereal).
  The Open Food Facts search was unavailable when the other five were fetched.
- Many products are not from the United States, so some names are in French.
  The country filter in the fetch script does not work yet.

- The toolkit is not connected. There is no profile and there are no adapters.
- The store is tidier than a real one. It has no pop-ups, no expiring
  delivery times and no endless scrolling.

## Data licence

Product data © Open Food Facts contributors, under the
[Open Database License](https://opendatacommons.org/licenses/odbl/1-0/).
Product pictures are loaded from Open Food Facts and have their own licences.
