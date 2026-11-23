/**
 * Was die Übungsseite über Besuche hinweg behält.
 *
 * Absichtlich wenig: Filter, Übungsform, eine Trefferquote je Übung und ob
 * die Erklärung einer Übung schon einmal gezeigt wurde. Keine
 * Antworten — eine Übungsaufgabe ist mit «Nächste» vorbei, und ein
 * halbfertiges Diktat von letzter Woche wiederherzustellen hilft niemandem.
 *
 * Alles liegt im localStorage des Browsers. Es gibt keinen Server, kein Konto
 * und nichts, was die Seite über jemanden erzählen könnte.
 */

import type { FilterValues, Personal } from './generators/types';
import { DEFAULT_VOICE, isVoice } from './sing/voice';

/**
 * Alle Seiten unter peterheliko.github.io teilen sich denselben localStorage —
 * der Schlüssel muss deshalb eindeutig zu dieser Website gehören.
 */
const KEY = 'musiktheorie/v1';

export type SessionMode = 'endlos' | 'runde';

export interface SessionSettings {
  mode: SessionMode;
  /** Aufgaben je Runde. */
  size: number;
}

export interface ModeStats {
  attempted: number;
  correct: number;
}

interface Stored {
  v: 1;
  filters: Record<string, FilterValues>;
  session: Record<string, SessionSettings>;
  stats: Record<string, ModeStats>;
  /** Persönliche Einstellungen, für alle Übungen gleich. Fehlt in älteren Ständen. */
  personal?: Partial<Personal>;
}

export const ROUND_SIZES = [10, 20, 30];

const DEFAULT_SESSION: SessionSettings = { mode: 'endlos', size: 10 };

function empty(): Stored {
  return { v: 1, filters: {}, session: {}, stats: {} };
}

function load(): Stored {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as Stored;
    if (parsed?.v !== 1) return empty();
    return {
      v: 1,
      filters: parsed.filters ?? {},
      session: parsed.session ?? {},
      stats: parsed.stats ?? {},
      personal: parsed.personal ?? {},
    };
  } catch {
    // Kaputter oder fremder Inhalt darf die Seite nicht blockieren.
    return empty();
  }
}

function save(state: Stored): void {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(state));
  } catch {
    // Privater Modus oder volle Ablage: die Seite läuft weiter, nur ohne
    // Gedächtnis. Das ist ärgerlich, aber kein Grund zum Abbruch.
  }
}

export function loadFilters(id: string, defaults: FilterValues): FilterValues {
  // Vorgaben zuerst: ein gespeicherter Stand kann Filter enthalten, die es
  // nicht mehr gibt, und welche vermissen, die neu dazugekommen sind.
  return { ...defaults, ...(load().filters[id] ?? {}) };
}

export function saveFilters(id: string, values: FilterValues): void {
  const state = load();
  state.filters[id] = values;
  save(state);
}

export function clearFilters(id: string): void {
  const state = load();
  delete state.filters[id];
  save(state);
}

export function loadSession(id: string): SessionSettings {
  return { ...DEFAULT_SESSION, ...(load().session[id] ?? {}) };
}

export function saveSession(id: string, session: SessionSettings): void {
  const state = load();
  state.session[id] = session;
  save(state);
}

export function loadStats(id: string): ModeStats {
  return load().stats[id] ?? { attempted: 0, correct: 0 };
}

export function recordResult(id: string, correct: boolean): void {
  const state = load();
  const current = state.stats[id] ?? { attempted: 0, correct: 0 };
  state.stats[id] = {
    attempted: current.attempted + 1,
    correct: current.correct + (correct ? 1 : 0),
  };
  save(state);
}

/** Persönliche Einstellungen; Unlesbares fällt auf die Vorgabe zurück. */
export function loadPersonal(): Personal {
  const stored = load().personal ?? {};
  return { voice: isVoice(stored.voice) ? stored.voice : DEFAULT_VOICE };
}

export function savePersonal(personal: Personal): void {
  const state = load();
  state.personal = personal;
  save(state);
}

export function clearStats(): void {
  const state = load();
  state.stats = {};
  save(state);
}
