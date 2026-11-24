/**
 * Tonleitern und Tonarten: Vorzeichen setzen und zuordnen.
 */

import { describe, expect, it } from 'vitest';
import type { NotationTask, SelectTask } from '../content/schema';
import { keySignaturePitches, toGermanPitch } from '../music/theory';
import { judgeKeySignature, scoreTask } from '../scoring';
import { generatorById } from './index';
import { makeRng } from './rng';
import type { FilterValues, Question } from './types';

function generate(id: string, overrides: FilterValues = {}, count = 40): Question[] {
  const generator = generatorById(id);
  if (!generator) throw new Error(`Unbekannte Übung ${id}`);
  return Array.from({ length: count }, (_, seed) =>
    generator.generate({ ...generator.defaults, ...overrides }, makeRng(seed + 1)),
  );
}

describe('Vorzeichen setzen', () => {
  it('kennt die üblichen Stellen der Vorzeichen', () => {
    const names = (accidentals: number, clef: 'treble' | 'bass') =>
      keySignaturePitches(accidentals, clef).map((pitch) => `${pitch.step}${pitch.alter}${pitch.octave}`);
    // Wie im Lehrbuch: Kreuze f² c² g² d² a¹ e² h¹, Be h¹ e² a¹ d² g¹ c² f¹.
    expect(names(7, 'treble')).toEqual(['f15', 'c15', 'g15', 'd15', 'a14', 'e15', 'b14']);
    expect(names(-7, 'treble')).toEqual(['b-14', 'e-15', 'a-14', 'd-15', 'g-14', 'c-15', 'f-14']);
    // Im Bassschlüssel liegen dieselben Stellen zwei Oktaven tiefer.
    expect(names(3, 'bass')).toEqual(['f13', 'c13', 'g13']);
    expect(names(-2, 'bass')).toEqual(['b-12', 'e-13']);
    expect(keySignaturePitches(0, 'treble')).toEqual([]);
    expect(toGermanPitch(keySignaturePitches(1, 'treble')[0])).toBe('fis2');
  });

  it('färbt jedes gesetzte Zeichen nach seiner Stelle in der Reihenfolge', () => {
    // A-Dur: fis cis gis.
    expect(judgeKeySignature(3, { sign: 1, placed: [{ s: 'f', o: 5 }, { s: 'c', o: 5 }, { s: 'g', o: 5 }] })).toEqual({
      correct: true,
      marks: [true, true, true],
    });
    // Vertauscht: nur das erste stimmt.
    expect(judgeKeySignature(3, { sign: 1, placed: [{ s: 'f', o: 5 }, { s: 'g', o: 5 }, { s: 'c', o: 5 }] })).toEqual({
      correct: false,
      marks: [true, false, false],
    });
    // Eines fehlt: was steht, ist richtig, der Satz nicht.
    expect(judgeKeySignature(3, { sign: 1, placed: [{ s: 'f', o: 5 }, { s: 'c', o: 5 }] })).toEqual({
      correct: false,
      marks: [true, true],
    });
    // Falsche Art: alles rot.
    expect(judgeKeySignature(-1, { sign: 1, placed: [{ s: 'b', o: 4 }] })).toEqual({ correct: false, marks: [false] });
    // Ohne Vorzeichen: leer ist richtig, gleich welche Art gewählt ist.
    expect(judgeKeySignature(0, { sign: -1, placed: [] }).correct).toBe(true);
    expect(judgeKeySignature(0, { sign: 1, placed: [{ s: 'f', o: 5 }] })).toEqual({ correct: false, marks: [false] });
  });

  it('bewertet mit derselben Regel', () => {
    for (const question of generate('vorzeichen-setzen', { maxAccidentals: 7 })) {
      const task = question.task as NotationTask;
      if (task.solution.type !== 'keysig') throw new Error('keine Vorzeichenaufgabe');
      const pitches = keySignaturePitches(task.solution.accidentals, task.score.clef === 'bass' ? 'bass' : 'treble');
      const right = { sign: task.solution.accidentals < 0 ? -1 : 1, placed: pitches.map((p) => ({ s: p.step, o: p.octave })) };
      expect(scoreTask(task, { n: right }).earned).toBe(task.points);
      const wrong = { ...right, placed: [...right.placed, { s: 'c', o: 4 }] };
      expect(scoreTask(task, { n: wrong }).earned).toBe(0);
    }
  });
});

describe('Tonarten den Vorzeichen zuordnen', () => {
  it('fragt mit Tonnamen-Rastern, beschriftet mit dem Grundton', () => {
    for (const question of generate('tonarten-zuordnen', { maxAccidentals: 7 })) {
      const task = question.task as SelectTask;
      expect(task.fields.map((field) => field.id)).toEqual(['dur', 'moll']);
      for (const field of task.fields) {
        expect(field.buttons).toBe(true);
        expect(field.buttonLayout).toBe('notes');
        for (const option of field.options ?? []) {
          expect(option.value).toBe(`${option.label}-${field.id === 'dur' ? 'Dur' : 'Moll'}`);
          // Dur gross, Moll klein — wie im Tonartnamen.
          expect(option.label[0]).toBe(field.id === 'dur' ? option.label[0].toUpperCase() : option.label[0].toLowerCase());
        }
      }
    }
  });

  it('fragt nur, was eingestellt ist', () => {
    for (const question of generate('tonarten-zuordnen', { ask: ['moll'] })) {
      expect((question.task as SelectTask).fields.map((field) => field.id)).toEqual(['moll']);
    }
  });
});
