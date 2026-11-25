/**
 * Die Klaviatur ohne Oberfläche: welche Tasten weiss sind und wie sie
 * aufeinander folgen. Tasten sind MIDI-Nummern (60 = c¹); eine Taste kennt
 * keine Schreibweise — fis und ges sind dieselbe.
 *
 * Gezeichnet wird sie von `ui/PianoKeyboard.tsx`.
 */

import type { MelodyKeys } from '../content/schema';
import { STEPS, germanNoteName, midi, parsePitch, type Pitch } from './theory';

/** Die Klaviatur der Intervallübungen: zwei Oktaven, c bis h¹. */
export const INTERVAL_KEYBOARD = { low: 48, high: 71 } as const;

/** Halbtonlage der weissen Tasten in der Oktave: c d e f g a h. */
const WHITE_CLASSES = [0, 2, 4, 5, 7, 9, 11];

function pitchClass(key: number): number {
  return ((key % 12) + 12) % 12;
}

export function isWhiteKey(key: number): boolean {
  return WHITE_CLASSES.includes(pitchClass(key));
}

/**
 * Laufende Nummer einer weissen Taste (c der Oktave 0 = 0, d = 1 …), oder
 * null bei einer schwarzen. Der Abstand zweier Nummern plus eins ist die
 * Grösse des Intervalls, wie man sie auf der Klaviatur abzählt.
 */
export function whiteIndex(key: number): number | null {
  const index = WHITE_CLASSES.indexOf(pitchClass(key));
  return index < 0 ? null : Math.floor(key / 12) * 7 + index;
}

/** Umkehrung von `whiteIndex`. */
export function whiteKeyAt(index: number): number {
  return Math.floor(index / 7) * 12 + WHITE_CLASSES[((index % 7) + 7) % 7];
}

/** Alle Tasten von `low` bis `high`, beide einschliesslich. */
export function keysBetween(low: number, high: number): number[] {
  return Array.from({ length: high - low + 1 }, (_, i) => low + i);
}

/**
 * Die Namen einer Taste, klein geschrieben und aus dem Theoriekern: eine
 * weisse heisst wie ihr Stammton (e — nicht fes), eine schwarze nach beiden
 * Nachbarn, das Kreuz zuerst (cis, des). Ces, fes, eis und his sind
 * Schreibweisen im Notenbild; auf der Klaviatur heissen diese Tasten h, e, f
 * und c.
 */
export function keyNames(key: number): string[] {
  const alters = isWhiteKey(key) ? [0] : [1, -1];
  return alters.flatMap((alter) =>
    STEPS.filter((step) => pitchClass(midi({ step, alter, octave: 4 })) === pitchClass(key)).map((step) =>
      germanNoteName(step, alter).toLowerCase(),
    ),
  );
}

/** Alle Tonnamen der Klaviatur: sieben weisse, zehn für die fünf schwarzen. */
export const KEY_NAMES: string[] = [...new Set(keysBetween(60, 71).flatMap(keyNames))];

/** Die Tasten zwischen `low` und `high`, die so heissen. */
export function keysNamed(name: string, low: number, high: number): number[] {
  return keysBetween(low, high).filter((key) => keyNames(key).includes(name));
}

/**
 * Richtige Lagen eines Akkords auf den Tasten `low` bis `high` — so zeigt die
 * Klaviatur nach einem Fehler, wie es richtig gewesen wäre.
 *
 * `classes` sind die Akkordtöne als Tonklassen (0 = c … 11 = h), `lowest`
 * und `highest` die Indizes der Töne, die unten bzw. oben liegen müssen.
 * Zuerst alle Töne eng; geht das nicht (Umkehrung und Lage, die eng nicht
 * zusammenpassen), ein Basston unter engen Tönen — beim Dreiklang alle drei
 * darüber, beim Septakkord vierstimmig die drei übrigen, jeder Ton einmal
 * (Entscheid 2026-11-24).
 */
export function chordExamples(
  classes: readonly number[],
  { lowest, highest }: { lowest?: number; highest?: number },
  low: number,
  high: number,
): number[][] {
  const above = (from: number, member: number) => {
    let key = from + 1;
    while (((key % 12) + 12) % 12 !== classes[member]) key++;
    return key;
  };
  /** Töne eng, ab einer Taste dieses Akkordglieds. */
  const stacks = (order: number[]) =>
    keysBetween(low, high)
      .filter((key) => key % 12 === classes[order[0]])
      .map((start) => order.slice(1).reduce((keys, member) => [...keys, above(keys[keys.length - 1], member)], [start]))
      .filter((keys) => keys[keys.length - 1] <= high);
  const rotations = (members: number[]) =>
    members.map((_, shift) => members.map((__, index) => members[(index + shift) % members.length]));
  const top = (order: number[]) => order[order.length - 1];

  const all = classes.map((_, index) => index);
  const close = rotations(all)
    .filter((order) => (lowest === undefined || order[0] === lowest) && (highest === undefined || top(order) === highest))
    .flatMap(stacks);
  if (close.length > 0 || lowest === undefined) return close;

  const upper = classes.length > 3 ? all.filter((member) => member !== lowest) : all;
  return rotations(upper)
    .filter((order) => highest === undefined || top(order) === highest)
    .flatMap(stacks)
    .flatMap((stack) => {
      let bass = stack[0] - 3;
      while (bass >= low && bass % 12 !== classes[lowest]) bass--;
      return bass >= low ? [[bass, ...stack]] : [];
    });
}

/**
 * Die Note einer gespielten Taste in einer Melodie (`KeyboardTask.melody`):
 * an Platz `index` (0-basiert) die Taste der Melodie so, wie sie notiert
 * ist; jede andere nach `spelling`. Die Oktave folgt aus dem Stammton: his
 * liegt eine Oktave unter dem c, das klingt.
 */
export function spellPlayedKey(melody: MelodyKeys, accept: readonly number[], index: number, key: number): Pitch {
  if (accept[index] === key) return parsePitch(melody.written[index]);
  const { step, alter } = melody.spelling[pitchClass(key)];
  return { step, alter, octave: Math.floor((key - alter) / 12) - 1 };
}
