/**
 * dist/sw.js schreiben: die Vorlage src/service-worker.js mit den Dateien der
 * gebauten Seite.
 *
 * Läuft als Teil von `npm run build`, nach write-pages.ts: die Startseite
 * (dist/index.html) muss schon ihre endgültige Fassung haben.
 *
 * Gespeichert wird alles, was die Seite braucht, ausser den HTML-Dateien der
 * einzelnen Seiten (offline nimmt jede die Startseite, siehe Vorlage),
 * 404.html und sw.js selbst. Die Klaviertöne kommen in einen eigenen
 * Zwischenspeicher. Die Namen beider enthalten eine Prüfsumme über den
 * Inhalt, so ändert sich sw.js mit jeder Veröffentlichung, die etwas ändert.
 */

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
/** Muss zu vite.config.ts passen. */
const BASE = process.env.BASE_PATH ?? '/musiktheorie/';

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? listFiles(path) : [relative(DIST, path).split(sep).join('/')];
  });
}

function checksum(files: string[], extra = ''): string {
  const hash = createHash('sha256').update(extra);
  for (const file of files) hash.update(file).update('\0').update(readFileSync(join(DIST, file)));
  return hash.digest('hex').slice(0, 12);
}

const template = readFileSync(join(ROOT, 'src/service-worker.js'), 'utf8');
const files = listFiles(DIST).sort();

const sampleFiles = files.filter((file) => file.startsWith('samples/'));
const appFiles = files.filter(
  (file) =>
    !file.startsWith('samples/') &&
    file !== 'sw.js' &&
    file !== '404.html' &&
    !(file.endsWith('index.html') && file !== 'index.html'),
);

// Lieber laut scheitern als eine App, die offline nicht startet.
for (const needed of ['index.html', 'manifest.webmanifest']) {
  if (!appFiles.includes(needed)) throw new Error(`dist/${needed} fehlt.`);
}
if (!appFiles.some((file) => file.endsWith('.js'))) throw new Error('dist/assets: kein Code gefunden.');
if (sampleFiles.length === 0) throw new Error('dist/samples: keine Klaviertöne gefunden.');

const prefix = `musiktheorie${BASE}`;
const values: Record<string, unknown> = {
  __PREFIX__: prefix,
  // Die Vorlage gehört zur App: ändert sich, wie gespeichert wird, soll
  // nichts aus dem alten Zwischenspeicher übrig bleiben.
  __APP_CACHE__: `${prefix}app-${checksum(appFiles, template)}`,
  __SAMPLE_CACHE__: `${prefix}samples-${checksum(sampleFiles)}`,
  // Die Startseite unter der Adresse, unter der sie aufgerufen wird.
  __APP_FILES__: appFiles.map((file) => (file === 'index.html' ? '' : file)),
  __SAMPLE_FILES__: sampleFiles,
};

let sw = template;
for (const [placeholder, value] of Object.entries(values)) {
  if (!sw.includes(placeholder)) throw new Error(`src/service-worker.js: ${placeholder} fehlt.`);
  sw = sw.replace(placeholder, () => JSON.stringify(value));
}
writeFileSync(join(DIST, 'sw.js'), sw);

const kilobytes = (list: string[]) =>
  Math.round(list.reduce((sum, file) => sum + statSync(join(DIST, file)).size, 0) / 1024);
console.log(
  `sw.js: ${appFiles.length} Dateien der App (${kilobytes(appFiles)} kB), ` +
    `${sampleFiles.length} Klaviertöne (${kilobytes(sampleFiles)} kB).`,
);
