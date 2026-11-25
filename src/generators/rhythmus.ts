/**
 * Rhythmus — Zeichen kennen und Takte füllen.
 *
 *  - `rhythmus-notenwerte`: Notenzeichen und Name einander zuordnen, in beide
 *    Richtungen.
 *  - `rhythmus-pausen`: in jedem Takt fehlt genau eine Pause, ihr Wert ist
 *    einzutragen.
 */

import { DURATION_LABELS, durationInQuarters, measureCapacity, type Duration } from '../music/theory';
import type { NotationTask, NoteSpec, SelectOption } from '../content/schema';
import { barRhythm, usableDurations } from './melody';
import type { Rng } from './rng';
import {
  DURATION_OPTIONS,
  durationValue,
  glyph,
  insist,
  measure,
  optionsFrom,
  parseDurationValue,
  taskId,
} from './shared';
import { multi, range, single, type FilterValues, type Generator, type Question } from './types';

// ---------------------------------------------------------------------------
// Notenwerte und Pausenzeichen zuordnen
// ---------------------------------------------------------------------------

/** Wie viele Zeichen stehen bei «Name → Zeichen» zur Auswahl? */
const LEGEND_SIZE = 4;

const KIND_OPTIONS: SelectOption[] = [
  { value: 'note', label: 'Notenwerte' },
  { value: 'rest', label: 'Pausenzeichen' },
];

interface ValueFilters extends FilterValues {
  durations: string[];
  kinds: string[];
  direction: string;
}

export const rhythmusNotenwerte: Generator<ValueFilters> = {
  id: 'notenwerte-zuordnen',
  topic: 'rhythmus',
  skill: 'erkennen',
  version: 1,
  title: 'Notenwerte und Pausenzeichen zuordnen',
  instruction: 'Ordne dem Zeichen den richtigen Namen zu.',

  filters: [
    { kind: 'multi', key: 'durations', label: 'Mögliche Werte', options: DURATION_OPTIONS, min: 2 },
    { kind: 'multi', key: 'kinds', label: 'Was wird gefragt?', options: KIND_OPTIONS },
    {
      kind: 'single',
      key: 'direction',
      label: 'Richtung',
      options: [
        { value: 'zeichen-name', label: 'Zeichen → Name' },
        { value: 'name-zeichen', label: 'Name → Zeichen' },
      ],
      hint: '«Name → Zeichen» ist die schwerere Richtung: du musst das Zeichen aktiv erkennen.',
    },
  ],

  defaults: {
    durations: ['w', 'h', 'q', '8'],
    kinds: ['note', 'rest'],
    direction: 'zeichen-name',
  },

  generate(values, rng: Rng): Question {
    const durations = multi(values, 'durations', this.defaults.durations);
    const kinds = multi(values, 'kinds', this.defaults.kinds);
    const direction = single(values, 'direction', 'zeichen-name');

    const isRest = rng.pick(kinds) === 'rest';
    const wanted = rng.pick(durations);
    const { duration, dotted } = parseDurationValue(wanted);
    const id = taskId('rn', rng);

    // Punktierte Werte gibt es als Zeichen nur bei der Viertel — die anderen
    // stehen in DURATION_OPTIONS gar nicht, deshalb genügt hier die
    // Unterscheidung dotted/nicht.
    insist(
      !dotted || duration === 'q',
      `Für ${wanted} gibt es kein einzelnes Zeichen in der Legende.`,
    );

    if (direction === 'zeichen-name') {
      return {
        task: {
          id,
          kind: 'select',
          layout: 'side',
          score: glyph(duration, isRest),
          fields: [
            {
              id: 'a',
              options: optionsFrom('noteValue', durations),
              correct: wanted,
              points: 1,
              buttons: true,
            },
          ],
        },
        instruction: isRest
          ? 'Welchen Wert hat dieses Pausenzeichen?'
          : 'Welchen Wert hat dieses Notenzeichen?',
      };
    }

    // «Name → Zeichen»: vier Zeichen als Legende, die Antwort ist ein
    // Buchstabe.
    const others = durations
      .filter((value) => value !== wanted)
      .map(parseDurationValue)
      .filter((value) => !value.dotted || value.duration === 'q');
    const distractors = rng.sample(others, LEGEND_SIZE - 1);
    insist(
      distractors.length === LEGEND_SIZE - 1,
      `Für «Name → Zeichen» braucht es mindestens ${LEGEND_SIZE} Werte zur Auswahl.`,
    );

    const letters = ['A', 'B', 'C', 'D'];
    const entries = rng.sample([{ duration, dotted }, ...distractors], LEGEND_SIZE);
    const correctIndex = entries.findIndex((e) => e.duration === duration && e.dotted === dotted);

    return {
      task: {
        id,
        kind: 'select',
        prompt: label(duration, dotted, isRest),
        fields: [
          {
            id: 'a',
            options: letters.map((letter) => ({ value: letter, label: letter })),
            correct: letters[correctIndex],
            points: 1,
            buttons: true,
          },
        ],
      },
      legend: entries.map((entry, index) => ({
        label: letters[index],
        score: glyph(entry.duration, isRest),
      })),
      instruction: isRest
        ? 'Welches Pausenzeichen gehört zu diesem Namen?'
        : 'Welches Notenzeichen gehört zu diesem Namen?',
    };
  },
};

function label(duration: Duration, dotted: boolean, rest: boolean): string {
  const base = DURATION_LABELS[duration][rest ? 'rest' : 'note'];
  return dotted ? `punktierte ${base.replace(/^(\w)/, (m) => m.toLowerCase())}` : base;
}

// ---------------------------------------------------------------------------
// Fehlende Pausen ergänzen
// ---------------------------------------------------------------------------

/** So oft wird ein Takt neu gewürfelt, bis er eine passende Lücke hergibt. */
const BAR_ATTEMPTS = 40;

const TIME_OPTIONS: SelectOption[] = [
  { value: '4/4', label: '4/4' },
  { value: '3/4', label: '3/4' },
  { value: '2/4', label: '2/4' },
];

interface RestFilters extends FilterValues {
  timeSignature: string;
  bars: number;
  durations: string[];
  gaps: string[];
}

export const rhythmusPausen: Generator<RestFilters> = {
  id: 'pausen-ergaenzen',
  topic: 'rhythmus',
  skill: 'notieren',
  version: 1,
  title: 'Fehlende Pausen ergänzen',
  instruction: 'In jedem Takt fehlt genau eine Pause. Trage den passenden Pausenwert ein.',
  hint: 'Wähle den Wert in der Werkzeugleiste und tippe dann auf die mit «x» markierte Stelle.',

  filters: [
    { kind: 'single', key: 'timeSignature', label: 'Taktart', options: TIME_OPTIONS },
    { kind: 'range', key: 'bars', label: 'Länge', min: 1, max: 4, unit: 'Takte' },
    {
      kind: 'multi',
      key: 'durations',
      label: 'Mögliche Notenwerte',
      options: DURATION_OPTIONS,
      min: 2,
    },
    {
      kind: 'multi',
      key: 'gaps',
      label: 'Mögliche Pausenwerte',
      options: DURATION_OPTIONS,
      hint: 'Muss eine Teilmenge der möglichen Notenwerte sein, sonst wird die Lücke aus den übrigen gewählt.',
    },
  ],

  defaults: {
    timeSignature: '4/4',
    bars: 4,
    durations: ['h', 'q', 'q.', '8'],
    gaps: ['h', 'q', 'q.', '8'],
  },

  generate(values, rng: Rng): Question {
    const timeSignature = single(values, 'timeSignature', '4/4');
    const bars = Math.round(range(values, 'bars', 4));
    const durationValues = multi(values, 'durations', this.defaults.durations);
    const gapValues = multi(values, 'gaps', this.defaults.gaps);

    const capacity = measureCapacity(timeSignature);
    const choices = usableDurations(capacity, durationValues.map(parseDurationValue));
    insist(
      choices.length > 0,
      `Mit «${durationValues.join(', ')}» lässt sich kein ${timeSignature}-Takt genau füllen.`,
    );

    const wantedGaps = new Set(gapValues);
    const measures: NoteSpec[] [] = [];
    const slots: { measure: number; duration: Duration; dotted?: boolean }[] = [];

    for (let bar = 0; bar < bars; bar++) {
      const built = buildBarWithGap(rng, capacity, choices, wantedGaps);
      measures.push(built.notes);
      slots.push({ measure: bar, ...built.gap });
    }

    const task: NotationTask = {
      id: taskId('rp', rng),
      kind: 'notation',
      mode: 'rest',
      points: bars,
      score: {
        clef: 'treble',
        timeSignature,
        endBar: true,
        measures: measures.map(measure),
      },
      solution: { type: 'slot', slots },
    };

    // Nachrechnen: jeder Takt muss mit der eingesetzten Lösung exakt aufgehen.
    // Genau das ist die Aufgabe — geht sie nicht auf, ist sie unlösbar.
    measures.forEach((notes, bar) => {
      const slot = slots[bar];
      const sum = notes.reduce((total, note) => {
        if (note.placeholder) return total + durationInQuarters(slot.duration, slot.dotted);
        return total + durationInQuarters(note.duration, note.dotted);
      }, 0);
      insist(
        Math.abs(sum - capacity) < 1e-9,
        `Takt ${bar + 1} ergibt mit der Lösung ${sum} statt ${capacity} Viertel`,
      );
    });

    return { task };
  },
};

/**
 * Ein Takt, aus dem genau ein Wert entfernt wurde. Die Lücke muss einer der
 * gesuchten Pausenwerte sein — sonst wird der Takt neu gewürfelt, weil ein
 * anderer Wert den Filter unterlaufen würde.
 */
function buildBarWithGap(
  rng: Rng,
  capacity: number,
  choices: { duration: Duration; dotted: boolean }[],
  wantedGaps: Set<string>,
): { notes: NoteSpec[]; gap: { duration: Duration; dotted?: boolean } } {
  for (let attempt = 0; attempt < BAR_ATTEMPTS; attempt++) {
    const rhythm = barRhythm(rng, capacity, choices);
    const candidates = rhythm
      .map((value, index) => ({ value, index }))
      .filter(({ value }) => wantedGaps.has(durationValue(value.duration, value.dotted)));
    if (candidates.length === 0) continue;

    const chosen = rng.pick(candidates);
    const notes = rhythm.map((value, index): NoteSpec =>
      index === chosen.index
        ? // Die Lücke zeigt nur ein «x». Eine sichtbare Platzhalter-Pause
          // würde den gesuchten Wert verraten; die Dauer dient allein dem
          // Abstand im Notensatz.
          { annotation: 'x', duration: 'q', placeholder: true }
        : { keys: ['h4'], duration: value.duration, dotted: value.dotted || undefined },
    );

    return {
      notes,
      gap: { duration: chosen.value.duration, dotted: chosen.value.dotted || undefined },
    };
  }

  throw new Error(
    'Kein Takt gefunden, in dem einer der gesuchten Pausenwerte vorkommt. ' +
      'Erlaube mehr Notenwerte oder mehr Pausenwerte.',
  );
}
