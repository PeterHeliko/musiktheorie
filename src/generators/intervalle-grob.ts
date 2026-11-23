/**
 * Intervalle grob bestimmen — nur die Grösse (Terz, Quinte …), noch ohne
 * «klein», «gross» oder «rein».
 *
 * Grobbestimmung heisst: Linien und Zwischenräume abzählen. Damit es dabei
 * bleibt, kommen keine Vorzeichen vor — weder im Notenbild noch in der
 * Werkzeugleiste. Mit Stammtönen allein legt der Abstand im System die Grösse
 * eindeutig fest; die Lösung ist also immer genau ein Ton je Richtung.
 *
 *  - `intervalle-grob-bestimmen`: zwei Noten stehen da, die Grösse ist zu
 *    nennen.
 *  - `intervalle-grob-notieren`: ein Ton und eine Grösse stehen da, der
 *    zweite Ton ist zu setzen.
 */

import { INTERVAL_SIZE_OPTIONS, intervalSizeAnswer, intervalSizeNumber } from '../content/options';
import { diatonicIndex, intervalBetween, midi, naturalAt, type Pitch } from '../music/theory';
import type { Rng } from './rng';
import {
  CLEF_OPTIONS,
  LEDGER_ROOM,
  WIDTH_OPTIONS,
  candidatePitches,
  insist,
  intervalSizeNaming,
  intervalWriting,
  pitchKey,
  taskId,
  windowFor,
} from './shared';
import { multi, single, type FilterValues, type Generator, type Question } from './types';

const ALL_SIZES = INTERVAL_SIZE_OPTIONS.map((option) => option.value);

/** Nur Stammtöne. */
const NATURAL = [0];

/** Der Stammton `number - 1` Stufen über bzw. unter `from`. */
function stepsAway(from: Pitch, number: number, direction: 'up' | 'down'): Pitch {
  const sign = direction === 'up' ? 1 : -1;
  return naturalAt(diatonicIndex(from) + sign * (number - 1));
}

/** Was im Notenbild steht, muss die verlangte Grösse haben — unabhängig nachgerechnet. */
function checkSize(a: Pitch, b: Pitch, number: number): void {
  const measured = intervalBetween(a, b).number;
  insist(
    measured === number && a.alter === 0 && b.alter === 0,
    `${pitchKey(a)}–${pitchKey(b)} ist eine ${measured}, verlangt war eine ${number}`,
  );
}

// ---------------------------------------------------------------------------
// Am Notenbild bestimmen
// ---------------------------------------------------------------------------

interface NamingFilters extends FilterValues {
  intervals: string[];
  clefs: string[];
  width: string;
}

export const intervalleGrobBestimmen: Generator<NamingFilters> = {
  id: 'intervalle-grob-bestimmen',
  topic: 'intervalle',
  group: 'grob',
  skill: 'erkennen',
  version: 1,
  title: 'Intervalle grob bestimmen',
  instruction: 'Bestimme die Grösse des Intervalls.',
  hint: 'Zähle beide Töne mit: von Linie zur nächsten Linie ist eine Terz.',

  filters: [
    { kind: 'multi', key: 'intervals', label: 'Welche Intervalle?', options: INTERVAL_SIZE_OPTIONS },
    { kind: 'multi', key: 'clefs', label: 'Schlüssel', options: CLEF_OPTIONS },
    { kind: 'single', key: 'width', label: 'Lage', options: WIDTH_OPTIONS },
  ],

  defaults: {
    intervals: ALL_SIZES,
    clefs: ['treble'],
    width: 'eng',
  },

  generate(values, rng: Rng): Question {
    const sizes = multi(values, 'intervals', this.defaults.intervals);
    const clefs = multi(values, 'clefs', this.defaults.clefs);
    const width = single(values, 'width', 'eng');

    const clef = rng.pick(clefs) as 'treble' | 'bass';
    const window = windowFor(clef, width);
    const size = rng.pick(sizes);
    const number = intervalSizeNumber(size);

    const pairs = candidatePitches(window, NATURAL)
      .map((low) => ({ low, high: stepsAway(low, number, 'up') }))
      .filter(({ high }) => midi(high) <= window.high);
    insist(pairs.length > 0, `keine Stammtöne für eine ${number} in dieser Lage`);

    const { low, high } = rng.pick(pairs);
    checkSize(low, high, number);
    insist(intervalSizeAnswer(number) === size, `${number} ist nicht «${size}»`);

    return {
      task: intervalSizeNaming(
        taskId('gb', rng),
        [pitchKey(low), pitchKey(high)],
        size,
        clef,
        sizes,
        width,
      ),
    };
  },
};

// ---------------------------------------------------------------------------
// Notieren
// ---------------------------------------------------------------------------

interface WritingFilters extends FilterValues {
  intervals: string[];
  direction: string;
  clefs: string[];
  width: string;
}

export const intervalleGrobNotieren: Generator<WritingFilters> = {
  id: 'intervalle-grob-notieren',
  topic: 'intervalle',
  group: 'grob',
  skill: 'notieren',
  version: 1,
  title: 'Intervalle grob notieren',
  instruction: 'Ergänze zum vorgegebenen Ton den zweiten Ton des verlangten Intervalls.',
  hint: 'Tippe die Stelle im System an oder ziehe dorthin.',

  filters: [
    { kind: 'multi', key: 'intervals', label: 'Welche Intervalle?', options: INTERVAL_SIZE_OPTIONS },
    {
      kind: 'single',
      key: 'direction',
      label: 'Richtung',
      options: [
        { value: 'frei', label: 'frei — beides gilt' },
        { value: 'up', label: 'nur aufwärts' },
        { value: 'down', label: 'nur abwärts' },
      ],
      hint: '«Frei» wertet beide Richtungen als richtig.',
    },
    { kind: 'multi', key: 'clefs', label: 'Schlüssel', options: CLEF_OPTIONS },
    { kind: 'single', key: 'width', label: 'Lage', options: WIDTH_OPTIONS },
  ],

  defaults: {
    intervals: ALL_SIZES,
    direction: 'frei',
    clefs: ['treble'],
    width: 'eng',
  },

  generate(values, rng: Rng): Question {
    const sizes = multi(values, 'intervals', this.defaults.intervals);
    const direction = single(values, 'direction', 'frei');
    const clefs = multi(values, 'clefs', this.defaults.clefs);
    const width = single(values, 'width', 'eng');

    const clef = rng.pick(clefs) as 'treble' | 'bass';
    const window = windowFor(clef, width);
    const size = rng.pick(sizes);
    const number = intervalSizeNumber(size);

    // Wie beim Notieren der Feinbestimmung: der Zielton darf auf Hilfslinien
    // hinausreichen, der Startton bleibt im gewählten Umfang.
    const reach = { low: window.low - LEDGER_ROOM, high: window.high + LEDGER_ROOM };
    const usable = (pitch: Pitch) => midi(pitch) >= reach.low && midi(pitch) <= reach.high;

    const starts = candidatePitches(window, NATURAL)
      .map((start) => ({ start, up: stepsAway(start, number, 'up'), down: stepsAway(start, number, 'down') }))
      .filter(({ up, down }) => {
        if (direction === 'up') return usable(up);
        if (direction === 'down') return usable(down);
        return usable(up) || usable(down);
      });
    insist(starts.length > 0, `kein Startton für eine ${number} in dieser Lage`);

    const chosen = rng.pick(starts);
    const accepted: Pitch[] = [];
    if (direction !== 'down' && usable(chosen.up)) accepted.push(chosen.up);
    if (direction !== 'up' && usable(chosen.down)) accepted.push(chosen.down);
    for (const target of accepted) checkSize(chosen.start, target, number);

    // Bei der Prime fallen auf- und abwärts zusammen.
    const keys = [...new Set(accepted.map(pitchKey))];
    const label = INTERVAL_SIZE_OPTIONS[number - 1].label;

    return {
      task: intervalWriting(taskId('gn', rng), label, pitchKey(chosen.start), keys, clef, {
        noAccidentals: true,
      }),
      instruction:
        direction === 'frei'
          ? 'Ergänze zum vorgegebenen Ton den zweiten Ton des verlangten Intervalls. Entscheide selbst, ob du auf- oder abwärts gehst.'
          : direction === 'up'
            ? 'Ergänze den Ton, der das verlangte Intervall ÜBER dem vorgegebenen Ton bildet.'
            : 'Ergänze den Ton, der das verlangte Intervall UNTER dem vorgegebenen Ton bildet.',
      hint:
        direction === 'frei'
          ? 'Beide Richtungen werden als richtig gewertet. Tippe die Stelle im System an oder ziehe dorthin.'
          : 'Tippe die Stelle im System an oder ziehe dorthin.',
      context:
        direction === 'up'
          ? 'über dem vorgegebenen Ton'
          : direction === 'down'
            ? 'unter dem vorgegebenen Ton'
            : undefined,
    };
  },
};
