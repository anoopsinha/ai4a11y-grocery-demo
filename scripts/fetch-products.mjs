// Builds data/products.json: a fixed snapshot of real products sold in the
// United States, from Open Food Facts, with SIMULATED prices and stock derived
// from each barcode (so they never change between runs). Run: npm run fetch
//
// "Sold in the United States" here means: a US/Canada barcode (UPC, leading 0),
// listed for the United States and at most one other country, described in
// English. Products sold worldwide under one barcode are left out on purpose,
// because their names and pack sizes are usually not the American ones.
import { writeFileSync, readFileSync, existsSync } from 'node:fs';

const CATEGORIES = [ // aisle, Open Food Facts category, simulated price range in dollars
  ['Bread', 'breads', [2.5, 6]], ['Milk', 'milks', [1.5, 6]], ['Cheese', 'cheeses', [3, 9]],
  ['Yogurt', 'yogurts', [1, 6]], ['Cereal', 'breakfast-cereals', [3, 7]], ['Pasta', 'pastas', [1.2, 4]],
  ['Juice', 'fruit-juices', [2.5, 7]], ['Snacks', 'crackers', [2, 6]], ['Spreads', 'nut-butters', [3, 9]],
];
const PER_AISLE = 10, PER_BRAND = 3;
const UA = { 'User-Agent': 'ai4a11y-grocery-demo/0.1 (research prototype)' };
const FILE = new URL('../data/products.json', import.meta.url);

const hash = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const tidy = (tags) => (tags || []).filter((t) => t.startsWith('en:')).map((t) => t.slice(3).replace(/-/g, ' '));
const first = (v) => (Array.isArray(v) ? v[0] : String(v || '').split(',')[0] || '').trim();
// Names arrive in every style ("WHOLE MILK", "whole milk"): give those title case.
const title = (s) => (s === s.toUpperCase() || s === s.toLowerCase() ? s.toLowerCase().replace(/(^|[\s(/-])([a-z])/g, (m, a, b) => a + b.toUpperCase()) : s[0].toUpperCase() + s.slice(1));

// A pack size as Americans read it: ounces for weight, fluid ounces for volume.
const TO_OZ = { oz: 1, ounce: 1, ounces: 1, lb: 16, lbs: 16, g: 1 / 28.3495, gr: 1 / 28.3495, grams: 1 / 28.3495, kg: 35.274 };
const TO_FLOZ = { 'fl oz': 1, 'fl. oz': 1, 'fl. oz.': 1, floz: 1, ml: 1 / 29.5735, l: 33.814, liter: 33.814, gal: 128, gallon: 128, qt: 32, pt: 16 };
function packSize(quantity) {
  const q = String(quantity || '').toLowerCase().replace(/(\d),(\d)/g, '$1.$2');
  const packs = Number((/^\s*(\d+)\s*x\s/.exec(q) || [])[1]) || 1; // "6 x 5.3 oz"
  const size = onePack(q);
  if (!size) return null;
  const amount = size.amount * packs;
  // Outside this range the label is a serving size or a typing slip, not a pack.
  return amount >= 2 && amount <= 130 ? { amount, unit: size.unit } : null;
}
function onePack(q) {
  const fl = /([\d.]+)\s*(fl\.? ?oz\.?|floz|ml|liter|l|gallon|gal|qt|pt)\b/.exec(q);
  if (fl && Number(fl[1]) > 0) return { amount: Number(fl[1]) * TO_FLOZ[fl[2].replace(/\.$/, '')] || Number(fl[1]) * TO_FLOZ[fl[2]], unit: 'fl oz' };
  const wt = /([\d.]+)\s*(ounces|ounce|oz|lbs|lb|grams|gr|kg|g)\b/.exec(q);
  if (wt && Number(wt[1]) > 0) return { amount: Number(wt[1]) * TO_OZ[wt[2]], unit: 'oz' };
  return null;
}

async function search(tag) {
  const q = `categories_tags:"en:${tag}" countries_tags:"en:united-states" code:0*`;
  const url = 'https://search.openfoodfacts.org/search?' + new URLSearchParams({ q, page_size: '100', sort_by: '-unique_scans_n', langs: 'en' });
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(40000) });
      const hits = (await r.json()).hits;
      if (Array.isArray(hits)) return hits;
    } catch (e) { console.error(`  ${tag}, try ${attempt}: ${e.message}`); }
    await new Promise((r) => setTimeout(r, 10000));
  }
  return null;
}

// The search index has ingredients only as tags; the product page has the label's own words.
let misses = 0;
async function labelText(code) {
  if (misses >= 3) return '';
  try {
    const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}?fields=ingredients_text_en,ingredients_text`, { headers: UA, signal: AbortSignal.timeout(8000) });
    const p = (await r.json()).product || {};
    misses = 0;
    return (p.ingredients_text_en || p.ingredients_text || '').replace(/\s+/g, ' ').trim();
  } catch { misses++; return ''; }
}

const JUNK = /best by|correct label|\bimp\b|\d{5,}|[^\x20-\x7e’]/i; // contributor notes, codes, names not in English
const taken = new Set(); // names and barcodes already on a shelf, in any aisle
const old = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')).products : [];
const out = [];
for (const [label, tag, [lo, hi]] of CATEGORIES) {
  const hits = await search(tag);
  if (!hits) { // keep what the last run had for this aisle rather than lose it
    const kept = old.filter((p) => p.category === label);
    out.push(...kept); console.log(`${label}: search failed, kept ${kept.length} from the last snapshot`); continue;
  }
  const brands = {};
  const kept = hits.filter((p) => {
    const name = (p.product_name_en || p.product_name || '').trim(), brand = first(p.brands).toLowerCase();
    const countries = p.countries_tags || [];
    if (!/^0\d{11,12}$/.test(p.code) || !countries.includes('en:united-states') || countries.length > 2) return false;
    if (!name || !brand || name.length > 70 || JUNK.test(name) || !p.image_front_small_url || (p.lang && p.lang !== 'en')) return false;
    if (!packSize(p.quantity)) return false; // every product gets a unit price
    if (taken.has(name.toLowerCase()) || taken.has(p.code) || (brands[brand] || 0) >= PER_BRAND) return false;
    taken.add(name.toLowerCase()); taken.add(p.code); brands[brand] = (brands[brand] || 0) + 1; return true;
  }).slice(0, PER_AISLE);
  // A bigger pack costs more, but less per ounce: scale the price by size against the aisle's middle pack.
  const sizes = kept.map((p) => packSize(p.quantity).amount).sort((a, b) => a - b);
  const middle = sizes[Math.floor(sizes.length / 2)] || 1;
  for (const p of kept) {
    const h = hash(p.code);
    const size = packSize(p.quantity);
    const scale = Math.min(2.2, Math.max(0.5, (size.amount / middle) ** 0.7));
    const price = Math.max(0.99, Math.round((lo + ((h % 1000) / 1000) * (hi - lo)) * scale) - 0.01 + (h % 2 ? 0 : 0.5)); // ends in .99 or .49
    const s = (h >>> 10) % 10;
    const n = p.nutriments || {};
    out.push({
      id: p.code, name: title((p.product_name_en || p.product_name).trim()), brand: first(p.brands), category: label,
      quantity: p.quantity || '', size: `${Math.round(size.amount * 10) / 10} ${size.unit}`, image: p.image_front_small_url,
      price, unitPrice: { amount: Math.round((price / size.amount) * 100) / 100, per: size.unit },
      onSale: (h >>> 20) % 6 === 0,
      stock: s === 0 ? 0 : s === 1 ? 2 : 20 + (h % 30),
      ingredients: (await labelText(p.code)) || tidy(p.ingredients_tags).join(', '),
      allergens: tidy(p.allergens_tags), traces: tidy(p.traces_tags), labels: tidy(p.labels_tags).slice(0, 6),
      nutriScore: /^[a-e]$/.test(p.nutriscore_grade || '') ? p.nutriscore_grade.toUpperCase() : null,
      per100g: { kcal: n['energy-kcal_100g'] ?? null, sugars: n.sugars_100g ?? null, salt: n.salt_100g ?? null, protein: n.proteins_100g ?? null },
    });
  }
  console.log(`${label}: ${kept.length}`);
  await new Promise((r) => setTimeout(r, 3000)); // be polite to the API
}
if (!out.length) { console.error('Nothing fetched; the snapshot is unchanged.'); process.exit(1); }
writeFileSync(FILE, JSON.stringify({ source: 'Open Food Facts (ODbL), products sold in the United States. Prices and stock are simulated.', fetchedAt: new Date().toISOString().slice(0, 10), products: out }, null, 1));
console.log(`wrote ${out.length} products${misses >= 3 ? ' (ingredient lists from tags: the product pages did not answer)' : ''}`);
