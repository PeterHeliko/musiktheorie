/**
 * Intervalle auf der Klaviatur — benennen und spielen, grob und fein.
 *
 * Die Klaviatur hat zwei Oktaven, c bis h¹ (`INTERVAL_KEYBOARD`), ohne
 * Beschriftung.
 *
 *  - Grobbestimmung: nur weisse Tasten. Auf ihnen legt das Abzählen die
 *    Grösse eindeutig fest, wie die Stammtöne im Notenbild. Eine schwarze
 *    Taste hätte keine: c–dis ist eine Sekunde, c–es eine Terz.
 *  - Feinbestimmung: der Abstand in Halbtönen. Eine Taste hat keine
 *    Schreibweise, deshalb gibt es hier nur die Antworten des Rasters —
 *    übermässige Quarte und verminderte Quinte sind derselbe Tritonus.
 *
 * Benennen: zwei Tasten tragen einen Punkt, gefragt ist das Intervall. Die
 * Klaviatur bleibt dabei stumm (Entscheid 2026-11-23): geübt wird das
 * Abzählen, nicht das Gehör.
 *
 * Spielen: eine Taste trägt einen Punkt, dazu das verlangte Intervall.
 * Angetippt wird die Zieltaste — sie erklingt — und «Prüfen» gibt sie ab.
 */

import {
  DEFAULT_INTERVAL_SIZES,
  DEFAULT_INTERVALS,
  INTERVAL_OPTIONS,
  INTERVAL_SIZE_OPTIONS,
  SEMITONE_ANSWERS,
  intervalSizeAnswer,
  intervalSizeNumber,
} from '../content/options';
import type { KeyboardTask, SelectOption, SelectTask } from '../content/schema';
import { INTERVAL_KEYBOARD, isWhiteKey, keysBetween, whiteIndex, whiteKeyAt } from '../music/piano';
import { intervalBetween, midi, parseIntervalLabel, parsePitch, transposeByInterval } from '../music/theory';
import { pitchFromMidi } from '../sing/notes';
import type { Rng } from './rng';
import { insist, intervalField, intervalLabelsFor, intervalSizeField, taskId } from './shared';
import { multi, single, type FilterValues, type Generator, type Question } from './types';

const ALL_KEYS = keysBetween(INTERVAL_KEYBOARD.low, INTERVAL_KEYBOARD.high);
const WHITE_KEYS = ALL_KEYS.filter(isWhiteKey);

function onKeyboard(key: number): boolean {
  return key >= INTERVAL_KEYBOARD.low && key <= INTERVAL_KEYBOARD.high;
}

const DIRECTION_FILTER = {
  kind: 'single' as const,
  key: 'direction',
  label: 'Richtung',
  options: [
    { value: 'frei', label: 'frei' },
    { value: 'up', label: 'nur aufwärts' },
    { value: 'down', label: 'nur abwärts' },
  ],
};

const KEY_COLOUR_OPTIONS: SelectOption[] = [
  { value: 'weiss', label: 'nur weisse' },
  { value: 'alle', label: 'weisse und schwarze' },
];

/** Anweisung beim Spielen, je nach Richtung. */
function playInstruction(direction: string): string {
  if (direction === 'up') return 'Tippe die Taste an, die das verlangte Intervall ÜBER der markierten Taste bildet.';
  if (direction === 'down') return 'Tippe die Taste an, die das verlangte Intervall UNTER der markierten Taste bildet.';
  return (
    'Tippe die Taste an, die mit der markierten das verlangte Intervall bildet. ' +
    'Entscheide selbst, ob du auf- oder abwärts gehst.'
  );
}

/** Bei fester Richtung gehört sie zur Aufgabe: ohne sie ist die Antwort nicht eindeutig. */
function playContext(direction: string, number: number): string | undefined {
  if (number === 1) return undefined;
  if (direction === 'up') return 'über der markierten Taste';
  if (direction === 'down') return 'unter der markierten Taste';
  return undefined;
}

/** Zieltasten in den erlaubten Richtungen, ohne Doppelte (bei der Prime fallen beide zusammen). */
function accepted(direction: string, up: number | null, down: number | null): number[] {
  const keys: number[] = [];
  if (direction !== 'down' && up !== null) keys.push(up);
  if (direction !== 'up' && down !== null) keys.push(down);
  return [...new Set(keys)];
}

/** Gibt es in der verlangten Richtung eine Zieltaste? */
function reachable(direction: string, up: number | null, down: number | null): boolean {
  if (direction === 'up') return up !== null;
  if (direction === 'down') return down !== null;
  return up !== null || down !== null;
}

// ---------------------------------------------------------------------------
// Grobbestimmung: weisse Tasten abzählen
// ---------------------------------------------------------------------------

/** Die weisse Taste `number - 1` weisse Tasten neben `key`, oder null ausserhalb der Klaviatur. */
function whiteStepsAway(key: number, number: number, sign: 1 | -1): number | null {
  const target = whiteKeyAt(whiteIndex(key)! + sign * (number - 1));
  return onKeyboard(target) ? target : null;
}

/**
 * Unabhängig nachgerechnet: beide Tasten weiss, und als Stammtöne gelesen
 * bilden sie nach dem Theoriekern die verlangte Grösse.
 */
function checkSize(a: number, b: number, number: number): void {
  const measured = intervalBetween(pitchFromMidi(a), pitchFromMidi(b)).number;
  insist(
    isWhiteKey(a) && isWhiteKey(b) && measured === number,
    `Tasten ${a}–${b} bilden eine ${measured}, verlangt war eine ${number}`,
  );
}

interface GrobNamingFilters extends FilterValues {
  intervals: string[];
}

export const intervalleGrobKlaviaturBenennen: Generator<GrobNamingFilters> = {
  id: 'intervalle-grob-klaviatur-benennen',
  topic: 'intervalle',
  group: 'grob',
  skill: 'klaviatur',
  version: 1,
  title: 'Intervalle auf Klaviatur benennen',
  instruction: 'Bestimme die Grösse des Intervalls zwischen den markierten Tasten.',
  hint: 'Zähle nur die weissen Tasten, und zähle beide markierten mit: von c bis e ist eine Terz.',

  filters: [{ kind: 'multi', key: 'intervals', label: 'Abgefragte Intervalle', options: INTERVAL_SIZE_OPTIONS }],

  defaults: { intervals: DEFAULT_INTERVAL_SIZES },

  generate(values, rng: Rng): Question {
    const sizes = multi(values, 'intervals', this.defaults.intervals);
    const size = rng.pick(sizes);
    const number = intervalSizeNumber(size);

    const pairs = WHITE_KEYS.map((low) => ({ low, high: whiteStepsAway(low, number, 1) })).filter(
      (pair): pair is { low: number; high: number } => pair.high !== null,
    );
    insist(pairs.length > 0, `keine weissen Tasten für eine ${number}`);

    const { low, high } = rng.pick(pairs);
    checkSize(low, high, number);
    insist(intervalSizeAnswer(number) === size, `${number} ist nicht «${size}»`);

    const task: SelectTask = {
      id: taskId('kgb', rng),
      kind: 'select',
      keyboard: { ...INTERVAL_KEYBOARD, marked: [low, high] },
      fields: [intervalSizeField(size, sizes)],
    };
    return { task };
  },
};

interface GrobPlayingFilters extends FilterValues {
  intervals: string[];
  direction: string;
}

export const intervalleGrobKlaviaturSpielen: Generator<GrobPlayingFilters> = {
  id: 'intervalle-grob-klaviatur-spielen',
  topic: 'intervalle',
  group: 'grob',
  skill: 'klaviatur',
  version: 1,
  title: 'Intervalle auf Klaviatur spielen',
  instruction: playInstruction('frei'),
  hint: 'Es zählen nur die weissen Tasten. Die angetippte Taste erklingt; mit «Prüfen» gibst du sie ab.',

  filters: [
    { kind: 'multi', key: 'intervals', label: 'Abgefragte Intervalle', options: INTERVAL_SIZE_OPTIONS },
    DIRECTION_FILTER,
  ],

  defaults: { intervals: DEFAULT_INTERVAL_SIZES, direction: 'frei' },

  generate(values, rng: Rng): Question {
    const sizes = multi(values, 'intervals', this.defaults.intervals);
    const direction = single(values, 'direction', 'frei');
    const size = rng.pick(sizes);
    const number = intervalSizeNumber(size);

    const starts = WHITE_KEYS.map((start) => ({
      start,
      up: whiteStepsAway(start, number, 1),
      down: whiteStepsAway(start, number, -1),
    })).filter(({ up, down }) => reachable(direction, up, down));
    insist(starts.length > 0, `keine Starttaste für eine ${number}`);

    const chosen = rng.pick(starts);
    const accept = accepted(direction, chosen.up, chosen.down);
    for (const key of accept) checkSize(chosen.start, key, number);

    const task: KeyboardTask = {
      id: taskId('kgs', rng),
      kind: 'keyboard',
      prompt: INTERVAL_SIZE_OPTIONS[number - 1].label,
      keyboard: { ...INTERVAL_KEYBOARD, marked: [chosen.start] },
      accept,
      whiteOnly: true,
      sound: true,
      describe: { from: chosen.start, by: 'steps' },
      points: 2,
    };
    return {
      task,
      instruction: playInstruction(direction),
      context: playContext(direction, number),
    };
  },
};

// ---------------------------------------------------------------------------
// Feinbestimmung: Halbtöne
// ---------------------------------------------------------------------------

/**
 * Halbtöne eines Intervall-Filterwerts, aus dem Theoriekern (über c¹
 * gebaut) — und gegen die Antworttabelle geprüft, damit sich die beiden
 * nicht still widersprechen.
 */
function semitonesOf(value: string): number {
  const c1 = parsePitch('c4');
  const semitones = midi(transposeByInterval(c1, parseIntervalLabel(intervalLabelsFor(value)[0]))) - midi(c1);
  insist(SEMITONE_ANSWERS[semitones] === value, `«${value}» hat ${semitones} Halbtöne`);
  return semitones;
}

/** Name eines Intervall-Filterwerts, wie auf dem Antwortraster («kleine Terz», «Tritonus»). */
function intervalName(value: string): string {
  const option = INTERVAL_OPTIONS.find((entry) => entry.value === value);
  insist(option !== undefined, `unbekanntes Intervall «${value}»`);
  return option!.label;
}

interface FeinNamingFilters extends FilterValues {
  intervals: string[];
  keyColours: string;
}

export const intervalleKlaviaturBenennen: Generator<FeinNamingFilters> = {
  id: 'intervalle-klaviatur-benennen',
  topic: 'intervalle',
  group: 'fein',
  skill: 'klaviatur',
  version: 1,
  title: 'Intervalle auf Klaviatur benennen',
  instruction: 'Bestimme das Intervall zwischen den markierten Tasten.',
  hint: 'Zähle die Halbtöne: jede Taste, auch die schwarzen, liegt einen Halbton weiter.',

  filters: [
    { kind: 'multi', key: 'intervals', label: 'Abgefragte Intervalle', options: INTERVAL_OPTIONS },
    { kind: 'single', key: 'keyColours', label: 'Tasten', options: KEY_COLOUR_OPTIONS },
  ],

  defaults: { intervals: DEFAULT_INTERVALS, keyColours: 'alle' },

  generate(values, rng: Rng): Question {
    const intervals = multi(values, 'intervals', this.defaults.intervals);
    const whiteOnly = single(values, 'keyColours', 'alle') === 'weiss';
    const value = rng.pick(intervals);
    const semitones = semitonesOf(value);

    const pairs = (whiteOnly ? WHITE_KEYS : ALL_KEYS)
      .map((low) => ({ low, high: low + semitones }))
      .filter(({ high }) => onKeyboard(high) && (!whiteOnly || isWhiteKey(high)));
    insist(pairs.length > 0, `keine Tasten für «${value}»`);

    const { low, high } = rng.pick(pairs);
    insist(SEMITONE_ANSWERS[high - low] === value, `Tasten ${low}–${high} sind nicht «${value}»`);

    const task: SelectTask = {
      id: taskId('kfb', rng),
      kind: 'select',
      keyboard: { ...INTERVAL_KEYBOARD, marked: [low, high] },
      fields: [intervalField(value, intervals)],
    };
    return { task };
  },
};

interface FeinPlayingFilters extends FilterValues {
  intervals: string[];
  direction: string;
  keyColours: string;
}

export const intervalleKlaviaturSpielen: Generator<FeinPlayingFilters> = {
  id: 'intervalle-klaviatur-spielen',
  topic: 'intervalle',
  group: 'fein',
  skill: 'klaviatur',
  version: 1,
  title: 'Intervalle auf Klaviatur spielen',
  instruction: playInstruction('frei'),
  hint: 'Jede Taste, auch die schwarzen, liegt einen Halbton weiter. Die angetippte Taste erklingt; mit «Prüfen» gibst du sie ab.',

  filters: [
    { kind: 'multi', key: 'intervals', label: 'Abgefragte Intervalle', options: INTERVAL_OPTIONS },
    DIRECTION_FILTER,
    { kind: 'single', key: 'keyColours', label: 'Starttaste', options: KEY_COLOUR_OPTIONS },
  ],

  defaults: { intervals: DEFAULT_INTERVALS, direction: 'frei', keyColours: 'alle' },

  generate(values, rng: Rng): Question {
    const intervals = multi(values, 'intervals', this.defaults.intervals);
    const direction = single(values, 'direction', 'frei');
    const whiteOnly = single(values, 'keyColours', 'alle') === 'weiss';
    const value = rng.pick(intervals);
    const semitones = semitonesOf(value);
    const away = (key: number) => (onKeyboard(key) ? key : null);

    const starts = (whiteOnly ? WHITE_KEYS : ALL_KEYS)
      .map((start) => ({ start, up: away(start + semitones), down: away(start - semitones) }))
      .filter(({ up, down }) => reachable(direction, up, down));
    insist(starts.length > 0, `keine Starttaste für «${value}»`);

    const chosen = rng.pick(starts);
    const accept = accepted(direction, chosen.up, chosen.down);
    for (const key of accept) {
      insist(
        SEMITONE_ANSWERS[Math.abs(key - chosen.start)] === value,
        `Tasten ${chosen.start}–${key} sind nicht «${value}»`,
      );
    }

    const task: KeyboardTask = {
      id: taskId('kfs', rng),
      kind: 'keyboard',
      prompt: intervalName(value),
      keyboard: { ...INTERVAL_KEYBOARD, marked: [chosen.start] },
      accept,
      sound: true,
      describe: { from: chosen.start, by: 'semitones' },
      points: 2,
    };
    return {
      task,
      instruction: playInstruction(direction),
      context: playContext(direction, semitones === 0 ? 1 : 2),
    };
  },
};
