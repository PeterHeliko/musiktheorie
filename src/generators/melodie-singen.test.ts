/**
 * Generierte Melodie singen: die Melodie selbst, grobe und feine Intervalle,
 * chromatisch, «Vor Beginn spielen» und die Bewertung.
 */

import { describe, expect, it } from 'vitest';
import type { SingTask } from '../content/schema';
import { MAJOR_MINOR, scaleName, scaleSignature } from '../music/scales';
import { accidentalsOfVexKey, diatonicIndex, midi, parsePitch, type Pitch } from '../music/theory';
import { scoreTask } from '../scoring';
import { VOICE_RANGES } from '../sing/voice';
import { withShown } from '../ui/FilterFields';
import { generatorById } from './index';
import { cadence, melodyPitches, spell } from './melodie-singen';
import { makeRng } from './rng';
import type { FilterSpec, FilterValues } from './types';

const generator = generatorById('generierte-melodie-singen')!;

function questions(overrides: FilterValues = {}, count = 60, voice: 'hoch' | 'mittel' | 'tief' = 'mittel') {
  return Array.from({ length: count }, (_, seed) =>
    generator.generate({ ...generator.defaults, ...overrides }, makeRng(seed + 1), { voice }),
  );
}

function tasks(overrides: FilterValues = {}, count = 60, voice: 'hoch' | 'mittel' | 'tief' = 'mittel'): SingTask[] {
  return questions(overrides, count, voice).map((question) => question.task as SingTask);
}

const pitches = (task: SingTask): Pitch[] => task.sequence!.map(parsePitch);
const leaps = (task: SingTask) =>
  pitches(task)
    .slice(1)
    .map((pitch, index, all) => {
      const before = index === 0 ? pitches(task)[0] : all[index - 1];
      return {
        steps: Math.abs(diatonicIndex(pitch) - diatonicIndex(before)),
        semitones: Math.abs(midi(pitch) - midi(before)),
      };
    });

const filter = (key: string) => generator.filters.find((entry) => entry.key === key) as Extract<FilterSpec, { kind: 'single' }>;
const shownLabels = (key: string, values: FilterValues) =>
  filter(key).shownOptions!({ ...generator.defaults, ...values }).map((option) => option.label);

describe('Generierte Melodie singen', () => {
  it('steht im Thema Melodie und hat die Einstellungen in dieser Reihenfolge, ohne Hinweise', () => {
    expect(generator.topic).toBe('melodie');
    expect(generator.skill).toBe('singen');
    expect(generator.filters.map((entry) => entry.label)).toEqual([
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
    expect(filter('maxLeap').hint).toBeUndefined();
    expect(filter('prelude').hint).toBeUndefined();
    expect(generator.defaults.prelude).toBe('kadenz');
    expect(generator.defaults.metronome).toBe('aus');
  });

  it('zeigt grobe Intervalle, mit chromatisch feine', () => {
    expect(shownLabels('span', {})).toEqual(['Terz', 'Quarte', 'Quinte', 'Sexte', 'Septime', 'Oktave', 'Gesamte Stimmlage']);
    expect(shownLabels('maxLeap', {})).toEqual(['Sekunde', 'Terz', 'Quarte', 'Quinte', 'Sexte', 'Septime', 'Oktave']);
    const chromatic = { scales: ['dur', 'chromatisch'] };
    expect(shownLabels('span', chromatic)).toEqual([
      'kleine Terz', 'grosse Terz', 'Quarte', 'Tritonus', 'Quinte', 'kleine Sexte', 'grosse Sexte',
      'kleine Septime', 'grosse Septime', 'Oktave', 'Gesamte Stimmlage',
    ]);
    expect(shownLabels('maxLeap', chromatic)).toHaveLength(12);
  });

  it('rechnet beim Umschalten die Wahl um: Terz wird grosse Terz und zurück', () => {
    const coarse = { ...generator.defaults, span: '2', maxLeap: '4' };
    const fine = withShown(generator.filters, { ...coarse, scales: ['dur', 'chromatisch'] });
    expect(fine).toMatchObject({ span: 'g3', maxLeap: 'r5' });
    expect(withShown(generator.filters, { ...fine, scales: ['dur'] })).toMatchObject({ span: '2', maxLeap: '4' });
    // Die ganze Stimmlage bleibt die ganze Stimmlage.
    expect(withShown(generator.filters, { ...coarse, span: 'stimmlage', scales: ['chromatisch'] }).span).toBe('stimmlage');
  });

  it('würfelt Melodien in der Länge, die mit dem Grundton enden, ohne gleichen Ton', () => {
    for (const length of [4, 8, 12]) {
      for (const maxLeap of ['1', '2', '4', '6', '7']) {
        for (const task of tasks({ length, maxLeap, maxAccidentals: 7 }, 30)) {
          expect(pitches(task)).toHaveLength(length);
          expect(task.reference).toBe(task.sequence![0]);
          for (const { steps } of leaps(task)) {
            expect(steps).toBeLessThanOrEqual(Number(maxLeap));
            // Nur in Sekunden mit gerader Länge geht es nicht ohne Wiederholung.
            if (maxLeap !== '1' || length % 2 === 1) expect(steps).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it('springt auch Tritonus und Septime, wo das Intervall es erlaubt', () => {
    const all = tasks({ maxLeap: '7', maxAccidentals: 7 }, 200).flatMap(leaps);
    expect(all.some(({ steps, semitones }) => steps > 1 && semitones % 12 === 6)).toBe(true);
    expect(all.some(({ steps }) => steps === 6)).toBe(true);
  });

  it('hält mit feinen Intervallen die Halbtöne ein, auch in Dur und Moll; Sekunden gehen immer', () => {
    for (const [maxLeap, limit] of [['k3', 3], ['g3', 4], ['tritonus', 6], ['r5', 7]] as const) {
      for (const task of tasks({ scales: [...MAJOR_MINOR, 'chromatisch'], maxLeap, maxAccidentals: 7 }, 60)) {
        for (const { steps, semitones } of leaps(task)) {
          if (task.prompt === 'Chromatisch' || steps > 1) expect(semitones).toBeLessThanOrEqual(limit);
        }
      }
    }
    // Ein grober Wert aus einem alten Link gilt als sein Gegenstück: Terz = grosse Terz.
    for (const task of tasks({ scales: ['chromatisch'], maxLeap: '2' }, 30)) {
      for (const { semitones } of leaps(task)) expect(semitones).toBeLessThanOrEqual(4);
    }
  });

  it('bleibt im Tonumfang', () => {
    for (const task of tasks({ scales: ['dur'], span: '4', maxAccidentals: 7 }, 40)) {
      const steps = pitches(task).map(diatonicIndex);
      expect(Math.max(...steps) - Math.min(...steps)).toBeLessThanOrEqual(4);
    }
    for (const [span, limit] of [['k3', 3], ['tritonus', 6], ['r8', 12]] as const) {
      for (const task of tasks({ scales: ['dur', 'moll-melodisch', 'chromatisch'], span, maxLeap: 'r8' }, 40)) {
        const values = pitches(task).map(midi);
        expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(limit);
      }
    }
  });

  it('nutzt mit «Gesamte Stimmlage» die ganze Lage und bleibt darin', () => {
    for (const voice of ['hoch', 'mittel', 'tief'] as const) {
      const range = VOICE_RANGES[voice];
      for (const scales of [['dur', 'moll-melodisch'], ['chromatisch']]) {
        const all = tasks({ scales, span: 'stimmlage', maxLeap: scales[0] === 'chromatisch' ? 'r5' : '4', length: 12 }, 40, voice);
        const values = all.flatMap((task) => pitches(task).map(midi));
        expect(Math.min(...values)).toBeGreaterThanOrEqual(range.low);
        expect(Math.max(...values)).toBeLessThanOrEqual(range.high);
        // Über alle Aufgaben reicht sie fast von unten bis oben.
        expect(Math.max(...values) - Math.min(...values)).toBeGreaterThanOrEqual(range.high - range.low - 3);
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
        expect(midi(parsePitch(task.target)) % 12).toBe(midi(tonic) % 12);
        const type = MAJOR_MINOR.find((scale) => scaleName(scale, tonic) === task.prompt)!;
        expect(accidentalsOfVexKey(task.score.keySignature!)).toBe(scaleSignature(type, tonic));
      }
    }
  });

  it('singt chromatisch ganz frei: ohne Tonart, ohne Einstimmung, ♯ aufwärts und ♭ abwärts', () => {
    const all = questions({ scales: ['chromatisch'], span: 'r8', maxLeap: 'g3' }, 60);
    const ends = new Set<number>();
    for (const question of all) {
      const task = question.task as SingTask;
      expect(task.prompt).toBe('Chromatisch');
      expect(task.score.keySignature).toBeUndefined();
      expect(task.prelude).toBeUndefined();
      expect(question.instruction).toMatch(/^Du hörst den Anfangston\./);
      const melody = pitches(task);
      melody.forEach((pitch, index) => {
        if (index > 0) expect(midi(pitch)).not.toBe(midi(melody[index - 1]));
        if (pitch.alter === 0) return;
        const before = index > 0 ? melody[index - 1] : melody[1];
        const rising = index > 0 ? midi(pitch) > midi(before) : midi(before) > midi(pitch);
        expect(pitch.alter).toBe(rising ? 1 : -1);
      });
      ends.add(midi(melody[melody.length - 1]) % 12);
    }
    // Kein Grundton: die Melodien enden auf verschiedenen Tönen.
    expect(ends.size).toBeGreaterThan(4);
  });

  it('schreibt chromatische Töne nach der Richtung', () => {
    const names = spell([60, 61, 62, 61, 60, 66, 65]).map((pitch) => `${pitch.step}${pitch.alter}`);
    expect(names).toEqual(['c0', 'c1', 'd0', 'd-1', 'c0', 'f1', 'f0']);
  });

  it('sperrt Vorzeichen und Vor Beginn spielen, wenn nur chromatisch gewählt ist', () => {
    const only = { ...generator.defaults, scales: ['chromatisch'] };
    expect(generator.filters.find((entry) => entry.key === 'maxAccidentals')!.disabledBy!(only)).not.toBeNull();
    expect(filter('prelude').disabledBy!(only)).not.toBeNull();
    expect(filter('prelude').disabledBy!({ ...only, scales: ['dur', 'chromatisch'] })).toBeNull();
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
    for (const task of tasks({ scales: ['dur', 'chromatisch'] }, 30)) {
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
