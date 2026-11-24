/**
 * Dreiklänge in Grundstellung — drei Töne eng über dem Grundton.
 *
 * Gefragt ist beim Benennen nur das Geschlecht (Entscheid 2026-11-24): ein
 * Tipp auf Dur, moll, vermindert, übermässig oder — zugeschaltet — sus4. Der
 * Grundton ist der tiefste Ton und steht schon da.
 *
 * Gemeinsames (Akkordbau, Namen, Einstellungen) in `dreiklaenge-shared.ts`.
 */

import { OPTION_SETS } from '../content/options';
import type { ChordRule, KeyboardTask, NotationTask, SelectField, SelectTask } from '../content/schema';
import { INTERVAL_KEYBOARD, chordExamples } from '../music/piano';
import { judgeChordKeys, judgeChordNotes } from '../scoring/chord';
import { analyseTriad, midi, type Pitch } from '../music/theory';
import {
  CHORD_SEMITONES,
  CLEF_FILTER,
  ROOT_FILTER,
  SING_DEFAULTS,
  SING_FILTERS,
  SING_HINT,
  STAFF_WINDOWS,
  SUS4_FILTER,
  buildChord,
  chordName,
  chordSingTask,
  chordSpace,
  chosenQualities,
  octavePlacements,
  placeInVoice,
  qualityFilter,
  qualityOfStack,
  readKeys,
  rootClasses,
  rootPolicy,
  type ChordQuality,
  type RootPolicy,
} from './dreiklaenge-shared';
import type { Rng } from './rng';
import { insist, optionsFrom, pitchKey, taskId, wholeNoteScore, type Window } from './shared';
import { multi, single, toggle, type FilterValues, type Generator, type Personal, type Question } from './types';
import { DEFAULT_VOICE, VOICE_RANGES } from '../sing/voice';

const LIMITED_PLAYS = 3;

/** Alle Akkorde dieses Geschlechts in Grundstellung, deren Töne im Fenster liegen. */
function chordsIn(quality: ChordQuality, policy: RootPolicy, window: Window): Pitch[][] {
  return rootClasses(policy, quality).flatMap((root) =>
    octavePlacements(buildChord({ ...root, octave: 4 }, quality), window),
  );
}

/**
 * Unabhängig nachgerechnet: die Töne bilden dieses Geschlecht in
 * Grundstellung — gemessen, und bei den vier Dreiklängen zusätzlich mit der
 * Dreiklangsanalyse des Theoriekerns.
 */
function checkChord(stack: Pitch[], quality: ChordQuality): void {
  const shown = stack.map(pitchKey).join(' ');
  insist(qualityOfStack(stack) === quality, `${shown} ist kein ${quality}`);
  if (quality !== 'sus4') {
    const analysis = analyseTriad(stack);
    insist(
      analysis !== null && analysis.quality === quality && analysis.inversion === 'grundstellung',
      `${shown} ist nicht ${quality} in Grundstellung`,
    );
  }
}

/** Das Geschlecht als Knopfreihe — ein Tipp ist die Antwort. */
function qualityField(quality: ChordQuality, allowed: readonly ChordQuality[]): SelectField {
  return {
    id: 'a',
    options: optionsFrom('chordQuality', allowed),
    correct: quality,
    points: 2,
    buttons: true,
  };
}

const NAMING_HINT =
  'Miss die beiden Terzen von unten: gross + klein = Dur, klein + gross = moll, ' +
  'klein + klein = vermindert, gross + gross = übermässig.';

const SUS4_HINT = ' Bei sus4 liegt eine Quarte über dem Grundton, darüber eine grosse Sekunde.';

function namingHint(qualities: readonly ChordQuality[]): string {
  return qualities.includes('sus4') ? NAMING_HINT + SUS4_HINT : NAMING_HINT;
}

const ALL_TRIADS = OPTION_SETS.triadQuality.map((option) => option.value);

// ---------------------------------------------------------------------------
// In Noten benennen
// ---------------------------------------------------------------------------

interface NamingFilters extends FilterValues {
  qualities: string[];
  sus4: boolean;
  clefs: string[];
  accidentals: string;
}

export const dreiklaengeBenennen: Generator<NamingFilters> = {
  // Die Kennung stammt von der früheren Übung «Dreiklänge bestimmen» und
  // bleibt, damit geteilte Links weiter eine Dreiklangsübung öffnen.
  id: 'dreiklaenge-bestimmen',
  topic: 'dreiklaenge',
  group: 'grundstellung',
  skill: 'erkennen',
  // 2: neu gebaut — nur noch das Geschlecht, in Grundstellung.
  version: 2,
  title: 'Dreiklänge in Noten benennen',
  instruction: 'Welches Geschlecht hat der Dreiklang?',
  hint: NAMING_HINT,

  filters: [qualityFilter(), SUS4_FILTER, CLEF_FILTER, ROOT_FILTER],

  defaults: { qualities: ALL_TRIADS, sus4: false, clefs: ['treble'], accidentals: 'einfach' },

  generate(values, rng: Rng): Question {
    const qualities = chosenQualities(values, this.defaults.qualities);
    const clefs = multi(values, 'clefs', this.defaults.clefs);
    const policy = rootPolicy(values);

    const quality = rng.pick(qualities);
    const clef = rng.pick(clefs) as 'treble' | 'bass';
    const stack = rng.pick(chordsIn(quality, policy, STAFF_WINDOWS[clef]));
    checkChord(stack, quality);

    const task: SelectTask = {
      id: taskId('db', rng),
      kind: 'select',
      score: wholeNoteScore(stack.map(pitchKey), clef, { width: 150, space: chordSpace(clefs) }),
      fields: [qualityField(quality, qualities)],
    };
    return { task, hint: namingHint(qualities) };
  },
};

// ---------------------------------------------------------------------------
// Notieren
// ---------------------------------------------------------------------------

interface WritingFilters extends FilterValues {
  qualities: string[];
  sus4: boolean;
  clefs: string[];
  accidentals: string;
}

export const dreiklaengeNotieren: Generator<WritingFilters> = {
  id: 'dreiklaenge-notieren',
  topic: 'dreiklaenge',
  group: 'grundstellung',
  skill: 'notieren',
  version: 1,
  title: 'Dreiklänge notieren',
  instruction: 'Setze den genannten Dreiklang in Grundstellung ins System: der Grundton liegt unten.',
  hint:
    'Tippe die Stelle im System an oder ziehe dorthin; noch einmal antippen nimmt den Ton weg. ' +
    'Das Vorzeichen wählst du vorher in der Werkzeugleiste. Jede Oktave zählt, Töne verdoppeln ist erlaubt.',

  filters: [qualityFilter(), SUS4_FILTER, CLEF_FILTER, ROOT_FILTER],

  defaults: { qualities: ALL_TRIADS, sus4: false, clefs: ['treble'], accidentals: 'einfach' },

  generate(values, rng: Rng): Question {
    const qualities = chosenQualities(values, this.defaults.qualities);
    const clefs = multi(values, 'clefs', this.defaults.clefs);
    const policy = rootPolicy(values);

    const quality = rng.pick(qualities);
    const clef = rng.pick(clefs) as 'treble' | 'bass';
    const stack = rng.pick(chordsIn(quality, policy, STAFF_WINDOWS[clef]));
    checkChord(stack, quality);

    const rule: ChordRule = { tones: stack.map(pitchKey), lowest: 0 };
    insist(judgeChordNotes(rule, stack).correct, `${stack.map(pitchKey).join(' ')} verfehlt die eigene Regel`);

    const task: NotationTask = {
      id: taskId('dn', rng),
      kind: 'notation',
      mode: 'chord',
      prompt: chordName(stack[0], quality),
      points: 2,
      score: {
        clef,
        width: 170,
        scale: 2,
        measures: [{ notes: [{ duration: 'w', placeholder: true, annotation: '?' }] }],
      },
      solution: { type: 'chord', rule, example: { upper: stack.map(pitchKey) } },
    };
    return { task };
  },
};

// ---------------------------------------------------------------------------
// Auf Klaviatur benennen
// ---------------------------------------------------------------------------

/**
 * Unabhängig nachgerechnet, nur aus den Tasten: sie bilden genau diesen
 * Akkord, mit dem Grundton unten.
 */
function checkKeys(keys: number[], quality: ChordQuality): void {
  const [middle, top] = CHORD_SEMITONES[quality];
  insist(
    keys.length === 3 && keys[1] - keys[0] === middle && keys[2] - keys[0] === top,
    `Tasten ${keys.join(' ')} sind kein ${quality} in Grundstellung`,
  );
  // Beim übermässigen Dreiklang sagen die Tasten den Grundton nicht — hier
  // ist er der tiefste, und das genügt.
  if (quality !== 'uebermaessig') {
    const read = readKeys(keys, quality);
    insist(read !== null && read.bass === 0, `Tasten ${keys.join(' ')}: Grundton nicht unten`);
  }
}

interface KeyNamingFilters extends FilterValues {
  qualities: string[];
  sus4: boolean;
  accidentals: string;
}

export const dreiklaengeKlaviaturBenennen: Generator<KeyNamingFilters> = {
  id: 'dreiklaenge-klaviatur-benennen',
  topic: 'dreiklaenge',
  group: 'grundstellung',
  skill: 'klaviatur',
  version: 1,
  title: 'Dreiklänge auf Klaviatur benennen',
  instruction: 'Welches Geschlecht hat der Dreiklang auf den markierten Tasten?',
  hint:
    'Zähle die Halbtöne vom tiefsten Ton aus: 4 + 3 = Dur, 3 + 4 = moll, 3 + 3 = vermindert, 4 + 4 = übermässig.',

  filters: [qualityFilter(), SUS4_FILTER, ROOT_FILTER],

  defaults: { qualities: ALL_TRIADS, sus4: false, accidentals: 'einfach' },

  generate(values, rng: Rng): Question {
    const qualities = chosenQualities(values, this.defaults.qualities);
    const policy = rootPolicy(values);

    const quality = rng.pick(qualities);
    const stack = rng.pick(chordsIn(quality, policy, INTERVAL_KEYBOARD));
    checkChord(stack, quality);
    const keys = stack.map(midi);
    checkKeys(keys, quality);

    const task: SelectTask = {
      id: taskId('dkb', rng),
      kind: 'select',
      keyboard: { ...INTERVAL_KEYBOARD, marked: keys },
      fields: [qualityField(quality, qualities)],
    };
    return {
      task,
      hint: qualities.includes('sus4')
        ? `${this.hint} Bei sus4 sind es 5 + 2.`
        : undefined,
    };
  },
};

// ---------------------------------------------------------------------------
// Auf Klaviatur spielen
// ---------------------------------------------------------------------------

interface KeyPlayingFilters extends FilterValues {
  qualities: string[];
  sus4: boolean;
  accidentals: string;
}

export const dreiklaengeKlaviaturSpielen: Generator<KeyPlayingFilters> = {
  id: 'dreiklaenge-klaviatur-spielen',
  topic: 'dreiklaenge',
  group: 'grundstellung',
  skill: 'klaviatur',
  version: 1,
  title: 'Dreiklänge auf Klaviatur spielen',
  instruction: 'Spiele den genannten Dreiklang in Grundstellung: der Grundton liegt unten.',
  hint:
    'Tippe die Tasten an; noch einmal antippen nimmt eine weg. Jede Oktave zählt, Töne verdoppeln ist erlaubt. ' +
    'Mit «Prüfen» gibst du den Akkord ab.',

  filters: [qualityFilter(), SUS4_FILTER, ROOT_FILTER],

  defaults: { qualities: ALL_TRIADS, sus4: false, accidentals: 'einfach' },

  generate(values, rng: Rng): Question {
    const qualities = chosenQualities(values, this.defaults.qualities);
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
      id: taskId('dks', rng),
      kind: 'keyboard',
      prompt: chordName(stack[0], quality),
      keyboard: { ...INTERVAL_KEYBOARD },
      accept: keys,
      chord: rule,
      sound: true,
      describe: { by: 'chord' },
      points: 2,
    };
    return { task };
  },
};

// ---------------------------------------------------------------------------
// Hörend erkennen
// ---------------------------------------------------------------------------

/** Wo die Akkorde beim Hören liegen: angenehm, nicht zu tief. */
const HEARING_WINDOW: Window = { low: 50, high: 76 };

interface HearingFilters extends FilterValues {
  qualities: string[];
  sus4: boolean;
  playback: string;
  limitPlays: boolean;
}

export const dreiklaengeHoeren: Generator<HearingFilters> = {
  id: 'dreiklaenge-hoeren',
  topic: 'dreiklaenge',
  group: 'grundstellung',
  skill: 'hoeren',
  // 2: nur noch Grundstellung; Umkehrungen hören ist eine eigene Übung.
  version: 2,
  title: 'Dreiklänge hörend erkennen',
  instruction: 'Du hörst den Dreiklang gebrochen und dann zusammen. Bestimme das Geschlecht.',

  filters: [
    qualityFilter(),
    SUS4_FILTER,
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

  defaults: { qualities: ALL_TRIADS, sus4: false, playback: 'beides', limitPlays: false },

  generate(values, rng: Rng): Question {
    const qualities = chosenQualities(values, this.defaults.qualities);
    const broken = single(values, 'playback', 'beides') !== 'zusammen';
    const limitPlays = toggle(values, 'limitPlays', false);

    const quality = rng.pick(qualities);
    const stack = rng.pick(chordsIn(quality, 'einfach', HEARING_WINDOW));
    checkChord(stack, quality);

    const id = taskId('ga', rng);
    return {
      task: { id, kind: 'select', fields: [qualityField(quality, qualities)] },
      audio: { id, kind: 'voicing', notes: stack.map(pitchKey), broken },
      instruction: broken
        ? 'Du hörst den Dreiklang gebrochen und dann zusammen. Bestimme das Geschlecht.'
        : 'Du hörst den Dreiklang als Zusammenklang. Bestimme das Geschlecht.',
      maxPlays: limitPlays ? LIMITED_PLAYS : undefined,
    };
  },
};



// ---------------------------------------------------------------------------
// Singen
// ---------------------------------------------------------------------------

interface SingingFilters extends FilterValues {
  qualities: string[];
  sus4: boolean;
  accidentals: string;
  clefs: string[];
  tolerance: string;
  untilRight: boolean;
}

export const dreiklaengeSingen: Generator<SingingFilters> = {
  id: 'dreiklaenge-singen',
  topic: 'dreiklaenge',
  group: 'grundstellung',
  skill: 'singen',
  version: 1,
  title: 'Dreiklänge singen',
  instruction: 'Du hörst den Grundton. Singe die drei Töne des Dreiklangs von unten nach oben, mit dem Grundton.',
  hint: SING_HINT,

  filters: [qualityFilter(), SUS4_FILTER, ROOT_FILTER, ...SING_FILTERS],

  defaults: { qualities: ALL_TRIADS, sus4: false, accidentals: 'einfach', ...SING_DEFAULTS },

  generate(values, rng: Rng, personal?: Personal): Question {
    const qualities = chosenQualities(values, this.defaults.qualities);
    const policy = rootPolicy(values);
    const clefs = multi(values, 'clefs', this.defaults.clefs);
    const tolerance = Number(single(values, 'tolerance', '50'));
    const untilRight = toggle(values, 'untilRight', false);
    const range = VOICE_RANGES[personal?.voice ?? DEFAULT_VOICE];

    const quality = rng.pick(qualities);
    const root = rng.pick(rootClasses(policy, quality));
    const stack = placeInVoice(rng, buildChord({ ...root, octave: 4 }, quality), range);
    checkChord(stack, quality);
    const clef = rng.pick(clefs) as 'treble' | 'bass';

    const task = chordSingTask(taskId('dsi', rng), chordName(stack[0], quality), stack, {
      clef,
      range,
      tolerance,
      untilRight,
    });
    return { task };
  },
};
