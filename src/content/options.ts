/* Herkunft: musiktheorie-scorm/src/content/options.ts (Stand 2026-08-21), über das Projekt «training».
   Wird hier eigenständig weitergeführt; es gibt keinen Abgleich mit dem Original mehr. */
/**
 * Wiederverwendbare Optionslisten für Auswahlfelder.
 *
 * Wo möglich aus dem Theoriekern abgeleitet, damit Schreibweisen nicht an
 * zwei Orten gepflegt werden müssen.
 */

import {
  CIRCLE_OF_FIFTHS,
  DIATONIC_TRIAD_QUALITIES,
  INVERSION_LABELS,
  POSITION_LABELS,
  ROMAN_NUMERALS,
  STEPS,
  TRIAD_LABELS,
  germanNoteName,
  type Step,
} from '../music/theory';
import type { SelectOption } from './schema';

const opt = (value: string, label = value): SelectOption => ({ value, label });

/**
 * Antwortmöglichkeiten für Intervalle — ausgeschrieben, weil Kürzel wie «ü4»
 * beim Einstufungstest zusätzliche Hürden aufbauen, die nichts mit dem Gehör
 * zu tun haben.
 *
 * Verminderte Quinte und übermässige Quarte sind zu «Tritonus» zusammengefasst:
 * sie klingen gleich, und im Notenbild wird die Unterscheidung hier nicht
 * geprüft. `intervalAnswer()` bildet beide Kürzel auf diesen Wert ab.
 */
export const INTERVAL_OPTIONS: SelectOption[] = [
  { value: 'r1', label: 'reine Prime' },
  { value: 'k2', label: 'kleine Sekunde' },
  { value: 'g2', label: 'grosse Sekunde' },
  { value: 'k3', label: 'kleine Terz' },
  { value: 'g3', label: 'grosse Terz' },
  { value: 'r4', label: 'reine Quarte' },
  { value: 'tritonus', label: 'Tritonus' },
  { value: 'r5', label: 'reine Quinte' },
  { value: 'k6', label: 'kleine Sexte' },
  { value: 'g6', label: 'grosse Sexte' },
  { value: 'k7', label: 'kleine Septime' },
  { value: 'g7', label: 'grosse Septime' },
  { value: 'r8', label: 'reine Oktave' },
];

/**
 * Antwortmöglichkeiten der Grobbestimmung: nur die Grösse, ohne «klein»,
 * «gross» oder «rein». Ausgeschriebene Werte statt Ziffern, damit der Link
 * lesbar bleibt (`?intervalle=terz,quinte`). Reihenfolge = Ordnungszahl.
 */
export const INTERVAL_SIZE_OPTIONS: SelectOption[] = [
  { value: 'prime', label: 'Prime' },
  { value: 'sekunde', label: 'Sekunde' },
  { value: 'terz', label: 'Terz' },
  { value: 'quarte', label: 'Quarte' },
  { value: 'quinte', label: 'Quinte' },
  { value: 'sexte', label: 'Sexte' },
  { value: 'septime', label: 'Septime' },
  { value: 'oktave', label: 'Oktave' },
];

/**
 * Vorgaben der Intervallübungen: alle Intervalle ausser der Prime
 * (Entscheid 2026-11-23). In den Einstellungen bleibt sie wählbar.
 */
export const DEFAULT_INTERVALS: string[] = INTERVAL_OPTIONS.map((option) => option.value).filter(
  (value) => value !== 'r1',
);
export const DEFAULT_INTERVAL_SIZES: string[] = INTERVAL_SIZE_OPTIONS.map((option) => option.value).filter(
  (value) => value !== 'prime',
);

/** Ordnungszahl (1–8) → Antwortwert der Grobbestimmung. */
export function intervalSizeAnswer(number: number): string {
  const option = INTERVAL_SIZE_OPTIONS[number - 1];
  if (!option) throw new Error(`Keine Intervallgrösse: Ordnungszahl ${number}`);
  return option.value;
}

/** Antwortwert der Grobbestimmung → Ordnungszahl (1–8). */
export function intervalSizeNumber(value: string): number {
  const index = INTERVAL_SIZE_OPTIONS.findIndex((option) => option.value === value);
  if (index < 0) throw new Error(`Unbekannte Intervallgrösse: «${value}»`);
  return index + 1;
}

/**
 * Wandelt ein Intervallkürzel in den zugehörigen Antwortwert um.
 * «ü4» und «v5» werden beide zu «tritonus».
 */
export function intervalAnswer(label: string): string {
  return label === 'ü4' || label === 'v5' ? 'tritonus' : label;
}

/** Grundtöne für die Dreiklangsbestimmung: Stammtöne mit b und Kreuz. */
function rootNoteOptions(): SelectOption[] {
  const names: string[] = [];
  for (const step of STEPS as Step[]) {
    for (const alter of [-1, 0, 1]) {
      const name = germanNoteName(step, alter);
      if (!names.includes(name)) names.push(name);
    }
  }
  // Nach Stammton gruppiert lesbarer als alphabetisch.
  return names.map((n) => opt(n));
}

/** Alle Dur- und Molldreiklangsnamen für die Stufenaufgabe. */
function chordNameOptions(): SelectOption[] {
  const out: SelectOption[] = [];
  for (const step of STEPS as Step[]) {
    for (const alter of [-1, 0, 1]) {
      const name = germanNoteName(step, alter);
      out.push(opt(`${name}-Dur`));
    }
  }
  for (const step of STEPS as Step[]) {
    for (const alter of [-1, 0, 1]) {
      const name = germanNoteName(step, alter);
      out.push(opt(`${name}-Moll`));
    }
  }
  return out;
}

export const OPTION_SETS: Record<string, SelectOption[]> = {
  /** Ausgeschriebene Intervallbezeichnung als Knopfraster. */
  interval: INTERVAL_OPTIONS,

  /** Nur die Intervallgrösse (Grobbestimmung). */
  intervalSize: INTERVAL_SIZE_OPTIONS,

  scaleType: [
    opt('dur', 'Dur'),
    opt('moll-natuerlich', 'moll natürlich'),
    opt('moll-harmonisch', 'moll harmonisch'),
    opt('moll-melodisch', 'moll melodisch'),
  ],

  triadQuality: (Object.keys(TRIAD_LABELS) as (keyof typeof TRIAD_LABELS)[]).map((q) =>
    opt(q, TRIAD_LABELS[q]),
  ),

  inversion: (Object.keys(INVERSION_LABELS) as (keyof typeof INVERSION_LABELS)[]).map((i) =>
    opt(i, INVERSION_LABELS[i]),
  ),

  position: (Object.keys(POSITION_LABELS) as (keyof typeof POSITION_LABELS)[]).map((p) =>
    opt(p, POSITION_LABELS[p]),
  ),

  rootNote: rootNoteOptions(),
  chordName: chordNameOptions(),

  majorKey: CIRCLE_OF_FIFTHS.map((k) => opt(k.major)),
  minorKey: CIRCLE_OF_FIFTHS.map((k) => opt(k.minor)),

  /** Buchstaben für Zuordnungsaufgaben mit Legende. */
  letterAD: ['A', 'B', 'C', 'D'].map((l) => opt(l)),
  letterEH: ['E', 'F', 'G', 'H'].map((l) => opt(l)),

  /** Stufe samt Geschlecht in einem Feld — ein Klick statt zwei. */
  diatonicDegree: ROMAN_NUMERALS.map((numeral, i) =>
    opt(`${numeral}-${DIATONIC_TRIAD_QUALITIES[i]}`, `${numeral} (${TRIAD_LABELS[DIATONIC_TRIAD_QUALITIES[i]]})`),
  ),

  noteValue: [
    opt('w', 'Ganze'),
    opt('h', 'Halbe'),
    opt('q', 'Viertel'),
    opt('q.', 'punktierte Viertel'),
    opt('8', 'Achtel'),
    opt('16', 'Sechzehntel'),
  ],
};

export function resolveOptions(field: { optionSet?: string; options?: SelectOption[] }): SelectOption[] {
  if (field.options) return field.options;
  if (field.optionSet) {
    const set = OPTION_SETS[field.optionSet];
    if (!set) throw new Error(`Unbekannte Optionsliste: «${field.optionSet}»`);
    return set;
  }
  throw new Error('Auswahlfeld ohne Optionen');
}
