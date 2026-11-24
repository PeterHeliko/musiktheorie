/**
 * Tonleitern — notieren, auf der Klaviatur markieren, singen.
 *
 * Alle drei teilen die Auswahl (Entscheid 2026-11-24): neun Tonleiterarten,
 * Dur und die drei Moll vorgegeben, die Kirchentonarten zuschaltbar; dazu die
 * höchste Zahl Vorzeichen der Tonart und die Richtung. Die Tonleitern selbst
 * stehen in music/scales.ts.
 */

import { OPTION_SETS } from '../content/options';
import type { KeyboardTask, NoteSpec, NotationTask } from '../content/schema';
import { INTERVAL_KEYBOARD } from '../music/piano';
import {
  MAJOR_MINOR,
  checkScale,
  scaleName,
  scalePitches,
  scaleTonics,
  type ScaleDirection,
  type ScaleType,
} from '../music/scales';
import { staffSpace } from '../music/staff-space';
import { midi, type Pitch } from '../music/theory';
import { DEFAULT_VOICE, VOICE_RANGES } from '../sing/voice';
import {
  SING_DEFAULTS,
  SING_FILTERS,
  SING_HINT,
  chordSingTask,
  metronomeOf,
  placeInVoice,
  withTempo,
} from './dreiklaenge-shared';
import type { Rng } from './rng';
import { CLEF_OPTIONS, candidatePitches, insist, pitchKey, taskId } from './shared';
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

/**
 * Die acht Töne der gewürfelten Leiter in der Lage für diesen Schlüssel,
 * nachgerechnet: jeder Schritt eine Stufe weiter und so gross wie im Lehrbuch.
 */
function placedScale(choice: ScaleChoice, clef: 'treble' | 'bass'): Pitch[] {
  const pitches = scalePitches(placeTonic(choice.tonic, clef), choice.type, choice.direction);
  const problem = checkScale(pitches, choice.type, choice.direction);
  insist(problem === null, `${scalePrompt(choice)}: ${problem}`);
  return pitches;
}

/**
 * Wie weit Tonleitern in diesem Schlüssel reichen: placeTonic legt den
 * Grundton um c¹ bzw. G, die Oktave darüber dazu — mit Vorzeichen.
 */
const SCALE_SPACE = {
  treble: staffSpace('treble', candidatePitches({ low: 54, high: 79 }, [-1, 0, 1])),
  bass: staffSpace('bass', candidatePitches({ low: 37, high: 58 }, [-1, 0, 1])),
};

const MAX_ACCIDENTALS_FILTER: FilterSpec = {
  kind: 'range',
  key: 'maxAccidentals',
  label: 'Höchstens',
  min: 0,
  max: 7,
  unit: 'Vorzeichen',
  hint: 'Gemeint sind die Vorzeichen der Tonart, bei den Kirchentonarten die der Durtonart, aus der sie stammen.',
};

// ---------------------------------------------------------------------------
// Tonleitern notieren
// ---------------------------------------------------------------------------

interface WritingFilters extends FilterValues {
  scales: string[];
  maxAccidentals: number;
  directions: string[];
  clefs: string[];
}

/**
 * Der Grundton steht da, die übrigen sieben Töne werden gesetzt, jeder an
 * seinem Platz (Entscheid 2026-11-24): ziehen setzt beim Loslassen, neu ziehen
 * ersetzt. Vorzeichen stehen vor den Noten, ohne Tonartvorzeichen — so geht
 * es für jede Leiter gleich, auch für harmonisch Moll und die Kirchentonarten.
 * Jeder Ton zählt einzeln; nach dem Prüfen steht ein falscher rot, der
 * richtige grün daneben.
 */
export const tonleiternNotieren: Generator<WritingFilters> = {
  id: 'tonleitern-notieren',
  topic: 'tonleitern',
  skill: 'notieren',
  version: 1,
  title: 'Tonleitern notieren',
  instruction:
    'Notiere die Tonleiter, mit den Vorzeichen vor den Noten. Der Grundton steht schon da; ihn am Ende zu wiederholen, ist freigestellt.',
  hint: 'Wähle ♭, ♮ oder ♯ für den nächsten Ton und ziehe ihn auf seine Tonhöhe, gern auch neben der Note. Gesetzt wird beim Loslassen in den blauen Platz; die Nummern wählen einen anderen.',

  filters: [
    SCALE_FILTER,
    MAX_ACCIDENTALS_FILTER,
    DIRECTION_FILTER,
    { kind: 'multi', key: 'clefs', label: 'Schlüssel', options: CLEF_OPTIONS },
  ],

  defaults: {
    scales: DEFAULT_SCALES,
    maxAccidentals: 4,
    directions: ['up'],
    clefs: ['treble'],
  },

  generate(values, rng: Rng): Question {
    const choice = pickScale(values, rng);
    const clef = rng.pick(multi(values, 'clefs', this.defaults.clefs)) as 'treble' | 'bass';
    const pitches = placedScale(choice, clef);

    const notes: NoteSpec[] = pitches.map((pitch, index) =>
      index === 0
        ? { keys: [pitchKey(pitch)], duration: 'w' }
        : { duration: 'w', placeholder: true },
    );
    const task: NotationTask = {
      id: taskId('tln', rng),
      kind: 'notation',
      mode: 'pitch',
      prompt: scalePrompt(choice),
      // Ein Punkt je verlangtem Ton; die freie Oktave zählt erst, wenn sie dasteht.
      points: 6,
      // Breit genug für acht Ganze mit Vorzeichen; auf dem Telefon wird das
      // Bild dafür kleiner als beim Intervall, quer passt es sich der Höhe an.
      // Die Nummern der Plätze stehen als Knöpfe darunter (NotationInput).
      score: {
        clef,
        width: 340,
        scale: 2,
        fit: { maxScale: 2, minScale: 1 },
        // Platz über und unter dem System nur so weit, wie die Leitern reichen,
        // für alle Aufgaben in diesem Schlüssel gleich: quer zählt jede Zeile.
        space: SCALE_SPACE[clef],
        endBar: true,
        measures: [{ notes }],
      },
      solution: {
        type: 'pitch',
        // Die Oktave am Ende darf fehlen (Entscheid 2026-11-24).
        slots: pitches.slice(1).map((pitch, index) => ({
          slot: index + 1,
          accept: [pitchKey(pitch)],
          ...(index === 6 ? { optional: true } : {}),
        })),
      },
    };
    return { task };
  },
};

// ---------------------------------------------------------------------------
// Tonleitern auf der Klaviatur markieren
// ---------------------------------------------------------------------------

interface KeyboardFilters extends FilterValues {
  scales: string[];
  maxAccidentals: number;
  directions: string[];
}

/**
 * Der Grundton ist blau markiert, die übrigen Töne bis zur Oktave werden
 * angetippt (Entscheid 2026-11-24): jedes Antippen nimmt eine Taste dazu
 * oder weg und lässt sie klingen. Richtig ist genau diese Menge — die
 * Reihenfolge des Antippens zählt nicht. Aufwärts liegt der Grundton in der
 * unteren Oktave, abwärts in der oberen; so hat die Leiter auf den zwei
 * Oktaven immer Platz.
 */
export const tonleiternKlaviatur: Generator<KeyboardFilters> = {
  id: 'tonleitern-klaviatur',
  topic: 'tonleitern',
  skill: 'klaviatur',
  version: 1,
  title: 'Tonleitern auf Klaviatur markieren',
  instruction: 'Markiere die Töne der Tonleiter ab dem blauen Grundton; seine Oktave darfst du dazunehmen.',
  hint: 'Antippen nimmt eine Taste dazu, noch einmal antippen nimmt sie wieder weg.',

  filters: [SCALE_FILTER, MAX_ACCIDENTALS_FILTER, DIRECTION_FILTER],

  defaults: {
    scales: DEFAULT_SCALES,
    maxAccidentals: 4,
    directions: ['up'],
  },

  generate(values, rng: Rng): Question {
    const choice = pickScale(values, rng);
    // Der tiefe Grundton klingend in der unteren Oktave (ces³ klingt als h,
    // his³ als c¹ — die werden verschoben); abwärts beginnt die Leiter auf
    // seiner Oktave.
    const below = { ...choice.tonic, octave: 3 };
    const shift = midi(below) < INTERVAL_KEYBOARD.low ? 1 : midi(below) > INTERVAL_KEYBOARD.low + 11 ? -1 : 0;
    const tonic = { ...below, octave: 3 + shift };
    const pitches = scalePitches(tonic, choice.type, choice.direction);
    const problem = checkScale(pitches, choice.type, choice.direction);
    insist(problem === null, `${scalePrompt(choice)}: ${problem}`);

    const keys = pitches.map(midi);
    insist(
      keys.every((key) => key >= INTERVAL_KEYBOARD.low && key <= INTERVAL_KEYBOARD.high),
      `${scalePrompt(choice)} passt nicht auf die Klaviatur`,
    );
    const task: KeyboardTask = {
      id: taskId('tlk', rng),
      kind: 'keyboard',
      prompt: scalePrompt(choice),
      keyboard: { ...INTERVAL_KEYBOARD, marked: [keys[0]] },
      accept: keys.slice(1).sort((a, b) => a - b),
      // Die Oktave des Grundtons darf fehlen (Entscheid 2026-11-24).
      optional: [keys[7]],
      scale: true,
      sound: true,
      describe: { by: 'scale' },
      points: 2,
    };
    return { task };
  },
};

// ---------------------------------------------------------------------------
// Tonleitern singen
// ---------------------------------------------------------------------------

interface SingingFilters extends FilterValues {
  scales: string[];
  maxAccidentals: number;
  directions: string[];
  clefs: string[];
  tolerance: string;
  metronome: string;
}

/**
 * Wie Dreiklänge singen (Entscheid 2026-11-24): der Grundton erklingt und
 * steht im System, Platz für alle acht Töne; gesungen wird Ton für Ton, jeder
 * in beliebiger Oktave. Ein falscher Ton steht rot an seinem Platz, und es
 * geht weiter, bis der richtige kommt (`judgeSequence`). Mit Metronom ein Ton
 * je Schlag (`judgeTimed`). Abwärts beginnt die Leiter auf dem oberen
 * Grundton. Nach dem Urteil spielt «Abspielen» die Leiter, ohne Zusammenklang.
 */
export const tonleiternSingen: Generator<SingingFilters> = {
  id: 'tonleitern-singen',
  topic: 'tonleitern',
  skill: 'singen',
  version: 1,
  title: 'Tonleitern singen',
  instruction:
    'Du hörst den Grundton. Singe die Tonleiter Ton für Ton; den Grundton darfst du mitsingen. Nach dem siebten Ton ist sie fertig, die Oktave ist freigestellt.',
  hint: SING_HINT,

  filters: [SCALE_FILTER, MAX_ACCIDENTALS_FILTER, DIRECTION_FILTER, ...SING_FILTERS],

  defaults: {
    scales: DEFAULT_SCALES,
    maxAccidentals: 4,
    directions: ['up'],
    ...SING_DEFAULTS,
  },

  generate(values, rng: Rng, personal?: Personal): Question {
    const choice = pickScale(values, rng);
    const clef = rng.pick(multi(values, 'clefs', this.defaults.clefs)) as 'treble' | 'bass';
    const tolerance = Number(single(values, 'tolerance', '50'));
    const voiceRange = VOICE_RANGES[personal?.voice ?? DEFAULT_VOICE];

    // Art, Grundton und Richtung stehen fest, bevor die Stimmlage zählt:
    // derselbe Aufgabenlink fragt bei allen dieselbe Leiter, in der eigenen Lage.
    const pitches = scalePitches(choice.tonic, choice.type, choice.direction);
    const placed = placeInVoice(rng, pitches, voiceRange);
    const problem = checkScale(placed, choice.type, choice.direction);
    insist(problem === null, `${scalePrompt(choice)}: ${problem}`);

    const task = {
      ...chordSingTask(taskId('tls', rng), scalePrompt(choice), placed, {
        clef,
        range: voiceRange,
        tolerance,
        tempo: metronomeOf(values),
      }),
      melodic: true,
      // Die Oktave am Ende ist frei (Entscheid 2026-11-24).
      optionalLast: true,
    };
    return { task, ...(task.tempo ? { instruction: withTempo(task, this.instruction) } : {}) };
  },
};
