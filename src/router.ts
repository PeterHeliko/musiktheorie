/**
 * Seitenwechsel ohne Neuladen.
 *
 * Jede Seite hat eine echte Adresse und beim Bauen eine eigene HTML-Datei
 * (siehe `pages.ts`). Wer einen Link öffnet, lädt also genau diese Datei. Von
 * da an wechselt die Seite ohne Neuladen: Klicks auf interne Links werden
 * abgefangen und per History-API erledigt.
 *
 * Das ist mehr als Bequemlichkeit. Ein offenes Mikrofon und ein laufender
 * Audiokontext überleben nur, solange die Seite nicht neu lädt — und Safari
 * fragt nach jedem Neuladen erneut um Erlaubnis für das Mikrofon.
 */

import { useEffect, useState } from 'preact/hooks';
import { aliasTarget, pathOf, routeFromPath, type Route } from './pages';

/** Basis der Website, endet auf «/». Auf GitHub Pages: «/musiktheorie/». */
export const BASE: string = import.meta.env.BASE_URL;

export function hrefFor(route: Route, query = ''): string {
  return BASE + pathOf(route) + query;
}

/** Absolute Adresse, etwa zum Teilen. */
export function absoluteUrl(href: string): string {
  return new URL(href, globalThis.location.href).toString();
}

export interface Location {
  route: Route;
  /** Abfrageteil samt «?», oder leer. */
  search: string;
}

function readLocation(): Location {
  const { pathname, search, hash } = globalThis.location;
  if (!pathname.startsWith(BASE)) return { route: { page: 'nicht-gefunden' }, search };
  const path = decodeURIComponent(pathname.slice(BASE.length));
  const route = routeFromPath(path);
  // Eine frühere Adresse: die Adresszeile zeigt die Seite, die jetzt dort steht.
  if (aliasTarget(path)) {
    globalThis.history.replaceState(globalThis.history.state, '', hrefFor(route, search) + hash);
  }
  return { route, search };
}

const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

/** Zu einer internen Adresse wechseln, ohne die Seite neu zu laden. */
export function navigate(href: string): void {
  globalThis.history.pushState(null, '', href);
  globalThis.scrollTo(0, 0);
  notify();
}

/**
 * Adresszeile still nachführen — für den Übungszustand. Ersetzt den Eintrag,
 * statt einen neuen anzulegen: sonst füllte jede Aufgabe den Zurück-Knopf.
 */
export function replaceQuery(href: string): void {
  if (href === globalThis.location.pathname + globalThis.location.search) return;
  globalThis.history.replaceState(globalThis.history.state, '', href);
}

export function useLocation(): Location {
  const [location, setLocation] = useState(readLocation);
  useEffect(() => {
    const update = () => setLocation(readLocation());
    listeners.add(update);
    globalThis.addEventListener('popstate', update);
    return () => {
      listeners.delete(update);
      globalThis.removeEventListener('popstate', update);
    };
  }, []);
  return location;
}

/**
 * Klicks auf interne Links abfangen. Alles andere — neue Tabs, Mittelklick,
 * Downloads, fremde Seiten — bleibt dem Browser.
 */
export function interceptLinks(): void {
  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = (event.target as Element | null)?.closest?.('a');
    if (!anchor || anchor.target || anchor.hasAttribute('download')) return;
    const url = new URL(anchor.href, globalThis.location.href);
    if (url.origin !== globalThis.location.origin || !url.pathname.startsWith(BASE)) return;
    // Sprungmarke auf derselben Seite: dem Browser überlassen.
    if (url.pathname === globalThis.location.pathname && url.search === globalThis.location.search && url.hash) {
      return;
    }
    event.preventDefault();
    navigate(url.pathname + url.search + url.hash);
  });
}
