/**
 * Generierte Melodie singen: eine Melodie vom Blatt (Entscheide 2026-11-25).
 *
 * Die Melodie selbst kommt aus `melodie-shared.ts`, in der Stimmlage. Ohne
 * Rhythmus: gleich lange Töne, ganze Noten ohne Taktart. Eine Übung mit
 * Rhythmus folgt später.
 *
 * Die Melodie steht von Anfang an ganz im System, mit den Vorzeichen der
 * Tonart; blau ist der Ton, der als Nächstes dran ist (`SingTask.notated`).
 * Vor dem Anfangston erklingt, was unter «Vor Beginn spielen» gewählt ist:
 * nichts, der Grundton, eine Kadenz, die Tonleiter bis zur Quinte und zurück
 * oder der Grundton-Akkord. Chromatisch erklingt nur der Anfangston. Gesungen
 * wird Ton für Ton wie bei den Tonleitern (`judgeSequence`), mit Metronom ein
 * Ton je Schlag (`judgeTimed`). Bewertet wird jeder Ton für sich: richtig ist,
 * was auf Anhieb stimmte (Entscheid 2026-11-27).
 */

import type { NoteSpec, SelectOption, SingTask } from '../content/schema';
import { MAJOR_MINOR } from '../music/scales';
import { staffSpace } from '../music/staff-space';
import { vexKeySignature } from '../music/theory';
import { DEFAULT_VOICE, VOICE_RANGES } from '../sing/voice';
import { CLEF_FILTER, SING_DEFAULTS, SING_FILTERS, SING_HINT, metronomeOf, withTempo } from './dreiklaenge-shared';
import {
  SCALE_OPTIONS,
  intervalFilters,
  onlyChromatic,
  pickScale,
  preludeFilter,
  preludeText,
  rollMelody,
} from './melodie-shared';
import type { Rng } from './rng';
import { candidatePitches, pitchKey, taskId } from './shared';
import { MAX_ACCIDENTALS_FILTER } from './tonleitern';
import { multi, single, type FilterValues, type Generator, type Personal, type Question } from './types';

/** Der grösste Tonumfang: die ganze Stimmlage. */
const WHOLE_VOICE: SelectOption = { value: 'stimmlage', label: 'Gesamte Stimmlage' };

const SING_TEXT =
  'Singe die Melodie Ton für Ton; den Anfangston darfst du mitsingen. Blau ist der Ton, der als Nächstes dran ist.';

/** So lange muss ein Ton gehalten sein, bis er zählt (ms) — wie bei den Tonleitern. */
const MELODY_HOLD_MS = 500;

/** Zeichenbreite je Ganze im System (chromatisch mit Vorzeichen davor), und je Vorzeichen der Tonart. */
const NOTE_ROOM = 42;
const CHROMATIC_NOTE_ROOM = 50;
const SIGNATURE_ROOM = 11;

interface Filters extends FilterValues {
  scales: string[];
  maxAccidentals: number;
  length: number;
  span: string;
  maxLeap: string;
  clefs: string[];
  prelude: string;
  tolerance: string;
  metronome: string;
}

export const melodieSingen: Generator<Filters> = {
  id: 'generierte-melodie-singen',
  topic: 'melodie',
  skill: 'singen',
  version: 2,
  title: 'Generierte Melodie singen',
  instruction: `${preludeText('kadenz', 'den Anfangston')} ${SING_TEXT}`,
  hint: SING_HINT,

  filters: [
    { kind: 'multi', key: 'scales', label: 'Skala', options: SCALE_OPTIONS },
    {
      ...MAX_ACCIDENTALS_FILTER,
      disabledBy: (values) => (onlyChromatic(values) ? 'Chromatisch steht ohne Tonart.' : null),
    },
    { kind: 'range', key: 'length', label: 'Länge', min: 4, max: 12, unit: 'Töne' },
    ...intervalFilters(WHOLE_VOICE),
    CLEF_FILTER,
    preludeFilter('Chromatisch erklingt nur der Anfangston.'),
    ...SING_FILTERS.filter((filter) => filter.key !== 'clefs'),
  ],

  defaults: {
    scales: MAJOR_MINOR,
    maxAccidentals: 4,
    length: 8,
    span: '7',
    maxLeap: '4',
    prelude: 'kadenz',
    ...SING_DEFAULTS,
  },

  generate(values, rng: Rng, personal?: Personal): Question {
    const scale = pickScale(values, rng);
    const clef = rng.pick(multi(values, 'clefs', this.defaults.clefs)) as 'treble' | 'bass';
    const tolerance = Number(single(values, 'tolerance', '50'));
    const voiceRange = VOICE_RANGES[personal?.voice ?? DEFAULT_VOICE];
    const tempo = metronomeOf(values);
    const { pitches: melody, prompt, signature, prelude, sounds } = rollMelody(values, rng, scale, voiceRange, WHOLE_VOICE);

    const notes: NoteSpec[] = melody.map((pitch) => ({ keys: [pitchKey(pitch)], duration: 'w' }));
    // Platz über und unter dem System: so viel, wie die Stimmlage braucht,
    // für alle Aufgaben gleich; ragt die Melodie hinaus, mehr.
    const base = staffSpace(clef, candidatePitches({ low: voiceRange.low - 1, high: voiceRange.high + 1 }, [-1, 0, 1]));
    const needed = staffSpace(clef, melody);
    const room = signature === null ? CHROMATIC_NOTE_ROOM : NOTE_ROOM;

    const task: SingTask = {
      id: taskId('gms', rng),
      kind: 'sing',
      prompt,
      score: {
        clef,
        ...(signature !== null ? { keySignature: vexKeySignature(signature) } : {}),
        accidentalsByKey: true,
        width: 100 + SIGNATURE_ROOM * Math.abs(signature ?? 0) + room * melody.length,
        scale: 1.6,
        space: { above: Math.max(base.above, needed.above), below: Math.max(base.below, needed.below) },
        endBar: true,
        measures: [{ notes }],
      },
      reference: pitchKey(melody[0]),
      target: pitchKey(melody[melody.length - 1]),
      sequence: melody.map(pitchKey),
      tolerance,
      ...(tempo ? { tempo } : {}),
      melodic: true,
      notated: true,
      holdMs: MELODY_HOLD_MS,
      ...(sounds ? { prelude: sounds } : {}),
      // Ein Punkt je gewertetem Ton; Ton für Ton zählt der Anfangston nicht.
      points: tempo ? melody.length : melody.length - 1,
    };

    const said = `${preludeText(prelude, 'den Anfangston')} ${SING_TEXT}`;
    const instruction = tempo ? withTempo(task, said) : said;
    return { task, ...(instruction !== this.instruction ? { instruction } : {}) };
  },
};
