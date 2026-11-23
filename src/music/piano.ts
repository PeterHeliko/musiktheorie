/**
 * Die Klaviatur ohne Oberfläche: welche Tasten weiss sind und wie sie
 * aufeinander folgen. Tasten sind MIDI-Nummern (60 = c¹); eine Taste kennt
 * keine Schreibweise — fis und ges sind dieselbe.
 *
 * Gezeichnet wird sie von `ui/PianoKeyboard.tsx`.
 */

import { STEPS, germanNoteName, midi } from './theory';

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
