// Greenbasket: a simulated grocery store. Real products (Open Food Facts),
// simulated prices and stock, cart kept in this browser, nothing ordered.
const $ = (id) => document.getElementById(id);
const money = (n) => '$' + n.toFixed(2);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const say = (msg) => { $('status').textContent = msg; };

const { products } = await (await fetch('/api/products')).json();
const byId = new Map(products.map((p) => [p.id, p]));
let cart = {};
try { cart = JSON.parse(localStorage.getItem('greenbasket-cart') || '{}'); } catch {}
const save = () => { try { localStorage.setItem('greenbasket-cart', JSON.stringify(cart)); } catch {} };

for (const c of [...new Set(products.map((p) => p.category))]) $('cat').append(new Option(c, c));

// A substitute the way a store picks one: something in stock whose name shares a word
// ("Roma tomatoes" -> "Diced tomatoes"), from the same aisle if it can; failing that,
// whatever in the aisle costs about the same. It is a naive rule on purpose.
const FILLER = new Set(['and', 'with', 'the', 'fresh', 'organic', 'original', 'about', 'style', 'free', 'low', 'whole', 'natural', 'classic']);
const nameWords = (p) => new Set(p.name.toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/)
  .map((w) => (w.endsWith('oes') ? w.slice(0, -2) : w.replace(/s$/, ''))).filter((w) => w.length > 2 && !FILLER.has(w)));
function substituteFor(p) {
  const mine = nameWords(p);
  const closest = (list) => list.sort((a, b) => Math.abs(a.price - p.price) - Math.abs(b.price - p.price))[0] || null;
  const inStock = products.filter((o) => o.id !== p.id && o.stock > 0);
  const alike = inStock.filter((o) => [...nameWords(o)].some((w) => mine.has(w)));
  return closest(alike.filter((o) => o.category === p.category)) || closest(alike) || closest(inStock.filter((o) => o.category === p.category));
}

function stockLine(p) {
  if (p.stock === 0) return '<p class="stock out">Out of stock</p>';
  if (p.stock <= 2) return `<p class="stock low">Only ${p.stock} left</p>`;
  return '<p class="stock">In stock</p>';
}

function card(p) {
  const n = p.per100g;
  const facts = [n.kcal != null && `${Math.round(n.kcal)} kcal`, n.sugars != null && `sugars ${n.sugars} g`, n.salt != null && `salt ${n.salt} g`, n.protein != null && `protein ${n.protein} g`].filter(Boolean).join(', ');
  return `<li class="card" data-id="${esc(p.id)}">
    <img src="${esc(p.image)}" alt="" loading="lazy">
    <h3>${esc(p.name)}</h3>
    <p class="brand">${esc(p.brand)}${p.brand && (p.size || p.quantity) ? ' · ' : ''}<span class="qty">${esc(p.size || p.quantity)}</span></p>
    <p class="price">${money(p.price)} ${p.onSale ? '<span class="sale">Sale</span>' : ''}</p>
    ${p.unitPrice ? `<p class="unit">${money(p.unitPrice.amount)} per ${esc(p.unitPrice.per)}</p>` : ''}
    ${stockLine(p)}
    <details><summary>Ingredients and allergens</summary>
      <p><strong>Allergens:</strong> ${p.allergens.length ? esc(p.allergens.join(', ')) : 'none listed'}</p>
      ${p.traces.length ? `<p><strong>May contain:</strong> ${esc(p.traces.join(', '))}</p>` : ''}
      <p><strong>Ingredients:</strong> ${esc(p.ingredients) || 'not listed'}</p>
      ${facts ? `<p><strong>Per 100 g:</strong> ${esc(facts)}</p>` : ''}
      ${p.nutriScore ? `<p><strong>Nutri-Score:</strong> ${p.nutriScore}</p>` : ''}
      ${p.labels.length ? `<p><strong>Labels:</strong> ${esc(p.labels.join(', '))}</p>` : ''}
      ${p.source === 'counter' ? '<p>Sold from the fresh counter. Sizes are approximate.</p>' : ''}
      ${p.photoCredit ? `<p>Photo: <a href="${esc(p.photoCredit.page)}">${esc(p.photoCredit.by)}, ${esc(p.photoCredit.license)}</a>, Wikimedia Commons. It shows the kind of food, not this exact item.</p>` : ''}
    </details>
    ${p.stock > 0 ? `<button type="button" data-add="${esc(p.id)}">Add to cart<span hidden>: ${esc(p.name)}</span></button>`
      : `<button type="button" class="quiet" data-sub="${esc(p.id)}">Show a substitute</button><p class="sub" hidden></p>`}
  </li>`;
}

function renderProducts() {
  const q = $('q').value.trim().toLowerCase(), cat = $('cat').value, only = $('instock').checked;
  const list = products.filter((p) => (!cat || p.category === cat) && (!only || p.stock > 0)
    && (!q || `${p.name} ${p.brand} ${p.category} ${p.ingredients}`.toLowerCase().includes(q)));
  $('products').innerHTML = list.map(card).join('');
  say(`${list.length} ${list.length === 1 ? 'product' : 'products'}`);
}

function renderCart() {
  const lines = Object.entries(cart).map(([id, qty]) => ({ p: byId.get(id), qty })).filter((l) => l.p);
  const count = lines.reduce((s, l) => s + l.qty, 0);
  const subtotal = lines.reduce((s, l) => s + l.qty * l.p.price, 0);
  const fee = lines.length ? Number(/\$([\d.]+)/.exec($('slot').value)[1]) : 0;
  $('cart-count').textContent = count;
  $('cart-lines').innerHTML = lines.length ? lines.map(({ p, qty }) => `<li>
      <span class="name">${esc(p.name)}</span>
      <button type="button" data-dec="${esc(p.id)}" aria-label="One fewer ${esc(p.name)}">−</button>
      <span aria-label="Quantity">${qty}</span>
      <button type="button" data-inc="${esc(p.id)}" aria-label="One more ${esc(p.name)}" ${qty >= p.stock ? 'disabled' : ''}>+</button>
      <span>${money(qty * p.price)}</span>
      <button type="button" class="quiet" data-del="${esc(p.id)}" aria-label="Remove ${esc(p.name)}">Remove</button>
    </li>`).join('') : '<li>Your cart is empty.</li>';
  $('totals').innerHTML = `<dt>Subtotal</dt><dd>${money(subtotal)}</dd><dt>Delivery</dt><dd>${money(fee)}</dd><dt><strong>Total</strong></dt><dd><strong>${money(subtotal + fee)}</strong></dd>`;
  $('checkout').disabled = !lines.length;
  save();
}

function change(id, delta) {
  const p = byId.get(id);
  const next = Math.min(p.stock, (cart[id] || 0) + delta);
  if (next <= 0) delete cart[id]; else cart[id] = next;
  renderCart();
  say(delta > 0 ? `Added ${p.name}. ${cart[id]} in cart.` : `${p.name}: ${cart[id] || 0} in cart.`);
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  const d = b.dataset;
  if (d.add) change(d.add, 1);
  else if (d.inc) change(d.inc, 1);
  else if (d.dec) change(d.dec, -1);
  else if (d.del) { delete cart[d.del]; renderCart(); say(`Removed ${byId.get(d.del).name}.`); }
  else if (d.sub) {
    const s = substituteFor(byId.get(d.sub)), out = b.nextElementSibling;
    out.hidden = false;
    const where = s && s.category !== byId.get(d.sub).category ? `, in ${esc(s.category)}` : '';
    out.innerHTML = s ? `Closest match: <strong>${esc(s.name)}</strong>${where}, ${money(s.price)}. <button type="button" data-add="${esc(s.id)}">Add it</button>` : 'No substitute in this aisle.';
  }
});
$('cart-button').addEventListener('click', () => {
  const open = $('cart').hidden; $('cart').hidden = !open; $('cart-button').setAttribute('aria-expanded', String(open));
});
$('search-form').addEventListener('submit', (e) => e.preventDefault());
for (const id of ['q', 'cat', 'instock']) $(id).addEventListener('input', renderProducts);
$('slot').addEventListener('change', renderCart);
$('checkout').addEventListener('click', () => {
  const total = $('totals').querySelector('dd:last-child').textContent;
  const n = $('cart-count').textContent;
  $('receipt').innerHTML = `<h3>Order placed (simulated)</h3><p>${n} items, ${esc(total)}, ${esc($('slot').value.replace(/ \(.*/, ''))}. Nothing was really ordered or charged.</p>`;
  cart = {}; renderCart(); $('receipt').focus(); say('Order placed. This is a simulation.');
});

// A small hook for adapters and tests: read-only view of the store's state.
window.greenbasket = { products, cart: () => ({ ...cart }), substituteFor: (id) => substituteFor(byId.get(id)) };

renderProducts(); renderCart();
