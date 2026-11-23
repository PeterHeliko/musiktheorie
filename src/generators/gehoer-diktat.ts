/**
 * Gehörbildung — Rhythmus- und Melodiediktat.
 *
 * Die anspruchsvollste Übung der Seite: es genügt nicht, einen Klang
 * wiederzuerkennen, man muss ihn aufschreiben. Die Melodie wird gewürfelt
 * (siehe `melody.ts`), es geht also nie eine aus.
 *
 * Rhythmus und Tonhöhen werden UNABHÄNGIG voneinander bewertet. Wer die
 * Melodie hört, aber einen Notenwert verfehlt, bekommt die Tonhöhenpunkte
 * trotzdem — sonst wäre die Rückmeldung entmutigend und wenig hilfreich.
 */

import type { AudioEvent, ScaleType } from '../content/audio';
import type { NotationTask, NoteSpec } from '../content/schema';
import {
  CIRCLE_OF_FIFTHS,
  durationInQuarters,
  keyByName,
  measureCapacity,
  midi,
  parsePitch,
  toGermanPitch,
  tonicPitchFromName,
  vexKeySignature,
  type Pitch,
} from '../music/theory';
import { generateMelody, usableDurations, type MelodyOptions } from './melody';
import type { Rng } from './rng';
import { DURATION_OPTIONS, insist, parseDurationValue, taskId } from './shared';
import { multi, range, single, toggle, type FilterValues, type Generator, type Question } from './types';

const LIMITED_PLAYS = 6;

/** Tonarten, in denen ein Diktat sinnvoll bleibt: bis vier Vorzeichen. */
const KEY_OPTIONS = CIRCLE_OF_FIFTHS.filter((key) => Math.abs(key.accidentals) <= 4).map((key) => ({
  value: key.major,
  label: key.major,
}));

const TIME_OPTIONS = [
  { value: '4/4', label: '4/4' },
  { value: '3/4', label: '3/4' },
  { value: '2/4', label: '2/4' },
  { value: '6/8', label: '6/8' },
];

const SPAN_OPTIONS = [
  { value: '4', label: 'Quinte' },
  { value: '7', label: 'Oktave' },
  { value: '9', label: 'Dezime' },
];

const LEAP_OPTIONS = [
  { value: '1', label: 'nur Sekundschritte' },
  { value: '2', label: 'bis zur Terz' },
  { value: '4', label: 'bis zur Quinte' },
  { value: '7', label: 'bis zur Oktave' },
];

const SCALE_OPTIONS = [
  { value: 'dur', label: 'Dur' },
  { value: 'moll-natuerlich', label: 'moll natürlich' },
  { value: 'moll-harmonisch', label: 'moll harmonisch' },
];

interface Filters extends FilterValues {
  bars: number;
  timeSignature: string;
  keys: string[];
  scale: string;
  durations: string[];
  span: string;
  maxLeap: string;
  tempo: number;
  giveFirstNote: boolean;
  countIn: boolean;
  limitPlays: boolean;
}

export const gehoerDiktat: Generator<Filters> = {
  id: 'melodiediktat',
  topic: 'melodie',
  skill: 'hoeren',
  version: 1,
  title: 'Rhythmus- und Melodiediktat',
  instruction:
    'Du hörst eine Melodie. Notiere den Rhythmus und wenn du kannst, auch die Tonhöhen. Ist die erste Note vorgegeben, steht sie schon im System.',
  hint: 'Rhythmus und Tonhöhen werden getrennt bewertet — ein verpasster Notenwert kostet die Tonhöhenpunkte nicht.',

  filters: [
    { kind: 'range', key: 'bars', label: 'Länge', min: 2, max: 8, unit: 'Takte' },
    { kind: 'single', key: 'timeSignature', label: 'Taktart', options: TIME_OPTIONS },
    { kind: 'multi', key: 'keys', label: 'Tonarten', options: KEY_OPTIONS },
    {
      kind: 'single',
      key: 'scale',
      label: 'Tongeschlecht',
      options: SCALE_OPTIONS,
      hint: 'Bei Moll gilt die Tonart als Paralleltonart — «C-Dur» wird dann zu a-Moll.',
    },
    {
      kind: 'multi',
      key: 'durations',
      label: 'Erlaubte Notenwerte',
      options: DURATION_OPTIONS,
      hint: 'Es müssen Werte dabei sein, mit denen sich ein Takt genau füllen lässt.',
    },
    { kind: 'single', key: 'span', label: 'Tonumfang', options: SPAN_OPTIONS },
    { kind: 'single', key: 'maxLeap', label: 'Grösster Sprung', options: LEAP_OPTIONS },
    { kind: 'range', key: 'tempo', label: 'Tempo', min: 50, max: 120, step: 2, unit: 'bpm' },
    {
      kind: 'toggle',
      key: 'giveFirstNote',
      label: 'Erste Note vorgeben',
      hint: 'Ohne Vorgabe musst du die Lage selbst finden — deutlich schwerer.',
    },
    { kind: 'toggle', key: 'countIn', label: 'Einzählen' },
    { kind: 'toggle', key: 'limitPlays', label: `Wiedergaben begrenzen (${LIMITED_PLAYS}×)` },
  ],

  defaults: {
    bars: 4,
    timeSignature: '4/4',
    keys: ['C-Dur', 'G-Dur', 'F-Dur'],
    scale: 'dur',
    durations: ['h', 'q', '8'],
    span: '7',
    maxLeap: '2',
    tempo: 76,
    giveFirstNote: true,
    countIn: true,
    limitPlays: false,
  },

  generate(values, rng: Rng): Question {
    const bars = Math.round(range(values, 'bars', 4));
    const timeSignature = single(values, 'timeSignature', '4/4');
    const keys = multi(values, 'keys', this.defaults.keys);
    const scale = single(values, 'scale', 'dur') as ScaleType;
    const durationValues = multi(values, 'durations', this.defaults.durations);
    const span = Number(single(values, 'span', '7'));
    const maxLeap = Number(single(values, 'maxLeap', '2'));
    const tempo = Math.round(range(values, 'tempo', 76));
    const giveFirstNote = toggle(values, 'giveFirstNote', true);
    const countIn = toggle(values, 'countIn', true);
    const limitPlays = toggle(values, 'limitPlays', false);

    const keyName = rng.pick(keys);
    const key = keyByName(keyName);
    // Bei Moll ist der Grundton die Paralleltonart — gleiche Vorzeichen,
    // anderer Bezugston. Genau so steht es im Quintenzirkel des Theoriekerns.
    const tonicName =
      scale === 'dur' ? key.major.replace(/-Dur$/i, '') : key.minor.replace(/-Moll$/i, '');
    const tonic = placeInSingingRange(tonicPitchFromName(tonicName), span);

    const durations = durationValues.map(parseDurationValue);
    const options: MelodyOptions = { bars, timeSignature, tonic, scale, durations, span, maxLeap };

    insist(
      usableDurations(measureCapacity(timeSignature), durations).length > 0,
      `Mit «${durationValues.join(', ')}» lässt sich kein ${timeSignature}-Takt genau füllen. ` +
        'Wähle zusätzlich einen Wert, der in den Takt aufgeht.',
    );

    const measures = generateMelody(rng, options);
    const id = taskId('gd', rng);

    // Ausgangslage: leere Takte, auf Wunsch mit vorgegebener erster Note.
    const score: NotationTask['score'] = {
      clef: 'treble',
      keySignature: vexKeySignature(key.accidentals),
      timeSignature,
      endBar: true,
      measures: Array.from({ length: bars }, (_, bar) => ({
        notes: bar === 0 && giveFirstNote ? [measures[0][0]] : [],
      })),
    };

    const noteCount = measures.flat().length;
    const task: NotationTask = {
      id,
      kind: 'notation',
      mode: 'melody',
      // Die Punkte teilen sich hälftig auf Rhythmus und Tonhöhen auf.
      // Ein Punkt je Note macht die Rückmeldung lesbar.
      points: noteCount * 2,
      score,
      solution: {
        type: 'melody',
        measures,
        pitchPoints: noteCount,
        rhythmPoints: noteCount,
      },
    };

    return {
      task,
      audio: { id, kind: 'melody', tempo, countIn },
      melody: toAudioEvents(measures),
      context: buildContext(bars, timeSignature, keyName, scale, giveFirstNote, measures),
      maxPlays: limitPlays ? LIMITED_PLAYS : undefined,
      allowSlow: true,
    };
  },
};

/**
 * Legt den Grundton in die Oktave, in der die Melodie am besten im
 * Violinschlüssel liegt.
 *
 * Nötig, weil die Tonarten sehr unterschiedlich hohe Grundtöne haben: eine
 * Dezime über h¹ ragt weit über das System hinaus, dieselbe Dezime über des¹
 * passt bequem hinein. Gesucht ist also die Oktave, in der die MITTE des
 * Tonumfangs möglichst nahe an der Mitte des Systems (h¹) liegt.
 */
function placeInSingingRange(tonic: Pitch, span: number): Pitch {
  // Dieselbe Umfangsrechnung wie in melody.ts: der Gang beginnt ein Drittel
  // des Umfangs unter dem Grundton.
  const lowestDegree = -Math.floor(span / 3);
  const centreDegree = lowestDegree + span / 2;
  // Eine Tonleiterstufe sind im Schnitt 12/7 Halbtöne.
  const centreOffset = (centreDegree * 12) / 7;

  const middleOfStaff = midi(parsePitch('h4'));
  let best = { ...tonic, octave: 4 };
  for (const octave of [3, 4, 5]) {
    const candidate = { ...tonic, octave };
    const distance = Math.abs(midi(candidate) + centreOffset - middleOfStaff);
    if (distance < Math.abs(midi(best) + centreOffset - middleOfStaff)) best = candidate;
  }
  return best;
}

/** Melodie in Klangereignisse für den Abspieler. */
export function toAudioEvents(measures: NoteSpec[][]): AudioEvent[] {
  return measures.flat().map((note) => ({
    pitches: note.keys?.length ? [parsePitch(note.keys[0])] : [],
    quarters: durationInQuarters(note.duration, note.dotted),
  }));
}

/** Die Eckdaten der Melodie in einer Zeile: «4 Takte, 4/4-Takt, G-Dur, beginnt mit g1». */
function buildContext(
  bars: number,
  timeSignature: string,
  keyName: string,
  scale: ScaleType,
  giveFirstNote: boolean,
  measures: NoteSpec[][],
): string {
  const gender = scale === 'dur' ? keyName : keyByName(keyName).minor;
  const first = measures[0][0];
  // `toGermanPitch()` schreibt die Lage deutsch: G4 → «g1».
  const parts = [`${bars} Takte`, `${timeSignature}-Takt`, gender];
  if (giveFirstNote && first.keys?.length) {
    parts.push(`beginnt mit ${toGermanPitch(parsePitch(first.keys[0]))}`);
  }
  return parts.join(', ');
}
