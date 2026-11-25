/**
 * Gehörbildung — Tonleitern hörend erkennen.
 *
 * Vorgabe ist ein FESTER Grundton: nur so vergleicht man wirklich die
 * Tonleiterart und nicht die Lage. Wer weiter ist, schaltet auf einen
 * wechselnden Grundton um und muss die Art dann unabhängig von der Tonhöhe
 * erkennen.
 */

import { SCALE_PATTERNS, type ScaleType } from '../content/audio';
import { OPTION_SETS } from '../content/options';
import { MAJOR_MINOR } from '../music/scales';
import { midi, parseIntervalLabel, parsePitch, transposeByInterval } from '../music/theory';
import type { Rng } from './rng';
import {
  candidatePitches,
  insist,
  optionsFrom,
  pitchKey,
  taskId,
} from './shared';
import { multi, range, single, toggle, type FilterValues, type Generator, type Question } from './types';

const LIMITED_PLAYS = 3;

/** Fester Grundton: klein a. */
const FIXED_TONIC = 'a3';

/** Fenster für gewürfelte Grundtöne — die Leiter geht eine Oktave darüber. */
const TONIC_WINDOW = { low: 50, high: 62 };

/**
 * Die Halbtonschritte der vier Tonleiterarten, wie sie im Lehrbuch stehen.
 * Bewusst hier noch einmal ausgeschrieben und nicht aus SCALE_PATTERNS
 * abgeleitet: nur so ist die Kontrolle unten eine echte zweite Meinung.
 */
const SEMITONE_STEPS: Record<ScaleType, number[]> = {
  dur: [2, 2, 1, 2, 2, 2, 1],
  'moll-natuerlich': [2, 1, 2, 2, 1, 2, 2],
  'moll-harmonisch': [2, 1, 2, 2, 1, 3, 1],
  'moll-melodisch': [2, 1, 2, 2, 2, 2, 1],
  dorisch: [2, 1, 2, 2, 2, 1, 2],
  phrygisch: [1, 2, 2, 2, 1, 2, 2],
  lydisch: [2, 2, 2, 1, 2, 2, 1],
  mixolydisch: [2, 2, 1, 2, 2, 1, 2],
  lokrisch: [1, 2, 2, 1, 2, 2, 2],
};

interface Filters extends FilterValues {
  scaleTypes: string[];
  tonic: string;
  directions: string[];
  tempo: number;
  limitPlays: boolean;
}

export const gehoerTonleitern: Generator<Filters> = {
  id: 'tonleitern-hoeren',
  topic: 'tonleitern',
  skill: 'hoeren',
  // 2: melodisch Moll erklingt abwärts natürlich (2026-11-24).
  version: 2,
  title: 'Tonleitern hörend erkennen',
  instruction: 'Eine Tonleiter erklingt. Wähle die richtige Art.',

  filters: [
    {
      kind: 'multi',
      key: 'scaleTypes',
      label: 'Mögliche Tonleitern',
      options: OPTION_SETS.scaleType,
    },
    {
      kind: 'single',
      key: 'tonic',
      label: 'Grundton',
      options: [
        { value: 'fest', label: 'immer a' },
        { value: 'zufaellig', label: 'wechselnd' },
      ],
      hint: 'Ein fester Grundton macht den Vergleich leichter: du hörst dann nur den Unterschied der Art.',
    },
    {
      kind: 'multi',
      key: 'directions',
      label: 'Richtung',
      options: [
        { value: 'up', label: 'aufwärts' },
        { value: 'down', label: 'abwärts' },
      ],
    },
    {
      kind: 'range',
      key: 'tempo',
      label: 'Tempo',
      min: 60,
      max: 160,
      step: 4,
      unit: 'bpm',
      hint: 'Viertel pro Minute; jeder Ton der Tonleiter ist ein Viertel lang.',
    },
    { kind: 'toggle', key: 'limitPlays', label: `Wiedergaben begrenzen (${LIMITED_PLAYS}×)` },
  ],

  defaults: {
    // Die Kirchentonarten stehen zur Wahl, sind aber aus (Entscheid 2026-11-24).
    scaleTypes: MAJOR_MINOR,
    tonic: 'fest',
    directions: ['up'],
    // Etwas zügiger als die 84 der übrigen Hörbeispiele (Entscheid 2026-11-24).
    tempo: 96,
    limitPlays: false,
  },

  generate(values, rng: Rng): Question {
    const scaleTypes = multi(values, 'scaleTypes', this.defaults.scaleTypes);
    const tonicMode = single(values, 'tonic', 'fest');
    const directions = multi(values, 'directions', this.defaults.directions);
    const limitPlays = toggle(values, 'limitPlays', false);

    const scale = rng.pick(scaleTypes) as ScaleType;
    // Nur Stammtöne und einfache Vorzeichen als Grundton: eine Tonleiter über
    // «ceses» wäre klanglich dasselbe wie über h und notationsfeindlich.
    const tonic =
      tonicMode === 'fest'
        ? FIXED_TONIC
        : pitchKey(rng.pick(candidatePitches(TONIC_WINDOW, [-1, 0, 1])));
    const direction = rng.pick(directions) as 'up' | 'down';

    // Nachrechnen, und zwar unabhängig: die Halbtonschritte der gebauten
    // Leiter müssen dem Lehrbuchmuster entsprechen. Ein Tippfehler in
    // SCALE_PATTERNS fiele sonst erst beim Hören auf — und dort würde man ihn
    // eher sich selbst als der Software zuschreiben.
    const root = parsePitch(tonic);
    const steps = SCALE_PATTERNS[scale]
      .map((label) => transposeByInterval(root, parseIntervalLabel(label)))
      .map((pitch, index, all) => (index === 0 ? 0 : midi(pitch) - midi(all[index - 1])))
      .slice(1);
    insist(
      steps.join(' ') === SEMITONE_STEPS[scale].join(' '),
      `${scale} ergibt die Schritte ${steps.join(' ')}, erwartet ${SEMITONE_STEPS[scale].join(' ')}`,
    );

    // Abwärts ist melodisch Moll natürlich (music/scales.ts): die beiden
    // klingen dann gleich, und beide Antworten sind richtig.
    const twin =
      direction === 'down' && (scale === 'moll-natuerlich' || scale === 'moll-melodisch')
        ? scale === 'moll-natuerlich'
          ? 'moll-melodisch'
          : 'moll-natuerlich'
        : null;
    const alsoCorrect = twin && scaleTypes.includes(twin) ? [twin] : undefined;

    const id = taskId('gt', rng);
    return {
      task: {
        id,
        kind: 'select',
        fields: [
          {
            id: 'a',
            options: optionsFrom('scaleType', scaleTypes),
            correct: scale,
            ...(alsoCorrect ? { alsoCorrect } : {}),
            points: 1,
            buttons: true,
          },
        ],
      },
      audio: { id, kind: 'scale', tonic, scale, direction, tempo: Math.round(range(values, 'tempo', 96)) },
      instruction:
        direction === 'up'
          ? 'Eine Tonleiter erklingt aufwärts. Wähle die richtige Art.'
          : 'Eine Tonleiter erklingt abwärts. Wähle die richtige Art.',
      maxPlays: limitPlays ? LIMITED_PLAYS : undefined,
    };
  },
};
