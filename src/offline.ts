/**
 * Offline und als installierte App: meldet den Service Worker an. Er entsteht
 * beim Bauen (scripts/write-sw.ts) aus src/service-worker.js; dort steht, was
 * er speichert und wann.
 *
 * Nur in der gebauten Seite. Unter `npm run dev` gibt es keine sw.js, und ein
 * Service Worker hielte dort nur alte Fassungen fest.
 */

/** Muss zu src/service-worker.js passen. */
const ALL_SAMPLES = 'alle-klaviertoene';

export function installOffline(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const sw = navigator.serviceWorker;

  // Erst nach dem Laden: die Seite selbst geht vor.
  const register = () => {
    sw.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      // Ohne Service Worker läuft die Seite wie bisher, nur nicht offline.
    });
  };
  if (document.readyState === 'complete') register();
  else globalThis.addEventListener('load', register, { once: true });

  // Die installierte App soll auch ohne Netz klingen: alle Klaviertöne
  // bereithalten, nicht nur die schon gespielten. Bei jedem Start fragen;
  // der Service Worker lädt nur, was fehlt. Nach einer neuen Fassung
  // (controllerchange) nochmals, falls sich die Töne geändert haben.
  if (isInstalledApp()) {
    void sw.ready.then((registration) => registration.active?.postMessage(ALL_SAMPLES));
    sw.addEventListener('controllerchange', () => sw.controller?.postMessage(ALL_SAMPLES));
  }
}

/** Vom Startbildschirm geöffnet, ohne Adresszeile. */
function isInstalledApp(): boolean {
  return (
    globalThis.matchMedia?.('(display-mode: standalone)').matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}
