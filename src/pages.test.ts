/**
 * Seiten und ihre Adressen. Themen und Übungen liegen auf derselben Ebene
 * (/ueben/intervalle/ und /ueben/intervalle-hoeren/) — das geht nur, solange
 * keine Themenkennung einer Übungskennung gleicht.
 */

import { describe, expect, it } from 'vitest';
import { GENERATORS } from './generators/index';
import { TOPICS } from './generators/types';
import { ALIASES, allPages, metaFor, pathOf, routeFromPath } from './pages';

describe('Seiten', () => {
  it('verwechselt kein Thema mit einer Übung', () => {
    const exercises = new Set(GENERATORS.map((generator) => generator.id));
    for (const topic of TOPICS) expect(exercises.has(topic.id), topic.id).toBe(false);
  });

  it('findet jede Seite über ihren eigenen Pfad wieder', () => {
    for (const page of allPages()) {
      expect(pathOf(routeFromPath(page.path)), page.path).toBe(page.path);
    }
  });

  it('kennt Themen- und Übungsseiten', () => {
    expect(routeFromPath('ueben/intervalle/')).toEqual({ page: 'thema', topic: 'intervalle' });
    expect(routeFromPath('ueben/intervalle-hoeren')).toEqual({ page: 'uebung', id: 'intervalle-hoeren' });
    expect(routeFromPath('ueben/toene/')).toEqual({ page: 'thema', topic: 'toene' });
    expect(routeFromPath('ueben/noten-benennen/')).toEqual({ page: 'uebung', id: 'noten-benennen' });
    expect(routeFromPath('ueben/gibt-es-nicht/')).toEqual({ page: 'nicht-gefunden' });
  });

  it('vergibt jeden Titel nur einmal', () => {
    // Grob- und Feinbestimmung teilen sich Übungstitel; Tab und Vorschau
    // nennen deshalb die Gruppe dazu.
    const titles = allPages().map((page) => page.title);
    expect(new Set(titles).size).toBe(titles.length);
    expect(metaFor({ page: 'uebung', id: 'intervalle-grob-notieren' }).title).toBe(
      'Intervalle notieren (Grobbestimmung)',
    );
    expect(metaFor({ page: 'uebung', id: 'intervalle-notieren' }).title).toBe('Intervalle notieren (Feinbestimmung)');
    expect(metaFor({ page: 'uebung', id: 'stufen-bestimmen' }).title).toBe('Stufen bestimmen');
  });

  it('nennt in der Themenbeschreibung jeden Übungstitel einmal', () => {
    const description = metaFor({ page: 'thema', topic: 'intervalle' }).description;
    expect(description.match(/Intervalle notieren/g)).toHaveLength(1);
  });

  it('vergibt jeden Pfad nur einmal', () => {
    const paths = [...allPages().map((page) => page.path), ...ALIASES.map((alias) => alias.path)];
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('öffnet frühere Adressen als die Seite, die jetzt dort steht', () => {
    expect(routeFromPath('ueben/')).toEqual({ page: 'start' });
    expect(routeFromPath('ueben')).toEqual({ page: 'start' });
    expect(routeFromPath('ueben/index.html')).toEqual({ page: 'start' });
    for (const alias of ALIASES) expect(routeFromPath(alias.path), alias.path).toEqual(alias.route);
  });
});
