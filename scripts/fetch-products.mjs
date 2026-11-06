// Builds data/products.json: a fixed snapshot of real products from Open Food
// Facts, with SIMULATED prices and stock derived from each barcode (so they
// never change between runs). Run: npm run fetch
import { writeFileSync, readFileSync, existsSync } from 'node:fs';

const CATEGORIES = [
  ['Bread', 'breads', [2.5, 6]], ['Milk', 'milks', [1.5, 6]], ['Cheese', 'cheeses', [3, 9]],
  ['Yogurt', 'yogurts', [1, 6]], ['Cereal', 'breakfast-cereals', [3, 7]], ['Pasta', 'pastas', [1.2, 4]],
  ['Juice', 'fruit-juices', [2.5, 7]], ['Snacks', 'crackers', [2, 6]], ['Spreads', 'nut-butters', [3, 9]],
];
const FIELDS = 'code,product_name,brands,quantity,product_quantity,product_quantity_unit,image_front_small_url,ingredients_text_en,ingredients_text,allergens_tags,traces_tags,nutriscore_grade,nutriments,labels_tags';
const hash = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const tidy = (tags) => (tags || []).filter((t) => t.startsWith('en:')).map((t) => t.slice(3).replace(/-/g, ' '));

// Categories already in the snapshot are kept, so a rate-limited run can be repeated.
const FILE = new URL('../data/products.json', import.meta.url);
const out = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')).products : [];
for (const [label, tag, [lo, hi]] of CATEGORIES) {
  if (out.some((p) => p.category === label)) continue;
  const url = `https://world.openfoodfacts.org/api/v2/search?categories_tags_en=${tag}&countries_tags_en=united-states&sort_by=unique_scans_n&page_size=30&fields=${FIELDS}`;
  let products = [];
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'ai4a11y-grocery-demo/0.1 (research prototype)' }, signal: AbortSignal.timeout(40000) });
    products = (await r.json()).products || [];
  } catch (e) { console.error(`${label}: ${e.message}`); }
  const seen = new Set();
  const kept = products.filter((p) => {
    const name = (p.product_name || '').trim();
    if (!name || !p.image_front_small_url || seen.has(name.toLowerCase())) return false;
    seen.add(name.toLowerCase()); return true;
  }).slice(0, 10);
  for (const p of kept) {
    const h = hash(p.code);
    const price = Math.round((lo + ((h % 1000) / 1000) * (hi - lo)) * 100 - 1) / 100; // ends in 9
    const qty = Number(p.product_quantity) || null;
    const unit = (p.product_quantity_unit || 'g').toLowerCase();
    const s = (h >>> 10) % 10;
    const n = p.nutriments || {};
    out.push({
      id: p.code, name: p.product_name.trim(), brand: (p.brands || '').split(',')[0].trim(), category: label,
      quantity: p.quantity || '', image: p.image_front_small_url,
      price, unitPrice: qty ? { amount: Math.round((price / qty) * 100 * 100) / 100, per: `100 ${unit}` } : null,
      onSale: (h >>> 20) % 6 === 0,
      stock: s === 0 ? 0 : s === 1 ? 2 : 20 + (h % 30),
      ingredients: (p.ingredients_text_en || p.ingredients_text || '').trim(),
      allergens: tidy(p.allergens_tags), traces: tidy(p.traces_tags), labels: tidy(p.labels_tags).slice(0, 6),
      nutriScore: /^[a-e]$/.test(p.nutriscore_grade || '') ? p.nutriscore_grade.toUpperCase() : null,
      per100g: { kcal: n['energy-kcal_100g'] ?? null, sugars: n.sugars_100g ?? null, salt: n.salt_100g ?? null, protein: n.proteins_100g ?? null },
    });
  }
  console.log(`${label}: ${kept.length}`);
  await new Promise((r) => setTimeout(r, 15000)); // the search API allows about 10 requests a minute
}
writeFileSync(FILE, JSON.stringify({ source: 'Open Food Facts (ODbL). Prices and stock are simulated.', fetchedAt: new Date().toISOString().slice(0, 10), products: out }, null, 1));
console.log(`wrote ${out.length} products`);
