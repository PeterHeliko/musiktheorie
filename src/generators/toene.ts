/**
 * Töne — einzelne Töne benennen und finden, auf der Klaviatur und im
 * Notenbild. Das Thema vor allen anderen: wer Intervalle abzählen will, muss
 * die Töne kennen.
 *
 * Gefragt ist immer nur der Name, nie die Oktave (Entscheid 2026-11-24):
 * «fis», nicht «fis¹». Wer spielt oder schreibt, darf jede Oktave nehmen, die
 * die Klaviatur oder das System hergibt. Die Oktavbezeichnungen (kleines c,
 * c¹) werden einmal eine eigene Übung.
 *
 * Antwortknöpfe sind ein Raster: eine Spalte je Stammton, darüber die
 * Namen mit ♯, darunter die mit ♭ (Entscheid 2026-11-24).
 *
 *  - Klaviatur: Eine Taste hat keine Schreibweise. Eine schwarze heisst cis
 *    oder des, beides ist richtig; eine weisse heisst wie ihr Stammton, also
 *    e und nicht fes. Ces, fes, eis und his kommen auf der Klaviatur deshalb
 *    nicht vor (`KEY_NAMES`).
 *  - Notenbild: Hier ist die Schreibweise die Frage. Ein fes ist ein fes,
 *    auch wenn es wie e klingt.
 *
 * Die Klaviatur ist dieselbe wie bei den Intervallen (c bis h¹); Benennen
 * bleibt auch hier stumm.
 */

import type { KeyboardTask, NotationTask, SelectField, SelectOption, SelectTask } from '../content/schema';
import { INTERVAL_KEYBOARD, KEY_NAMES, isWhiteKey, keyNames, keysBetween, keysNamed } from '../music/piano';
import { STEPS, diatonicIndex, germanNoteName, midi, naturalAt, parsePitch, type Pitch, type Step } from '../music/theory';
import { KEY_COLOUR_OPTIONS } from './intervalle-klaviatur';
import type { Rng } from './rng';
import {
  ACCIDENTAL_OPTIONS,
  CLEF_OPTIONS,
  WIDTH_OPTIONS,
  altersFor,
  candidatePitches,
  insist,
  intervalSpace,
  pitchKey,
  taskId,
  wholeNoteScore,
  windowFor,
  type AccidentalPolicy,
} from './shared';
import { multi, single, type FilterValues, type Generator, type Question } from './types';

/**
 * Vorzeichen bis ♭ ♯. Doppelvorzeichen gehören nicht zu den Grundlagen, und
 * das Raster hätte für sie keine Zeile.
 */
const ACCIDENTALS = ACCIDENTAL_OPTIONS.filter((option) => option.value !== 'alle');

/**
 * Tonname klein geschrieben («fis», «b», «h»): ohne Oktave gemeint. Gross
 * hiesse in der Schreibweise der Seite die grosse Oktave (C = grosses C).
 */
function nameOf(step: Step, alter: number): string {
  return germanNoteName(step, alter).toLowerCase();
}

/**
 * Gegenrichtung für die Nachrechnung: Name plus Oktave → Tonhöhe.
 * `parsePitch()` liest ein blosses «b» als H (englisch); das deutsche B ist
 * dort «hes».
 */
function pitchOfName(name: string, octave: number): Pitch {
  return parsePitch(name === 'b' ? `hes${octave}` : `${name}${octave}`);
}

/** Ist `name` diese Taste, in irgendeiner Oktave? */
function keyIs(key: number, name: string): boolean {
  return (((midi(pitchOfName(name, 4)) - key) % 12) + 12) % 12 === 0;
}

function policyOf(values: FilterValues): AccidentalPolicy {
  return single(values, 'accidentals', 'einfach') === 'stammton' ? 'stammton' : 'einfach';
}

/** Alle Namen im Notenbild: je Stammton mit ♭, ohne und mit ♯ (bzw. nur ohne). */
function staffNames(policy: AccidentalPolicy): { name: string; step: Step; alter: number }[] {
  return STEPS.flatMap((step) =>
    altersFor(policy).map((alter) => ({ name: nameOf(step, alter), step, alter })),
  );
}

const option = (name: string): SelectOption => ({ value: name, label: name });

/** Das Tonnamen-Raster. `correct` zuerst; mehrere, wenn eine Taste zwei Namen hat. */
function noteNameField(correct: string[], names: string[]): SelectField {
  insist(
    correct.length > 0 && correct.every((name) => names.includes(name)),
    `«${correct.join('/')}» steht nicht unter den Antworten`,
  );
  return {
    id: 'a',
    options: names.map(option),
    correct: correct[0],
    ...(correct.length > 1 ? { alsoCorrect: correct.slice(1) } : {}),
    points: 2,
    buttons: true,
    buttonLayout: 'notes',
  };
}

/** Die Namen, die auf der Klaviatur vorkommen: die der weissen Tasten oder alle. */
function keyboardNames(whiteOnly: boolean): string[] {
  return whiteOnly ? keysBetween(60, 71).filter(isWhiteKey).flatMap(keyNames) : KEY_NAMES;
}

const ALL_KEYS = keysBetween(INTERVAL_KEYBOARD.low, INTERVAL_KEYBOARD.high);

// ---------------------------------------------------------------------------
// Klaviatur: benennen
// ---------------------------------------------------------------------------

interface KeyNamingFilters extends FilterValues {
  keyColours: string;
}

export const toeneKlaviaturBenennen: Generator<KeyNamingFilters> = {
  id: 'toene-klaviatur-benennen',
  topic: 'toene',
  skill: 'klaviatur',
  version: 1,
  title: 'Töne auf Klaviatur benennen',
  instruction: 'Wie heisst die markierte Taste?',
  hint:
    'Orientiere dich an den schwarzen Tasten: c liegt links neben den zwei schwarzen, f links neben den drei. ' +
    'Eine schwarze Taste hat zwei Namen; beide sind richtig.',

  filters: [{ kind: 'single', key: 'keyColours', label: 'Tasten', options: KEY_COLOUR_OPTIONS }],

  defaults: { keyColours: 'alle' },

  generate(values, rng: Rng): Question {
    const whiteOnly = single(values, 'keyColours', 'alle') === 'weiss';
    const key = rng.pick(whiteOnly ? ALL_KEYS.filter(isWhiteKey) : ALL_KEYS);
    const names = keyNames(key);

    // Unabhängig nachgerechnet: jeder Name, als Ton gelesen, ist diese Taste.
    for (const name of names) insist(keyIs(key, name), `Taste ${key} heisst nicht «${name}»`);

    const task: SelectTask = {
      id: taskId('tkb', rng),
      kind: 'select',
      keyboard: { ...INTERVAL_KEYBOARD, marked: [key] },
      fields: [noteNameField(names, keyboardNames(whiteOnly))],
    };
    return { task };
  },
};

// ---------------------------------------------------------------------------
// Klaviatur: spielen
// ---------------------------------------------------------------------------

interface KeyPlayingFilters extends FilterValues {
  accidentals: string;
}

export const toeneKlaviaturSpielen: Generator<KeyPlayingFilters> = {
  id: 'toene-klaviatur-spielen',
  topic: 'toene',
  skill: 'klaviatur',
  version: 1,
  title: 'Töne auf Klaviatur spielen',
  instruction: 'Tippe eine Taste des genannten Tons an.',
  hint: 'Jede Oktave zählt. Die angetippte Taste erklingt; mit «Prüfen» gibst du sie ab.',

  filters: [{ kind: 'single', key: 'accidentals', label: 'Vorzeichen', options: ACCIDENTALS }],

  defaults: { accidentals: 'einfach' },

  generate(values, rng: Rng): Question {
    const whiteOnly = policyOf(values) === 'stammton';
    const name = rng.pick(keyboardNames(whiteOnly));
    const accept = keysNamed(name, INTERVAL_KEYBOARD.low, INTERVAL_KEYBOARD.high);

    insist(accept.length >= 2, `«${name}» liegt nicht in beiden Oktaven`);
    for (const key of accept) insist(keyIs(key, name), `Taste ${key} ist kein «${name}»`);

    const task: KeyboardTask = {
      id: taskId('tks', rng),
      kind: 'keyboard',
      prompt: name,
      keyboard: { ...INTERVAL_KEYBOARD },
      accept,
      ...(whiteOnly ? { whiteOnly: true } : {}),
      sound: true,
      describe: { by: 'name' },
      points: 2,
    };
    return { task };
  },
};

// ---------------------------------------------------------------------------
// Notenbild: benennen
// ---------------------------------------------------------------------------

interface NoteNamingFilters extends FilterValues {
  accidentals: string;
  clefs: string[];
  width: string;
}

export const notenBenennen: Generator<NoteNamingFilters> = {
  id: 'noten-benennen',
  topic: 'toene',
  skill: 'erkennen',
  version: 1,
  title: 'Noten benennen',
  instruction: 'Wie heisst die Note?',
  hint: 'Gefragt ist nur der Name, nicht die Oktave. Das Vorzeichen gehört zum Namen: fis, nicht f.',

  filters: [
    { kind: 'single', key: 'accidentals', label: 'Vorzeichen', options: ACCIDENTALS },
    { kind: 'multi', key: 'clefs', label: 'Schlüssel', options: CLEF_OPTIONS },
    { kind: 'single', key: 'width', label: 'Lage', options: WIDTH_OPTIONS },
  ],

  defaults: { accidentals: 'einfach', clefs: ['treble'], width: 'eng' },

  generate(values, rng: Rng): Question {
    const policy = policyOf(values);
    const clefs = multi(values, 'clefs', this.defaults.clefs);
    const width = single(values, 'width', 'eng');

    const clef = rng.pick(clefs) as 'treble' | 'bass';
    const pitches = candidatePitches(windowFor(clef, width), altersFor(policy));
    insist(pitches.length > 0, 'keine Töne in dieser Lage');
    const pitch = rng.pick(pitches);

    const name = nameOf(pitch.step, pitch.alter);
    const back = pitchOfName(name, pitch.octave);
    insist(
      back.step === pitch.step && back.alter === pitch.alter && midi(back) === midi(pitch),
      `${pitchKey(pitch)} heisst nicht «${name}»`,
    );

    const task: SelectTask = {
      id: taskId('nb', rng),
      kind: 'select',
      // Platz um das System wie bei der Intervallbestimmung: fest je
      // Einstellung, damit es nicht von Aufgabe zu Aufgabe springt.
      score: wholeNoteScore([pitchKey(pitch)], clef, {
        width: 110,
        space: intervalSpace(clefs, width, policy),
      }),
      fields: [noteNameField([name], staffNames(policy).map((candidate) => candidate.name))],
    };
    return { task };
  },
};

// ---------------------------------------------------------------------------
// Notenbild: schreiben
// ---------------------------------------------------------------------------

/**
 * Äusserste Notenlinien je Schlüssel, und wie weit das Eingabe-Widget
 * darüber hinaus setzen lässt (LEDGER_STEPS in NotationInput.tsx).
 */
const STAFF_LINES: Record<'treble' | 'bass', { bottom: Pitch; top: Pitch }> = {
  treble: { bottom: parsePitch('e4'), top: parsePitch('f5') },
  bass: { bottom: parsePitch('g2'), top: parsePitch('a3') },
};
const INPUT_LEDGER_STEPS = 6;

/** Der Ton in jeder Oktave, die sich im System setzen lässt. */
function settableOctaves(step: Step, alter: number, clef: 'treble' | 'bass'): Pitch[] {
  const lowest = diatonicIndex(STAFF_LINES[clef].bottom) - INPUT_LEDGER_STEPS;
  const highest = diatonicIndex(STAFF_LINES[clef].top) + INPUT_LEDGER_STEPS;
  const out: Pitch[] = [];
  for (let index = lowest; index <= highest; index++) {
    const natural = naturalAt(index);
    if (natural.step === step) out.push({ ...natural, alter });
  }
  return out;
}

interface NoteWritingFilters extends FilterValues {
  accidentals: string;
  clefs: string[];
}

export const notenSchreiben: Generator<NoteWritingFilters> = {
  id: 'noten-schreiben',
  topic: 'toene',
  skill: 'notieren',
  version: 1,
  title: 'Noten schreiben',
  instruction: 'Setze den genannten Ton ins System.',
  hint: 'Jede Oktave zählt. Tippe die Stelle im System an oder ziehe dorthin; das Vorzeichen wählst du vorher in der Werkzeugleiste.',

  filters: [
    { kind: 'single', key: 'accidentals', label: 'Vorzeichen', options: ACCIDENTALS },
    { kind: 'multi', key: 'clefs', label: 'Schlüssel', options: CLEF_OPTIONS },
  ],

  defaults: { accidentals: 'einfach', clefs: ['treble'] },

  generate(values, rng: Rng): Question {
    const policy = policyOf(values);
    const clefs = multi(values, 'clefs', this.defaults.clefs);
    const clef = rng.pick(clefs) as 'treble' | 'bass';

    const { name, step, alter } = rng.pick(staffNames(policy));
    const accept = settableOctaves(step, alter, clef);
    insist(accept.length >= 2, `«${name}» lässt sich nur in einer Oktave setzen`);
    for (const pitch of accept) {
      const back = pitchOfName(name, pitch.octave);
      insist(back.step === pitch.step && back.alter === pitch.alter, `${pitchKey(pitch)} ist kein «${name}»`);
    }

    const task: NotationTask = {
      id: taskId('ns', rng),
      kind: 'notation',
      mode: 'pitch',
      prompt: name,
      points: 2,
      ...(policy === 'stammton' ? { noAccidentals: true } : {}),
      noNameKeys: true,
      score: {
        clef,
        width: 160,
        scale: 2,
        measures: [{ notes: [{ duration: 'w', placeholder: true, annotation: '?' }] }],
      },
      solution: { type: 'pitch', slots: [{ slot: 0, accept: accept.map(pitchKey) }] },
    };
    return {
      task,
      hint:
        policy === 'stammton'
          ? 'Jede Oktave zählt. Tippe die Stelle im System an oder ziehe dorthin.'
          : undefined,
    };
  },
};
