/**
 * Tonleitern und Tonarten: die Tonleitern selbst, Vorzeichen setzen und
 * zuordnen, Halbtonschritte, Hören.
 */

import { describe, expect, it } from 'vitest';
import { expandAudioItem } from '../content/audio';
import type { NotationTask, SelectTask } from '../content/schema';
import {
  SCALE_TYPES,
  scaleName,
  scalePitches,
  scaleSignature,
  scaleTonics,
  type ScaleType,
} from '../music/scales';
import { CIRCLE_OF_FIFTHS, germanNoteName, keySignaturePitches, midi, parsePitch, toGermanPitch } from '../music/theory';
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

/**
 * Halbtonschritte aufwärts, wie im Lehrbuch — bewusst noch einmal
 * ausgeschrieben, damit der Test eine zweite Meinung ist.
 */
const STEPS_UP: Record<ScaleType, number[]> = {
  dur: [2, 2, 1, 2, 2, 2, 1],
  'moll-natuerlich': [2, 1, 2, 2, 1, 2, 2],
  'moll-harmonisch': [2, 1, 2, 2, 1, 3, 1],
  'moll-melodisch': [2, 1, 2, 2, 2, 2, 1],
  dorisch: [2, 1, 2, 2, 2, 1, 2],
  phrygisch: [1, 2, 2, 2, 1, 2, 2],
  lydisch: [2, 2, 2, 1, 2, 2, 1],
  mixolydisch: [2, 2, 1, 2, 2, 1, 2],
  lokrisch: [1, 2, 2, 1, 2, 2, 2],
};

const name = (pitch: { step: Parameters<typeof germanNoteName>[0]; alter: number }) =>
  germanNoteName(pitch.step, pitch.alter);

describe('Tonleitern', () => {
  it('haben die Halbtonschritte aus dem Lehrbuch, auf jedem Grundton', () => {
    for (const type of SCALE_TYPES) {
      for (const tonic of scaleTonics(type, 7)) {
        const up = scalePitches(tonic, type).map(midi);
        expect(up.slice(1).map((value, index) => value - up[index])).toEqual(STEPS_UP[type]);
        // Jeder Stammton genau einmal, dann die Oktave.
        const steps = scalePitches(tonic, type).map((pitch) => pitch.step);
        expect(new Set(steps.slice(0, 7)).size).toBe(7);
        expect(steps[7]).toBe(steps[0]);
      }
    }
  });

  it('gehen abwärts von der Oktave zum Grundton, melodisch Moll natürlich', () => {
    const a = parsePitch('a3');
    expect(scalePitches(a, 'moll-melodisch', 'up').map(toGermanPitch).join(' ')).toBe('a h c1 d1 e1 fis1 gis1 a1');
    expect(scalePitches(a, 'moll-melodisch', 'down').map(toGermanPitch).join(' ')).toBe('a1 g1 f1 e1 d1 c1 h a');
    expect(scalePitches(a, 'moll-harmonisch', 'down').map(toGermanPitch).join(' ')).toBe('a1 gis1 f1 e1 d1 c1 h a');
  });

  it('stehen auf den Grundtönen der Tonarten mit höchstens so vielen Vorzeichen', () => {
    const names = (type: ScaleType, max: number) => scaleTonics(type, max).map(name).sort();
    expect(names('dur', 7)).toEqual(CIRCLE_OF_FIFTHS.map((key) => key.major.replace('-Dur', '')).sort());
    expect(names('moll-natuerlich', 7)).toEqual(
      CIRCLE_OF_FIFTHS.map((key) => key.minor.replace('-Moll', '')).map((n) => n[0].toUpperCase() + n.slice(1)).sort(),
    );
    // Kirchentonarten ohne Vorzeichen: die weissen Tasten.
    expect(names('dorisch', 0)).toEqual(['D']);
    expect(names('phrygisch', 0)).toEqual(['E']);
    expect(names('lydisch', 0)).toEqual(['F']);
    expect(names('mixolydisch', 0)).toEqual(['G']);
    expect(names('lokrisch', 0)).toEqual(['H']);
    expect(names('dorisch', 1)).toEqual(['A', 'D', 'G']);
    // Ohne Doppelkreuz: gis-, dis- und ais-Moll harmonisch bräuchten eines.
    const harmonic = names('moll-harmonisch', 7);
    for (const missing of ['Gis', 'Dis', 'Ais']) expect(harmonic).not.toContain(missing);
    expect(names('moll-natuerlich', 7)).toContain('Gis');
    for (const type of SCALE_TYPES) {
      for (const tonic of scaleTonics(type, 7)) {
        for (const direction of ['up', 'down'] as const) {
          expect(scalePitches(tonic, type, direction).every((pitch) => Math.abs(pitch.alter) <= 1)).toBe(true);
        }
      }
    }
  });

  it('tragen die Vorzeichen ihrer Tonart', () => {
    const signature = (type: ScaleType, key: string) => scaleSignature(type, parsePitch(key));
    expect(signature('dur', 'es4')).toBe(-3);
    expect(signature('moll-harmonisch', 'c4')).toBe(-3);
    expect(signature('dorisch', 'g4')).toBe(-1);
    expect(signature('lydisch', 'hes4')).toBe(-1);
    expect(signature('lydisch', 'b4')).toBe(6);
    expect(signature('lokrisch', 'fis4')).toBe(1);
    expect(signature('dur', 'fes4')).toBeNull();
  });

  it('heissen wie im Lehrbuch', () => {
    expect(scaleName('dur', parsePitch('es4'))).toBe('Es-Dur');
    expect(scaleName('moll-harmonisch', parsePitch('c4'))).toBe('c-Moll harmonisch');
    expect(scaleName('moll-natuerlich', parsePitch('fis4'))).toBe('fis-Moll natürlich');
    expect(scaleName('dorisch', parsePitch('d4'))).toBe('D-dorisch');
  });
});

describe('Halbtonschritte markieren', () => {
  it('markiert die Halbtonschritte aller Arten, auch abwärts', () => {
    const questions = generate(
      'halbtonschritte-markieren',
      { scales: SCALE_TYPES, maxAccidentals: 5, directions: ['up', 'down'], clefs: ['treble', 'bass'] },
      80,
    );
    for (const question of questions) {
      const task = question.task as NotationTask;
      if (task.solution.type !== 'mark') throw new Error('keine Markieraufgabe');
      const pitches = task.score.measures[0].notes.map((note) => midi(parsePitch(note.keys![0])));
      expect(pitches).toHaveLength(8);
      const semitones = pitches.slice(1).map((value, index) => Math.abs(value - pitches[index]));
      expect(task.solution.gaps).toEqual(semitones.flatMap((step, index) => (step === 1 ? [index] : [])));
    }
  });
});

describe('Tonleitern hörend erkennen', () => {
  it('bietet die Kirchentonarten an, schaltet sie aber nicht ein', () => {
    const generator = generatorById('tonleitern-hoeren')!;
    const filter = generator.filters.find((spec) => spec.key === 'scaleTypes');
    expect(filter?.kind === 'multi' && filter.options.map((option) => option.value)).toEqual(SCALE_TYPES);
    expect(generator.defaults.scaleTypes).toEqual(['dur', 'moll-natuerlich', 'moll-harmonisch', 'moll-melodisch']);
  });

  it('lässt abwärts natürlich und melodisch Moll beide gelten — sie klingen gleich', () => {
    const questions = generate('tonleitern-hoeren', { directions: ['down'], tonic: 'zufaellig' }, 60);
    let twins = 0;
    for (const question of questions) {
      const field = (question.task as SelectTask).fields[0];
      const audio = question.audio;
      if (audio?.kind !== 'scale') throw new Error('keine Tonleiter');
      const sounding = expandAudioItem(audio).map((event) => midi(event.pitches[0]));
      if (field.correct === 'moll-natuerlich' || field.correct === 'moll-melodisch') {
        twins++;
        expect(field.alsoCorrect).toEqual([field.correct === 'moll-natuerlich' ? 'moll-melodisch' : 'moll-natuerlich']);
        const natural = scalePitches(parsePitch(audio.tonic), 'moll-natuerlich', 'down').map(midi);
        expect(sounding).toEqual(natural);
      } else {
        expect(field.alsoCorrect).toBeUndefined();
      }
    }
    expect(twins).toBeGreaterThan(0);
  });
});

describe('Tonleitern notieren', () => {
  it('gibt den Grundton vor und verlangt die übrigen sieben Töne der Leiter', () => {
    const questions = generate(
      'tonleitern-notieren',
      { scales: SCALE_TYPES, maxAccidentals: 7, directions: ['up', 'down'], clefs: ['treble', 'bass'] },
      120,
    );
    for (const question of questions) {
      const task = question.task as NotationTask;
      if (task.solution.type !== 'pitch') throw new Error('keine Noteneingabe');
      const notes = task.score.measures[0].notes;
      expect(notes).toHaveLength(8);
      expect(notes[0].keys).toHaveLength(1);
      expect(notes.slice(1).every((note) => note.placeholder)).toBe(true);
      const scale = [notes[0].keys![0], ...task.solution.slots.map((slot) => slot.accept[0])].map(parsePitch);
      // Ganz richtig: volle Punkte; ein Ton daneben: einer weniger.
      const answer = (keys: string[]) =>
        Object.fromEntries(
          task.solution.type === 'pitch'
            ? task.solution.slots.map((slot, index) => {
                const pitch = parsePitch(keys[index]);
                return [String(slot.slot), [{ s: pitch.step, o: pitch.octave, a: pitch.alter, d: 'w' }]];
              })
            : [],
        );
      const right = task.solution.slots.map((slot) => slot.accept[0]);
      expect(scoreTask(task, { n: answer(right) }).earned).toBe(7);
      // Ein Vorzeichen daneben kostet genau diesen Ton.
      const slipped = task.solution.slots.map((slot) => {
        const pitch = parsePitch(slot.accept[0]);
        return { s: pitch.step, o: pitch.octave, a: pitch.alter, d: 'w' };
      });
      slipped[2] = { ...slipped[2], a: slipped[2].a === 1 ? 0 : slipped[2].a + 1 };
      const placed = Object.fromEntries(task.solution.slots.map((slot, index) => [String(slot.slot), [slipped[index]]]));
      expect(scoreTask(task, { n: placed }).earned).toBe(6);
      // Die Leiter selbst: aufwärts oder abwärts, jeder Schritt eine Stufe.
      const up = task.prompt!.endsWith('aufwärts');
      const values = scale.map(midi);
      for (let index = 1; index < 8; index++) {
        expect(Math.sign(values[index] - values[index - 1])).toBe(up ? 1 : -1);
      }
      expect(Math.abs(values[7] - values[0])).toBe(12);
    }
  });
});

describe('Tonleitern auf Klaviatur markieren', () => {
  it('markiert den Grundton und verlangt genau die übrigen Tasten bis zur Oktave', () => {
    const questions = generate(
      'tonleitern-klaviatur',
      { scales: SCALE_TYPES, maxAccidentals: 7, directions: ['up', 'down'] },
      120,
    );
    for (const question of questions) {
      const task = question.task as import('../content/schema').KeyboardTask;
      expect(task.scale).toBe(true);
      const [tonic] = task.keyboard.marked!;
      expect(task.accept).toHaveLength(7);
      expect(task.accept).not.toContain(tonic);
      const all = [tonic, ...task.accept];
      expect(all.every((key) => key >= task.keyboard.low && key <= task.keyboard.high)).toBe(true);
      // Aufwärts liegt alles darüber, abwärts darunter; die Oktave gehört dazu.
      const up = task.prompt!.endsWith('aufwärts');
      expect(task.accept.every((key) => (up ? key > tonic : key < tonic))).toBe(true);
      expect(task.accept).toContain(up ? tonic + 12 : tonic - 12);
      expect(scoreTask(task, { keys: [...task.accept].reverse() }).earned).toBe(task.points);
      expect(scoreTask(task, { keys: task.accept.slice(1) }).earned).toBe(0);
      expect(scoreTask(task, { keys: [...task.accept, tonic + (up ? 13 : -13)] }).earned).toBe(0);
    }
  });
});
