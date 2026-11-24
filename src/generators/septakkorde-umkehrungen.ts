/**
 * Umkehrungen & Lagen der Septakkorde — welcher Akkordton liegt unten,
 * welcher oben?
 *
 *  - Umkehrung: der tiefste Ton. Grundton = Grundstellung, Terz =
 *    Quintsextakkord, Quinte = Terzquartakkord, Septime = Sekundakkord.
 *  - Lage: der höchste Ton. Grundton = Oktavlage, Terz = Terzlage, Quinte =
 *    Quintlage, Septime = Septlage.
 *
 * Ohne Basston stehen vier Töne eng, und die Lage folgt aus der Umkehrung;
 * mit Basston steht der Akkord vierstimmig, jeder Ton einmal (Entscheid
 * 2026-11-24, `septakkorde-shared.ts`).
 *
 * Beim Hören und beim Benennen auf der Klaviatur fehlt der verminderte
 * Septakkord: er teilt die Oktave in vier gleiche Teile, seine Umkehrungen
 * klingen und liegen gleich. Welcher Ton der Grundton ist, sagt allein die
 * Schreibweise — die es dort nicht gibt.
 */

import type { ChordRule, KeyboardTask, NotationTask, ScoreSpec, SelectTask } from '../content/schema';
import { INTERVAL_KEYBOARD, KEY_NAMES, chordExamples, isWhiteKey, keyNames, keysBetween } from '../music/piano';
import { judgeChordKeys, judgeChordNotes } from '../scoring/chord';
import {
  analyseSeventh,
  midi,
  type Pitch,
  type SeventhInversion,
  type SeventhPosition,
  type SeventhQuality,
} from '../music/theory';
import {
  CLEF_FILTER,
  GRAND_BASS_WINDOW,
  ROOT_FILTER,
  SING_DEFAULTS,
  SING_FILTERS,
  SING_HINT,
  STAFF_WINDOWS,
  chordSingTask,
  chordSpace,
  grandSpace,
  placeInVoice,
  rootPolicy,
  staffRootNames,
  umkehrungChoice,
  type RootPolicy,
  type UmkehrungChoice,
  type Voicing,
} from './dreiklaenge-shared';
import {
  ROOT_OPTION,
  SEVENTH_ASK_OPTIONS,
  SEVENTH_QUALITIES,
  SEVENTH_UMKEHRUNG_DEFAULTS,
  TYPE_OPTION,
  VIERSTIMMIG_HINT,
  WORDING_FILTER,
  buildSeventh,
  chosenSevenths,
  invertSeventh,
  pickSeventhInversionAndPosition,
  readSeventhKeys,
  seventhAskInstruction,
  seventhBassMember,
  seventhFields,
  seventhInversionPositionText,
  seventhName,
  seventhQualityFilter,
  seventhRootClasses,
  seventhTopMember,
  seventhUmkehrungFilters,
  seventhVoicings,
  SING_REACH,
  wordingOf,
  type Wording,
} from './septakkorde-shared';
import type { Rng } from './rng';
import { insist, noteName, pitchKey, taskId, type Window } from './shared';
import { multi, single, toggle, type FilterValues, type Generator, type Personal, type Question } from './types';
import { DEFAULT_VOICE, VOICE_RANGES } from '../sing/voice';

const LIMITED_PLAYS = 3;

/** Wo nur Klang oder Tasten zählen, fehlt der verminderte Septakkord. */
const SYMMETRIC: SeventhQuality = 'vermindert';
const AUDIBLE_SEVENTHS = SEVENTH_QUALITIES.filter((quality) => quality !== SYMMETRIC);

/** Alle Lagen eines Septakkords dieser Art mit dieser Umkehrung und Lage. */
function voicingsOf(
  quality: SeventhQuality,
  policy: RootPolicy,
  inversion: SeventhInversion,
  position: SeventhPosition,
  windows: { upper: Window; bass?: Window },
): { root: Pitch; voicing: Voicing }[] {
  return seventhRootClasses(policy, quality).flatMap((root) => {
    const chord = buildSeventh({ ...root, octave: 4 }, quality);
    return seventhVoicings(chord, inversion, position, windows).map((voicing) => ({ root: chord[0], voicing }));
  });
}

/**
 * Unabhängig nachgerechnet: der Theoriekern sieht in den Tönen genau den
 * Akkord, nach dem gefragt wird — Grundton, Art, Umkehrung, Lage —, und
 * vierstimmig kommt jeder Ton genau einmal vor.
 */
function checkVoicing(
  voicing: Voicing,
  root: Pitch,
  quality: SeventhQuality,
  inversion: SeventhInversion,
  position: SeventhPosition,
) {
  const shown = voicing.all.map(pitchKey).join(' ');
  const analysis = analyseSeventh(voicing.all);
  insist(analysis !== null, `${shown} ist kein Septakkord`);
  insist(analysis!.quality === quality, `${shown} ist ${analysis!.quality}, nicht ${quality}`);
  insist(analysis!.inversion === inversion, `${shown} ist ${analysis!.inversion}, nicht ${inversion}`);
  insist(analysis!.position === position, `${shown} steht in ${analysis!.position}, nicht ${position}`);
  insist(noteName(analysis!.root) === noteName(root), `${shown} hat den Grundton ${noteName(analysis!.root)}`);
  insist(voicing.all.length === 4, `${shown}: nicht vierstimmig`);
}

/** Dasselbe, nur aus den Tasten: sie sagen Umkehrung und Lage eindeutig. */
function checkKeys(keys: number[], quality: SeventhQuality, inversion: SeventhInversion, position: SeventhPosition) {
  const read = readSeventhKeys(keys, quality);
  insist(read !== null, `Tasten ${keys.join(' ')} sagen den Grundton nicht eindeutig`);
  insist(read!.bass === seventhBassMember(inversion), `Tasten ${keys.join(' ')}: unten nicht die ${inversion}`);
  insist(read!.top === seventhTopMember(position), `Tasten ${keys.join(' ')}: oben nicht die ${position}`);
}

/** Beim Benennen in Noten und auf der Klaviatur lässt sich alles vier fragen. */
const NAMING_ASK = [ROOT_OPTION, TYPE_OPTION, ...SEVENTH_ASK_OPTIONS];
/** Beim Hören kein Grundton — dafür bräuchte es das absolute Gehör. */
const HEARING_ASK = [TYPE_OPTION, ...SEVENTH_ASK_OPTIONS];

/** Die Namen der weissen Tasten, c bis h. */
const WHITE_KEY_NAMES = keysBetween(60, 71).filter(isWhiteKey).flatMap(keyNames);

const HINT =
  'Umkehrung: der tiefste Ton — Grundton = Grundstellung, Terz = Quintsextakkord, Quinte = Terzquartakkord, ' +
  'Septime = Sekundakkord. Lage: der höchste Ton — Grundton = Oktavlage, Terz = Terzlage, Quinte = Quintlage, ' +
  'Septime = Septlage.';

const DEFAULT_TYPES = [...SEVENTH_QUALITIES];

/** Was zu spielen, setzen oder singen ist: «Dominantseptakkord auf G, Quintsextakkord» oder «G7, Quintsextakkord». */
function umkehrungPrompt(
  root: Pitch,
  quality: SeventhQuality,
  choice: UmkehrungChoice,
  inversion: SeventhInversion,
  position: SeventhPosition,
  wording: Wording,
) {
  return `${seventhName(root, quality, wording)}, ${seventhInversionPositionText(choice.ask, inversion, position)}`;
}

/**
 * Die Regel für einen frei gespielten oder gesetzten Akkord: alle vier Töne,
 * kein anderer, und unten bzw. oben das verlangte Akkordglied — nur das, was
 * gefragt ist.
 */
function umkehrungRule(chord: Pitch[], ask: string[], inversion: SeventhInversion, position: SeventhPosition): ChordRule {
  return {
    tones: chord.map(pitchKey),
    ...(ask.includes('inv') ? { lowest: seventhBassMember(inversion) } : {}),
    ...(ask.includes('pos') ? { highest: seventhTopMember(position) } : {}),
  };
}

/** «… in der verlangten Umkehrung», «… Lage», «… Umkehrung und Lage». */
function verlangt(ask: string[]): string {
  if (ask.includes('inv') && ask.includes('pos')) return 'in der verlangten Umkehrung und Lage';
  return ask.includes('inv') ? 'in der verlangten Umkehrung' : 'in der verlangten Lage';
}

// ---------------------------------------------------------------------------
// In Noten benennen
// ---------------------------------------------------------------------------

interface NamingFilters extends FilterValues {
  ask: string[];
  inversions: string[];
  positions: string[];
  withBass: boolean;
  clefs: string[];
  chordTypes: string[];
  wording: string;
  accidentals: string;
}

export const septUmkehrungenBenennen: Generator<NamingFilters> = {
  id: 'septakkorde-umkehrungen-benennen',
  topic: 'septakkorde',
  group: 'umkehrungen',
  skill: 'erkennen',
  version: 1,
  title: 'Umkehrungen & Lagen in Noten benennen',
  instruction: seventhAskInstruction(['inv'], 'des Septakkords'),
  hint: HINT,

  filters: [
    ...seventhUmkehrungFilters({ label: 'Zwei Systeme (Basston im Bassschlüssel)', hint: VIERSTIMMIG_HINT }, NAMING_ASK),
    {
      ...CLEF_FILTER,
      disabledBy: (values) =>
        toggle(values, 'withBass', false) ? 'Mit zwei Systemen: oben Violin-, unten Bassschlüssel.' : null,
    },
    seventhQualityFilter(),
    WORDING_FILTER,
    ROOT_FILTER,
  ],

  defaults: {
    ...SEVENTH_UMKEHRUNG_DEFAULTS,
    clefs: ['treble'],
    chordTypes: DEFAULT_TYPES,
    wording: 'namen',
    accidentals: 'einfach',
  },

  generate(values, rng: Rng): Question {
    const choice = umkehrungChoice(values, this.defaults);
    const clefs = multi(values, 'clefs', this.defaults.clefs);
    const qualities = chosenSevenths(values, this.defaults.chordTypes);
    const wording = wordingOf(values);
    const policy = rootPolicy(values);

    const { inversion, position } = pickSeventhInversionAndPosition(rng, choice);
    const quality = rng.pick(qualities);
    const clef = choice.withBass ? 'treble' : (rng.pick(clefs) as 'treble' | 'bass');
    const windows = choice.withBass
      ? { upper: STAFF_WINDOWS.treble, bass: GRAND_BASS_WINDOW }
      : { upper: STAFF_WINDOWS[clef] };
    const candidates = voicingsOf(quality, policy, inversion, position, windows);
    insist(candidates.length > 0, `kein ${quality} als ${inversion} in ${position}`);
    const { root, voicing } = rng.pick(candidates);
    checkVoicing(voicing, root, quality, inversion, position);

    const score: ScoreSpec = voicing.bass
      ? {
          clef: 'grand',
          width: 150,
          scale: 2,
          fit: { maxScale: 3 },
          space: grandSpace(),
          measures: [
            {
              notes: [{ keys: voicing.upper.map(pitchKey), duration: 'w' }],
              bass: [{ keys: [pitchKey(voicing.bass)], duration: 'w' }],
            },
          ],
        }
      : {
          clef,
          width: 150,
          scale: 2,
          fit: { maxScale: 4 },
          space: chordSpace(clefs),
          measures: [{ notes: [{ keys: voicing.upper.map(pitchKey), duration: 'w' }] }],
        };

    const task: SelectTask = {
      id: taskId('sub', rng),
      kind: 'select',
      score,
      fields: seventhFields(
        choice,
        {
          root: { correct: [noteName(root).toLowerCase()], names: staffRootNames(policy) },
          quality,
          qualities,
          inversion,
          position,
        },
        wording,
      ),
    };
    return {
      task,
      afterSound: voicing.all.map(pitchKey),
      instruction: seventhAskInstruction(choice.ask, 'des Septakkords'),
    };
  },
};

// ---------------------------------------------------------------------------
// Notieren
// ---------------------------------------------------------------------------

interface WritingFilters extends FilterValues {
  ask: string[];
  inversions: string[];
  positions: string[];
  withBass: boolean;
  clefs: string[];
  chordTypes: string[];
  wording: string;
  accidentals: string;
}

export const septUmkehrungenNotieren: Generator<WritingFilters> = {
  id: 'septakkorde-umkehrungen-notieren',
  topic: 'septakkorde',
  group: 'umkehrungen',
  skill: 'notieren',
  version: 1,
  title: 'Umkehrungen & Lagen notieren',
  instruction: `Setze den Septakkord ${verlangt(['inv'])}.`,
  hint:
    `${HINT} Die Töne dürfen weit auseinander liegen und sich verdoppeln, mit zwei Systemen auch auf ` +
    'beide verteilt. Noch einmal auf einen Ton tippen nimmt ihn weg.',

  filters: [
    ...seventhUmkehrungFilters({ label: 'Zwei Systeme (Basston im Bassschlüssel)', hint: VIERSTIMMIG_HINT }),
    {
      ...CLEF_FILTER,
      disabledBy: (values) =>
        toggle(values, 'withBass', false) ? 'Mit zwei Systemen: oben Violin-, unten Bassschlüssel.' : null,
    },
    seventhQualityFilter(),
    WORDING_FILTER,
    ROOT_FILTER,
  ],

  defaults: {
    ...SEVENTH_UMKEHRUNG_DEFAULTS,
    clefs: ['treble'],
    chordTypes: DEFAULT_TYPES,
    wording: 'namen',
    accidentals: 'einfach',
  },

  generate(values, rng: Rng): Question {
    const choice = umkehrungChoice(values, this.defaults);
    const clefs = multi(values, 'clefs', this.defaults.clefs);
    const qualities = chosenSevenths(values, this.defaults.chordTypes);
    const wording = wordingOf(values);
    const policy = rootPolicy(values);

    const { inversion, position } = pickSeventhInversionAndPosition(rng, choice);
    const quality = rng.pick(qualities);
    const clef = choice.withBass ? 'treble' : (rng.pick(clefs) as 'treble' | 'bass');
    const windows = choice.withBass
      ? { upper: STAFF_WINDOWS.treble, bass: GRAND_BASS_WINDOW }
      : { upper: STAFF_WINDOWS[clef] };
    const candidates = voicingsOf(quality, policy, inversion, position, windows);
    insist(candidates.length > 0, `kein ${quality} als ${inversion} in ${position}`);
    const { root, voicing } = rng.pick(candidates);
    checkVoicing(voicing, root, quality, inversion, position);

    const rule = umkehrungRule(buildSeventh(root, quality), choice.ask, inversion, position);
    insist(judgeChordNotes(rule, voicing.all).correct, `${voicing.all.map(pitchKey).join(' ')} verfehlt die eigene Regel`);

    const task: NotationTask = {
      id: taskId('sun', rng),
      kind: 'notation',
      mode: 'chord',
      prompt: umkehrungPrompt(root, quality, choice, inversion, position, wording),
      points: 2,
      score: choice.withBass
        ? {
            clef: 'grand',
            width: 170,
            scale: 2,
            measures: [
              {
                notes: [{ duration: 'w', placeholder: true, annotation: '?' }],
                bass: [{ duration: 'w', placeholder: true }],
              },
            ],
          }
        : {
            clef,
            width: 170,
            scale: 2,
            measures: [{ notes: [{ duration: 'w', placeholder: true, annotation: '?' }] }],
          },
      solution: {
        type: 'chord',
        rule,
        example: {
          upper: voicing.upper.map(pitchKey),
          ...(voicing.bass ? { lower: [pitchKey(voicing.bass)] } : {}),
        },
      },
    };
    return { task, afterSound: voicing.all.map(pitchKey), instruction: `Setze den Septakkord ${verlangt(choice.ask)}.` };
  },
};

// ---------------------------------------------------------------------------
// Auf Klaviatur benennen
// ---------------------------------------------------------------------------

interface KeyNamingFilters extends FilterValues {
  ask: string[];
  inversions: string[];
  positions: string[];
  withBass: boolean;
  chordTypes: string[];
  wording: string;
  accidentals: string;
}

export const septUmkehrungenKlaviaturBenennen: Generator<KeyNamingFilters> = {
  id: 'septakkorde-umkehrungen-klaviatur-benennen',
  topic: 'septakkorde',
  group: 'umkehrungen',
  skill: 'klaviatur',
  version: 1,
  title: 'Umkehrungen & Lagen auf Klaviatur benennen',
  instruction: seventhAskInstruction(['inv'], 'des Septakkords auf den markierten Tasten'),
  hint: HINT,

  filters: [
    ...seventhUmkehrungFilters({ label: 'Basston abgesetzt (vierstimmig)', hint: VIERSTIMMIG_HINT }, NAMING_ASK),
    seventhQualityFilter(SYMMETRIC, 'Ohne vermindert: seine Umkehrungen liegen auf denselben Tasten.'),
    WORDING_FILTER,
    ROOT_FILTER,
  ],

  defaults: {
    ...SEVENTH_UMKEHRUNG_DEFAULTS,
    chordTypes: AUDIBLE_SEVENTHS,
    wording: 'namen',
    accidentals: 'einfach',
  },

  generate(values, rng: Rng): Question {
    const choice = umkehrungChoice(values, this.defaults);
    // Ein gespeicherter Stand kann «vermindert» noch enthalten.
    const qualities = chosenSevenths(values, this.defaults.chordTypes, SYMMETRIC);
    const wording = wordingOf(values);
    const policy = rootPolicy(values);

    const { inversion, position } = pickSeventhInversionAndPosition(rng, choice);
    const quality = rng.pick(qualities);
    const windows = choice.withBass
      ? { upper: INTERVAL_KEYBOARD, bass: INTERVAL_KEYBOARD }
      : { upper: INTERVAL_KEYBOARD };
    const candidates = voicingsOf(quality, policy, inversion, position, windows);
    insist(candidates.length > 0, `kein ${quality} als ${inversion} in ${position} auf der Klaviatur`);
    const { root, voicing } = rng.pick(candidates);
    checkVoicing(voicing, root, quality, inversion, position);
    const keys = voicing.all.map(midi);
    checkKeys(keys, quality, inversion, position);

    const task: SelectTask = {
      id: taskId('sukb', rng),
      kind: 'select',
      keyboard: { ...INTERVAL_KEYBOARD, marked: keys },
      fields: seventhFields(
        choice,
        {
          root: { correct: keyNames(midi(root)), names: policy === 'stammton' ? WHITE_KEY_NAMES : KEY_NAMES },
          quality,
          qualities,
          inversion,
          position,
        },
        wording,
      ),
    };
    return {
      task,
      afterSound: voicing.all.map(pitchKey),
      instruction: seventhAskInstruction(choice.ask, 'des Septakkords auf den markierten Tasten'),
    };
  },
};

// ---------------------------------------------------------------------------
// Auf Klaviatur spielen
// ---------------------------------------------------------------------------

interface KeyPlayingFilters extends FilterValues {
  ask: string[];
  inversions: string[];
  positions: string[];
  withBass: boolean;
  chordTypes: string[];
  wording: string;
  accidentals: string;
}

export const septUmkehrungenKlaviaturSpielen: Generator<KeyPlayingFilters> = {
  id: 'septakkorde-umkehrungen-klaviatur-spielen',
  topic: 'septakkorde',
  group: 'umkehrungen',
  skill: 'klaviatur',
  version: 1,
  title: 'Umkehrungen & Lagen auf Klaviatur spielen',
  instruction: `Spiele den Septakkord ${verlangt(['inv'])}.`,
  hint:
    `${HINT} Tippe die Tasten an; noch einmal antippen nimmt eine weg. Töne verdoppeln ist erlaubt. ` +
    'Mit «Prüfen» gibst du den Akkord ab.',

  filters: [
    ...seventhUmkehrungFilters({
      label: 'Vierstimmig (Umkehrung und Lage frei kombiniert)',
      hint: 'Dann kann etwa ein Quintsextakkord in Septlage verlangt sein. ' + VIERSTIMMIG_HINT,
    }),
    seventhQualityFilter(),
    WORDING_FILTER,
    ROOT_FILTER,
  ],

  defaults: {
    ...SEVENTH_UMKEHRUNG_DEFAULTS,
    chordTypes: DEFAULT_TYPES,
    wording: 'namen',
    accidentals: 'einfach',
  },

  generate(values, rng: Rng): Question {
    const choice = umkehrungChoice(values, this.defaults);
    const qualities = chosenSevenths(values, this.defaults.chordTypes);
    const wording = wordingOf(values);
    const policy = rootPolicy(values);

    const { inversion, position } = pickSeventhInversionAndPosition(rng, choice);
    const quality = rng.pick(qualities);
    const windows = choice.withBass
      ? { upper: INTERVAL_KEYBOARD, bass: INTERVAL_KEYBOARD }
      : { upper: INTERVAL_KEYBOARD };
    const candidates = voicingsOf(quality, policy, inversion, position, windows);
    insist(candidates.length > 0, `kein ${quality} als ${inversion} in ${position} auf der Klaviatur`);
    const { root, voicing } = rng.pick(candidates);
    checkVoicing(voicing, root, quality, inversion, position);

    const chord = buildSeventh(root, quality);
    const rule = umkehrungRule(chord, choice.ask, inversion, position);
    const keys = voicing.all.map(midi);
    insist(judgeChordKeys(rule, keys).correct, `${voicing.all.map(pitchKey).join(' ')} verfehlt die eigene Regel`);
    insist(
      chordExamples(chord.map((pitch) => midi(pitch) % 12), rule, INTERVAL_KEYBOARD.low, INTERVAL_KEYBOARD.high)
        .length > 0,
      'keine Lage zum Zeigen',
    );

    const task: KeyboardTask = {
      id: taskId('suks', rng),
      kind: 'keyboard',
      prompt: umkehrungPrompt(root, quality, choice, inversion, position, wording),
      keyboard: { ...INTERVAL_KEYBOARD },
      accept: keys,
      chord: rule,
      sound: true,
      describe: { by: 'chord' },
      points: 2,
    };
    return { task, afterSound: voicing.all.map(pitchKey), instruction: `Spiele den Septakkord ${verlangt(choice.ask)}.` };
  },
};

// ---------------------------------------------------------------------------
// Hörend erkennen
// ---------------------------------------------------------------------------

/** Beim Hören: oben angenehm, der Basston nicht zu tief. */
const HEARING_UPPER: Window = { low: 52, high: 77 };
const HEARING_BASS: Window = { low: 40, high: 55 };

interface HearingFilters extends FilterValues {
  ask: string[];
  inversions: string[];
  positions: string[];
  withBass: boolean;
  chordTypes: string[];
  wording: string;
  playback: string;
  limitPlays: boolean;
}

export const septUmkehrungenHoeren: Generator<HearingFilters> = {
  id: 'septakkorde-umkehrungen-hoeren',
  topic: 'septakkorde',
  group: 'umkehrungen',
  skill: 'hoeren',
  version: 1,
  title: 'Umkehrungen & Lagen hörend erkennen',
  instruction: 'Du hörst den Septakkord gebrochen und dann zusammen. Bestimme die Umkehrung.',
  hint: 'Achte auf den tiefsten Ton für die Umkehrung und auf den höchsten für die Lage.',

  filters: [
    ...seventhUmkehrungFilters({ label: 'Basston abgesetzt (vierstimmig)', hint: VIERSTIMMIG_HINT }, HEARING_ASK),
    seventhQualityFilter(SYMMETRIC, 'Ohne vermindert: seine Umkehrungen klingen gleich.'),
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

  defaults: {
    ...SEVENTH_UMKEHRUNG_DEFAULTS,
    chordTypes: AUDIBLE_SEVENTHS,
    wording: 'namen',
    playback: 'beides',
    limitPlays: false,
  },

  generate(values, rng: Rng): Question {
    const choice = umkehrungChoice(values, this.defaults);
    const qualities = chosenSevenths(values, this.defaults.chordTypes, SYMMETRIC);
    const wording = wordingOf(values);
    const broken = single(values, 'playback', 'beides') !== 'zusammen';
    const limitPlays = toggle(values, 'limitPlays', false);

    const { inversion, position } = pickSeventhInversionAndPosition(rng, choice);
    const quality = rng.pick(qualities);
    const windows = choice.withBass ? { upper: HEARING_UPPER, bass: HEARING_BASS } : { upper: HEARING_UPPER };
    const { root, voicing } = rng.pick(voicingsOf(quality, 'einfach', inversion, position, windows));
    checkVoicing(voicing, root, quality, inversion, position);
    checkKeys(voicing.all.map(midi), quality, inversion, position);

    const id = taskId('gsu', rng);
    return {
      task: {
        id,
        kind: 'select',
        fields: seventhFields(choice, { quality, qualities, inversion, position }, wording),
      },
      audio: { id, kind: 'voicing', notes: voicing.all.map(pitchKey), broken },
      instruction: `${
        broken ? 'Du hörst den Septakkord gebrochen und dann zusammen.' : 'Du hörst den Septakkord als Zusammenklang.'
      } ${seventhAskInstruction(choice.ask, 'des Septakkords')}`,
      maxPlays: limitPlays ? LIMITED_PLAYS : undefined,
    };
  },
};

// ---------------------------------------------------------------------------
// Singen
// ---------------------------------------------------------------------------

function singInstruction(ask: string[]): string {
  return (
    `Du hörst den tiefsten Ton. Singe den Septakkord ${verlangt(ask)} Ton für Ton von unten nach oben; ` +
    'den tiefsten darfst du mitsingen.'
  );
}

interface SingingFilters extends FilterValues {
  ask: string[];
  inversions: string[];
  positions: string[];
  chordTypes: string[];
  wording: string;
  accidentals: string;
  clefs: string[];
  tolerance: string;
  untilRight: boolean;
}

export const septUmkehrungenSingen: Generator<SingingFilters> = {
  id: 'septakkorde-umkehrungen-singen',
  topic: 'septakkorde',
  group: 'umkehrungen',
  skill: 'singen',
  version: 1,
  title: 'Umkehrungen & Lagen singen',
  instruction: singInstruction(['inv']),
  hint: `${HINT} ${SING_HINT}`,

  // Vier Töne nacheinander: kein Basston, die Lage folgt aus der Umkehrung.
  filters: [...seventhUmkehrungFilters(), seventhQualityFilter(), WORDING_FILTER, ROOT_FILTER, ...SING_FILTERS],

  defaults: {
    ...SEVENTH_UMKEHRUNG_DEFAULTS,
    chordTypes: DEFAULT_TYPES,
    wording: 'namen',
    accidentals: 'einfach',
    ...SING_DEFAULTS,
  },

  generate(values, rng: Rng, personal?: Personal): Question {
    const choice = { ...umkehrungChoice(values, this.defaults), withBass: false };
    const qualities = chosenSevenths(values, this.defaults.chordTypes);
    const wording = wordingOf(values);
    const policy = rootPolicy(values);
    const clefs = multi(values, 'clefs', this.defaults.clefs);
    const tolerance = Number(single(values, 'tolerance', '50'));
    const untilRight = toggle(values, 'untilRight', false);
    const range = VOICE_RANGES[personal?.voice ?? DEFAULT_VOICE];

    const { inversion, position } = pickSeventhInversionAndPosition(rng, choice);
    const quality = rng.pick(qualities);
    const rootClass = rng.pick(seventhRootClasses(policy, quality));
    const chord = buildSeventh({ ...rootClass, octave: 4 }, quality);
    const stack = placeInVoice(rng, invertSeventh(chord, inversion), range);
    checkVoicing({ bass: null, upper: stack, all: stack }, chord[0], quality, inversion, position);
    const clef = rng.pick(clefs) as 'treble' | 'bass';

    const task = chordSingTask(
      taskId('susi', rng),
      umkehrungPrompt(chord[0], quality, choice, inversion, position, wording),
      stack,
      { clef, range, tolerance, untilRight, reach: SING_REACH },
    );
    return { task, instruction: singInstruction(choice.ask) };
  },
};
