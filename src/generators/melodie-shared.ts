/**
 * Generierte Melodien, gemeinsam für «Generierte Melodie singen»,
 * «Generiertes Melodiediktat» und «Gehörte Melodie auf Klaviatur spielen»
 * (Entscheide 2026-11-25).
 *
 * Gewürfelt wird wie beim Diktat (`melody.ts`): meist Schritte, Sprünge
 * gegenläufig aufgefangen, Schluss auf dem Grundton. Ohne Rhythmus: gleich
 * lange Töne.
 *
 * **Chromatisch** (Skala) heisst: alle zwölf Halbtöne, ganz frei, ohne
 * Grundton und Tonart; die Melodie beginnt und endet irgendwo, vorher
 * erklingt nichts. Ist chromatisch gewählt, gelten Tonumfang und Grösstes
 * Intervall in feinen Intervallen (Halbtönen), für alle Aufgaben; sonst in
 * groben (Tonleiterstufen). Sekunden bleiben in Dur und Moll immer erlaubt,
 * sonst ginge es mit «kleine Sekunde» nicht weiter.
 *
 * Gleich wiederholt sich ein Ton kaum je: gesungen liesse sich ein
 * wiederholter Ton nur mit Absetzen dazwischen als zweiter erkennen
 * (hold.ts).
 *
 * Wo die Melodie liegt, bestimmt die Übung (`Window`): die Stimmlage beim
 * Singen, beim Notieren und Spielen zwei Oktaven, die im Schlüssel gut zu
 * lesen sind. Der grösste Tonumfang («Gesamte Stimmlage») ist dieses ganze
 * Fenster.
 */

import type { AudioEvent } from '../content/audio';
import { OPTION_SETS } from '../content/options';
import type { SelectOption } from '../content/schema';
import { MAJOR_MINOR, isMinorScale, scaleName, scaleSignature, scaleTonics, type ScaleType } from '../music/scales';
import { midi, parseIntervalLabel, parsePitch, transposeByInterval, type Pitch, type Step } from '../music/theory';
import { placeInVoice } from './dreiklaenge-shared';
import { pitchForDegree, walk } from './melody';
import type { Rng } from './rng';
import { insist, pitchKey, type Window } from './shared';
import { multi, range, single, type FilterSpec, type FilterValues } from './types';

export const CHROMATIC = 'chromatisch';

/** Dur, die drei Moll und chromatisch; Kirchentonarten fehlen, eine Kadenz in dorisch wäre keine. */
export const SCALE_OPTIONS: SelectOption[] = [
  ...OPTION_SETS.scaleType.filter((option) => MAJOR_MINOR.includes(option.value as ScaleType)),
  { value: CHROMATIC, label: 'chromatisch' },
];

/** Grobe Intervalle, in Tonleiterstufen. */
const COARSE: SelectOption[] = [
  { value: '1', label: 'Sekunde' },
  { value: '2', label: 'Terz' },
  { value: '3', label: 'Quarte' },
  { value: '4', label: 'Quinte' },
  { value: '5', label: 'Sexte' },
  { value: '6', label: 'Septime' },
  { value: '7', label: 'Oktave' },
];

/** Feine Intervalle, in Halbtönen. */
const FINE: (SelectOption & { semitones: number })[] = [
  { value: 'k2', label: 'kleine Sekunde', semitones: 1 },
  { value: 'g2', label: 'grosse Sekunde', semitones: 2 },
  { value: 'k3', label: 'kleine Terz', semitones: 3 },
  { value: 'g3', label: 'grosse Terz', semitones: 4 },
  { value: 'r4', label: 'Quarte', semitones: 5 },
  { value: 'tritonus', label: 'Tritonus', semitones: 6 },
  { value: 'r5', label: 'Quinte', semitones: 7 },
  { value: 'k6', label: 'kleine Sexte', semitones: 8 },
  { value: 'g6', label: 'grosse Sexte', semitones: 9 },
  { value: 'k7', label: 'kleine Septime', semitones: 10 },
  { value: 'g7', label: 'grosse Septime', semitones: 11 },
  { value: 'r8', label: 'Oktave', semitones: 12 },
];

/** Gegenstücke beim Umschalten zwischen grob und fein: Terz ↔ grosse Terz. */
const EQUIVALENT: Record<string, string> = {
  '1': 'g2',
  '2': 'g3',
  '3': 'r4',
  '4': 'r5',
  '5': 'g6',
  '6': 'g7',
  '7': 'r8',
  k2: '1',
  g2: '1',
  k3: '2',
  g3: '2',
  r4: '3',
  tritonus: '3',
  r5: '4',
  k6: '5',
  g6: '5',
  k7: '6',
  g7: '6',
  r8: '7',
};

const plain = (options: SelectOption[]): SelectOption[] => options.map(({ value, label }) => ({ value, label }));

/** Feine Intervalle gelten, sobald chromatisch unter den Skalen ist. */
function fineIntervals(values: FilterValues): boolean {
  return multi(values, 'scales', MAJOR_MINOR).includes(CHROMATIC);
}

export function onlyChromatic(values: FilterValues): boolean {
  const scales = multi(values, 'scales', MAJOR_MINOR);
  return scales.length === 1 && scales[0] === CHROMATIC;
}

/**
 * Tonumfang und Grösstes Intervall. Der Tonumfang geht ab der Terz bis zur
 * Oktave, dann folgt `whole`: das ganze Fenster der Übung.
 */
export function intervalFilters(whole: SelectOption): FilterSpec[] {
  const coarseSpans = [...COARSE.slice(1), whole];
  const fineSpans = [...plain(FINE.slice(2)), whole];
  return [
    {
      kind: 'single',
      key: 'span',
      label: 'Tonumfang',
      options: [...coarseSpans.slice(0, -1), ...fineSpans],
      shownOptions: (values) => (fineIntervals(values) ? fineSpans : coarseSpans),
      equivalent: EQUIVALENT,
    },
    {
      kind: 'single',
      key: 'maxLeap',
      label: 'Grösstes Intervall',
      options: [...COARSE, ...plain(FINE)],
      shownOptions: (values) => (fineIntervals(values) ? plain(FINE) : COARSE),
      equivalent: EQUIVALENT,
    },
  ];
}

export type Prelude = 'nichts' | 'root' | 'kadenz' | 'stufen' | 'akkord' | 'akkord-gebrochen';

const PRELUDES: Prelude[] = ['nichts', 'root', 'kadenz', 'stufen', 'akkord', 'akkord-gebrochen'];

/** «Vor Beginn spielen»; chromatisch gesperrt, mit `chromaticReason` als Begründung. */
export function preludeFilter(chromaticReason: string): FilterSpec {
  return {
    kind: 'single',
    key: 'prelude',
    label: 'Vor Beginn spielen',
    options: [
      { value: 'nichts', label: 'nichts' },
      // «root» heisst im Link «grundton» (VALUE_NAMES in links.ts).
      { value: 'root', label: 'Grundton' },
      { value: 'kadenz', label: 'Kadenz' },
      { value: 'stufen', label: '1 2 3 4 5 4 3 2 1' },
      { value: 'akkord', label: 'Grundton-Akkord zusammen' },
      { value: 'akkord-gebrochen', label: 'Grundton-Akkord gebrochen' },
    ],
    disabledBy: (values) => (onlyChromatic(values) ? chromaticReason : null),
  };
}

/**
 * Was vor Beginn erklingt, in Worten für die Anweisung; `then` ist, was
 * danach kommt («den Anfangston», «die Melodie»).
 */
export function preludeText(prelude: Prelude, then: string): string {
  switch (prelude) {
    case 'nichts':
      return `Du hörst ${then}.`;
    case 'root':
      return `Du hörst den Grundton, dann ${then}.`;
    case 'kadenz':
      return `Du hörst eine Kadenz, dann ${then}.`;
    case 'stufen':
      return `Du hörst die Tonleiter bis zur Quinte und zurück, dann ${then}.`;
    case 'akkord':
      return `Du hörst den Grundton-Akkord, dann ${then}.`;
    case 'akkord-gebrochen':
      return `Du hörst den Grundton-Akkord gebrochen, dann ${then}.`;
  }
}

/** Ein Klang vor Beginn: Tonhöhen wie «c4», Dauer in Vierteln zu 60 Schlägen. */
export interface PreludeSound {
  pitches: string[];
  quarters: number;
}

/** Tiefster und höchster Klavierton der Samples (audio/player.ts): die Kadenz bleibt darin. */
const PIANO = { low: 36, high: 84 };

/** So oft wird höchstens neu gewürfelt, bis die Melodie passt. */
const MAX_ATTEMPTS = 50;

/** Tonumfang: das ganze Fenster, Tonleiterstufen oder Halbtöne. */
type Span = { kind: 'whole' } | { kind: 'steps'; steps: number } | { kind: 'semitones'; semitones: number };
/** Grösstes Intervall: Tonleiterstufen oder Halbtöne. */
type Leap = { kind: 'steps'; steps: number } | { kind: 'semitones'; semitones: number };

/** Ein Intervallwert, wie er für die Einstellung gilt: grob oder fein, ein Link kann beides liefern. */
function intervalValue(value: string, fine: boolean, whole: SelectOption): string {
  const isFine = FINE.some((option) => option.value === value);
  return value === whole.value || isFine === fine ? value : (EQUIVALENT[value] ?? value);
}

function spanOf(values: FilterValues, fine: boolean, whole: SelectOption): Span {
  const value = intervalValue(single(values, 'span', '7'), fine, whole);
  if (value === whole.value) return { kind: 'whole' };
  const semitones = FINE.find((option) => option.value === value)?.semitones;
  if (semitones !== undefined) return { kind: 'semitones', semitones };
  const steps = Number(value);
  return Number.isInteger(steps) && steps >= 2 && steps <= 7 ? { kind: 'steps', steps } : { kind: 'steps', steps: 7 };
}

function leapOf(values: FilterValues, fine: boolean, whole: SelectOption): Leap {
  const value = intervalValue(single(values, 'maxLeap', '4'), fine, whole);
  const semitones = FINE.find((option) => option.value === value)?.semitones;
  if (semitones !== undefined) return { kind: 'semitones', semitones };
  const steps = Number(value);
  return Number.isInteger(steps) && steps >= 1 && steps <= 7 ? { kind: 'steps', steps } : { kind: 'steps', steps: 4 };
}

// ---------------------------------------------------------------------------
// Die Melodie würfeln
// ---------------------------------------------------------------------------

/** Die gewürfelte Skala, und ob feine Intervalle gelten. */
export interface ScaleChoice {
  chosen: string;
  fine: boolean;
}

/** Erst die Skala; danach würfelt die Übung, was sie sonst braucht (den Schlüssel), dann `rollMelody`. */
export function pickScale(values: FilterValues, rng: Rng): ScaleChoice {
  const scales = multi(values, 'scales', MAJOR_MINOR).filter((scale) =>
    SCALE_OPTIONS.some((option) => option.value === scale),
  );
  const chosen = rng.pick(scales.length > 0 ? scales : MAJOR_MINOR);
  return { chosen, fine: scales.includes(CHROMATIC) };
}

export interface RolledMelody {
  pitches: Pitch[];
  /** Was über der Aufgabe steht: «D-Dur», «Chromatisch». */
  prompt: string;
  /** Vorzeichen der Tonart (+ Kreuze, − Be); null chromatisch. */
  signature: number | null;
  /** Was vor Beginn erklingt; chromatisch immer nichts. */
  prelude: Prelude;
  sounds?: PreludeSound[];
}

/**
 * Die Melodie im Fenster der Übung, mit Tonart und dem, was vor Beginn
 * erklingt. `whole` ist der Wert der Einstellung «ganzes Fenster».
 */
export function rollMelody(
  values: FilterValues,
  rng: Rng,
  { chosen, fine }: ScaleChoice,
  window: Window,
  whole: SelectOption,
): RolledMelody {
  const count = Math.max(4, Math.min(12, Math.round(range(values, 'length', 8))));
  const span = spanOf(values, fine, whole);
  const leap = leapOf(values, fine, whole);

  if (chosen === CHROMATIC) {
    // Im Fenster gewürfelt; ein Tonumfang in Halbtönen wird danach
    // hineingelegt wie bei Dur und Moll.
    return { pitches: chromaticMelody(rng, count, span, leap, window), prompt: 'Chromatisch', signature: null, prelude: 'nichts' };
  }

  const type = chosen as ScaleType;
  const maxAccidentals = Math.round(range(values, 'maxAccidentals', 4));
  const tonics = scaleTonics(type, maxAccidentals);
  insist(tonics.length > 0, 'Mit dieser Vorzeichengrenze bleibt keine Tonart übrig.');
  const tonic = rng.pick(tonics);
  const placed = diatonicMelody(rng, type, tonic, count, span, leap, window);
  const wanted = single(values, 'prelude', 'kadenz') as Prelude;
  const prelude = PRELUDES.includes(wanted) ? wanted : 'kadenz';
  return {
    pitches: placed.pitches,
    prompt: scaleName(type, tonic),
    signature: scaleSignature(type, tonic) ?? 0,
    prelude,
    ...(prelude !== 'nichts' ? { sounds: preludeSounds(prelude, type, placed.home, placed.pitches) } : {}),
  };
}

// ---------------------------------------------------------------------------
// Dur und Moll
// ---------------------------------------------------------------------------

/** Die Formen, in denen eine Stufe erklingen kann: melodisch Moll erhöht oder natürlich. */
function formsOf(type: ScaleType): ScaleType[] {
  return type === 'moll-melodisch' ? ['moll-melodisch', 'moll-natuerlich'] : [type];
}

/** Die Tonhöhe einer Stufe in jeder ihrer Formen (MIDI). */
function degreeMidis(type: ScaleType, home: Pitch, degree: number): number[] {
  return formsOf(type).map((form) => midi(pitchForDegree(degree, { tonic: home, scale: form })));
}

/** So viele Halbtöne liegen höchstens zwischen zwei Stufen, über alle Formen. */
function widthOf(type: ScaleType, home: Pitch, from: number, to: number): number {
  const all = [...degreeMidis(type, home, from), ...degreeMidis(type, home, to)];
  return Math.max(...all) - Math.min(...all);
}

/**
 * Eine Melodie in Dur oder Moll, im Fenster. Mit dem ganzen Fenster liegt
 * der Grundton irgendwo darin und die Melodie darf es ganz nutzen; sonst wird
 * sie mit dem Tonumfang gewürfelt und dann hineingelegt.
 */
function diatonicMelody(
  rng: Rng,
  type: ScaleType,
  tonic: Pitch,
  count: number,
  span: Span,
  leap: Leap,
  window: Window,
): { pitches: Pitch[]; home: Pitch } {
  if (span.kind === 'whole') {
    const homes = [1, 2, 3, 4, 5, 6]
      .map((octave) => ({ ...tonic, octave }))
      .filter((pitch) => midi(pitch) >= window.low && midi(pitch) <= window.high);
    insist(homes.length > 0, 'Kein Grundton im Tonumfang');
    const home = rng.pick(homes);
    const inside = (degree: number) => degreeMidis(type, home, degree).every((value) => value >= window.low && value <= window.high);
    let lowest = 0;
    while (inside(lowest - 1)) lowest--;
    let highest = 0;
    while (inside(highest + 1)) highest++;
    const degrees = melodyDegrees(rng, count, type, home, { lowest, highest }, leap);
    return { pitches: melodyPitches(degrees, type, home), home };
  }

  const bounds = span.kind === 'steps' ? stepBounds(span.steps) : semitoneBounds(type, tonic, span.semitones);
  const degrees = melodyDegrees(rng, count, type, tonic, bounds, leap);
  const written = melodyPitches(degrees, type, tonic);
  const placed = placeInVoice(rng, written, window);
  // Der Grundton der Melodie (Stufe 0) in ihrer Lage.
  const shift = Math.round((midi(placed[0]) - midi(written[0])) / 12);
  return { pitches: placed, home: { ...tonic, octave: tonic.octave + shift } };
}

/** Der Umfang in Stufen, wie melody.ts ihn legt: ein Drittel unter dem Grundton. */
function stepBounds(steps: number): { lowest: number; highest: number } {
  const lowest = -Math.floor(steps / 3);
  return { lowest, highest: lowest + steps };
}

/** Der grösste Umfang in Stufen, der höchstens so viele Halbtöne umfasst. */
function semitoneBounds(type: ScaleType, tonic: Pitch, semitones: number): { lowest: number; highest: number } {
  for (let steps = 7; steps > 1; steps--) {
    const bounds = stepBounds(steps);
    if (widthOf(type, tonic, bounds.lowest, bounds.highest) <= semitones) return bounds;
  }
  return stepBounds(1);
}

/**
 * Die Stufen der Melodie (melody.ts), ohne gleich wiederholten Ton und, bei
 * feinen Intervallen, ohne Sprung über das grösste erlaubte. Den Schlusston
 * setzt der Gang selbst: liegt schon der vorletzte auf dem Grundton,
 * wiederholte er sich. Dann wird neu gewürfelt, aus demselben Zufall weiter,
 * also für denselben Startwert gleich. Nur in Sekunden und mit gerader Länge
 * geht es nicht anders (vom Grundton zurück zum Grundton braucht eine gerade
 * Zahl Schritte); dann bleibt die Wiederholung stehen.
 */
function melodyDegrees(
  rng: Rng,
  count: number,
  type: ScaleType,
  home: Pitch,
  bounds: { lowest: number; highest: number },
  leap: Leap,
): number[] {
  const room = bounds.highest - bounds.lowest;
  // Sekunden gehen immer; feine Grenzen gelten für Sprünge.
  const tooWide = (from: number, to: number) =>
    leap.kind === 'semitones' && Math.abs(to - from) > 1 && widthOf(type, home, from, to) > leap.semitones;
  let maxLeap: number;
  if (leap.kind === 'steps') {
    maxLeap = leap.steps;
  } else {
    maxLeap = 1;
    for (let steps = 2; steps <= room; steps++) {
      for (let from = bounds.lowest; from + steps <= bounds.highest; from++) {
        if (!tooWide(from, from + steps)) maxLeap = steps;
      }
    }
  }
  maxLeap = Math.max(1, Math.min(maxLeap, room));

  const options = { span: room, maxLeap, bounds, forbid: (from: number, to: number) => from === to || tooWide(from, to) };
  const repeats = (degrees: number[]) => degrees.some((degree, index) => index > 0 && degree === degrees[index - 1]);
  const wide = (degrees: number[]) => degrees.some((degree, index) => index > 0 && tooWide(degrees[index - 1], degree));
  let degrees = walk(rng, count, options);
  for (let attempt = 0; attempt < MAX_ATTEMPTS && (repeats(degrees) || wide(degrees)); attempt++) {
    degrees = walk(rng, count, options);
  }
  insist(!wide(degrees), 'Ein Sprung ist grösser als erlaubt');
  checkDegrees(degrees, type, home, bounds, maxLeap);
  return degrees;
}

/**
 * Stufen → Tonhöhen ab dem Grundton. Melodisch Moll: Sexte und Septime
 * erhöht, wenn es danach aufwärts geht, sonst natürlich — wie die Leiter
 * selbst (music/scales.ts).
 */
export function melodyPitches(degrees: readonly number[], type: ScaleType, tonic: Pitch): Pitch[] {
  return degrees.map((degree, index) => {
    if (type !== 'moll-melodisch') return pitchForDegree(degree, { tonic, scale: type });
    const within = ((degree % 7) + 7) % 7;
    if (within < 5) return pitchForDegree(degree, { tonic, scale: type });
    const next = degrees.slice(index + 1).find((other) => other !== degree);
    const rising = next !== undefined && next > degree;
    return pitchForDegree(degree, { tonic, scale: rising ? 'moll-melodisch' : 'moll-natuerlich' });
  });
}

/**
 * Nachgerechnet: alle Stufen im Umfang, kein Sprung grösser als erlaubt, und
 * die letzte ist ein Grundton. Dass die Töne zur Leiter gehören, sichert
 * `pitchForDegree`.
 */
function checkDegrees(
  degrees: readonly number[],
  type: ScaleType,
  home: Pitch,
  bounds: { lowest: number; highest: number },
  maxLeap: number,
): void {
  const name = scaleName(type, home);
  degrees.forEach((degree, index) => {
    insist(degree >= bounds.lowest && degree <= bounds.highest, `${name}: Stufe ${degree} ausserhalb des Umfangs`);
    if (index > 0) insist(Math.abs(degree - degrees[index - 1]) <= maxLeap, `${name}: Sprung grösser als ${maxLeap} Stufen`);
  });
  insist(degrees[degrees.length - 1] % 7 === 0, `${name}: endet nicht auf dem Grundton`);
}

// ---------------------------------------------------------------------------
// Chromatisch
// ---------------------------------------------------------------------------

/**
 * Eine chromatische Melodie: ganz frei, ohne Grundton; beginnt und endet
 * irgendwo. Meist kleine und grosse Sekunden, Sprünge seltener und
 * gegenläufig aufgefangen, wie bei Dur und Moll; kein Ton gleich zweimal.
 * Mit dem ganzen Fenster darin gewürfelt, sonst im Tonumfang und dann ins
 * Fenster gelegt.
 */
function chromaticMelody(rng: Rng, count: number, span: Span, leap: Leap, window: Window): Pitch[] {
  // Chromatisch gelten immer feine Intervalle; grobe kommen nur aus alten Links.
  const width = span.kind === 'whole' ? window.high - window.low : span.kind === 'semitones' ? span.semitones : 12;
  const largest = leap.kind === 'semitones' ? leap.semitones : (FINE.find((option) => option.value === EQUIVALENT[String(leap.steps)])?.semitones ?? 7);
  const maxLeap = Math.max(1, Math.min(largest, width));
  let low: number;
  let start: number;
  if (span.kind === 'whole') {
    low = window.low;
    start = rng.int(window.low, window.high);
  } else {
    // Anfangston und seine Lage im Umfang; die Oktave folgt aus dem Fenster.
    start = 60 + rng.int(0, 11);
    low = start - rng.int(0, width);
  }
  const high = low + width;

  const sizes = Array.from({ length: maxLeap }, (_, index) => index + 1);
  // Sekunden am häufigsten, Terzen seltener, grössere Sprünge selten.
  const weights = sizes.map((size) => (size <= 2 ? 4 : size <= 4 ? 2 : 1));
  const tones = [start];
  let current = start;
  let lastLeap = 0;
  for (let index = 1; index < count; index++) {
    // Nach einem Sprung (ab der kleinen Terz) geht es gegenläufig weiter.
    const preferred = Math.abs(lastLeap) >= 3 ? -Math.sign(lastLeap) : rng.chance(0.5) ? 1 : -1;
    const size = rng.weighted(sizes, weights);
    const candidates = [current + preferred * size, current - preferred * size, current + preferred, current - preferred];
    const next = candidates.find((value) => value >= low && value <= high)!;
    lastLeap = next - current;
    current = next;
    tones.push(next);
  }

  const spelled = spell(tones);
  // Nachgerechnet: im Umfang, kein Sprung zu gross, kein Ton gleich zweimal.
  spelled.forEach((pitch, index) => {
    insist(midi(pitch) === tones[index], `${pitchKey(pitch)} ist nicht MIDI ${tones[index]}`);
    if (index === 0) return;
    const distance = Math.abs(tones[index] - tones[index - 1]);
    insist(distance >= 1 && distance <= maxLeap, `Schritt von ${distance} Halbtönen, erlaubt sind 1 bis ${maxLeap}`);
  });
  insist(Math.max(...tones) - Math.min(...tones) <= width, 'Die Melodie ist weiter als der Tonumfang');
  return span.kind === 'whole' ? spelled : placeInVoice(rng, spelled, window);
}

const NATURAL: Partial<Record<number, Step>> = { 0: 'c', 2: 'd', 4: 'e', 5: 'f', 7: 'g', 9: 'a', 11: 'b' };

/**
 * Schreibweise der chromatischen Töne: aufwärts erreicht mit ♯, abwärts mit ♭
 * (der erste Ton nach der Richtung, in die es weitergeht). Weisse Tasten
 * ohne Vorzeichen.
 */
export function spell(tones: readonly number[]): Pitch[] {
  return tones.map((value, index) => {
    const rising = index > 0 ? value > tones[index - 1] : (tones[1] ?? value) > value;
    const pitchClass = ((value % 12) + 12) % 12;
    const octave = Math.floor(value / 12) - 1;
    const natural = NATURAL[pitchClass];
    if (natural) return { step: natural, alter: 0, octave };
    return rising
      ? { step: NATURAL[pitchClass - 1]!, alter: 1, octave }
      : { step: NATURAL[pitchClass + 1]!, alter: -1, octave };
  });
}

/**
 * Beide Schreibweisen einer schwarzen Taste (cis und des), für eine weisse nur
 * der Stammton. Ohne Tonart ist keine der beiden falsch.
 */
export function blackKeySpellings(pitch: Pitch): Pitch[] {
  const value = midi(pitch);
  const pitchClass = ((value % 12) + 12) % 12;
  const octave = Math.floor(value / 12) - 1;
  const natural = NATURAL[pitchClass];
  if (natural) return [{ step: natural, alter: 0, octave }];
  return [
    { step: NATURAL[pitchClass - 1]!, alter: 1, octave },
    { step: NATURAL[pitchClass + 1]!, alter: -1, octave },
  ];
}

// ---------------------------------------------------------------------------
// Hören: Melodiediktat und Klaviatur
// ---------------------------------------------------------------------------

/**
 * Wo die Melodie beim Notieren und Spielen liegt: zwei Oktaven, die im
 * Schlüssel gut zu lesen sind, c¹ bis h² im Violin-, C bis h im
 * Bassschlüssel. Höchstens zwei Hilfslinien über und unter dem System.
 */
export const CLEF_WINDOWS: Record<'treble' | 'bass', Window> = {
  treble: { low: 60, high: 83 },
  bass: { low: 36, high: 59 },
};

/** Das Tempo der Melodie: Viertel pro Minute, ein Ton je Viertel. */
export const TEMPO_FILTER: FilterSpec = { kind: 'range', key: 'tempo', label: 'Tempo', min: 50, max: 120, step: 2, unit: 'bpm' };
export const DEFAULT_LISTENING_TEMPO = 76;

/** So oft darf die Melodie mit «Wiedergaben begrenzen» erklingen. */
export const LIMITED_PLAYS = 3;
export const LIMIT_PLAYS_FILTER: FilterSpec = {
  kind: 'toggle',
  key: 'limitPlays',
  label: `Wiedergaben begrenzen (${LIMITED_PLAYS}×)`,
};

/** Pause zwischen dem, was vor Beginn erklingt, und der Melodie (Viertel zu 60 Schlägen). */
const PRELUDE_GAP = 1;
/** Der Schlusston klingt zwei Schläge. */
const LAST_QUARTERS = 2;

/**
 * Was die Hörübungen abspielen: was vor Beginn erklingt, eine kurze Pause,
 * dann die Melodie, ein Ton je Schlag. Vor Beginn ist in Vierteln zu 60
 * Schlägen angegeben und wird ins Tempo der Melodie umgerechnet: es bleibt so
 * schnell wie beim Singen, auch wenn die Melodie schneller oder langsamer
 * läuft.
 */
export function listeningEvents(melody: readonly Pitch[], sounds: readonly PreludeSound[] | undefined, tempo: number): AudioEvent[] {
  const factor = tempo / 60;
  const prelude = (sounds ?? []).map((sound) => ({ pitches: sound.pitches.map(parsePitch), quarters: sound.quarters * factor }));
  const gap = prelude.length > 0 ? [{ pitches: [], quarters: PRELUDE_GAP * factor }] : [];
  const notes = melody.map((pitch, index) => ({ pitches: [pitch], quarters: index === melody.length - 1 ? LAST_QUARTERS : 1 }));
  return [...prelude, ...gap, ...notes];
}

// ---------------------------------------------------------------------------
// Vor Beginn spielen
// ---------------------------------------------------------------------------

const up = (pitch: Pitch, label: string): Pitch => transposeByInterval(pitch, parseIntervalLabel(label));
const octaveDown = (pitch: Pitch): Pitch => transposeByInterval(pitch, { quality: 'r', number: 8 }, 'down');
const octaveShift = (pitch: Pitch, octaves: number): Pitch => ({ ...pitch, octave: pitch.octave + octaves });

/**
 * Was vor der Melodie erklingt, in Vierteln zu 60 Schlägen. `home` ist der
 * Grundton in der Lage der Melodie.
 */
export function preludeSounds(
  prelude: Exclude<Prelude, 'nichts'>,
  type: ScaleType,
  home: Pitch,
  melody: readonly Pitch[],
): PreludeSound[] {
  const third = isMinorScale(type) ? 'k3' : 'g3';
  const sound = (pitches: Pitch[], quarters: number) => ({ pitches: pitches.map(pitchKey), quarters });
  switch (prelude) {
    case 'root':
      return [sound([home], 1)];
    case 'akkord':
      return [sound([home, up(home, third), up(home, 'r5')], 1.5)];
    case 'akkord-gebrochen':
      return [sound([home], 0.5), sound([up(home, third)], 0.5), sound([up(home, 'r5')], 1)];
    case 'stufen': {
      // 1 2 3 4 5 4 3 2 1: die Stufen 1–5 sind in allen Moll gleich.
      const steps = [0, 1, 2, 3, 4, 3, 2, 1, 0].map((degree) => pitchForDegree(degree, { tonic: home, scale: type }));
      return steps.map((pitch, index) => sound([pitch], index === steps.length - 1 ? 1 : 0.5));
    }
    case 'kadenz':
      return cadence(type, home, melody).map((chord, index, all) => sound(chord, index === all.length - 1 ? 1.5 : 1));
  }
}

/**
 * I IV V I, vierstimmig in Oktavlage (Sopran auf dem Grundton), wie im
 * Lehrbuch geführt: in C-Dur c e g c¹ · f f a c¹ · g d g h · c e g c¹ (Bass
 * eine Oktave unter dem mittleren Grundton). In Moll i iv V i, die Dominante
 * mit Leitton. Gelegt um die Mitte der Melodie, und so, dass sie in den
 * Klavierumfang passt.
 */
export function cadence(type: ScaleType, home: Pitch, melody: readonly Pitch[]): Pitch[][] {
  const minor = isMinorScale(type);
  const third = minor ? 'k3' : 'g3';
  const sixth = minor ? 'k6' : 'g6';
  const centre = melody.reduce((sum, pitch) => sum + midi(pitch), 0) / melody.length;
  let tonic = octaveShift(home, Math.round((centre - midi(home)) / 12));
  while (midi(tonic) - 12 < PIANO.low) tonic = octaveShift(tonic, 1);
  while (midi(tonic) + 12 > PIANO.high) tonic = octaveShift(tonic, -1);

  const chord = (bass: string, upper: string[]): Pitch[] => [octaveDown(up(tonic, bass)), ...upper.map((label) => up(tonic, label))];
  const chords = [
    chord('r1', [third, 'r5', 'r8']),
    chord('r4', ['r4', sixth, 'r8']),
    chord('r5', ['g2', 'r5', 'g7']),
    chord('r1', [third, 'r5', 'r8']),
  ];

  // Nachgerechnet: I und IV Dur bzw. Moll, V immer Dur, der Sopran schliesst
  // mit dem Leitton zum Grundton.
  const quality = (pitches: Pitch[]) =>
    [...new Set(pitches.map((pitch) => (((midi(pitch) - midi(pitches[0])) % 12) + 12) % 12))].sort((a, b) => a - b).join(' ');
  const tonicQuality = minor ? '0 3 7' : '0 4 7';
  insist(quality(chords[0]) === tonicQuality, `Tonika ${quality(chords[0])}`);
  insist(quality(chords[1]) === tonicQuality, `Subdominante ${quality(chords[1])}`);
  insist(quality(chords[2]) === '0 4 7', `Dominante ${quality(chords[2])}`);
  insist(midi(chords[3][3]) - midi(chords[2][3]) === 1, 'Der Sopran schliesst nicht mit dem Leitton');
  return chords;
}
