// Does the assistant understand its set phrases, against the real product
// snapshot? Run: npm test. The brain is pure, so this needs no browser: the
// store here is a small in-memory stand-in for window.greenbasket.
import { readFileSync } from 'node:fs';
import { createBrain } from '../public/assistant/brain.js';
import { buildPrompt, validate } from '../public/assistant/model.js';
const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const { products } = read('../data/products.json'), { recipes } = read('../data/recipes.json');

function fakeStore() {
  let cart = {};
  const byId = new Map(products.map((p) => [p.id, p]));
  const subtotal = () => Object.entries(cart).reduce((s, [id, q]) => s + q * byId.get(id).price, 0);
  return {
    products, recipes, cart: () => ({ ...cart }), subtotal, total: () => subtotal() + (Object.keys(cart).length ? 5.99 : 0), slot: () => 'Today, 5 to 7 pm',
    add: (id, q = 1) => { cart[id] = Math.min(byId.get(id).stock, (cart[id] || 0) + q); return cart[id]; },
    remove: (id) => { delete cart[id]; }, clear: () => { cart = {}; }, restore: (c) => { cart = { ...c }; },
    checkout: () => { const r = { items: Object.values(cart).reduce((s, n) => s + n, 0), total: subtotal() + 5.99 }; cart = {}; return r; },
    substituteFor: (id) => products.find((p) => p.id !== id && p.stock > 0 && p.category === byId.get(id).category) || null,
    shown: null, show(q) { this.shown = q; },
  };
}
const needs = [];
const profile = { get: async () => ({ needs, supportAreas: [] }), set: async ({ needs: ch }) => { for (const c of ch) { const i = needs.findIndex((n) => n.dimension === c.dimension); if (i >= 0) needs.splice(i, 1); if (c.value != null) needs.push({ dimension: c.dimension, value: c.value }); } } };
const store = fakeStore();
const brain = createBrain({ store, profile });

let failed = 0;
const check = async (text, expect) => {
  const r = await brain.handle(text);
  const ok = typeof expect === 'function' ? expect(r.say, r) : expect.test(r.say);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} "${text}" -> ${r.say.slice(0, 110)}${r.say.length > 110 ? '…' : ''}`);
};

await check('help', /look things up/);
await check('do you have chicken breasts?', (s, r) => /chicken breasts/i.test(s) && !/ramen|soup/i.test(s) && r.products.length > 0);
await check('how much is salmon', /Salmon fillet.*\$/);
await check('find pickled walrus', /could not find/);
await check('add two avocados', (s) => /Added 2 Avocado/.test(s) && store.cart()['fresh-avocado'] === 2);
await check('add a pack of fettuccine to my cart', /Added .*Fettuccine/i);
await check('I need garlic', /Added Garlic/);
await check("what's in my cart", /items.*Avocado.*Fettuccine.*Garlic/s);
await check('remove the garlic', (s) => /Removed Garlic/.test(s) && !store.cart()['fresh-garlic']);
await check('undo', (s) => /Undone/.test(s) && store.cart()['fresh-garlic'] === 1);
await check('what meals can you make', (s) => /20 meals.*Chicken alfredo/.test(s) && s.length < 400 && /Say more/.test(s));
await check('more', /Beef chili|Sheet-pan|and \d+ more/);
await check('what do I need for chicken alfredo', /7 ingredients.*chicken, fettuccine.*Add everything to the cart\?/);
await check('shop for it', (s) => /Added 6 products, one of each: .*Fettuccine, 16 oz|Added \d+ products, one of each/.test(s) && /one portion of each ingredient for 1 meal/.test(s) && /details/i.test(s));
await check('yes', /Which one\?/);
await check('details on the fettuccine', (s) => /Fettuccine.*Allergens.*Anything else/s.test(s));
await check('no', /Okay/);
await check('what do I need for chicken tacos', /12 ingredients/);
await check('add all of those to my cart', (s) => /Added \d+ products/.test(s) && /Already had/.test(s));
await check('shop for chicken alfredo and chicken tacos for 3 days', (s) => /for 3 days/.test(s) && /shared/.test(s) && /Already had/.test(s) && /asked for 3 days, so you may want one more meal/.test(s));
await check('yes', (s) => /Added|Nothing is waiting|Which one/.test(s));
await check("what's in my cart", (s) => /and \d+ more. Say more/.test(s));
await check('more', /, and \d+ more|That is all/);
await check('is there a substitute for roma tomatoes', /Instead of .*Add it\?/);
await check('no', /will not/);
await check('empty my cart', /Empty the cart.*yes or no/);
await check('no', /will not/);
await check('place the order', /Place the order.*yes or no/);
await check('yes', (s) => /Order placed/.test(s) && Object.keys(store.cart()).length === 0);
await check('read replies aloud', (s) => /read replies aloud/.test(s) && needs.some((n) => n.dimension === 'readAloud' && n.value === true));
await check('speak slower', (s) => /0\.8 times/.test(s));
await check('bigger text', (s) => /125 percent/.test(s));
await check("I'm blind", (s) => /read every reply aloud/.test(s));
await check('stop reading aloud', (s) => /stop reading/.test(s) && needs.some((n) => n.dimension === 'readAloud' && n.value === false));
await check('normal text', /Normal/);
await check('tell me a joke about pickles', /did not follow/);
// The model lane, with a stand-in model: the prompt carries the data, and only
// validated intents are acted on.
const canned = {
  'which cheeses cost less than four dollars': '{"type":"answer","say":"Three cheeses are under four dollars: Mexican shredded cheese, Singles and Mozzarella."}',
  'anything with no nuts i can snack on': '{"type":"find","query":"pretzels"}',
  'bring me a pound of ground beef and some buns': '{"type":"add","items":[{"query":"ground beef","qty":1},{"query":"hamburger buns","qty":1}]}',
  'nonsense from the model': '{"type":"evil","say":"<script>"}',
};
const fakeModel = {
  available: () => true,
  resolve: async (text, ctx) => {
    const prompt = buildPrompt(text, ctx, []);
    if (!prompt.includes('PRODUCTS (id|name') || !prompt.includes('Chicken alfredo (dinner)')) throw new Error('prompt lacks the data');
    const key = Object.keys(canned).find((k) => text.toLowerCase().includes(k));
    return validate(JSON.parse(canned[key] || '{"type":"none","say":"I am not sure."}'));
  },
};
const brain2 = createBrain({ store: fakeStore(), profile, model: fakeModel });
const check2 = async (text, expect) => { const r = await brain2.handle(text); const ok = expect.test(r.say); if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} [model] "${text}" -> ${r.say.slice(0, 110)}`); };
await check2('Which cheeses cost less than four dollars?', /Three cheeses/);
await check2('is there anything with no nuts I can snack on?', /pretzel/i);
await check2('bring me a pound of ground beef and some buns', /Added .*Ground beef.*bun/i);
await check2('nonsense from the model', /did not follow/);
await check2('add avocados', /Added Avocado/);   // a set phrase never waits for the model
const p1 = buildPrompt('x', brain2.context(), []);
console.log(`prompt: ${p1.length} characters, about ${Math.round(p1.length / 4)} tokens`);

console.log(failed ? `\n${failed} failed` : '\nassistant: all phrases understood');
process.exit(failed ? 1 : 0);
