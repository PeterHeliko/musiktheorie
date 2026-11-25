/**
 * Gehörte Melodie auf Klaviatur spielen (Entscheide 2026-11-25).
 *
 * Wie das Generierte Melodiediktat, nur wird auf der Klaviatur gespielt statt
 * notiert: dieselbe Melodie (`melodie-shared.ts`), dieselben Einstellungen,
 * dasselbe Vorspiel. Die Klaviatur umfasst die zwei Oktaven des Schlüssels
 * (`CLEF_WINDOWS`), c¹ bis h² oder C bis h; die erste Taste der Melodie ist
 * blau markiert.
 *
 * Darüber steht das System mit einem leeren Platz je Ton, der erste Ton schon
 * darin. Jede angetippte Taste klingt und füllt den nächsten leeren Platz,
 * geschrieben, wie die Tonart sie schreibt (`keySpelling`: fis in D-Dur, b in
 * F-Dur; chromatisch mit ♯); sind alle voll, klingt sie nur noch.
 * Zurücknehmen gibt es nicht.
 *
 * Jeder Ton gibt einen Punkt, der vorgegebene erste keinen; ein leerer Platz
 * ist falsch. Nach dem Prüfen ist jeder gespielte Ton grün oder rot, und war
 * etwas falsch, steht die Melodie grün in einem zweiten System darunter.
 */

import type { KeyboardTask, SelectOption } from '../content/schema';
import { MAJOR_MINOR } from '../music/scales';
import { midi } from '../music/theory';
import { CLEF_FILTER } from './dreiklaenge-shared';
import {
  CLEF_WINDOWS,
  DEFAULT_LISTENING_TEMPO,
  LIMITED_PLAYS,
  LIMIT_PLAYS_FILTER,
  SCALE_OPTIONS,
  TEMPO_FILTER,
  intervalFilters,
  keySpelling,
  listeningEvents,
  melodyPlaces,
  onlyChromatic,
  pickScale,
  preludeFilter,
  preludeText,
  rollMelody,
} from './melodie-shared';
import type { Rng } from './rng';
import { pitchKey, taskId } from './shared';
import { MAX_ACCIDENTALS_FILTER } from './tonleitern';
import { multi, range, toggle, type FilterValues, type Generator, type Question } from './types';

/** Der grösste Tonumfang: die ganze Klaviatur. */
const WHOLE_KEYBOARD: SelectOption = { value: 'klaviatur', label: 'Gesamte Klaviatur' };

const PLAY_TEXT = 'Spiele sie auf der Klaviatur nach; der erste Ton ist blau markiert und steht schon im System.';

const HINT =
  'Jede angetippte Taste klingt und kommt in den nächsten leeren Platz. Zurücknehmen geht nicht; sind alle Plätze voll, klingen die Tasten nur noch.';

interface Filters extends FilterValues {
  scales: string[];
  maxAccidentals: number;
  length: number;
  span: string;
  maxLeap: string;
  clefs: string[];
  prelude: string;
  tempo: number;
  limitPlays: boolean;
}

export const melodieKlaviatur: Generator<Filters> = {
  id: 'gehoerte-melodie-klaviatur-spielen',
  topic: 'melodie',
  skill: 'klaviatur',
  version: 1,
  title: 'Gehörte Melodie auf Klaviatur spielen',
  instruction: `${preludeText('kadenz', 'die Melodie')} ${PLAY_TEXT}`,
  hint: HINT,

  filters: [
    { kind: 'multi', key: 'scales', label: 'Skala', options: SCALE_OPTIONS },
    {
      ...MAX_ACCIDENTALS_FILTER,
      disabledBy: (values) => (onlyChromatic(values) ? 'Chromatisch steht ohne Tonart.' : null),
    },
    { kind: 'range', key: 'length', label: 'Länge', min: 4, max: 12, unit: 'Töne' },
    ...intervalFilters(WHOLE_KEYBOARD),
    CLEF_FILTER,
    preludeFilter('Chromatisch erklingt nur die Melodie.'),
    TEMPO_FILTER,
    LIMIT_PLAYS_FILTER,
  ],

  defaults: {
    scales: MAJOR_MINOR,
    maxAccidentals: 4,
    length: 8,
    span: '7',
    maxLeap: '4',
    clefs: ['treble'],
    prelude: 'kadenz',
    tempo: DEFAULT_LISTENING_TEMPO,
    limitPlays: false,
  },

  generate(values, rng: Rng): Question {
    const scale = pickScale(values, rng);
    const clef = rng.pick(multi(values, 'clefs', this.defaults.clefs)) as 'treble' | 'bass';
    const window = CLEF_WINDOWS[clef] ?? CLEF_WINDOWS.treble;
    const { pitches: melody, prompt, signature, prelude, sounds } = rollMelody(values, rng, scale, window, WHOLE_KEYBOARD);
    const tempo = Math.round(range(values, 'tempo', DEFAULT_LISTENING_TEMPO));
    const limitPlays = toggle(values, 'limitPlays', false);
    const keys = melody.map(midi);
    const id = taskId('gmk', rng);

    const task: KeyboardTask = {
      id,
      kind: 'keyboard',
      prompt,
      keyboard: { low: window.low, high: window.high, marked: [keys[0]] },
      // Nur zum Ansehen: es darf klein werden, die Klaviatur geht vor.
      score: melodyPlaces(melody, { clef, signature, window, fit: { maxScale: 2 } }),
      accept: keys.slice(1),
      sound: true,
      melody: { written: melody.slice(1).map(pitchKey), spelling: keySpelling(melody, signature) },
      describe: { by: 'melody' },
      // Ein Punkt je Ton; der vorgegebene erste zählt nicht.
      points: melody.length - 1,
    };

    const instruction = `${preludeText(prelude, 'die Melodie')} ${PLAY_TEXT}`;
    return {
      task,
      audio: { id, kind: 'melody', tempo, countIn: false },
      melody: listeningEvents(melody, sounds, tempo),
      ...(limitPlays ? { maxPlays: LIMITED_PLAYS } : {}),
      ...(instruction !== this.instruction ? { instruction } : {}),
    };
  },
};
