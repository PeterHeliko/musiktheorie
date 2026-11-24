/**
 * Gehaltene Töne finden und gegen die Aufgabe werten — mit künstlichen
 * Tonhöhenkurven, wie sie die Messschleife liefert.
 */

import { describe, expect, it } from 'vitest';
import { HOLD_MS, HoldDetector, type HeldNote } from './hold';
import { beatPitch, judgeSequence, judgeSung, judgeTimed, rolesOf, type SingGoal, type TimedFrame } from './judge';

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
    const found = holds(steady(64.1, HOLD_MS * 3));
    expect(found).toHaveLength(1);
    expect(found[0].midi).toBeCloseTo(64.1, 6);
    expect(found[0].end).toBeGreaterThanOrEqual(HOLD_MS);
    expect(found[0].end).toBeLessThan(HOLD_MS + 2 * FRAME);
  });

  it('meldet keinen Ton, der kürzer gehalten wird', () => {
    expect(holds(steady(64, HOLD_MS - 50))).toHaveLength(0);
  });

  it('lässt Vibrato gelten und mittelt es', () => {
    const vibrato = Array.from(
      { length: frames(HOLD_MS * 1.5) },
      (_, i) => 67 + 0.4 * Math.sin((i * FRAME * 2 * Math.PI * 5.5) / 1000),
    );
    const found = holds(vibrato);
    expect(found).toHaveLength(1);
    expect(found[0].midi).toBeCloseTo(67, 1);
  });

  it('übergeht das Gleiten zwischen zwei Tönen', () => {
    const found = holds([...steady(60, HOLD_MS + 200), ...glide(60, 64, 300), ...steady(64, HOLD_MS + 200)]);
    expect(found.map((held) => Math.round(held.midi))).toEqual([60, 64]);
  });

  it('meldet denselben Ton nach einer Atempause erneut', () => {
    const found = holds([...steady(60, HOLD_MS + 200), ...silence(200), ...steady(60, HOLD_MS + 200)]);
    expect(found).toHaveLength(2);
  });

  it('meldet denselben Ton erneut, wenn er nicht zählen soll', () => {
    const detector = new HoldDetector();
    let count = 0;
    for (let t = 0; t < HOLD_MS * 3.5; t += FRAME) {
      if (detector.push(t, 64.4)) {
        count++;
        detector.again();
      }
    }
    expect(count).toBe(3);
  });

  it('fasst einen Ton nicht über eine lange Lücke zusammen', () => {
    // Je zwei Drittel vor und nach einer Lücke reichen nicht.
    const detector = new HoldDetector();
    const part = (HOLD_MS * 2) / 3;
    let found: HeldNote | null = null;
    for (let t = 0; t < part; t += FRAME) found ??= detector.push(t, 62);
    for (let t = part + 300; t < 2 * part + 300; t += FRAME) found ??= detector.push(t, 62);
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

  describe('Ohne Fehlerurteil', () => {
    const options = { untilRight: true };

    it('übergeht falsche Töne bis zum richtigen', () => {
      expect(judgeSung(third, [60, 65, 62, 64], options)).toMatchObject({ index: 3, correct: true });
    });

    it('hat ohne richtigen Ton kein Urteil', () => {
      expect(judgeSung(third, [65, 62], options)).toMatchObject({ index: -1, correct: false });
    });

    it('lässt einen knapp verfehlten Ton nachstimmen', () => {
      const strict = { ...third, tolerance: 30 };
      expect(judgeSung(strict, [63.6, 63.85], options)).toMatchObject({ index: 1, correct: true, cents: -15 });
    });
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

describe('judgeSequence', () => {
  // D-Dur in Grundstellung: d¹ erklingt, gesungen wird d fis a.
  const goal = { reference: 62, targets: [62, 66, 69], tolerance: 50 };

  it('wertet die drei Töne in der Reihenfolge, jeden in jeder Oktave', () => {
    expect(judgeSequence(goal, [62, 66, 69]).correct).toBe(true);
    expect(judgeSequence(goal, [50, 54.2, 57]).correct).toBe(true);
    expect(judgeSequence(goal, [62, 54, 81]).correct).toBe(true);
  });

  it('ist erst nach dem dritten Ton entschieden', () => {
    const partial = judgeSequence(goal, [62, 66]);
    expect(partial.done).toBe(false);
    expect(partial.right).toHaveLength(2);
  });

  it('nimmt den vorgespielten Ton dazwischen nicht übel', () => {
    const verdict = judgeSequence(goal, [62, 62, 66, 50, 69]);
    expect(verdict.correct).toBe(true);
    expect(verdict.roles).toEqual(['right', 'repeat', 'right', 'repeat', 'right']);
  });

  it('lässt den vorgespielten Ton weg, wer will', () => {
    // D-Dur als Quartsextakkord: a erklingt, gesungen wird d fis — oder a d fis.
    const quartsext = { reference: 57, targets: [57, 62, 66], tolerance: 50 };
    const without = judgeSequence(quartsext, [62, 66]);
    expect(without.correct).toBe(true);
    expect(without.right.map((entry) => entry.step)).toEqual([1, 2]);
    expect(judgeSequence(quartsext, [57, 62, 66]).right.map((entry) => entry.step)).toEqual([0, 1, 2]);
    // Mit d begonnen, das ist der zweite Ton: noch nicht entschieden, nichts falsch.
    expect(judgeSequence(quartsext, [62])).toMatchObject({ done: false, wrong: [], reached: 2 });
  });

  it('nimmt einen schon richtig gesungenen Ton noch einmal nicht übel', () => {
    // fis über ein Atemholen hinweg noch einmal erkannt, dann a: richtig.
    const verdict = judgeSequence(goal, [62, 66, 66.3, 69]);
    expect(verdict.correct).toBe(true);
    expect(verdict.roles).toEqual(['right', 'right', 'repeat', 'right']);
    // Auch der erste Ton, in einer anderen Oktave.
    expect(judgeSequence(goal, [62, 66, 50, 69]).correct).toBe(true);
  });

  it('wertet einen späteren Ton der Folge zu früh als falsch und wartet weiter auf den verlangten', () => {
    const early = judgeSequence(goal, [62, 69]);
    expect(early.done).toBe(false);
    expect(early.wrong).toMatchObject([{ index: 1, expected: 1 }]);
    expect(early.reached).toBe(1);
  });

  it('geht nach einem falschen Ton weiter, bis die Folge stimmt — und bleibt falsch', () => {
    const swapped = judgeSequence(goal, [62, 69, 66, 69]);
    expect(swapped.done).toBe(true);
    expect(swapped.correct).toBe(false);
    expect(swapped.roles).toEqual(['right', 'wrong', 'right', 'right']);
    expect(swapped.wrong).toMatchObject([{ index: 1, expected: 1 }]);
    // Mehrere Fehler beim selben Ton werden alle gezählt.
    const twice = judgeSequence(goal, [62, 67, 65, 66, 69]);
    expect(twice.wrong.map((entry) => entry.expected)).toEqual([1, 1]);
    expect(twice.roles).toEqual(['right', 'wrong', 'wrong', 'right', 'right']);
    // Ohne den vorgespielten Ton gleich den dritten: verlangt war der zweite.
    expect(judgeSequence(goal, [69]).wrong).toMatchObject([{ index: 0, expected: 1 }]);
    // Nach dem letzten richtigen Ton zählt nichts mehr.
    expect(judgeSequence(goal, [62, 66, 69, 70]).roles).toEqual(['right', 'right', 'right', 'after']);
  });

  it('wertet einen zu ungenauen Ton als falsch', () => {
    expect(judgeSequence(goal, [62, 66.7]).wrong).toHaveLength(1);
    expect(judgeSequence(goal, [62, 66.7, 66, 69]).correct).toBe(false);
  });

  it('nimmt bei der Tonleiter den Grundton nicht übel, obwohl er als Oktave noch kommt', () => {
    // C-Dur: c¹ erklingt; c d, dann c noch einmal (Atemholen), dann weiter.
    const scale = { reference: 60, targets: [60, 62, 64, 65, 67, 69, 71, 72], tolerance: 50 };
    const verdict = judgeSequence(scale, [60, 62, 60, 64, 65, 67, 69, 71, 72]);
    expect(verdict.correct).toBe(true);
    expect(verdict.roles[2]).toBe('repeat');
    // Die Oktave am Schluss: c, in jeder Oktave.
    expect(judgeSequence(scale, [60, 62, 64, 65, 67, 69, 71, 48]).correct).toBe(true);
  });
});

describe('im Tempo', () => {
  // Ein Schlag von 1000 ms ab 0; alle 20 ms ein Messpunkt.
  const frames = (value: (time: number) => number | null): TimedFrame[] =>
    Array.from({ length: 50 }, (_, index) => ({ time: index * 20, midi: value(index * 20) }));

  it('nimmt den Median im Kern des Schlags, ohne Einsatz und Ende', () => {
    // Der Einsatz rutscht von unten herein, am Ende geht es schon weiter.
    const sung = frames((time) => (time < 200 ? 58 : time > 920 ? 67 : 62.1));
    expect(beatPitch(sung, 0, 1000)).toBeCloseTo(62.1);
  });

  it('nennt einen Schlag stumm, wenn im Kern zu wenig gesungen wurde', () => {
    expect(beatPitch(frames(() => null), 0, 1000)).toBeNull();
    expect(beatPitch(frames((time) => (time > 700 ? 62 : null)), 0, 1000)).toBeNull();
    expect(beatPitch(frames((time) => (time > 450 ? 62 : null)), 0, 1000)).toBe(62);
    expect(beatPitch([], 0, 1000)).toBeNull();
  });

  it('wertet jeden Schlag für sich, in jeder Oktave, und geht weiter', () => {
    const goal = { reference: 62, targets: [62, 66, 69], tolerance: 50 };
    expect(judgeTimed(goal, [62, 54, 81])).toMatchObject({ done: true, correct: true });
    const missed = judgeTimed(goal, [62, null, 69]);
    expect(missed).toMatchObject({ done: true, correct: false, missing: [1], roles: ['right', 'missing', 'right'] });
    const wrong = judgeTimed(goal, [62, 67, 69]);
    expect(wrong.correct).toBe(false);
    expect(wrong.wrong).toMatchObject([{ index: 1, expected: 1 }]);
    expect(judgeTimed(goal, [62, 66])).toMatchObject({ done: false, reached: 2 });
    // Den ersten Ton muss man im Tempo mitsingen.
    expect(judgeTimed(goal, [null, 66, 69]).correct).toBe(false);
  });
});

describe('freie Oktave am Ende einer Tonleiter', () => {
  const scale = { reference: 60, targets: [60, 62, 64, 65, 67, 69, 71, 72], tolerance: 50, optionalLast: true };

  it('ist Ton für Ton mit dem siebten Ton vollständig, die Oktave darf noch kommen', () => {
    const verdict = judgeSequence(scale, [60, 62, 64, 65, 67, 69, 71]);
    expect(verdict).toMatchObject({ done: false, complete: true, correct: true, reached: 7 });
    expect(judgeSequence(scale, [60, 62, 64, 65, 67, 69]).complete).toBe(false);
    expect(judgeSequence(scale, [60, 62, 64, 65, 67, 69, 71, 72])).toMatchObject({ done: true, correct: true });
    // Kommt sie falsch, ist es falsch.
    expect(judgeSequence(scale, [60, 62, 64, 65, 67, 69, 71, 73])).toMatchObject({ done: false, correct: false });
  });

  it('lässt im Tempo den letzten Schlag stumm, aber nicht falsch', () => {
    expect(judgeTimed(scale, [60, 62, 64, 65, 67, 69, 71, null]).correct).toBe(true);
    expect(judgeTimed(scale, [60, 62, 64, 65, 67, 69, 71, 73]).correct).toBe(false);
    expect(judgeTimed(scale, [60, 62, 64, 65, 67, 69, null, 72]).correct).toBe(false);
  });
});
