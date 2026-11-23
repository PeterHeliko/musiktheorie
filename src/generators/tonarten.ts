/**
 * Tonarten — Vorzeichen, Namen und Halbtonschritte.
 *
 *  - `tonarten-vorzeichen`: Vorzeichen einer Tonart in der richtigen
 *    Reihenfolge setzen.
 *  - `tonarten-zuordnen`: zu einem Vorzeichensatz die Tonarten benennen.
 *  - `tonarten-halbtonschritte`: in einer Tonleiter die Halbtonschritte
 *    markieren.
 */

import { SCALE_PATTERNS, type ScaleType } from '../content/audio';
import type { NotationTask, SelectField, SelectOption } from '../content/schema';
import {
  CIRCLE_OF_FIFTHS,
  keyByName,
  keySignatureSteps,
  midi,
  parseIntervalLabel,
  tonicPitchFromName,
  transposeByInterval,
  vexKeySignature,
  type Pitch,
} from '../music/theory';
import type { Rng } from './rng';
import {
  CLEF_OPTIONS,
  insist,
  keyMatching,
  keySignatureTask,
  measure,
  optionsFrom,
  pitchKey,
  taskId,
} from './shared';
import { multi, range, type FilterValues, type Generator, type Question } from './types';

const SIGN_OPTIONS: SelectOption[] = [
  { value: 'kreuz', label: 'Kreuze' },
  { value: 'b', label: 'b' },
  { value: 'keine', label: 'ohne Vorzeichen' },
];

const GENDER_OPTIONS: SelectOption[] = [
  { value: 'dur', label: 'Dur' },
  { value: 'moll', label: 'Moll' },
];

/** Tonarten, die zu Vorzeichenzahl und -art passen. */
function keysWithin(maxAccidentals: number, signs: string[]) {
  return CIRCLE_OF_FIFTHS.filter((key) => {
    if (Math.abs(key.accidentals) > maxAccidentals) return false;
    if (key.accidentals === 0) return signs.includes('keine');
    return signs.includes(key.accidentals > 0 ? 'kreuz' : 'b');
  });
}

// ---------------------------------------------------------------------------
// Vorzeichen setzen
// ---------------------------------------------------------------------------

interface SignatureFilters extends FilterValues {
  maxAccidentals: number;
  signs: string[];
  genders: string[];
  clefs: string[];
}

export const tonartenVorzeichen: Generator<SignatureFilters> = {
  id: 'vorzeichen-setzen',
  topic: 'tonleitern',
  skill: 'notieren',
  version: 1,
  title: 'Vorzeichen setzen',
  instruction:
    'Setze die Vorzeichen der angegebenen Tonart in der richtigen Reihenfolge auf die richtigen Positionen.',
  hint: 'Wähle zuerst ♯ oder ♭, klicke dann die Positionen an.',

  filters: [
    { kind: 'range', key: 'maxAccidentals', label: 'Höchstens', min: 0, max: 7, unit: 'Vorzeichen' },
    { kind: 'multi', key: 'signs', label: 'Art', options: SIGN_OPTIONS },
    { kind: 'multi', key: 'genders', label: 'Tongeschlecht', options: GENDER_OPTIONS },
    { kind: 'multi', key: 'clefs', label: 'Schlüssel', options: CLEF_OPTIONS },
  ],

  defaults: {
    maxAccidentals: 4,
    signs: ['kreuz', 'b'],
    genders: ['dur', 'moll'],
    clefs: ['treble'],
  },

  generate(values, rng: Rng): Question {
    const maxAccidentals = Math.round(range(values, 'maxAccidentals', 4));
    const signs = multi(values, 'signs', this.defaults.signs);
    const genders = multi(values, 'genders', this.defaults.genders);
    const clefs = multi(values, 'clefs', this.defaults.clefs);

    const pool = keysWithin(maxAccidentals, signs);
    insist(
      pool.length > 0,
      'Mit dieser Vorzeichengrenze und -art bleibt keine Tonart übrig.',
    );

    const key = rng.pick(pool);
    const gender = rng.pick(genders);
    const keyName = gender === 'dur' ? key.major : key.minor;
    const clef = rng.pick(clefs) as 'treble' | 'bass';

    // Unabhängig nachrechnen: der Name muss über den Quintenzirkel wieder auf
    // dieselbe Vorzeichenzahl führen. Ein vertauschter Paralleltonartname
    // fiele sonst erst beim Üben auf.
    const resolved = keyByName(keyName);
    insist(
      resolved.accidentals === key.accidentals,
      `${keyName} hat ${resolved.accidentals} statt ${key.accidentals} Vorzeichen`,
    );

    return {
      task: keySignatureTask(taskId('tv', rng), keyName, key.accidentals, clef),
      instruction:
        key.accidentals === 0
          ? `${keyName} hat keine Vorzeichen. Lass das System leer.`
          : this.instruction,
    };
  },
};

// ---------------------------------------------------------------------------
// Tonarten den Vorzeichen zuordnen
// ---------------------------------------------------------------------------

const ASK_OPTIONS: SelectOption[] = [
  { value: 'dur', label: 'Durtonart' },
  { value: 'moll', label: 'parallele Molltonart' },
];

interface MatchFilters extends FilterValues {
  maxAccidentals: number;
  signs: string[];
  ask: string[];
  clefs: string[];
}

export const tonartenZuordnen: Generator<MatchFilters> = {
  id: 'tonarten-zuordnen',
  topic: 'tonleitern',
  skill: 'erkennen',
  version: 1,
  title: 'Tonarten den Vorzeichen zuordnen',
  instruction: 'Wähle die zu den Vorzeichen passenden Tonarten.',

  filters: [
    { kind: 'range', key: 'maxAccidentals', label: 'Höchstens', min: 0, max: 7, unit: 'Vorzeichen' },
    { kind: 'multi', key: 'signs', label: 'Art', options: SIGN_OPTIONS },
    { kind: 'multi', key: 'ask', label: 'Gefragt ist', options: ASK_OPTIONS },
    { kind: 'multi', key: 'clefs', label: 'Schlüssel', options: CLEF_OPTIONS },
  ],

  defaults: {
    maxAccidentals: 4,
    signs: ['kreuz', 'b', 'keine'],
    ask: ['dur', 'moll'],
    clefs: ['treble', 'bass'],
  },

  generate(values, rng: Rng): Question {
    const maxAccidentals = Math.round(range(values, 'maxAccidentals', 4));
    const signs = multi(values, 'signs', this.defaults.signs);
    const ask = multi(values, 'ask', this.defaults.ask);
    const clefs = multi(values, 'clefs', this.defaults.clefs);

    const pool = keysWithin(maxAccidentals, signs);
    insist(pool.length > 0, 'Mit dieser Vorzeichengrenze und -art bleibt keine Tonart übrig.');

    const key = rng.pick(pool);
    const clef = rng.pick(clefs) as 'treble' | 'bass';

    const fields: SelectField[] = [];
    if (ask.includes('dur')) {
      fields.push({
        id: 'dur',
        label: 'Durtonart',
        // Nur Tonarten innerhalb der eingestellten Vorzeichen stehen zur Wahl.
        options: optionsFrom('majorKey', pool.map((entry) => entry.major)),
        correct: key.major,
        points: 1,
      });
    }
    if (ask.includes('moll')) {
      fields.push({
        id: 'moll',
        label: 'parallele Molltonart',
        options: optionsFrom('minorKey', pool.map((entry) => entry.minor)),
        correct: key.minor,
        points: 1,
      });
    }

    // Die Parallelen müssen dieselben Vorzeichen tragen — das ist die ganze
    // Aussage der Aufgabe.
    insist(
      keyByName(key.minor).accidentals === key.accidentals,
      `${key.minor} ist nicht die Paralleltonart von ${key.major}`,
    );

    return {
      task: keyMatching(taskId('tz', rng), clef, vexKeySignature(key.accidentals), fields),
    };
  },
};

// ---------------------------------------------------------------------------
// Halbtonschritte markieren
// ---------------------------------------------------------------------------

const SCALE_OPTIONS: SelectOption[] = [
  { value: 'dur', label: 'Dur' },
  { value: 'moll-natuerlich', label: 'moll natürlich' },
  { value: 'moll-harmonisch', label: 'moll harmonisch' },
  { value: 'moll-melodisch', label: 'moll melodisch' },
];

const SCALE_NAMES: Record<ScaleType, string> = {
  dur: 'Dur-Tonleiter',
  'moll-natuerlich': 'Moll-Tonleiter (natürlich)',
  'moll-harmonisch': 'Moll-Tonleiter (harmonisch)',
  'moll-melodisch': 'Moll-Tonleiter (melodisch)',
};

interface SemitoneFilters extends FilterValues {
  scales: string[];
  maxAccidentals: number;
  directions: string[];
  clefs: string[];
}

export const tonartenHalbtonschritte: Generator<SemitoneFilters> = {
  id: 'halbtonschritte-markieren',
  topic: 'tonleitern',
  skill: 'erkennen',
  version: 1,
  title: 'Halbtonschritte markieren',
  instruction:
    'Klicke auf die Stellen zwischen zwei Noten, an denen ein <b>Halbtonschritt</b> liegt.',
  hint: 'Die harmonische Molltonleiter hat zwischen der 6. und 7. Stufe einen ganzen Anderthalbtonschritt — der zählt nicht.',

  filters: [
    { kind: 'multi', key: 'scales', label: 'Welche Tonleiterarten?', options: SCALE_OPTIONS },
    { kind: 'range', key: 'maxAccidentals', label: 'Höchstens', min: 0, max: 5, unit: 'Vorzeichen' },
    {
      kind: 'multi',
      key: 'directions',
      label: 'Richtung',
      options: [
        { value: 'up', label: 'aufwärts' },
        { value: 'down', label: 'abwärts' },
      ],
    },
    { kind: 'multi', key: 'clefs', label: 'Schlüssel', options: CLEF_OPTIONS },
  ],

  defaults: {
    scales: ['dur', 'moll-natuerlich'],
    maxAccidentals: 4,
    directions: ['up'],
    clefs: ['treble'],
  },

  generate(values, rng: Rng): Question {
    const scales = multi(values, 'scales', this.defaults.scales);
    const maxAccidentals = Math.round(range(values, 'maxAccidentals', 4));
    const directions = multi(values, 'directions', this.defaults.directions);
    const clefs = multi(values, 'clefs', this.defaults.clefs);

    const scale = rng.pick(scales) as ScaleType;
    const pool = CIRCLE_OF_FIFTHS.filter((key) => Math.abs(key.accidentals) <= maxAccidentals);
    insist(pool.length > 0, 'Mit dieser Vorzeichengrenze bleibt keine Tonart übrig.');

    const key = rng.pick(pool);
    const isMajor = scale === 'dur';
    const keyName = isMajor ? key.major : key.minor;
    const tonicName = keyName.replace(/-(Dur|Moll)$/i, '');
    const clef = rng.pick(clefs) as 'treble' | 'bass';
    const direction = rng.pick(directions) as 'up' | 'down';

    const tonic = placeTonic(tonicPitchFromName(tonicName), clef);
    const ascending = SCALE_PATTERNS[scale].map((label) =>
      transposeByInterval(tonic, parseIntervalLabel(label)),
    );
    const pitches = direction === 'down' ? [...ascending].reverse() : ascending;

    // DIE Rechnung dieser Aufgabe: wo liegt ein Halbtonschritt? Direkt aus den
    // Tonhöhen, nicht aus einer Tabelle — sonst prüfte die Aufgabe nur, ob die
    // Tabelle zur Tabelle passt.
    const gaps: number[] = [];
    for (let i = 0; i + 1 < pitches.length; i++) {
      if (Math.abs(midi(pitches[i + 1]) - midi(pitches[i])) === 1) gaps.push(i);
    }
    insist(gaps.length > 0, `${keyName} ${scale} hätte keinen Halbtonschritt — das kann nicht sein.`);

    const task: NotationTask = {
      id: taskId('th', rng),
      kind: 'notation',
      mode: 'mark',
      prompt: `${tonicName}-${SCALE_NAMES[scale]} ${direction === 'up' ? 'aufwärts' : 'abwärts'}`,
      points: gaps.length,
      score: {
        clef,
        endBar: true,
        measures: [measure(pitches.map((pitch) => ({ keys: [pitchKey(pitch)], duration: 'w' as const })))],
      },
      solution: { type: 'mark', gaps },
    };

    return { task };
  },
};

/** Tonleiter so legen, dass sie im gewählten Schlüssel bequem Platz hat. */
function placeTonic(tonic: Pitch, clef: 'treble' | 'bass'): Pitch {
  // Der Grundton bekommt die Oktave, ab der die Leiter im System liegt: eine
  // Oktave nach oben muss noch hineinpassen.
  const target = clef === 'treble' ? 60 : 43;
  let best = { ...tonic, octave: 4 };
  for (const octave of [2, 3, 4, 5]) {
    const candidate = { ...tonic, octave };
    if (Math.abs(midi(candidate) - target) < Math.abs(midi(best) - target)) best = candidate;
  }
  return best;
}

/** Für Tests: welche Vorzeichen trägt diese Tonart, in welcher Reihenfolge? */
export { keySignatureSteps };
