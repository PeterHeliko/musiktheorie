/**
 * Septakkorde in Grundstellung — vier Töne eng über dem Grundton.
 *
 * Gefragt ist beim Benennen die Art, ein Tipp (Entscheid 2026-11-24); unter
 * «Gefragt ist» lässt sich der Grundton dazunehmen. Wie die Arten heissen —
 * als Akkordsymbol (Vorgabe) oder ausgeschrieben —, stellt man unter
 * «Bezeichnung» ein.
 *
 * Gemeinsames in `septakkorde-shared.ts`, Notenbild und Singen von den
 * Dreiklängen (`dreiklaenge-shared.ts`).
 */

import type { ChordRule, KeyboardTask, NotationTask, SelectField, SelectTask } from '../content/schema';
import { INTERVAL_KEYBOARD, KEY_NAMES, chordExamples, isWhiteKey, keyNames, keysBetween } from '../music/piano';
import { judgeChordKeys, judgeChordNotes } from '../scoring/chord';
import { SEVENTH_SEMITONES, analyseSeventh, midi, type Pitch, type SeventhQuality } from '../music/theory';
import {
  CLEF_FILTER,
  ROOT_FILTER,
  SING_DEFAULTS,
  SING_FILTERS,
  SING_HINT,
  STAFF_WINDOWS,
  chordSingTask,
  chordSpace,
  octavePlacements,
  placeInVoice,
  rootPolicy,
  staffRootNames,
  type RootAnswer,
  type RootPolicy,
} from './dreiklaenge-shared';
import {
  ROOT_OPTION,
  SEVENTH_QUALITIES,
  TYPE_OPTION,
  WORDING_FILTER,
  buildSeventh,
  chosenSevenths,
  readSeventhKeys,
  seventhAskInstruction,
  seventhFields,
  seventhHint,
  seventhKeyHint,
  seventhName,
  seventhQualityFilter,
  seventhRootClasses,
  SING_REACH,
  wordingOf,
  type Wording,
} from './septakkorde-shared';
import type { Rng } from './rng';
import { insist, noteName, pitchKey, taskId, wholeNoteScore, type Window } from './shared';
import { multi, single, toggle, type FilterValues, type Generator, type Personal, type Question } from './types';
import { DEFAULT_VOICE, VOICE_RANGES } from '../sing/voice';

const LIMITED_PLAYS = 3;

/** Alle Septakkorde dieser Art in Grundstellung, deren Töne im Fenster liegen. */
function chordsIn(quality: SeventhQuality, policy: RootPolicy, window: Window): Pitch[][] {
  return seventhRootClasses(policy, quality).flatMap((root) =>
    octavePlacements(buildSeventh({ ...root, octave: 4 }, quality), window),
  );
}

/**
 * Unabhängig nachgerechnet: der Theoriekern sieht in den Tönen genau diese
 * Art in Grundstellung, über diesem Grundton.
 */
function checkChord(stack: Pitch[], quality: SeventhQuality): void {
  const shown = stack.map(pitchKey).join(' ');
  const analysis = analyseSeventh(stack);
  insist(analysis !== null, `${shown} ist kein Septakkord`);
  insist(analysis!.quality === quality, `${shown} ist ${analysis!.quality}, nicht ${quality}`);
  insist(analysis!.inversion === 'grundstellung', `${shown} steht nicht in Grundstellung`);
  insist(pitchKey(analysis!.root) === pitchKey(stack[0]), `${shown}: Grundton nicht unten`);
}

/**
 * Dasselbe nur aus den Tasten: vier Tasten im Abstand dieser Art. Beim
 * verminderten Septakkord sagen die Tasten den Grundton nicht — hier ist er
 * der tiefste, und das genügt.
 */
function checkKeys(keys: number[], quality: SeventhQuality): void {
  const offsets = SEVENTH_SEMITONES[quality];
  insist(
    keys.length === 4 && offsets.every((offset, index) => keys[index + 1] - keys[0] === offset),
    `Tasten ${keys.join(' ')} sind kein ${quality} in Grundstellung`,
  );
  if (quality !== 'vermindert') {
    const read = readSeventhKeys(keys, quality);
    insist(read !== null && read.bass === 0, `Tasten ${keys.join(' ')}: Grundton nicht unten`);
  }
}

/** Was beim Benennen gefragt sein kann: Grundton und Art. */
const ASK_FILTER = {
  kind: 'multi' as const,
  key: 'ask',
  label: 'Gefragt ist',
  options: [ROOT_OPTION, TYPE_OPTION],
};

function namingFields(
  ask: string[],
  quality: SeventhQuality,
  qualities: readonly SeventhQuality[],
  root: RootAnswer,
  wording: Wording,
): SelectField[] {
  return seventhFields({ ask, inversions: [], positions: [], withBass: false }, { root, quality, qualities }, wording);
}

/** Die Namen der weissen Tasten, c bis h. */
const WHITE_KEY_NAMES = keysBetween(60, 71).filter(isWhiteKey).flatMap(keyNames);

const ALL_SEVENTHS = [...SEVENTH_QUALITIES];

// ---------------------------------------------------------------------------
// In Noten benennen
// ---------------------------------------------------------------------------

interface NamingFilters extends FilterValues {
  ask: string[];
  chordTypes: string[];
  wording: string;
  clefs: string[];
  accidentals: string;
}

export const septakkordeBenennen: Generator<NamingFilters> = {
  id: 'septakkorde-benennen',
  topic: 'septakkorde',
  group: 'grundstellung',
  skill: 'erkennen',
  version: 1,
  title: 'Septakkorde in Noten benennen',
  instruction: seventhAskInstruction(['type'], 'des Septakkords'),
  hint: seventhHint(ALL_SEVENTHS, 'symbole'),

  filters: [ASK_FILTER, seventhQualityFilter(), WORDING_FILTER, CLEF_FILTER, ROOT_FILTER],

  defaults: { ask: ['type'], chordTypes: ALL_SEVENTHS, wording: 'symbole', clefs: ['treble'], accidentals: 'einfach' },

  generate(values, rng: Rng): Question {
    const ask = multi(values, 'ask', this.defaults.ask);
    const qualities = chosenSevenths(values, this.defaults.chordTypes);
    const wording = wordingOf(values);
    const clefs = multi(values, 'clefs', this.defaults.clefs);
    const policy = rootPolicy(values);

    const quality = rng.pick(qualities);
    const clef = rng.pick(clefs) as 'treble' | 'bass';
    const stack = rng.pick(chordsIn(quality, policy, STAFF_WINDOWS[clef]));
    checkChord(stack, quality);

    const task: SelectTask = {
      id: taskId('sb', rng),
      kind: 'select',
      score: wholeNoteScore(stack.map(pitchKey), clef, { width: 150, space: chordSpace(clefs) }),
      fields: namingFields(
        ask,
        quality,
        qualities,
        { correct: [noteName(stack[0]).toLowerCase()], names: staffRootNames(policy) },
        wording,
      ),
    };
    return {
      task,
      afterSound: stack.map(pitchKey),
      hint: seventhHint(qualities, wording),
      instruction: seventhAskInstruction(ask, 'des Septakkords'),
    };
  },
};

// ---------------------------------------------------------------------------
// Notieren
// ---------------------------------------------------------------------------

interface WritingFilters extends FilterValues {
  chordTypes: string[];
  wording: string;
  clefs: string[];
  accidentals: string;
}

export const septakkordeNotieren: Generator<WritingFilters> = {
  id: 'septakkorde-notieren',
  topic: 'septakkorde',
  group: 'grundstellung',
  skill: 'notieren',
  version: 1,
  title: 'Septakkorde notieren',
  instruction: 'Setze den genannten Septakkord in Grundstellung ins System: der Grundton liegt unten.',
  hint:
    'Tippe die Stelle im System an oder ziehe dorthin; noch einmal antippen nimmt den Ton weg. ' +
    'Das Vorzeichen wählst du vorher in der Werkzeugleiste. Jede Oktave zählt, Töne verdoppeln ist erlaubt.',

  filters: [seventhQualityFilter(), WORDING_FILTER, CLEF_FILTER, ROOT_FILTER],

  defaults: { chordTypes: ALL_SEVENTHS, wording: 'symbole', clefs: ['treble'], accidentals: 'einfach' },

  generate(values, rng: Rng): Question {
    const qualities = chosenSevenths(values, this.defaults.chordTypes);
    const wording = wordingOf(values);
    const clefs = multi(values, 'clefs', this.defaults.clefs);
    const policy = rootPolicy(values);

    const quality = rng.pick(qualities);
    const clef = rng.pick(clefs) as 'treble' | 'bass';
    const stack = rng.pick(chordsIn(quality, policy, STAFF_WINDOWS[clef]));
    checkChord(stack, quality);

    const rule: ChordRule = { tones: stack.map(pitchKey), lowest: 0 };
    insist(judgeChordNotes(rule, stack).correct, `${stack.map(pitchKey).join(' ')} verfehlt die eigene Regel`);

    const task: NotationTask = {
      id: taskId('sn', rng),
      kind: 'notation',
      mode: 'chord',
      prompt: seventhName(stack[0], quality, wording),
      points: 2,
      score: {
        clef,
        width: 170,
        scale: 2,
        measures: [{ notes: [{ duration: 'w', placeholder: true, annotation: '?' }] }],
      },
      solution: { type: 'chord', rule, example: { upper: stack.map(pitchKey) } },
    };
    return { task, afterSound: stack.map(pitchKey) };
  },
};

// ---------------------------------------------------------------------------
// Auf Klaviatur benennen
// ---------------------------------------------------------------------------

interface KeyNamingFilters extends FilterValues {
  ask: string[];
  chordTypes: string[];
  wording: string;
  accidentals: string;
}

export const septakkordeKlaviaturBenennen: Generator<KeyNamingFilters> = {
  id: 'septakkorde-klaviatur-benennen',
  topic: 'septakkorde',
  group: 'grundstellung',
  skill: 'klaviatur',
  version: 1,
  title: 'Septakkorde auf Klaviatur benennen',
  instruction: seventhAskInstruction(['type'], 'des Septakkords auf den markierten Tasten'),
  hint: `${seventhKeyHint(ALL_SEVENTHS, 'symbole')} Eine schwarze Taste hat zwei Namen; beide sind richtig.`,

  filters: [ASK_FILTER, seventhQualityFilter(), WORDING_FILTER, ROOT_FILTER],

  defaults: { ask: ['type'], chordTypes: ALL_SEVENTHS, wording: 'symbole', accidentals: 'einfach' },

  generate(values, rng: Rng): Question {
    const ask = multi(values, 'ask', this.defaults.ask);
    const qualities = chosenSevenths(values, this.defaults.chordTypes);
    const wording = wordingOf(values);
    const policy = rootPolicy(values);

    const quality = rng.pick(qualities);
    const stack = rng.pick(chordsIn(quality, policy, INTERVAL_KEYBOARD));
    checkChord(stack, quality);
    const keys = stack.map(midi);
    checkKeys(keys, quality);

    const task: SelectTask = {
      id: taskId('skb', rng),
      kind: 'select',
      keyboard: { ...INTERVAL_KEYBOARD, marked: keys },
      fields: namingFields(
        ask,
        quality,
        qualities,
        { correct: keyNames(keys[0]), names: policy === 'stammton' ? WHITE_KEY_NAMES : KEY_NAMES },
        wording,
      ),
    };
    return {
      task,
      afterSound: stack.map(pitchKey),
      instruction: seventhAskInstruction(ask, 'des Septakkords auf den markierten Tasten'),
      hint: `${seventhKeyHint(qualities, wording)} Eine schwarze Taste hat zwei Namen; beide sind richtig.`,
    };
  },
};

// ---------------------------------------------------------------------------
// Auf Klaviatur spielen
// ---------------------------------------------------------------------------

interface KeyPlayingFilters extends FilterValues {
  chordTypes: string[];
  wording: string;
  accidentals: string;
}

export const septakkordeKlaviaturSpielen: Generator<KeyPlayingFilters> = {
  id: 'septakkorde-klaviatur-spielen',
  topic: 'septakkorde',
  group: 'grundstellung',
  skill: 'klaviatur',
  version: 1,
  title: 'Septakkorde auf Klaviatur spielen',
  instruction: 'Spiele den genannten Septakkord in Grundstellung: der Grundton liegt unten.',
  hint:
    'Tippe die Tasten an; noch einmal antippen nimmt eine weg. Jede Oktave zählt, Töne verdoppeln ist erlaubt. ' +
    'Mit «Prüfen» gibst du den Akkord ab.',

  filters: [seventhQualityFilter(), WORDING_FILTER, ROOT_FILTER],

  defaults: { chordTypes: ALL_SEVENTHS, wording: 'symbole', accidentals: 'einfach' },

  generate(values, rng: Rng): Question {
    const qualities = chosenSevenths(values, this.defaults.chordTypes);
    const wording = wordingOf(values);
    const policy = rootPolicy(values);

    const quality = rng.pick(qualities);
    const stack = rng.pick(chordsIn(quality, policy, INTERVAL_KEYBOARD));
    checkChord(stack, quality);
    const keys = stack.map(midi);
    checkKeys(keys, quality);

    // Die Regel muss die eigene Lösung annehmen, und die Klaviatur muss eine
    // richtige Lage zeigen können, wenn falsch gespielt wurde.
    const rule: ChordRule = { tones: stack.map(pitchKey), lowest: 0 };
    insist(judgeChordKeys(rule, keys).correct, `${stack.map(pitchKey).join(' ')} verfehlt die eigene Regel`);
    insist(
      chordExamples(keys.map((key) => key % 12), rule, INTERVAL_KEYBOARD.low, INTERVAL_KEYBOARD.high).length > 0,
      'keine Lage zum Zeigen',
    );

    const task: KeyboardTask = {
      id: taskId('sks', rng),
      kind: 'keyboard',
      prompt: seventhName(stack[0], quality, wording),
      keyboard: { ...INTERVAL_KEYBOARD },
      accept: keys,
      chord: rule,
      sound: true,
      describe: { by: 'chord' },
      points: 2,
    };
    return { task, afterSound: stack.map(pitchKey) };
  },
};

// ---------------------------------------------------------------------------
// Hörend erkennen
// ---------------------------------------------------------------------------

/** Wo die Akkorde beim Hören liegen: angenehm, nicht zu tief. */
const HEARING_WINDOW: Window = { low: 50, high: 77 };

interface HearingFilters extends FilterValues {
  chordTypes: string[];
  wording: string;
  playback: string;
  limitPlays: boolean;
}

export const septakkordeHoeren: Generator<HearingFilters> = {
  id: 'septakkorde-hoeren',
  topic: 'septakkorde',
  group: 'grundstellung',
  skill: 'hoeren',
  version: 1,
  title: 'Septakkorde hörend erkennen',
  instruction: 'Du hörst den Septakkord gebrochen und dann zusammen. Bestimme die Art.',

  filters: [
    seventhQualityFilter(),
    WORDING_FILTER,
    {
      kind: 'single',
      key: 'playback',
      label: 'Wiedergabe',
      options: [
        { value: 'beides', label: 'gebrochen, dann zusammen' },
        { value: 'zusammen', label: 'nur zusammen' },
      ],
    },
    { kind: 'toggle', key: 'limitPlays', label: `Wiedergaben begrenzen (${LIMITED_PLAYS}×)` },
  ],

  defaults: { chordTypes: ALL_SEVENTHS, wording: 'symbole', playback: 'beides', limitPlays: false },

  generate(values, rng: Rng): Question {
    const qualities = chosenSevenths(values, this.defaults.chordTypes);
    const wording = wordingOf(values);
    const broken = single(values, 'playback', 'beides') !== 'zusammen';
    const limitPlays = toggle(values, 'limitPlays', false);

    const quality = rng.pick(qualities);
    const stack = rng.pick(chordsIn(quality, 'einfach', HEARING_WINDOW));
    checkChord(stack, quality);

    const id = taskId('gs', rng);
    return {
      task: {
        id,
        kind: 'select',
        fields: namingFields(['type'], quality, qualities, { correct: [], names: [] }, wording),
      },
      audio: { id, kind: 'voicing', notes: stack.map(pitchKey), broken },
      instruction: broken
        ? 'Du hörst den Septakkord gebrochen und dann zusammen. Bestimme die Art.'
        : 'Du hörst den Septakkord als Zusammenklang. Bestimme die Art.',
      maxPlays: limitPlays ? LIMITED_PLAYS : undefined,
    };
  },
};

// ---------------------------------------------------------------------------
// Singen
// ---------------------------------------------------------------------------

interface SingingFilters extends FilterValues {
  chordTypes: string[];
  wording: string;
  accidentals: string;
  clefs: string[];
  tolerance: string;
  untilRight: boolean;
}

export const septakkordeSingen: Generator<SingingFilters> = {
  id: 'septakkorde-singen',
  topic: 'septakkorde',
  group: 'grundstellung',
  skill: 'singen',
  version: 1,
  title: 'Septakkorde singen',
  instruction:
    'Du hörst den Grundton. Singe den Septakkord Ton für Ton von unten nach oben; den Grundton darfst du mitsingen.',
  hint: SING_HINT,

  filters: [seventhQualityFilter(), WORDING_FILTER, ROOT_FILTER, ...SING_FILTERS],

  defaults: { chordTypes: ALL_SEVENTHS, wording: 'symbole', accidentals: 'einfach', ...SING_DEFAULTS },

  generate(values, rng: Rng, personal?: Personal): Question {
    const qualities = chosenSevenths(values, this.defaults.chordTypes);
    const wording = wordingOf(values);
    const policy = rootPolicy(values);
    const clefs = multi(values, 'clefs', this.defaults.clefs);
    const tolerance = Number(single(values, 'tolerance', '50'));
    const untilRight = toggle(values, 'untilRight', false);
    const range = VOICE_RANGES[personal?.voice ?? DEFAULT_VOICE];

    const quality = rng.pick(qualities);
    const root = rng.pick(seventhRootClasses(policy, quality));
    const stack = placeInVoice(rng, buildSeventh({ ...root, octave: 4 }, quality), range);
    checkChord(stack, quality);
    const clef = rng.pick(clefs) as 'treble' | 'bass';

    const task = chordSingTask(taskId('ssi', rng), seventhName(stack[0], quality, wording), stack, {
      clef,
      range,
      tolerance,
      untilRight,
      reach: SING_REACH,
    });
    return { task };
  },
};
