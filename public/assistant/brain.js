// The assistant's brain: one sentence in, one reply out, with the store as
// the only thing it touches. No DOM, no network: the page gives it a `store`
// (products, meals, the cart and a few actions) and a `profile` (the toolkit's
// needs), so it also runs in Node for the tests.
//
//   sentence ──▶ parse() (set phrases, always) ──hit──▶ intent ──▶ execute()
//                   │ miss
//                   ▼ (a model, when the page has one)
//             model.resolve(sentence) ──▶ intent ──▶ execute()
//                   │ none
//                   ▼
//             "I didn't follow that", with what it can do
//
// Replies are plain sentences made to be spoken as well as read. A reply may
// carry `products` for the page to show as cards. State-changing steps that
// are hard to undo (placing the order, emptying the cart, taking a substitute)
// wait for a "yes".

const NUMBERS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const FILLER = new Set(['and', 'with', 'the', 'fresh', 'organic', 'original', 'about', 'style', 'free', 'low', 'whole', 'natural', 'classic', 'some', 'any', 'of', 'for', 'in', 'to', 'please', 'me', 'my']);
const money = (n) => '$' + Number(n).toFixed(2);
const list = (xs) => (xs.length <= 1 ? xs.join('') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1]);
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const clean = (t) => String(t || '').toLowerCase().replace(/[^\p{L}\p{N}$.' ]/gu, ' ').replace(/\s+/g, ' ').trim();
const singular = (w) => (w.endsWith('oes') ? w.slice(0, -2) : w.endsWith('ies') ? w.slice(0, -3) + 'y' : w.endsWith('ses') ? w.slice(0, -2) : w.length > 3 ? w.replace(/s$/, '') : w);
const words = (t) => clean(t).split(' ').map(singular).filter((w) => w && !FILLER.has(w));

export const HELP = 'I can look things up, fill your cart and plan meals. Try: do you have chicken breasts. '
  + 'Add two avocados. What is in my cart. What meals can you make. What do I need for chicken alfredo. '
  + 'Shop for chicken alfredo and chicken tacos for three days. Remove the salsa. Place the order. '
  + 'You can also say read replies aloud, speak slower, or bigger text.';

// ── matching products and meals ──────────────────────────────────────────────
// Score a product against a phrase: whole phrase in the name is best, then
// how many of the phrase's words the name shares, then brand and aisle words.
function score(p, phrase) {
  const name = clean(p.name), ws = words(phrase);
  if (!ws.length) return 0;
  const nameWords = new Set(words(p.name)), other = new Set(words(`${p.brand} ${p.category} ${p.shelf || ''}`));
  let s = name.includes(clean(phrase)) ? 10 : 0;
  let hits = 0;
  for (const w of ws) {
    const part = w.length >= 4 && [...nameWords].some((n) => n.length >= 4 && (n.startsWith(w) || w.startsWith(n)));
    const got = nameWords.has(w) ? 3 : part ? 1.5 : other.has(w) ? 1 : 0;
    if (got) hits++;
    s += got;
  }
  return hits ? s / Math.sqrt(ws.length) : 0;
}

export function createBrain({ store, profile = null, model = null, speech = null }) {
  let pending = null;   // a question waiting for yes or no
  const history = [];   // cart snapshots, for undo

  // Products for a phrase, best first. When something matches the whole
  // phrase, products that match only a word of it ("chicken" in a soup) drop out.
  const find = (phrase, { min = 1.4 } = {}) => {
    const scored = store.products.map((p) => ({ p, s: score(p, phrase) })).filter((x) => x.s >= min);
    const best = Math.max(0, ...scored.map((x) => x.s));
    return scored.filter((x) => x.s >= Math.max(min, best * 0.55))
      .sort((a, b) => b.s - a.s || (b.p.stock > 0) - (a.p.stock > 0) || a.p.price - b.p.price).map((x) => x.p);
  };

  const meals = () => store.recipes;
  const mealsIn = (text) => {
    const t = clean(text);
    return meals().filter((r) => {
      const name = clean(r.name);
      if (t.includes(name)) return true;
      const ws = words(name).filter((w) => w.length > 3);
      return ws.length >= 2 && ws.every((w) => t.includes(w));
    });
  };
  const ingredientProducts = (matchWords) => store.products.filter((p) => matchWords.some((w) => p.name.toLowerCase().includes(w.toLowerCase())));
  const inCart = (id) => store.cart()[id] || 0;
  const cartLines = () => Object.entries(store.cart()).map(([id, qty]) => ({ p: store.products.find((x) => x.id === id), qty })).filter((l) => l.p);
  const remember = () => { history.push(store.cart()); if (history.length > 20) history.shift(); };
  const price = (p) => `${money(p.price)}${p.unitPrice ? ` (${money(p.unitPrice.amount)} per ${p.unitPrice.per})` : ''}`;
  const describe = (p) => `${p.name}${p.size || p.quantity ? `, ${p.size || p.quantity}` : ''}, ${price(p)}${p.stock === 0 ? ', out of stock' : p.stock <= 2 ? `, only ${p.stock} left` : ''}`;

  // ── parse: the set phrases ────────────────────────────────────────────────
  function parse(text) {
    const t = clean(text).replace(/^(hey|hi|hello|ok|okay|please|can you|could you|would you|i'd like to|i would like to|i want to|i need to)\s+/g, '').replace(/\s+please$/, '');
    let m;
    if (!t) return null;
    if (/^(yes|yeah|yep|sure|ok|okay|do it|go ahead|please do)$/.test(t)) return { type: 'yes' };
    if (/^(no|nope|cancel|never mind|nevermind|don't|do not)$/.test(t)) return { type: 'no' };
    if (/^(help|what can you do|what can i (say|ask)|how does this work)/.test(t)) return { type: 'help' };
    if (/^(stop|quiet|be quiet|hush|stop (talking|speaking|reading))$/.test(t)) return { type: 'stop' };
    if (/^undo( that| it)?$/.test(t)) return { type: 'undo' };
    if (/^(what('s| is) in my cart|show (me )?(my |the )?cart|(my |the )?cart|what do i have|what have i got|how much is (my |the )?(cart|total|order)|(cart|order) total|what('s| is) my total)$/.test(t)) return { type: 'cart' };
    if (/^(empty|clear) (my |the )?cart$/.test(t)) return { type: 'clear' };
    if (/^(check ?out|place (my |the )?order|order (it|this|everything)|pay( now)?|buy (it|this|everything|the cart))$/.test(t)) return { type: 'checkout' };
    if (/^(what|which) (meals|recipes|dinners|lunches)( can (you|i) (make|cook|do|plan))?|list (the )?(meals|recipes)|(show|tell) me (the )?(meals|recipes)/.test(t)) return { type: 'meals' };
    // Profile: how the assistant speaks and shows itself.
    if (/^(read|speak|say) (the |your )?(replies|answers|responses|them)( aloud| out loud)?( on)?$|^(voice|speech|speaking|read aloud|reading aloud) on$|^turn (on|up) (the )?(voice|speech|sound)$|^talk to me$/.test(t)) return { type: 'profile', needs: [{ dimension: 'readAloud', value: true }] };
    if (/^(stop|don't|do not) (reading|speaking|talking)( aloud| out loud)?$|^(voice|speech|speaking|read aloud|reading aloud) off$|^turn off (the )?(voice|speech|sound)$|^(mute|silence)$/.test(t)) return { type: 'profile', needs: [{ dimension: 'readAloud', value: false }] };
    if ((m = /^(speak|talk|read) (slower|more slowly|faster|quicker|more quickly)$|^(slower|faster)$/.exec(t))) return { type: 'profile', relative: { dimension: 'readAloudRate', factor: /slow/.test(t) ? 1 / 1.25 : 1.25 } };
    if ((m = /^(bigger|larger|smaller) (text|font|letters|print)$|^make (the |everything )?(text |font )?(bigger|larger|smaller)$|^(zoom|text) (in|out|up|down)$/.exec(t))) return { type: 'profile', relative: { dimension: 'textSize', factor: /bigger|larger|in|up/.test(t) ? 1.25 : 1 / 1.25 } };
    if (/^(normal|regular|default) (text|size|speed|voice)$|^reset (the )?(text|voice|settings)$/.test(t)) return { type: 'profile', reset: true };
    if (/^(i am|i'm|im) (blind|visually impaired)$|^i (can't|cannot|can not) see( well| the screen| much)?$|^i have (low vision|a vision impairment|trouble seeing)$/.test(t)) return { type: 'profile', supportAreas: ['vision'], needs: [{ dimension: 'readAloud', value: true }], say: 'I will read every reply aloud. Say stop at any time, or speak slower.' };
    // Meals: check or shop.
    const picked = mealsIn(t);
    if (picked.length) {
      const days = (m = /(\d+|two|three|four|five|six|seven) days?/.exec(t)) ? (NUMBERS[m[1]] || Number(m[1])) : null;
      const add = /^(shop|buy|get|add|put|order|fill|plan|purchase|grab|pick up)\b|\b(to|in|into) (my |the )?cart\b|\b(add|buy|get|shop) (them|those|everything|all|it|the ingredients)\b/.test(t);
      return { type: 'meal', meals: picked.map((r) => r.name), days, add };
    }
    if (/^(what|which) (do i need|ingredients|is needed|goes in|is in)|^(ingredients|shopping list) for|^(can i|could i) (make|cook)|^(do you have|have you got) (everything|all|what i need|the ingredients)|^(shop|buy|get|plan|order) (for )?(dinner|lunch|meals|a meal|three days|3 days)/.test(t)) return { type: 'meal', meals: [], days: null, add: false };
    // Substitutes.
    if ((m = /^(?:is there |do you have |got )?(?:a |an |any )?(substitute|alternative|replacement|something else|something similar)(?: for| to| instead of)? (.+)$|^what can i use instead of (.+)$|^instead of (.+?)(?: what)?$/.exec(t))) return { type: 'substitute', query: m[2] || m[3] || m[4] };
    // Cart edits.
    if ((m = /^(?:remove|delete|take out|drop|take off|get rid of) (?:the |my |a |an |some |all )?(.+?)(?: from (?:my |the )?cart)?$|^take (?:the |my )?(.+?) out(?: of (?:my |the )?cart)?$/.exec(t))) return { type: 'remove', query: m[1] || m[2] };
    if ((m = /^(?:add|put|get|buy|grab|i need|i want|i'd like|i would like|give me|throw in|pick up)(?: me)? (?:(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten) )?(?:more |another |some |a few |the |an? )?(.+?)(?: (?:to|in|into) (?:my |the )?cart)?$/.exec(t))) {
      const q = m[2].replace(/^(pack|packs|bag|bags|box|boxes|bottle|bottles|can|cans|jar|jars|pound|pounds|lb|lbs|of) /, '');
      return { type: 'add', items: [{ query: q, qty: m[1] ? (NUMBERS[m[1]] || Number(m[1]) || 1) : 1 }] };
    }
    // Price and search.
    if ((m = /^(?:how much (?:is|are|does|do|for)|what(?:'s| is| does) the price (?:of|for)|price (?:of|for|check)|what (?:does|do)) (?:the |a |an |some )?(.+?)(?: cost)?$/.exec(t))) return { type: 'find', query: m[1], price: true };
    if ((m = /^(?:do you (?:have|sell|carry|stock)|have you got|is there|are there|got|got any|any|find|search(?: for)?|look for|look up|show(?: me)?|where (?:is|are)(?: the)?|i'm looking for|looking for)(?: any| some| the| a| an)? (.+?)(?: in stock| available| here| today)?\??$/.exec(t))) return { type: 'find', query: m[1] };
    return null;
  }

  // ── execute: one intent → one reply ───────────────────────────────────────
  async function execute(intent) {
    switch (intent.type) {
      case 'help': return { say: HELP };
      case 'stop': speech?.stop?.(); return { say: 'Okay.', speak: false };
      case 'yes': {
        if (!pending) return { say: 'Nothing is waiting for a yes. ' + HELP.split('. ').slice(0, 2).join('. ') + '.' };
        const p = pending; pending = null;
        return execute(p);
      }
      case 'no': {
        if (!pending) return { say: 'Okay.' };
        pending = null;
        return { say: 'Okay, I will not.' };
      }
      case 'cart': return cartReply();
      case 'meals': {
        const dinners = meals().filter((r) => /dinner/.test(r.meal)).map((r) => r.name), lunches = meals().filter((r) => !/dinner/.test(r.meal)).map((r) => r.name);
        return { say: `I know ${plural(meals().length, 'meal')}. Dinners: ${list(dinners)}. Lunches: ${list(lunches)}. Ask what you need for one, or say shop for it.` };
      }
      case 'find': return findReply(intent);
      case 'add': return addReply(intent);
      case 'remove': return removeReply(intent);
      case 'substitute': return substituteReply(intent);
      case 'meal': return mealReply(intent);
      case 'clear': {
        if (!cartLines().length) return { say: 'Your cart is already empty.' };
        if (!intent.confirmed) { pending = { ...intent, confirmed: true }; return { say: `Empty the cart, ${plural(cartLines().length, 'item')}? Say yes or no.` }; }
        remember(); store.clear();
        return { say: 'Your cart is empty.' };
      }
      case 'checkout': {
        const lines = cartLines();
        if (!lines.length) return { say: 'Your cart is empty. Add something first.' };
        if (!intent.confirmed) { pending = { ...intent, confirmed: true }; return { say: `Place the order: ${plural(lines.reduce((s, l) => s + l.qty, 0), 'item')}, ${money(store.total())}, ${store.slot()}? It is simulated, nothing is charged. Say yes or no.` }; }
        const r = store.checkout();
        return { say: `Order placed, ${plural(r.items, 'item')} for ${money(r.total)}. This is a simulation; nothing was really ordered.` };
      }
      case 'undo': {
        if (!history.length) return { say: 'Nothing to undo.' };
        store.restore(history.pop());
        return { say: 'Undone. ' + cartSummary() };
      }
      case 'profile': return profileReply(intent);
      case 'answer': return { say: intent.say };
      case 'none': default: return { say: intent.say || `I did not follow that. ${HELP}` };
    }
  }

  function cartSummary() {
    const lines = cartLines();
    if (!lines.length) return 'Your cart is empty.';
    return `${plural(lines.reduce((s, l) => s + l.qty, 0), 'item')}, ${money(store.total())} with delivery.`;
  }
  function cartReply() {
    const lines = cartLines();
    if (!lines.length) return { say: 'Your cart is empty. Ask me to find something, or say shop for a meal.' };
    const items = lines.map(({ p, qty }) => `${qty > 1 ? qty + ' ' : ''}${p.name}, ${money(p.price * qty)}`);
    return { say: `In your cart: ${list(items)}. Subtotal ${money(store.subtotal())}, ${money(store.total())} with delivery.`, products: lines.map((l) => l.p) };
  }

  function findReply({ query, price: askPrice }) {
    const found = find(query);
    if (!found.length) {
      const close = find(query, { min: 1 }).slice(0, 3);
      return { say: close.length ? `Nothing called ${query}. Closest: ${list(close.map((p) => p.name))}.` : `I could not find ${query} in the store.`, products: close };
    }
    store.show?.(query);
    const top = found.slice(0, 5), inStock = found.filter((p) => p.stock > 0).length;
    if (askPrice && found.length === 1) return { say: describe(top[0]) + '.', products: top };
    if (askPrice) return { say: `${list(top.map(describe))}.${found.length > 5 ? ` And ${found.length - 5} more.` : ''}`, products: top };
    const stockNote = inStock === found.length ? '' : inStock === 0 ? ' All out of stock.' : ` ${found.length - inStock} out of stock.`;
    return { say: `${plural(found.length, 'product')} for ${query}: ${list(top.map((p) => `${p.name}, ${money(p.price)}`))}.${found.length > 5 ? ` And ${found.length - 5} more.` : ''}${stockNote} Say add, and the name, to add one.`, products: top };
  }

  // The product to add for a phrase: the best in-stock match. Ties go to what is
  // already in the cart (reuse), then to the cheaper one.
  function pick(query) {
    const found = find(query);
    if (!found.length) return { none: true };
    const inStock = found.filter((p) => p.stock > 0);
    if (!inStock.length) return { out: found[0] };
    const best = inStock[0];
    const top = inStock.filter((p) => score(p, query) >= score(best, query) - 0.5);
    return { p: top.find((p) => inCart(p.id)) || top.sort((a, b) => a.price - b.price)[0] };
  }
  function addReply({ items, confirmed }) {
    remember();
    const added = [], outs = [], missing = [], limited = [];
    for (const it of items) {
      const r = pick(it.query);
      if (r.none) { missing.push(it.query); continue; }
      if (r.out) { outs.push(r.out); continue; }
      const want = Math.max(1, Math.min(10, Number(it.qty) || 1));
      const before = inCart(r.p.id), now = store.add(r.p.id, want), got = now - before;
      if (got < want) limited.push(`${r.p.name} (only ${now} available)`);
      added.push(`${got > 1 ? got + ' ' : ''}${r.p.name}${before ? `, now ${now} in the cart` : ''}`);
    }
    const parts = [];
    if (added.length) parts.push(`Added ${list(added)}. ${cartSummary()}`);
    if (limited.length) parts.push(`Limited: ${list(limited)}.`);
    if (missing.length) parts.push(`I could not find ${list(missing)}.`);
    if (outs.length) {
      const o = outs[0], s = store.substituteFor(o.id);
      if (s) { pending = { type: 'add', items: [{ query: s.name, qty: 1 }], confirmed: true }; parts.push(`${o.name} is out of stock. The closest substitute is ${s.name}, ${money(s.price)}. Add it? Say yes or no.`); }
      else parts.push(`${o.name} is out of stock and I have no substitute.`);
    }
    if (!added.length) history.pop();
    const shown = [...outs, ...added.map((n) => store.products.find((p) => n.includes(p.name)))].filter(Boolean);
    return { say: parts.join(' '), products: shown };
  }
  function removeReply({ query }) {
    const lines = cartLines();
    if (!lines.length) return { say: 'Your cart is empty.' };
    const scored = lines.map((l) => ({ l, s: score(l.p, query) })).filter((x) => x.s >= 1).sort((a, b) => b.s - a.s);
    if (!scored.length) return { say: `There is no ${query} in your cart. ${cartSummary()}` };
    remember();
    const { p } = scored[0].l;
    store.remove(p.id);
    return { say: `Removed ${p.name}. ${cartSummary()}` };
  }
  function substituteReply({ query }) {
    const found = find(query);
    if (!found.length) return { say: `I could not find ${query}.` };
    const p = found[0], s = store.substituteFor(p.id);
    if (!s) return { say: `I have no substitute for ${p.name}.` };
    pending = { type: 'add', items: [{ query: s.name, qty: 1 }], confirmed: true };
    return { say: `Instead of ${p.name}${p.stock === 0 ? ', which is out of stock' : ''}, the closest is ${s.name}, ${money(s.price)}${s.category !== p.category ? `, in ${s.category}` : ''}. Add it? Say yes or no.`, products: [p, s] };
  }

  // Meals: what each needs, what is shared, what is out of stock; and, when
  // asked, one product per ingredient into the cart, reusing what is there.
  function mealReply({ meals: names, days, add }) {
    const chosen = names.map((n) => meals().find((r) => clean(r.name) === clean(n))).filter(Boolean);
    if (!chosen.length) return { say: `Which meal? ${list(meals().slice(0, 6).map((r) => r.name))}, and more. Say what meals can you make for the whole list.` };
    const need = new Map(); // ingredient → { words, meals: [] }
    for (const r of chosen) for (const [ing, ws] of Object.entries(r.ingredients)) {
      const e = need.get(ing) || { words: ws, meals: [] };
      e.meals.push(r.name); e.words = [...new Set([...e.words, ...ws])]; need.set(ing, e);
    }
    const out = [], have = [], toAdd = [], shown = [];
    for (const [ing, e] of need) {
      const options = ingredientProducts(e.words);
      const inStock = options.filter((p) => p.stock > 0);
      if (!inStock.length) { out.push({ ing, p: options[0] }); continue; }
      const already = inStock.find((p) => inCart(p.id));
      if (already) { have.push(ing); continue; }
      toAdd.push({ ing, p: inStock.sort((a, b) => a.price - b.price)[0] });
    }
    const shared = [...need].filter(([, e]) => e.meals.length > 1).map(([ing]) => ing);
    const head = `${list(chosen.map((r) => r.name))}${days ? ` for ${days} days` : ''}: ${plural(need.size, 'ingredient')}${shared.length ? `, ${plural(shared.length, 'shared one')} (${list(shared)})` : ''}.`;
    const parts = [head];
    if (!add) {
      parts.push(`You need ${list([...need.keys()])}.`);
      if (have.length) parts.push(`Already in your cart: ${list(have)}.`);
      if (out.length) parts.push(`Out of stock: ${list(out.map((o) => o.ing))}.`);
      else parts.push('Everything is in stock.');
      parts.push('Say shop for it to add everything.');
      shown.push(...toAdd.map((x) => x.p));
    } else {
      remember();
      for (const x of toAdd) { store.add(x.p.id, 1); shown.push(x.p); }
      if (toAdd.length) parts.push(`Added ${plural(toAdd.length, 'product')}: ${list(toAdd.map((x) => x.p.name))}.`);
      if (have.length) parts.push(`Already had ${list(have)}.`);
      if (out.length) {
        const o = out[0], s = o.p && store.substituteFor(o.p.id);
        parts.push(`Out of stock: ${list(out.map((x) => x.ing))}.`);
        if (s) { pending = { type: 'add', items: [{ query: s.name, qty: 1 }], confirmed: true }; parts.push(`For ${o.ing} the closest substitute is ${s.name}, ${money(s.price)}. Add it? Say yes or no.`); shown.push(s); }
      }
      parts.push(cartSummary());
    }
    return { say: parts.join(' '), products: shown.slice(0, 12) };
  }

  async function profileReply(intent) {
    if (!profile) return { say: 'This page has no profile to change.' };
    const current = await profile.get();
    const get = (d) => current.needs.find((n) => n.dimension === d)?.value;
    const changes = [];
    if (intent.reset) { changes.push({ dimension: 'textSize', value: null }, { dimension: 'readAloudRate', value: null }); }
    if (intent.relative) {
      const { dimension, factor } = intent.relative;
      const lo = dimension === 'textSize' ? 0.8 : 0.5, hi = 2.0;
      const v = Math.min(hi, Math.max(lo, Math.round(((Number(get(dimension)) || 1) * factor) * 20) / 20));
      changes.push({ dimension, value: v });
    }
    for (const n of intent.needs || []) changes.push(n);
    await profile.set({ needs: changes, supportAreas: intent.supportAreas });
    if (intent.say) return { say: intent.say };
    const said = changes.map((c) => c.dimension === 'readAloud' ? (c.value ? 'I will read replies aloud.' : 'I will stop reading aloud.')
      : c.dimension === 'readAloudRate' ? (c.value == null ? 'Normal speed.' : `Speaking at ${c.value} times normal speed.`)
      : c.dimension === 'textSize' ? (c.value == null ? 'Normal text size.' : `Text at ${Math.round(c.value * 100)} percent.`) : 'Done.');
    return { say: said.join(' '), speak: !changes.some((c) => c.dimension === 'readAloud' && c.value === false) };
  }

  async function handle(text) {
    const t = String(text || '').trim();
    if (!t) return null;
    let intent = parse(t);
    // A long, wordy "find" or "add" ("anything with no nuts I can snack on") is
    // a question for the model, when there is one; the set phrase is the fallback.
    const wordy = intent && (intent.type === 'find' || intent.type === 'add') && words(intent.query || intent.items[0].query).length >= 4;
    if ((!intent || wordy) && model?.available?.()) {
      try { intent = (await model.resolve(t, context())) || intent; } catch (e) { if (!intent) return { say: `The model did not answer (${e.message}). ${HELP}` }; }
    }
    if (!intent) intent = { type: 'none', say: `I did not follow "${t}". ${HELP}` };
    if (intent.type !== 'yes' && intent.type !== 'no') pending = null;
    return execute(intent);
  }

  // What the model sees: the shelves, the meals and the cart, as data.
  function context() {
    return {
      products: store.products.map((p) => `${p.id}|${p.name}|${p.brand || ''}|${p.size || p.quantity || ''}|${p.price}|${p.stock === 0 ? 'out' : 'in'}|${p.category}|${(p.allergens || []).join(' ') || (p.source === 'counter' ? 'none' : 'not listed')}`),
      meals: meals().map((r) => `${r.name} (${r.meal}): ${Object.keys(r.ingredients).join(', ')}`),
      cart: cartLines().map(({ p, qty }) => `${qty} x ${p.name}`),
    };
  }

  return { handle, parse, execute, context, get pending() { return pending; } };
}
