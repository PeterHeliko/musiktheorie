/**
 * Nie zweimal dieselbe Aufgabe hintereinander (Entscheid 2026-11-24).
 *
 * Dieselbe heisst: alles gleich ausser den Kennungen — Notenbild, Tasten,
 * Hörbeispiel, Antworten. Gleiches Intervall über einem anderen Ton ist eine
 * andere Aufgabe.
 *
 * Neu gewürfelt wird über den Startwert, nicht in den Generatoren: so bleibt
 * jede Aufgabe mit ihrem Startwert verlinkbar, und eine Runde lässt sich aus
 * ihrem Startwert genau so wieder herstellen, wie sie lief.
 */

import { DEFAULT_VOICE } from '../sing/voice';
import { makeRng } from './rng';
import type { FilterValues, Generator, Personal, Question } from './types';

/**
 * So oft wird neu gewürfelt, bevor eine Wiederholung hingenommen wird — wenn
 * die Einstellungen etwa nur eine einzige Aufgabe zulassen.
 */
const MAX_TRIES = 30;

/** Eine Aufgabe ohne ihre Kennungen, zum Vergleichen. */
export function questionKey(question: Question): string {
  return JSON.stringify(question, (key, value) => (key === 'id' ? undefined : value));
}

function keyOf(generator: Generator<FilterValues>, filters: FilterValues, seed: number, personal: Personal): string | null {
  try {
    return questionKey(generator.generate(filters, makeRng(seed), personal));
  } catch {
    // Ein Generator, der wirft, zeigt seine Meldung; vergleichen lässt sich nichts.
    return null;
  }
}

/** Der nächste Startwert aus `draw`, dessen Aufgabe sich von `previous` unterscheidet. */
export function freshSeed(
  generator: Generator<FilterValues>,
  filters: FilterValues,
  personal: Personal,
  previous: Question | null,
  draw: () => number,
): number {
  let seed = draw();
  if (!previous) return seed;
  const before = questionKey(previous);
  for (let tries = 1; tries < MAX_TRIES && keyOf(generator, filters, seed, personal) === before; tries++) {
    seed = draw();
  }
  return seed;
}

/**
 * Die Startwerte einer Runde, ohne zwei gleiche Aufgaben hintereinander.
 *
 * Verglichen wird in der Vorgabe-Stimmlage, nicht in der eigenen: ein
 * Rundenlink ergibt so bei allen dieselbe Folge. Ohne Wiederholungen sind es
 * genau die Startwerte von `deriveSeeds` — ältere Rundenlinks bleiben gleich.
 */
export function roundSeeds(
  generator: Generator<FilterValues>,
  filters: FilterValues,
  roundSeed: number,
  count: number,
): number[] {
  const rng = makeRng(roundSeed);
  const draw = () => Math.floor(rng.next() * 0xffffffff);
  const personal: Personal = { voice: DEFAULT_VOICE };
  const seeds: number[] = [];
  let previous: Question | null = null;
  for (let index = 0; index < count; index++) {
    const seed = freshSeed(generator, filters, personal, previous, draw);
    seeds.push(seed);
    try {
      previous = generator.generate(filters, makeRng(seed), personal);
    } catch {
      previous = null;
    }
  }
  return seeds;
}

/** Startwerte ohne zwei gleiche Aufgaben direkt nacheinander (falsche wiederholen). */
export function withoutRepeats(
  generator: Generator<FilterValues>,
  filters: FilterValues,
  personal: Personal,
  seeds: number[],
): number[] {
  const kept: number[] = [];
  let previous: string | null = null;
  for (const seed of seeds) {
    const key = keyOf(generator, filters, seed, personal);
    if (key !== null && key === previous) continue;
    kept.push(seed);
    previous = key;
  }
  return kept;
}
