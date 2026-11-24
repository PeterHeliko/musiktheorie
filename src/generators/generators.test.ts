/**
 * Prüft die Generatoren gegen den Theoriekern.
 *
 * Anders als bei einem festen Aufgabensatz kann hier niemand die Lösungen
 * einmal durchsehen: sie entstehen bei jedem Aufruf neu. Eine Übungsseite,
 * die falsche Lösungen behauptet, ist schlimmer als gar keine — man übt sich
 * den Fehler ein und merkt es erst, wenn es zählt.
 *
 * Vier Fragen an jeden Generator:
 *
 *  1. Stimmt die behauptete Lösung? (rechnet der Generator selbst nach, per
 *     `insist()` — hier zählt, dass er dabei nicht wirft)
 *  2. Bewertet `scoreTask()` die Musterlösung als vollständig richtig, und
 *     eine falsche Antwort als falsch?
 *  3. Wirken die Filter? Jeder eingeschaltete Wert muss vorkommen, jeder
 *     ausgeschaltete nie.
 *  4. Gehen die Takte auf, und bleiben Melodien im gewählten Rahmen?
 */

import { describe, expect, it } from 'vitest';
import { GENERATORS, generatorById, topicsWithGenerators } from './index';
import { makeRng } from './rng';
import { TOPIC_GROUPS, type FilterValues, type Question } from './types';
import type { KeyboardTask, NotationTask, SelectTask, SingTask, Task } from '../content/schema';
import {
  INTERVAL_OPTIONS,
  INTERVAL_SIZE_OPTIONS,
  intervalAnswer,
  intervalSizeAnswer,
  resolveOptions,
} from '../content/options';
import { INTERVAL_KEYBOARD, isWhiteKey, keysBetween } from '../music/piano';
import { pitchFromMidi } from '../sing/notes';
import { VOICE_RANGES, type Voice } from '../sing/voice';
import { fromPitch, keyInterval, scoreTask, type InputNote } from '../scoring';
import { LEDGER_ROOM, windowFor } from './shared';
import {
  durationInQuarters,
  intervalBetween,
  intervalFullName,
  intervalLabel,
  keySignatureSteps,
  measureCapacity,
  midi,
  parsePitch,
  type Duration,
} from '../music/theory';

/** So viele Aufgaben je Durchgang — genug, dass seltene Fälle vorkommen. */
const RUNS = 200;

/** Erzeugt `count` Aufgaben mit den gegebenen Filtern. */
function generate(id: string, filters: FilterValues = {}, count = RUNS): Question[] {
  const generator = generatorById(id);
  if (!generator) throw new Error(`Unbekannter Generator: ${id}`);
  const merged = { ...generator.defaults, ...filters };
  return Array.from({ length: count }, (_, i) => generator.generate(merged, makeRng(i * 2654435761)));
}

// ---------------------------------------------------------------------------
// Musterlösung bauen
// ---------------------------------------------------------------------------

/**
 * Die Antwort, die jemand ohne Fehler gäbe. Absichtlich aus der
 * Aufgabe abgeleitet und nicht vom Generator mitgeliefert: so prüft der Test
 * den Weg, den auch die Oberfläche geht.
 */
function correctAnswerFor(task: Task): unknown {
  if (task.kind === 'select') {
    return Object.fromEntries(task.fields.map((field) => [field.id, field.correct]));
  }
  if (task.kind === 'sing') {
    // Erst den Ausgangston nachsingen (erlaubt), dann genau den Zielton.
    return { notes: [midi(parsePitch(task.reference)), midi(parsePitch(task.target))] };
  }
  if (task.kind === 'keyboard') return { keys: task.chord ? task.accept : [task.accept[0]] };
  if (task.kind !== 'notation') return {};

  const fields = Object.fromEntries((task.fields ?? []).map((f) => [f.id, f.correct]));
  return { n: notationAnswerFor(task), ...(task.fields?.length ? { f: fields } : {}) };
}

function notationAnswerFor(task: NotationTask): unknown {
  const solution = task.solution;
  switch (solution.type) {
    case 'pitch':
      return Object.fromEntries(
        solution.slots.map((slot) => [
          String(slot.slot),
          slot.chord
            ? slot.accept.map((key) => fromPitch(parsePitch(key), 'w'))
            : [fromPitch(parsePitch(slot.accept[0]), 'w')],
        ]),
      );
    case 'slot':
      return Object.fromEntries(
        solution.slots.map((slot) => [
          String(slot.measure),
          { d: slot.duration, ...(slot.dotted ? { dot: true } : {}) },
        ]),
      );
    case 'keysig': {
      const { steps, sign } = keySignatureSteps(solution.accidentals);
      return { sign, placed: steps.map((s) => ({ s, o: 4 })) };
    }
    case 'mark':
      return solution.gaps;
    case 'melody':
      return solution.measures.map((bar) =>
        bar.map((note) => fromPitch(parsePitch(note.keys![0]), note.duration, note.dotted)),
      );
  }
}

/** Eine garantiert falsche Antwort — für die Gegenprobe. */
function wrongAnswerFor(task: Task): unknown {
  if (task.kind === 'select') {
    return Object.fromEntries(task.fields.map((field) => [field.id, `${field.correct}-falsch`]));
  }
  if (task.kind === 'sing') {
    // Einen Halbton neben dem Ziel; ist das der Ausgangston (kleine Sekunde
    // abwärts), zwei — der Ausgangston wäre gar keine Antwort.
    const target = midi(parsePitch(task.target));
    const reference = midi(parsePitch(task.reference));
    const wrong = (target + 1 - reference) % 12 === 0 ? target + 2 : target + 1;
    return { notes: [wrong] };
  }
  if (task.kind === 'keyboard') {
    // Eine Taste, die sich antippen liesse, aber nicht richtig ist.
    const wrong = keysBetween(task.keyboard.low, task.keyboard.high).find(
      (key) => !task.accept.includes(key) && (!task.whiteOnly || isWhiteKey(key)),
    );
    return { keys: [wrong] };
  }
  if (task.kind !== 'notation') return {};
  const solution = (task as NotationTask).solution;
  if (solution.type === 'mark') {
    // Eine Lücke, die garantiert nicht dabei ist.
    return { n: [99] };
  }
  return { n: undefined };
}

// ---------------------------------------------------------------------------
// Allgemeines
// ---------------------------------------------------------------------------

describe('Verzeichnis', () => {
  it('vergibt eindeutige Kennungen', () => {
    const ids = GENERATORS.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('ordnet jede Übung eines gegliederten Themas einer seiner Gruppen zu', () => {
    for (const generator of GENERATORS) {
      const groups = TOPIC_GROUPS[generator.topic];
      if (groups) {
        expect(
          groups.map((group) => group.id),
          `${generator.id}: Gruppe «${generator.group}» gibt es im Thema nicht`,
        ).toContain(generator.group);
      } else {
        expect(generator.group, `${generator.id}: Thema ohne Gruppen`).toBeUndefined();
      }
    }
  });

  it('nennt für jeden Filter einen Vorgabewert', () => {
    for (const generator of GENERATORS) {
      for (const filter of generator.filters) {
        expect(
          generator.defaults[filter.key],
          `${generator.id}: Filter «${filter.key}» ohne Vorgabe`,
        ).toBeDefined();
      }
    }
  });

  it('kommt mit leeren Filterwerten zurecht', () => {
    // Der gespeicherte Zustand kann veraltet sein — dann muss die Vorgabe
    // greifen, statt dass die Seite mit einer Ausnahme stehen bleibt.
    for (const generator of GENERATORS) {
      const run = () => generator.generate({} as never, makeRng(1));
      expect(run, generator.id).not.toThrow();
    }
  });
});

describe.each(GENERATORS.map((g) => g.id))('%s', (id) => {
  const questions = generate(id);

  it('erzeugt Aufgaben ohne Ausnahme', () => {
    expect(questions).toHaveLength(RUNS);
  });

  it('bewertet die Musterlösung als vollständig richtig', () => {
    for (const question of questions) {
      const result = scoreTask(question.task, correctAnswerFor(question.task));
      expect(result.possible, `${id}: Aufgabe ohne Punkte`).toBeGreaterThan(0);
      expect(
        result.earned,
        `${id}: Musterlösung gibt ${result.earned} von ${result.possible} Punkten — ` +
          result.details.map((d) => `${d.label}: «${d.studentResponse}» statt «${d.correctResponse}»`).join('; '),
      ).toBeCloseTo(result.possible, 6);
    }
  });

  it('bewertet eine falsche Antwort als falsch', () => {
    for (const question of questions) {
      const result = scoreTask(question.task, wrongAnswerFor(question.task));
      expect(result.earned, `${id}: falsche Antwort bekommt Punkte`).toBe(0);
    }
  });

  it('vergibt eindeutige Aufgabenkennungen je Frage', () => {
    // Die Kennung ist der Schlüssel im Antwortspeicher. Zwei Aufgaben mit
    // derselben Kennung würden einander die Antwort überschreiben.
    for (const question of questions) {
      expect(question.task.id).toMatch(/^[a-z]+-[0-9a-z]+$/);
    }
  });

  it('nennt zu jedem Hörbeispiel eine Wiedergabe', () => {
    for (const question of questions) {
      if (!question.audio) continue;
      expect(question.audio.id).toBe(question.task.id);
      if (question.audio.kind === 'melody') expect(question.melody?.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Filter wirken wirklich
// ---------------------------------------------------------------------------

/** Sammelt die Antwortwerte eines Auswahlfelds über viele Aufgaben. */
function answersFor(questions: Question[], fieldId: string): Set<string> {
  const seen = new Set<string>();
  for (const question of questions) {
    const task = question.task as SelectTask;
    const field = task.fields?.find((f) => f.id === fieldId);
    if (field) seen.add(field.correct);
  }
  return seen;
}

describe('Filter', () => {
  it('beschränkt die Gehör-Intervalle auf die angekreuzten', () => {
    const wanted = ['k3', 'g3'];
    const seen = answersFor(generate('intervalle-hoeren', { intervals: wanted }), 'a');
    expect([...seen].sort()).toEqual([...wanted].sort());
  });

  it('lässt jedes angekreuzte Gehör-Intervall auch vorkommen', () => {
    const wanted = ['k2', 'r5', 'tritonus', 'r8'];
    const seen = answersFor(generate('intervalle-hoeren', { intervals: wanted }), 'a');
    expect([...seen].sort()).toEqual([...wanted].sort());
  });

  it('beschränkt die Tonleiterarten', () => {
    const seen = answersFor(
      generate('tonleitern-hoeren', { scaleTypes: ['dur', 'moll-harmonisch'] }),
      'a',
    );
    expect([...seen].sort()).toEqual(['dur', 'moll-harmonisch']);
  });

  it('beschränkt die notierten Intervalle', () => {
    const wanted = ['k6', 'g7'];
    const seen = answersFor(generate('intervalle-bestimmen', { intervals: wanted }), 'a');
    expect([...seen].sort()).toEqual([...wanted].sort());
  });

  it('hält Aufgaben mit «nur Stammtöne» ohne Vorzeichen', () => {
    const questions = generate('intervalle-bestimmen', { accidentals: 'stammton' });
    for (const question of questions) {
      const keys = (question.task as SelectTask).score!.measures[0].notes[0].keys!;
      for (const key of keys) {
        expect(parsePitch(key).alter, `${key} trägt ein Vorzeichen`).toBe(0);
      }
    }
  });

  it('hält Aufgaben im Bassschlüssel im Bassbereich', () => {
    const questions = generate('intervalle-bestimmen', { clefs: ['bass'], width: 'eng' });
    for (const question of questions) {
      const score = (question.task as SelectTask).score!;
      expect(score.clef).toBe('bass');
      for (const key of score.measures[0].notes[0].keys!) {
        expect(midi(parsePitch(key))).toBeLessThanOrEqual(62);
        expect(midi(parsePitch(key))).toBeGreaterThanOrEqual(43);
      }
    }
  });

  it('akzeptiert bei fester Richtung nur diese eine Lösung', () => {
    for (const direction of ['up', 'down'] as const) {
      const questions = generate('intervalle-notieren', { direction, intervals: ['g3', 'r5'] });
      for (const question of questions) {
        const task = question.task as NotationTask;
        const solution = task.solution;
        expect(solution.type).toBe('pitch');
        if (solution.type !== 'pitch') continue;
        expect(solution.slots[0].accept).toHaveLength(1);

        const start = parsePitch(task.score.measures[0].notes[0].keys![0]);
        const target = parsePitch(solution.slots[0].accept[0]);
        if (direction === 'up') expect(midi(target)).toBeGreaterThan(midi(start));
        else expect(midi(target)).toBeLessThan(midi(start));
      }
    }
  });

  it('verlangt beim Intervall-Notieren nie ein Doppelvorzeichen', () => {
    // Die Werkzeugleiste kennt nur b, Kreuz und ohne. Bei freier Richtung
    // darf auch die nicht gewertete Richtung keins brauchen: sonst sucht man
    // dort vergeblich, statt umzudrehen.
    for (const direction of ['frei', 'up', 'down']) {
      for (const accidentals of ['stammton', 'einfach', 'alle']) {
        for (const width of ['eng', 'weit']) {
          for (const clef of ['treble', 'bass'] as const) {
            const questions = generate('intervalle-notieren', { direction, accidentals, width, clefs: [clef] });
            for (const question of questions) {
              const task = question.task as NotationTask;
              if (task.solution.type !== 'pitch') continue;
              const accept = task.solution.slots[0].accept;
              for (const key of accept) {
                expect(Math.abs(parsePitch(key).alter), `${key} als Lösung`).toBeLessThanOrEqual(1);
              }
              if (direction !== 'frei' || accept.length === 2) continue;

              // Die Gegenrichtung fehlt: dann nur, weil sie zu weit aus dem
              // System führt, nicht wegen eines Doppelvorzeichens.
              const startKey = task.score.measures[0].notes[0].keys![0];
              const start = midi(parsePitch(startKey));
              const other = 2 * start - midi(parsePitch(accept[0]));
              const window = windowFor(clef, width);
              expect(
                other < window.low - LEDGER_ROOM || other > window.high + LEDGER_ROOM,
                `${startKey}: Gegenrichtung zu ${accept[0]} fehlt`,
              ).toBe(true);
            }
          }
        }
      }
    }
  });

  it('beschränkt die Grobbestimmung auf die angekreuzten Grössen', () => {
    const wanted = ['terz', 'septime'];
    const seen = answersFor(generate('intervalle-grob-bestimmen', { intervals: wanted }), 'a');
    expect([...seen].sort()).toEqual([...wanted].sort());
  });

  it('stellt bei der Grobbestimmung nur Stammtöne mit der richtigen Grösse', () => {
    for (const clef of ['treble', 'bass']) {
      for (const width of ['eng', 'weit']) {
        for (const question of generate('intervalle-grob-bestimmen', { clefs: [clef], width })) {
          const task = question.task as SelectTask;
          const [low, high] = task.score!.measures[0].notes[0].keys!.map(parsePitch);
          expect(low.alter, 'Vorzeichen im Notenbild').toBe(0);
          expect(high.alter, 'Vorzeichen im Notenbild').toBe(0);
          expect(intervalSizeAnswer(intervalBetween(low, high).number)).toBe(task.fields[0].correct);
        }
      }
    }
  });

  it('notiert bei der Grobbestimmung ohne Vorzeichen, in jeder Lage', () => {
    for (const clef of ['treble', 'bass']) {
      for (const width of ['eng', 'weit']) {
        for (const question of generate('intervalle-grob-notieren', { clefs: [clef], width })) {
          const task = question.task as NotationTask;
          expect(task.noAccidentals, 'Werkzeugleiste ohne Vorzeichen').toBe(true);
          const solution = task.solution;
          if (solution.type !== 'pitch') throw new Error('keine Tonhöhenaufgabe');
          const start = parsePitch(task.score.measures[0].notes[0].keys![0]);
          expect(start.alter).toBe(0);
          for (const key of solution.slots[0].accept) {
            const target = parsePitch(key);
            expect(target.alter, `${key} trägt ein Vorzeichen`).toBe(0);
            expect(INTERVAL_SIZE_OPTIONS[intervalBetween(start, target).number - 1].label).toBe(task.prompt);
          }
        }
      }
    }
  });

  it('akzeptiert bei der Grobbestimmung mit fester Richtung nur diese eine Lösung', () => {
    for (const direction of ['up', 'down'] as const) {
      for (const question of generate('intervalle-grob-notieren', { direction, intervals: ['sekunde', 'sexte'] })) {
        const task = question.task as NotationTask;
        const solution = task.solution;
        if (solution.type !== 'pitch') throw new Error('keine Tonhöhenaufgabe');
        expect(solution.slots[0].accept).toHaveLength(1);
        const start = parsePitch(task.score.measures[0].notes[0].keys![0]);
        const target = parsePitch(solution.slots[0].accept[0]);
        if (direction === 'up') expect(midi(target)).toBeGreaterThan(midi(start));
        else expect(midi(target)).toBeLessThan(midi(start));
      }
    }
  });

  it('nimmt bei der Prime den Startton genau einmal als Lösung', () => {
    for (const question of generate('intervalle-grob-notieren', { intervals: ['prime'] })) {
      const task = question.task as NotationTask;
      const solution = task.solution;
      if (solution.type !== 'pitch') throw new Error('keine Tonhöhenaufgabe');
      expect(solution.slots[0].accept).toEqual(task.score.measures[0].notes[0].keys);
    }
  });

  it('begrenzt die Vorzeichen der Tonartaufgaben', () => {
    const questions = generate('vorzeichen-setzen', { maxAccidentals: 2 });
    for (const question of questions) {
      const solution = (question.task as NotationTask).solution;
      expect(solution.type).toBe('keysig');
      if (solution.type === 'keysig') expect(Math.abs(solution.accidentals)).toBeLessThanOrEqual(2);
    }
  });

  it('beschränkt die Stufenaufgabe auf die angekreuzten Stufen', () => {
    const questions = generate('stufen-bestimmen', { degrees: ['5'], keys: ['C-Dur'] });
    for (const question of questions) {
      const fields = (question.task as SelectTask).fields;
      // Die V. Stufe von C-Dur ist G-Dur.
      expect(fields.find((f) => f.id === 'root')!.correct).toBe('G');
      expect(fields.find((f) => f.id === 'gender')!.correct).toBe('dur');
    }
  });

  it('kennt auch die verminderte VII. Stufe', () => {
    const questions = generate('stufen-bestimmen', { degrees: ['7'], keys: ['C-Dur'] }, 20);
    for (const question of questions) {
      const fields = (question.task as SelectTask).fields;
      expect(fields.find((f) => f.id === 'root')!.correct).toBe('H');
      expect(fields.find((f) => f.id === 'gender')!.correct).toBe('vermindert');
    }
  });
});

// ---------------------------------------------------------------------------
// Rhythmus und Melodie gehen auf
// ---------------------------------------------------------------------------

describe('Prime', () => {
  const INTERVAL_EXERCISES = [
    'intervalle-grob-bestimmen',
    'intervalle-grob-notieren',
    'intervalle-grob-klaviatur-benennen',
    'intervalle-grob-klaviatur-spielen',
    'intervalle-bestimmen',
    'intervalle-notieren',
    'intervalle-klaviatur-benennen',
    'intervalle-klaviatur-spielen',
    'intervalle-hoeren',
    'intervalle-singen',
  ];
  const primeValue = (id: string) => (id.includes('grob') ? 'prime' : 'r1');
  /** Fragt die Aufgabe nach der Prime? Antwortwert oder, beim Notieren und Singen, der Auftrag. */
  const asksPrime = (task: Task) =>
    task.kind === 'select'
      ? task.fields.some((field) => field.correct === 'r1' || field.correct === 'prime')
      : /Prime/.test(task.prompt ?? '');

  it('ist in keiner Intervallübung vorgegeben', () => {
    for (const id of INTERVAL_EXERCISES) {
      expect(generatorById(id)!.defaults.intervals, id).not.toContain(primeValue(id));
      expect(generate(id).some((question) => asksPrime(question.task)), id).toBe(false);
    }
  });

  it('bleibt wählbar', () => {
    for (const id of INTERVAL_EXERCISES) {
      const questions = generate(id, { intervals: [primeValue(id)] }, 10);
      expect(questions.every((question) => asksPrime(question.task)), id).toBe(true);
    }
  });
});

describe('Intervalle auf der Klaviatur', () => {
  const marked = (question: Question) => {
    const task = question.task as SelectTask | KeyboardTask;
    return task.keyboard!.marked ?? [];
  };
  const keyboardTask = (question: Question) => question.task as KeyboardTask;
  /** Die Taste, von der aus die Rückmeldung das Intervall nennt. */
  const fromOf = (task: KeyboardTask) => (task.describe as { from: number }).from;
  const answerOf = (question: Question) => (question.task as SelectTask).fields[0].correct;
  const inRange = (key: number) => key >= INTERVAL_KEYBOARD.low && key <= INTERVAL_KEYBOARD.high;
  /** Halbtöne → Antwortwert, unabhängig vom Code gezählt: k2 = 1 … r8 = 12. */
  const BY_SEMITONES = ['r1', 'k2', 'g2', 'k3', 'g3', 'r4', 'tritonus', 'r5', 'k6', 'g6', 'k7', 'g7', 'r8'];

  it('zeigt die Klaviatur von c bis h¹', () => {
    for (const id of [
      'intervalle-grob-klaviatur-benennen',
      'intervalle-grob-klaviatur-spielen',
      'intervalle-klaviatur-benennen',
      'intervalle-klaviatur-spielen',
    ]) {
      for (const question of generate(id, {}, 20)) {
        const task = question.task as SelectTask | KeyboardTask;
        expect(task.keyboard, id).toMatchObject({ low: midi(parsePitch('c3')), high: midi(parsePitch('b4')) });
        for (const key of marked(question)) expect(inRange(key), `${id}: ${key}`).toBe(true);
      }
    }
  });

  it('markiert beim groben Benennen zwei weisse Tasten in der gefragten Grösse', () => {
    for (const question of generate('intervalle-grob-klaviatur-benennen')) {
      const [low, high] = marked(question);
      expect(isWhiteKey(low) && isWhiteKey(high)).toBe(true);
      // Als Stammtöne gelesen, nach dem Theoriekern gemessen.
      const number = intervalBetween(pitchFromMidi(low), pitchFromMidi(high)).number;
      expect(answerOf(question)).toBe(intervalSizeAnswer(number));
    }
  });

  it('spielt bei der Grobbestimmung nur auf weissen Tasten', () => {
    for (const question of generate('intervalle-grob-klaviatur-spielen')) {
      const task = keyboardTask(question);
      expect(task.whiteOnly).toBe(true);
      expect(task.sound).toBe(true);
      expect([...marked(question), ...task.accept].every(isWhiteKey)).toBe(true);
      const size = INTERVAL_SIZE_OPTIONS.findIndex((option) => option.label === task.prompt) + 1;
      for (const key of task.accept) {
        expect(intervalBetween(pitchFromMidi(marked(question)[0]), pitchFromMidi(key)).number).toBe(size);
      }
    }
  });

  it('markiert beim feinen Benennen zwei Tasten im gefragten Abstand', () => {
    for (const question of generate('intervalle-klaviatur-benennen')) {
      const [low, high] = marked(question);
      expect(BY_SEMITONES[high - low]).toBe(answerOf(question));
    }
  });

  it('nimmt mit «nur weisse» beim Benennen nur weisse Tasten', () => {
    const questions = generate('intervalle-klaviatur-benennen', { keyColours: 'weiss' });
    expect(questions.every((question) => marked(question).every(isWhiteKey))).toBe(true);
    // Ohne die Einschränkung kommen auch schwarze vor.
    const all = generate('intervalle-klaviatur-benennen');
    expect(all.some((question) => marked(question).some((key) => !isWhiteKey(key)))).toBe(true);
  });

  it('verlangt beim feinen Spielen den Abstand des genannten Intervalls', () => {
    for (const question of generate('intervalle-klaviatur-spielen')) {
      const task = keyboardTask(question);
      expect(task.sound).toBe(true);
      const value = INTERVAL_OPTIONS.find((option) => option.label === task.prompt)!.value;
      for (const key of task.accept) {
        expect(inRange(key)).toBe(true);
        expect(BY_SEMITONES[Math.abs(key - marked(question)[0])]).toBe(value);
      }
    }
  });

  it('beginnt mit «nur weisse» auf einer weissen Starttaste', () => {
    for (const question of generate('intervalle-klaviatur-spielen', { keyColours: 'weiss' })) {
      expect(isWhiteKey(marked(question)[0])).toBe(true);
    }
  });

  it('akzeptiert bei fester Richtung nur diese, bei freier beide, soweit die Klaviatur reicht', () => {
    for (const id of ['intervalle-grob-klaviatur-spielen', 'intervalle-klaviatur-spielen']) {
      for (const [direction, sign] of [['up', 1], ['down', -1]] as const) {
        for (const question of generate(id, { direction })) {
          const task = keyboardTask(question);
          expect(task.accept, id).toHaveLength(1);
          expect(Math.sign(task.accept[0] - fromOf(task)), `${id} ${direction}`).toBe(sign);
          expect(question.context, id).toBeDefined();
        }
      }
      const free = generate(id, { direction: 'frei' });
      expect(free.some((question) => keyboardTask(question).accept.length === 2), id).toBe(true);
      for (const question of free) expect(question.context, id).toBeUndefined();
    }
  });

  it('fragt nur die angekreuzten Intervalle, und jedes davon', () => {
    const fein = generate('intervalle-klaviatur-benennen', { intervals: ['k3', 'tritonus', 'r8'] });
    expect(answersFor(fein, 'a')).toEqual(new Set(['k3', 'tritonus', 'r8']));
    const grob = generate('intervalle-grob-klaviatur-benennen', { intervals: ['sekunde', 'oktave'] });
    expect(answersFor(grob, 'a')).toEqual(new Set(['sekunde', 'oktave']));
    const played = generate('intervalle-klaviatur-spielen', { intervals: ['g2', 'k6'] });
    expect(new Set(played.map((question) => question.task.prompt))).toEqual(
      new Set(['grosse Sekunde', 'kleine Sexte']),
    );
  });

  it('bleibt beim Benennen stumm und klingt beim Spielen', () => {
    for (const id of ['intervalle-grob-klaviatur-benennen', 'intervalle-klaviatur-benennen']) {
      expect(generate(id, {}, 5).every((question) => !question.audio), id).toBe(true);
    }
  });

  it('nennt in der Rückmeldung das gespielte Intervall', () => {
    const c1 = midi(parsePitch('c4'));
    expect(keyInterval(c1, c1 + 3, 'semitones')).toBe('kleine Terz aufwärts');
    expect(keyInterval(c1, c1 - 6, 'semitones')).toBe('Tritonus abwärts');
    expect(keyInterval(c1, c1, 'semitones')).toBe('reine Prime');
    expect(keyInterval(c1, c1 + 14, 'semitones')).toBe('mehr als eine Oktave aufwärts');
    expect(keyInterval(c1, midi(parsePitch('e4')), 'steps')).toBe('Terz aufwärts');
    expect(keyInterval(c1, midi(parsePitch('a3')), 'steps')).toBe('Terz abwärts');
    expect(keyInterval(c1, c1 + 1, 'steps')).toBe('eine schwarze Taste');
  });

  it('sagt bei falscher Taste, was gespielt wurde und was verlangt war', () => {
    const [question] = generate('intervalle-klaviatur-spielen', { intervals: ['k3'], direction: 'up' }, 1);
    const task = keyboardTask(question);
    const result = scoreTask(task, { keys: [fromOf(task) + 4] });
    expect(result.earned).toBe(0);
    expect(result.details[0].studentResponse).toBe('grosse Terz aufwärts');
    expect(result.details[0].correctResponse).toBe('kleine Terz aufwärts');
    // Sind beide Richtungen richtig, nennt die Lösung nur das Intervall.
    const free = generate('intervalle-klaviatur-spielen', { intervals: ['k3'] }).find(
      (entry) => keyboardTask(entry).accept.length === 2,
    )!;
    expect(scoreTask(free.task, { keys: [] }).details[0].correctResponse).toBe('kleine Terz');
  });

  it('wertet eine Taste nur, wenn genau eine gewählt ist', () => {
    const [question] = generate('intervalle-klaviatur-spielen', {}, 1);
    const task = keyboardTask(question);
    expect(scoreTask(task, { keys: [] }).earned).toBe(0);
    expect(scoreTask(task, { keys: [task.accept[0], task.accept[0] + 1] }).earned).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Töne
// ---------------------------------------------------------------------------

describe('Töne', () => {
  /**
   * Namen je Halbton über c, von Hand geschrieben statt aus dem Code: eine
   * schwarze Taste hat zwei, eine weisse einen.
   */
  const KEY_NAMES_BY_CLASS = [
    ['c'], ['cis', 'des'], ['d'], ['dis', 'es'], ['e'], ['f'],
    ['fis', 'ges'], ['g'], ['gis', 'as'], ['a'], ['ais', 'b'], ['h'],
  ];
  const keyNamesOf = (key: number) => KEY_NAMES_BY_CLASS[key % 12];
  const WHITE_NAMES = ['c', 'd', 'e', 'f', 'g', 'a', 'h'];

  /** Deutscher Name einer notierten Tonhöhe, eigens nachgebaut. */
  function spelled(key: string): string {
    const pitch = parsePitch(key);
    const base = pitch.step === 'b' ? 'h' : pitch.step;
    if (pitch.alter === 0) return base;
    if (pitch.alter === 1) return `${base}is`;
    expect(pitch.alter, key).toBe(-1);
    return ({ e: 'es', a: 'as', h: 'b' } as Record<string, string>)[base] ?? `${base}es`;
  }

  const field = (question: Question) => (question.task as SelectTask).fields[0];
  const accepted = (question: Question) => [field(question).correct, ...(field(question).alsoCorrect ?? [])];
  const optionValues = (question: Question) => resolveOptions(field(question)).map((option) => option.value);

  it('steht als erstes Thema da, mit den Übungen in dieser Reihenfolge', () => {
    const [first] = topicsWithGenerators();
    expect(first.id).toBe('toene');
    expect(first.title).toBe('Töne');
    expect(first.generators.map((generator) => generator.title)).toEqual([
      'Töne auf Klaviatur benennen',
      'Töne auf Klaviatur spielen',
      'Noten benennen',
      'Noten schreiben',
    ]);
  });

  it('nennt beim Benennen auf der Klaviatur jeden Namen der markierten Taste, und nur diese', () => {
    let black = 0;
    for (const question of generate('toene-klaviatur-benennen')) {
      const task = question.task as SelectTask;
      expect(task.keyboard).toMatchObject(INTERVAL_KEYBOARD);
      const [key] = task.keyboard!.marked!;
      expect(task.keyboard!.marked).toHaveLength(1);
      expect(accepted(question)).toEqual(keyNamesOf(key));
      if (!isWhiteKey(key)) black++;
      // Auf der Klaviatur gibt es kein ces, fes, eis oder his.
      expect(optionValues(question).some((value) => ['ces', 'fes', 'eis', 'his'].includes(value))).toBe(false);
      expect(field(question).buttonLayout).toBe('notes');
      expect(question.audio).toBeUndefined();
    }
    expect(black).toBeGreaterThan(0);
  });

  it('wertet bei einer schwarzen Taste beide Namen als richtig', () => {
    const question = generate('toene-klaviatur-benennen').find(
      (entry) => !isWhiteKey((entry.task as SelectTask).keyboard!.marked![0]),
    )!;
    const [sharp, flat] = accepted(question);
    for (const name of [sharp, flat]) {
      const result = scoreTask(question.task, { a: name });
      expect(result.earned, name).toBe(result.possible);
    }
    expect(scoreTask(question.task, {}).details[0].correctResponse).toBe(`${sharp} oder ${flat}`);
  });

  it('nimmt mit «nur weisse» nur weisse Tasten und bietet nur c bis h an', () => {
    for (const question of generate('toene-klaviatur-benennen', { keyColours: 'weiss' })) {
      expect(isWhiteKey((question.task as SelectTask).keyboard!.marked![0])).toBe(true);
      expect(optionValues(question)).toEqual(WHITE_NAMES);
    }
  });

  it('akzeptiert beim Spielen den genannten Ton in jeder Oktave der Klaviatur', () => {
    const prompts = new Set<string>();
    for (const question of generate('toene-klaviatur-spielen')) {
      const task = question.task as KeyboardTask;
      prompts.add(task.prompt!);
      expect(task.sound).toBe(true);
      expect(task.keyboard.marked ?? []).toEqual([]);
      const wanted = keysBetween(INTERVAL_KEYBOARD.low, INTERVAL_KEYBOARD.high).filter((key) =>
        keyNamesOf(key).includes(task.prompt!),
      );
      expect(task.accept).toEqual(wanted);
      expect(wanted).toHaveLength(2);
    }
    expect(prompts).toEqual(new Set(KEY_NAMES_BY_CLASS.flat()));
  });

  it('spielt ohne Vorzeichen nur Stammtöne, auf weissen Tasten', () => {
    const prompts = new Set<string>();
    for (const question of generate('toene-klaviatur-spielen', { accidentals: 'stammton' })) {
      const task = question.task as KeyboardTask;
      prompts.add(task.prompt!);
      expect(task.whiteOnly).toBe(true);
    }
    expect(prompts).toEqual(new Set(WHITE_NAMES));
  });

  it('nennt beim Spielen in der Rückmeldung die gespielte Taste', () => {
    const question = generate('toene-klaviatur-spielen', { accidentals: 'stammton' }).find(
      (entry) => entry.task.prompt === 'c',
    )!;
    const fis = midi(parsePitch('f#3'));
    const result = scoreTask(question.task, { keys: [fis] });
    expect(result.earned).toBe(0);
    expect(result.details[0].studentResponse).toBe('fis/ges');
    expect(result.details[0].correctResponse).toBe('c');
  });

  it('fragt beim Notenbenennen den Namen der notierten Note', () => {
    let withAccidental = 0;
    for (const question of generate('noten-benennen')) {
      const keys = (question.task as SelectTask).score!.measures[0].notes[0].keys!;
      expect(keys).toHaveLength(1);
      expect(accepted(question)).toEqual([spelled(keys[0])]);
      if (parsePitch(keys[0]).alter !== 0) withAccidental++;
      // Mit ♭ ♯ alle 21 Namen, im Raster an ihrem Platz.
      expect(optionValues(question)).toHaveLength(21);
      expect(field(question).buttonLayout).toBe('notes');
    }
    expect(withAccidental).toBeGreaterThan(0);
  });

  it('bleibt beim Notenbenennen ohne Vorzeichen bei Stammtönen und im Schlüssel', () => {
    for (const question of generate('noten-benennen', { accidentals: 'stammton', clefs: ['bass'] })) {
      const score = (question.task as SelectTask).score!;
      const pitch = parsePitch(score.measures[0].notes[0].keys![0]);
      expect(pitch.alter).toBe(0);
      expect(score.clef).toBe('bass');
      const window = windowFor('bass', 'eng');
      expect(midi(pitch)).toBeGreaterThanOrEqual(window.low);
      expect(midi(pitch)).toBeLessThanOrEqual(window.high);
      expect(optionValues(question)).toEqual(WHITE_NAMES);
    }
  });

  it('nimmt beim Notenschreiben den genannten Ton in jeder setzbaren Oktave', () => {
    /** So weit lässt das Eingabe-Widget setzen: sechs Stufen über und unter das System. */
    const reach = { treble: ['f3', 'e6'], bass: ['a1', 'g4'] } as const;
    for (const clef of ['treble', 'bass'] as const) {
      for (const question of generate('noten-schreiben', { clefs: [clef] })) {
        const task = question.task as NotationTask;
        expect(task.score.clef).toBe(clef);
        expect(task.noNameKeys).toBe(true);
        const slot = (task.solution as { slots: { accept: string[] }[] }).slots[0];
        expect(slot.accept.length).toBeGreaterThanOrEqual(2);
        for (const key of slot.accept) expect(spelled(key), key).toBe(task.prompt);
        // Jede Oktave, die sich setzen lässt — keine fehlt.
        const [low, high] = reach[clef].map((key) => midi({ ...parsePitch(key), alter: 0 }));
        const octaves = slot.accept.map((key) => parsePitch(key).octave);
        const step = parsePitch(slot.accept[0]).step;
        for (let octave = 0; octave <= 8; octave++) {
          const natural = midi({ step, alter: 0, octave });
          expect(octaves.includes(octave), `${task.prompt} in Oktave ${octave}`).toBe(natural >= low && natural <= high);
        }
      }
    }
  });

  it('wertet beim Notenschreiben jede Oktave als richtig, einen anderen Namen als falsch', () => {
    for (const question of generate('noten-schreiben', {}, 30)) {
      const task = question.task as NotationTask;
      const slot = (task.solution as { slots: { accept: string[] }[] }).slots[0];
      for (const key of slot.accept) {
        const result = scoreTask(task, { n: { 0: [fromPitch(parsePitch(key), 'w')] } });
        expect(result.earned, key).toBe(result.possible);
      }
      const other = parsePitch(slot.accept[0]);
      const wrong = fromPitch({ ...other, alter: other.alter === 0 ? 1 : 0 }, 'w');
      expect(scoreTask(task, { n: { 0: [wrong] } }).earned).toBe(0);
    }
  });

  it('schreibt ohne Vorzeichen nur Stammtöne, ohne Vorzeichen-Werkzeug', () => {
    for (const question of generate('noten-schreiben', { accidentals: 'stammton' })) {
      const task = question.task as NotationTask;
      expect(task.noAccidentals).toBe(true);
      expect(WHITE_NAMES).toContain(task.prompt);
    }
  });
});

describe('Dreiklänge', () => {
  /** Halbtöne über dem Grundton, von Hand: mittlerer und oberer Ton. */
  const SEMITONES: Record<string, [number, number]> = {
    dur: [4, 7],
    moll: [3, 7],
    vermindert: [3, 6],
    uebermaessig: [4, 8],
    sus4: [5, 7],
  };

  const field = (question: Question, id = 'a') => (question.task as SelectTask).fields.find((f) => f.id === id)!;
  const scoreKeys = (question: Question) => {
    const measure = (question.task as SelectTask).score!.measures[0];
    return [...(measure.bass?.[0]?.keys ?? []), ...(measure.notes[0].keys ?? [])].map(parsePitch);
  };

  /**
   * Grundton, tiefstes und höchstes Akkordglied, von Hand: der Grundton ist
   * der Ton, über dem die beiden anderen eine Terz und eine Quinte weiter
   * stehen (diatonisch gezählt). 0 = Grundton, 2 = Terz, 4 = Quinte.
   */
  function members(pitches: ReturnType<typeof parsePitch>[]) {
    const steps = 'cdefgab';
    const degree = (p: ReturnType<typeof parsePitch>) => steps.indexOf(p.step);
    const sorted = [...pitches].sort((a, b) => midi(a) - midi(b));
    const root = sorted.find((candidate) =>
      sorted.every((p) => [0, 2, 4].includes((degree(p) - degree(candidate) + 7) % 7)),
    )!;
    const member = (p: ReturnType<typeof parsePitch>) => (degree(p) - degree(root) + 7) % 7;
    return { root, bass: member(sorted[0]), top: member(sorted[sorted.length - 1]) };
  }
  const INVERSION_OF: Record<number, string> = { 0: 'grundstellung', 2: 'sextakkord', 4: 'quartsextakkord' };
  const POSITION_OF: Record<number, string> = { 0: 'oktavlage', 2: 'terzlage', 4: 'quintlage' };

  it('steht nach den Intervallen und vor den Tonarten, in zwei Gruppen', () => {
    const ids = topicsWithGenerators().map((topic) => topic.id);
    expect(ids.indexOf('dreiklaenge')).toBe(ids.indexOf('intervalle') + 1);
    expect(ids.indexOf('tonleitern')).toBe(ids.indexOf('dreiklaenge') + 1);
    expect(TOPIC_GROUPS.dreiklaenge!.map((group) => group.title)).toEqual(['Grundstellung', 'Umkehrungen & Lagen']);
  });

  it('führt «Stufen bestimmen» unter den Tonarten', () => {
    expect(generatorById('stufen-bestimmen')!.topic).toBe('tonleitern');
  });

  it('zeigt in Grundstellung drei Töne eng über dem Grundton, im gefragten Geschlecht', () => {
    const questions = generate('dreiklaenge-bestimmen', { sus4: true });
    for (const question of questions) {
      const [root, middle, top] = scoreKeys(question);
      expect([midi(middle) - midi(root), midi(top) - midi(root)]).toEqual(SEMITONES[field(question).correct]);
    }
    expect(answersFor(questions, 'a')).toEqual(new Set(['dur', 'moll', 'vermindert', 'uebermaessig', 'sus4']));
  });

  it('fragt nur die angekreuzten Geschlechter, sus4 nur zugeschaltet', () => {
    expect(answersFor(generate('dreiklaenge-bestimmen', { qualities: ['moll', 'vermindert'] }), 'a')).toEqual(
      new Set(['moll', 'vermindert']),
    );
    for (const question of generate('dreiklaenge-bestimmen', { qualities: ['dur'] }, 20)) {
      expect(offered(question, 'a')).toEqual(['dur']);
    }
    for (const id of ['dreiklaenge-bestimmen', 'dreiklaenge-klaviatur-benennen', 'dreiklaenge-hoeren']) {
      expect(answersFor(generate(id, {}), 'a').has('sus4'), id).toBe(false);
      expect(offered(generate(id, { sus4: true }, 1)[0], 'a'), id).toContain('sus4');
    }
  });

  it('kommt ohne Doppelvorzeichen aus und hält «ohne Vorzeichen» beim Grundton', () => {
    for (const question of generate('dreiklaenge-bestimmen', { sus4: true })) {
      expect(scoreKeys(question).every((p) => Math.abs(p.alter) <= 1)).toBe(true);
    }
    for (const question of generate('dreiklaenge-bestimmen', { accidentals: 'stammton', sus4: true })) {
      expect(scoreKeys(question)[0].alter).toBe(0);
    }
  });

  it('bleibt im gewählten Schlüssel im System', () => {
    for (const question of generate('dreiklaenge-bestimmen', { clefs: ['bass'] })) {
      expect((question.task as SelectTask).score!.clef).toBe('bass');
      expect(scoreKeys(question).every((p) => midi(p) >= 43 && midi(p) <= 62)).toBe(true);
    }
  });

  it('markiert auf der Klaviatur drei Tasten im gefragten Geschlecht, Grundton unten', () => {
    for (const question of generate('dreiklaenge-klaviatur-benennen', { sus4: true })) {
      const keys = (question.task as SelectTask).keyboard!.marked!;
      expect(keys).toHaveLength(3);
      expect([keys[1] - keys[0], keys[2] - keys[0]]).toEqual(SEMITONES[field(question).correct]);
      expect(keys.every((key) => key >= 48 && key <= 71)).toBe(true);
    }
    for (const question of generate('dreiklaenge-klaviatur-benennen', { accidentals: 'stammton' })) {
      expect(isWhiteKey((question.task as SelectTask).keyboard!.marked![0])).toBe(true);
    }
  });

  it('spielt beim Hören den Dreiklang im gefragten Geschlecht', () => {
    for (const question of generate('dreiklaenge-hoeren', { sus4: true })) {
      expect(question.audio?.kind).toBe('voicing');
      const notes = question.audio?.kind === 'voicing' ? question.audio.notes.map(parsePitch) : [];
      expect([midi(notes[1]) - midi(notes[0]), midi(notes[2]) - midi(notes[0])]).toEqual(
        SEMITONES[field(question).correct],
      );
    }
    const together = generate('dreiklaenge-hoeren', { playback: 'zusammen' }, 5);
    expect(together.every((question) => question.audio?.kind === 'voicing' && question.audio.broken === false)).toBe(
      true,
    );
  });

  it('fragt bei Umkehrungen & Lagen genau das Eingestellte', () => {
    for (const id of ['umkehrungen-benennen', 'umkehrungen-klaviatur-benennen', 'umkehrungen-hoeren']) {
      for (const ask of [['inv'], ['pos'], ['inv', 'pos']]) {
        for (const question of generate(id, { ask }, 10)) {
          expect((question.task as SelectTask).fields.map((f) => f.id), `${id} ${ask}`).toEqual(ask);
        }
      }
    }
  });

  it('zeigt ohne Basston drei Töne eng: die Lage folgt aus der Umkehrung', () => {
    const coupled: Record<string, string> = {
      grundstellung: 'quintlage',
      sextakkord: 'oktavlage',
      quartsextakkord: 'terzlage',
    };
    const questions = generate('umkehrungen-benennen', { ask: ['inv', 'pos'], qualities: ['dur', 'moll', 'vermindert', 'uebermaessig'] });
    for (const question of questions) {
      const pitches = scoreKeys(question);
      expect(pitches).toHaveLength(3);
      expect(midi(pitches[2]) - midi(pitches[0])).toBeLessThan(12);
      const { bass, top } = members(pitches);
      expect(field(question, 'inv').correct).toBe(INVERSION_OF[bass]);
      expect(field(question, 'pos').correct).toBe(POSITION_OF[top]);
      expect(coupled[field(question, 'inv').correct]).toBe(field(question, 'pos').correct);
    }
    expect(answersFor(questions, 'inv')).toEqual(new Set(['grundstellung', 'sextakkord', 'quartsextakkord']));
  });

  it('setzt mit Basston ein zweites System, und Umkehrung und Lage sind frei', () => {
    const questions = generate('umkehrungen-benennen', { ask: ['inv', 'pos'], withBass: true });
    const pairs = new Set<string>();
    for (const question of questions) {
      const score = (question.task as SelectTask).score!;
      expect(score.clef).toBe('grand');
      expect(score.measures[0].bass?.[0].keys).toHaveLength(1);
      const pitches = scoreKeys(question);
      expect(pitches).toHaveLength(4);
      const { bass, top } = members(pitches);
      expect(field(question, 'inv').correct).toBe(INVERSION_OF[bass]);
      expect(field(question, 'pos').correct).toBe(POSITION_OF[top]);
      pairs.add(`${field(question, 'inv').correct} ${field(question, 'pos').correct}`);
    }
    expect(pairs.size).toBe(9);
  });

  it('hält die eingestellten Umkehrungen und Lagen ein', () => {
    expect(answersFor(generate('umkehrungen-benennen', { inversions: ['sextakkord'] }), 'inv')).toEqual(
      new Set(['sextakkord']),
    );
    expect(
      answersFor(generate('umkehrungen-hoeren', { ask: ['pos'], positions: ['terzlage', 'oktavlage'] }), 'pos'),
    ).toEqual(new Set(['terzlage', 'oktavlage']));
    // Ohne Basston gibt es zu den eingestellten Umkehrungen nur ihre Lagen.
    const question = generate('umkehrungen-benennen', { ask: ['inv', 'pos'], inversions: ['grundstellung', 'sextakkord'] }, 1)[0];
    expect(offered(question, 'pos')).toEqual(['oktavlage', 'quintlage']);
  });

  it('sperrt die Lagen, wo sie aus der Umkehrung folgen', () => {
    const filter = generatorById('umkehrungen-benennen')!.filters.find((entry) => entry.key === 'positions')!;
    expect(filter.disabledBy!({ ask: ['inv'] })).toMatch(/Lage gefragt/);
    expect(filter.disabledBy!({ ask: ['pos'] })).toBeNull();
    expect(filter.disabledBy!({ ask: ['inv', 'pos'], withBass: false })).toMatch(/folgt/);
    expect(filter.disabledBy!({ ask: ['inv', 'pos'], withBass: true })).toBeNull();
  });

  it('lässt beim Hören und auf der Klaviatur den übermässigen weg', () => {
    for (const id of ['umkehrungen-klaviatur-benennen', 'umkehrungen-hoeren']) {
      const qualities = generatorById(id)!.filters.find((entry) => entry.key === 'qualities')!;
      expect(qualities.kind === 'multi' && qualities.options.map((o) => o.value), id).not.toContain('uebermaessig');
      // Auch ein alter Stand mit «übermässig» bringt keinen.
      for (const question of generate(id, { qualities: ['uebermaessig', 'dur'], withBass: true }, 50)) {
        const keys =
          question.task.kind === 'select' && question.task.keyboard
            ? question.task.keyboard.marked!
            : question.audio?.kind === 'voicing'
              ? question.audio.notes.map((key) => midi(parsePitch(key)))
              : [];
        const classes = new Set(keys.map((key) => key % 12));
        const augmented = [...classes].some((pc) => classes.has((pc + 4) % 12) && classes.has((pc + 8) % 12));
        expect(augmented, id).toBe(false);
      }
    }
  });

  it('verlangt beim Spielen in Grundstellung den genannten Akkord, Grundton unten', () => {
    const NAMES: Record<string, string> = { dur: '-Dur', moll: '-Moll', vermindert: ' vermindert', uebermaessig: ' übermässig', sus4: 'sus4' };
    const seen = new Set<string>();
    for (const question of generate('dreiklaenge-klaviatur-spielen', { sus4: true })) {
      const task = question.task as KeyboardTask;
      const quality = Object.keys(NAMES).find((key) => task.prompt!.endsWith(NAMES[key]))!;
      seen.add(quality);
      expect([task.accept[1] - task.accept[0], task.accept[2] - task.accept[0]], task.prompt).toEqual(SEMITONES[quality]);
      expect(task.chord!.lowest).toBe(0);
      expect(task.chord!.highest).toBeUndefined();
      // Grundton eine Oktave höher und die Quinte verdoppelt: auch richtig.
      const spread = [task.accept[0], task.accept[1] + 12, task.accept[2], task.accept[2] + 12];
      expect(scoreTask(task, { keys: spread }).earned, task.prompt).toBe(task.points);
      // Ohne den Grundton unten: falsch.
      expect(scoreTask(task, { keys: [task.accept[1], task.accept[2], task.accept[0] + 12] }).earned).toBe(0);
    }
    expect(seen).toEqual(new Set(Object.keys(NAMES)));
  });

  it('verlangt beim Spielen von Umkehrungen nur das Gefragte', () => {
    for (const [ask, lowest, highest] of [[['inv'], true, false], [['pos'], false, true], [['inv', 'pos'], true, true]] as const) {
      for (const question of generate('umkehrungen-klaviatur-spielen', { ask: [...ask], withBass: true }, 50)) {
        const task = question.task as KeyboardTask;
        expect(task.chord!.lowest !== undefined, `${ask}`).toBe(lowest);
        expect(task.chord!.highest !== undefined, `${ask}`).toBe(highest);
      }
    }
  });

  it('nennt beim Spielen von Umkehrungen Akkord und Umkehrung, und die Lösung erfüllt sie', () => {
    const INVERSION_MEMBER: Record<string, number> = { Grundstellung: 0, Sextakkord: 1, Quartsextakkord: 2 };
    const POSITION_MEMBER: Record<string, number> = { Oktavlage: 0, Terzlage: 1, Quintlage: 2 };
    for (const question of generate('umkehrungen-klaviatur-spielen', { ask: ['inv', 'pos'], withBass: true, qualities: ['dur', 'moll', 'vermindert', 'uebermaessig'] })) {
      const task = question.task as KeyboardTask;
      const match = /^(.+), (\w+) in (\w+)$/.exec(task.prompt!)!;
      expect(match, task.prompt).not.toBeNull();
      expect(task.chord!.lowest).toBe(INVERSION_MEMBER[match[2]]);
      expect(task.chord!.highest).toBe(POSITION_MEMBER[match[3]]);
      // Tiefste und höchste Taste der Lösung sind diese Akkordglieder.
      const classes = task.chord!.tones.map((tone) => midi(parsePitch(tone)) % 12);
      const sorted = [...task.accept].sort((a, b) => a - b);
      expect(classes.indexOf(sorted[0] % 12)).toBe(task.chord!.lowest);
      expect(classes.indexOf(sorted[sorted.length - 1] % 12)).toBe(task.chord!.highest);
      expect(scoreTask(task, { keys: task.accept }).earned).toBe(task.points);
    }
  });

  it('legt mit Basston auf der Klaviatur vier Tasten, den Basston abgesetzt', () => {
    for (const question of generate('umkehrungen-klaviatur-benennen', { withBass: true, ask: ['inv', 'pos'] })) {
      const keys = (question.task as SelectTask).keyboard!.marked!;
      expect(keys).toHaveLength(4);
      expect(keys[1] - keys[0]).toBeGreaterThanOrEqual(3);
      expect(keys.every((key) => key >= 48 && key <= 71)).toBe(true);
    }
  });
});

describe('Intervalle singen', () => {
  const sing = (question: Question) => question.task as SingTask;
  const generator = generatorById('intervalle-singen')!;
  /** Wie `generate()`, aber mit Stimmlage. */
  const withVoice = (voice: Voice, filters: FilterValues = {}, count = RUNS) =>
    Array.from({ length: count }, (_, i) =>
      generator.generate({ ...generator.defaults, ...filters }, makeRng(i * 2654435761), { voice }),
    );

  it('bleibt mit beiden Tönen in der Stimmlage', () => {
    for (const voice of ['hoch', 'mittel', 'tief'] as const) {
      const { low, high } = VOICE_RANGES[voice];
      for (const question of withVoice(voice)) {
        for (const key of [sing(question).reference, sing(question).target]) {
          const value = midi(parsePitch(key));
          expect(value, `${voice}: ${key}`).toBeGreaterThanOrEqual(low);
          expect(value, `${voice}: ${key}`).toBeLessThanOrEqual(high);
        }
      }
    }
  });

  it('zeigt den Ausgangston in den angekreuzten Schlüsseln, unabhängig von der Stimmlage', () => {
    for (const voice of ['hoch', 'tief'] as const) {
      const used = new Set(withVoice(voice, { clefs: ['treble', 'bass'] }).map((q) => sing(q).score.clef));
      expect([...used].sort(), voice).toEqual(['bass', 'treble']);
      for (const question of withVoice(voice, { clefs: ['bass'] }, 20)) {
        expect(sing(question).score.clef).toBe('bass');
      }
    }
    const shown = sing(withVoice('mittel', {}, 1)[0]);
    expect(shown.score.clef).toBe('treble');
    expect(shown.score.measures[0].notes[0].keys).toEqual([shown.reference]);
  });

  it('hält den Platz um das System je Einstellung fest', () => {
    for (const voice of ['hoch', 'mittel', 'tief'] as const) {
      for (const clef of ['treble', 'bass']) {
        const spaces = new Set(withVoice(voice, { clefs: [clef] }, 60).map((q) => JSON.stringify(sing(q).score.space)));
        expect(spaces.size, `${voice}/${clef}`).toBe(1);
      }
    }
    // Tiefe Lage im Violinschlüssel braucht unten viel mehr Platz als im Bassschlüssel.
    const below = (clef: string) => sing(withVoice('tief', { clefs: [clef] }, 1)[0]).score.space!.below;
    expect(below('treble')).toBeGreaterThan(below('bass') + 40);
  });

  it('fragt mit und ohne Schlüssel-Einstellung dieselbe Aufgabe', () => {
    // Der Schlüssel wird zuletzt gewürfelt: alte Aufgabenlinks bleiben gültig.
    const plain = withVoice('mittel', {}, 30);
    withVoice('mittel', { clefs: ['treble', 'bass'] }, 30).forEach((question, i) => {
      expect(sing(question).reference).toBe(sing(plain[i]).reference);
      expect(sing(question).target).toBe(sing(plain[i]).target);
    });
  });

  it('verlangt das genannte Intervall in der genannten Richtung', () => {
    for (const question of generate('intervalle-singen')) {
      const task = sing(question);
      const reference = parsePitch(task.reference);
      const target = parsePitch(task.target);
      const name = intervalFullName(intervalBetween(reference, target));
      if (midi(target) === midi(reference)) expect(task.prompt).toBe(name);
      else expect(task.prompt).toBe(`${name} ${midi(target) > midi(reference) ? 'aufwärts' : 'abwärts'}`);
    }
  });

  it('fragt nur die angekreuzten Intervalle, und jedes davon', () => {
    const asked = new Set(
      generate('intervalle-singen', { intervals: ['k3', 'tritonus', 'r8'] }).map((question) => {
        const task = sing(question);
        return intervalAnswer(intervalLabel(intervalBetween(parsePitch(task.reference), parsePitch(task.target))));
      }),
    );
    expect([...asked].sort()).toEqual(['k3', 'r8', 'tritonus']);
  });

  it('hält die Richtung ein', () => {
    for (const question of generate('intervalle-singen', { directions: ['down'], intervals: ['g3', 'r5'] })) {
      const task = sing(question);
      expect(midi(parsePitch(task.target))).toBeLessThan(midi(parsePitch(task.reference)));
      expect(task.prompt).toMatch(/abwärts$/);
    }
  });

  it('wertet «Ohne Fehlerurteil» erst den richtigen Ton', () => {
    expect(generate('intervalle-singen', {}, 5).every((question) => !sing(question).untilRight)).toBe(true);
    for (const question of generate('intervalle-singen', { untilRight: true }, 20)) {
      const task = sing(question);
      expect(task.untilRight).toBe(true);
      const target = midi(parsePitch(task.target));
      const reference = midi(parsePitch(task.reference));
      const wrong = (target + 1 - reference) % 12 === 0 ? target + 2 : target + 1;
      expect(scoreTask(task, { notes: [wrong, target] }).earned, task.prompt).toBe(task.points);
      expect(scoreTask(task, { notes: [wrong] }).earned, task.prompt).toBe(0);
    }
  });

  it('übernimmt die Genauigkeit', () => {
    for (const question of generate('intervalle-singen', { tolerance: '15' }, 10)) {
      expect(sing(question).tolerance).toBe(15);
    }
  });

  it('fragt mit demselben Startwert in jeder Stimmlage dasselbe Intervall', () => {
    const [hoch, tief] = [withVoice('hoch', {}, 50), withVoice('tief', {}, 50)];
    hoch.forEach((question, i) => expect(sing(tief[i]).prompt).toBe(sing(question).prompt));
  });

  it('wertet die ganze Aufgabe eine Oktave tiefer als richtig', () => {
    // Ausgangston eine Oktave tiefer nachgesungen, dann der Zielton dort.
    for (const question of generate('intervalle-singen', {}, 50)) {
      const task = sing(question);
      const notes = [midi(parsePitch(task.reference)) - 12, midi(parsePitch(task.target)) - 12];
      expect(scoreTask(task, { notes }).earned, task.prompt).toBe(task.points);
    }
  });

  it('wertet den Zielton allein in einer anderen Oktave als richtig, ausser bei der Oktave', () => {
    // Bei der Oktave wäre der Zielton eine Oktave tiefer der gespielte Ton.
    for (const question of generate('intervalle-singen', { intervals: ['k3', 'r5', 'g7'] }, 50)) {
      const task = sing(question);
      const lower = midi(parsePitch(task.target)) - 12;
      expect(scoreTask(task, { notes: [lower] }).earned, task.prompt).toBe(task.points);
    }
  });

  it('nimmt nach dem Ausgangston den ersten anderen Ton als Antwort', () => {
    for (const question of generate('intervalle-singen', { intervals: ['g3'] }, 20)) {
      const task = sing(question);
      const target = midi(parsePitch(task.target));
      // Ausgangston, dann daneben, dann richtig: zählt nicht mehr.
      const result = scoreTask(task, { notes: [midi(parsePitch(task.reference)), target + 1, target] });
      expect(result.earned).toBe(0);
    }
  });
});

describe('Takte gehen auf', () => {
  it.each(['4/4', '3/4', '2/4'])('füllt bei %s jeden Takt der Pausenaufgabe', (timeSignature) => {
    const questions = generate('pausen-ergaenzen', { timeSignature });
    const capacity = measureCapacity(timeSignature);

    for (const question of questions) {
      const task = question.task as NotationTask;
      const solution = task.solution;
      expect(solution.type).toBe('slot');
      if (solution.type !== 'slot') continue;

      task.score.measures.forEach((bar, index) => {
        const slot = solution.slots.find((s) => s.measure === index)!;
        expect(slot, `Takt ${index + 1} ohne Lücke`).toBeDefined();

        const sum = bar.notes.reduce(
          (total, note) =>
            total +
            (note.placeholder
              ? durationInQuarters(slot.duration, slot.dotted)
              : durationInQuarters(note.duration, note.dotted)),
          0,
        );
        expect(sum, `Takt ${index + 1} bei ${timeSignature}`).toBeCloseTo(capacity, 6);
      });

      // Genau eine Lücke je Takt — sonst stimmt die Anweisung nicht.
      for (const bar of task.score.measures) {
        expect(bar.notes.filter((n) => n.placeholder)).toHaveLength(1);
      }
    }
  });

  it('sucht nur die angekreuzten Pausenwerte', () => {
    const questions = generate('pausen-ergaenzen', {
      durations: ['h', 'q', '8'],
      gaps: ['h'],
    });
    for (const question of questions) {
      const solution = (question.task as NotationTask).solution;
      if (solution.type !== 'slot') continue;
      for (const slot of solution.slots) {
        expect(slot.duration).toBe('h');
        expect(slot.dotted).toBeFalsy();
      }
    }
  });
});

describe('Melodiediktat', () => {
  it.each(['4/4', '3/4', '2/4', '6/8'])('füllt bei %s jeden Takt', (timeSignature) => {
    const questions = generate('melodiediktat', { timeSignature }, 60);
    const capacity = measureCapacity(timeSignature);

    for (const question of questions) {
      const solution = (question.task as NotationTask).solution;
      expect(solution.type).toBe('melody');
      if (solution.type !== 'melody') continue;

      solution.measures.forEach((bar, index) => {
        const sum = bar.reduce(
          (total, note) => total + durationInQuarters(note.duration, note.dotted),
          0,
        );
        expect(sum, `Takt ${index + 1} bei ${timeSignature}`).toBeCloseTo(capacity, 6);
      });
    }
  });

  it('hält die verlangte Anzahl Takte ein', () => {
    for (const bars of [2, 4, 8]) {
      const questions = generate('melodiediktat', { bars }, 30);
      for (const question of questions) {
        const solution = (question.task as NotationTask).solution;
        if (solution.type !== 'melody') continue;
        expect(solution.measures).toHaveLength(bars);
        expect((question.task as NotationTask).score.measures).toHaveLength(bars);
      }
    }
  });

  it('endet auf dem Grundton', () => {
    const questions = generate('melodiediktat', { keys: ['C-Dur'], scale: 'dur' }, 60);
    for (const question of questions) {
      const solution = (question.task as NotationTask).solution;
      if (solution.type !== 'melody') continue;
      const flat = solution.measures.flat();
      const last = flat[flat.length - 1];
      expect(midi(parsePitch(last.keys![0])) % 12).toBe(0);
    }
  });

  it('verwendet nur die erlaubten Notenwerte', () => {
    const allowed: Duration[] = ['h', 'q'];
    const questions = generate('melodiediktat', { durations: ['h', 'q'] }, 60);
    for (const question of questions) {
      const solution = (question.task as NotationTask).solution;
      if (solution.type !== 'melody') continue;
      for (const note of solution.measures.flat()) {
        expect(allowed).toContain(note.duration);
        expect(note.dotted).toBeFalsy();
      }
    }
  });

  it('hält den gewählten Sprungrahmen ein', () => {
    // «nur Sekundschritte»: zwischen zwei Tönen liegt nie mehr als ein
    // Ganzton — abgesehen von der übermässigen Sekunde in harmonisch Moll.
    const questions = generate('melodiediktat', { maxLeap: '1', scale: 'dur' }, 60);
    for (const question of questions) {
      const solution = (question.task as NotationTask).solution;
      if (solution.type !== 'melody') continue;
      const pitches = solution.measures.flat().map((note) => midi(parsePitch(note.keys![0])));
      for (let i = 1; i < pitches.length; i++) {
        expect(Math.abs(pitches[i] - pitches[i - 1]), 'Sprung trotz «nur Sekundschritte»').toBeLessThanOrEqual(2);
      }
    }
  });

  it('bleibt im gewählten Tonumfang', () => {
    // «Quinte» heisst: zwischen tiefstem und höchstem Ton liegen höchstens
    // sieben Halbtöne. Ein zu weiter Umfang macht das Diktat unnötig schwer
    // und sprengt das Notensystem.
    const limits: Record<string, number> = { '4': 7, '7': 12, '9': 16 };
    for (const [span, semitones] of Object.entries(limits)) {
      const questions = generate('melodiediktat', { span, keys: ['C-Dur'] }, 40);
      for (const question of questions) {
        const solution = (question.task as NotationTask).solution;
        if (solution.type !== 'melody') continue;
        const pitches = solution.measures.flat().map((note) => midi(parsePitch(note.keys![0])));
        const reach = Math.max(...pitches) - Math.min(...pitches);
        expect(reach, `Umfang «${span}» ergibt ${reach} Halbtöne`).toBeLessThanOrEqual(semitones);
      }
    }
  });

  it.each(['2', '4'])('hält auch den Sprungrahmen «bis %s Stufen» ein', (maxLeap) => {
    const questions = generate('melodiediktat', { maxLeap, scale: 'dur' }, 40);
    // Eine Stufe sind höchstens zwei Halbtöne, also ist die Obergrenze das
    // Doppelte des erlaubten Stufensprungs.
    const limit = Number(maxLeap) * 2;
    for (const question of questions) {
      const solution = (question.task as NotationTask).solution;
      if (solution.type !== 'melody') continue;
      const pitches = solution.measures.flat().map((note) => midi(parsePitch(note.keys![0])));
      for (let i = 1; i < pitches.length; i++) {
        expect(Math.abs(pitches[i] - pitches[i - 1])).toBeLessThanOrEqual(limit);
      }
    }
  });

  it('gibt die erste Note vor, wenn es verlangt ist', () => {
    const withNote = generate('melodiediktat', { giveFirstNote: true }, 20);
    for (const question of withNote) {
      const task = question.task as NotationTask;
      const solution = task.solution;
      if (solution.type !== 'melody') continue;
      expect(task.score.measures[0].notes).toHaveLength(1);
      expect(task.score.measures[0].notes[0].keys).toEqual(solution.measures[0][0].keys);
    }

    const without = generate('melodiediktat', { giveFirstNote: false }, 20);
    for (const question of without) {
      expect((question.task as NotationTask).score.measures[0].notes).toHaveLength(0);
    }
  });

  it('wirft verständlich, wenn kein Notenwert in den Takt passt', () => {
    const generator = generatorById('melodiediktat')!;
    expect(() =>
      generator.generate(
        { ...generator.defaults, timeSignature: '4/4', durations: ['q.'] } as never,
        makeRng(7),
      ),
    ).toThrow(/Takt/);
  });
});

describe('Halbtonschritte', () => {
  it('markiert bei Dur die Stellen 3–4 und 7–8', () => {
    const questions = generate('halbtonschritte-markieren', { scales: ['dur'], directions: ['up'] });
    for (const question of questions) {
      const solution = (question.task as NotationTask).solution;
      if (solution.type !== 'mark') continue;
      expect(solution.gaps).toEqual([2, 6]);
    }
  });

  it('markiert bei natürlichem Moll die Stellen 2–3 und 5–6', () => {
    const questions = generate('halbtonschritte-markieren', {
      scales: ['moll-natuerlich'],
      directions: ['up'],
    });
    for (const question of questions) {
      const solution = (question.task as NotationTask).solution;
      if (solution.type !== 'mark') continue;
      expect(solution.gaps).toEqual([1, 4]);
    }
  });

  it('zählt bei harmonischem Moll die übermässige Sekunde nicht mit', () => {
    const questions = generate('halbtonschritte-markieren', {
      scales: ['moll-harmonisch'],
      directions: ['up'],
    });
    for (const question of questions) {
      const solution = (question.task as NotationTask).solution;
      if (solution.type !== 'mark') continue;
      // 2–3, 5–6 und 7–8; der Anderthalbtonschritt 6–7 gehört nicht dazu.
      expect(solution.gaps).toEqual([1, 4, 6]);
    }
  });

  it('dreht die Stellen beim Abwärtsspielen mit', () => {
    const questions = generate('halbtonschritte-markieren', {
      scales: ['dur'],
      directions: ['down'],
    });
    for (const question of questions) {
      const solution = (question.task as NotationTask).solution;
      if (solution.type !== 'mark') continue;
      // Aufwärts 2 und 6, gespiegelt an sieben Zwischenräumen: 0 und 4.
      expect(solution.gaps).toEqual([0, 4]);
    }
  });

  it('zeichnet acht Töne', () => {
    for (const question of generate('halbtonschritte-markieren', {}, 40)) {
      expect((question.task as NotationTask).score.measures[0].notes).toHaveLength(8);
    }
  });
});

describe('Notenwerte zuordnen', () => {
  it('bietet bei «Name → Zeichen» vier Zeichen an', () => {
    const questions = generate('notenwerte-zuordnen', { direction: 'name-zeichen' }, 60);
    for (const question of questions) {
      expect(question.legend).toHaveLength(4);
      const correct = (question.task as SelectTask).fields[0].correct;
      expect(question.legend!.map((entry) => entry.label)).toContain(correct);
    }
  });

  it('zeigt bei «Zeichen → Name» genau ein Zeichen', () => {
    const questions = generate('notenwerte-zuordnen', { direction: 'zeichen-name' }, 60);
    for (const question of questions) {
      expect(question.legend).toBeUndefined();
      expect((question.task as SelectTask).score!.measures[0].notes).toHaveLength(1);
    }
  });

  it('fragt nur die angekreuzten Werte', () => {
    const seen = answersFor(
      generate('notenwerte-zuordnen', { durations: ['w', 'h'], direction: 'zeichen-name' }),
      'a',
    );
    expect([...seen].sort()).toEqual(['h', 'w']);
  });
});

// ---------------------------------------------------------------------------
// Antwortformat
// ---------------------------------------------------------------------------

describe('Antwortformat', () => {
  it('liest jede erzeugte Tonangabe wieder ein', () => {
    // Der Sonderfall B: «hes4» muss als erniedrigtes H zurückkommen und nicht
    // als Heses. Ein Fehler hier fiele erst im Notenbild auf.
    for (const generator of GENERATORS) {
      for (const question of generate(generator.id, {}, 30)) {
        for (const key of allKeysOf(question.task)) {
          const pitch = parsePitch(key);
          expect(Math.abs(pitch.alter), `${generator.id}: ${key}`).toBeLessThanOrEqual(2);
        }
      }
    }
  });

  it('nennt für jede Melodie so viele Klangereignisse wie Noten', () => {
    for (const question of generate('melodiediktat', {}, 20)) {
      const solution = (question.task as NotationTask).solution;
      if (solution.type !== 'melody') continue;
      expect(question.melody).toHaveLength(solution.measures.flat().length);
    }
  });
});

function allKeysOf(task: Task): string[] {
  const keys: string[] = [];
  const collect = (score?: { measures: { notes: { keys?: string[] }[]; bass?: { keys?: string[] }[] }[] }) => {
    for (const bar of score?.measures ?? []) {
      for (const note of [...bar.notes, ...(bar.bass ?? [])]) keys.push(...(note.keys ?? []));
    }
  };
  if (task.kind === 'select') collect(task.score);
  if (task.kind === 'sing') {
    collect(task.score);
    keys.push(task.reference, task.target);
  }
  if (task.kind === 'notation') {
    collect(task.score);
    if (task.solution.type === 'melody') {
      for (const bar of task.solution.measures) for (const note of bar) keys.push(...(note.keys ?? []));
    }
    if (task.solution.type === 'pitch') {
      for (const slot of task.solution.slots) keys.push(...slot.accept);
    }
  }
  return keys;
}

/** Nur damit der Import benutzt wird, wenn Tests umgebaut werden. */
export type { InputNote };

// ---------------------------------------------------------------------------
// Antwortoptionen folgen den Einstellungen
// ---------------------------------------------------------------------------

/** Werte der Auswahloptionen eines Felds — so, wie die Oberfläche sie zeigt. */
function offered(question: Question, fieldId: string): string[] {
  const task = question.task as SelectTask;
  const field = task.fields.find((entry) => entry.id === fieldId);
  if (!field) throw new Error(`Feld ${fieldId} fehlt`);
  return resolveOptions(field).map((option) => option.value);
}

describe('Antwortoptionen', () => {
  it('bieten bei jeder Übung die richtige Antwort an', () => {
    // Die wichtigste Regel beim Einschränken: nie so weit, dass die Lösung fehlt.
    for (const generator of GENERATORS) {
      for (const question of generate(generator.id, {}, 60)) {
        if (question.task.kind !== 'select') continue;
        for (const field of question.task.fields) {
          expect(resolveOptions(field).map((o) => o.value), `${generator.id}.${field.id}`).toContain(field.correct);
        }
      }
    }
  });

  it('bieten beim Intervallhören nur die eingestellten Intervalle an', () => {
    for (const question of generate('intervalle-hoeren', { intervals: ['k3', 'g3'] }, 20)) {
      expect(offered(question, 'a')).toEqual(['k3', 'g3']);
    }
  });

  it('bieten beim Intervallbestimmen nur die eingestellten Intervalle an', () => {
    for (const question of generate('intervalle-bestimmen', { intervals: ['r4', 'tritonus', 'r5'] }, 20)) {
      expect(offered(question, 'a')).toEqual(['r4', 'tritonus', 'r5']);
    }
  });

  it('ordnen Intervalle als Raster an', () => {
    for (const id of ['intervalle-hoeren', 'intervalle-bestimmen']) {
      const field = (generate(id, {}, 1)[0].task as SelectTask).fields[0];
      expect(field.buttonLayout, id).toBe('intervals');
    }
  });

  it('bieten beim Tonleiterhören nur die eingestellten Arten an', () => {
    for (const question of generate('tonleitern-hoeren', { scaleTypes: ['dur', 'moll-harmonisch'] }, 20)) {
      expect(offered(question, 'a')).toEqual(['dur', 'moll-harmonisch']);
    }
  });

  it('bieten beim Tonartenzuordnen nur Tonarten innerhalb der Vorzeichengrenze an', () => {
    for (const question of generate('tonarten-zuordnen', { maxAccidentals: 1, signs: ['kreuz', 'keine'] }, 20)) {
      expect(offered(question, 'dur')).toEqual(['C-Dur', 'G-Dur']);
      expect(offered(question, 'moll')).toEqual(['a-Moll', 'e-Moll']);
    }
  });

  it('bieten beim Notenwertezuordnen nur die eingestellten Werte an', () => {
    const questions = generate('notenwerte-zuordnen', { durations: ['h', 'q', '8'], direction: 'zeichen-name' }, 20);
    for (const question of questions) {
      expect(offered(question, 'a')).toEqual(['h', 'q', '8']);
    }
  });
});
