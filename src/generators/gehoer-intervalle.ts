/**
 * Gehörbildung — Intervalle hörend erkennen.
 *
 * Der Grundton wird jedes Mal neu gewürfelt: über einem festen Grundton lernt
 * man sonst die absolute Tonhöhe auswendig statt den Abstand zu hören. Wer
 * gerade anfängt, kann das über den Filter «immer über c¹» abschalten.
 */

import { INTERVAL_OPTIONS, intervalAnswer } from '../content/options';
import {
  intervalBetween,
  intervalLabel,
  parseIntervalLabel,
  parsePitch,
  transposeByInterval,
  type Pitch,
} from '../music/theory';
import type { Rng } from './rng';
import {
  heardInterval,
  insist,
  intervalLabelsFor,
  pickIntervalPair,
  pitchKey,
  taskId,
  windowFor,
} from './shared';
import { multi, single, toggle, type FilterValues, type Generator, type Question } from './types';

/** Wie oft darf ein Beispiel laufen, wenn das Limit eingeschaltet ist? */
const LIMITED_PLAYS = 3;

/** Tonpaar über einem vorgegebenen tiefen Ton. */
function intervalFrom(low: Pitch, label: string): { low: Pitch; high: Pitch; label: string } {
  return { low, high: transposeByInterval(low, parseIntervalLabel(label)), label };
}

interface Filters extends FilterValues {
  intervals: string[];
  directions: string[];
  playback: string;
  width: string;
  fixedRoot: boolean;
  limitPlays: boolean;
}

export const gehoerIntervalle: Generator<Filters> = {
  id: 'intervalle-hoeren',
  topic: 'intervalle',
  skill: 'hoeren',
  version: 1,
  title: 'Intervalle hörend erkennen',
  instruction:
    'Du hörst das Intervall zuerst nacheinander, dann gleichzeitig. Wähle die richtige Bezeichnung.',

  filters: [
    {
      kind: 'multi',
      key: 'intervals',
      label: 'Welche Intervalle?',
      options: INTERVAL_OPTIONS,
      hint: 'Verminderte Quinte und übermässige Quarte klingen gleich und laufen deshalb gemeinsam unter «Tritonus».',
    },
    { kind: 'multi', key: 'directions', label: 'Richtung', options: [
      { value: 'up', label: 'aufwärts' },
      { value: 'down', label: 'abwärts' },
    ] },
    {
      kind: 'single',
      key: 'playback',
      label: 'Wiedergabe',
      options: [
        { value: 'beides', label: 'nacheinander, dann zusammen' },
        { value: 'zusammen', label: 'nur zusammen' },
      ],
    },
    {
      kind: 'single',
      key: 'width',
      label: 'Tonhöhenbereich',
      options: [
        { value: 'eng', label: 'mittlere Lage' },
        { value: 'weit', label: 'weiter Bereich' },
      ],
    },
    {
      kind: 'toggle',
      key: 'fixedRoot',
      label: 'Immer über c¹',
      hint: 'Erleichtert den Einstieg — dafür lässt sich nach absoluter Tonhöhe raten.',
    },
    { kind: 'toggle', key: 'limitPlays', label: `Wiedergaben begrenzen (${LIMITED_PLAYS}×)` },
  ],

  defaults: {
    intervals: INTERVAL_OPTIONS.map((option) => option.value),
    directions: ['up', 'down'],
    playback: 'beides',
    width: 'eng',
    fixedRoot: false,
    limitPlays: false,
  },

  generate(values, rng: Rng): Question {
    const intervals = multi(values, 'intervals', this.defaults.intervals);
    const directions = multi(values, 'directions', this.defaults.directions);
    const playback = single(values, 'playback', 'beides');
    const width = single(values, 'width', 'eng');
    const fixedRoot = toggle(values, 'fixedRoot', false);
    const limitPlays = toggle(values, 'limitPlays', false);

    const wanted = rng.pick(intervals);
    const window = windowFor('hoeren', width);

    // Bei festem Grundton steht der tiefe Ton fest; sonst wird er im erlaubten
    // Fenster gesucht. Die Schreibweise ist beim Hören unsichtbar, muss aber
    // notierbar sein, damit der Theoriekern den Zielton bilden kann.
    const pair = fixedRoot
      ? intervalFrom(parsePitch('c4'), rng.pick(intervalLabelsFor(wanted)))
      : pickIntervalPair(rng, wanted, window, 'einfach');

    const melodic = playback !== 'zusammen';
    const direction = melodic ? (rng.pick(directions) as 'up' | 'down') : 'up';

    // Unabhängig nachrechnen: der Theoriekern muss dasselbe Intervall sehen,
    // das als Antwort hinterlegt wird.
    const measured = intervalLabel(intervalBetween(pair.low, pair.high));
    insist(
      intervalAnswer(measured) === intervalAnswer(pair.label),
      `${pitchKey(pair.low)}–${pitchKey(pair.high)} ist ${measured}, erwartet war ${pair.label}`,
    );

    const id = taskId('gi', rng);
    return {
      task: heardInterval(id, pair.label, intervals),
      audio: {
        id,
        kind: 'interval',
        from: pitchKey(pair.low),
        interval: pair.label,
        direction,
        melodic,
      },
      instruction: melodic
        ? 'Du hörst das Intervall zuerst nacheinander, dann gleichzeitig. Wähle die richtige Bezeichnung.'
        : 'Du hörst das Intervall als Zusammenklang. Wähle die richtige Bezeichnung.',
      maxPlays: limitPlays ? LIMITED_PLAYS : undefined,
    };
  },
};
