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
  They are kept as a fixed snapshot in `data/products.json`: 90 products in
  nine aisles.
- **The store is American.** The snapshot only takes products with a United
  States barcode that are listed for the United States and described in
  English. Pack sizes and unit prices are in ounces and fluid ounces.
  Nutrition is per 100 g, because that is how the source records it.
- **Prices and stock are simulated.** Each is worked out from the product's
  barcode and pack size, so they stay the same every time, and a bigger pack
  costs less per ounce. They are not real American prices. About one product in ten is out
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

This fetches every aisle again. If the search fails for an aisle, the script
keeps what the last snapshot had for it.

## Not built yet

- Most ingredient lists are built from Open Food Facts ingredient tags, in
  lower case, not the wording on the label. The product pages that hold the
  label text were not answering when the snapshot was made.
- A few products sit in an odd aisle (crispbread under bread, instant ramen
  under pasta), because the source's categories are broad.
- The toolkit is not connected. There is no profile and there are no adapters.
- The store is tidier than a real one. It has no pop-ups, no expiring
  delivery times and no endless scrolling.

## Data licence

Product data © Open Food Facts contributors, under the
[Open Database License](https://opendatacommons.org/licenses/odbl/1-0/).
Product pictures are loaded from Open Food Facts and have their own licences.
