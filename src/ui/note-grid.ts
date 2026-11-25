/**
 * Tonnamen-Raster: wo jeder Name steht, bei den Antwortknöpfen
 * (SelectTaskView) wie in den Einstellungen («Töne», FilterFields).
 */

import { STEPS, germanNoteName } from '../music/theory';

/**
 * Platz jedes Tonnamens (klein geschrieben, wie in src/generators/toene.ts):
 * die Spalte ist der Stammton (c … h), die Zeile das Vorzeichen — oben ♯, in
 * der Mitte keins, unten ♭ (Entscheid 2026-11-24): erhöht steht oben,
 * erniedrigt unten. So steht cis über c und des unter d, und jeder
 * Name immer an derselben Stelle.
 */
const NOTE_CELL: Record<string, { column: number; alter: number }> = Object.fromEntries(
  STEPS.flatMap((step, index) =>
    [-1, 0, 1].map((alter) => [germanNoteName(step, alter).toLowerCase(), { column: index + 1, alter }]),
  ),
);

/**
 * Platz eines Werts im Raster: ein Tonname («fis») oder eine Tonart («Fis-Dur»,
 * «fis-Moll») — die steht dort, wo ihr Grundton steht.
 */
export function noteCell(value: string): { column: number; alter: number } | undefined {
  return NOTE_CELL[value.replace(/-(dur|moll)$/i, '').toLowerCase()];
}

/** Die Vorzeichen-Zeilen, die vorkommen, von oben nach unten. Leere fallen weg. */
export function noteRows(values: string[]): number[] {
  const present = new Set(values.map((value) => noteCell(value)?.alter));
  return [1, 0, -1].filter((alter) => present.has(alter));
}

/** CSS-Platz eines Werts im Raster, oder nichts, wenn er kein Tonname ist. */
export function noteGridPlace(value: string, rows: number[]): { gridColumn: number; gridRow: number } | undefined {
  const cell = noteCell(value);
  return cell ? { gridColumn: cell.column, gridRow: rows.indexOf(cell.alter) + 1 } : undefined;
}
