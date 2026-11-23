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

import { INTERVAL_OPTIONS } from '../content/options';
import type { ScoreSpec, SingTask } from '../content/schema';
import {
  intervalBetween,
  intervalFullName,
  intervalLabel,
  midi,
  parseIntervalLabel,
  transposeByInterval,
  type Interval,
  type Pitch,
} from '../music/theory';
import { DEFAULT_VOICE, VOICE_RANGES, type Voice } from '../sing/voice';
import type { Rng } from './rng';
import { DIRECTION_OPTIONS, candidatePitches, insist, intervalLabelsFor, pitchKey, taskId } from './shared';
import { multi, single, type FilterValues, type Generator, type Personal, type Question } from './types';

export const TOLERANCE_OPTIONS = [
  { value: '50', label: '±50 Cent (nächster Halbton)' },
  { value: '30', label: '±30 Cent' },
  { value: '15', label: '±15 Cent' },
];

interface Filters extends FilterValues {
  intervals: string[];
  directions: string[];
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
 * Platz über und unter dem System, je Stimmlage: so viel, wie ihr äusserster
 * Ton samt Vorzeichen braucht (gemessen wie INTERVAL_REACH in shared.ts),
 * plus 1 Luft. Fest je Stimmlage, damit das System nicht von Aufgabe zu
 * Aufgabe springt.
 */
const REFERENCE_SPACE: Record<Voice, { above: number; below: number }> = {
  hoch: { above: 24, below: 30 },
  mittel: { above: 24, below: 40 },
  tief: { above: 34, below: 15 },
};

/** Ein Ton als Ganze, ohne Taktangabe — der Ausgangston im System. */
function referenceScore(key: string, voice: Voice): ScoreSpec {
  return {
    clef: VOICE_RANGES[voice].clef,
    width: 110,
    scale: 1.6,
    space: REFERENCE_SPACE[voice],
    measures: [{ notes: [{ keys: [key], duration: 'w' }] }],
  };
}

export const intervalleSingen: Generator<Filters> = {
  id: 'intervalle-singen',
  topic: 'intervalle',
  group: 'fein',
  skill: 'singen',
  version: 1,
  title: 'Intervalle singen',
  instruction:
    'Du hörst den Ausgangston. Singe den Ton im verlangten Abstand und halte ihn kurz. ' +
    'Den Ausgangston darfst du vorher nachsingen; die Oktave ist egal.',
  hint: 'Die Linie zeigt, was du singst. Die Stimmlage stellst du unter ⚙ ein.',

  filters: [
    { kind: 'multi', key: 'intervals', label: 'Abgefragte Intervalle', options: INTERVAL_OPTIONS },
    { kind: 'multi', key: 'directions', label: 'Richtung', options: DIRECTION_OPTIONS },
    {
      kind: 'single',
      key: 'tolerance',
      label: 'Genauigkeit',
      options: TOLERANCE_OPTIONS,
      hint: 'So weit darf der gesungene Ton danebenliegen.',
    },
  ],

  defaults: {
    intervals: INTERVAL_OPTIONS.map((option) => option.value),
    directions: ['up', 'down'],
    tolerance: '50',
  },

  generate(values, rng: Rng, personal?: Personal): Question {
    const intervals = multi(values, 'intervals', this.defaults.intervals);
    const directions = multi(values, 'directions', this.defaults.directions);
    const tolerance = Number(single(values, 'tolerance', '50'));
    const voice = personal?.voice ?? DEFAULT_VOICE;
    const range = VOICE_RANGES[voice];

    const label = rng.pick(intervalLabelsFor(rng.pick(intervals)));
    const interval = parseIntervalLabel(label);
    // Bei der Prime gibt es keine Richtung.
    const direction = interval.number === 1 ? 'up' : (rng.pick(directions) as 'up' | 'down');

    const inRange = (pitch: Pitch) => midi(pitch) >= range.low && midi(pitch) <= range.high;
    const starts = candidatePitches(range, [-1, 0, 1])
      .filter(isPlainStart)
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

    const task: SingTask = {
      id: taskId('is', rng),
      kind: 'sing',
      prompt:
        interval.number === 1
          ? intervalFullName(interval)
          : `${intervalFullName(interval)} ${direction === 'up' ? 'aufwärts' : 'abwärts'}`,
      score: referenceScore(pitchKey(start), voice),
      reference: pitchKey(start),
      target: pitchKey(target),
      tolerance,
      points: 2,
    };
    return { task };
  },
};
