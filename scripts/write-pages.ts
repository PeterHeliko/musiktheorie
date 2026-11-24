/**
 * Eine HTML-Datei je Seite — nach `vite build`.
 *
 * Vite baut genau eine `index.html`. GitHub Pages kennt aber keine
 * Umleitung «alles auf index.html»: wer /ueben/intervalle-hoeren/ öffnet,
 * bekommt nur etwas, wenn dort eine Datei liegt. Dieses Skript legt sie an —
 * jeweils eine Kopie der gebauten index.html mit eigenem Titel, eigener
 * Beschreibung und Vorschau-Angaben (Open Graph). Chats wie WhatsApp oder
 * Signal führen kein JavaScript aus; ohne diese Dateien sähe jeder geteilte
 * Link in der Vorschau gleich aus.
 *
 * Dazu kommt 404.html, die GitHub Pages für jede unbekannte Adresse ausliefert.
 *
 * Aufruf: läuft als Teil von `npm run build`.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALIASES, SITE_NAME, allPages, documentTitle, metaFor, type PageMeta } from '../src/pages';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
/** Muss zu vite.config.ts passen. */
const BASE = process.env.BASE_PATH ?? '/musiktheorie/';
const ORIGIN = process.env.SITE_ORIGIN ?? 'https://peterheliko.github.io';

const template = readFileSync(join(DIST, 'index.html'), 'utf8');

// Lieber laut scheitern als stillschweigend Seiten ohne Titel bauen.
if ((template.match(/<title>/g) ?? []).length !== 1) {
  throw new Error('dist/index.html: erwartet genau ein <title>.');
}
if (!/<meta name="description"[^>]*>/.test(template)) {
  throw new Error('dist/index.html: <meta name="description"> fehlt.');
}

function escape(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function render(meta: PageMeta, { indexable }: { indexable: boolean }): string {
  const url = ORIGIN + BASE + meta.path;
  const head = [
    `<meta name="description" content="${escape(meta.description)}" />`,
    indexable
      ? `<link rel="canonical" href="${escape(url)}" />`
      : '<meta name="robots" content="noindex" />',
    '<meta property="og:type" content="website" />',
    `<meta property="og:site_name" content="${escape(SITE_NAME)}" />`,
    '<meta property="og:locale" content="de_CH" />',
    `<meta property="og:title" content="${escape(meta.title)}" />`,
    `<meta property="og:description" content="${escape(meta.description)}" />`,
    ...(indexable ? [`<meta property="og:url" content="${escape(url)}" />`] : []),
  ];

  return template
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escape(documentTitle(meta))}</title>`)
    .replace(/\s*<meta name="description"[^>]*>/, '')
    .replace('</head>', `${head.map((line) => `    ${line}`).join('\n')}\n  </head>`);
}

function write(path: string, html: string): void {
  const file = join(DIST, path, 'index.html');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
}

const pages = allPages();
for (const meta of pages) write(meta.path, render(meta, { indexable: true }));
// Frühere Adressen: Titel, Vorschau und «canonical» der Seite, die jetzt dort
// steht — Suchmaschinen führen dann nur noch diese.
for (const alias of ALIASES) write(alias.path, render(metaFor(alias.route), { indexable: true }));
writeFileSync(join(DIST, '404.html'), render(metaFor({ page: 'nicht-gefunden' }), { indexable: false }));

console.log(
  `${pages.length} Seiten, ${ALIASES.length} frühere Adresse(n) und 404.html geschrieben (Basis ${BASE}).`,
);
