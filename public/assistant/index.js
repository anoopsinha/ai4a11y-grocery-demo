// The assistant sidebar: a chat you can type or talk to, that drives the store
// through window.greenbasket and speaks with the AI for Accessibility Toolkit.
//
//   1. The toolkit runs in this browser over a localStorage port. Its profile
//      (needs such as readAloud, readAloudRate, textSize) is the source of
//      truth for how the assistant speaks and shows itself.
//   2. The toolkit's building blocks do the voice: speech.say() for replies
//      (the profile's speaking rate wins); the microphone is listen.js, dictation
//      with interim results so the person can talk over the assistant.
//   3. The brain (brain.js) understands set phrases; a model (model.js) takes
//      what they miss, when one is reachable.
import { createToolkit } from '../vendor/toolkit/index.js';
import { nodeClock, nodeScheduler } from '../vendor/toolkit/platforms/node/ports.js';
import { noopConsent } from '../vendor/toolkit/ports/index.js';
import { renderWebSettings } from '../vendor/toolkit/surfaces/web.js';
import { createBlocks, setPersonal, personalFromProfile } from '../vendor/toolkit/blocks/index.js';
import { localStorageKV } from '../ports/local-storage-kv.js';
import { createBrain, HELP } from './brain.js';
import { createModel } from './model.js';
import { createSpeaker } from './speak.js';
import { createEarcon } from './earcon.js';
import { createListener } from './listen.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const money = (n) => '$' + Number(n).toFixed(2);
const store = window.greenbasket;

// ── 1. The toolkit and the profile ───────────────────────────────────────────
const { datastore, librarian } = createToolkit({ kv: localStorageKV(), clock: nodeClock(), scheduler: nodeScheduler(), consent: noopConsent });
await datastore.runMigrations();

const profile = {
  async get() {
    const m = await librarian.getAbilityModel();
    return { needs: m.needs || [], supportAreas: m.supportAreas || [] };
  },
  // Merge needs (value null removes one); record support areas when given.
  async set({ needs = [], supportAreas }) {
    const current = (await librarian.getAbilityModel()).needs || [];
    const byDim = new Map(current.map((n) => [n.dimension, n]));
    for (const c of needs) {
      if (c.value === null || c.value === undefined) byDim.delete(c.dimension);
      else byDim.set(c.dimension, { dimension: c.dimension, value: c.value, strength: 'preference', source: 'assistant' });
    }
    if (supportAreas?.length) await librarian.setProfileField('supportAreas', supportAreas);
    await librarian.setProfileField('fields.needs', [...byDim.values()]);
    await applyProfile();
  },
};

let web = {}; // the profile rendered as web settings: { fontScale, speechRate, readAloud, ... }
async function applyProfile() {
  const full = await librarian.getProfile();
  web = renderWebSettings(await librarian.getAbilityModel());
  setPersonal(window, personalFromProfile(full));            // the blocks follow the profile (speech rate, text size)
  document.documentElement.style.fontSize = web.fontScale && web.fontScale !== 100 ? `${web.fontScale}%` : '';
  $('speak').checked = !!web.readAloud;
}

// ── 2. Speech: Google's voice when there is a model, else the toolkit's blocks ─
const blocks = createBlocks({ win: window, adapter: 'greenbasket-assistant' });
const s = blocks.session();
let listening = null; // the microphone, while it is on
const earcon = createEarcon();
let speaker;          // made below, once the model exists

function stopSpeaking() { speaker?.stop(); }
function speak(text) {
  stopSpeaking();
  if (!web.readAloud || !text) return;
  // The microphone stays on while the assistant talks, so the person can
  // interrupt; what the mic hears of the reply itself is filtered out below.
  speaker.say(text);
}

// Barge-in. The microphone stays on while the assistant talks. What it hears
// then is partly the assistant's own voice: a word is an echo when it is in
// what is being said. The first words that are not echo stop the voice at
// once (from an interim result), and the final sentence is handled with its
// leading echo words dropped.
let lastSaid = '';
let heardWhileSpeaking = false; // did this sentence begin while the assistant was talking?
const wordsOf = (t) => String(t).toLowerCase().replace(/[^a-z0-9' ]/g, ' ').split(/\s+/).filter((w) => w.length > 1);
// How many words at the start of what was heard are the assistant's own, in
// the order it said them (one dropped or extra word allowed, as recognizers do).
function echoLength(heard, said) {
  let best = 0;
  for (let start = 0; start < said.length; start++) {
    if (said[start] !== heard[0]) continue;
    let i = 0, j = start, slack = 0;
    while (i < heard.length && j < said.length) {
      if (heard[i] === said[j]) { i++; j++; slack = 0; }
      else if (said[j + 1] === heard[i] && slack < 1) { j += 2; i++; slack++; }
      else if (heard[i + 1] === said[j] && slack < 1) { i++; slack++; }
      else break;
    }
    best = Math.max(best, i);
  }
  return best;
}
// The person's own words out of a sentence that began as echo.
function ownWords(heard) {
  const h = wordsOf(heard);
  return h.slice(echoLength(h, wordsOf(lastSaid))).join(' ');
}
const isEcho = (heard) => !ownWords(heard);

function micOn({ quiet = false } = {}) {
  if (listening?.listening) return;
  stopSpeaking(); // pressing Voice while it talks means: my turn
  listening = createListener({
    onInterim: (text) => {
      if (!speaker.speaking) return;
      heardWhileSpeaking = true;
      // Two words of their own and the assistant yields.
      if (wordsOf(ownWords(text)).length >= 2) { stopSpeaking(); status('Go on.'); }
    },
    onFinal: (text) => {
      const own = heardWhileSpeaking || speaker.speaking ? ownWords(text) : text;
      heardWhileSpeaking = false;
      if (!own.trim()) return;
      const t = own.trim().toLowerCase().replace(/[.,!?]/g, '');
      if (/^(stop|stop talking|be quiet|quiet)$/.test(t)) { stopSpeaking(); return; }
      if (/^stop listening$/.test(t)) { micOff(); return; }
      stopSpeaking();
      submit(own);
    },
    onStop: (why) => { listening = null; $('mic').setAttribute('aria-pressed', 'false'); $('mic').textContent = 'Voice'; if (why) status(why); },
  });
  if (!listening.supported) { listening = null; status('This browser has no speech recognition. Chrome and Edge do.'); return; }
  listening.start();
  $('mic').setAttribute('aria-pressed', 'true'); $('mic').textContent = 'Stop listening';
  if (!quiet) status('Listening. Say what you need. Say stop, or talk over me, to interrupt.');
}
function micOff({ quiet = false } = {}) {
  const l = listening;
  listening = null;
  l?.stop();
  $('mic').setAttribute('aria-pressed', 'false'); $('mic').textContent = 'Voice';
  if (!quiet) status('Microphone off.');
}

// ── 3. The brain and the model ───────────────────────────────────────────────
const KEY = 'greenbasket-model-key';
const model = createModel({ endpoint: 'api/model', key: () => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } }, needs: async () => (await profile.get()).needs.map((n) => ({ dimension: n.dimension, value: n.value })) });
// The earcon plays while the model is being asked, and while the first
// piece of a spoken reply is on its way.
const waited = { ...model, resolve: async (...a) => { earcon.start(); try { return await model.resolve(...a); } finally { earcon.stop(); } } };
speaker = createSpeaker({
  session: s,
  synth: (text) => model.speak(text),
  rate: () => web.speechRate || 1,
  onWait: (on) => (on ? earcon.start() : earcon.stop({ done: false })),
  onSpeaking: (on) => { $('stop-speaking').hidden = !on; },
});
const brain = createBrain({ store, profile, model: waited, speech: { stop: stopSpeaking } });

// ── The sidebar ──────────────────────────────────────────────────────────────
function status(text) { $('assistant-status').textContent = text; }
function message(role, text, products = []) {
  const li = document.createElement('li');
  li.className = `msg ${role}`;
  li.innerHTML = `<span class="who">${role === 'user' ? 'You' : 'Assistant'}</span><p>${esc(text)}</p>`
    + (products.length ? `<ul class="chips">${products.slice(0, 8).map((p) => `<li><span>${esc(p.name)}</span> <span class="muted">${money(p.price)}${p.stock === 0 ? ', out of stock' : ''}</span>${p.stock > 0 ? ` <button type="button" data-add="${esc(p.id)}" aria-label="Add ${esc(p.name)} to cart">Add</button>` : ''}</li>`).join('')}</ul>` : '');
  $('chat').append(li);
  li.scrollIntoView({ block: 'end' });
  return li;
}

let busy = false;
async function submit(text) {
  const t = String(text || '').trim();
  if (!t || busy) return;
  busy = true;
  stopSpeaking();
  $('chat-input').value = '';
  message('user', t);
  const thinking = message('bot', '…');
  try {
    const r = await brain.handle(t);
    thinking.remove();
    message('bot', r.say, r.products || []);
    lastSaid = r.say;
    if (r.speak !== false) speak(r.say);
  } catch (e) {
    thinking.remove();
    message('bot', 'Something went wrong: ' + e.message);
  } finally {
    busy = false;
  }
}

function open(on) {
  $('assistant').hidden = !on;
  document.body.classList.toggle('assistant-open', on);
  $('assistant-button').setAttribute('aria-expanded', String(on));
  try { localStorage.setItem('greenbasket-assistant', on ? 'open' : 'closed'); } catch {}
  if (on) $('chat-input').focus();
}

$('assistant-button').addEventListener('click', () => open($('assistant').hidden));
$('assistant-close').addEventListener('click', () => { open(false); $('assistant-button').focus(); });
$('chat-form').addEventListener('submit', (e) => { e.preventDefault(); submit($('chat-input').value); });
$('chat-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit($('chat-input').value); return; }
  if (e.key.length === 1) stopSpeaking(); // typing interrupts the reply
});
$('stop-speaking').addEventListener('click', () => { stopSpeaking(); $('chat-input').focus(); });
$('mic').addEventListener('click', async () => {
  if (listening) { micOff(); return; }
  // Talking to it usually means wanting to hear it: turn replies on, in the profile.
  if (!web.readAloud) await profile.set({ needs: [{ dimension: 'readAloud', value: true }] });
  micOn();
});
$('speak').addEventListener('change', async (e) => {
  await profile.set({ needs: [{ dimension: 'readAloud', value: e.target.checked }] });
  if (!e.target.checked) stopSpeaking();
});
$('model-key-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const k = $('model-key').value.trim();
  try { if (k) localStorage.setItem(KEY, k); else localStorage.removeItem(KEY); } catch {}
  $('model-key').value = '';
  showModel();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (speaker.speaking) stopSpeaking(); else if (listening) micOff(); } });

function showModel() {
  const where = model.where();
  $('model-status').textContent = where === 'server' ? 'Model: on, through this computer’s server. Voice: Google’s, when the server allows it.'
    : where === 'browser' ? 'Model: on, with the key saved in this browser. Voice: Google’s.'
    : 'Model: off. The assistant understands its set phrases, and speaks with this browser’s voice. Add a key to ask anything.';
  $('model-key-form').hidden = where === 'server';
}

// Boot: the profile first, so text size and speech are right before the first word.
await applyProfile();
await model.probe();
showModel();
message('bot', 'Hi. ' + HELP);
lastSaid = HELP;
// Open by default; closed only if the person closed it last time.
let wasOpen = true;
try { wasOpen = localStorage.getItem('greenbasket-assistant') !== 'closed'; } catch {}
if (wasOpen) open(true);
window.greenbasket.assistant = { submit, brain, profile, librarian, model, open, speaker, earcon, isEcho, ownWords };
