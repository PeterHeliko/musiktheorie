/**
 * Generierte Melodie singen: eine Melodie vom Blatt (Entscheide 2026-11-25).
 *
 * Gewürfelt wird wie beim Diktat (`melody.ts`): meist Schritte, Sprünge
 * gegenläufig aufgefangen, Schluss auf dem Grundton. Aber ohne Rhythmus:
 * gleich lange Töne, ganze Noten ohne Taktart. Eine Übung mit Rhythmus folgt
 * später.
 *
 * Die Melodie steht von Anfang an ganz im System, mit den Vorzeichen der
 * Tonart; blau ist der Ton, der als Nächstes dran ist (`SingTask.notated`).
 * Vor dem Anfangston erklingt, was unter «Vor Beginn spielen» gewählt ist:
 * nichts, der Grundton, eine Kadenz, die Tonleiter bis zur Quinte und zurück
 * oder der Grundton-Akkord. Gesungen wird Ton für Ton wie bei den Tonleitern
 * (`judgeSequence`), mit Metronom ein Ton je Schlag (`judgeTimed`).
 *
 * Tritonus und Septime springt die Melodie nie, und sie wiederholt kaum je
 * einen Ton gleich: beides singt sich schlecht vom Blatt, und ein
 * wiederholter Ton lässt sich nur mit Absetzen dazwischen als zweiter
 * erkennen (hold.ts).
 */

import { OPTION_SETS } from '../content/options';
import type { NoteSpec, SingTask } from '../content/schema';
import { MAJOR_MINOR, isMinorScale, scaleName, scaleSignature, type ScaleType } from '../music/scales';
import { staffSpace } from '../music/staff-space';
import {
  diatonicIndex,
  midi,
  parseIntervalLabel,
  transposeByInterval,
  vexKeySignature,
  type Pitch,
} from '../music/theory';
import { DEFAULT_VOICE, VOICE_RANGES } from '../sing/voice';
import { CLEF_FILTER, SING_DEFAULTS, SING_FILTERS, SING_HINT, metronomeOf, placeInVoice, withTempo } from './dreiklaenge-shared';
import { pitchForDegree, walk } from './melody';
import type { Rng } from './rng';
import { candidatePitches, insist, pitchKey, taskId } from './shared';
import { MAX_ACCIDENTALS_FILTER, pickScale } from './tonleitern';
import {
  multi,
  range,
  single,
  type FilterSpec,
  type FilterValues,
  type Generator,
  type Personal,
  type Question,
} from './types';

/** Dur und die drei Moll; Kirchentonarten fehlen, eine Kadenz in dorisch wäre keine. */
const SCALE_OPTIONS = OPTION_SETS.scaleType.filter((option) => MAJOR_MINOR.includes(option.value as ScaleType));

/** Umfang in Tonleiterstufen, wie in melody.ts. */
const SPAN_OPTIONS = [
  { value: '4', label: 'Quinte' },
  { value: '5', label: 'Sexte' },
  { value: '7', label: 'Oktave' },
  { value: '9', label: 'Dezime' },
];

/** Grösster Sprung in Tonleiterstufen; die Septime fehlt (siehe oben). */
const LEAP_OPTIONS = [
  { value: '1', label: 'Sekunde' },
  { value: '2', label: 'Terz' },
  { value: '3', label: 'Quarte' },
  { value: '4', label: 'Quinte' },
  { value: '5', label: 'Sexte' },
  { value: '7', label: 'Oktave' },
];

type Prelude = 'nichts' | 'root' | 'kadenz' | 'stufen' | 'akkord' | 'akkord-gebrochen';

const PRELUDE_FILTER: FilterSpec = {
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
  hint: 'Danach erklingt immer der Anfangston. Die Kadenz ist I IV V I, vierstimmig in Oktavlage.',
};

/** Was vor dem Anfangston erklingt, in Worten für die Anweisung. */
const PRELUDE_TEXT: Record<Prelude, string> = {
  nichts: 'Du hörst den Anfangston.',
  root: 'Du hörst den Grundton, dann den Anfangston.',
  kadenz: 'Du hörst eine Kadenz, dann den Anfangston.',
  stufen: 'Du hörst die Tonleiter bis zur Quinte und zurück, dann den Anfangston.',
  akkord: 'Du hörst den Grundton-Akkord, dann den Anfangston.',
  'akkord-gebrochen': 'Du hörst den Grundton-Akkord gebrochen, dann den Anfangston.',
};

const SING_TEXT =
  'Singe die Melodie Ton für Ton; den Anfangston darfst du mitsingen. Blau ist der Ton, der als Nächstes dran ist.';

/** So lange muss ein Ton gehalten sein, bis er zählt (ms) — wie bei den Tonleitern. */
const MELODY_HOLD_MS = 500;

/** Zeichenbreite je Ganze im System, und je Vorzeichen der Tonart. */
const NOTE_ROOM = 42;
const SIGNATURE_ROOM = 11;

/** Tiefster und höchster Klavierton der Samples (audio/player.ts): die Kadenz bleibt darin. */
const PIANO = { low: 36, high: 84 };

interface Filters extends FilterValues {
  scales: string[];
  maxAccidentals: number;
  length: number;
  span: string;
  maxLeap: string;
  clefs: string[];
  prelude: string;
  tolerance: string;
  metronome: string;
}

export const melodieSingen: Generator<Filters> = {
  id: 'generierte-melodie-singen',
  topic: 'melodie',
  skill: 'singen',
  version: 1,
  title: 'Generierte Melodie singen',
  instruction: `${PRELUDE_TEXT.kadenz} ${SING_TEXT}`,
  hint: SING_HINT,

  filters: [
    { kind: 'multi', key: 'scales', label: 'Skala', options: SCALE_OPTIONS },
    MAX_ACCIDENTALS_FILTER,
    { kind: 'range', key: 'length', label: 'Länge', min: 4, max: 12, unit: 'Töne' },
    { kind: 'single', key: 'span', label: 'Tonumfang', options: SPAN_OPTIONS },
    {
      kind: 'single',
      key: 'maxLeap',
      label: 'Grösstes Intervall',
      options: LEAP_OPTIONS,
      hint: 'Meist geht die Melodie in Schritten; Sprünge sind selten. Tritonus und Septime kommen nicht vor.',
    },
    CLEF_FILTER,
    PRELUDE_FILTER,
    ...SING_FILTERS.filter((filter) => filter.key !== 'clefs'),
  ],

  defaults: {
    scales: MAJOR_MINOR,
    maxAccidentals: 4,
    length: 8,
    span: '7',
    maxLeap: '4',
    prelude: 'kadenz',
    ...SING_DEFAULTS,
  },

  generate(values, rng: Rng, personal?: Personal): Question {
    const { type, tonic } = pickScale(values, rng);
    const clef = rng.pick(multi(values, 'clefs', this.defaults.clefs)) as 'treble' | 'bass';
    const count = Math.max(4, Math.min(12, Math.round(range(values, 'length', 8))));
    const span = Number(single(values, 'span', '7'));
    // Weiter springen, als der Umfang reicht, geht nicht.
    const maxLeap = Math.min(span, Number(single(values, 'maxLeap', '4')));
    const prelude = single(values, 'prelude', 'kadenz') as Prelude;
    const tolerance = Number(single(values, 'tolerance', '50'));
    const voiceRange = VOICE_RANGES[personal?.voice ?? DEFAULT_VOICE];

    // Tonart und Stufen stehen fest, bevor die Stimmlage zählt: derselbe
    // Aufgabenlink fragt bei allen dieselbe Melodie, in der eigenen Lage.
    const degrees = melodyDegrees(rng, count, type, span, maxLeap);
    const written = melodyPitches(degrees, type, tonic);
    const placed = placeInVoice(rng, written, voiceRange);
    // Der Grundton der Melodie (Stufe 0) in ihrer Lage.
    const shift = Math.round((midi(placed[0]) - midi(written[0])) / 12);
    const home = { ...tonic, octave: tonic.octave + shift };
    checkMelody(placed, degrees, type, home, maxLeap);

    const signature = scaleSignature(type, tonic) ?? 0;
    const notes: NoteSpec[] = placed.map((pitch) => ({ keys: [pitchKey(pitch)], duration: 'w' }));
    // Platz über und unter dem System: so viel, wie die Stimmlage braucht,
    // für alle Aufgaben gleich; ragt die Melodie hinaus (Dezime), mehr.
    const base = staffSpace(clef, candidatePitches({ low: voiceRange.low - 1, high: voiceRange.high + 1 }, [-1, 0, 1]));
    const needed = staffSpace(clef, placed);
    const tempo = metronomeOf(values);

    const task: SingTask = {
      id: taskId('gms', rng),
      kind: 'sing',
      prompt: scaleName(type, tonic),
      score: {
        clef,
        keySignature: vexKeySignature(signature),
        accidentalsByKey: true,
        width: 100 + SIGNATURE_ROOM * Math.abs(signature) + NOTE_ROOM * placed.length,
        scale: 1.6,
        space: { above: Math.max(base.above, needed.above), below: Math.max(base.below, needed.below) },
        endBar: true,
        measures: [{ notes }],
      },
      reference: pitchKey(placed[0]),
      target: pitchKey(placed[placed.length - 1]),
      sequence: placed.map(pitchKey),
      tolerance,
      ...(tempo ? { tempo } : {}),
      melodic: true,
      notated: true,
      holdMs: MELODY_HOLD_MS,
      ...(prelude !== 'nichts' ? { prelude: preludeSounds(prelude, type, home, placed) } : {}),
      points: 2,
    };

    const said = `${PRELUDE_TEXT[prelude] ?? PRELUDE_TEXT.kadenz} ${SING_TEXT}`;
    const instruction = tempo ? withTempo(task, said) : said;
    return { task, ...(instruction !== this.instruction ? { instruction } : {}) };
  },
};

// ---------------------------------------------------------------------------
// Melodie
// ---------------------------------------------------------------------------

/**
 * Die Stufen der Melodie (melody.ts), ohne schwer singbare Sprünge und ohne
 * gleich wiederholten Ton. Den Schlusston setzt der Gang selbst: liegt schon
 * der vorletzte auf dem Grundton, wiederholte er sich. Dann wird neu
 * gewürfelt, aus demselben Zufall weiter, also für denselben Startwert gleich.
 * Nur in Sekunden und mit gerader Länge geht es nicht anders (vom Grundton
 * zurück zum Grundton braucht eine gerade Zahl Schritte); dann bleibt die
 * Wiederholung stehen.
 */
function melodyDegrees(rng: Rng, count: number, type: ScaleType, span: number, maxLeap: number): number[] {
  const options = { span, maxLeap, forbid: (from: number, to: number) => from === to || awkward(type, from, to) };
  const repeats = (degrees: number[]) => degrees.some((degree, index) => index > 0 && degree === degrees[index - 1]);
  let degrees = walk(rng, count, options);
  for (let attempt = 0; attempt < MAX_ATTEMPTS && repeats(degrees); attempt++) degrees = walk(rng, count, options);
  return degrees;
}

/** So oft wird höchstens neu gewürfelt, bis kein Ton sich gleich wiederholt. */
const MAX_ATTEMPTS = 20;

/** Ein Tonleitermuster als Halbtöne über dem Grundton, je Stufe 0–6. */
function semitonesOf(type: ScaleType, degree: number, tonic: Pitch): number {
  return midi(pitchForDegree(degree, { tonic, scale: type })) - midi(tonic);
}

/**
 * Ein Sprung, der sich schlecht singt: Tritonus (übermässige Quarte,
 * verminderte Quinte) oder Septime. Bei melodisch Moll in beiden Formen
 * geprüft, denn welche gilt, entscheidet erst der Verlauf.
 */
function awkward(type: ScaleType, from: number, to: number): boolean {
  const steps = Math.abs(to - from);
  if (steps <= 1) return false;
  if (steps % 7 === 6) return true;
  const reference: Pitch = { step: 'c', alter: 0, octave: 4 };
  const forms: ScaleType[] = type === 'moll-melodisch' ? ['moll-melodisch', 'moll-natuerlich'] : [type];
  return forms.some((form) => Math.abs(semitonesOf(form, to, reference) - semitonesOf(form, from, reference)) % 12 === 6);
}

/**
 * Stufen → Tonhöhen ab dem Grundton (Oktave 4). Melodisch Moll: Sexte und
 * Septime erhöht, wenn es danach aufwärts geht, sonst natürlich — wie die
 * Leiter selbst (music/scales.ts).
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
 * Nachgerechnet: jeder Ton gehört zur Leiter (melodisch Moll: einer ihrer
 * beiden Formen), kein Sprung ist grösser als erlaubt, kein Ton wiederholt
 * sich gleich, und der letzte ist der Grundton.
 */
function checkMelody(pitches: readonly Pitch[], degrees: readonly number[], type: ScaleType, home: Pitch, maxLeap: number): void {
  const forms: ScaleType[] = type === 'moll-melodisch' ? ['moll-melodisch', 'moll-natuerlich'] : [type];
  const classes = new Set(
    forms.flatMap((form) => [0, 1, 2, 3, 4, 5, 6].map((degree) => (midi(pitchForDegree(degree, { tonic: home, scale: form })) % 12 + 12) % 12)),
  );
  insist(pitches.length === degrees.length, `${pitches.length} statt ${degrees.length} Töne`);
  pitches.forEach((pitch, index) => {
    insist(classes.has(((midi(pitch) % 12) + 12) % 12), `${pitchKey(pitch)} gehört nicht zu ${scaleName(type, home)}`);
    if (index === 0) return;
    const steps = Math.abs(diatonicIndex(pitch) - diatonicIndex(pitches[index - 1]));
    insist(steps <= maxLeap, `Sprung von ${steps} Stufen, erlaubt sind ${maxLeap}`);
  });
  const last = pitches[pitches.length - 1];
  insist(midi(last) % 12 === ((midi(home) % 12) + 12) % 12, `Die Melodie endet auf ${pitchKey(last)}, nicht auf dem Grundton`);
}

// ---------------------------------------------------------------------------
// Vor Beginn spielen
// ---------------------------------------------------------------------------

const up = (pitch: Pitch, label: string): Pitch => transposeByInterval(pitch, parseIntervalLabel(label));
const octaveDown = (pitch: Pitch): Pitch => transposeByInterval(pitch, { quality: 'r', number: 8 }, 'down');
const octaveShift = (pitch: Pitch, octaves: number): Pitch => ({ ...pitch, octave: pitch.octave + octaves });

/**
 * Was vor dem Anfangston erklingt, in Vierteln zu 60 Schlägen. `home` ist der
 * Grundton in der Lage der Melodie.
 */
export function preludeSounds(
  prelude: Exclude<Prelude, 'nichts'>,
  type: ScaleType,
  home: Pitch,
  melody: readonly Pitch[],
): { pitches: string[]; quarters: number }[] {
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
