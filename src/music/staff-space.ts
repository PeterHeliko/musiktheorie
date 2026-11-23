/**
 * Platz über und unter einem System, gerechnet statt gemessen — für
 * Notenbilder, deren Töne man kennt (`ScoreSpec.space`).
 *
 * Ohne VexFlow, damit auch die Generatoren es nutzen können: sie gehören zum
 * kleinen Teil der Seite, der ohne Notensatz lädt.
 */

import { diatonicIndex, parsePitch, type Pitch } from './theory';

/**
 * Wie weit ein Ton samt Vorzeichen über und unter die Mitte seines
 * Notenkopfs reicht, in Zeicheneinheiten (Linienabstand 10). Daraus ergeben
 * sich auch die gemessenen Werte von INTERVAL_REACH in generators/shared.ts.
 */
const HEAD = 5;
const SHARP = 13;
const FLAT_ABOVE = 18;

/** Der Schlüssel allein, über und unter dem System (Bravura; Violin gemessen). */
const CLEF_REACH = { treble: { above: 14, below: 16 }, bass: { above: 1, below: 0 } };

/** Oberste und unterste Notenlinie je Schlüssel. */
const STAFF_LINES = {
  treble: { top: diatonicIndex(parsePitch('f5')), bottom: diatonicIndex(parsePitch('e4')) },
  bass: { top: diatonicIndex(parsePitch('a3')), bottom: diatonicIndex(parsePitch('g2')) },
};

/**
 * So viel Platz, wie der Schlüssel und der äusserste dieser Töne samt
 * Vorzeichen brauchen, plus 1 Luft.
 */
export function staffSpace(clef: 'treble' | 'bass', pitches: readonly Pitch[]): { above: number; below: number } {
  const { top, bottom } = STAFF_LINES[clef];
  let { above, below } = CLEF_REACH[clef];
  for (const pitch of pitches) {
    const position = diatonicIndex(pitch);
    const up = pitch.alter < 0 ? FLAT_ABOVE : pitch.alter > 0 ? SHARP : HEAD;
    const down = pitch.alter > 0 ? SHARP : HEAD;
    above = Math.max(above, (position - top) * 5 + up);
    below = Math.max(below, (bottom - position) * 5 + down);
  }
  return { above: above + 1, below: below + 1 };
}
