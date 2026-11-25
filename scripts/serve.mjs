/**
 * Die gebaute Seite so ausliefern, wie GitHub Pages es tut.
 *
 * `vite preview` ist dafür zu freundlich: es liefert für jede unbekannte
 * Adresse die index.html aus. Damit fiele nie auf, wenn für eine Seite die
 * HTML-Datei fehlt — auf GitHub Pages gäbe es dort eine 404. Dieser Server
 * verhält sich wie Pages:
 *
 *  - nur unter der Basis (/musiktheorie/) gibt es etwas,
 *  - «/pfad/» liefert «/pfad/index.html»,
 *  - «/pfad» ohne Schrägstrich leitet auf «/pfad/» um, wenn es ein Ordner ist,
 *  - alles andere: 404.html mit Status 404.
 *
 * Aufruf: npm run preview   (vorher npm run build)
 */

import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const BASE = process.env.BASE_PATH ?? '/musiktheorie/';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
};

function send(response, status, file) {
  response.writeHead(status, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(response);
}

function notFound(response) {
  const page = join(DIST, '404.html');
  if (existsSync(page)) send(response, 404, page);
  else response.writeHead(404).end('404');
}

export function startServer(port) {
  const server = createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost');
    let path;
    try {
      path = decodeURIComponent(url.pathname);
    } catch {
      return notFound(response);
    }
    if (!path.startsWith(BASE)) return notFound(response);

    const relative = normalize(path.slice(BASE.length));
    if (relative.startsWith('..')) return notFound(response);
    const target = join(DIST, relative);

    if (existsSync(target) && statSync(target).isDirectory()) {
      if (!path.endsWith('/')) {
        response.writeHead(301, { location: `${url.pathname}/${url.search}` }).end();
        return;
      }
      const index = join(target, 'index.html');
      return existsSync(index) ? send(response, 200, index) : notFound(response);
    }
    if (existsSync(target)) return send(response, 200, target);
    return notFound(response);
  });

  return new Promise((done) => server.listen(port, '127.0.0.1', () => done(server)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 4173);
  if (!existsSync(DIST)) {
    console.error('dist/ fehlt — zuerst «npm run build».');
    process.exit(1);
  }
  await startServer(port);
  console.log(`Wie auf GitHub Pages: http://127.0.0.1:${port}${BASE}`);
}
