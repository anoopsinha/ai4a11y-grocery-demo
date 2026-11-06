// Builds data/products.json: a fixed snapshot of what the store sells.
//
//   - Packaged food comes from Open Food Facts (scripts/shelves.mjs says which).
//   - Fresh produce and meat come from data/counter.json, written by hand,
//     because loose food has no barcode and is thin in Open Food Facts.
//   - Prices and stock are SIMULATED from each product's id and pack size, so
//     they never change between runs.
//
// "Sold in the United States" means: a US/Canada barcode (UPC, leading 0),
// listed for the United States and at most one other country, described in
// English. Products sold worldwide under one barcode are left out on purpose,
// because their names and pack sizes are usually not the American ones.
//
// Run: npm run fetch. Search answers are kept in .cache/ so a second run is
// quick; delete that folder to ask Open Food Facts again.
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { SHELVES } from './shelves.mjs';

const PER_BRAND = 3; // per search, so one brand does not fill a shelf
const UA = { 'User-Agent': 'ai4a11y-grocery-demo/0.2 (research prototype)' };
const at = (p) => new URL(p, import.meta.url);
const FILE = at('../data/products.json'), CACHE = at('../.cache/');
mkdirSync(CACHE, { recursive: true });

const hash = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const tidy = (tags) => (tags || []).filter((t) => t.startsWith('en:')).map((t) => t.slice(3).replace(/-/g, ' '));
const first = (v) => (Array.isArray(v) ? v[0] : String(v || '').split(',')[0] || '').trim();
// Names arrive in every style ("WHOLE MILK", "whole milk"): give those title case.
const title = (s) => (s === s.toUpperCase() || s === s.toLowerCase() ? s.toLowerCase().replace(/(^|[\s(/-])([a-z])/g, (m, a, b) => a + b.toUpperCase()) : s[0].toUpperCase() + s.slice(1));
// One product in `rarity` is out of stock and one more is nearly gone. The fresh counter runs out less often.
const stockFor = (h, rarity = 10) => { const s = (h >>> 10) % rarity; return s === 0 ? 0 : s === 1 ? 2 : 20 + (h % 30); };
const round = (n) => Math.round(n * 100) / 100;

// A pack size as Americans read it: ounces for weight, fluid ounces for volume, a count for eggs.
const TO_OZ = { oz: 1, ounce: 1, ounces: 1, lb: 16, lbs: 16, g: 1 / 28.3495, gr: 1 / 28.3495, grams: 1 / 28.3495, kg: 35.274 };
const TO_FLOZ = { 'fl oz': 1, 'fl. oz': 1, floz: 1, ml: 1 / 29.5735, l: 33.814, liter: 33.814, gal: 128, gallon: 128, qt: 32, pt: 16 };
function packSize(quantity, min = 2, max = 160) {
  const q = String(quantity || '').toLowerCase().replace(/(\d),(\d)/g, '$1.$2');
  const packs = Number((/^\s*(\d+)\s*x\s/.exec(q) || [])[1]) || 1; // "6 x 5.3 oz"
  const size = onePack(q);
  if (!size) return null;
  const amount = size.amount * packs;
  // Outside these ranges the label is a serving size or a typing slip, not a pack.
  const ok = size.unit === 'each' ? amount >= 6 && amount <= 60 : amount >= min && amount <= max;
  return ok ? { amount, unit: size.unit } : null;
}
function onePack(q) {
  const fl = /([\d.]+)\s*(fl\.? ?oz|floz|ml|liter|l|gallon|gal|qt|pt)\b/.exec(q);
  if (fl && Number(fl[1]) > 0) return { amount: Number(fl[1]) * TO_FLOZ[fl[2]], unit: 'fl oz' };
  const wt = /([\d.]+)\s*(ounces|ounce|oz|lbs|lb|grams|gr|kg|g)\b/.exec(q);
  if (wt && Number(wt[1]) > 0) return { amount: Number(wt[1]) * TO_OZ[wt[2]], unit: 'oz' };
  const dozen = /([\d.]+|one|a)?\s*dozen/.exec(q);
  if (dozen) return { amount: (Number(dozen[1]) || 1) * 12, unit: 'each' };
  const count = /(\d+)\s*(eggs|count|ct)\b/.exec(q);
  if (count) return { amount: Number(count[1]), unit: 'each' };
  return null;
}
const sizeLabel = (s) => (s.unit === 'each' ? `${s.amount} count` : `${Math.round(s.amount * 10) / 10} ${s.unit}`);

async function search(slot) {
  const what = slot.tag ? `categories_tags:"en:${slot.tag}"` : slot.text;
  const cache = new URL(encodeURIComponent(slot.tag ? `tag-${slot.tag}` : `text-${slot.text}`) + '.json', CACHE);
  if (existsSync(cache)) return JSON.parse(readFileSync(cache, 'utf8'));
  const params = { q: `${what} countries_tags:"en:united-states" code:0*`, page_size: '100', langs: 'en' };
  if (slot.tag) params.sort_by = '-unique_scans_n'; // a text search is left in order of relevance
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await fetch('https://search.openfoodfacts.org/search?' + new URLSearchParams(params), { headers: UA, signal: AbortSignal.timeout(40000) });
      const hits = (await r.json()).hits;
      if (Array.isArray(hits)) { writeFileSync(cache, JSON.stringify(hits)); await new Promise((d) => setTimeout(d, 1200)); return hits; }
    } catch (e) { console.error(`  ${what}, try ${attempt}: ${e.message}`); }
    await new Promise((d) => setTimeout(d, 8000));
  }
  return null;
}

// The search index has ingredients only as tags; the product page has the label's own words.
let misses = 0;
async function labelText(code) {
  const cache = new URL(`label-${code}.json`, CACHE);
  if (existsSync(cache)) return JSON.parse(readFileSync(cache, 'utf8'));
  if (misses >= 5) return '';
  try {
    const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}?fields=ingredients_text_en,ingredients_text`, { headers: UA, signal: AbortSignal.timeout(6000) });
    const p = (await r.json()).product || {};
    const text = (p.ingredients_text_en || p.ingredients_text || '').replace(/\s+/g, ' ').trim();
    writeFileSync(cache, JSON.stringify(text));
    return text;
  } catch { misses++; return ''; }
}

const JUNK = /best by|correct label|\bimp\b|\d{5,}|[^\x20-\x7e’]/i; // contributor notes, codes, names not in English
const taken = new Set(); // names and barcodes already on a shelf, in any aisle
const old = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')).products : [];
const counter = JSON.parse(readFileSync(at('../data/counter.json'), 'utf8')).items;
const out = [], empty = [];

for (const [aisle, slots] of SHELVES) {
  for (const item of counter.filter((i) => i.category === aisle)) {
    const h = hash(item.id);
    out.push({
      id: item.id, name: item.name, brand: 'Greenbasket fresh', category: aisle, quantity: item.size, size: item.size, image: item.photo?.url || '',
      photoCredit: item.photo ? { by: item.photo.by, license: item.photo.license, page: item.photo.page } : null,
      price: item.price, unitPrice: { amount: round(item.price / item.amount), per: item.unit }, onSale: (h >>> 20) % 6 === 0, stock: stockFor(h, 20),
      ingredients: item.name, allergens: item.allergens || [], traces: [], labels: [], nutriScore: null,
      per100g: { kcal: null, sugars: null, salt: null, protein: null }, source: 'counter',
    });
  }
  for (const slot of slots) {
    const label = slot.tag || slot.text;
    const hits = await search(slot);
    if (!hits) { // keep what the last run had for this search rather than lose it
      const kept = old.filter((p) => p.category === aisle && p.shelf === label);
      out.push(...kept); console.log(`${aisle} / ${label}: search failed, kept ${kept.length} from the last snapshot`); continue;
    }
    const words = slot.text ? slot.text.toLowerCase().split(' ').map((w) => w.replace(/s$/, '')) : [];
    const brands = {};
    const ok = hits.filter((p) => {
      const name = (p.product_name_en || p.product_name || '').trim(), brand = first(p.brands).toLowerCase();
      const countries = p.countries_tags || [];
      if (!/^0\d{11,12}$/.test(p.code) || !countries.includes('en:united-states') || countries.length > 2) return false;
      if (!name || !brand || name.length > 70 || JUNK.test(name) || !p.image_front_small_url || (p.lang && p.lang !== 'en')) return false;
      if (!words.every((w) => name.toLowerCase().includes(w)) || (slot.not && slot.not.test(name))) return false;
      return Boolean(packSize(p.quantity, slot.min, slot.max)); // every product gets a unit price
    });
    if (slot.text) ok.sort((a, b) => (b.unique_scans_n || 0) - (a.unique_scans_n || 0)); // the best-known first
    const kept = ok.filter((p) => {
      const name = (p.product_name_en || p.product_name).trim().toLowerCase(), brand = first(p.brands).toLowerCase();
      if (taken.has(name) || taken.has(p.code) || (brands[brand] || 0) >= PER_BRAND) return false;
      taken.add(name); taken.add(p.code); brands[brand] = (brands[brand] || 0) + 1; return true;
    }).slice(0, slot.n);
    if (kept.length < slot.n) empty.push(`${aisle} / ${label}: ${kept.length} of ${slot.n}`);
    // A bigger pack costs more, but less per ounce: scale the price by size against the usual
    // pack for this kind of product (the middle one of everything the search found).
    const sizes = ok.map((p) => packSize(p.quantity, slot.min, slot.max)).filter((s) => s.unit !== 'each').map((s) => s.amount).sort((a, b) => a - b);
    const middle = sizes[Math.floor((sizes.length - 1) / 2)] || 1;
    const [lo, hi] = slot.price;
    for (const p of kept) {
      const h = hash(p.code), size = packSize(p.quantity, slot.min, slot.max);
      const scale = size.unit === 'each' ? size.amount / 12 : Math.min(3.5, Math.max(0.35, (size.amount / middle) ** 0.7));
      const price = Math.max(0.99, Math.round((lo + ((h % 1000) / 1000) * (hi - lo)) * scale * 2) / 2 - 0.01); // ends in .99 or .49
      const n = p.nutriments || {};
      out.push({
        id: p.code, name: title((p.product_name_en || p.product_name).trim()), brand: first(p.brands), category: aisle, shelf: label,
        quantity: p.quantity || '', size: sizeLabel(size), image: p.image_front_small_url, photoCredit: null,
        price, unitPrice: { amount: round(price / size.amount), per: size.unit === 'each' ? 'egg' : size.unit },
        onSale: (h >>> 20) % 6 === 0, stock: stockFor(h),
        ingredients: (await labelText(p.code)) || tidy(p.ingredients_tags).join(', '),
        allergens: tidy(p.allergens_tags), traces: tidy(p.traces_tags), labels: tidy(p.labels_tags).slice(0, 6),
        nutriScore: /^[a-e]$/.test(p.nutriscore_grade || '') ? p.nutriscore_grade.toUpperCase() : null,
        per100g: { kcal: n['energy-kcal_100g'] ?? null, sugars: n.sugars_100g ?? null, salt: n.salt_100g ?? null, protein: n.proteins_100g ?? null },
        source: 'openfoodfacts',
      });
    }
  }
  console.log(`${aisle}: ${out.filter((p) => p.category === aisle).length}`);
}
if (!out.length) { console.error('Nothing fetched; the snapshot is unchanged.'); process.exit(1); }
writeFileSync(FILE, JSON.stringify({
  source: 'Packaged products: Open Food Facts (ODbL), sold in the United States. Produce and fresh meat: written for this store, photos from Wikimedia Commons. Prices and stock are simulated.',
  fetchedAt: new Date().toISOString().slice(0, 10), products: out,
}, null, 1));
console.log(`wrote ${out.length} products${misses >= 5 ? ' (some ingredient lists from tags: the product pages did not answer)' : ''}`);
if (empty.length) console.log('Short shelves:\n  ' + empty.join('\n  '));
