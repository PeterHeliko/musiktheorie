/**
 * Kurslinks sind wie Übungslinks öffentlich: was einmal geteilt ist, muss
 * weiter dasselbe öffnen. Geprüft wird der Weg durch eine echte Adresse —
 * dort wird einmal mehr entschlüsselt als beim direkten Aufruf.
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ROUND,
  MAX_STEPS,
  MAX_TITLE,
  cleanTitle,
  decodeCourse,
  decodePlace,
  decodeStep,
  describeSettings,
  encodeCourse,
  encodeStep,
  stepQuery,
  type Course,
} from './courses';
import { GENERATORS, generatorById } from './generators/index';
import { makeRng, type Rng } from './generators/rng';
import type { FilterValues, Generator } from './generators/types';
import { PARAM_NAMES, canonicalFilters, decodeLink, encodeLink } from './links';

/** Ein zufälliger, aber gültiger Filterzustand (wie in links.test.ts). */
function randomFilters(generator: Generator<FilterValues>, rng: Rng): FilterValues {
  const values: FilterValues = { ...generator.defaults };
  for (const filter of generator.filters) {
    switch (filter.kind) {
      case 'multi':
        values[filter.key] = rng
          .sample(filter.options, rng.int(filter.min ?? 1, filter.options.length))
          .map((option) => option.value);
        break;
      case 'single':
        values[filter.key] = rng.pick(filter.options).value;
        break;
      case 'toggle':
        values[filter.key] = rng.chance(0.5);
        break;
      case 'range': {
        const step = filter.step ?? 1;
        values[filter.key] = filter.min + step * rng.int(0, Math.floor((filter.max - filter.min) / step));
        break;
      }
    }
  }
  return canonicalFilters(generator, values);
}

/** So, wie ein Kurs im Browser ankommt: als ganze Adresse. */
function throughAddress(course: Course) {
  const url = new URL(`https://example.org/musiktheorie/kurs/${encodeCourse(course)}`);
  return decodeCourse(url.search);
}

const generator = (id: string) => generatorById(id)!;

describe('Kurslinks', () => {
  it('liest das Beispiel aus dem Konzept', () => {
    const course = decodeCourse(
      '?titel=Terzen+und+Sexten' +
        '&1=intervalle-bestimmen~intervalle:k3,g3,k6,g6~runde:10' +
        '&2=intervalle-notieren~intervalle:k3,g3~schluessel:bass~runde:10',
    );
    expect(course.title).toBe('Terzen und Sexten');
    expect(course.missing).toBe(0);
    expect(course.steps.map((step) => step.exercise)).toEqual(['intervalle-bestimmen', 'intervalle-notieren']);
    expect(course.steps[0].filters.intervals).toEqual(['k3', 'g3', 'k6', 'g6']);
    expect(course.steps[1].filters.clefs).toEqual(['bass']);
    expect(course.steps.map((step) => step.round)).toEqual([10, 10]);
  });

  it('schreibt lesbare Links', () => {
    const notieren = generator('intervalle-notieren');
    const query = encodeCourse({
      title: 'Terzen und Sexten',
      steps: [
        { exercise: 'intervalle-notieren', filters: { ...notieren.defaults, clefs: ['bass'] }, round: 10 },
        { exercise: 'intervalle-singen', filters: generator('intervalle-singen').defaults, round: 5 },
      ],
    });
    expect(query).toBe(
      '?titel=Terzen+und+Sexten&1=intervalle-notieren~schluessel:bass~runde:10&2=intervalle-singen~runde:5',
    );
  });

  it('übersteht jeder Schritt jeder Übung den Weg durch die Adresszeile', () => {
    for (const entry of GENERATORS) {
      const rng = makeRng(entry.id.length * 104_729);
      const steps = Array.from({ length: 12 }, () => ({
        exercise: entry.id,
        filters: randomFilters(entry, rng),
        round: rng.int(1, 50),
      }));
      const back = throughAddress({ title: 'Test', steps: steps.slice(0, 10) });
      expect(back.missing, entry.id).toBe(0);
      expect(back.steps, entry.id).toEqual(steps.slice(0, 10));
    }
  });

  it('gibt einem Schritt dieselbe Übung wie der Übungslink', () => {
    // Ein Kursschritt und der entsprechende Übungslink sind dasselbe.
    const entry = generator('intervalle-hoeren');
    const filters = canonicalFilters(entry, { ...entry.defaults, intervals: ['g3', 'k3'], directions: ['down'] });
    const step = decodeStep(encodeStep({ exercise: entry.id, filters, round: 20 })!)!;
    const link = decodeLink(entry, encodeLink(entry, { filters, round: 20, seed: null }));
    expect(step.filters).toEqual(link.filters);
    expect(step.round).toBe(link.round);
  });

  it('braucht keine Trennzeichen, die in Namen oder Werten vorkommen', () => {
    // «~» trennt die Parameter eines Schritts, «:» Name und Wert.
    for (const name of Object.values(PARAM_NAMES)) expect(name).not.toMatch(/[~:]/);
    for (const entry of GENERATORS) {
      expect(entry.id).not.toMatch(/[~:]/);
      for (const filter of entry.filters) {
        if (filter.kind !== 'multi' && filter.kind !== 'single') continue;
        for (const option of filter.options) {
          const query = encodeLink(entry, {
            filters: { ...entry.defaults, [filter.key]: filter.kind === 'multi' ? [option.value] : option.value },
            round: null,
            seed: null,
          });
          expect(query, `${entry.id}.${filter.key}`).not.toContain('~');
        }
      }
    }
  });

  it('lässt Übungen weg, die es nicht gibt, und zählt sie', () => {
    const course = decodeCourse(
      '?titel=X&1=noten-benennen~runde:10&2=gibt-es-nicht~runde:10&3=intervalle-singen~runde:5',
    );
    expect(course.steps.map((step) => step.exercise)).toEqual(['noten-benennen', 'intervalle-singen']);
    expect(course.missing).toBe(1);
  });

  it('ordnet die Schritte nach ihrer Nummer, nicht nach ihrer Stellung', () => {
    const course = decodeCourse('?2=intervalle-singen&titel=X&10=noten-schreiben&1=noten-benennen');
    expect(course.steps.map((step) => step.exercise)).toEqual(['noten-benennen', 'intervalle-singen', 'noten-schreiben']);
  });

  it('fällt bei fehlender oder unmöglicher Rundengrösse auf die Vorgabe zurück', () => {
    const course = decodeCourse('?1=noten-benennen&2=noten-benennen~runde:0&3=noten-benennen~runde:viel');
    expect(course.steps.map((step) => step.round)).toEqual([DEFAULT_ROUND, DEFAULT_ROUND, DEFAULT_ROUND]);
  });

  it('überhört Unlesbares in einem Schritt', () => {
    const entry = generator('noten-benennen');
    const step = decodeStep('noten-benennen~quatsch~:x~schluessel:nirgends~runde:20')!;
    expect(step.filters).toEqual(canonicalFilters(entry, entry.defaults));
    expect(step.round).toBe(20);
  });

  it('nimmt höchstens MAX_STEPS Schritte', () => {
    const entry = generator('noten-benennen');
    const steps = Array.from({ length: MAX_STEPS + 5 }, (_, index) => ({
      exercise: entry.id,
      filters: entry.defaults,
      round: (index % 50) + 1,
    }));
    expect(throughAddress({ title: 'Viel', steps }).steps).toHaveLength(MAX_STEPS);
    const long = '?titel=X' + steps.map((_, index) => `&${index + 1}=noten-benennen`).join('');
    expect(decodeCourse(long).steps).toHaveLength(MAX_STEPS);
  });

  it('erkennt einen Link ohne Kurs', () => {
    expect(decodeCourse('').steps).toEqual([]);
    expect(decodeCourse('?titel=Nur+ein+Titel').steps).toEqual([]);
  });
});

describe('Kurstitel', () => {
  it('kürzt auf MAX_TITLE Zeichen und zieht Leerraum zusammen', () => {
    expect(cleanTitle('  Terzen   und\tSexten ')).toBe('Terzen und Sexten');
    expect([...cleanTitle('x'.repeat(50))]).toHaveLength(MAX_TITLE);
  });

  it('zerlegt beim Kürzen kein Emoji', () => {
    const title = cleanTitle('🎵'.repeat(40));
    expect([...title]).toHaveLength(MAX_TITLE);
    expect(title).toBe('🎵'.repeat(MAX_TITLE));
  });

  it('übersteht Sonderzeichen in der Adresse', () => {
    for (const title of ['Dur & Moll', 'Was ist 1+1?', 'Übermässig #3', 'a=b; c/d', '50 % Terzen']) {
      expect(throughAddress({ title, steps: [] }).title, title).toBe(title);
    }
  });
});

describe('Schritt in der Übung', () => {
  it('hängt Kurs und Schritt an den Übungslink', () => {
    const entry = generator('noten-benennen');
    const query = stepQuery({ exercise: entry.id, filters: entry.defaults, round: 10 }, { course: 'k3x9q', step: 2 });
    expect(query).toBe('?runde=10&kurs=k3x9q&schritt=2');
    expect(decodePlace(query)).toEqual({ course: 'k3x9q', step: 2 });
    // Die Übung selbst liest daraus nur ihre Einstellungen.
    const link = decodeLink(entry, query);
    expect(link.round).toBe(10);
  });

  it('überhört kaputte Kursangaben', () => {
    expect(decodePlace('?runde=10')).toBeNull();
    expect(decodePlace('?kurs=k3x9q')).toBeNull();
    expect(decodePlace('?kurs=K3%3C&schritt=1')).toBeNull();
    expect(decodePlace('?kurs=k3x9q&schritt=0')).toBeNull();
    expect(decodePlace(`?kurs=k3x9q&schritt=${MAX_STEPS + 1}`)).toBeNull();
  });
});

describe('Beschreibung eines Schritts', () => {
  it('sagt nichts, wo die Vorgabe gilt', () => {
    for (const entry of GENERATORS) expect(describeSettings(entry, entry.defaults), entry.id).toEqual([]);
  });

  it('nennt Abweichungen mit den Beschriftungen der Filter', () => {
    const entry = generator('intervalle-notieren');
    const clefs = entry.filters.find((filter) => filter.key === 'clefs');
    expect(clefs?.kind).toBe('multi');
    const parts = describeSettings(entry, { ...entry.defaults, clefs: ['bass'] });
    expect(parts).toEqual(['Schlüssel: Bassschlüssel']);
  });

  it('beantwortet Fragen ohne Doppelpunkt', () => {
    const entry = generator('notenwerte-zuordnen');
    const kinds = entry.filters.find((filter) => filter.key === 'kinds')!;
    expect(kinds.label.endsWith('?')).toBe(true);
    const parts = describeSettings(entry, { ...entry.defaults, kinds: ['rest'] });
    expect(parts).toEqual([`${kinds.label} Pausenzeichen`]);
  });

  it('nennt Zahlen mit Einheit dahinter, ohne Einheit nach einem Doppelpunkt', () => {
    const dictation = generator('melodiediktat');
    expect(describeSettings(dictation, { ...dictation.defaults, bars: 6 })).toEqual(['Länge 6 Takte']);
    const scales = generator('tonleitern-notieren');
    expect(describeSettings(scales, { ...scales.defaults, maxAccidentals: 2 })).toEqual([
      'Maximale Anzahl Vorzeichen: 2',
    ]);
  });

  it('beschreibt jeden Zustand jeder Übung mit lesbarem Text', () => {
    for (const entry of GENERATORS) {
      const rng = makeRng(entry.id.length * 31);
      for (let i = 0; i < 20; i++) {
        for (const part of describeSettings(entry, randomFilters(entry, rng))) {
          expect(part.trim(), entry.id).not.toBe('');
          expect(part, entry.id).not.toMatch(/<|undefined|\[object/);
        }
      }
    }
  });
});
