/**
 * Generierte Melodie singen: die Melodie selbst, «Vor Beginn spielen» und die
 * Bewertung.
 */

import { describe, expect, it } from 'vitest';
import type { SingTask } from '../content/schema';
import { MAJOR_MINOR, scaleName, scaleSignature } from '../music/scales';
import { accidentalsOfVexKey, diatonicIndex, midi, parsePitch, type Pitch } from '../music/theory';
import { scoreTask } from '../scoring';
import { VOICE_RANGES } from '../sing/voice';
import { generatorById } from './index';
import { cadence, melodyPitches } from './melodie-singen';
import { makeRng } from './rng';
import type { FilterValues } from './types';

const generator = generatorById('generierte-melodie-singen')!;

function tasks(overrides: FilterValues = {}, count = 60, voice: 'hoch' | 'mittel' | 'tief' = 'mittel'): SingTask[] {
  return Array.from(
    { length: count },
    (_, seed) => generator.generate({ ...generator.defaults, ...overrides }, makeRng(seed + 1), { voice }).task as SingTask,
  );
}

const pitches = (task: SingTask): Pitch[] => task.sequence!.map(parsePitch);

describe('Generierte Melodie singen', () => {
  it('steht im Thema Melodie und hat die Einstellungen in dieser Reihenfolge', () => {
    expect(generator.topic).toBe('melodie');
    expect(generator.skill).toBe('singen');
    expect(generator.filters.map((filter) => filter.label)).toEqual([
      'Skala',
      'Maximale Anzahl Vorzeichen',
      'Länge',
      'Tonumfang',
      'Grösstes Intervall',
      'Schlüssel',
      'Vor Beginn spielen',
      'Genauigkeit',
      'Metronom',
    ]);
    expect(generator.defaults.prelude).toBe('kadenz');
    expect(generator.defaults.metronome).toBe('aus');
  });

  it('würfelt Melodien in der Länge, die mit dem Grundton enden, ohne Tritonus, Septime und gleichen Ton', () => {
    for (const length of [4, 8, 12]) {
      for (const maxLeap of ['1', '2', '4', '7']) {
        for (const task of tasks({ length, maxLeap, maxAccidentals: 7 }, 30)) {
          const melody = pitches(task);
          expect(melody).toHaveLength(length);
          expect(task.reference).toBe(task.sequence![0]);
          expect(task.target).toBe(task.sequence![length - 1]);
          for (let index = 1; index < melody.length; index++) {
            const steps = Math.abs(diatonicIndex(melody[index]) - diatonicIndex(melody[index - 1]));
            const semitones = Math.abs(midi(melody[index]) - midi(melody[index - 1]));
            expect(steps).toBeLessThanOrEqual(Number(maxLeap));
            // Nur in Sekunden mit gerader Länge geht es nicht ohne Wiederholung.
            if (maxLeap !== '1' || length % 2 === 1) expect(steps).toBeGreaterThan(0);
            expect(steps).not.toBe(6);
            if (steps > 1) expect(semitones % 12).not.toBe(6);
          }
        }
      }
    }
  });

  it('liegt in der Stimmlage und steht mit den Vorzeichen der Tonart da', () => {
    for (const voice of ['hoch', 'mittel', 'tief'] as const) {
      const range = VOICE_RANGES[voice];
      for (const task of tasks({ span: '7', maxAccidentals: 7 }, 40, voice)) {
        const values = pitches(task).map(midi);
        // Eine Oktave Umfang passt nicht in jeder Lage ganz hinein; die Melodie
        // ragt dann so wenig wie nötig hinaus (placeInVoice).
        expect(Math.min(...values)).toBeGreaterThanOrEqual(range.low - 3);
        expect(Math.max(...values)).toBeLessThanOrEqual(range.high + 3);
        expect(task.notated).toBe(true);
        expect(task.score.accidentalsByKey).toBe(true);
        expect(task.score.measures[0].notes.map((note) => note.keys![0])).toEqual(task.sequence);
        const tonic = { ...parsePitch(task.target), octave: 4 };
        const type = MAJOR_MINOR.find((scale) => scaleName(scale, tonic) === task.prompt)!;
        expect(accidentalsOfVexKey(task.score.keySignature!)).toBe(scaleSignature(type, tonic));
      }
    }
  });

  it('nimmt bei melodisch Moll aufwärts die erhöhte, abwärts die natürliche Sexte und Septime', () => {
    const a: Pitch = { step: 'a', alter: 0, octave: 4 };
    // a h c d e fis gis a, dann a g f e.
    const up = melodyPitches([0, 1, 2, 3, 4, 5, 6, 7, 6, 5, 4], 'moll-melodisch', a);
    expect(up.map((pitch) => `${pitch.step}${pitch.alter}`)).toEqual([
      'a0', 'b0', 'c0', 'd0', 'e0', 'f1', 'g1', 'a0', 'g0', 'f0', 'e0',
    ]);
  });

  it('spielt vor dem Anfangston, was eingestellt ist', () => {
    const [nothing] = tasks({ prelude: 'nichts' }, 1);
    expect(nothing.prelude).toBeUndefined();
    const [root] = tasks({ prelude: 'root' }, 1);
    expect(root.prelude).toHaveLength(1);
    expect(midi(parsePitch(root.prelude![0].pitches[0])) % 12).toBe(midi(parsePitch(root.target)) % 12);
    const [steps] = tasks({ prelude: 'stufen' }, 1);
    expect(steps.prelude).toHaveLength(9);
    const [chord] = tasks({ prelude: 'akkord' }, 1);
    expect(chord.prelude).toHaveLength(1);
    expect(chord.prelude![0].pitches).toHaveLength(3);
    const [broken] = tasks({ prelude: 'akkord-gebrochen' }, 1);
    expect(broken.prelude!.map((sound) => sound.pitches.length)).toEqual([1, 1, 1]);
  });

  it('nennt in der Anweisung, was vorher erklingt', () => {
    const plain = generator.generate({ ...generator.defaults, prelude: 'nichts' }, makeRng(3));
    expect(plain.instruction).toMatch(/^Du hörst den Anfangston\./);
    // Die Vorgabe (Kadenz) steht schon in der Anweisung der Übung.
    expect(generator.generate(generator.defaults, makeRng(3)).instruction).toBeUndefined();
    expect(generator.generate({ ...generator.defaults, metronome: '80' }, makeRng(3)).instruction).toMatch(/Metronom/);
  });

  it('führt die Kadenz I IV V I vierstimmig in Oktavlage, im Klavierumfang', () => {
    const c: Pitch = { step: 'c', alter: 0, octave: 4 };
    const names = (chord: Pitch[]) => chord.map((pitch) => `${pitch.step}${pitch.alter ? (pitch.alter > 0 ? '#' : 'b') : ''}${pitch.octave}`);
    expect(cadence('dur', c, [c]).map(names)).toEqual([
      ['c3', 'e4', 'g4', 'c5'],
      ['f3', 'f4', 'a4', 'c5'],
      ['g3', 'd4', 'g4', 'b4'],
      ['c3', 'e4', 'g4', 'c5'],
    ]);
    // Moll: iv in Moll, die Dominante mit Leitton.
    expect(cadence('moll-natuerlich', c, [c]).map(names)).toEqual([
      ['c3', 'eb4', 'g4', 'c5'],
      ['f3', 'f4', 'ab4', 'c5'],
      ['g3', 'd4', 'g4', 'b4'],
      ['c3', 'eb4', 'g4', 'c5'],
    ]);
    for (const voice of ['hoch', 'mittel', 'tief'] as const) {
      for (const task of tasks({ maxAccidentals: 7 }, 30, voice)) {
        expect(task.prelude).toHaveLength(4);
        for (const sound of task.prelude!) {
          expect(sound.pitches).toHaveLength(4);
          for (const key of sound.pitches) {
            expect(midi(parsePitch(key))).toBeGreaterThanOrEqual(36);
            expect(midi(parsePitch(key))).toBeLessThanOrEqual(84);
          }
        }
      }
    }
  });

  it('bewertet Ton für Ton: ein früherer Ton statt des verlangten ist falsch', () => {
    for (const task of tasks({}, 30)) {
      const values = pitches(task).map(midi);
      expect(scoreTask(task, { notes: values }).earned).toBe(task.points);
      // Eine Oktave tiefer, ohne den Anfangston: richtig.
      expect(scoreTask(task, { notes: values.slice(1).map((value) => value - 12) }).earned).toBe(task.points);
      // Statt des dritten Tons der erste, dann richtig weiter: falsch.
      if (values[2] % 12 !== values[0] % 12 && values[1] % 12 !== values[0] % 12) {
        expect(scoreTask(task, { notes: [values[0], values[1], values[0], ...values.slice(2)] }).earned).toBe(0);
      }
    }
  });

  it('bewertet mit Metronom Schlag für Schlag', () => {
    for (const task of tasks({ metronome: '60' }, 10)) {
      expect(task.tempo).toBe(60);
      const values = pitches(task).map(midi);
      expect(scoreTask(task, { notes: [], beats: values }).earned).toBe(task.points);
      expect(scoreTask(task, { notes: [], beats: [...values.slice(0, -1), null] }).earned).toBe(0);
    }
  });
});
