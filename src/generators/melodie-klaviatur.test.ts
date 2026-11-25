/**
 * Gehörte Melodie auf Klaviatur spielen: Klaviatur und System, wie gespielte
 * Tasten dastehen, Punkte je Ton und was erklingt.
 */

import { describe, expect, it } from 'vitest';
import type { KeyboardTask } from '../content/schema';
import { spellPlayedKey } from '../music/piano';
import { midi, parsePitch, toGermanPitch, type Pitch } from '../music/theory';
import { scoreTask } from '../scoring';
import { withShown } from '../ui/FilterFields';
import { generatorById } from './index';
import { CLEF_WINDOWS, LIMITED_PLAYS, keySpelling } from './melodie-shared';
import { makeRng } from './rng';
import type { FilterSpec, FilterValues, Question } from './types';

const generator = generatorById('gehoerte-melodie-klaviatur-spielen')!;

function questions(overrides: FilterValues = {}, count = 80): Question[] {
  return Array.from({ length: count }, (_, seed) => generator.generate({ ...generator.defaults, ...overrides }, makeRng(seed + 1)));
}

const task = (question: Question) => question.task as KeyboardTask;

/** Die ganze Melodie als Tasten, auch die erste. */
const keysOf = (question: Question) => task(question).accept;

const name = (spelling: { step: Pitch['step']; alter: number }) => toGermanPitch({ ...spelling, octave: 4 }).replace(/1$/, '');

describe('Gehörte Melodie auf Klaviatur spielen', () => {
  it('steht im Thema Melodie und hat die Einstellungen des Melodiediktats', () => {
    expect(generator.topic).toBe('melodie');
    expect(generator.skill).toBe('klaviatur');
    const diktat = generatorById('generiertes-melodiediktat')!;
    expect(generator.filters.map((entry) => entry.label)).toEqual(diktat.filters.map((entry) => entry.label));
    expect(generator.defaults).toEqual(diktat.defaults);
    const span = generator.filters.find((entry) => entry.key === 'span') as Extract<FilterSpec, { kind: 'single' }>;
    expect(span.shownOptions!(generator.defaults).slice(-1)[0].label).toBe('Gesamte Klaviatur');
    // Der ganze Umfang geht auch aus anderen Werten nicht verloren.
    expect(withShown(generator.filters, { ...generator.defaults, span: 'klaviatur', scales: ['chromatisch'] }).span).toBe('klaviatur');
  });

  it('zeigt die zwei Oktaven des Schlüssels ohne markierte Taste, den ersten Ton grau im System', () => {
    for (const clef of ['treble', 'bass'] as const) {
      const settings: FilterValues[] = [{}, { span: 'klaviatur', length: 12 }, { scales: ['chromatisch'], span: 'klaviatur' }];
      for (const overrides of settings) {
        for (const question of questions({ ...overrides, clefs: [clef] }, 30)) {
          const { keyboard, score, accept, melody, points } = task(question);
          expect(keyboard.low).toBe(CLEF_WINDOWS[clef].low);
          expect(keyboard.high).toBe(CLEF_WINDOWS[clef].high);
          expect(keyboard.marked ?? []).toHaveLength(0);
          for (const key of keysOf(question)) {
            expect(key).toBeGreaterThanOrEqual(keyboard.low);
            expect(key).toBeLessThanOrEqual(keyboard.high);
          }
          expect(score!.clef).toBe(clef);
          // Der erste Ton grau im System, die übrigen Plätze leer; gespielt
          // und gezählt werden alle.
          const notes = score!.measures[0].notes;
          expect(midi(parsePitch(notes[0].keys![0]))).toBe(accept[0]);
          expect(notes[0].muted).toBe(true);
          expect(notes.slice(1).every((note) => note.placeholder)).toBe(true);
          expect(notes).toHaveLength(accept.length);
          expect(melody!.written.map((key) => midi(parsePitch(key)))).toEqual(accept);
          expect(points).toBe(accept.length);
        }
      }
    }
  });

  it('schreibt gespielte Tasten nach der Tonart, mit ♯ in Kreuz-, ♭ in B-Tonarten', () => {
    const c = parsePitch('c4');
    const dDur = keySpelling([{ step: 'd', alter: 0, octave: 4 }], 2);
    expect(dDur.map(name)).toEqual(['c', 'cis', 'd', 'dis', 'e', 'f', 'fis', 'g', 'gis', 'a', 'ais', 'h']);
    const fDur = keySpelling([{ step: 'f', alter: 0, octave: 4 }], -1);
    expect(fDur.map(name)).toEqual(['c', 'des', 'd', 'es', 'e', 'f', 'ges', 'g', 'as', 'a', 'b', 'h']);
    // d-Moll harmonisch: der Leitton cis aus der Melodie, sonst ♭.
    const dMoll = keySpelling([parsePitch('d4'), parsePitch('c#4'), parsePitch('d4')], -1);
    expect(name(dMoll[1])).toBe('cis');
    expect(name(dMoll[3])).toBe('es');
    // Chromatisch immer ♯, auch wenn die Melodie ♭ schreibt.
    expect(keySpelling([c, parsePitch('db4')], null).map(name)).toEqual(['c', 'cis', 'd', 'dis', 'e', 'f', 'fis', 'g', 'gis', 'a', 'ais', 'h']);
  });

  it('schreibt eine richtige Taste wie die Melodie, eine falsche nach der Tonart, in der richtigen Oktave', () => {
    const melody = { written: ['db5', 'e#4'], spelling: keySpelling([], 7) };
    expect(spellPlayedKey(melody, [73, 65], 0, 73)).toEqual(parsePitch('db5'));
    expect(spellPlayedKey(melody, [73, 65], 1, 65)).toEqual(parsePitch('e#4'));
    // In Cis-Dur ist c die Taste his: eine Oktave unter dem c, das klingt.
    expect(spellPlayedKey(melody, [73, 65], 0, 72)).toEqual({ step: 'b', alter: 1, octave: 4 });
    expect(spellPlayedKey(melody, [73, 65], 0, 61)).toEqual({ step: 'c', alter: 1, octave: 4 });
  });

  it('gibt einen Punkt je richtigen Ton; ein falscher oder fehlender kostet nur seinen', () => {
    for (const question of questions({}, 20)) {
      const { accept, points } = task(question);
      expect(scoreTask(task(question), { keys: accept }).earned).toBeCloseTo(points);
      const oneWrong = accept.map((key, index) => (index === 1 ? key + 1 : key));
      expect(scoreTask(task(question), { keys: oneWrong }).earned).toBeCloseTo(points - 1);
      // Auch der erste Ton zählt.
      const firstWrong = accept.map((key, index) => (index === 0 ? key + 1 : key));
      expect(scoreTask(task(question), { keys: firstWrong }).earned).toBeCloseTo(points - 1);
      expect(scoreTask(task(question), { keys: accept.slice(0, -1) }).earned).toBeCloseTo(points - 1);
      // Ein Ton zu früh verschiebt alles danach: die Plätze zählen, nicht die Töne.
      expect(scoreTask(task(question), { keys: accept.slice(1) }).earned).toBeLessThan(points - 1);
      expect(scoreTask(task(question), { keys: [] }).earned).toBe(0);
    }
  });

  it('nennt in der Rückmeldung Gespieltes und Richtiges mit Tonnamen', () => {
    const [question] = questions({ scales: ['dur'] }, 1);
    const { accept, melody } = task(question);
    const details = scoreTask(task(question), { keys: [accept[0] + 1] }).details;
    expect(details).toHaveLength(accept.length);
    expect(details[0].correct).toBe(false);
    expect(details[0].correctResponse).toBe(toGermanPitch(parsePitch(melody!.written[0])));
    expect(details[0].studentResponse).not.toBe('—');
    expect(details[1].studentResponse).toBe('—');
  });

  it('spielt erst, was vor Beginn gewählt ist, dann die Melodie; begrenzt auf Wunsch', () => {
    for (const question of questions({ limitPlays: true }, 10)) {
      expect(question.audio).toMatchObject({ kind: 'melody', countIn: false, tempo: generator.defaults.tempo });
      const tail = question.melody!.slice(-keysOf(question).length);
      expect(tail.map((event) => midi(event.pitches[0]))).toEqual(keysOf(question));
      expect(question.maxPlays).toBe(LIMITED_PLAYS);
    }
  });
});
