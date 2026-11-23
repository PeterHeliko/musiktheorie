/**
 * Intervalle fein bestimmen — die beiden Richtungen derselben Fähigkeit.
 * Gefragt ist das ganze Intervall samt «klein», «gross», «rein» (die
 * Grobbestimmung, nur die Grösse, steht in `intervalle-grob.ts`).
 *
 *  - `intervalle-bestimmen`: zwei Noten stehen da, das Intervall ist zu
 *    benennen.
 *  - `intervalle-notieren`: ein Ton steht da, der zweite ist zu setzen.
 *
 * Beide teilen sich die Tonauswahl aus `shared.ts`, die dafür sorgt, dass
 * beide Töne notierbar bleiben — bei «nur Stammtöne» gibt es für manche
 * Intervalle nur eine Handvoll Lösungen, und die müssen gefunden werden,
 * nicht erwürfelt.
 */

import { INTERVAL_OPTIONS, intervalAnswer } from '../content/options';
import {
  intervalBetween,
  intervalFullName,
  intervalLabel,
  midi,
  parseIntervalLabel,
  transposeByInterval,
  type Pitch,
} from '../music/theory';
import type { Rng } from './rng';
import {
  ACCIDENTAL_OPTIONS,
  CLEF_OPTIONS,
  LEDGER_ROOM,
  WIDTH_OPTIONS,
  candidatePitches,
  altersFor,
  insist,
  intervalLabelsFor,
  intervalNaming,
  intervalWriting,
  pickIntervalPair,
  pitchKey,
  taskId,
  windowFor,
  type AccidentalPolicy,
} from './shared';
import { multi, single, type FilterValues, type Generator, type Question } from './types';

const ALL_INTERVALS = INTERVAL_OPTIONS.map((option) => option.value);

// ---------------------------------------------------------------------------
// Intervalle fein bestimmen
// ---------------------------------------------------------------------------

interface NamingFilters extends FilterValues {
  intervals: string[];
  clefs: string[];
  accidentals: string;
  width: string;
}

export const intervalleBestimmen: Generator<NamingFilters> = {
  id: 'intervalle-bestimmen',
  topic: 'intervalle',
  group: 'fein',
  skill: 'erkennen',
  version: 1,
  title: 'Intervalle fein bestimmen',
  instruction: 'Bestimme das Intervall.',

  filters: [
    { kind: 'multi', key: 'intervals', label: 'Welche Intervalle?', options: INTERVAL_OPTIONS },
    { kind: 'multi', key: 'clefs', label: 'Schlüssel', options: CLEF_OPTIONS },
    { kind: 'single', key: 'accidentals', label: 'Vorzeichen', options: ACCIDENTAL_OPTIONS },
    { kind: 'single', key: 'width', label: 'Lage', options: WIDTH_OPTIONS },
  ],

  defaults: {
    intervals: ALL_INTERVALS,
    clefs: ['treble'],
    accidentals: 'einfach',
    width: 'eng',
  },

  generate(values, rng: Rng): Question {
    const intervals = multi(values, 'intervals', this.defaults.intervals);
    const clefs = multi(values, 'clefs', this.defaults.clefs);
    const policy = single(values, 'accidentals', 'einfach') as AccidentalPolicy;
    const width = single(values, 'width', 'eng');

    const clef = rng.pick(clefs) as 'treble' | 'bass';
    const pair = pickIntervalPair(rng, rng.pick(intervals), windowFor(clef, width), policy);

    // Unabhängig nachrechnen: was im Notenbild steht, muss die hinterlegte
    // Bezeichnung tragen. Lieber hier auffliegen als beim Üben.
    const measured = intervalLabel(intervalBetween(pair.low, pair.high));
    insist(
      intervalAnswer(measured) === intervalAnswer(pair.label),
      `${pitchKey(pair.low)}–${pitchKey(pair.high)} ist ${measured}, hinterlegt war ${pair.label}`,
    );

    return {
      task: intervalNaming(
        taskId('ib', rng),
        [pitchKey(pair.low), pitchKey(pair.high)],
        pair.label,
        clef,
        intervals,
        { clefs, width, policy },
      ),
    };
  },
};

// ---------------------------------------------------------------------------
// Intervalle notieren
// ---------------------------------------------------------------------------

interface WritingFilters extends FilterValues {
  intervals: string[];
  direction: string;
  clefs: string[];
  accidentals: string;
  width: string;
}

export const intervalleNotieren: Generator<WritingFilters> = {
  id: 'intervalle-notieren',
  topic: 'intervalle',
  group: 'fein',
  skill: 'notieren',
  version: 1,
  title: 'Intervalle notieren',
  instruction: 'Ergänze zum vorgegebenen Ton den zweiten Ton des verlangten Intervalls.',
  hint: 'Tippe die Stelle im System an oder ziehe dorthin; das Vorzeichen wählst du vorher in der Werkzeugleiste.',

  filters: [
    { kind: 'multi', key: 'intervals', label: 'Welche Intervalle?', options: INTERVAL_OPTIONS },
    {
      kind: 'single',
      key: 'direction',
      label: 'Richtung',
      options: [
        { value: 'frei', label: 'frei — beides gilt' },
        { value: 'up', label: 'nur aufwärts' },
        { value: 'down', label: 'nur abwärts' },
      ],
      hint: '«Frei» wertet beide Richtungen als richtig — du entscheidest, welche sinnvoller ist.',
    },
    { kind: 'multi', key: 'clefs', label: 'Schlüssel', options: CLEF_OPTIONS },
    { kind: 'single', key: 'accidentals', label: 'Vorzeichen des Starttons', options: ACCIDENTAL_OPTIONS },
    { kind: 'single', key: 'width', label: 'Lage', options: WIDTH_OPTIONS },
  ],

  defaults: {
    intervals: ALL_INTERVALS,
    direction: 'frei',
    clefs: ['treble'],
    accidentals: 'einfach',
    width: 'eng',
  },

  generate(values, rng: Rng): Question {
    const intervals = multi(values, 'intervals', this.defaults.intervals);
    const direction = single(values, 'direction', 'frei');
    const clefs = multi(values, 'clefs', this.defaults.clefs);
    const policy = single(values, 'accidentals', 'einfach') as AccidentalPolicy;
    const width = single(values, 'width', 'eng');

    const clef = rng.pick(clefs) as 'treble' | 'bass';
    const window = windowFor(clef, width);
    const value = rng.pick(intervals);
    const label = rng.pick(intervalLabelsFor(value));
    const interval = parseIntervalLabel(label);

    // Der Zielton darf weiter aussen liegen als der Startton — dafür sind die
    // Hilfslinien da. Setzen lässt er sich aber nur mit b, Kreuz oder ohne:
    // Doppelvorzeichen kennt die Werkzeugleiste nicht. Ein Zielton, der eins
    // bräuchte, ist deshalb nie eine Lösung.
    const reach = { low: window.low - LEDGER_ROOM, high: window.high + LEDGER_ROOM };
    const inReach = (pitch: Pitch | null): pitch is Pitch =>
      pitch !== null && midi(pitch) >= reach.low && midi(pitch) <= reach.high;
    const usable = (pitch: Pitch | null): pitch is Pitch => inReach(pitch) && Math.abs(pitch.alter) <= 1;

    const starts = candidatePitches(window, altersFor(policy))
      .map((start) => ({
        start,
        up: tryTranspose(start, interval, 'up'),
        down: tryTranspose(start, interval, 'down'),
      }))
      .filter(({ up, down }) => {
        if (direction === 'up') return usable(up);
        if (direction === 'down') return usable(down);
        // Bei freier Richtung keine Falle: wer in eine Richtung geht, die im
        // System Platz hat, muss dort auch ankommen können. Sonst sucht man
        // vergeblich nach dem Doppelkreuz, statt umzudrehen.
        const targets = [up, down];
        return targets.some(usable) && targets.every((target) => usable(target) || (target !== null && !inReach(target)));
      });

    insist(
      starts.length > 0,
      `Für «${intervalFullName(interval)}» gibt es in dieser Lage keinen brauchbaren Startton. ` +
        'Lage erweitern oder Richtung freigeben.',
    );

    const chosen = rng.pick(starts);
    const accepted: Pitch[] = [];
    if (direction !== 'down' && usable(chosen.up)) accepted.push(chosen.up);
    if (direction !== 'up' && usable(chosen.down)) accepted.push(chosen.down);

    // Jede akzeptierte Lösung muss wirklich das verlangte Intervall bilden.
    for (const target of accepted) {
      const measured = intervalLabel(intervalBetween(chosen.start, target));
      insist(
        measured === label,
        `${pitchKey(chosen.start)}–${pitchKey(target)} ist ${measured}, verlangt war ${label}`,
      );
    }

    return {
      task: intervalWriting(
        taskId('in', rng),
        intervalFullName(interval),
        pitchKey(chosen.start),
        accepted.map(pitchKey),
        clef,
      ),
      instruction:
        direction === 'frei'
          ? 'Ergänze zum vorgegebenen Ton den zweiten Ton des verlangten Intervalls. Entscheide selbst, ob es sinnvoller ist, auf- oder abwärts zu gehen.'
          : direction === 'up'
            ? 'Ergänze den Ton, der das verlangte Intervall ÜBER dem vorgegebenen Ton bildet.'
            : 'Ergänze den Ton, der das verlangte Intervall UNTER dem vorgegebenen Ton bildet.',
      hint:
        direction === 'frei'
          ? 'Beide Richtungen werden als richtig gewertet. Achte auf das passende Vorzeichen.'
          : 'Achte auf das passende Vorzeichen.',
      // Bei fester Richtung gehört sie zur Aufgabe: ohne sie ist die Antwort
      // nicht eindeutig.
      context:
        direction === 'up'
          ? 'über dem vorgegebenen Ton'
          : direction === 'down'
            ? 'unter dem vorgegebenen Ton'
            : undefined,
    };
  },
};

/** Nicht jedes Intervall lässt sich über jedem Ton benennen. */
function tryTranspose(from: Pitch, interval: ReturnType<typeof parseIntervalLabel>, direction: 'up' | 'down') {
  try {
    return transposeByInterval(from, interval, direction);
  } catch {
    return null;
  }
}
