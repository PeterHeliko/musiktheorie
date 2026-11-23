/**
 * Frequenz → nächster Ton und Abweichung in Cent, mit deutschem Namen.
 *
 * Gleichstufige Stimmung: jeder Halbton ist der Faktor 2^(1/12), ein Cent ein
 * Hundertstel davon. Der Kammerton ist einstellbar, weil manche Chöre und
 * Orchester auf 442 oder 443 Hz stimmen.
 */

import { toGermanPitch, type Pitch, type Step } from '../music/theory';

export const DEFAULT_A4 = 440;

export interface NearestNote {
  midi: number;
  /** Abweichung vom nächsten Ton, −50 … +50 Cent. Positiv = zu hoch. */
  cents: number;
  /** Deutsche Bezeichnung mit Oktave, z.B. «a1», «fis», «B». */
  name: string;
}

/** Frequenz → MIDI-Nummer mit Nachkommastellen (69 = a¹). */
export function midiFromFrequency(frequency: number, a4 = DEFAULT_A4): number {
  return 69 + 12 * Math.log2(frequency / a4);
}

export function frequencyFromMidi(midi: number, a4 = DEFAULT_A4): number {
  return a4 * 2 ** ((midi - 69) / 12);
}

/**
 * Schreibweise der schwarzen Tasten, wenn nur die Tonhöhe bekannt ist: so, wie
 * man sie im Unterricht am häufigsten liest — Cis, Es, Fis, As, B.
 */
const SPELLING: [Step, number][] = [
  ['c', 0],
  ['c', 1],
  ['d', 0],
  ['e', -1],
  ['e', 0],
  ['f', 0],
  ['f', 1],
  ['g', 0],
  ['a', -1],
  ['a', 0],
  ['b', -1],
  ['b', 0],
];

export function pitchFromMidi(midi: number): Pitch {
  const pitchClass = ((midi % 12) + 12) % 12;
  const [step, alter] = SPELLING[pitchClass];
  // Oktave des Stammtons: Ces/His würden über die Grenze rutschen, kommen
  // hier aber nicht vor.
  return { step, alter, octave: Math.floor(midi / 12) - 1 };
}

export function nameFromMidi(midi: number): string {
  return toGermanPitch(pitchFromMidi(midi));
}

export function nearestNote(frequency: number, a4 = DEFAULT_A4): NearestNote {
  const exact = midiFromFrequency(frequency, a4);
  const midi = Math.round(exact);
  return { midi, cents: Math.round((exact - midi) * 100), name: nameFromMidi(midi) };
}
