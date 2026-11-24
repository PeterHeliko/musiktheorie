/**
 * Tonarten — Vorzeichen, Namen und Halbtonschritte.
 *
 *  - `tonarten-vorzeichen`: Vorzeichen einer Tonart in der richtigen
 *    Reihenfolge setzen.
 *  - `tonarten-zuordnen`: zu einem Vorzeichensatz die Tonarten benennen.
 *  - `tonarten-halbtonschritte`: in einer Tonleiter die Halbtonschritte
 *    markieren.
 */

import type { NotationTask, SelectField, SelectOption } from '../content/schema';
import { scalePitches } from '../music/scales';
import {
  CIRCLE_OF_FIFTHS,
  keyByName,
  keySignatureSteps,
  midi,
  vexKeySignature,
} from '../music/theory';
import type { Rng } from './rng';
import {
  CLEF_OPTIONS,
  insist,
  keyMatching,
  keySignatureTask,
  measure,
  pitchKey,
  taskId,
} from './shared';
import { DIRECTION_FILTER, SCALE_FILTER, pickScale, placeTonic, scalePrompt } from './tonleitern';
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
  hint: 'Wähle zuerst ♯ oder ♭ und setze dann die Vorzeichen auf ihre Positionen.',

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
      // Ohne diesen Satz wüsste man bei C-Dur und a-Moll nicht, ob man etwas
      // übersehen hat.
      context: key.accidentals === 0 ? `${keyName} hat keine Vorzeichen. Lass das System leer.` : undefined,
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

    // Ein Tonnamen-Raster je gefragter Tonart (Entscheid 2026-11-24): Spalte
    // = Stammton des Grundtons, ♯ oben, ♭ unten. Auf den Knöpfen steht nur
    // der Grundton — Dur gross, Moll klein, wie im Tonartnamen; was gemeint
    // ist, sagt die Überschrift. Nur Tonarten innerhalb der eingestellten
    // Vorzeichen stehen zur Wahl, jede an ihrem festen Platz.
    const raster = (id: string, label: string, correct: string, names: string[]): SelectField => ({
      id,
      label,
      options: names.map((name) => ({ value: name, label: name.replace(/-(Dur|Moll)$/, '') })),
      correct,
      points: 1,
      buttons: true,
      buttonLayout: 'notes',
    });
    const fields: SelectField[] = [];
    if (ask.includes('dur')) fields.push(raster('dur', 'Durtonart', key.major, pool.map((entry) => entry.major)));
    if (ask.includes('moll')) {
      fields.push(raster('moll', 'parallele Molltonart', key.minor, pool.map((entry) => entry.minor)));
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
  // 2: Kirchentonarten; Grundtöne aus scaleTonics, melodisch Moll abwärts natürlich (2026-11-24).
  version: 2,
  title: 'Halbtonschritte markieren',
  instruction:
    'Klicke auf die Stellen zwischen zwei Noten, an denen ein <b>Halbtonschritt</b> liegt.',
  hint: 'Die harmonische Molltonleiter hat zwischen der 6. und 7. Stufe einen ganzen Anderthalbtonschritt — der zählt nicht.',

  filters: [
    SCALE_FILTER,
    { kind: 'range', key: 'maxAccidentals', label: 'Höchstens', min: 0, max: 5, unit: 'Vorzeichen' },
    DIRECTION_FILTER,
    { kind: 'multi', key: 'clefs', label: 'Schlüssel', options: CLEF_OPTIONS },
  ],

  defaults: {
    scales: ['dur', 'moll-natuerlich'],
    maxAccidentals: 4,
    directions: ['up'],
    clefs: ['treble'],
  },

  generate(values, rng: Rng): Question {
    const choice = pickScale(values, rng);
    const clefs = multi(values, 'clefs', this.defaults.clefs);
    const clef = rng.pick(clefs) as 'treble' | 'bass';
    const pitches = scalePitches(placeTonic(choice.tonic, clef), choice.type, choice.direction);

    // DIE Rechnung dieser Aufgabe: wo liegt ein Halbtonschritt? Direkt aus den
    // Tonhöhen, nicht aus einer Tabelle — sonst prüfte die Aufgabe nur, ob die
    // Tabelle zur Tabelle passt.
    const gaps: number[] = [];
    for (let i = 0; i + 1 < pitches.length; i++) {
      if (Math.abs(midi(pitches[i + 1]) - midi(pitches[i])) === 1) gaps.push(i);
    }
    const prompt = scalePrompt(choice);
    insist(gaps.length > 0, `${prompt} hätte keinen Halbtonschritt — das kann nicht sein.`);

    const task: NotationTask = {
      id: taskId('th', rng),
      kind: 'notation',
      mode: 'mark',
      prompt,
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

/** Für Tests: welche Vorzeichen trägt diese Tonart, in welcher Reihenfolge? */
export { keySignatureSteps };
