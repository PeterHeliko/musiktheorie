/**
 * Stimmlage — wo die Töne einer Singübung liegen.
 *
 * Eine persönliche Einstellung (CONCEPT §6): sie bleibt auf dem Gerät und
 * steht nie in einem Link. Wer einen geteilten Link öffnet, singt in der
 * eigenen Lage — dasselbe Intervall, nur der Ausgangston liegt anders.
 *
 * Die Bereiche sind klingend, in MIDI-Nummern, und fassen Ausgangs- UND
 * Zielton. Weil die Oktave beim Singen nicht zählt (judge.ts), müssen sie
 * nicht jede Stimme genau treffen: wer eine Oktave tiefer singt als notiert,
 * etwa ein Tenor im mittleren Bereich, liegt trotzdem richtig.
 */

import type { SelectOption } from '../content/schema';

export type Voice = 'hoch' | 'mittel' | 'tief';

export const DEFAULT_VOICE: Voice = 'mittel';

export const VOICE_RANGES: Record<Voice, { low: number; high: number; clef: 'treble' | 'bass' }> = {
  // c¹–g²
  hoch: { low: 60, high: 79, clef: 'treble' },
  // g–d²
  mittel: { low: 55, high: 74, clef: 'treble' },
  // G–d¹
  tief: { low: 43, high: 62, clef: 'bass' },
};

export const VOICE_OPTIONS: SelectOption[] = [
  { value: 'hoch', label: 'hoch (c¹–g²)' },
  { value: 'mittel', label: 'mittel (g–d²)' },
  { value: 'tief', label: 'tief (G–d¹)' },
];

export function isVoice(value: unknown): value is Voice {
  return value === 'hoch' || value === 'mittel' || value === 'tief';
}
