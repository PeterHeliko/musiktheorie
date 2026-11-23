/**
 * Alle Seiten der Website: Pfad, Titel, Beschreibung.
 *
 * Diese Liste brauchen zwei Stellen:
 *  - der Router im Browser, um aus der Adresse die Seite zu machen, und
 *  - `scripts/write-pages.ts` beim Bauen, das für jeden Eintrag eine eigene
 *    HTML-Datei mit Titel und Beschreibung schreibt. Nur so zeigt ein geteilter
 *    Link im Chat eine passende Vorschau — Vorschauen führen kein JavaScript aus.
 *
 * Deshalb hängt hier nichts vom Browser ab. Pfade sind relativ zur Basis
 * (`/musiktheorie/` auf GitHub Pages) und enden auf «/», wie GitHub Pages sie
 * ausliefert.
 */

import { GENERATORS, generatorById, topicsWithGenerators } from './generators/index';
import { TOPICS, fullTitle, type TopicId } from './generators/types';

export const SITE_NAME = 'Musiktheorie üben';

export type Route =
  | { page: 'start' }
  | { page: 'ueben' }
  | { page: 'thema'; topic: TopicId }
  | { page: 'uebung'; id: string }
  | { page: 'tonhoehe' }
  | { page: 'nicht-gefunden' };

export interface PageMeta {
  /** Relativ zur Basis, z.B. «ueben/intervalle-hoeren/»; die Startseite ist «». */
  path: string;
  /** Seitentitel ohne den Namen der Website. */
  title: string;
  description: string;
}

export function pathOf(route: Route): string {
  switch (route.page) {
    case 'start':
      return '';
    case 'ueben':
      return 'ueben/';
    case 'thema':
      // Gleiche Ebene wie die Übungen (/ueben/intervalle-hoeren/): die
      // Übungsadressen sind schon geteilt und bleiben, wie sie sind. Themen-
      // und Übungskennungen dürfen sich deshalb nie gleichen (Test).
      return `ueben/${route.topic}/`;
    case 'uebung':
      return `ueben/${route.id}/`;
    case 'tonhoehe':
      return 'werkzeuge/tonhoehe/';
    case 'nicht-gefunden':
      return '404.html';
  }
}

/** Pfad (relativ zur Basis) → Seite. Toleriert fehlenden Schrägstrich am Ende. */
export function routeFromPath(path: string): Route {
  const clean = path.replace(/index\.html$/, '').replace(/\/+$/, '');
  if (clean === '') return { page: 'start' };
  if (clean === 'ueben') return { page: 'ueben' };
  if (clean === 'werkzeuge/tonhoehe') return { page: 'tonhoehe' };
  const match = /^ueben\/([a-z0-9-]+)$/.exec(clean);
  if (match) {
    const topic = topicsWithGenerators().find((entry) => entry.id === match[1]);
    if (topic) return { page: 'thema', topic: topic.id };
    if (generatorById(match[1])) return { page: 'uebung', id: match[1] };
  }
  return { page: 'nicht-gefunden' };
}

/** Anweisungen enthalten teils einfaches Markup («<b>…</b>»); für Titel und Vorschau weg damit. */
export function plainText(html: string): string {
  return html.replace(/<[^>]+>/g, '');
}

export function metaFor(route: Route): PageMeta {
  const path = pathOf(route);
  switch (route.page) {
    case 'start':
      return {
        path,
        title: SITE_NAME,
        description:
          'Musiktheorie im Browser üben: Intervalle, Tonarten, Dreiklänge, Rhythmus und ' +
          'Gehörbildung. Unbegrenzt viele Aufgaben, frei einstellbar, ohne Konto.',
      };
    case 'ueben':
      return {
        path,
        title: 'Übungen',
        description:
          'Alle Übungen nach Thema — Rhythmus, Intervalle, Tonleitern und Tonarten, ' +
          'Dreiklänge, Melodie. Jede Aufgabe wird neu gewürfelt.',
      };
    case 'thema': {
      const topic = TOPICS.find((entry) => entry.id === route.topic)!;
      // Grob- und Feinbestimmung teilen sich Titel; jeder steht nur einmal da.
      const titles = new Set(
        GENERATORS.filter((generator) => generator.topic === route.topic).map((generator) => generator.title),
      );
      return {
        path,
        title: topic.title,
        description: `Übungen zum Thema ${topic.title}: ${[...titles].join(', ')}.`,
      };
    }
    case 'uebung': {
      const generator = generatorById(route.id);
      if (!generator) return metaFor({ page: 'nicht-gefunden' });
      return {
        path,
        title: fullTitle(generator),
        description: `${plainText(generator.instruction)} Unbegrenzt viele Aufgaben, frei einstellbar.`,
      };
    }
    case 'tonhoehe':
      return {
        path,
        title: 'Tonhöhe anzeigen',
        description:
          'Singe oder spiele einen Ton: die Seite zeigt, welcher es ist und wie genau er ' +
          'getroffen ist. Der Ton wird nur im Browser ausgewertet.',
      };
    case 'nicht-gefunden':
      return {
        path,
        title: 'Seite nicht gefunden',
        description: 'Diese Seite gibt es nicht (mehr).',
      };
  }
}

/** Alle Seiten, die eine eigene HTML-Datei bekommen. */
export function allPages(): PageMeta[] {
  const routes: Route[] = [
    { page: 'start' },
    { page: 'ueben' },
    ...topicsWithGenerators().map((topic): Route => ({ page: 'thema', topic: topic.id })),
    ...GENERATORS.map((generator): Route => ({ page: 'uebung', id: generator.id })),
    { page: 'tonhoehe' },
  ];
  return routes.map(metaFor);
}

/** Vollständiger Text für `<title>`. */
export function documentTitle(meta: PageMeta): string {
  return meta.title === SITE_NAME ? SITE_NAME : `${meta.title} · ${SITE_NAME}`;
}
