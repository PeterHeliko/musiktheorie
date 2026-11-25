/**
 * Generiertes Melodiediktat: eine gehörte Melodie notieren, ohne Rhythmus
 * (Entscheide 2026-11-25).
 *
 * Die Melodie kommt aus `melodie-shared.ts`, wie beim Singen, aber in zwei
 * Oktaven, die im Schlüssel gut zu lesen sind (`CLEF_WINDOWS`). Erst
 * erklingt, was unter «Vor Beginn spielen» gewählt ist, dann die Melodie,
 * ein Ton je Schlag im eingestellten Tempo; wiederholen lässt sie sich, mit
 * «Wiedergaben begrenzen» dreimal.
 *
 * Im System steht ein leerer Platz je Ton, der erste Ton schon darin, wie
 * beim Tonleiter notieren: gesetzt wird in den blauen Platz, danach rückt er
 * weiter. Gesetzte Töne klingen nicht: geübt wird das innere Hören.
 *
 *  - In Dur und Moll steht die Tonart vorgezeichnet und gilt beim Setzen (ein
 *    Ton auf der F-Linie ist in D-Dur fis); ♭ ♮ ♯ braucht es nur für Töne,
 *    die abweichen, die erhöhte Sexte und Septime in Moll. Richtig ist nur
 *    die Schreibweise der Tonart.
 *  - Chromatisch steht ohne Tonart, jedes Vorzeichen vor seiner Note; eine
 *    schwarze Taste ist in beiden Schreibweisen richtig (cis wie des).
 *
 * Jeder Ton gibt einen Punkt, der vorgegebene erste keinen; ein leerer Platz
 * ist falsch. Nach dem Prüfen ist jeder gesetzte Ton grün oder rot, und war
 * etwas falsch, steht die Melodie grün in einem zweiten System darunter.
 */

import type { NotationTask, SelectOption } from '../content/schema';
import { MAJOR_MINOR } from '../music/scales';
import { CLEF_FILTER } from './dreiklaenge-shared';
import {
  CLEF_WINDOWS,
  DEFAULT_LISTENING_TEMPO,
  LIMITED_PLAYS,
  LIMIT_PLAYS_FILTER,
  SCALE_OPTIONS,
  TEMPO_FILTER,
  blackKeySpellings,
  intervalFilters,
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

/** Der grösste Tonumfang: das ganze Fenster des Schlüssels. */
const TWO_OCTAVES: SelectOption = { value: 'zwei-oktaven', label: 'Zwei Oktaven' };

const WRITE_TEXT = 'Notiere sie; der erste Ton steht schon da.';

const KEY_HINT =
  'Ziehe auf die Tonhöhe, gern auch neben der Note. Gesetzt wird beim Loslassen in den blauen Platz; die Nummern wählen einen anderen. ' +
  'Die Tonart gilt von selbst: ♭, ♮ oder ♯ wählst du nur für einen Ton, der von ihr abweicht.';

const CHROMATIC_HINT =
  'Wähle ♭, ♮ oder ♯ für den nächsten Ton und ziehe ihn auf seine Tonhöhe, gern auch neben der Note. ' +
  'Gesetzt wird beim Loslassen in den blauen Platz; die Nummern wählen einen anderen. Ohne Tonart zählen beide Schreibweisen, cis wie des.';

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

export const melodieDiktat: Generator<Filters> = {
  id: 'generiertes-melodiediktat',
  topic: 'melodie',
  skill: 'hoeren',
  version: 1,
  title: 'Generiertes Melodiediktat',
  instruction: `${preludeText('kadenz', 'die Melodie')} ${WRITE_TEXT}`,
  hint: KEY_HINT,

  filters: [
    { kind: 'multi', key: 'scales', label: 'Skala', options: SCALE_OPTIONS },
    {
      ...MAX_ACCIDENTALS_FILTER,
      disabledBy: (values) => (onlyChromatic(values) ? 'Chromatisch steht ohne Tonart.' : null),
    },
    { kind: 'range', key: 'length', label: 'Länge', min: 4, max: 12, unit: 'Töne' },
    ...intervalFilters(TWO_OCTAVES),
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
    const { pitches: melody, prompt, signature, prelude, sounds } = rollMelody(values, rng, scale, window, TWO_OCTAVES);
    const tempo = Math.round(range(values, 'tempo', DEFAULT_LISTENING_TEMPO));
    const limitPlays = toggle(values, 'limitPlays', false);
    const keyed = signature !== null;
    const id = taskId('gmd', rng);

    const task: NotationTask = {
      id,
      kind: 'notation',
      mode: 'pitch',
      prompt,
      // Ein Punkt je Ton; der vorgegebene erste zählt nicht.
      points: melody.length - 1,
      // In ein System, in das gesetzt wird, muss man noch treffen.
      score: melodyPlaces(melody, { clef, signature, window, fit: { maxScale: 2, minScale: 1 } }),
      solution: {
        type: 'pitch',
        // Die eigene Schreibweise zuerst: sie steht nach einem Fehler im
        // System darunter.
        slots: melody.slice(1).map((pitch, index) => ({
          slot: index + 1,
          accept: (keyed ? [pitch] : [pitch, ...blackKeySpellings(pitch).filter((other) => other.step !== pitch.step)]).map(
            pitchKey,
          ),
        })),
      },
    };

    const instruction = `${preludeText(prelude, 'die Melodie')} ${WRITE_TEXT}`;
    const hint = keyed ? KEY_HINT : CHROMATIC_HINT;
    return {
      task,
      audio: { id, kind: 'melody', tempo, countIn: false },
      melody: listeningEvents(melody, sounds, tempo),
      ...(limitPlays ? { maxPlays: LIMITED_PLAYS } : {}),
      ...(instruction !== this.instruction ? { instruction } : {}),
      ...(hint !== this.hint ? { hint } : {}),
    };
  },
};
