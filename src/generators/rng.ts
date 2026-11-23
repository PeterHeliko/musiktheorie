/**
 * Zufall mit Startwert.
 *
 * `Math.random()` täte es fast — aber ein reproduzierbarer Zufall kauft drei
 * Dinge, die sonst fehlen: «Runde wiederholen» kann dieselben Aufgaben noch
 * einmal stellen, eine kaputte Aufgabe lässt sich über die Adresszeile
 * (`?seed=…`) exakt wieder herstellen, und die Tests laufen deterministisch.
 */

export interface Rng {
  /** Gleichverteilt in [0, 1). */
  next(): number;
  /** Ganze Zahl in [min, max], beide einschliesslich. */
  int(min: number, max: number): number;
  /** Ein Element; wirft bei leerer Liste, weil das immer ein Filterfehler ist. */
  pick<T>(items: readonly T[]): T;
  /** `count` verschiedene Elemente, in zufälliger Reihenfolge. */
  sample<T>(items: readonly T[], count: number): T[];
  /** Wahr mit der angegebenen Wahrscheinlichkeit. */
  chance(probability: number): boolean;
  /** Ein Element, gewichtet nach den mitgelieferten Gewichten. */
  weighted<T>(items: readonly T[], weights: readonly number[]): T;
}

/**
 * mulberry32 — klein, schnell und für Aufgabenauswahl mehr als gut genug.
 * (Kein kryptografischer Zufall; das wäre hier auch keine Anforderung.)
 */
export function makeRng(seed: number): Rng {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const int = (min: number, max: number): number => min + Math.floor(next() * (max - min + 1));

  const pick = <T,>(items: readonly T[]): T => {
    if (items.length === 0) {
      throw new Error('Auswahl aus einer leeren Liste — vermutlich ein zu enger Filter.');
    }
    return items[int(0, items.length - 1)];
  };

  return {
    next,
    int,
    pick,
    sample<T>(items: readonly T[], count: number): T[] {
      const pool = [...items];
      const out: T[] = [];
      while (out.length < count && pool.length > 0) {
        out.push(pool.splice(int(0, pool.length - 1), 1)[0]);
      }
      return out;
    },
    chance: (probability: number) => next() < probability,
    weighted<T>(items: readonly T[], weights: readonly number[]): T {
      const total = weights.reduce((sum, w) => sum + w, 0);
      if (total <= 0) return pick(items);
      let ticket = next() * total;
      for (let i = 0; i < items.length; i++) {
        ticket -= weights[i];
        if (ticket <= 0) return items[i];
      }
      return items[items.length - 1];
    },
  };
}

/** Startwert für eine frische Aufgabe. */
export function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff);
}

/**
 * Die Startwerte einer ganzen Runde aus einem einzigen Startwert. So genügt
 * ein Wert im Link, um dieselben zehn Aufgaben in derselben Reihenfolge noch
 * einmal zu stellen.
 */
export function deriveSeeds(roundSeed: number, count: number): number[] {
  const rng = makeRng(roundSeed);
  return Array.from({ length: count }, () => Math.floor(rng.next() * 0xffffffff));
}
