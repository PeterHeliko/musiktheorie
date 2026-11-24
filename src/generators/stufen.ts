/**
 * Stufen bestimmen — welcher Dreiklang steht auf einer Stufe einer Tonart?
 *
 * Steht unter «Tonleitern und Tonarten» (Entscheid 2026-11-24): die Stufen
 * setzen die Tonarten voraus, und die Dreiklänge kommen jetzt davor.
 */

import type { SelectOption } from '../content/schema';
import { CIRCLE_OF_FIFTHS, DIATONIC_TRIAD_QUALITIES, ROMAN_NUMERALS, degreeChordName } from '../music/theory';
import type { Rng } from './rng';
import { degreeTask, insist, taskId } from './shared';
import { multi, type FilterValues, type Generator, type Question } from './types';

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
  topic: 'tonleitern',
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
