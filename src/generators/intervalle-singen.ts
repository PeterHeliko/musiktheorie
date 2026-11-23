/**
 * Intervalle singen — ein Ausgangston erklingt und steht im System, dazu das
 * verlangte Intervall. Gesungen wird der Zielton.
 *
 * Wie bewertet wird, steht in `sing/judge.ts`: der erste gehaltene Ton
 * entscheidet, der Ausgangston darf vorher nachgesungen werden, und die
 * Oktave ist egal.
 *
 * Wo die Töne liegen, bestimmt die Stimmlage — eine persönliche Einstellung,
 * die nie im Link steht. Deshalb wird zuerst das Intervall gewürfelt und
 * erst danach der Ausgangston: derselbe Aufgabenlink fragt bei allen dasselbe
 * Intervall, nur in der eigenen Lage.
 */

import { DEFAULT_INTERVALS, INTERVAL_OPTIONS } from '../content/options';
import type { ScoreSpec, SingTask } from '../content/schema';
import {
  diatonicIndex,
  intervalBetween,
  intervalFullName,
  intervalLabel,
  midi,
  parseIntervalLabel,
  parsePitch,
  transposeByInterval,
  type Interval,
  type Pitch,
} from '../music/theory';
import { DEFAULT_VOICE, VOICE_RANGES } from '../sing/voice';
import type { Rng } from './rng';
import {
  CLEF_OPTIONS,
  DIRECTION_OPTIONS,
  candidatePitches,
  insist,
  intervalLabelsFor,
  pitchKey,
  taskId,
} from './shared';
import { multi, single, type FilterValues, type Generator, type Personal, type Question } from './types';

export const TOLERANCE_OPTIONS = [
  { value: '50', label: '±50 Cent' },
  { value: '30', label: '±30 Cent' },
  { value: '15', label: '±15 Cent' },
];

interface Filters extends FilterValues {
  intervals: string[];
  directions: string[];
  clefs: string[];
  tolerance: string;
}

/**
 * Ausgangstöne: Stammtöne und die üblichen Vorzeichen. Ces, Fes, Eis und His
 * gibt es als Zielton (über cis steht die grosse Terz eis), als Ausgangston
 * wären sie nur eine Lesehürde.
 */
function isPlainStart(pitch: Pitch): boolean {
  if (pitch.alter === 1) return pitch.step !== 'e' && pitch.step !== 'b';
  if (pitch.alter === -1) return pitch.step !== 'c' && pitch.step !== 'f';
  return pitch.alter === 0;
}

function tryTranspose(from: Pitch, interval: Interval, direction: 'up' | 'down'): Pitch | null {
  try {
    return transposeByInterval(from, interval, direction);
  } catch {
    return null;
  }
}

/**
 * Wie weit ein Ton samt Vorzeichen über und unter die Mitte seines
 * Notenkopfs reicht, in Zeicheneinheiten (Linienabstand 10). Daraus ergeben
 * sich die gemessenen Werte von INTERVAL_REACH in shared.ts.
 */
const HEAD = 5;
const SHARP = 13;
const FLAT_ABOVE = 18;

/** Der Schlüssel allein, über und unter dem System (Bravura; Violin gemessen). */
const CLEF_REACH = { treble: { above: 14, below: 16 }, bass: { above: 1, below: 0 } };

/** Oberste und unterste Notenlinie je Schlüssel. */
const STAFF_LINES = {
  treble: { top: diatonicIndex(parsePitch('f5')), bottom: diatonicIndex(parsePitch('e4')) },
  bass: { top: diatonicIndex(parsePitch('a3')), bottom: diatonicIndex(parsePitch('g2')) },
};

/**
 * Platz über und unter dem System: so viel, wie der äusserste mögliche
 * Ausgangston der Stimmlage in diesem Schlüssel braucht, plus 1 Luft. Fest je
 * Einstellung, damit das System nicht von Aufgabe zu Aufgabe springt.
 */
function referenceSpace(clef: 'treble' | 'bass', starts: Pitch[]): { above: number; below: number } {
  const { top, bottom } = STAFF_LINES[clef];
  let { above, below } = CLEF_REACH[clef];
  for (const pitch of starts) {
    const position = diatonicIndex(pitch);
    const up = pitch.alter < 0 ? FLAT_ABOVE : pitch.alter > 0 ? SHARP : HEAD;
    const down = pitch.alter > 0 ? SHARP : HEAD;
    above = Math.max(above, (position - top) * 5 + up);
    below = Math.max(below, (bottom - position) * 5 + down);
  }
  return { above: above + 1, below: below + 1 };
}

/** Ein Ton als Ganze, ohne Taktangabe — der Ausgangston im System. */
function referenceScore(key: string, clef: 'treble' | 'bass', space: ScoreSpec['space']): ScoreSpec {
  return { clef, width: 110, scale: 1.6, space, measures: [{ notes: [{ keys: [key], duration: 'w' }] }] };
}

export const intervalleSingen: Generator<Filters> = {
  id: 'intervalle-singen',
  topic: 'intervalle',
  group: 'fein',
  skill: 'singen',
  // 2: Vorgabe ohne Prime — alte Aufgabenlinks ohne «intervalle=» ergäben eine andere Aufgabe.
  version: 2,
  title: 'Intervalle singen',
  instruction:
    'Du hörst den Ausgangston. Singe den Ton im verlangten Abstand und halte ihn kurz. ' +
    'Den Ausgangston darfst du vorher nachsingen; die Oktave ist egal.',
  hint: 'Die Linie zeigt, was du singst. Die Stimmlage stellst du unter ⚙ ein.',

  filters: [
    { kind: 'multi', key: 'intervals', label: 'Abgefragte Intervalle', options: INTERVAL_OPTIONS },
    { kind: 'multi', key: 'directions', label: 'Richtung', options: DIRECTION_OPTIONS },
    { kind: 'multi', key: 'clefs', label: 'Schlüssel', options: CLEF_OPTIONS },
    {
      kind: 'single',
      key: 'tolerance',
      label: 'Genauigkeit',
      options: TOLERANCE_OPTIONS,
      hint: 'So weit darf der gesungene Ton danebenliegen.',
    },
  ],

  defaults: {
    intervals: DEFAULT_INTERVALS,
    directions: ['up', 'down'],
    clefs: ['treble'],
    tolerance: '50',
  },

  generate(values, rng: Rng, personal?: Personal): Question {
    const intervals = multi(values, 'intervals', this.defaults.intervals);
    const directions = multi(values, 'directions', this.defaults.directions);
    const clefs = multi(values, 'clefs', this.defaults.clefs);
    const tolerance = Number(single(values, 'tolerance', '50'));
    const voice = personal?.voice ?? DEFAULT_VOICE;
    const range = VOICE_RANGES[voice];

    const label = rng.pick(intervalLabelsFor(rng.pick(intervals)));
    const interval = parseIntervalLabel(label);
    // Bei der Prime gibt es keine Richtung.
    const direction = interval.number === 1 ? 'up' : (rng.pick(directions) as 'up' | 'down');

    const inRange = (pitch: Pitch) => midi(pitch) >= range.low && midi(pitch) <= range.high;
    const plainStarts = candidatePitches(range, [-1, 0, 1]).filter(isPlainStart);
    const starts = plainStarts
      .map((start) => ({ start, target: tryTranspose(start, interval, direction) }))
      .filter(
        (pair): pair is { start: Pitch; target: Pitch } =>
          pair.target !== null && Math.abs(pair.target.alter) <= 1 && inRange(pair.target),
      );
    insist(starts.length > 0, `kein Ausgangston für ${label} ${direction} in ${range.low}–${range.high}`);
    const { start, target } = rng.pick(starts);

    // Unabhängig nachrechnen: der Zielton muss das verlangte Intervall bilden,
    // und zwar in der verlangten Richtung.
    insist(
      intervalLabel(intervalBetween(start, target)) === label &&
        Math.sign(midi(target) - midi(start)) === (interval.number === 1 ? 0 : direction === 'up' ? 1 : -1),
      `${pitchKey(start)}–${pitchKey(target)} ist kein ${label} ${direction}`,
    );

    const id = taskId('is', rng);
    // Der Schlüssel zuletzt: so bleiben Intervall und Ausgangston bei
    // gleichem Startwert dieselben wie vor der Einstellung «Schlüssel».
    const clef = rng.pick(clefs) as 'treble' | 'bass';

    const task: SingTask = {
      id,
      kind: 'sing',
      prompt:
        interval.number === 1
          ? intervalFullName(interval)
          : `${intervalFullName(interval)} ${direction === 'up' ? 'aufwärts' : 'abwärts'}`,
      score: referenceScore(pitchKey(start), clef, referenceSpace(clef, plainStarts)),
      reference: pitchKey(start),
      target: pitchKey(target),
      tolerance,
      points: 2,
    };
    return { task };
  },
};
