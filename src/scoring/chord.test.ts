/**
 * Frei gespielte und gesetzte Akkorde — die Regel an Hand von Fällen, die man
 * nachspielen kann. D-Dur ist d fis a; Tasten: d¹ = 62, fis¹ = 66, a¹ = 69.
 */

import { describe, expect, it } from 'vitest';
import type { ChordRule } from '../content/schema';
import { chordExamples } from '../music/piano';
import { parsePitch } from '../music/theory';
import { describeChordRule, judgeChordKeys, judgeChordNotes } from './chord';

const D_DUR = ['d4', 'fis4', 'a4'];
const notes = (keys: string) => keys.split(' ').map(parsePitch);

describe('Akkord auf der Klaviatur', () => {
  const sextakkord: ChordRule = { tones: D_DUR, lowest: 1 };

  it('nimmt jede Lage mit dem verlangten Ton unten', () => {
    expect(judgeChordKeys(sextakkord, [54, 57, 62]).correct).toBe(true); // fis a d¹
    expect(judgeChordKeys(sextakkord, [54, 62, 69]).correct).toBe(true); // fis d¹ a¹, weit
    expect(judgeChordKeys(sextakkord, [54, 57, 62, 66]).correct).toBe(true); // fis verdoppelt
  });

  it('verlangt den richtigen Ton unten', () => {
    const judged = judgeChordKeys(sextakkord, [50, 54, 57]); // d fis a
    expect(judged.correct).toBe(false);
    expect(judged.problems).toEqual(['lowest']);
    expect(judged.marks).toEqual(['wrong', 'right', 'right']);
  });

  it('verlangt alle drei Töne und keinen anderen', () => {
    expect(judgeChordKeys(sextakkord, [54, 57]).problems).toEqual(['missing']);
    const foreign = judgeChordKeys(sextakkord, [54, 57, 62, 64]);
    expect(foreign.problems).toEqual(['foreign']);
    expect(foreign.marks).toEqual(['right', 'right', 'right', 'wrong']);
    expect(judgeChordKeys(sextakkord, []).correct).toBe(false);
  });

  it('kennt auf der Taste keine Schreibweise: ges ist fis', () => {
    expect(judgeChordKeys({ tones: D_DUR }, [62, 66, 69]).correct).toBe(true);
  });

  it('prüft die Lage am höchsten Ton', () => {
    const terzlage: ChordRule = { tones: D_DUR, highest: 1 };
    expect(judgeChordKeys(terzlage, [57, 62, 66]).correct).toBe(true); // a d¹ fis¹
    expect(judgeChordKeys(terzlage, [50, 54, 57]).problems).toEqual(['highest']);
    // Sextakkord in Terzlage geht nur mit vier Tönen: fis a d¹ fis¹.
    const beides: ChordRule = { tones: D_DUR, lowest: 1, highest: 1 };
    expect(judgeChordKeys(beides, [54, 57, 62, 66]).correct).toBe(true);
    expect(judgeChordKeys(beides, [54, 57, 62]).problems).toEqual(['highest']);
  });

  it('sagt die Regel in Worten', () => {
    expect(describeChordRule({ tones: D_DUR, lowest: 1, highest: 0 })).toBe('d fis a, unten fis, oben d');
  });

  it('zeigt nach einem Fehler nur richtige Lagen', () => {
    const classes = [2, 6, 9];
    for (const rule of [
      { tones: D_DUR, lowest: 0 },
      { tones: D_DUR, lowest: 1 },
      { tones: D_DUR, highest: 1 },
      { tones: D_DUR, lowest: 1, highest: 1 },
      { tones: D_DUR, lowest: 2, highest: 2 },
    ]) {
      const examples = chordExamples(classes, rule, 48, 71);
      expect(examples.length, JSON.stringify(rule)).toBeGreaterThan(0);
      for (const keys of examples) {
        expect(judgeChordKeys(rule, keys).correct, keys.join(' ')).toBe(true);
        expect(Math.min(...keys)).toBeGreaterThanOrEqual(48);
        expect(Math.max(...keys)).toBeLessThanOrEqual(71);
      }
    }
  });
});

describe('Akkord im Notenbild', () => {
  it('zählt die Schreibweise: ges ist nicht fis', () => {
    const rule: ChordRule = { tones: D_DUR, lowest: 0 };
    expect(judgeChordNotes(rule, notes('d4 fis4 a4')).correct).toBe(true);
    expect(judgeChordNotes(rule, notes('d4 gb4 a4')).problems).toEqual(['foreign', 'missing']);
  });

  it('nimmt Töne über beide Systeme verteilt', () => {
    // Bass fis, oben a d¹ fis¹: Sextakkord in Terzlage.
    const rule: ChordRule = { tones: D_DUR, lowest: 1, highest: 1 };
    expect(judgeChordNotes(rule, notes('fis2 a3 d4 fis4')).correct).toBe(true);
    expect(judgeChordNotes(rule, notes('d2 a3 d4 fis4')).problems).toEqual(['lowest']);
  });
});
