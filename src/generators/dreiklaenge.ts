/**
 * Dreiklänge — bestimmen und aus der Tonart herleiten.
 *
 *  - `dreiklaenge-bestimmen`: Grundton, Geschlecht, Umkehrung und Lage eines
 *    notierten Dreiklangs.
 *  - `dreiklaenge-stufen`: welcher Dreiklang steht auf einer Stufe einer
 *    Tonart?
 *
 * Beim Bestimmen lassen sich einzelne Felder weglassen. Wer nur Umkehrungen
 * üben will, beantwortet nur die Umkehrung, statt jedes Mal vier Felder
 * auszufüllen — das ist der Unterschied zwischen Üben und Abgefragtwerden.
 */

import { invertTriad } from '../content/audio';
import { OPTION_SETS } from '../content/options';
import type { ScoreSpec, SelectField, SelectOption } from '../content/schema';
import {
  CIRCLE_OF_FIFTHS,
  DIATONIC_TRIAD_QUALITIES,
  INVERSION_LABELS,
  POSITION_LABELS,
  ROMAN_NUMERALS,
  analyseTriad,
  buildTriad,
  degreeChordName,
  germanNoteName,
  midi,
  transposeByInterval,
  type Inversion,
  type Pitch,
  type Position,
  type TriadQuality,
} from '../music/theory';
import type { Rng } from './rng';
import {
  candidatePitches,
  degreeTask,
  insist,
  noteName,
  optionsFrom,
  pitchKey,
  taskId,
  triadNaming,
} from './shared';
import { multi, single, type FilterValues, type Generator, type Question } from './types';

/** Die sieben Stammtöne, so wie sie in der Grundton-Auswahl heissen. */
const NATURAL_NOTE_NAMES = ['C', 'D', 'E', 'F', 'G', 'A', 'H'];

// ---------------------------------------------------------------------------
// Dreiklänge bestimmen
// ---------------------------------------------------------------------------

/** Fenster für den Grundton; die Umkehrungen liegen bis zu einer Oktave höher. */
const ROOT_WINDOW = { low: 55, high: 67 };

/**
 * Welche Umkehrung des Terzschichtungs-Stapels hat welches Akkordglied oben?
 * Grundstellung [1 3 5] endet auf der Quinte, der Sextakkord [3 5 1'] auf dem
 * Grundton, der Quartsextakkord [5 1' 3'] auf der Terz.
 */
const STACK_FOR_POSITION: Record<Position, Inversion> = {
  quintlage: 'grundstellung',
  oktavlage: 'sextakkord',
  terzlage: 'quartsextakkord',
};

const SYSTEM_OPTIONS: SelectOption[] = [
  { value: 'grand', label: 'Klaviersystem' },
  { value: 'treble', label: 'Violinschlüssel' },
  { value: 'bass', label: 'Bassschlüssel' },
];

const ASK_OPTIONS: SelectOption[] = [
  { value: 'root', label: 'Grundton' },
  { value: 'quality', label: 'Geschlecht' },
  { value: 'inv', label: 'Umkehrung' },
  { value: 'pos', label: 'Lage' },
];

interface NamingFilters extends FilterValues {
  qualities: string[];
  inversions: string[];
  positions: string[];
  system: string;
  accidentals: string;
  ask: string[];
}

export const dreiklaengeBestimmen: Generator<NamingFilters> = {
  id: 'dreiklaenge-bestimmen',
  topic: 'dreiklaenge',
  skill: 'erkennen',
  version: 1,
  title: 'Dreiklänge bestimmen',
  instruction: 'Bestimme den Dreiklang.',

  filters: [
    { kind: 'multi', key: 'qualities', label: 'Geschlechter', options: OPTION_SETS.triadQuality },
    { kind: 'multi', key: 'inversions', label: 'Umkehrungen', options: OPTION_SETS.inversion },
    {
      kind: 'multi',
      key: 'positions',
      label: 'Lagen',
      options: OPTION_SETS.position,
      hint: 'Wirkt nur im Klaviersystem. Auf einem System allein folgt die Lage zwingend aus der Umkehrung.',
    },
    { kind: 'single', key: 'system', label: 'Notation', options: SYSTEM_OPTIONS },
    {
      kind: 'single',
      key: 'accidentals',
      label: 'Grundtöne',
      options: [
        { value: 'stammton', label: 'nur Stammtöne' },
        { value: 'einfach', label: 'auch mit Vorzeichen' },
      ],
    },
    {
      kind: 'multi',
      key: 'ask',
      label: 'Gefragt ist',
      options: ASK_OPTIONS,
      hint: 'Einzeln abgefragt lässt sich gezielt üben, was noch wackelt.',
    },
  ],

  defaults: {
    qualities: ['dur', 'moll'],
    inversions: ['grundstellung', 'sextakkord', 'quartsextakkord'],
    positions: ['oktavlage', 'terzlage', 'quintlage'],
    system: 'grand',
    accidentals: 'stammton',
    ask: ['root', 'quality', 'inv', 'pos'],
  },

  generate(values, rng: Rng): Question {
    const qualities = multi(values, 'qualities', this.defaults.qualities);
    const inversions = multi(values, 'inversions', this.defaults.inversions);
    const positions = multi(values, 'positions', this.defaults.positions);
    const system = single(values, 'system', 'grand') as 'grand' | 'treble' | 'bass';
    const policy = single(values, 'accidentals', 'stammton');
    const ask = multi(values, 'ask', this.defaults.ask);

    const quality = rng.pick(qualities) as TriadQuality;
    const inversion = rng.pick(inversions) as Inversion;
    const root = rng.pick(candidatePitches(ROOT_WINDOW, policy === 'stammton' ? [0] : [-1, 0, 1]));
    const tones = buildTriad(root, quality);

    // Auf einem System allein bilden drei Töne genau eine Umkehrung, und die
    // Lage ergibt sich daraus. Nur das Klaviersystem trennt beides: der
    // Basston bestimmt die Umkehrung, der oberste Ton die Lage.
    const position: Position =
      system === 'grand'
        ? (rng.pick(positions) as Position)
        : ({ grundstellung: 'quintlage', sextakkord: 'oktavlage', quartsextakkord: 'terzlage' } as const)[
            inversion
          ];

    const stack = invertTriad(tones, system === 'grand' ? STACK_FOR_POSITION[position] : inversion);
    const bass = system === 'grand' ? bassNoteFor(tones, inversion, stack) : null;
    const all = bass ? [bass, ...stack] : stack;

    // Unabhängig nachrechnen: der Theoriekern muss im Notenbild genau den
    // Akkord sehen, der als Antwort hinterlegt wird — Grundton, Geschlecht,
    // Umkehrung und Lage.
    const analysis = analyseTriad(all);
    const shown = all.map(pitchKey).join(' ');
    insist(analysis !== null, `${shown} ist kein Dreiklang`);
    insist(analysis!.quality === quality, `${shown} ist ${analysis!.quality}, nicht ${quality}`);
    insist(analysis!.inversion === inversion, `${shown} ist ${analysis!.inversion}, nicht ${inversion}`);
    insist(analysis!.position === position, `${shown} steht in ${analysis!.position}, nicht ${position}`);
    insist(
      noteName(analysis!.root) === noteName(root),
      `${shown} hat den Grundton ${noteName(analysis!.root)}, nicht ${noteName(root)}`,
    );

    const score: ScoreSpec =
      system === 'grand'
        ? {
            clef: 'grand',
            width: 190,
            measures: [
              {
                notes: [{ keys: stack.map(pitchKey), duration: 'w' }],
                bass: [{ keys: [pitchKey(bass!)], duration: 'w' }],
              },
            ],
          }
        : {
            clef: system,
            width: 160,
            measures: [{ notes: [{ keys: stack.map(pitchKey), duration: 'w' }] }],
          };

    const available: Record<string, SelectField> = {
      root: {
        id: 'root',
        label: 'Grundton',
        // «nur Stammtöne»: auch nur Stammtöne zur Auswahl.
        options: OPTION_SETS.rootNote.filter(
          (option) => policy !== 'stammton' || NATURAL_NOTE_NAMES.includes(option.value),
        ),
        correct: noteName(root),
        points: 1,
      },
      quality: { id: 'quality', label: 'Geschlecht', options: optionsFrom('triadQuality', qualities), correct: quality, points: 1 },
      inv: { id: 'inv', label: 'Umkehrung', options: optionsFrom('inversion', inversions), correct: inversion, points: 1 },
      pos: { id: 'pos', label: 'Lage', options: optionsFrom('position', positions), correct: position, points: 1 },
    };
    const fields = ASK_OPTIONS.filter((option) => ask.includes(option.value)).map(
      (option) => available[option.value],
    );

    return {
      task: triadNaming(taskId('db', rng), score, fields),
      instruction:
        fields.length === 1
          ? `Bestimme die ${fields[0].label} des Dreiklangs.`
          : `Bestimme den Dreiklang nach ${fields.map((f) => f.label).join(', ')}.`,
    };
  },
};

/**
 * Der Basston des Klaviersystems: das Akkordglied der Umkehrung, so tief
 * gelegt, dass es sicher unter dem Stapel liegt. Erst dadurch ist die
 * Umkehrung überhaupt ablesbar — sie hängt am tiefsten Ton.
 */
function bassNoteFor(tones: Pitch[], inversion: Inversion, stack: Pitch[]): Pitch {
  const member = inversion === 'grundstellung' ? 0 : inversion === 'sextakkord' ? 1 : 2;
  let bass = tones[member];
  const lowest = Math.min(...stack.map(midi));
  // Mindestens eine Terz Abstand, damit der Basston nicht mit dem Stapel
  // verschmilzt und im Bassschlüssel gut liegt.
  while (midi(bass) > lowest - 3) {
    bass = transposeByInterval(bass, { quality: 'r', number: 8 }, 'down');
  }
  return bass;
}

// ---------------------------------------------------------------------------
// Stufen bestimmen
// ---------------------------------------------------------------------------

/** Die drei Hauptfunktionen und ihre Stufen. */
const FUNCTIONS: { name: string; degree: number }[] = [
  { name: 'Tonika', degree: 1 },
  { name: 'Subdominante', degree: 4 },
  { name: 'Dominante', degree: 5 },
];

const WORDING_OPTIONS: SelectOption[] = [
  { value: 'stufe', label: 'römische Stufe' },
  { value: 'funktion', label: 'Funktionsname' },
];

const DEGREE_OPTIONS: SelectOption[] = ROMAN_NUMERALS.map((numeral, index) => ({
  value: String(index + 1),
  label: `${numeral} (${DIATONIC_TRIAD_QUALITIES[index]})`,
}));

interface DegreeFilters extends FilterValues {
  keys: string[];
  degrees: string[];
  wording: string[];
}

export const dreiklaengeStufen: Generator<DegreeFilters> = {
  id: 'stufen-bestimmen',
  topic: 'dreiklaenge',
  skill: 'erkennen',
  version: 1,
  title: 'Stufen bestimmen',
  instruction: 'Welcher Dreiklang ist gemeint? Gib Grundton und Geschlecht an.',

  filters: [
    {
      kind: 'multi',
      key: 'keys',
      label: 'Tonarten',
      options: CIRCLE_OF_FIFTHS.filter((key) => Math.abs(key.accidentals) <= 4).map((key) => ({
        value: key.major,
        label: key.major,
      })),
    },
    { kind: 'multi', key: 'degrees', label: 'Stufen', options: DEGREE_OPTIONS },
    {
      kind: 'multi',
      key: 'wording',
      label: 'Frageform',
      options: WORDING_OPTIONS,
      hint: 'Funktionsnamen gibt es nur für die I., IV. und V. Stufe.',
    },
  ],

  defaults: {
    keys: ['C-Dur', 'G-Dur', 'F-Dur', 'D-Dur', 'B-Dur'],
    degrees: ['1', '2', '4', '5', '6'],
    wording: ['stufe', 'funktion'],
  },

  generate(values, rng: Rng): Question {
    const keys = multi(values, 'keys', this.defaults.keys);
    const degrees = multi(values, 'degrees', this.defaults.degrees).map(Number);
    const wording = multi(values, 'wording', this.defaults.wording);

    const keyName = rng.pick(keys);
    const degree = rng.pick(degrees);

    // Der Funktionsname existiert nur für drei Stufen; sonst bleibt die
    // römische Ziffer, auch wenn der Filter beides erlaubt.
    const asFunction = FUNCTIONS.find((f) => f.degree === degree);
    const useFunction = Boolean(asFunction) && wording.includes('funktion') &&
      (!wording.includes('stufe') || rng.chance(0.5));

    const prompt = useFunction
      ? `Die ${asFunction!.name} von ${keyName}`
      : `Die ${ROMAN_NUMERALS[degree - 1]}. Stufe von ${keyName}`;

    const full = degreeChordName(keyName, degree);
    const [rootName, gender] = full.split('-');

    // Unabhängig nachrechnen: das Geschlecht muss zur Stufe passen, wie es der
    // Quintenzirkel vorgibt (I, IV, V Dur; II, III, VI moll; VII vermindert).
    const expected = DIATONIC_TRIAD_QUALITIES[degree - 1];
    insist(
      gender.toLowerCase() === expected,
      `Die ${degree}. Stufe von ${keyName} ist ${gender}, erwartet war ${expected}`,
    );

    return {
      task: degreeTask(taskId('ds', rng), prompt, rootName, gender.toLowerCase()),
      instruction: 'Welcher Dreiklang ist gemeint? Gib Grundton und Geschlecht an, z.B. «E-Dur».',
    };
  },
};

export { germanNoteName, INVERSION_LABELS, POSITION_LABELS };
