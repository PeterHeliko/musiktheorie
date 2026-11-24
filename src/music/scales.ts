/**
 * Tonleitern: Arten, Töne, Namen, Vorzeichen.
 *
 * Neun Arten (Entscheid 2026-11-24): Dur, Moll natürlich, harmonisch und
 * melodisch, dazu die Kirchentonarten dorisch, phrygisch, lydisch,
 * mixolydisch und lokrisch. Ionisch und äolisch fehlen: sie sind Dur und
 * natürliches Moll, als eigene Antwort wären sie nicht zu unterscheiden.
 *
 * Melodisch Moll ist aufwärts mit grosser Sexte und Septime gebaut, abwärts
 * wie natürliches Moll — so steht es im Lehrbuch, und so erklingt und steht
 * es überall auf der Seite (`scalePitches`).
 */

import { diatonicIndex, germanNoteName, midi, parseIntervalLabel, STEPS, transposeByInterval, type Pitch } from './theory';

export type ScaleType =
  | 'dur'
  | 'moll-natuerlich'
  | 'moll-harmonisch'
  | 'moll-melodisch'
  | 'dorisch'
  | 'phrygisch'
  | 'lydisch'
  | 'mixolydisch'
  | 'lokrisch';

/** Alle Arten in der Reihenfolge der Einstellungen und Antwortknöpfe. */
export const SCALE_TYPES: ScaleType[] = [
  'dur',
  'moll-natuerlich',
  'moll-harmonisch',
  'moll-melodisch',
  'dorisch',
  'phrygisch',
  'lydisch',
  'mixolydisch',
  'lokrisch',
];

/** Vorgabe der Einstellungen: Dur und Moll, die Kirchentonarten aus. */
export const MAJOR_MINOR: ScaleType[] = ['dur', 'moll-natuerlich', 'moll-harmonisch', 'moll-melodisch'];

export const SCALE_LABELS: Record<ScaleType, string> = {
  dur: 'Dur',
  'moll-natuerlich': 'moll natürlich',
  'moll-harmonisch': 'moll harmonisch',
  'moll-melodisch': 'moll melodisch',
  dorisch: 'dorisch',
  phrygisch: 'phrygisch',
  lydisch: 'lydisch',
  mixolydisch: 'mixolydisch',
  lokrisch: 'lokrisch',
};

/** Stufen einer Tonleiter aufwärts, als Intervalle über dem Grundton. */
export const SCALE_PATTERNS: Record<ScaleType, string[]> = {
  dur: ['r1', 'g2', 'g3', 'r4', 'r5', 'g6', 'g7', 'r8'],
  'moll-natuerlich': ['r1', 'g2', 'k3', 'r4', 'r5', 'k6', 'k7', 'r8'],
  'moll-harmonisch': ['r1', 'g2', 'k3', 'r4', 'r5', 'k6', 'g7', 'r8'],
  // Aufwärts mit grosser Sexte und Septime; abwärts gilt die natürliche Form.
  'moll-melodisch': ['r1', 'g2', 'k3', 'r4', 'r5', 'g6', 'g7', 'r8'],
  dorisch: ['r1', 'g2', 'k3', 'r4', 'r5', 'g6', 'k7', 'r8'],
  phrygisch: ['r1', 'k2', 'k3', 'r4', 'r5', 'k6', 'k7', 'r8'],
  lydisch: ['r1', 'g2', 'g3', 'ü4', 'r5', 'g6', 'g7', 'r8'],
  mixolydisch: ['r1', 'g2', 'g3', 'r4', 'r5', 'g6', 'k7', 'r8'],
  lokrisch: ['r1', 'k2', 'k3', 'r4', 'v5', 'k6', 'k7', 'r8'],
};

export type ScaleDirection = 'up' | 'down';

const MINOR: ReadonlySet<ScaleType> = new Set(['moll-natuerlich', 'moll-harmonisch', 'moll-melodisch']);

/** Eine der drei Molltonleitern? Ihr Grundton wird klein geschrieben. */
export function isMinorScale(type: ScaleType): boolean {
  return MINOR.has(type);
}

/** Die Form, in der die Leiter in dieser Richtung steht: melodisch Moll abwärts ist natürlich. */
function formOf(type: ScaleType, direction: ScaleDirection): ScaleType {
  return type === 'moll-melodisch' && direction === 'down' ? 'moll-natuerlich' : type;
}

/**
 * Die acht Töne der Leiter in der Reihenfolge, in der sie erklingen und
 * dastehen: aufwärts vom Grundton bis zu seiner Oktave, abwärts von der Oktave
 * zum Grundton. `tonic` ist immer der TIEFE Grundton.
 */
export function scalePitches(tonic: Pitch, type: ScaleType, direction: ScaleDirection = 'up'): Pitch[] {
  const pitches = SCALE_PATTERNS[formOf(type, direction)].map((label) =>
    transposeByInterval(tonic, parseIntervalLabel(label)),
  );
  return direction === 'down' ? pitches.reverse() : pitches;
}

/** «Es», «c», «Fis» — Moll klein, Dur und Kirchentonarten gross. */
export function scaleTonicName(type: ScaleType, tonic: Pitch): string {
  const name = germanNoteName(tonic.step, tonic.alter);
  return isMinorScale(type) ? name.toLowerCase() : name;
}

/** «Es-Dur», «c-Moll harmonisch», «D-dorisch». */
export function scaleName(type: ScaleType, tonic: Pitch): string {
  const name = scaleTonicName(type, tonic);
  if (type === 'dur') return `${name}-Dur`;
  if (isMinorScale(type)) return `${name}-Moll ${SCALE_LABELS[type].replace(/^moll /, '')}`;
  return `${name}-${SCALE_LABELS[type]}`;
}

/**
 * Die Tonartvorzeichen der Leiter: so viele ♯ (positiv) oder ♭ (negativ).
 * Bei Moll die der natürlichen Form, bei den Kirchentonarten die der
 * Durtonart, aus der sie stammen (D-dorisch: keine, wie C-Dur). Null, wenn die
 * Leiter dafür ein Doppelvorzeichen oder ♯ und ♭ gemischt bräuchte — dann
 * gibt es diese Tonart nicht (Fes-Dur, gis-Moll ginge noch, dis-dorisch nicht).
 */
export function scaleSignature(type: ScaleType, tonic: Pitch): number | null {
  const natural = isMinorScale(type) ? 'moll-natuerlich' : type;
  const alters = scalePitches(tonic, natural).slice(0, 7).map((pitch) => pitch.alter);
  if (alters.some((alter) => Math.abs(alter) > 1)) return null;
  const sharps = alters.filter((alter) => alter === 1).length;
  const flats = alters.filter((alter) => alter === -1).length;
  if (sharps > 0 && flats > 0) return null;
  return sharps - flats;
}

/**
 * Die Grundtöne (Oktave 4), auf denen diese Leiter eine Tonart mit höchstens
 * `maxAccidentals` Vorzeichen ist und ohne Doppelvorzeichen auskommt — auch in
 * ihrer harmonischen und melodischen Form (gis-Moll harmonisch bräuchte fisis
 * und fällt weg). Wie bei den Dreiklängen: keine Doppelvorzeichen.
 */
export function scaleTonics(type: ScaleType, maxAccidentals: number): Pitch[] {
  const out: Pitch[] = [];
  for (const step of STEPS) {
    for (const alter of [-1, 0, 1]) {
      const tonic: Pitch = { step, alter, octave: 4 };
      const signature = scaleSignature(type, tonic);
      if (signature === null || Math.abs(signature) > maxAccidentals) continue;
      if (scalePitches(tonic, type).some((pitch) => Math.abs(pitch.alter) > 1)) continue;
      out.push(tonic);
    }
  }
  return out;
}

/**
 * Halbtonschritte aufwärts, wie sie im Lehrbuch stehen. Bewusst noch einmal
 * ausgeschrieben und nicht aus SCALE_PATTERNS abgeleitet: `checkScale` ist
 * so eine echte zweite Meinung.
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

/**
 * Stimmt diese Tonfolge als Tonleiter? Null, wenn ja, sonst der Grund. Jeder
 * Schritt geht eine Stufe weiter (jeder Stammton einmal) und ist so gross wie
 * im Lehrbuch; abwärts rückwärts gelesen, melodisch Moll dann natürlich.
 */
export function checkScale(pitches: readonly Pitch[], type: ScaleType, direction: ScaleDirection): string | null {
  if (pitches.length !== 8) return `${pitches.length} statt 8 Töne`;
  const up = direction === 'down' ? [...pitches].reverse() : [...pitches];
  const wanted = SEMITONE_STEPS[formOf(type, direction)];
  for (let index = 1; index < up.length; index++) {
    if (diatonicIndex(up[index]) - diatonicIndex(up[index - 1]) !== 1) return `Ton ${index + 1} ist keine Stufe weiter`;
    const step = midi(up[index]) - midi(up[index - 1]);
    if (step !== wanted[index - 1]) return `Schritt ${index}: ${step} statt ${wanted[index - 1]} Halbtöne`;
  }
  return null;
}
