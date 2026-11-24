/* Herkunft: musiktheorie-scorm/src/music/theory.test.ts (Stand 2026-08-21), über das Projekt «training».
   Wird hier eigenständig weitergeführt; es gibt keinen Abgleich mit dem Original mehr. */
import { describe, expect, it } from 'vitest';
import {
  analyseSeventh,
  analyseTriad,
  buildTriad,
  degreeChordName,
  durationInQuarters,
  germanNoteName,
  intervalBetween,
  intervalLabel,
  keyByMajorName,
  keySignatureSteps,
  majorScale,
  measureCapacity,
  nearestWithStep,
  parseIntervalLabel,
  parsePitch,
  semitoneStep,
  toGermanPitch,
  transposeByInterval,
  triadLabel,
  type Pitch,
} from './theory';

const p = (text: string): Pitch => parsePitch(text);

describe('deutsche Tonnamen', () => {
  it('schreibt die Stammtöne mit H statt B', () => {
    expect(germanNoteName('b', 0)).toBe('H');
    expect(germanNoteName('a', 0)).toBe('A');
  });

  it('kennt die Sonderformen Es, As und B', () => {
    expect(germanNoteName('e', -1)).toBe('Es');
    expect(germanNoteName('a', -1)).toBe('As');
    expect(germanNoteName('b', -1)).toBe('B');
    expect(germanNoteName('d', -1)).toBe('Des');
    expect(germanNoteName('c', -1)).toBe('Ces');
  });

  it('hängt bei Kreuzen «is» an', () => {
    expect(germanNoteName('f', 1)).toBe('Fis');
    expect(germanNoteName('b', 1)).toBe('His');
    expect(germanNoteName('f', 2)).toBe('Fisis');
  });

  it('kennt die Doppelerniedrigungen', () => {
    expect(germanNoteName('e', -2)).toBe('Eses');
    expect(germanNoteName('a', -2)).toBe('Ases');
    expect(germanNoteName('b', -2)).toBe('Heses');
  });
});

describe('Oktavbezeichnung', () => {
  it('benennt die eingestrichene Oktave wie die Vorlage (g1)', () => {
    expect(toGermanPitch(p('g4'))).toBe('g1');
    expect(toGermanPitch(p('c4'))).toBe('c1');
    expect(toGermanPitch(p('fis4'))).toBe('fis1');
  });

  it('unterscheidet kleine und grosse Oktave', () => {
    expect(toGermanPitch(p('c3'))).toBe('c');
    expect(toGermanPitch(p('c2'))).toBe('C');
    expect(toGermanPitch(p('c1'))).toBe('C,');
    expect(toGermanPitch(p('c5'))).toBe('c2');
  });
});

describe('parsePitch', () => {
  it('liest deutsche und englische Schreibweise', () => {
    expect(p('fis4')).toEqual({ step: 'f', alter: 1, octave: 4 });
    expect(p('f#4')).toEqual({ step: 'f', alter: 1, octave: 4 });
    expect(p('es4')).toEqual({ step: 'e', alter: -1, octave: 4 });
    expect(p('eb4')).toEqual({ step: 'e', alter: -1, octave: 4 });
    expect(p('h4')).toEqual({ step: 'b', alter: 0, octave: 4 });
  });

  it('weist Unsinn zurück', () => {
    expect(() => p('x9')).toThrow();
    expect(() => p('cs4')).toThrow();
  });
});

describe('Intervallbestimmung', () => {
  it('bestimmt die Grundfälle', () => {
    expect(intervalLabel(intervalBetween(p('c4'), p('e4')))).toBe('g3');
    expect(intervalLabel(intervalBetween(p('c4'), p('es4')))).toBe('k3');
    expect(intervalLabel(intervalBetween(p('c4'), p('g4')))).toBe('r5');
    expect(intervalLabel(intervalBetween(p('c4'), p('c5')))).toBe('r8');
    expect(intervalLabel(intervalBetween(p('c4'), p('c4')))).toBe('r1');
  });

  it('unterscheidet verminderte Quinte und übermässige Quarte', () => {
    expect(intervalLabel(intervalBetween(p('h3'), p('f4')))).toBe('v5');
    expect(intervalLabel(intervalBetween(p('f4'), p('h4')))).toBe('ü4');
  });

  it('misst unabhängig von der Reihenfolge der Argumente', () => {
    expect(intervalLabel(intervalBetween(p('e4'), p('c4')))).toBe('g3');
  });

  it('bestimmt die Beispiele aus der Vorlage', () => {
    // «k7» über c1 ist b1 (deutsch B), «g7» ist h1.
    expect(intervalLabel(intervalBetween(p('c4'), p('hes4')))).toBe('k7');
    expect(intervalLabel(intervalBetween(p('c4'), p('h4')))).toBe('g7');
    expect(intervalLabel(intervalBetween(p('c4'), p('a4')))).toBe('g6');
    expect(intervalLabel(intervalBetween(p('c4'), p('f4')))).toBe('r4');
    expect(intervalLabel(intervalBetween(p('c4'), p('des4')))).toBe('k2');
  });
});

describe('Intervalle konstruieren', () => {
  it('trifft aufwärts die richtige Schreibweise', () => {
    expect(transposeByInterval(p('c4'), parseIntervalLabel('g3'))).toEqual(p('e4'));
    expect(transposeByInterval(p('c4'), parseIntervalLabel('k3'))).toEqual(p('es4'));
    expect(transposeByInterval(p('f4'), parseIntervalLabel('ü4'))).toEqual(p('h4'));
    expect(transposeByInterval(p('h3'), parseIntervalLabel('v5'))).toEqual(p('f4'));
  });

  it('trifft abwärts die richtige Schreibweise', () => {
    expect(transposeByInterval(p('c5'), parseIntervalLabel('g3'), 'down')).toEqual(p('as4'));
    expect(transposeByInterval(p('g4'), parseIntervalLabel('r5'), 'down')).toEqual(p('c4'));
  });

  it('ist die Umkehrung von intervalBetween', () => {
    for (const label of ['r1', 'k2', 'g2', 'k3', 'g3', 'r4', 'ü4', 'v5', 'r5', 'k6', 'g6', 'k7', 'g7', 'r8']) {
      const iv = parseIntervalLabel(label);
      const target = transposeByInterval(p('c4'), iv);
      expect(intervalLabel(intervalBetween(p('c4'), target))).toBe(label);
    }
  });

  it('lehnt unmögliche Kombinationen ab', () => {
    expect(() => transposeByInterval(p('c4'), { quality: 'g', number: 5 })).toThrow();
    expect(() => transposeByInterval(p('c4'), { quality: 'r', number: 3 })).toThrow();
  });
});

describe('Dreiklangsanalyse', () => {
  it('erkennt Geschlecht in Grundstellung', () => {
    expect(analyseTriad([p('c4'), p('e4'), p('g4')])?.quality).toBe('dur');
    expect(analyseTriad([p('c4'), p('es4'), p('g4')])?.quality).toBe('moll');
    expect(analyseTriad([p('c4'), p('es4'), p('ges4')])?.quality).toBe('vermindert');
    expect(analyseTriad([p('c4'), p('e4'), p('gis4')])?.quality).toBe('uebermaessig');
  });

  it('erkennt Umkehrung am Bass und Lage am obersten Ton', () => {
    // f-moll Sextakkord in Oktavlage = as-c-f, Beispiel aus der Vorlage.
    const a = analyseTriad([p('as3'), p('c4'), p('f4')]);
    expect(a).not.toBeNull();
    expect(triadLabel(a!)).toBe('fm⁶ 8');
    expect(a!.inversion).toBe('sextakkord');
    expect(a!.position).toBe('oktavlage');
  });

  it('erkennt den Quartsextakkord', () => {
    const a = analyseTriad([p('g3'), p('c4'), p('e4')]);
    expect(a!.inversion).toBe('quartsextakkord');
    expect(a!.position).toBe('terzlage');
    expect(a!.quality).toBe('dur');
  });

  it('erkennt Grundstellung in Quintlage', () => {
    const a = analyseTriad([p('c4'), p('e4'), p('g4')]);
    expect(a!.inversion).toBe('grundstellung');
    expect(a!.position).toBe('quintlage');
  });

  it('kommt mit Verdopplungen über zwei Systeme zurecht', () => {
    const a = analyseTriad([p('c3'), p('e4'), p('g4'), p('c5')]);
    expect(a!.inversion).toBe('grundstellung');
    expect(a!.position).toBe('oktavlage');
  });

  it('liefert null für Nicht-Dreiklänge', () => {
    expect(analyseTriad([p('c4'), p('d4'), p('e4')])).toBeNull();
    expect(analyseTriad([p('c4'), p('e4')])).toBeNull();
  });

  it('ist die Umkehrung von buildTriad', () => {
    for (const q of ['dur', 'moll', 'vermindert', 'uebermaessig'] as const) {
      expect(analyseTriad(buildTriad(p('d4'), q))?.quality).toBe(q);
    }
  });
});

describe('Septakkordanalyse', () => {
  const analyse = (...keys: string[]) => analyseSeventh(keys.map(p));

  it('erkennt die fünf Septakkorde in Grundstellung', () => {
    expect(analyse('g4', 'h4', 'd5', 'f5')?.quality).toBe('dominant');
    expect(analyse('c4', 'e4', 'g4', 'h4')?.quality).toBe('gross-dur');
    expect(analyse('d4', 'f4', 'a4', 'c5')?.quality).toBe('klein-moll');
    expect(analyse('h3', 'd4', 'f4', 'a4')?.quality).toBe('halbvermindert');
    expect(analyse('cis4', 'e4', 'g4', 'hes4')?.quality).toBe('vermindert');
  });

  it('nennt Grundton, Umkehrung und Lage', () => {
    const quintsext = analyse('h3', 'd4', 'f4', 'g4');
    expect(toGermanPitch(quintsext!.root)).toBe('g1');
    expect(quintsext!.inversion).toBe('quintsextakkord');
    expect(quintsext!.position).toBe('oktavlage');
    expect(analyse('d4', 'f4', 'g4', 'h4')?.inversion).toBe('terzquartakkord');
    expect(analyse('f4', 'g4', 'h4', 'd5')?.inversion).toBe('sekundakkord');
    expect(analyse('g4', 'h4', 'd5', 'f5')?.position).toBe('septlage');
    // Vierstimmig: Basston abgesetzt, darüber die übrigen drei.
    const open = analyse('c3', 'e4', 'g4', 'hes4');
    expect([open?.inversion, open?.position]).toEqual(['grundstellung', 'septlage']);
    const spread = analyse('e3', 'hes3', 'c4', 'g4');
    expect([spread?.inversion, spread?.position]).toEqual(['quintsextakkord', 'quintlage']);
  });

  it('zählt die Schreibweise und Verdopplungen nicht doppelt', () => {
    expect(analyse('c4', 'e4', 'g4', 'ais4')).toBeNull();
    expect(analyse('c4', 'e4', 'g4', 'c5')).toBeNull();
    expect(analyse('g3', 'h3', 'd4', 'f4', 'g4')?.position).toBe('oktavlage');
    expect(analyse('c4', 'e4', 'gis4', 'h4')).toBeNull();
  });

  it('liest den verminderten Septakkord nach der Schreibweise', () => {
    // Dieselben Tasten, anders geschrieben: ein anderer Grundton.
    expect(toGermanPitch(analyse('h3', 'd4', 'f4', 'as4')!.root)).toBe('h');
    expect(toGermanPitch(analyse('d4', 'f4', 'as4', 'ces5')!.root)).toBe('d1');
  });
});

describe('Tonarten', () => {
  it('ordnet Vorzeichen und parallele Molltonart zu', () => {
    expect(keyByMajorName('G-Dur')).toMatchObject({ accidentals: 1, minor: 'e-Moll' });
    expect(keyByMajorName('B-Dur')).toMatchObject({ accidentals: -2, minor: 'g-Moll' });
    expect(keyByMajorName('Es-Dur')).toMatchObject({ accidentals: -3, minor: 'c-Moll' });
    expect(keyByMajorName('A-Dur')).toMatchObject({ accidentals: 3, minor: 'fis-Moll' });
    expect(keyByMajorName('F-Dur')).toMatchObject({ accidentals: -1, minor: 'd-Moll' });
  });

  it('gibt die Vorzeichen in der richtigen Reihenfolge aus', () => {
    expect(keySignatureSteps(3)).toEqual({ steps: ['f', 'c', 'g'], sign: 1 });
    expect(keySignatureSteps(-3)).toEqual({ steps: ['b', 'e', 'a'], sign: -1 });
    expect(keySignatureSteps(0).steps).toEqual([]);
  });

  it('bildet die Durtonleiter mit korrekter Schreibweise', () => {
    const scale = majorScale(p('es4')).map((x) => germanNoteName(x.step, x.alter));
    expect(scale).toEqual(['Es', 'F', 'G', 'As', 'B', 'C', 'D']);
  });

  it('löst die Stufenaufgaben aus der Vorlage', () => {
    expect(degreeChordName('C-Dur', 4)).toBe('F-Dur');
    expect(degreeChordName('D-Dur', 5)).toBe('A-Dur');
    expect(degreeChordName('G-Dur', 1)).toBe('G-Dur');
    expect(degreeChordName('B-Dur', 5)).toBe('F-Dur');
    expect(degreeChordName('A-Dur', 4)).toBe('D-Dur');
  });

  it('bildet auch die Mollstufen der Durtonart korrekt ab', () => {
    expect(degreeChordName('C-Dur', 2)).toBe('D-Moll');
    expect(degreeChordName('C-Dur', 7)).toBe('H-vermindert');
  });
});

describe('Tonhöhe mit der Tastatur', () => {
  const walk = (start: string, direction: 1 | -1, count: number) => {
    const names: string[] = [];
    let pitch = p(start);
    for (let i = 0; i < count; i++) {
      pitch = semitoneStep(pitch, direction);
      names.push(toGermanPitch(pitch));
    }
    return names;
  };

  it('geht aufwärts über Stammtöne und Kreuze', () => {
    expect(walk('c4', 1, 12)).toEqual([
      'cis1', 'd1', 'dis1', 'e1', 'f1', 'fis1', 'g1', 'gis1', 'a1', 'ais1', 'h1', 'c2',
    ]);
  });

  it('geht abwärts über Stammtöne und b', () => {
    expect(walk('c5', -1, 12)).toEqual([
      'h1', 'b1', 'a1', 'as1', 'g1', 'ges1', 'f1', 'e1', 'es1', 'd1', 'des1', 'c1',
    ]);
  });

  it('löst ungewöhnliche Schreibweisen zum nächsten Halbton auf', () => {
    expect(toGermanPitch(semitoneStep(p('eis4'), 1))).toBe('fis1');
    expect(toGermanPitch(semitoneStep(p('ces5'), -1))).toBe('b1');
    expect(toGermanPitch(semitoneStep(p('his3'), 1))).toBe('cis1');
    expect(toGermanPitch(semitoneStep(p('fes4'), 1))).toBe('f1');
    expect(toGermanPitch(semitoneStep(p('es4'), 1))).toBe('e1');
  });

  it('setzt einen Stammton in die nächste Lage', () => {
    const near = (step: 'c' | 'd' | 'e' | 'f' | 'g' | 'a' | 'b', from: string, alter = 0) =>
      toGermanPitch(nearestWithStep(step, alter, p(from)));
    expect(near('e', 'c4')).toBe('e1');
    expect(near('f', 'c4')).toBe('f1');
    expect(near('g', 'c4')).toBe('g');
    expect(near('a', 'c4')).toBe('a');
    expect(near('c', 'c4')).toBe('c1');
    expect(near('c', 'a4')).toBe('c2');
    expect(near('b', 'c4', -1)).toBe('b');
    expect(near('d', 'h3')).toBe('d1');
  });
});

describe('Notenwerte', () => {
  it('rechnet Dauern in Viertel um', () => {
    expect(durationInQuarters('w')).toBe(4);
    expect(durationInQuarters('q', true)).toBe(1.5);
    expect(durationInQuarters('8')).toBe(0.5);
  });

  it('kennt die Taktkapazität', () => {
    expect(measureCapacity('4/4')).toBe(4);
    expect(measureCapacity('3/4')).toBe(3);
    expect(measureCapacity('6/8')).toBe(3);
  });
});
