/**
 * Generiertes Melodiediktat: Lage im Schlüssel, Schreibweise nach der Tonart,
 * beide Schreibweisen chromatisch, Punkte je Ton und was erklingt.
 */

import { describe, expect, it } from 'vitest';
import type { NotationTask } from '../content/schema';
import { keySignatureSteps, accidentalsOfVexKey, midi, parsePitch, type Pitch } from '../music/theory';
import { scoreTask, type InputNote, type PitchAnswer } from '../scoring';
import { generatorById } from './index';
import { CLEF_WINDOWS, LIMITED_PLAYS } from './melodie-shared';
import { makeRng } from './rng';
import type { FilterValues, Question } from './types';

const generator = generatorById('generiertes-melodiediktat')!;

function questions(overrides: FilterValues = {}, count = 80): Question[] {
  return Array.from({ length: count }, (_, seed) => generator.generate({ ...generator.defaults, ...overrides }, makeRng(seed + 1)));
}

const task = (question: Question) => question.task as NotationTask;

/** Die ganze Melodie: der vorgegebene erste Ton und je Platz die erste zulässige Schreibweise. */
function melodyOf(question: Question): Pitch[] {
  const { score, solution } = task(question);
  if (solution.type !== 'pitch') throw new Error('kein Tonhöhen-Diktat');
  return [parsePitch(score.measures[0].notes[0].keys![0]), ...solution.slots.map((slot) => parsePitch(slot.accept[0]))];
}

const note = (pitch: Pitch): InputNote => ({ s: pitch.step, o: pitch.octave, a: pitch.alter, d: 'w' });

/** Die Musterlösung, mit `change` je Platz verändert. */
function answer(question: Question, change: (pitch: Pitch, slot: number) => Pitch | null = (pitch) => pitch): { n: PitchAnswer } {
  const placed: PitchAnswer = {};
  melodyOf(question)
    .slice(1)
    .forEach((pitch, index) => {
      const given = change(pitch, index + 1);
      if (given) placed[String(index + 1)] = [note(given)];
    });
  return { n: placed };
}

describe('Generiertes Melodiediktat', () => {
  it('steht im Thema Melodie und hat die Einstellungen in dieser Reihenfolge', () => {
    expect(generator.topic).toBe('melodie');
    expect(generator.skill).toBe('hoeren');
    expect(generator.filters.map((entry) => entry.label)).toEqual([
      'Skala',
      'Maximale Anzahl Vorzeichen',
      'Länge',
      'Tonumfang',
      'Grösstes Intervall',
      'Schlüssel',
      'Vor Beginn spielen',
      'Tempo',
      `Wiedergaben begrenzen (${LIMITED_PLAYS}×)`,
    ]);
  });

  it('legt die Melodie in die zwei Oktaven des Schlüssels, auch mit dem ganzen Umfang und chromatisch', () => {
    for (const clef of ['treble', 'bass'] as const) {
      const settings: FilterValues[] = [{}, { span: 'zwei-oktaven' }, { scales: ['chromatisch'] }, { scales: ['chromatisch'], span: 'zwei-oktaven' }];
      for (const overrides of settings) {
        for (const question of questions({ ...overrides, clefs: [clef], length: 12 }, 40)) {
          expect(task(question).score.clef).toBe(clef);
          for (const pitch of melodyOf(question)) {
            expect(midi(pitch)).toBeGreaterThanOrEqual(CLEF_WINDOWS[clef].low);
            expect(midi(pitch)).toBeLessThanOrEqual(CLEF_WINDOWS[clef].high);
          }
        }
      }
    }
  });

  it('zeigt einen leeren Platz je Ton, den ersten Ton schon im System', () => {
    for (const question of questions({ length: 6 }, 10)) {
      const { score, solution, points } = task(question);
      const notes = score.measures[0].notes;
      expect(notes).toHaveLength(6);
      expect(notes[0].keys).toHaveLength(1);
      expect(notes.slice(1).every((entry) => entry.placeholder)).toBe(true);
      expect(solution.type === 'pitch' && solution.slots.map((slot) => slot.slot)).toEqual([1, 2, 3, 4, 5]);
      expect(points).toBe(5);
    }
  });

  it('zeichnet in Dur und Moll die Tonart vor und verlangt ihre Schreibweise', () => {
    for (const question of questions({ scales: ['dur'] })) {
      const { score, solution, prompt } = task(question);
      expect(score.keySignature).toBeDefined();
      expect(score.accidentalsByKey).toBe(true);
      expect(prompt).toMatch(/-Dur$/);
      // Jeder Ton steht so, wie die Tonart ihn vorzeichnet.
      const { steps, sign } = keySignatureSteps(accidentalsOfVexKey(score.keySignature!));
      for (const pitch of melodyOf(question)) expect(pitch.alter).toBe(steps.includes(pitch.step) ? sign : 0);
      if (solution.type === 'pitch') for (const slot of solution.slots) expect(slot.accept).toHaveLength(1);
    }
  });

  it('nimmt chromatisch ohne Tonart beide Schreibweisen einer schwarzen Taste, die eigene zuerst', () => {
    let black = 0;
    for (const question of questions({ scales: ['chromatisch'] })) {
      const { score, solution, prompt } = task(question);
      expect(prompt).toBe('Chromatisch');
      expect(score.keySignature).toBeUndefined();
      expect(score.accidentalsByKey).toBeUndefined();
      if (solution.type !== 'pitch') continue;
      for (const slot of solution.slots) {
        const spellings = slot.accept.map(parsePitch);
        expect(new Set(spellings.map(midi)).size).toBe(1);
        if (spellings[0].alter === 0) {
          expect(spellings).toHaveLength(1);
        } else {
          black++;
          expect(spellings).toHaveLength(2);
          expect(spellings.map((pitch) => pitch.alter).sort()).toEqual([-1, 1]);
        }
      }
    }
    expect(black).toBeGreaterThan(0);
  });

  it('gibt einen Punkt je richtigen Ton; ein falscher oder leerer kostet nur seinen', () => {
    for (const question of questions({}, 20)) {
      const possible = task(question).points;
      expect(scoreTask(task(question), answer(question)).earned).toBeCloseTo(possible);
      const oneWrong = answer(question, (pitch, slot) => (slot === 2 ? { ...pitch, octave: pitch.octave + 1 } : pitch));
      expect(scoreTask(task(question), oneWrong).earned).toBeCloseTo(possible - 1);
      const oneEmpty = answer(question, (pitch, slot) => (slot === 1 ? null : pitch));
      expect(scoreTask(task(question), oneEmpty).earned).toBeCloseTo(possible - 1);
      expect(scoreTask(task(question), { n: {} }).earned).toBe(0);
    }
  });

  it('zählt in einer Tonart die andere Schreibweise als falsch, chromatisch als richtig', () => {
    const enharmonic = (pitch: Pitch): Pitch =>
      pitch.alter === 1
        ? { step: 'cdefgab'['cdefgab'.indexOf(pitch.step) + 1] as Pitch['step'], alter: -1, octave: pitch.octave }
        : pitch;
    const sharpKey = questions({ scales: ['dur'] }).find((question) => melodyOf(question).slice(1).some((pitch) => pitch.alter === 1 && pitch.step !== 'e' && pitch.step !== 'b'));
    expect(sharpKey).toBeDefined();
    const keyed = scoreTask(task(sharpKey!), answer(sharpKey!, enharmonic));
    expect(keyed.earned).toBeLessThan(task(sharpKey!).points);

    const chromatic = questions({ scales: ['chromatisch'] }).find((question) => melodyOf(question).slice(1).some((pitch) => pitch.alter === 1 && pitch.step !== 'e' && pitch.step !== 'b'));
    expect(chromatic).toBeDefined();
    expect(scoreTask(task(chromatic!), answer(chromatic!, enharmonic)).earned).toBeCloseTo(task(chromatic!).points);
  });

  it('spielt erst, was vor Beginn gewählt ist, dann die Melodie im Tempo, ohne Einzähler', () => {
    for (const question of questions({ tempo: 120 }, 10)) {
      expect(question.audio).toEqual({ id: question.task.id, kind: 'melody', tempo: 120, countIn: false });
      const melody = melodyOf(question);
      const events = question.melody!;
      const tail = events.slice(-melody.length);
      expect(tail.map((event) => event.pitches.map(midi))).toEqual(melody.map((pitch) => [midi(pitch)]));
      expect(tail.map((event) => event.quarters)).toEqual([...melody.slice(1).map(() => 1), 2]);
      // Vor Beginn: die Kadenz, vier Akkorde, im Tempo 120 doppelt so viele Viertel, dann eine Pause.
      const before = events.slice(0, -melody.length);
      expect(before).toHaveLength(5);
      expect(before.slice(0, 4).every((event) => event.pitches.length === 4)).toBe(true);
      expect(before.map((event) => event.quarters)).toEqual([2, 2, 2, 3, 2]);
      expect(before[4].pitches).toEqual([]);
      expect(question.maxPlays).toBeUndefined();
    }
  });

  it('spielt chromatisch und mit «nichts» nur die Melodie', () => {
    const settings: FilterValues[] = [{ scales: ['chromatisch'] }, { prelude: 'nichts' }];
    for (const overrides of settings) {
      for (const question of questions(overrides, 10)) {
        expect(question.melody).toHaveLength(melodyOf(question).length);
        expect(question.instruction).toBe('Du hörst die Melodie. Notiere sie; der erste Ton steht schon da.');
      }
    }
  });

  it('begrenzt die Wiedergaben auf Wunsch', () => {
    for (const question of questions({ limitPlays: true }, 5)) expect(question.maxPlays).toBe(LIMITED_PLAYS);
  });

  it('erklärt chromatisch die Vorzeichen anders', () => {
    const [keyed] = questions({ scales: ['dur'] }, 1);
    const [chromatic] = questions({ scales: ['chromatisch'] }, 1);
    expect(keyed.hint).toBeUndefined();
    expect(generator.hint).toContain('Die Tonart gilt von selbst');
    expect(chromatic.hint).toContain('beide Schreibweisen');
  });
});
