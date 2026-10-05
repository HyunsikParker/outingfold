import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { selectWithModel } from './model.mjs';
import { checkInput } from './public/core.mjs';

const root = new URL('./public/', import.meta.url);
const files = new Map([['/', ['index.html', 'text/html']], ['/index.html', ['index.html', 'text/html']], ['/app.mjs', ['app.mjs', 'text/javascript']], ['/core.mjs', ['core.mjs', 'text/javascript']], ['/style.css', ['style.css', 'text/css']], ['/example.json', ['example.json', 'application/json']]]);
const CSP = "default-src 'self'; connect-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";

export function createServer({ endpoint = process.env.OUTINGFOLD_OLLAMA || 'http://127.0.0.1:11434', selector = selectWithModel } = {}) {
  let busy = false;
  return http.createServer(async (req, res) => {
    res.setHeader('Content-Security-Policy', CSP);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    const send = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
    const port = req.socket.localPort;
    const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`]);
    if (!hosts.has(req.headers.host)) return send(403, { error: 'This server accepts local requests only.' });
    const allowedOrigin = `http://${req.headers.host}`;
    if (req.headers.origin && req.headers.origin !== allowedOrigin) return send(403, { error: 'Open OutingFold on this local server before sending notes.' });
    const pathname = (req.url || '/').split('?')[0];
    if (pathname === '/api/status' && req.method === 'GET') return send(200, { local: true, busy });
    if (pathname === '/api/select' && req.method === 'POST') {
      if (req.headers.origin !== allowedOrigin) return send(403, { error: 'A same-origin browser request is required.' });
      if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) return send(415, { error: 'Send notes as JSON.' });
      if (busy) return send(409, { error: 'A selection is already running. Wait for it to finish.' });
      busy = true;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 180000);
      req.on('aborted', () => controller.abort());
      res.on('close', () => { if (!res.writableEnded) controller.abort(); });
      let size = 0;
      try {
        const chunks = [];
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 80000) { send(413, { error: 'These notes are too large.' }); req.destroy(); return; }
          chunks.push(chunk);
        }
        let input;
        try { input = checkInput(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (err) { return send(400, { error: err instanceof SyntaxError ? 'The request is not valid JSON.' : err.message }); }
        const result = await selector(input, { endpoint, signal: controller.signal });
        if (!res.destroyed) send(200, result);
      } catch (err) {
        if (!res.destroyed) send(502, { error: err.name === 'AbortError' ? 'Local selection timed out. Try shorter notes, or select excerpts manually.' : 'Local selection failed. Start Ollama and check the installed model, or select excerpts manually.', detail: err.cause?.code || err.message });
      } finally { clearTimeout(timer); busy = false; }
      return;
    }
    if (req.method !== 'GET') return send(405, { error: 'Method not allowed.' });
    const file = files.get(pathname);
    if (!file) return send(404, { error: 'Not found.' });
    try { const body = await readFile(new URL(file[0], root)); res.writeHead(200, { 'Content-Type': `${file[1]}; charset=utf-8` }); res.end(body); }
    catch { send(404, { error: 'The requested file is not available.' }); }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 4318);
  createServer().listen(port, '127.0.0.1', () => console.log(`OutingFold: http://127.0.0.1:${port}`));
}
