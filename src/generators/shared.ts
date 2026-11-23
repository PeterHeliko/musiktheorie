/**
 * Gemeinsames Werkzeug der Generatoren.
 *
 * Zwei Sorten Inhalt:
 *  - die immer gleichen Aufgabenformen (zwei Noten mit Antwortraster, ein
 *    vorgegebener Ton mit Leerstelle, ein Vorzeichensatz …), hier einmal
 *    gebaut statt in jedem Generator neu;
 *  - Auswahl von Tonhöhen unter Nebenbedingungen (Umfang, erlaubte
 *    Vorzeichen). Das ist der Teil, den jeder Generator sonst neu erfände.
 */

import { OPTION_SETS, intervalAnswer } from '../content/options';
import type {
  MeasureSpec,
  NotationTask,
  ScoreSpec,
  SelectField,
  SelectOption,
  SelectTask,
} from '../content/schema';
import {
  STEPS,
  germanNoteName,
  intervalFullName,
  midi,
  parseIntervalLabel,
  parsePitch,
  toGermanPitch,
  transposeByInterval,
  type Duration,
  type Interval,
  type Pitch,
  type Step,
} from '../music/theory';
import type { Rng } from './rng';

// ---------------------------------------------------------------------------
// Tonhöhen unter Nebenbedingungen
// ---------------------------------------------------------------------------

/** Welche Versetzungszeichen dürfen vorkommen? */
export type AccidentalPolicy = 'stammton' | 'einfach' | 'alle';

export const ACCIDENTAL_OPTIONS: SelectOption[] = [
  { value: 'stammton', label: 'nur Stammtöne' },
  { value: 'einfach', label: 'bis ein Vorzeichen' },
  { value: 'alle', label: 'auch Doppelvorzeichen' },
];

export function altersFor(policy: AccidentalPolicy): number[] {
  if (policy === 'stammton') return [0];
  if (policy === 'einfach') return [-1, 0, 1];
  return [-2, -1, 0, 1, 2];
}

/** Ein Tonhöhenfenster in MIDI-Nummern, beide Grenzen einschliesslich. */
export interface Window {
  low: number;
  high: number;
}

/**
 * Sinnvolle Fenster je Schlüssel. «eng» bleibt im System, «weit» nutzt
 * Hilfslinien — mehr, als das Eingabe-Widget zulässt (LEDGER_STEPS = 6), wäre
 * nicht mehr notierbar.
 */
export const WINDOWS: Record<string, Window> = {
  'treble-eng': { low: 60, high: 79 },
  'treble-weit': { low: 55, high: 84 },
  'bass-eng': { low: 43, high: 62 },
  'bass-weit': { low: 36, high: 67 },
  // Beim Hören gibt es keinen Schlüssel; der Umfang richtet sich danach, was
  // angenehm zu hören ist.
  'hoeren-eng': { low: 55, high: 76 },
  'hoeren-weit': { low: 45, high: 84 },
};

export function windowFor(clef: 'treble' | 'bass' | 'hoeren', width: string): Window {
  return WINDOWS[`${clef}-${width}`] ?? WINDOWS['hoeren-eng'];
}

/** Alle notierbaren Tonhöhen im Fenster mit den erlaubten Versetzungen. */
export function candidatePitches(window: Window, alters: number[]): Pitch[] {
  const out: Pitch[] = [];
  // Eine Oktave Puffer nach beiden Seiten: ein «ces» der Oktave 5 liegt
  // klingend noch in Oktave 4 und würde sonst durchs Raster fallen.
  const lowOctave = Math.floor(window.low / 12) - 2;
  const highOctave = Math.floor(window.high / 12);

  for (let octave = lowOctave; octave <= highOctave + 1; octave++) {
    for (const step of STEPS as Step[]) {
      for (const alter of alters) {
        const pitch: Pitch = { step, alter, octave };
        const value = midi(pitch);
        if (value >= window.low && value <= window.high) out.push(pitch);
      }
    }
  }
  return out;
}

/**
 * Ein Tonpaar im Abstand des verlangten Intervalls, beide notierbar.
 *
 * Aufgezählt statt gewürfelt-und-geprüft: bei «nur Stammtöne» gibt es je
 * Intervall nur eine Handvoll Lösungen (eine übermässige Quarte etwa nur
 * f–h), und Würfeln mit Wiederholung würde dort ewig laufen oder aufgeben.
 */
export function intervalPairs(
  interval: Interval,
  window: Window,
  policy: AccidentalPolicy,
): { low: Pitch; high: Pitch }[] {
  const alters = altersFor(policy);
  const allowed = new Set(alters);
  const pairs: { low: Pitch; high: Pitch }[] = [];

  for (const low of candidatePitches(window, alters)) {
    let high: Pitch;
    try {
      high = transposeByInterval(low, interval);
    } catch {
      // Nicht jedes Intervall lässt sich über jedem Ton benennen.
      continue;
    }
    if (!allowed.has(high.alter)) continue;
    const value = midi(high);
    if (value < window.low || value > window.high) continue;
    pairs.push({ low, high });
  }
  return pairs;
}

/**
 * Löst einen Filterwert in konkrete Intervallkürzel auf.
 * «tritonus» steht für beide Schreibweisen — sie klingen gleich und sind im
 * Antwortraster zu einer Antwort zusammengefasst (`intervalAnswer()`).
 */
export function intervalLabelsFor(value: string): string[] {
  return value === 'tritonus' ? ['ü4', 'v5'] : [value];
}

/** Wählt ein Tonpaar zum Filterwert; wirft, wenn der Filter nichts zulässt. */
export function pickIntervalPair(
  rng: Rng,
  value: string,
  window: Window,
  policy: AccidentalPolicy,
): { low: Pitch; high: Pitch; label: string } {
  const labels = rng.sample(intervalLabelsFor(value), 2);
  for (const label of labels) {
    const pairs = intervalPairs(parseIntervalLabel(label), window, policy);
    if (pairs.length > 0) return { ...rng.pick(pairs), label };
  }
  throw new Error(
    `Für «${value}» gibt es im gewählten Umfang keine notierbaren Töne. ` +
      'Umfang erweitern oder mehr Vorzeichen zulassen.',
  );
}

/**
 * Tonangabe, die `parsePitch()` wieder einlesen kann («fis4», «hes3»).
 *
 * Der Sonderfall B ist der einzige heikle: «b4» liest `parsePitch()` als
 * deutsches H, und «bb4» als Doppel-b. Das erniedrigte H muss deshalb «hes»
 * heissen. Ohne diesen Zweig würde jedes B als Heses gezeichnet.
 */
export function pitchKey(pitch: Pitch): string {
  if (pitch.step === 'b' && pitch.alter === -1) return `hes${pitch.octave}`;
  const suffix =
    pitch.alter === 2 ? '##' : pitch.alter === 1 ? '#' : pitch.alter === -1 ? 'b' : pitch.alter === -2 ? 'bb' : '';
  return `${pitch.step}${suffix}${pitch.octave}`;
}

/** Deutscher Tonname ohne Oktave, wie ihn die Antwortlisten führen. */
export function noteName(pitch: Pitch): string {
  return germanNoteName(pitch.step, pitch.alter);
}

export { toGermanPitch };

// ---------------------------------------------------------------------------
// Aufgabenformen
// ---------------------------------------------------------------------------

/** Einzelnes Notenzeichen ohne Schlüssel — für Zeichen-Legenden. */
export function glyph(duration: Duration, rest = false): ScoreSpec {
  return {
    clef: 'treble',
    hideClef: true,
    width: 80,
    measures: [{ notes: [{ keys: rest ? undefined : ['h4'], duration, rest }] }],
  };
}

export function measure(notes: MeasureSpec['notes']): MeasureSpec {
  return { notes };
}

/**
 * Antwortoptionen einer Liste, eingeschränkt auf das, was die Einstellungen
 * zulassen. Wer nur Terzen übt, soll nicht zwischen dreizehn Intervallen
 * suchen müssen — und eine Antwort, die nie richtig sein kann, ist kein
 * Wissen, das geprüft wird. Reihenfolge wie in der Liste.
 */
export function optionsFrom(set: string, allowed: readonly string[]): SelectOption[] {
  const options = OPTION_SETS[set];
  if (!options) throw new Error(`Unbekannte Optionsliste: «${set}»`);
  return options.filter((option) => allowed.includes(option.value));
}

/** Hörbeispiel mit Intervall-Knopfraster; `allowed` = die eingestellten Intervalle. */
export function heardInterval(id: string, label: string, allowed: readonly string[]): SelectTask {
  return {
    id,
    kind: 'select',
    fields: [
      {
        id: 'a',
        options: optionsFrom('interval', allowed),
        correct: intervalAnswer(label),
        points: 2,
        buttons: true,
        buttonLayout: 'intervals',
      },
    ],
  };
}

/**
 * Platz über und unter dem System beim Intervall-Notenbild, je Lage.
 *
 * Gemessen an den gezeichneten Pixeln über alle Töne beider Schlüssel, mit
 * Doppelvorzeichen (Stand 2026-11: eng bis 37,5 über / 29 unter dem System,
 * weit bis 52,5 / 39), plus etwas Luft. Fest je Lage statt je Aufgabe: sonst
 * spränge das Knopfraster darunter von Aufgabe zu Aufgabe auf und ab.
 * «eng» braucht unten weniger als die Vorgabe, «weit» oben mehr — dort
 * stiessen hohe Töne mit b sonst an den Rand.
 */
const NAMING_SPACE: Record<string, NonNullable<ScoreSpec['space']>> = {
  eng: { above: 40, below: 32 },
  weit: { above: 56, below: 42 },
};

/**
 * Zwei Töne als Ganze auf einem System, darunter das Intervall-Knopfraster.
 * Untereinander statt nebeneinander: das Raster braucht quer die ganze Breite.
 */
export function intervalNaming(
  id: string,
  keys: [string, string],
  label: string,
  clef: 'treble' | 'bass',
  allowed: readonly string[],
  width = 'eng',
): SelectTask {
  return {
    id,
    kind: 'select',
    // Grösser als die übrigen Notenbilder: zwei Töne in einem Akkord sind
    // auf dem Telefon sonst schwer auseinanderzuhalten.
    score: {
      clef,
      width: 150,
      scale: 2,
      space: NAMING_SPACE[width] ?? NAMING_SPACE.weit,
      measures: [{ notes: [{ keys, duration: 'w' }] }],
    },
    fields: [
      {
        id: 'a',
        options: optionsFrom('interval', allowed),
        correct: intervalAnswer(label),
        points: 2,
        buttons: true,
        buttonLayout: 'intervals',
      },
    ],
  };
}

/** Vorgegebener Startton, der zweite Ton wird gesetzt. */
export function intervalWriting(
  id: string,
  label: string,
  start: string,
  accept: string[],
  clef: 'treble' | 'bass',
): NotationTask {
  return {
    id,
    kind: 'notation',
    mode: 'pitch',
    prompt: intervalFullName(parseIntervalLabel(label)),
    points: 2,
    // Schmal gezeichnet und stark vergrössert: die beiden Noten brauchen kaum
    // Abstand, aber jeder Linienabstand mehr Höhe macht das Setzen genauer.
    // Angezeigt etwa so breit wie zuvor (260 × 1,5).
    score: {
      clef,
      width: 200,
      scale: 2,
      measures: [
        {
          notes: [
            { keys: [start], duration: 'w' },
            { duration: 'w', placeholder: true, annotation: '?' },
          ],
        },
      ],
    },
    solution: { type: 'pitch', slots: [{ slot: 1, accept }] },
  };
}

/** Leeres System, auf das die Vorzeichen einer Tonart gesetzt werden. */
export function keySignatureTask(
  id: string,
  keyName: string,
  accidentals: number,
  clef: 'treble' | 'bass',
): NotationTask {
  return {
    id,
    kind: 'notation',
    mode: 'keysig',
    prompt: keyName,
    points: 2,
    score: { clef, width: 320, tightSpacing: true, measures: [{ notes: [] }] },
    solution: { type: 'keysig', accidentals },
  };
}

/** Gerenderter Vorzeichensatz, dazu die gefragten Tonartnamen. */
export function keyMatching(
  id: string,
  clef: 'treble' | 'bass',
  vexKey: string,
  fields: SelectField[],
): SelectTask {
  return {
    id,
    kind: 'select',
    score: { clef, keySignature: vexKey, width: 150, measures: [{ notes: [] }] },
    fields,
  };
}

/** Dreiklang mit den gefragten Bestimmungsfeldern. */
export function triadNaming(
  id: string,
  score: ScoreSpec,
  fields: SelectField[],
): SelectTask {
  return {
    id,
    kind: 'select',
    // Auswahlfelder rechts neben das Notenbild statt darunter: spart Höhe.
    layout: 'side',
    fieldColumns: fields.length > 2 ? 2 : 1,
    score,
    fields,
  };
}

/** Textfrage, beantwortet über Grundton und Geschlecht getrennt. */
export function degreeTask(id: string, prompt: string, root: string, gender: string): SelectTask {
  return {
    id,
    kind: 'select',
    prompt,
    layout: 'side',
    fieldColumns: 2,
    fields: [
      { id: 'root', label: 'Grundton', optionSet: 'rootNote', correct: root, points: 1 },
      {
        id: 'gender',
        label: 'Geschlecht',
        correct: gender,
        points: 1,
        // Ohne «vermindert» wäre die VII. Stufe unlösbar — sie ist der
        // einzige leitereigene Dreiklang, der weder Dur noch Moll ist.
        options: [
          { value: 'dur', label: 'Dur' },
          { value: 'moll', label: 'Moll' },
          { value: 'vermindert', label: 'vermindert' },
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Wiederkehrende Filteroptionen
// ---------------------------------------------------------------------------

export const CLEF_OPTIONS: SelectOption[] = [
  { value: 'treble', label: 'Violinschlüssel' },
  { value: 'bass', label: 'Bassschlüssel' },
];

export const WIDTH_OPTIONS: SelectOption[] = [
  { value: 'eng', label: 'im System' },
  { value: 'weit', label: 'mit Hilfslinien' },
];

export const DIRECTION_OPTIONS: SelectOption[] = [
  { value: 'up', label: 'aufwärts' },
  { value: 'down', label: 'abwärts' },
];

export const DURATION_OPTIONS: SelectOption[] = [
  { value: 'w', label: 'Ganze' },
  { value: 'h', label: 'Halbe' },
  { value: 'q', label: 'Viertel' },
  { value: 'q.', label: 'punktierte Viertel' },
  { value: '8', label: 'Achtel' },
  { value: '16', label: 'Sechzehntel' },
];

/** «q.» → Dauer plus Punktierung. */
export function parseDurationValue(value: string): { duration: Duration; dotted: boolean } {
  const dotted = value.endsWith('.');
  return { duration: (dotted ? value.slice(0, -1) : value) as Duration, dotted };
}

export function durationValue(duration: Duration, dotted?: boolean): string {
  return dotted ? `${duration}.` : duration;
}

/** Alle Intervall-Filterwerte in der Reihenfolge des Antwortrasters. */
export { INTERVAL_OPTIONS } from '../content/options';

/** Prüft eine Annahme des Generators; schlägt sie fehl, ist die Aufgabe kaputt. */
export function insist(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Generator hat eine falsche Aufgabe gebaut: ${message}`);
}

/** Bequem für Aufgaben-IDs, die je Frage eindeutig sein müssen. */
export function taskId(prefix: string, rng: Rng): string {
  return `${prefix}-${rng.int(0, 0xffffff).toString(36)}`;
}

export { parsePitch, midi };
