// Zero-dependency server for the simulated store. Three jobs:
//   1. Serve the page (public/), the product snapshot and the meal list.
//   2. Serve the toolkit package out of node_modules (/vendor/toolkit/...), so
//      the browser can import it. The toolkit runs in the browser.
//   3. When a GEMINI_API_KEY is in .env, answer POST /api/model: the
//      assistant's one model call, so the key never reaches the browser.
//      Without a key the assistant still works, on its set phrases.
// Nothing is ordered anywhere: the cart lives in the browser and "checkout"
// only shows a receipt.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
try { process.loadEnvFile(path.join(root, '.env')); } catch { /* no .env: rely on the environment */ }
const PORT = Number(process.env.PORT) || 5175;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.md': 'text/markdown; charset=utf-8' };
const FILES = { '/products.json': 'data/products.json', '/api/products': 'data/products.json', '/recipes.json': 'data/recipes.json' };
const MOUNTS = { '/vendor/toolkit/': path.join(root, 'node_modules', '@ai4a11y', 'toolkit'), '/': path.join(root, 'public') };

const json = (res, status, body) => res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }).end(JSON.stringify(body));

// The one model call. The browser sends the prompt it built; the answer is
// the model's text (JSON, which the browser validates before acting on it).
async function model(req, res) {
  if (!GEMINI_API_KEY) return json(res, 503, { error: 'no model key on this server' });
  let body = '';
  for await (const chunk of req) { body += chunk; if (body.length > 200_000) return json(res, 413, { error: 'too long' }); }
  let prompt;
  try { ({ prompt } = JSON.parse(body)); } catch { return json(res, 400, { error: 'bad json' }); }
  if (typeof prompt !== 'string' || !prompt) return json(res, 400, { error: 'prompt required' });
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 25_000);
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0, responseMimeType: 'application/json' } }),
      signal: ac.signal,
    });
    if (!r.ok) {
      let why = ''; try { why = (await r.json()).error?.message || ''; } catch { /* not json */ }
      return json(res, 502, { error: `model ${r.status}${why ? ': ' + why.split(/[.\n]/)[0].slice(0, 100) : ''}` });
    }
    const data = await r.json();
    return json(res, 200, { text: data.candidates?.[0]?.content?.parts?.[0]?.text || '' });
  } catch (e) {
    return json(res, 502, { error: 'the model did not answer: ' + e.message });
  } finally { clearTimeout(t); }
}

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x').pathname;
  if (url === '/api/model') {
    if (req.method === 'GET') return json(res, 200, { available: !!GEMINI_API_KEY, model: GEMINI_API_KEY ? GEMINI_MODEL : null });
    if (req.method === 'POST') return model(req, res);
    return res.writeHead(405).end();
  }
  let file;
  if (FILES[url]) file = path.join(root, FILES[url]);
  else {
    const prefix = Object.keys(MOUNTS).find((p) => url.startsWith(p));
    const base = MOUNTS[prefix];
    const rel = url === '/' ? 'index.html' : url.slice(prefix.length);
    file = path.normalize(path.join(base, rel));
    if (!file.startsWith(base)) { res.writeHead(403).end(); return; }
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' }).end(body);
  } catch { res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found'); }
}).listen(PORT, '127.0.0.1', () => console.log(`Simulated grocery store: http://127.0.0.1:${PORT}/  (model: ${GEMINI_API_KEY ? GEMINI_MODEL : 'off, no GEMINI_API_KEY'})`));
