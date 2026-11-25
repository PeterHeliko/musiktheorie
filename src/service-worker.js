/**
 * Service Worker: die Seite offline nutzbar, auch als installierte App.
 *
 * Vorlage. scripts/write-sw.ts setzt beim Bauen Dateilisten und Namen der
 * Zwischenspeicher ein und schreibt dist/sw.js. Angemeldet wird er nur in der
 * gebauten Seite (src/offline.ts), nie unter `npm run dev`.
 *
 * Zwei Zwischenspeicher, beide unter einem Namen mit Prüfsumme über ihren
 * Inhalt:
 *  - App: Startseite, Code, Stil, Manifest, Symbole. Wird beim Installieren
 *    ganz geladen, nach dem ersten Laden der Seite im Hintergrund. Jede
 *    Veröffentlichung mit Änderungen ergibt eine neue sw.js; der Browser
 *    bemerkt sie beim nächsten Aufruf, lädt die App neu in einen neuen
 *    Zwischenspeicher und räumt den alten weg.
 *  - Klaviertöne: ändern sich selten und behalten darum ihren Speicher über
 *    neue Fassungen der App hinweg. Im Browser-Tab kommt nur hinein, was
 *    gespielt wurde (über 2 MB sollen nicht auf jeder Seite mitkommen,
 *    siehe main.tsx). Die installierte App bittet um alle (src/offline.ts).
 *
 * Abrufen:
 *  - Seiten, Code, Stil: zuerst das Netz, damit eine Veröffentlichung sofort
 *    ankommt. Ohne Netz, oder wenn es nach drei Sekunden noch nicht
 *    geantwortet hat, aus dem Zwischenspeicher. Jede Seite bekommt dann die
 *    Startseite: die HTML-Dateien unterscheiden sich nur in Titel und
 *    Vorschau, was erscheint, entscheidet der Router nach der Adresse.
 *  - Klaviertöne: zuerst aus dem Zwischenspeicher.
 *
 * Alle Projekte unter peterheliko.github.io teilen sich die Zwischenspeicher
 * des Browsers. Weggeräumt wird darum nur, was mit PREFIX beginnt.
 */

const PREFIX = __PREFIX__;
const APP_CACHE = __APP_CACHE__;
const SAMPLE_CACHE = __SAMPLE_CACHE__;
/** Pfade relativ zur Basis; '' ist die Startseite. */
const APP_FILES = __APP_FILES__;
const SAMPLE_FILES = __SAMPLE_FILES__;

/** Nachricht der installierten App: alle Klaviertöne bereithalten. */
const ALL_SAMPLES = 'alle-klaviertoene';
const NETWORK_TIMEOUT_MS = 3000;

const scope = self.registration.scope;

self.addEventListener('install', (event) => {
  event.waitUntil(fill(APP_CACHE, APP_FILES).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith(PREFIX) && name !== APP_CACHE && name !== SAMPLE_CACHE) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  // Ohne Netz scheitert es; die App fragt beim nächsten Start wieder.
  if (event.data === ALL_SAMPLES) event.waitUntil(fill(SAMPLE_CACHE, SAMPLE_FILES).catch(() => {}));
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || !request.url.startsWith(scope)) return;
  if (request.url.startsWith(`${scope}samples/`)) event.respondWith(sample(event));
  else event.respondWith(networkFirst(request));
});

/** Lädt in den Zwischenspeicher, was dort noch fehlt. */
async function fill(name, files) {
  const cache = await caches.open(name);
  const missing = [];
  for (const path of files) {
    const url = new URL(path, scope).href;
    if (!(await cache.match(url))) missing.push(url);
  }
  // «reload»: am HTTP-Zwischenspeicher vorbei. GitHub Pages erlaubt zehn
  // Minuten; so lange käme nach einer Veröffentlichung sonst die alte Datei.
  await cache.addAll(missing.map((url) => new Request(url, { cache: 'reload' })));
}

async function networkFirst(request) {
  const network = fetch(request);
  const answer = await Promise.race([
    network.catch(() => null),
    new Promise((resolve) => setTimeout(() => resolve(null), NETWORK_TIMEOUT_MS)),
  ]);
  if (answer) return answer;
  const cache = await caches.open(APP_CACHE);
  const cached = await cache.match(request.mode === 'navigate' ? scope : request);
  // Nichts gespeichert: weiter aufs Netz warten (oder dessen Fehler melden).
  return cached ?? network;
}

async function sample(event) {
  const cache = await caches.open(SAMPLE_CACHE);
  const cached = await cache.match(event.request);
  if (cached) return cached;
  const response = await fetch(event.request);
  if (response.ok) event.waitUntil(cache.put(event.request, response.clone()));
  return response;
}
