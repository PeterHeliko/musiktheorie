/* Herkunft: musiktheorie-scorm/src/scoring/index.ts (Stand 2026-08-21), über das Projekt «training».
   Wird hier eigenständig weitergeführt; es gibt keinen Abgleich mit dem Original mehr. */
/**
 * Bewertung.
 *
 * Bewusst getrennt von der Oberfläche: die Auswertung muss ohne DOM testbar
 * sein, weil Fehler hier still passieren und Falsches als richtig durchgehen
 * lassen.
 */

import { INTERVAL_OPTIONS, INTERVAL_SIZE_OPTIONS, SEMITONE_ANSWERS, resolveOptions } from '../content/options';
import type {
  KeyboardTask,
  NotationTask,
  PitchSlotSolution,
  SelectField,
  SingTask,
  Task,
  TextTableTask,
} from '../content/schema';
import { keyNames, whiteIndex } from '../music/piano';
import { judgeSequence, judgeSung, judgeTimed, type SequenceGoal } from '../sing/judge';
import { describeChordRule, describeKeys, describeNotes, judgeChordKeys, judgeChordNotes } from './chord';
import { nameFromMidi, pitchFromMidi } from '../sing/notes';
import {
  DURATION_LABELS,
  germanNoteName,
  keySignaturePitches,
  keySignatureSteps,
  midi,
  parsePitch,
  toGermanPitch,
  type Duration,
  type Pitch,
  type Step,
} from '../music/theory';

// ---------------------------------------------------------------------------
// Antwortformate (bewusst kurze Feldnamen)
// ---------------------------------------------------------------------------

/** Eine selbst gesetzte Note. */
export interface InputNote {
  /** Stammton (englisch, wie im Theoriekern). */
  s: Step;
  /** Oktave, wissenschaftlich. */
  o: number;
  /** Versetzung in Halbtönen. */
  a: number;
  d: Duration;
  /** Punktiert. */
  dot?: boolean;
  /** Pause statt Note. */
  r?: boolean;
}

export type SelectAnswer = Record<string, string>;
export type PitchAnswer = Record<string, InputNote[]>;
export type MelodyAnswer = InputNote[][];
export type SlotAnswer = Record<string, { d: Duration; dot?: boolean }>;
export interface KeysigAnswer {
  sign: 1 | -1;
  /** Gesetzte Vorzeichen in der Reihenfolge des Setzens, mit Oktave. */
  placed: { s: Step; o: number }[];
}
export type MarkAnswer = number[];

/**
 * Vorzeichen setzen: Reihenfolge UND Vorzeichenart müssen stimmen. Die
 * Oktavlage zählt nicht, weil beide üblichen Notationshöhen zulässig sind.
 * `marks` sagt für jedes gesetzte Zeichen, in der Reihenfolge des Setzens, ob
 * es an seiner Stelle der richtige Stammton ist — so färbt die Ansicht nach
 * dem Prüfen jedes Zeichen grün oder rot. Ganz richtig ist der Satz, wenn
 * dazu keines fehlt und keines zu viel ist. `unusual`: richtig, aber nicht
 * alle in der üblichen Oktave (`keySignaturePitches`). `wrongOrder`: die
 * richtigen Vorzeichen, nur in anderer Reihenfolge — falsch, mit Hinweis.
 */
export function judgeKeySignature(
  accidentals: number,
  value: KeysigAnswer,
  clef: 'treble' | 'bass' = 'treble',
): { correct: boolean; marks: boolean[]; unusual: boolean; wrongOrder: boolean } {
  const { steps, sign } = keySignatureSteps(accidentals);
  const signRight = accidentals === 0 || value.sign === sign;
  const marks = value.placed.map((placed, index) => signRight && placed.s === steps[index]);
  const correct = value.placed.length === steps.length && marks.every(Boolean);
  // Richtig, aber nicht an den üblichen Stellen: zählt, verdient aber einen
  // Hinweis (Entscheid 2026-11-24).
  const usual = keySignaturePitches(accidentals, clef);
  const unusual = correct && value.placed.some((placed, index) => placed.o !== usual[index].octave);
  // Die richtigen Vorzeichen, aber in falscher Reihenfolge: falsch, denn die
  // Reihenfolge ist gefragt — die Ansicht sagt es aber dazu.
  const sorted = (list: readonly string[]) => [...list].sort().join(' ');
  const wrongOrder =
    !correct &&
    signRight &&
    steps.length > 1 &&
    sorted(value.placed.map((placed) => placed.s)) === sorted(steps);
  return { correct, marks, unusual, wrongOrder };
}
/** Ein frei gesetzter Akkord: Töne im oberen (bzw. einzigen) und im unteren System. */
export interface ChordAnswer {
  u?: InputNote[];
  l?: InputNote[];
}
export type TextTableAnswer = Record<string, string>;

/** Für Aufgaben mit Noteneingabe UND Auswahlfeldern. */
export interface NotationAnswer {
  n?: unknown;
  f?: SelectAnswer;
}

export function toPitch(note: InputNote): Pitch {
  return { step: note.s, alter: note.a, octave: note.o };
}

export function fromPitch(p: Pitch, d: Duration, dot?: boolean): InputNote {
  return { s: p.step, o: p.octave, a: p.alter, d, ...(dot ? { dot: true } : {}) };
}

function samePitch(a: Pitch, b: Pitch): boolean {
  // Enharmonisch streng: die Schreibweise ist bei Intervallen Teil der Aufgabe.
  return a.step === b.step && a.alter === b.alter && a.octave === b.octave;
}

export function durationText(d: Duration, dotted?: boolean): string {
  // «Viertelnote» → «Viertel», «Ganze Note» → «Ganze». Das \s* ist wichtig,
  // sonst bliebe bei den zweiteiligen Namen ein Leerzeichen am Ende stehen.
  const label = DURATION_LABELS[d].note.replace(/\s*note$/i, '');
  return dotted ? `punktierte ${label}` : label;
}

// ---------------------------------------------------------------------------
// Ergebnisse
// ---------------------------------------------------------------------------

export interface Detail {
  /** Wird als cmi.interactions-ID verwendet. */
  id: string;
  label: string;
  earned: number;
  possible: number;
  studentResponse: string;
  correctResponse: string;
  /** null = wird nicht automatisch bewertet (Musikgeschichte). */
  correct: boolean | null;
  interactionType: 'choice' | 'fill-in' | 'matching' | 'performance';
}

export interface TaskResult {
  taskId: string;
  /** Titel der Aufgabengruppe — die Auswertung gliedert danach. */
  exerciseTitle: string;
  /** Nummer innerhalb der Aufgabengruppe, wie im Test angezeigt. */
  number: number;
  earned: number;
  possible: number;
  details: Detail[];
}

// ---------------------------------------------------------------------------
// Auswahlfelder
// ---------------------------------------------------------------------------

function labelFor(field: SelectField, value: string): string {
  if (!value) return '—';
  const option = resolveOptions(field).find((o) => o.value === value);
  return option ? option.label : value;
}

/** Alle Werte, die in diesem Feld richtig sind — `correct` zuerst. */
export function acceptedValues(field: SelectField): string[] {
  return [field.correct, ...(field.alsoCorrect ?? [])];
}

function scoreSelectFields(
  taskId: string,
  fields: SelectField[],
  answer: SelectAnswer | undefined,
): Detail[] {
  return fields.map((field) => {
    const given = answer?.[field.id] ?? '';
    const correct = acceptedValues(field).includes(given);
    return {
      id: `${taskId}_${field.id}`,
      label: field.label ?? 'Antwort',
      earned: correct ? field.points : 0,
      possible: field.points,
      studentResponse: labelFor(field, given),
      correctResponse: acceptedValues(field)
        .map((value) => labelFor(field, value))
        .join(' oder '),
      correct,
      interactionType: 'choice' as const,
    };
  });
}

// ---------------------------------------------------------------------------
// Noteneingabe
// ---------------------------------------------------------------------------

/**
 * Stimmt ein Eingabeplatz der Tonhöhen-Eingabe? Ausgelagert, damit die
 * Noteneingabe nach dem Prüfen genau so einfärbt, wie hier bewertet wird.
 */
export function pitchSlotCorrect(slot: PitchSlotSolution, notes: InputNote[]): boolean {
  const accepted = slot.accept.map(parsePitch);
  if (slot.chord) {
    // Alle erwarteten Töne müssen da sein, keine überzähligen.
    const givenPitches = notes.map(toPitch).sort((a, b) => midi(a) - midi(b));
    const wanted = [...accepted].sort((a, b) => midi(a) - midi(b));
    return givenPitches.length === wanted.length && givenPitches.every((p, i) => samePitch(p, wanted[i]));
  }
  // Leer gelassen, wo das erlaubt ist (die Oktave am Ende einer Tonleiter).
  if (slot.optional && notes.length === 0) return true;
  // Genau ein Ton, der einer der zulässigen Varianten entspricht.
  return notes.length === 1 && accepted.some((p) => samePitch(p, toPitch(notes[0])));
}

function scoreNotation(task: NotationTask, answer: NotationAnswer | undefined): Detail[] {
  const solution = task.solution;
  const given = answer?.n;
  const id = task.id;

  switch (solution.type) {
    case 'pitch': {
      const placed = (given as PitchAnswer | undefined) ?? {};
      // Die Punkte teilen sich die verlangten Plätze. Ein freier Platz (die
      // Oktave am Ende einer Tonleiter) zählt erst mit, wenn dort etwas
      // steht — leer bringt er weder Punkte noch Abzug.
      const perSlot = task.points / Math.max(1, solution.slots.filter((slot) => !slot.optional).length);
      return solution.slots.map((slot) => {
        const notes = placed[String(slot.slot)] ?? [];
        const accepted = slot.accept.map(parsePitch);
        const correct = pitchSlotCorrect(slot, notes);
        const possible = slot.optional && notes.length === 0 ? 0 : perSlot;

        return {
          id: `${id}_s${slot.slot}`,
          label: task.prompt ?? 'Noteneingabe',
          earned: correct ? possible : 0,
          possible,
          studentResponse: notes.length ? notes.map((n) => toGermanPitch(toPitch(n))).join(' ') : '—',
          correctResponse: slot.chord
            ? accepted.map(toGermanPitch).join(' ')
            : accepted.map(toGermanPitch).join(' oder '),
          correct,
          interactionType: 'fill-in' as const,
        };
      });
    }

    case 'slot': {
      const placed = (given as SlotAnswer | undefined) ?? {};
      const perSlot = task.points / solution.slots.length;
      return solution.slots.map((slot) => {
        const value = placed[String(slot.measure)];
        const correct =
          !!value && value.d === slot.duration && Boolean(value.dot) === Boolean(slot.dotted);
        return {
          id: `${id}_t${slot.measure + 1}`,
          label: `Takt ${slot.measure + 1}`,
          earned: correct ? perSlot : 0,
          possible: perSlot,
          studentResponse: value ? durationText(value.d, value.dot) : '—',
          correctResponse: durationText(slot.duration, slot.dotted),
          correct,
          interactionType: 'choice' as const,
        };
      });
    }

    case 'keysig': {
      const value = given as KeysigAnswer | undefined;
      const { steps, sign } = keySignatureSteps(solution.accidentals);
      const correct = !!value && judgeKeySignature(solution.accidentals, value).correct;

      const describe = (list: { s: Step }[], s: 1 | -1) =>
        list.length === 0
          ? 'keine Vorzeichen'
          : list.map((p) => germanNoteName(p.s, s)).join(' ');

      return [
        {
          id: `${id}_keysig`,
          label: task.prompt ?? 'Vorzeichen',
          earned: correct ? task.points : 0,
          possible: task.points,
          studentResponse: value ? describe(value.placed, value.sign) : '—',
          correctResponse: describe(steps.map((s) => ({ s })), sign),
          correct,
          interactionType: 'fill-in' as const,
        },
      ];
    }

    case 'chord': {
      const value = (given as ChordAnswer | undefined) ?? {};
      const notes = [...(value.u ?? []), ...(value.l ?? [])].map(toPitch);
      const correct = judgeChordNotes(solution.rule, notes).correct;
      return [
        {
          id: `${id}_akkord`,
          label: task.prompt ?? 'Akkord',
          earned: correct ? task.points : 0,
          possible: task.points,
          studentResponse: describeNotes(notes),
          correctResponse: describeChordRule(solution.rule),
          correct,
          interactionType: 'fill-in' as const,
        },
      ];
    }

    case 'mark': {
      const value = ((given as MarkAnswer | undefined) ?? []).slice().sort((a, b) => a - b);
      const wanted = solution.gaps.slice().sort((a, b) => a - b);
      const correct = value.length === wanted.length && value.every((g, i) => g === wanted[i]);
      const describe = (gaps: number[]) =>
        gaps.length ? gaps.map((g) => `${g + 1}–${g + 2}`).join(', ') : '—';
      return [
        {
          id: `${id}_mark`,
          label: task.prompt ?? 'Halbtonschritte',
          earned: correct ? task.points : 0,
          possible: task.points,
          studentResponse: describe(value),
          correctResponse: describe(wanted),
          correct,
          interactionType: 'fill-in' as const,
        },
      ];
    }

    case 'melody': {
      const measures = ((given as MelodyAnswer | undefined) ?? []).map((m) => m ?? []);
      const expected = solution.measures;

      // Rhythmus und Tonhöhe werden UNABHÄNGIG voneinander verglichen: wer die
      // Melodie hört, aber einen Notenwert verfehlt, soll trotzdem die
      // Tonhöhenpunkte bekommen (und umgekehrt).
      const flatGiven = measures.flat();
      const flatExpected = expected.flat();

      const rhythmMatches = flatExpected.filter((exp, i) => {
        const got = flatGiven[i];
        return !!got && got.d === exp.duration && Boolean(got.dot) === Boolean(exp.dotted);
      }).length;

      const pitchMatches = flatExpected.filter((exp, i) => {
        const got = flatGiven[i];
        if (!got || !exp.keys?.length) return false;
        return samePitch(toPitch(got), parsePitch(exp.keys[0]));
      }).length;

      const total = flatExpected.length;
      // Überzählige Noten kosten anteilig, sonst lohnt sich Raten mit vielen Noten.
      const surplus = Math.max(0, flatGiven.length - total);
      const ratio = (matches: number) => Math.max(0, (matches - surplus) / total);

      const describeRhythm = (notes: InputNote[]) =>
        notes.length ? notes.map((n) => `${n.d}${n.dot ? '.' : ''}`).join(' ') : '—';
      const describePitch = (notes: InputNote[]) =>
        notes.length ? notes.map((n) => toGermanPitch(toPitch(n))).join(' ') : '—';

      return [
        {
          id: `${id}_rhythmus`,
          label: 'Rhythmus',
          earned: solution.rhythmPoints * ratio(rhythmMatches),
          possible: solution.rhythmPoints,
          studentResponse: describeRhythm(flatGiven).slice(0, 250),
          correctResponse: flatExpected.map((n) => `${n.duration}${n.dotted ? '.' : ''}`).join(' '),
          correct: rhythmMatches === total && surplus === 0,
          interactionType: 'performance' as const,
        },
        {
          id: `${id}_tonhoehen`,
          label: 'Tonhöhen',
          earned: solution.pitchPoints * ratio(pitchMatches),
          possible: solution.pitchPoints,
          studentResponse: describePitch(flatGiven).slice(0, 250),
          correctResponse: flatExpected
            .map((n) => (n.keys?.length ? toGermanPitch(parsePitch(n.keys[0])) : '-'))
            .join(' '),
          correct: pitchMatches === total && surplus === 0,
          interactionType: 'performance' as const,
        },
      ];
    }
  }
}

// ---------------------------------------------------------------------------
// Freitext
// ---------------------------------------------------------------------------

function scoreTextTable(task: TextTableTask, answer: TextTableAnswer | undefined): Detail[] {
  const details: Detail[] = [];
  for (let row = 0; row < task.rows; row++) {
    for (const column of task.columns) {
      const key = `${row}_${column.id}`;
      const text = (answer?.[key] ?? '').trim();
      // Leere Zellen erzeugen keine Interaktion — der Bericht bliebe sonst
      // voller Leerzeilen.
      if (!text) continue;
      details.push({
        id: `${task.id}_z${row + 1}_${column.id}`,
        label: `Zeile ${row + 1} · ${column.label}`,
        earned: 0,
        possible: 0,
        studentResponse: text,
        correctResponse: '',
        correct: null,
        interactionType: 'fill-in',
      });
    }
  }
  return details;
}

// ---------------------------------------------------------------------------
// Singen
// ---------------------------------------------------------------------------

/** Die gehaltenen Töne in der gesungenen Reihenfolge, MIDI mit Nachkommastellen. */
export interface SingAnswer {
  notes: number[];
  /** Im Tempo: die Tonhöhe je Schlag, null = stumm (`judgeTimed`). */
  beats?: (number | null)[];
}

/** «e1», «e1, 20 Cent zu tief». Kleine Abweichungen sind keine Rede wert. */
function describeSung(name: string, cents: number | null): string {
  if (cents === null || Math.abs(cents) < 10) return name;
  return `${name}, ${Math.abs(cents)} Cent zu ${cents < 0 ? 'tief' : 'hoch'}`;
}

/**
 * Eine gesungene Tonfolge: richtig ist sie, wenn alle Töne in der
 * Reihenfolge kamen und keiner falsch war (`judgeSequence`).
 */
/**
 * Die Regeln einer gesungenen Tonfolge (`judgeSequence`, `judgeTimed`) aus
 * der Aufgabe. Ansicht und Bewertung nehmen beide diese, damit sie nicht
 * auseinanderlaufen.
 */
export function sequenceGoalOf(task: SingTask, sequence: string[]): SequenceGoal {
  return {
    reference: midi(parsePitch(task.reference)),
    targets: sequence.map((key) => midi(parsePitch(key))),
    tolerance: task.tolerance,
    optionalLast: task.optionalLast,
    ...(task.notated ? { repeats: 'previous' as const } : {}),
  };
}

function scoreSingSequence(task: SingTask, sequence: string[], answer: SingAnswer | undefined): Detail[] {
  const targets = sequence.map(parsePitch);
  const goal = sequenceGoalOf(task, sequence);
  const timed = task.tempo !== undefined;
  const verdict = timed ? judgeTimed(goal, answer?.beats ?? []) : judgeSequence(goal, answer?.notes ?? []);
  // In der gesungenen Reihenfolge: richtige Töne heissen wie notiert, in der
  // gesungenen Oktave; falsche, wie man sie meist liest; stumme Schläge «—».
  const sung = verdict.roles.flatMap((role, index) => {
    if (role === 'right') {
      const { step, verdict: note } = verdict.right.find((entry) => entry.index === index)!;
      return [toGermanPitch({ ...targets[step], octave: targets[step].octave + note.octaveShift })];
    }
    if (role === 'missing') return ['—'];
    if (role !== 'wrong') return [];
    const note = verdict.wrong.find((entry) => entry.index === index)!.note;
    return [`${nameFromMidi(Math.round(note))} (falsch)`];
  });
  return [
    {
      id: `${task.id}_gesungen`,
      label: task.prompt ?? 'Gesungen',
      earned: verdict.correct ? task.points : 0,
      possible: task.points,
      studentResponse: sung.length ? sung.join(' ') : '—',
      correctResponse: targets.map(toGermanPitch).join(' '),
      correct: verdict.correct,
      interactionType: 'performance',
    },
  ];
}

function scoreSing(task: SingTask, answer: SingAnswer | undefined): Detail[] {
  if (task.sequence) return scoreSingSequence(task, task.sequence, answer);
  const target = parsePitch(task.target);
  const verdict = judgeSung(
    { reference: midi(parsePitch(task.reference)), target: midi(target), tolerance: task.tolerance },
    answer?.notes ?? [],
    { untilRight: task.untilRight },
  );

  let sung = '—';
  if (verdict.note !== null) {
    // Der richtige Ton heisst so, wie er notiert wäre (eis, nicht f) — in
    // der Oktave, in der er gesungen wurde. Ein falscher Ton hat keine
    // Schreibweise aus der Aufgabe und heisst, wie man ihn meist liest.
    sung = verdict.rightNote
      ? describeSung(toGermanPitch({ ...target, octave: target.octave + verdict.octaveShift }), verdict.cents)
      : nameFromMidi(Math.round(verdict.note));
  }

  return [
    {
      id: `${task.id}_gesungen`,
      label: task.prompt ?? 'Gesungen',
      earned: verdict.correct ? task.points : 0,
      possible: task.points,
      studentResponse: sung,
      correctResponse: toGermanPitch(target),
      correct: verdict.correct,
      interactionType: 'performance',
    },
  ];
}

// ---------------------------------------------------------------------------
// Klaviatur
// ---------------------------------------------------------------------------

/** Die gewählten Tasten (MIDI). */
export interface KeyboardAnswer {
  keys: number[];
}

/**
 * Das Intervall von `from` zur Taste `key`, so benannt, wie die Aufgabe zählt:
 * «kleine Terz aufwärts» (Halbtöne) bzw. «Terz aufwärts» (weisse Tasten).
 *
 * Bewusst kein Tonname: die vorgegebene Taste hat keine Schreibweise, und
 * ein Name aus der Tonhöhe allein wäre oft falsch geschrieben (über h liegt
 * die grosse Terz dis, nicht es).
 */
export function keyInterval(
  from: number,
  key: number,
  by: 'semitones' | 'steps',
  { withDirection = true }: { withDirection?: boolean } = {},
): string {
  let name: string | null;
  if (by === 'semitones') {
    const answer = SEMITONE_ANSWERS[Math.abs(key - from)];
    name = answer ? (INTERVAL_OPTIONS.find((option) => option.value === answer)?.label ?? answer) : null;
  } else {
    const a = whiteIndex(from);
    const b = whiteIndex(key);
    // Eine schwarze Taste hat keine Grösse; anwählen lässt sie sich dort nicht.
    if (a === null || b === null) return 'eine schwarze Taste';
    name = INTERVAL_SIZE_OPTIONS[Math.abs(b - a)]?.label ?? null;
  }
  const text = name ?? 'mehr als eine Oktave';
  if (!withDirection || key === from) return text;
  return `${text} ${key > from ? 'aufwärts' : 'abwärts'}`;
}

/** Dieselben Tasten, gleich in welcher Reihenfolge angetippt. */
function sameKeys(a: readonly number[], b: readonly number[]): boolean {
  const sorted = (keys: readonly number[]) => [...new Set(keys)].sort((x, y) => x - y).join(' ');
  return a.length === b.length && sorted(a) === sorted(b);
}

/**
 * Eine Tonleiter auf der Klaviatur: genau die Tasten aus `accept`, die
 * freigestellten (`optional`, die Oktave) dürfen fehlen.
 */
export function scaleKeysCorrect(task: KeyboardTask, keys: readonly number[]): boolean {
  const required = task.accept.filter((key) => !(task.optional ?? []).includes(key));
  const extra = keys.filter((key) => !required.includes(key));
  return sameKeys(keys.filter((key) => required.includes(key)), required) && extra.every((key) => task.accept.includes(key));
}

function scoreKeyboard(task: KeyboardTask, answer: KeyboardAnswer | undefined): Detail[] {
  const keys = answer?.keys ?? [];
  if (task.chord) {
    const correct = judgeChordKeys(task.chord, keys).correct;
    return [
      {
        id: `${task.id}_akkord`,
        label: task.prompt ?? 'Akkord',
        earned: correct ? task.points : 0,
        possible: task.points,
        studentResponse: describeKeys(keys),
        correctResponse: describeChordRule(task.chord),
        correct,
        interactionType: 'performance',
      },
    ];
  }
  if (task.scale) {
    const correct = scaleKeysCorrect(task, keys);
    return [
      {
        id: `${task.id}_tonleiter`,
        label: task.prompt ?? 'Tonleiter',
        earned: correct ? task.points : 0,
        possible: task.points,
        studentResponse: describeKeys(keys),
        correctResponse: describeKeys(task.accept),
        correct,
        interactionType: 'performance',
      },
    ];
  }
  const correct = keys.length === 1 && task.accept.includes(keys[0]);
  if (task.describe.by === 'name') {
    // Verlangt war ein Ton; welche Oktave, ist gleich.
    return [
      {
        id: `${task.id}_taste`,
        label: task.prompt ?? 'Taste',
        earned: correct ? task.points : 0,
        possible: task.points,
        studentResponse: keys.length ? keys.map((key) => keyNames(key).join('/')).join(', ') : '—',
        correctResponse: task.prompt ?? keyNames(task.accept[0]).join('/'),
        correct,
        interactionType: 'choice',
      },
    ];
  }
  if (task.describe.by === 'chord' || task.describe.by === 'scale') {
    throw new Error(`${task.id}: Beschreibung «${task.describe.by}» ohne Akkord bzw. Tonleiter`);
  }
  const { from, by } = task.describe;
  // Sind beide Richtungen richtig, nennt die Lösung nur das Intervall.
  const both = task.accept.some((key) => key > from) && task.accept.some((key) => key < from);
  return [
    {
      id: `${task.id}_taste`,
      label: task.prompt ?? 'Taste',
      earned: correct ? task.points : 0,
      possible: task.points,
      studentResponse: keys.length ? keys.map((key) => keyInterval(from, key, by)).join(', ') : '—',
      correctResponse: both
        ? keyInterval(from, task.accept[0], by, { withDirection: false })
        : task.accept.map((key) => keyInterval(from, key, by)).join(' oder '),
      correct,
      interactionType: 'choice',
    },
  ];
}

// ---------------------------------------------------------------------------
// Gesamtauswertung
// ---------------------------------------------------------------------------

export { judgeChordKeys, judgeChordNotes } from './chord';

export function scoreTask(
  task: Task,
  answer: unknown,
  context: { exerciseTitle?: string; number?: number } = {},
): TaskResult {
  let details: Detail[] = [];

  if (task.kind === 'select') {
    details = scoreSelectFields(task.id, task.fields, answer as SelectAnswer | undefined);
  } else if (task.kind === 'notation') {
    const value = (answer as NotationAnswer | undefined) ?? {};
    details = scoreNotation(task, value);
    if (task.fields?.length) {
      details = details.concat(scoreSelectFields(task.id, task.fields, value.f));
    }
  } else if (task.kind === 'sing') {
    details = scoreSing(task, answer as SingAnswer | undefined);
  } else if (task.kind === 'keyboard') {
    details = scoreKeyboard(task, answer as KeyboardAnswer | undefined);
  } else {
    details = scoreTextTable(task, answer as TextTableAnswer | undefined);
  }

  return {
    taskId: task.id,
    exerciseTitle: context.exerciseTitle ?? '',
    number: context.number ?? 1,
    earned: details.reduce((s, d) => s + d.earned, 0),
    possible: details.reduce((s, d) => s + d.possible, 0),
    details,
  };
}

/**
 * Die Töne der eigenen Antwort, samt den vorgegebenen: der Startton und der
 * gesetzte oder gespielte zweite Ton eines Intervalls, der gesetzte oder
 * gespielte Akkord. Nach einer richtigen Antwort klingt genau das — in der
 * Oktave und Lage, in der sie geschrieben oder gespielt wurde (Entscheid
 * 2026-11-24). Null, wo die Aufgabe keine Töne setzen oder spielen lässt.
 */
export function answeredTones(task: Task, answer: unknown): Pitch[] | null {
  if (task.kind === 'keyboard') {
    const keys = (answer as KeyboardAnswer | undefined)?.keys ?? [];
    if (keys.length === 0) return null;
    const given = task.chord ? [] : (task.keyboard.marked ?? []);
    return [...given, ...keys].map(pitchFromMidi);
  }
  if (task.kind !== 'notation') return null;
  const given = (answer as NotationAnswer | undefined)?.n;
  const sounding = (notes: InputNote[]) => notes.filter((note) => !note.r).map(toPitch);
  let tones: Pitch[];
  if (task.solution.type === 'chord') {
    const value = (given as ChordAnswer | undefined) ?? {};
    tones = sounding([...(value.u ?? []), ...(value.l ?? [])]);
  } else if (task.solution.type === 'pitch') {
    const fixed = task.score.measures
      .flatMap((measure) => [...measure.notes, ...(measure.bass ?? [])])
      .filter((note) => !note.placeholder && !note.rest)
      .flatMap((note) => note.keys ?? [])
      .map(parsePitch);
    tones = [...fixed, ...sounding(Object.values((given as PitchAnswer | undefined) ?? {}).flat())];
  } else {
    return null;
  }
  return tones.length > 0 ? tones : null;
}
