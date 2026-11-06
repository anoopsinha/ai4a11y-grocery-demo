// Zero-dependency static server for the simulated store. Nothing is ordered
// anywhere: the cart lives in the browser and "checkout" only shows a receipt.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8' };
const PORT = Number(process.env.PORT) || 5175;

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x').pathname;
  const file = url === '/api/products' ? path.join(root, 'data/products.json')
    : path.join(root, 'public', path.normalize(url === '/' ? '/index.html' : url).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' }).end(body);
  } catch { res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found'); }
}).listen(PORT, '127.0.0.1', () => console.log(`Simulated grocery store: http://127.0.0.1:${PORT}/`));
