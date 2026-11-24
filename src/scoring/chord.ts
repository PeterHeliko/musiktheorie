/**
 * Frei gesetzte oder gespielte Akkorde bewerten (`ChordRule`).
 *
 * Richtig ist ein Akkord, wenn alle Akkordtöne da sind, kein anderer Ton, und
 * — wo verlangt — der tiefste und der höchste Ton die richtigen Akkordglieder
 * sind. Lage und Verdopplungen sind frei (Entscheid 2026-11-24).
 *
 * Dieselbe Regel für Tasten und Noten; verschieden ist nur, was als derselbe
 * Ton gilt: auf der Klaviatur die Taste in jeder Oktave, im Notenbild die
 * Schreibweise in jeder Oktave.
 *
 * Ausgelagert, damit Klaviatur und Noteneingabe nach dem Prüfen genau so
 * einfärben, wie hier bewertet wird.
 */

import type { ChordRule } from '../content/schema';
import { keyNames } from '../music/piano';
import { germanNoteName, midi, parsePitch, toGermanPitch, type Pitch } from '../music/theory';

/** Was an einem Akkord nicht stimmt. Leer = richtig. */
export type ChordProblem = 'missing' | 'foreign' | 'lowest' | 'highest';

export interface ChordJudgement {
  correct: boolean;
  problems: ChordProblem[];
  /**
   * Je gegebenem Ton, in der gegebenen Reihenfolge: richtig, oder falsch —
   * weil er nicht zum Akkord gehört oder als tiefster bzw. höchster Ton das
   * falsche Akkordglied ist.
   */
  marks: ('right' | 'wrong')[];
}

function judge<T>(rule: ChordRule, given: readonly T[], member: (tone: T) => number, height: (tone: T) => number) {
  const problems: ChordProblem[] = [];
  const members = given.map(member);
  if (members.some((index) => index < 0)) problems.push('foreign');
  if (rule.tones.some((_, index) => !members.includes(index))) problems.push('missing');

  // Tiefster und höchster Ton; bei gleicher Höhe zählt der zuerst gegebene.
  const order = given.map((_, index) => index).sort((a, b) => height(given[a]) - height(given[b]));
  const lowest = order[0];
  const highest = order[order.length - 1];
  const lowWrong = rule.lowest !== undefined && given.length > 0 && members[lowest] !== rule.lowest;
  const highWrong = rule.highest !== undefined && given.length > 0 && members[highest] !== rule.highest;
  if (lowWrong) problems.push('lowest');
  if (highWrong) problems.push('highest');

  const marks = given.map((_, index): 'right' | 'wrong' =>
    members[index] < 0 || (lowWrong && index === lowest) || (highWrong && index === highest) ? 'wrong' : 'right',
  );
  return { correct: given.length > 0 && problems.length === 0, problems, marks };
}

function pitchClass(value: number): number {
  return ((value % 12) + 12) % 12;
}

/** Gespielte Tasten (MIDI) gegen die Regel. */
export function judgeChordKeys(rule: ChordRule, keys: readonly number[]): ChordJudgement {
  const classes = rule.tones.map((tone) => pitchClass(midi(parsePitch(tone))));
  return judge(rule, keys, (key) => classes.indexOf(pitchClass(key)), (key) => key);
}

/** Gesetzte Noten gegen die Regel: hier zählt die Schreibweise. */
export function judgeChordNotes(rule: ChordRule, notes: readonly Pitch[]): ChordJudgement {
  const tones = rule.tones.map(parsePitch);
  return judge(
    rule,
    notes,
    (note) => tones.findIndex((tone) => tone.step === note.step && tone.alter === note.alter),
    (note) => midi(note),
  );
}

/** Name eines Akkordtons ohne Oktave: «fis». */
function toneName(tone: string): string {
  const pitch = parsePitch(tone);
  return germanNoteName(pitch.step, pitch.alter).toLowerCase();
}

/** Die Regel in Worten: «d fis a, unten fis, oben d». */
export function describeChordRule(rule: ChordRule): string {
  const parts = [rule.tones.map(toneName).join(' ')];
  if (rule.lowest !== undefined) parts.push(`unten ${toneName(rule.tones[rule.lowest])}`);
  if (rule.highest !== undefined) parts.push(`oben ${toneName(rule.tones[rule.highest])}`);
  return parts.join(', ');
}

/** Gespielte Tasten in Worten, von unten nach oben: «fis/ges a d». */
export function describeKeys(keys: readonly number[]): string {
  return keys.length ? [...keys].sort((a, b) => a - b).map((key) => keyNames(key).join('/')).join(' ') : '—';
}

/** Gesetzte Noten in Worten, von unten nach oben: «fis1 a1 d2». */
export function describeNotes(notes: readonly Pitch[]): string {
  return notes.length ? [...notes].sort((a, b) => midi(a) - midi(b)).map(toGermanPitch).join(' ') : '—';
}
