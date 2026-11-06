// Can the store supply every basic meal in data/recipes.json? Run: npm test
// Fails when an ingredient has no product on the shelf at all. An ingredient
// whose every match is out of stock is only reported: that is the store
// behaving like a store, and a place to try substitutions.
import { readFileSync } from 'node:fs';
const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const { products } = read('../data/products.json'), { recipes } = read('../data/recipes.json');
const find = (words) => products.filter((p) => words.some((w) => p.name.toLowerCase().includes(w.toLowerCase())));

let missing = 0, short = 0;
for (const r of recipes) {
  const gaps = [], out = [];
  for (const [need, words] of Object.entries(r.ingredients)) {
    const found = find(words);
    if (!found.length) gaps.push(need);
    else if (!found.some((p) => p.stock > 0)) out.push(need);
  }
  missing += gaps.length; short += out.length;
  console.log(`${gaps.length ? 'FAIL' : 'ok  '} ${r.name} (${Object.keys(r.ingredients).length} ingredients)`
    + (gaps.length ? `\n       not on the shelf: ${gaps.join(', ')}` : '') + (out.length ? `\n       all out of stock: ${out.join(', ')}` : ''));
}
// How much is shared: ingredients that appear in three or more meals.
const uses = {};
for (const r of recipes) for (const need of Object.keys(r.ingredients)) uses[need] = (uses[need] || 0) + 1;
console.log('\nUsed by three or more meals: ' + Object.entries(uses).filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} (${n})`).join(', '));
console.log(`\n${recipes.length} meals, ${products.length} products: ${missing} ingredients missing, ${short} out of stock everywhere`);
process.exit(missing ? 1 : 0);
