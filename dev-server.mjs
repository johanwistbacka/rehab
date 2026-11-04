import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('./dist/', import.meta.url));
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'};
http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(root, '.' + (pathname.endsWith('/') ? pathname + 'index.html' : pathname));
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405).end(); return; }
    const body = await readFile(file);
    res.writeHead(200, {'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control':'no-store'});
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch { res.writeHead(404).end('Not found'); }
}).listen(5173, '127.0.0.1', () => console.log('Rehab: http://localhost:5173 — stoppa med Ctrl+C'));
