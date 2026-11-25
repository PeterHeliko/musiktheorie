/**
 * Töne — einzelne Töne benennen und finden, auf der Klaviatur und im
 * Notenbild. Das Thema vor allen anderen: wer Intervalle abzählen will, muss
 * die Töne kennen.
 *
 * Gefragt ist immer nur der Name, nie die Oktave (Entscheid 2026-11-24):
 * «fis», nicht «fis¹». Wer spielt oder schreibt, darf jede Oktave nehmen, die
 * die Klaviatur oder das System hergibt. Das gilt auch für «Noten auf
 * Klaviatur spielen» (Entscheid 2026-11-25): die Note im System ist ein Ton,
 * keine bestimmte Taste. Die Oktavbezeichnungen (kleines c, c¹) werden
 * einmal eine eigene Übung.
 *
 * Antwortknöpfe sind ein Raster: eine Spalte je Stammton, darüber die
 * Namen mit ♯, darunter die mit ♭ (Entscheid 2026-11-24).
 *
 *  - Klaviatur: Eine Taste hat keine Schreibweise. Eine schwarze heisst cis
 *    oder des, beides ist richtig; eine weisse heisst wie ihr Stammton, also
 *    e und nicht fes. Ces, fes, eis und his kommen als Tastennamen deshalb
 *    nicht vor (`keyNames`).
 *  - Notenbild: Hier ist die Schreibweise die Frage. Ein fes ist ein fes,
 *    auch wenn es wie e klingt; gespielt wird es auf der Taste e.
 *
 * Welche Töne gefragt werden, wählt «Töne» (Entscheid 2026-11-25), ein
 * Raster wie die Antwortknöpfe. Es ersetzt «Vorzeichen» (nur Stammtöne / ♭ ♯)
 * und bei «Tasten benennen» «Tasten» (weiss / alle). Die Antwortknöpfe
 * bleiben, wie sie waren: sind nur Stammtöne gewählt, verhält sich die Übung
 * wie früher mit «nur Stammtöne» (Knöpfe c bis h, nur weisse Tasten, kein
 * Vorzeichen-Werkzeug), sonst wie mit ♭ ♯.
 *
 * Tiefster und höchster Ton (Entscheid 2026-11-25): bei den Übungen mit
 * Klaviatur die Enden der Klaviatur (Vorgabe c bis h¹ wie bei den
 * Intervallen), bei denen mit Notenbild die tiefste und höchste notierte
 * Stelle, je Schlüssel ein Paar. Gemeint ist die Stelle im System: ein ces¹
 * steht auf dem Platz von c¹ und gehört dazu. «Noten schreiben» hat keines,
 * dort zählt ohnehin jede Oktave. Benennen bleibt stumm.
 */

import type { KeyboardTask, NotationTask, ScoreSpec, SelectField, SelectOption, SelectTask } from '../content/schema';
import { INTERVAL_KEYBOARD, KEY_NAMES, isWhiteKey, keyNames, keysBetween, keysNamed } from '../music/piano';
import {
  STEPS,
  diatonicIndex,
  germanNoteName,
  midi,
  naturalAt,
  parsePitch,
  toGermanPitch,
  type Pitch,
  type Step,
} from '../music/theory';
import { superscriptOctave } from '../sing/curve';
import { KEY_COLOUR_OPTIONS } from './intervalle-klaviatur';
import type { Rng } from './rng';
import {
  ACCIDENTAL_OPTIONS,
  CLEF_OPTIONS,
  altersFor,
  insist,
  pitchKey,
  taskId,
  wholeNoteScore,
  type AccidentalPolicy,
} from './shared';
import { multi, single, type FilterSpec, type FilterValues, type Generator, type Question } from './types';

/**
 * Vorzeichen bis ♭ ♯. Doppelvorzeichen gehören nicht zu den Grundlagen, und
 * das Raster hätte für sie keine Zeile.
 */
const ACCIDENTALS = ACCIDENTAL_OPTIONS.filter((option) => option.value !== 'alle');

type Clef = 'treble' | 'bass';

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

/** Alle Namen im Notenbild: je Stammton mit ♭, ohne und mit ♯ (bzw. nur ohne). */
function staffNames(policy: AccidentalPolicy): { name: string; step: Step; alter: number }[] {
  return STEPS.flatMap((step) =>
    altersFor(policy).map((alter) => ({ name: nameOf(step, alter), step, alter })),
  );
}

const option = (name: string): SelectOption => ({ value: name, label: name });

// ---------------------------------------------------------------------------
// Welche Töne gefragt werden
// ---------------------------------------------------------------------------

const NATURAL_NAMES = STEPS.map((step) => nameOf(step, 0));

/** Im Notenbild alle 21 Namen, ces bis his. */
const STAFF_NAMES = staffNames('einfach').map((entry) => entry.name);

/** Die zwei Namen jeder schwarzen Taste: in «Tasten benennen» eine Wahl. */
const BLACK_KEY_NAMES = keysBetween(60, 71)
  .filter((key) => !isWhiteKey(key))
  .map(keyNames);

/** Das Raster «Töne» mit den Namen, die die Übung kennt. */
function notesFilter(names: string[], together?: string[][]): FilterSpec {
  return {
    kind: 'multi',
    key: 'notes',
    label: 'Töne',
    options: names.map(option),
    layout: 'notes',
    ...(together ? { together } : {}),
    presets: [
      { label: 'Stammtöne', values: NATURAL_NAMES },
      { label: 'alle', values: names },
    ],
  };
}

/** Die gewählten Töne; Unbekanntes fällt weg, und ohne einen gelten alle. */
function chosenNotes(values: FilterValues, names: string[]): string[] {
  const chosen = multi(values, 'notes', names).filter((name) => names.includes(name));
  return chosen.length > 0 ? chosen : names;
}

/** Nur Stammtöne gewählt: dann wie früher «nur Stammtöne». */
function policyOf(notes: string[]): AccidentalPolicy {
  return notes.every((name) => NATURAL_NAMES.includes(name)) ? 'stammton' : 'einfach';
}

/** Wenn Umfang und Töne nichts gemeinsam haben; die Übung zeigt den Satz statt einer Aufgabe. */
const NOTHING_IN_RANGE = 'Keiner der gewählten Töne liegt zwischen tiefstem und höchstem Ton.';

/** Was es früher statt «Töne» gab. Alte Links und Speicherstände nennen es noch. */
const RETIRED_ACCIDENTALS: FilterSpec = { kind: 'single', key: 'accidentals', label: 'Vorzeichen', options: ACCIDENTALS };
const RETIRED_KEY_COLOURS: FilterSpec = { kind: 'single', key: 'keyColours', label: 'Tasten', options: KEY_COLOUR_OPTIONS };

/** «nur Stammtöne» bzw. «nur weisse» von früher: von den gewählten Tönen nur die Stammtöne. */
function upgradeNotes(values: FilterValues): FilterValues {
  const { accidentals, keyColours, ...rest } = values;
  if (accidentals !== 'stammton' && keyColours !== 'weiss') return rest;
  const naturals = (Array.isArray(rest.notes) ? rest.notes : []).filter((name) => NATURAL_NAMES.includes(name));
  return { ...rest, notes: naturals.length > 0 ? naturals : NATURAL_NAMES };
}

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

// ---------------------------------------------------------------------------
// Tiefster und höchster Ton
// ---------------------------------------------------------------------------

/**
 * Die Stammtöne, die ein Schieberegler anbietet, von `low` bis `high`
 * (Tonangaben wie «c4»). Im Link stehen sie deutsch: «C», «c», «c1» —
 * gezeigt als «C», «c», «c¹».
 */
function pitchScale(low: string, high: string): { pitches: Pitch[]; options: SelectOption[] } {
  const pitches: Pitch[] = [];
  for (let index = diatonicIndex(parsePitch(low)); index <= diatonicIndex(parsePitch(high)); index++) {
    pitches.push(naturalAt(index));
  }
  const options = pitches.map((pitch) => {
    const value = toGermanPitch(pitch);
    return { value, label: superscriptOctave(value) };
  });
  return { pitches, options };
}

type PitchScale = ReturnType<typeof pitchScale>;

/**
 * Klaviatur: so weit die Klaviertöne reichen (public/samples, C bis c³).
 * Auf dem Telefon werden die Tasten bei vier Oktaven schmal; wer das will,
 * soll es dürfen.
 */
const KEYBOARD_SCALE = pitchScale('c2', 'c6');

/**
 * Notenbild: drei Hilfslinien über und unter das System, wie beim Setzen
 * (LEDGER_STEPS in NotationInput.tsx). Im Bassschlüssel unten nur bis C:
 * darunter begänne die Kontraoktave, und die braucht hier niemand.
 */
const STAFF_SCALES: Record<Clef, PitchScale> = {
  treble: pitchScale('f3', 'e6'),
  bass: pitchScale('c2', 'g4'),
};

/** Die Schlüssel, wie die Filter sie nennen. */
const CLEF_WORDS: Record<Clef, string> = { treble: 'Violinschlüssel', bass: 'Bassschlüssel' };

interface RangeKeys {
  low: string;
  high: string;
}

const KEYBOARD_KEYS: RangeKeys = { low: 'lowest', high: 'highest' };
const STAFF_KEYS: Record<Clef, RangeKeys> = {
  treble: { low: 'trebleLowest', high: 'trebleHighest' },
  bass: { low: 'bassLowest', high: 'bassHighest' },
};

/** Vorgabe der Klaviatur: c bis h¹, wie bei den Intervallen. */
const KEYBOARD_DEFAULTS = { lowest: 'c', highest: 'h1' };

/**
 * Vorgabe im Notenbild: das frühere «im System» — bis eine Hilfslinie unter
 * bzw. zwei über das System, wo die Lesehilfe c¹ liegt.
 */
const STAFF_DEFAULTS = { trebleLowest: 'c1', trebleHighest: 'g2', bassLowest: 'G', bassHighest: 'd1' };

/** Die zwei Schieberegler eines Umfangs. Der tiefste kann den höchsten nicht überholen. */
function rangeFilters(
  keys: RangeKeys,
  scale: PitchScale,
  where = '',
  disabledBy?: (values: FilterValues) => string | null,
): FilterSpec[] {
  const lock = disabledBy ? { disabledBy } : {};
  return [
    { kind: 'single', key: keys.low, label: `Tiefster Ton${where}`, options: scale.options, slider: { notAbove: keys.high }, ...lock },
    { kind: 'single', key: keys.high, label: `Höchster Ton${where}`, options: scale.options, slider: { notBelow: keys.low }, ...lock },
  ];
}

/**
 * Tiefster und höchster Ton aus den Filterwerten. Was sich nicht lesen lässt,
 * fällt auf die Vorgabe zurück; vertauschte Werte (aus einem Link) werden
 * wieder in Reihenfolge gebracht.
 */
function chosenRange(
  values: FilterValues,
  keys: RangeKeys,
  scale: PitchScale,
  defaults: Record<string, string>,
): { low: Pitch; high: Pitch } {
  const at = (key: string) => {
    const index = scale.options.findIndex((entry) => entry.value === single(values, key, defaults[key]));
    return index >= 0 ? index : scale.options.findIndex((entry) => entry.value === defaults[key]);
  };
  const [a, b] = [at(keys.low), at(keys.high)];
  insist(a >= 0 && b >= 0, 'Vorgabe des Umfangs fehlt in der Auswahl');
  return { low: scale.pitches[Math.min(a, b)], high: scale.pitches[Math.max(a, b)] };
}

// ---------------------------------------------------------------------------
// Klaviatur mit Umfang
// ---------------------------------------------------------------------------

/** Die Klaviatur, die die Einstellungen verlangen. Beide Enden sind Stammtöne, also weiss. */
function chosenKeyboard(values: FilterValues): { low: number; high: number } {
  const { low, high } = chosenRange(values, KEYBOARD_KEYS, KEYBOARD_SCALE, KEYBOARD_DEFAULTS);
  return { low: midi(low), high: midi(high) };
}

/**
 * Die Namen der Tasten von `low` bis `high`, ohne Doppelte, von unten nach
 * oben. Was nicht auf der Klaviatur liegt, wird weder gefragt noch
 * angeboten: eine Antwort, die nie richtig sein kann, prüft kein Wissen.
 */
function namesOn(keys: number[]): string[] {
  return [...new Set(keys.flatMap(keyNames))];
}

const keyboardFilters = rangeFilters(KEYBOARD_KEYS, KEYBOARD_SCALE);

// ---------------------------------------------------------------------------
// Klaviatur: Tasten benennen
// ---------------------------------------------------------------------------

interface KeyNamingFilters extends FilterValues {
  notes: string[];
  lowest: string;
  highest: string;
}

export const toeneKlaviaturBenennen: Generator<KeyNamingFilters> = {
  id: 'toene-klaviatur-benennen',
  topic: 'toene',
  skill: 'klaviatur',
  version: 1,
  title: 'Tasten benennen',
  instruction: 'Wie heisst die markierte Taste?',
  hint:
    'Orientiere dich an den schwarzen Tasten: c liegt links neben den zwei schwarzen, f links neben den drei. ' +
    'Eine schwarze Taste hat zwei Namen; beide sind richtig.',

  // Eine schwarze Taste ist eine Wahl: cis und des gehen zusammen an und ab.
  filters: [notesFilter(KEY_NAMES, BLACK_KEY_NAMES), ...keyboardFilters],
  retiredFilters: [RETIRED_KEY_COLOURS],
  upgrade: upgradeNotes,

  defaults: { notes: KEY_NAMES, ...KEYBOARD_DEFAULTS },

  generate(values, rng: Rng): Question {
    const notes = chosenNotes(values, KEY_NAMES);
    const keyboard = chosenKeyboard(values);
    const all = keysBetween(keyboard.low, keyboard.high);
    // Eine schwarze Taste zählt, sobald einer ihrer Namen gewählt ist.
    const keys = all.filter((key) => keyNames(key).some((name) => notes.includes(name)));
    if (keys.length === 0) throw new Error(NOTHING_IN_RANGE);
    const key = rng.pick(keys);
    const names = keyNames(key);

    // Unabhängig nachgerechnet: jeder Name, als Ton gelesen, ist diese Taste.
    for (const name of names) insist(keyIs(key, name), `Taste ${key} heisst nicht «${name}»`);

    // Angeboten werden alle Namen der Klaviatur, nur Stammtöne gewählt: die weissen.
    const offered = policyOf(notes) === 'stammton' ? all.filter(isWhiteKey) : all;
    const task: SelectTask = {
      id: taskId('tkb', rng),
      kind: 'select',
      keyboard: { ...keyboard, marked: [key] },
      fields: [noteNameField(names, namesOn(offered))],
    };
    return { task };
  },
};

// ---------------------------------------------------------------------------
// Klaviatur: Tonnamen spielen
// ---------------------------------------------------------------------------

interface KeyPlayingFilters extends FilterValues {
  notes: string[];
  lowest: string;
  highest: string;
}

export const toeneKlaviaturSpielen: Generator<KeyPlayingFilters> = {
  id: 'toene-klaviatur-spielen',
  topic: 'toene',
  skill: 'klaviatur',
  version: 1,
  title: 'Tonnamen auf Klaviatur spielen',
  instruction: 'Tippe eine Taste des genannten Tons an.',
  hint: 'Jede Oktave zählt. Die angetippte Taste erklingt; mit «Prüfen» gibst du sie ab.',

  filters: [notesFilter(KEY_NAMES), ...keyboardFilters],
  retiredFilters: [RETIRED_ACCIDENTALS],
  upgrade: upgradeNotes,

  defaults: { notes: KEY_NAMES, ...KEYBOARD_DEFAULTS },

  generate(values, rng: Rng): Question {
    const notes = chosenNotes(values, KEY_NAMES);
    const whiteOnly = policyOf(notes) === 'stammton';
    const keyboard = chosenKeyboard(values);
    const keys = keysBetween(keyboard.low, keyboard.high).filter((key) => !whiteOnly || isWhiteKey(key));
    const names = namesOn(keys).filter((name) => notes.includes(name));
    if (names.length === 0) throw new Error(NOTHING_IN_RANGE);
    const name = rng.pick(names);
    const accept = keysNamed(name, keyboard.low, keyboard.high);

    insist(accept.length > 0, `«${name}» liegt nicht auf der Klaviatur`);
    for (const key of accept) insist(keyIs(key, name), `Taste ${key} ist kein «${name}»`);

    const task: KeyboardTask = {
      id: taskId('tks', rng),
      kind: 'keyboard',
      prompt: name,
      keyboard,
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
// Notenbild mit Umfang
// ---------------------------------------------------------------------------

function clefsOf(values: FilterValues): Clef[] {
  const chosen = multi(values, 'clefs', ['treble']).filter((clef): clef is Clef => clef === 'treble' || clef === 'bass');
  return chosen.length > 0 ? chosen : ['treble'];
}

/** Die vier Schieberegler; die eines Schlüssels, der nicht gewählt ist, sind gesperrt. */
const staffFilters: FilterSpec[] = (['treble', 'bass'] as const).flatMap((clef) =>
  rangeFilters(STAFF_KEYS[clef], STAFF_SCALES[clef], ` im ${CLEF_WORDS[clef]}`, (values) =>
    clefsOf(values).includes(clef) ? null : `Nur mit ${CLEF_WORDS[clef]}.`,
  ),
);

function staffRange(values: FilterValues, clef: Clef): { low: Pitch; high: Pitch } {
  return chosenRange(values, STAFF_KEYS[clef], STAFF_SCALES[clef], STAFF_DEFAULTS);
}

/** Jede Note, die zwischen den beiden Stellen im System steht, mit den erlaubten Vorzeichen. */
function writtenBetween(low: Pitch, high: Pitch, alters: number[]): Pitch[] {
  const out: Pitch[] = [];
  for (let index = diatonicIndex(low); index <= diatonicIndex(high); index++) {
    for (const alter of alters) out.push({ ...naturalAt(index), alter });
  }
  return out;
}

/** Äusserste Notenlinien je Schlüssel. */
const STAFF_LINES: Record<Clef, { bottom: Pitch; top: Pitch }> = {
  treble: { bottom: parsePitch('e4'), top: parsePitch('f5') },
  bass: { bottom: parsePitch('g2'), top: parsePitch('a3') },
};

/**
 * Wie weit Schlüssel und Noten über und unter das System reichen, in px bei
 * Linienabstand 10. Gemessen an den gezeichneten Pixeln (Stand 2026-11):
 * ein Notenkopf reicht 5 über und unter seine Mitte, ein ♭ 18 darüber, ein ♯
 * 14 darunter. Eine Stufe im System sind 5. Der Bassschlüssel bleibt im
 * System; 1 deckt die Strichstärke der äussersten Linien.
 */
const CLEF_REACH: Record<Clef, { above: number; below: number }> = {
  treble: { above: 14, below: 16 },
  bass: { above: 1, below: 1 },
};
const HEAD = 5;
const FLAT_ABOVE = 18;
const SHARP_BELOW = 14;

/**
 * Platz über und unter dem System: so viel, wie der tiefste und der höchste
 * Ton der gewählten Schlüssel brauchen, plus 1 Luft. Fest je Einstellung
 * statt je Aufgabe, damit das System nicht von Aufgabe zu Aufgabe springt;
 * aber nicht mehr als nötig, denn leerer Platz ist verlorene Grösse.
 */
function noteSpace(values: FilterValues, clefs: Clef[], policy: AccidentalPolicy): NonNullable<ScoreSpec['space']> {
  const accidentals = policy !== 'stammton';
  const reach = clefs.map((clef) => {
    const { low, high } = staffRange(values, clef);
    const stepsAbove = diatonicIndex(high) - diatonicIndex(STAFF_LINES[clef].top);
    const stepsBelow = diatonicIndex(STAFF_LINES[clef].bottom) - diatonicIndex(low);
    return {
      above: Math.max(CLEF_REACH[clef].above, stepsAbove * 5 + (accidentals ? FLAT_ABOVE : HEAD)),
      below: Math.max(CLEF_REACH[clef].below, stepsBelow * 5 + (accidentals ? SHARP_BELOW : HEAD)),
    };
  });
  return {
    above: Math.max(...reach.map((entry) => entry.above)) + 1,
    below: Math.max(...reach.map((entry) => entry.below)) + 1,
  };
}

/**
 * Eine Note im gewählten Umfang, mit ihrem Namen — nachgerechnet: der Name,
 * wieder als Ton gelesen, ist dieselbe Note.
 */
function pickStaffNote(
  values: FilterValues,
  rng: Rng,
): { clef: Clef; clefs: Clef[]; policy: AccidentalPolicy; pitch: Pitch; name: string } {
  const notes = chosenNotes(values, STAFF_NAMES);
  const policy = policyOf(notes);
  const clefs = clefsOf(values);
  const candidates = (clef: Clef) => {
    const { low, high } = staffRange(values, clef);
    return writtenBetween(low, high, altersFor(policy)).filter((pitch) => notes.includes(nameOf(pitch.step, pitch.alter)));
  };
  // Nur Schlüssel, in deren Umfang einer der gewählten Töne liegt.
  const usable = clefs.filter((clef) => candidates(clef).length > 0);
  if (usable.length === 0) throw new Error(NOTHING_IN_RANGE);
  const clef = rng.pick(usable);
  const pitch = rng.pick(candidates(clef));

  const name = nameOf(pitch.step, pitch.alter);
  const back = pitchOfName(name, pitch.octave);
  insist(
    back.step === pitch.step && back.alter === pitch.alter && midi(back) === midi(pitch),
    `${pitchKey(pitch)} heisst nicht «${name}»`,
  );
  return { clef, clefs, policy, pitch, name };
}

const staffNoteFilters: FilterSpec[] = [
  notesFilter(STAFF_NAMES),
  { kind: 'multi', key: 'clefs', label: 'Schlüssel', options: CLEF_OPTIONS },
  ...staffFilters,
];

interface StaffNoteFilters extends FilterValues {
  notes: string[];
  clefs: string[];
  trebleLowest: string;
  trebleHighest: string;
  bassLowest: string;
  bassHighest: string;
}

const STAFF_NOTE_DEFAULTS: StaffNoteFilters = { notes: STAFF_NAMES, clefs: ['treble'], ...STAFF_DEFAULTS };

// ---------------------------------------------------------------------------
// Notenbild: benennen
// ---------------------------------------------------------------------------

export const notenBenennen: Generator<StaffNoteFilters> = {
  id: 'noten-benennen',
  topic: 'toene',
  skill: 'erkennen',
  // 2: tiefster und höchster Ton statt «Lage»; gewürfelt wird nach der Stelle im System.
  version: 2,
  title: 'Noten benennen',
  instruction: 'Wie heisst die Note?',
  hint: 'Gefragt ist nur der Name, nicht die Oktave. Das Vorzeichen gehört zum Namen: fis, nicht f.',

  filters: staffNoteFilters,
  retiredFilters: [RETIRED_ACCIDENTALS],
  upgrade: upgradeNotes,

  defaults: STAFF_NOTE_DEFAULTS,

  generate(values, rng: Rng): Question {
    const { clef, clefs, policy, pitch, name } = pickStaffNote(values, rng);
    const task: SelectTask = {
      id: taskId('nb', rng),
      kind: 'select',
      score: wholeNoteScore([pitchKey(pitch)], clef, { width: 110, space: noteSpace(values, clefs, policy) }),
      fields: [noteNameField([name], staffNames(policy).map((candidate) => candidate.name))],
    };
    return { task };
  },
};

// ---------------------------------------------------------------------------
// Notenbild: schreiben
// ---------------------------------------------------------------------------

/**
 * Wie weit das Eingabe-Widget über die äussersten Linien hinaus setzen lässt
 * (LEDGER_STEPS in NotationInput.tsx).
 */
const INPUT_LEDGER_STEPS = 6;

/** Der Ton in jeder Oktave, die sich im System setzen lässt. */
function settableOctaves(step: Step, alter: number, clef: Clef): Pitch[] {
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
  notes: string[];
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

  filters: [notesFilter(STAFF_NAMES), { kind: 'multi', key: 'clefs', label: 'Schlüssel', options: CLEF_OPTIONS }],
  retiredFilters: [RETIRED_ACCIDENTALS],
  upgrade: upgradeNotes,

  defaults: { notes: STAFF_NAMES, clefs: ['treble'] },

  generate(values, rng: Rng): Question {
    const notes = chosenNotes(values, STAFF_NAMES);
    const policy = policyOf(notes);
    const clefs = multi(values, 'clefs', this.defaults.clefs);
    const clef = rng.pick(clefs) as Clef;

    const { name, step, alter } = rng.pick(staffNames(policy).filter((entry) => notes.includes(entry.name)));
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

// ---------------------------------------------------------------------------
// Notenbild auf der Klaviatur spielen
// ---------------------------------------------------------------------------

/** Die Klaviatur zum Spielen: c bis h¹, jeder Ton liegt zweimal darauf. */
const PLAYING_KEYS = keysBetween(INTERVAL_KEYBOARD.low, INTERVAL_KEYBOARD.high);

export const notenKlaviaturSpielen: Generator<StaffNoteFilters> = {
  id: 'noten-klaviatur-spielen',
  topic: 'toene',
  skill: 'klaviatur',
  version: 1,
  title: 'Noten auf Klaviatur spielen',
  instruction: 'Tippe eine Taste der Note an.',
  hint: 'Jede Oktave zählt. Die angetippte Taste erklingt; mit «Prüfen» gibst du sie ab.',

  filters: staffNoteFilters,
  retiredFilters: [RETIRED_ACCIDENTALS],
  upgrade: upgradeNotes,

  defaults: STAFF_NOTE_DEFAULTS,

  generate(values, rng: Rng): Question {
    const { clef, clefs, policy, pitch, name } = pickStaffNote(values, rng);
    // Fes ist die Taste e: gesucht ist der Klang, nicht die Schreibweise.
    const accept = PLAYING_KEYS.filter((key) => keyIs(key, name));
    insist(accept.length >= 2, `«${name}» liegt nicht in beiden Oktaven`);
    for (const key of accept) insist((midi(pitch) - key) % 12 === 0, `Taste ${key} ist kein ${pitchKey(pitch)}`);

    const whiteOnly = policy === 'stammton';
    const task: KeyboardTask = {
      id: taskId('nks', rng),
      kind: 'keyboard',
      // Wie bei «Noten benennen»; die Klaviatur darunter behält ihren
      // Mindestplatz (KeyboardTaskView).
      score: wholeNoteScore([pitchKey(pitch)], clef, { width: 110, space: noteSpace(values, clefs, policy) }),
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
