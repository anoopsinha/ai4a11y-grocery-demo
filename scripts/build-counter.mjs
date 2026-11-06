// Turns scripts/counter-source.txt into data/counter.json, and finds each item
// an openly licensed photo on Wikimedia Commons.
//
//   node scripts/build-counter.mjs            keep photos already chosen
//   node scripts/build-counter.mjs --sheet F  also write a page of candidates to F, to choose by eye
//
// A photo is chosen in data/counter-photos.json: { "<item id>": <which candidate, from 0> }
// or { "<item id>": "File:Exact name on Commons.jpg" }. Without an entry, the first candidate is used.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';

const at = (p) => new URL(p, import.meta.url);
const UA = { 'User-Agent': 'ai4a11y-grocery-demo/0.2 (https://github.com/anoopsinha/ai4a11y-grocery-demo; research prototype)' };
const CACHE = at('../.cache/'); mkdirSync(CACHE, { recursive: true });
const picksFile = at('../data/counter-photos.json');
const picks = existsSync(picksFile) ? JSON.parse(readFileSync(picksFile, 'utf8')) : {};
const FREE = /^(cc0|cc by|cc-by|public domain|pd\b)/i; // licences that allow reuse with credit
const text = (html) => String(html || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim().slice(0, 80);

async function commons(params, key) {
  const cache = new URL(`commons-${encodeURIComponent(key)}.json`, CACHE);
  if (existsSync(cache)) return JSON.parse(readFileSync(cache, 'utf8'));
  const url = 'https://commons.wikimedia.org/w/api.php?' + new URLSearchParams({
    action: 'query', format: 'json', prop: 'imageinfo', iiprop: 'url|extmetadata|size|mime', iiurlwidth: '330', iiextmetadatafilter: 'Artist|LicenseShortName', ...params,
  });
  let body = null;
  for (let attempt = 1; attempt <= 5 && !body; attempt++) { // Commons asks anonymous readers to go slowly
    try { body = await (await fetch(url, { headers: UA, signal: AbortSignal.timeout(30000) })).json(); }
    catch { await new Promise((d) => setTimeout(d, attempt * 15000)); }
  }
  if (!body) throw new Error(`Wikimedia Commons did not answer for ${key}`);
  const pages = Object.values(body.query?.pages || {});
  const found = pages.sort((a, b) => (a.index || 0) - (b.index || 0)).map((p) => {
    const i = p.imageinfo?.[0]; if (!i) return null;
    return { file: p.title, url: i.thumburl.split('?')[0], page: i.descriptionurl, by: text(i.extmetadata?.Artist?.value) || 'Unknown', license: text(i.extmetadata?.LicenseShortName?.value), w: i.width, h: i.height, mime: i.mime };
  }).filter((c) => c && FREE.test(c.license) && /jpeg|png/.test(c.mime) && c.w >= 400 && c.w / c.h < 2.2 && c.h / c.w < 2);
  writeFileSync(cache, JSON.stringify(found)); await new Promise((d) => setTimeout(d, 2500));
  return found;
}

const items = []; let category = '';
for (const line of readFileSync(at('./counter-source.txt'), 'utf8').split('\n')) {
  if (!line.trim() || line.startsWith('#')) continue;
  const head = /^\[(.+)\]$/.exec(line.trim()); if (head) { category = head[1]; continue; }
  const [name, size, amount, unit, price, query, allergens] = line.split('|').map((s) => s.trim());
  const id = 'fresh-' + name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const pick = picks[id];
  const candidates = typeof pick === 'string' ? await commons({ titles: pick }, pick)
    : await commons({ generator: 'search', gsrsearch: `${query} filetype:bitmap`, gsrnamespace: '6', gsrlimit: '12' }, query);
  const photo = candidates[typeof pick === 'number' ? pick : 0] || null;
  if (!photo) console.log(`no photo: ${name}`);
  items.push({ id, name, category, size, amount: Number(amount), unit, price: Number(price), allergens: allergens ? allergens.split(',').map((a) => a.trim()) : [],
    photo: photo && { url: photo.url, by: photo.by, license: photo.license, page: photo.page, file: photo.file }, _candidates: candidates });
}

const sheet = process.argv.indexOf('--sheet');
if (sheet > 0) {
  writeFileSync(process.argv[sheet + 1], `<!doctype html><meta charset=utf-8><style>body{font:11px sans-serif;margin:4px}div.r{display:flex;gap:3px;align-items:flex-start;margin-bottom:3px}b{width:96px;flex:none}figure{margin:0;position:relative}img{width:104px;height:78px;object-fit:cover;display:block}figure.on img{outline:3px solid red}i{position:absolute;left:0;top:0;background:#000;color:#fff;padding:0 3px;font-style:normal}</style>`
    + items.filter((it) => !(it.id in picks)).map((it) => `<div class=r><b>${it.name}</b>${it._candidates.slice(0, 9).map((c, n) => `<figure class="${c.url === it.photo?.url ? 'on' : ''}"><img src="${c.url}"><i>${n}</i></figure>`).join('')}</div>`).join(''));
}
writeFileSync(at('../data/counter.json'), JSON.stringify({ note: 'Built by scripts/build-counter.mjs from scripts/counter-source.txt. Do not edit by hand.', items: items.map(({ _candidates, ...it }) => it) }, null, 1));
console.log(`${items.length} counter items, ${items.filter((i) => i.photo).length} with a photo`);
