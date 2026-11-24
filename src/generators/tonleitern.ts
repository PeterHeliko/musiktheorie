/**
 * Tonleitern — notieren, auf der Klaviatur markieren, singen.
 *
 * Alle drei teilen die Auswahl (Entscheid 2026-11-24): neun Tonleiterarten,
 * Dur und die drei Moll vorgegeben, die Kirchentonarten zuschaltbar; dazu die
 * höchste Zahl Vorzeichen der Tonart und die Richtung. Die Tonleitern selbst
 * stehen in music/scales.ts.
 */

import { OPTION_SETS } from '../content/options';
import {
  MAJOR_MINOR,
  scaleName,
  scaleTonics,
  type ScaleDirection,
  type ScaleType,
} from '../music/scales';
import { midi, type Pitch } from '../music/theory';
import type { Rng } from './rng';
import { insist } from './shared';
import { multi, range, type FilterSpec, type FilterValues } from './types';

/** Die Einstellung «Welche Tonleitern?», mit den Kirchentonarten. */
export const SCALE_FILTER: FilterSpec = {
  kind: 'multi',
  key: 'scales',
  label: 'Welche Tonleitern?',
  options: OPTION_SETS.scaleType,
  hint: 'Dorisch, phrygisch, lydisch, mixolydisch und lokrisch sind die Kirchentonarten; ionisch und äolisch sind Dur und Moll natürlich.',
};

export const DIRECTION_FILTER: FilterSpec = {
  kind: 'multi',
  key: 'directions',
  label: 'Richtung',
  options: [
    { value: 'up', label: 'aufwärts' },
    { value: 'down', label: 'abwärts' },
  ],
  hint: 'Abwärts beginnt die Tonleiter auf dem oberen Grundton. Melodisch Moll steht abwärts in der natürlichen Form.',
};

export const DEFAULT_SCALES: string[] = MAJOR_MINOR;

/** Eine gewürfelte Tonleiter: Art, Grundton (ohne Oktave) und Richtung. */
export interface ScaleChoice {
  type: ScaleType;
  /** Grundton in Oktave 4; die Lage wählt die Übung. */
  tonic: Pitch;
  direction: ScaleDirection;
}

/**
 * Art, Grundton und Richtung würfeln. Grundtöne kommen aus `scaleTonics`:
 * nur Tonarten mit höchstens so vielen Vorzeichen, nie mit Doppelvorzeichen.
 */
export function pickScale(values: FilterValues, rng: Rng, fallbackMax = 4): ScaleChoice {
  const types = multi(values, 'scales', DEFAULT_SCALES) as ScaleType[];
  const maxAccidentals = Math.round(range(values, 'maxAccidentals', fallbackMax));
  const directions = multi(values, 'directions', ['up']) as ScaleDirection[];

  const type = rng.pick(types);
  const tonics = scaleTonics(type, maxAccidentals);
  insist(tonics.length > 0, 'Mit dieser Vorzeichengrenze bleibt für diese Tonleiter kein Grundton übrig.');
  return { type, tonic: rng.pick(tonics), direction: rng.pick(directions) };
}

/** «Es-Dur aufwärts», «d-Moll harmonisch abwärts», «D-dorisch aufwärts». */
export function scalePrompt({ type, tonic, direction }: ScaleChoice): string {
  return `${scaleName(type, tonic)} ${direction === 'up' ? 'aufwärts' : 'abwärts'}`;
}

/**
 * Tonleiter so legen, dass sie im gewählten Schlüssel bequem Platz hat: der
 * Grundton bekommt die Oktave, die c¹ (Violinschlüssel) bzw. G (Bass) am
 * nächsten liegt. Eine Oktave darüber passt dann mit höchstens zwei
 * Hilfslinien hinein.
 */
export function placeTonic(tonic: Pitch, clef: 'treble' | 'bass'): Pitch {
  const target = clef === 'treble' ? 60 : 43;
  let best = { ...tonic, octave: 4 };
  for (const octave of [2, 3, 4, 5]) {
    const candidate = { ...tonic, octave };
    if (Math.abs(midi(candidate) - target) < Math.abs(midi(best) - target)) best = candidate;
  }
  return best;
}
