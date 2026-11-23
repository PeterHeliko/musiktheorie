/**
 * Übungszustand ↔ Adresszeile.
 *
 * Jede Übung lässt sich als Link weitergeben — mit ihren Einstellungen, und auf
 * Wunsch mit genau der Aufgabe oder Runde, die gerade dasteht:
 *
 *   /ueben/intervalle-hoeren/
 *   /ueben/intervalle-hoeren/?intervalle=k3,g3&richtung=ab
 *   /ueben/intervalle-hoeren/?intervalle=k3,g3&richtung=ab&aufgabe=1kx9q2&v=1
 *   /ueben/stufen-bestimmen/?runde=10&aufgabe=8f3k2&v=1
 *
 * Drei Regeln, damit Links lange halten:
 *
 *  1. In der Adresszeile steht nur, was von der Vorgabe abweicht. Das hält die
 *     Links kurz, und eine später geänderte Vorgabe wirkt auch auf alte Links.
 *  2. Was sich nicht lesen lässt, fällt still auf die Vorgabe zurück:
 *     unbekannte Parameter, verschwundene Optionen, Zahlen ausserhalb des
 *     Bereichs. Ein alter Link öffnet immer eine Übung, nie eine Fehlerseite.
 *  3. Die Namen hier sind öffentlich. Nach dem Start nicht umbenennen — und
 *     wenn doch, den alten Namen zusätzlich verstehen.
 */

import type { FilterSpec, FilterValues, Generator } from './generators/types';

/**
 * Deutscher Name jedes Filters in der Adresszeile, nach `FilterSpec.key`.
 * Ein Test prüft, dass jeder Filter jeder Übung hier einen Namen hat und dass
 * innerhalb einer Übung keine zwei Filter gleich heissen.
 */
export const PARAM_NAMES: Record<string, string> = {
  accidentals: 'vorzeichen',
  ask: 'gefragt',
  askInversion: 'umkehrung-fragen',
  bars: 'takte',
  clefs: 'schluessel',
  countIn: 'einzaehlen',
  degrees: 'stufen',
  direction: 'richtung',
  directions: 'richtung',
  durations: 'notenwerte',
  fixedRoot: 'ueber-c1',
  gaps: 'gesucht',
  genders: 'tongeschlecht',
  giveFirstNote: 'erster-ton',
  intervals: 'intervalle',
  inversions: 'umkehrungen',
  keys: 'tonarten',
  kinds: 'zeichen',
  limitPlays: 'begrenzt',
  maxAccidentals: 'max-vorzeichen',
  maxLeap: 'sprung',
  playback: 'wiedergabe',
  positions: 'lagen',
  qualities: 'geschlechter',
  scale: 'tonleiter',
  scales: 'tonleitern',
  scaleTypes: 'tonleitern',
  signs: 'art',
  span: 'umfang',
  system: 'system',
  tempo: 'tempo',
  timeSignature: 'taktart',
  tonic: 'grundton',
  width: 'lage',
  wording: 'bezeichnung',
};

/**
 * Optionswerte, die intern englisch heissen, im Link aber deutsch. Alle
 * anderen Werte («k3», «dur», «moll-harmonisch» …) stehen unverändert da.
 */
const VALUE_NAMES: Record<string, string> = {
  up: 'auf',
  down: 'ab',
  treble: 'violin',
  grand: 'klavier',
  note: 'noten',
  rest: 'pausen',
  root: 'grundton',
  quality: 'geschlecht',
  inv: 'umkehrung',
  pos: 'lage',
};

const VALUE_FROM_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(VALUE_NAMES).map(([value, name]) => [name, value]),
);

/** Parameter, die keinem Filter gehören. */
export const RESERVED_PARAMS = ['runde', 'aufgabe', 'v'] as const;

/** Rundengrössen, die ein Link verlangen darf. Die Oberfläche bietet 10/20/30. */
const MIN_ROUND = 1;
const MAX_ROUND = 50;

export interface ExerciseLink {
  filters: FilterValues;
  /** Aufgaben je Runde; `null` = Üben ohne Ende. */
  round: number | null;
  /**
   * Startwert der Aufgabe (ohne Ende) bzw. der ganzen Runde. `null` = keine
   * bestimmte Aufgabe, also neu würfeln.
   */
  seed: number | null;
}

export interface DecodedLink extends ExerciseLink {
  /** Stand irgendetwas zur Übung in der Adresszeile? */
  fromUrl: boolean;
  /**
   * Der Link nannte eine Aufgabe, aber aus einer anderen Fassung des
   * Generators. Dieselbe Aufgabe lässt sich nicht mehr herstellen; die
   * Einstellungen gelten trotzdem.
   */
  outdated: boolean;
}

export function paramName(key: string): string {
  return PARAM_NAMES[key] ?? key;
}

/**
 * Mehrfachauswahlen in Optionsreihenfolge bringen.
 *
 * Wichtiger, als es aussieht: die Generatoren würfeln mit `rng.pick(liste)`,
 * also nach Position. `['h', 'w']` und `['w', 'h']` ergeben beim selben
 * Startwert verschiedene Aufgaben. Der Link schreibt die Werte immer in
 * Optionsreihenfolge — deshalb muss die Seite auch selbst immer in dieser
 * Reihenfolge würfeln, sonst zeigt ein geteilter Aufgabenlink eine andere
 * Aufgabe als die, die geteilt wurde. Jeder Weg, auf dem Filterwerte in die
 * Seite kommen (Link, Speicher, Filterformular), läuft deshalb hier durch.
 */
export function canonicalFilters(
  generator: Generator<FilterValues>,
  values: FilterValues,
): FilterValues {
  const out: FilterValues = { ...values };
  for (const filter of generator.filters) {
    const value = values[filter.key];
    if (filter.kind === 'multi' && Array.isArray(value)) {
      out[filter.key] = filter.options
        .map((option) => option.value)
        .filter((option) => value.includes(option));
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Startwerte
// ---------------------------------------------------------------------------

/** Startwert → kurzer Text, z.B. 2864434397 → «1bk4osd». */
export function encodeSeed(seed: number): string {
  return (seed >>> 0).toString(36);
}

export function decodeSeed(text: string | null): number | null {
  if (!text || !/^[0-9a-z]{1,7}$/.test(text)) return null;
  const value = parseInt(text, 36);
  return value <= 0xffffffff ? value : null;
}

// ---------------------------------------------------------------------------
// Schreiben
// ---------------------------------------------------------------------------

/**
 * Zustand → Abfrageteil der Adresse, mit führendem «?» oder leer.
 *
 * Kommas und Schrägstriche bleiben lesbar stehen (`intervalle=k3,g3`,
 * `taktart=3/4`); beides ist im Abfrageteil erlaubt. `URLSearchParams` würde
 * sie als %2C und %2F verschlüsseln.
 */
export function encodeLink(generator: Generator<FilterValues>, link: ExerciseLink): string {
  const parts: string[] = [];

  for (const filter of generator.filters) {
    const text = encodeFilter(filter, link.filters[filter.key], generator.defaults[filter.key]);
    if (text !== null) parts.push(`${paramName(filter.key)}=${text}`);
  }

  if (link.round !== null) parts.push(`runde=${link.round}`);
  if (link.seed !== null) {
    parts.push(`aufgabe=${encodeSeed(link.seed)}`);
    parts.push(`v=${generator.version}`);
  }

  return parts.length > 0 ? `?${parts.join('&')}` : '';
}

/** Ein Filterwert als Text, oder null, wenn er der Vorgabe entspricht. */
function encodeFilter(
  filter: FilterSpec,
  value: FilterValues[string] | undefined,
  fallback: FilterValues[string],
): string | null {
  if (value === undefined || sameValue(value, fallback)) return null;

  switch (filter.kind) {
    case 'multi': {
      const chosen = new Set(Array.isArray(value) ? value : []);
      // In Optionsreihenfolge, damit derselbe Zustand immer denselben Link gibt.
      return filter.options
        .filter((option) => chosen.has(option.value))
        .map((option) => encodeValue(option.value))
        .join(',');
    }
    case 'single':
      return encodeValue(String(value));
    case 'toggle':
      return value ? 'ja' : 'nein';
    case 'range':
      return String(value);
  }
}

function encodeValue(value: string): string {
  return encodeURIComponent(VALUE_NAMES[value] ?? value)
    .replace(/%2C/gi, ',')
    .replace(/%2F/gi, '/');
}

function sameValue(a: FilterValues[string], b: FilterValues[string]): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item) => b.includes(item));
  }
  return a === b;
}

// ---------------------------------------------------------------------------
// Lesen
// ---------------------------------------------------------------------------

/** Abfrageteil der Adresse → Zustand. Liest nie etwas Ungültiges ein. */
export function decodeLink(generator: Generator<FilterValues>, search: string): DecodedLink {
  const params = new URLSearchParams(search);
  const filters: FilterValues = { ...generator.defaults };
  let fromUrl = false;

  for (const filter of generator.filters) {
    const raw = params.get(paramName(filter.key));
    if (raw === null) continue;
    fromUrl = true;
    const value = decodeFilter(filter, raw);
    if (value !== null) filters[filter.key] = value;
  }

  let round: number | null = null;
  const roundText = params.get('runde');
  if (roundText !== null) {
    fromUrl = true;
    const size = Number(roundText);
    if (Number.isInteger(size) && size >= MIN_ROUND && size <= MAX_ROUND) round = size;
  }

  let seed = decodeSeed(params.get('aufgabe'));
  let outdated = false;
  if (params.has('aufgabe')) fromUrl = true;
  // Ohne «v» gilt der Link als aktuell: lieber eine womöglich andere Aufgabe
  // zeigen als eine Warnung, die meistens unnötig wäre.
  const version = params.get('v');
  if (seed !== null && version !== null && version !== String(generator.version)) {
    seed = null;
    outdated = true;
  }

  return { filters, round, seed, fromUrl, outdated };
}

function decodeFilter(filter: FilterSpec, raw: string): FilterValues[string] | null {
  switch (filter.kind) {
    case 'multi': {
      const allowed = new Set(filter.options.map((option) => option.value));
      const wanted = new Set(raw.split(',').map(decodeValue));
      // In Optionsreihenfolge und ohne Doppelte; Unbekanntes fällt weg.
      const values = filter.options
        .map((option) => option.value)
        .filter((value) => wanted.has(value) && allowed.has(value));
      return values.length >= (filter.min ?? 1) ? values : null;
    }
    case 'single': {
      const value = decodeValue(raw);
      return filter.options.some((option) => option.value === value) ? value : null;
    }
    case 'toggle':
      if (raw === 'ja') return true;
      if (raw === 'nein') return false;
      return null;
    case 'range': {
      const number = Number(raw);
      if (raw.trim() === '' || !Number.isFinite(number)) return null;
      const step = filter.step ?? 1;
      const snapped = filter.min + Math.round((number - filter.min) / step) * step;
      return Math.min(filter.max, Math.max(filter.min, snapped));
    }
  }
}

function decodeValue(text: string): string {
  return VALUE_FROM_NAME[text] ?? text;
}
