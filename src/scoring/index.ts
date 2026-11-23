/* Herkunft: musiktheorie-scorm/src/scoring/index.ts (Stand 2026-08-21), über das Projekt «training».
   Wird hier eigenständig weitergeführt; es gibt keinen Abgleich mit dem Original mehr. */
/**
 * Bewertung.
 *
 * Bewusst getrennt von der Oberfläche: die Auswertung muss ohne DOM testbar
 * sein, weil Fehler hier still passieren und Falsches als richtig durchgehen
 * lassen.
 */

import { resolveOptions } from '../content/options';
import type { NotationTask, PitchSlotSolution, SelectField, SingTask, Task, TextTableTask } from '../content/schema';
import { judgeSung } from '../sing/judge';
import { nameFromMidi } from '../sing/notes';
import {
  DURATION_LABELS,
  germanNoteName,
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

function scoreSelectFields(
  taskId: string,
  fields: SelectField[],
  answer: SelectAnswer | undefined,
): Detail[] {
  return fields.map((field) => {
    const given = answer?.[field.id] ?? '';
    const correct = given === field.correct;
    return {
      id: `${taskId}_${field.id}`,
      label: field.label ?? 'Antwort',
      earned: correct ? field.points : 0,
      possible: field.points,
      studentResponse: labelFor(field, given),
      correctResponse: labelFor(field, field.correct),
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
      const perSlot = task.points / solution.slots.length;
      return solution.slots.map((slot) => {
        const notes = placed[String(slot.slot)] ?? [];
        const accepted = slot.accept.map(parsePitch);
        const correct = pitchSlotCorrect(slot, notes);

        return {
          id: `${id}_s${slot.slot}`,
          label: task.prompt ?? 'Noteneingabe',
          earned: correct ? perSlot : 0,
          possible: perSlot,
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
      // Reihenfolge UND Vorzeichenart müssen stimmen; die Oktavlage prüfen wir
      // nicht, weil beide üblichen Notationshöhen zulässig sind.
      const correct =
        !!value &&
        (solution.accidentals === 0 || value.sign === sign) &&
        value.placed.length === steps.length &&
        value.placed.every((p, i) => p.s === steps[i]);

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
}

/** «e1», «e1, 20 Cent zu tief». Kleine Abweichungen sind keine Rede wert. */
function describeSung(name: string, cents: number | null): string {
  if (cents === null || Math.abs(cents) < 10) return name;
  return `${name}, ${Math.abs(cents)} Cent zu ${cents < 0 ? 'tief' : 'hoch'}`;
}

function scoreSing(task: SingTask, answer: SingAnswer | undefined): Detail[] {
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
// Gesamtauswertung
// ---------------------------------------------------------------------------

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
