/**
 * Gehaltene Töne finden und gegen die Aufgabe werten — mit künstlichen
 * Tonhöhenkurven, wie sie die Messschleife liefert.
 */

import { describe, expect, it } from 'vitest';
import { HOLD_MS, HoldDetector, type HeldNote } from './hold';
import { judgeSung, rolesOf, type SingGoal } from './judge';

/** Messung alle 1000/60 ms, wie beim Bildaufbau. */
const FRAME = 1000 / 60;

/** Spielt eine Kurve (MIDI je Messung, null = Stille) durch und sammelt die gehaltenen Töne. */
function holds(curve: (number | null)[]): HeldNote[] {
  const detector = new HoldDetector();
  const found: HeldNote[] = [];
  curve.forEach((midi, index) => {
    const held = detector.push(index * FRAME, midi);
    if (held) found.push(held);
  });
  return found;
}

/** So viele Messungen dauern `ms`. */
const frames = (ms: number) => Math.ceil(ms / FRAME);
const steady = (midi: number, ms: number) => Array.from({ length: frames(ms) }, () => midi);
const glide = (from: number, to: number, ms: number) =>
  Array.from({ length: frames(ms) }, (_, i) => from + ((to - from) * i) / frames(ms));
const silence = (ms: number) => Array.from({ length: frames(ms) }, () => null);

describe('HoldDetector', () => {
  it('meldet einen ruhig gehaltenen Ton einmal, nach HOLD_MS', () => {
    const found = holds(steady(64.1, 1500));
    expect(found).toHaveLength(1);
    expect(found[0].midi).toBeCloseTo(64.1, 6);
    expect(found[0].end).toBeGreaterThanOrEqual(HOLD_MS);
    expect(found[0].end).toBeLessThan(HOLD_MS + 2 * FRAME);
  });

  it('meldet keinen Ton, der kürzer gehalten wird', () => {
    expect(holds(steady(64, HOLD_MS - 50))).toHaveLength(0);
  });

  it('lässt Vibrato gelten und mittelt es', () => {
    const vibrato = Array.from({ length: frames(800) }, (_, i) => 67 + 0.4 * Math.sin((i * FRAME * 2 * Math.PI * 5.5) / 1000));
    const found = holds(vibrato);
    expect(found).toHaveLength(1);
    expect(found[0].midi).toBeCloseTo(67, 1);
  });

  it('übergeht das Gleiten zwischen zwei Tönen', () => {
    const found = holds([...steady(60, 600), ...glide(60, 64, 300), ...steady(64, 600)]);
    expect(found.map((held) => Math.round(held.midi))).toEqual([60, 64]);
  });

  it('meldet denselben Ton nach einer Atempause erneut', () => {
    const found = holds([...steady(60, 600), ...silence(200), ...steady(60, 600)]);
    expect(found).toHaveLength(2);
  });

  it('fasst einen Ton nicht über eine lange Lücke zusammen', () => {
    // Je eine Hälfte vor und nach einer Lücke reicht nicht.
    const detector = new HoldDetector();
    let found: HeldNote | null = null;
    for (let t = 0; t < 250; t += FRAME) found ??= detector.push(t, 62);
    for (let t = 600; t < 850; t += FRAME) found ??= detector.push(t, 62);
    expect(found).toBeNull();
  });
});

describe('judgeSung', () => {
  /** c¹ – e¹: grosse Terz aufwärts. */
  const third: SingGoal = { reference: 60, target: 64, tolerance: 50 };

  it('wertet den Zielton als richtig', () => {
    const verdict = judgeSung(third, [64.1]);
    expect(verdict).toMatchObject({ index: 0, correct: true, rightNote: true, cents: 10, octaveShift: 0 });
  });

  it('übergeht den nachgesungenen Ausgangston, auch mehrmals', () => {
    expect(rolesOf(third, [60, 60.2, 64])).toEqual(['reference', 'reference', 'answer']);
    expect(judgeSung(third, [60, 60.2, 64])).toMatchObject({ index: 2, correct: true });
  });

  it('übergeht den Ausgangston in jeder Oktave', () => {
    expect(judgeSung(third, [48, 52])).toMatchObject({ index: 1, correct: true, octaveShift: -1 });
  });

  it('nimmt den ersten anderen Ton als Antwort, auch wenn er falsch ist', () => {
    const verdict = judgeSung(third, [60, 65, 64]);
    expect(verdict).toMatchObject({ index: 1, correct: false, rightNote: false, cents: null });
  });

  it('lässt den Zielton in jeder Oktave gelten', () => {
    expect(judgeSung(third, [52]).correct).toBe(true);
    expect(judgeSung(third, [76]).correct).toBe(true);
  });

  it('wertet ausserhalb der Genauigkeit als falsch, mit der Abweichung', () => {
    const strict = { ...third, tolerance: 30 };
    expect(judgeSung(strict, [63.6])).toMatchObject({ correct: false, rightNote: true, cents: -40 });
    expect(judgeSung(strict, [63.75])).toMatchObject({ correct: true, cents: -25 });
  });

  it('hat noch kein Urteil, solange nur der Ausgangston kam', () => {
    expect(judgeSung(third, [60, 72])).toMatchObject({ index: -1, correct: false, note: null });
  });

  describe('Prime', () => {
    const prime: SingGoal = { reference: 62, target: 62, tolerance: 50 };
    it('ist der Ausgangston selbst, in jeder Oktave', () => {
      expect(judgeSung(prime, [62]).correct).toBe(true);
      expect(judgeSung(prime, [50]).correct).toBe(true);
      expect(judgeSung(prime, [63]).correct).toBe(false);
    });
  });

  describe('Oktave', () => {
    /** c¹ – c²: reine Oktave aufwärts. */
    const octave: SingGoal = { reference: 60, target: 72, tolerance: 50 };

    it('zählt eine Oktave über dem gespielten Ton', () => {
      expect(judgeSung(octave, [72])).toMatchObject({ index: 0, correct: true });
    });

    it('übergeht den gespielten Ausgangston und zählt die Oktave danach', () => {
      expect(rolesOf(octave, [60, 72])).toEqual(['reference', 'answer']);
      expect(judgeSung(octave, [60, 72]).correct).toBe(true);
    });

    it('misst von dem Ausgangston, wie er nachgesungen wurde', () => {
      // c² gespielt, c zwei Oktaven tiefer nachgesungen, dann C eine Oktave
      // darunter — eine Oktave nur vom eigenen Ausgangston aus.
      const high: SingGoal = { reference: 72, target: 84, tolerance: 50 };
      expect(rolesOf(high, [48, 36])).toEqual(['reference', 'answer']);
      expect(judgeSung(high, [48, 36]).correct).toBe(true);
      // Ohne den nachgesungenen Ton wäre C nur ein weiterer Ausgangston.
      expect(rolesOf(high, [36])).toEqual(['reference']);
    });

    it('zählt eine Oktave unter dem gespielten Ton ebenso', () => {
      expect(judgeSung(octave, [48]).correct).toBe(true);
    });

    it('wertet einen anderen Ton als falsch', () => {
      expect(judgeSung(octave, [60, 71]).correct).toBe(false);
    });
  });
});
