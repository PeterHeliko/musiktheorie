/**
 * Links sind die öffentliche Schnittstelle der Seite: was einmal geteilt ist,
 * muss weiter funktionieren. Diese Tests sichern drei Dinge ab —
 * jeder Zustand übersteht den Weg in die Adresszeile und zurück, Kaputtes
 * fällt still auf die Vorgabe zurück, und ein Aufgabenlink stellt wirklich
 * dieselbe Aufgabe.
 */

import { describe, expect, it } from 'vitest';
import { GENERATORS } from './generators/index';
import { deriveSeeds, makeRng, type Rng } from './generators/rng';
import type { FilterValues, Generator } from './generators/types';
import {
  PARAM_NAMES,
  RESERVED_PARAMS,
  canonicalFilters,
  decodeLink,
  decodeSeed,
  encodeLink,
  encodeSeed,
  paramName,
} from './links';

/** Ein zufälliger, aber gültiger Filterzustand. */
function randomFilters(generator: Generator<FilterValues>, rng: Rng): FilterValues {
  const values: FilterValues = { ...generator.defaults };
  for (const filter of generator.filters) {
    switch (filter.kind) {
      case 'multi': {
        const count = rng.int(filter.min ?? 1, filter.options.length);
        values[filter.key] = rng.sample(filter.options, count).map((option) => option.value);
        break;
      }
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
  return values;
}

/** Mehrfachauswahlen ohne Rücksicht auf die Reihenfolge vergleichen. */
function normalise(values: FilterValues): FilterValues {
  const out: FilterValues = {};
  for (const [key, value] of Object.entries(values)) {
    out[key] = Array.isArray(value) ? [...value].sort() : value;
  }
  return out;
}

describe('Parameternamen', () => {
  it('kennt für jeden Filter jeder Übung einen deutschen Namen', () => {
    const missing = GENERATORS.flatMap((generator) =>
      generator.filters
        .filter((filter) => !(filter.key in PARAM_NAMES))
        .map((filter) => `${generator.id}: ${filter.key}`),
    );
    expect(missing).toEqual([]);
  });

  it('vergibt innerhalb einer Übung jeden Namen nur einmal', () => {
    for (const generator of GENERATORS) {
      const names = generator.filters.map((filter) => paramName(filter.key));
      expect(new Set(names).size, generator.id).toBe(names.length);
    }
  });

  it('kollidiert nicht mit «runde», «aufgabe», «v», «kurs» und «schritt»', () => {
    for (const generator of GENERATORS) {
      for (const filter of generator.filters) {
        expect(RESERVED_PARAMS as readonly string[]).not.toContain(paramName(filter.key));
      }
    }
  });

  it('übersetzt Optionswerte eindeutig', () => {
    // Würden zwei Optionen eines Filters gleich geschrieben, liesse sich der
    // Link nicht mehr eindeutig lesen.
    for (const generator of GENERATORS) {
      for (const filter of generator.filters) {
        if (filter.kind !== 'multi' && filter.kind !== 'single') continue;
        for (const option of filter.options) {
          // Bei «mindestens zwei» die nächsten Optionen dazunehmen, damit der
          // Wert gültig bleibt.
          const others = filter.options.filter((o) => o !== option).map((o) => o.value);
          const multi = [option.value, ...others.slice(0, (filter.kind === 'multi' ? filter.min ?? 1 : 1) - 1)];
          const values = canonicalFilters(generator, {
            ...generator.defaults,
            [filter.key]: filter.kind === 'multi' ? multi : option.value,
          });
          const back = decodeLink(generator, encodeLink(generator, { filters: values, round: null, seed: null }));
          expect(back.filters[filter.key], `${generator.id}.${filter.key}=${option.value}`).toEqual(
            values[filter.key],
          );
        }
      }
    }
  });
});

describe('Hin und zurück', () => {
  it('schreibt die Vorgabe als leeren Link', () => {
    for (const generator of GENERATORS) {
      expect(encodeLink(generator, { filters: generator.defaults, round: null, seed: null })).toBe('');
    }
  });

  it('übersteht jeder Filterzustand den Weg durch die Adresszeile', () => {
    for (const generator of GENERATORS) {
      const rng = makeRng(generator.id.length * 7919);
      for (let i = 0; i < 60; i++) {
        const filters = randomFilters(generator, rng);
        const query = encodeLink(generator, { filters, round: null, seed: null });
        const back = decodeLink(generator, query);
        expect(normalise(back.filters), `${generator.id} ${query}`).toEqual(normalise(filters));
      }
    }
  });

  it('gibt demselben Zustand immer denselben Link', () => {
    const generator = GENERATORS.find((g) => g.id === 'intervalle-hoeren')!;
    const a = encodeLink(generator, { filters: { ...generator.defaults, intervals: ['g3', 'k3'] }, round: null, seed: null });
    const b = encodeLink(generator, { filters: { ...generator.defaults, intervals: ['k3', 'g3'] }, round: null, seed: null });
    expect(a).toBe(b);
    expect(a).toBe('?intervalle=k3,g3');
  });

  it('schreibt lesbare deutsche Links', () => {
    const generator = GENERATORS.find((g) => g.id === 'intervalle-hoeren')!;
    const query = encodeLink(generator, {
      filters: { ...generator.defaults, directions: ['down'], limitPlays: true },
      round: 10,
      seed: 12345,
    });
    expect(query).toBe(`?richtung=ab&begrenzt=ja&runde=10&aufgabe=9ix&v=${generator.version}`);
  });

  it('lässt Kommas und Schrägstriche lesbar stehen', () => {
    const generator = GENERATORS.find((g) => g.id === 'melodiediktat')!;
    const query = encodeLink(generator, {
      filters: { ...generator.defaults, timeSignature: '3/4', durations: ['h', 'q'] },
      round: null,
      seed: null,
    });
    expect(query).toContain('taktart=3/4');
    expect(query).toContain('notenwerte=h,q');
  });

  it('liest Runde und Aufgabe', () => {
    const generator = GENERATORS[0];
    const back = decodeLink(generator, `?runde=20&aufgabe=${encodeSeed(4242)}&v=${generator.version}`);
    expect(back.round).toBe(20);
    expect(back.seed).toBe(4242);
    expect(back.outdated).toBe(false);
    expect(back.fromUrl).toBe(true);
  });
});

describe('Startwerte', () => {
  it('überstehen den Weg durch den Link', () => {
    for (const seed of [0, 1, 35, 36, 12345, 0xfffffffe, 0xffffffff]) {
      expect(decodeSeed(encodeSeed(seed))).toBe(seed);
    }
  });

  it('weisen Unsinn zurück', () => {
    for (const text of [null, '', 'ABC', '-1', 'zzzzzzzz', '12 3', '1.5']) {
      expect(decodeSeed(text)).toBeNull();
    }
  });

  it('ergeben für eine Runde immer dieselbe Folge', () => {
    expect(deriveSeeds(99, 10)).toEqual(deriveSeeds(99, 10));
    expect(new Set(deriveSeeds(99, 10)).size).toBe(10);
    expect(deriveSeeds(99, 10)).not.toEqual(deriveSeeds(100, 10));
  });
});

describe('Kaputte und alte Links', () => {
  it('fallen still auf die Vorgabe zurück', () => {
    for (const generator of GENERATORS) {
      const garbage = generator.filters
        .map((filter) => `${paramName(filter.key)}=%%unsinn,,`)
        .concat(['runde=999', 'aufgabe=!!', 'fremd=1'])
        .join('&');
      const back = decodeLink(generator, `?${garbage}`);
      expect(back.filters, generator.id).toEqual(generator.defaults);
      expect(back.round).toBeNull();
      expect(back.seed).toBeNull();
    }
  });

  it('behalten bei Mehrfachauswahl, was gültig ist', () => {
    const generator = GENERATORS.find((g) => g.id === 'intervalle-bestimmen')!;
    const back = decodeLink(generator, '?intervalle=k3,gibtsnicht,g3,k3');
    expect(back.filters.intervals).toEqual(['k3', 'g3']);
  });

  it('halten Zahlen im erlaubten Bereich', () => {
    const generator = GENERATORS.find((g) => g.id === 'melodiediktat')!;
    expect(decodeLink(generator, '?takte=99').filters.bars).toBe(8);
    expect(decodeLink(generator, '?takte=0').filters.bars).toBe(2);
    expect(decodeLink(generator, '?tempo=77').filters.tempo).toBe(78);
  });

  it('melden eine Aufgabe aus einer anderen Fassung', () => {
    const generator = GENERATORS[0];
    const back = decodeLink(generator, `?aufgabe=${encodeSeed(7)}&v=${generator.version + 1}`);
    expect(back.outdated).toBe(true);
    expect(back.seed).toBeNull();
  });

  it('nehmen eine Aufgabe ohne Fassungsangabe als aktuell', () => {
    const back = decodeLink(GENERATORS[0], `?aufgabe=${encodeSeed(7)}`);
    expect(back.seed).toBe(7);
    expect(back.outdated).toBe(false);
  });
});

describe('Aufgabenlinks', () => {
  it('bringen Mehrfachauswahlen in Optionsreihenfolge', () => {
    const generator = GENERATORS.find((g) => g.id === 'melodiediktat')!;
    const values = canonicalFilters(generator, { ...generator.defaults, durations: ['8', 'w', 'h'] });
    expect(values.durations).toEqual(['w', 'h', '8']);
  });

  it('stellen dieselbe Aufgabe noch einmal', () => {
    for (const generator of GENERATORS) {
      const rng = makeRng(31337);
      for (let i = 0; i < 20; i++) {
        // Wie auf der Seite: Filterwerte immer in Optionsreihenfolge.
        const filters = canonicalFilters(generator, randomFilters(generator, rng));
        const seed = Math.floor(rng.next() * 0xffffffff);
        let original: string;
        try {
          original = JSON.stringify(generator.generate(filters, makeRng(seed)));
        } catch {
          // Manche zufälligen Kombinationen lassen keine Aufgabe zu — das
          // meldet die Seite selbst. Für den Link zählt nur, was entsteht.
          continue;
        }
        const back = decodeLink(generator, encodeLink(generator, { filters, round: null, seed }));
        const again = JSON.stringify(generator.generate(back.filters, makeRng(back.seed!)));
        expect(again, `${generator.id}`).toBe(original);
      }
    }
  });
});
