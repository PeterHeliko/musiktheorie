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

/**
 * Ein Kurs auf diesem Gerät — selbst zusammengestellt oder aus einem Link
 * geöffnet; das macht keinen Unterschied (CONCEPT §7).
 */
export interface StoredCourse {
  /** Kennung nur für dieses Gerät. Steht in der Adresse der Übung eines Schritts. */
  id: string;
  /** Der Kurs selbst: der Abfrageteil seines Links («?titel=…&1=…»). */
  link: string;
  /** Erledigte Schritte, nach `stepKey` (courses.ts). */
  done: string[];
  /** Zuletzt geöffnet oder geändert, in ms — die Startseite zeigt die jüngsten zuerst. */
  used: number;
}

interface Stored {
  v: 1;
  filters: Record<string, FilterValues>;
  session: Record<string, SessionSettings>;
  stats: Record<string, ModeStats>;
  /** Persönliche Einstellungen, für alle Übungen gleich. Fehlt in älteren Ständen. */
  personal?: Partial<Personal>;
  /** Fehlt in Ständen vor den Kursen. */
  courses?: StoredCourse[];
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
      courses: validCourses(parsed.courses),
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

// ---------------------------------------------------------------------------
// Kurse
// ---------------------------------------------------------------------------

/** Nur, was sich lesen lässt; ein kaputter Eintrag darf die anderen nicht mitreissen. */
function validCourses(value: unknown): StoredCourse[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (entry): entry is StoredCourse =>
        typeof entry?.id === 'string' &&
        /^[0-9a-z]{1,12}$/.test(entry.id) &&
        typeof entry.link === 'string',
    )
    .map((entry) => ({
      id: entry.id,
      link: entry.link,
      done: Array.isArray(entry.done) ? entry.done.filter((key) => typeof key === 'string') : [],
      used: typeof entry.used === 'number' ? entry.used : 0,
    }));
}

function newCourseId(taken: StoredCourse[]): string {
  for (;;) {
    const id = Math.floor(Math.random() * 36 ** 6)
      .toString(36)
      .padStart(6, '0');
    if (!taken.some((course) => course.id === id)) return id;
  }
}

/** Alle Kurse auf diesem Gerät, zuletzt benutzte zuerst. */
export function listCourses(): StoredCourse[] {
  return [...(load().courses ?? [])].sort((a, b) => b.used - a.used);
}

export function findCourse(id: string): StoredCourse | null {
  return load().courses?.find((course) => course.id === id) ?? null;
}

/**
 * Einen Kurs aus einem Link öffnen: den Eintrag mit genau diesem Inhalt,
 * sonst einen neuen. `link` muss die feste Schreibweise sein
 * (`encodeCourse`), sonst gälte derselbe Kurs als ein anderer.
 */
export function openCourse(link: string): StoredCourse {
  const state = load();
  const courses = state.courses ?? [];
  let course = courses.find((entry) => entry.link === link);
  if (!course) {
    course = { id: newCourseId(courses), link, done: [], used: 0 };
    courses.push(course);
  }
  course.used = Date.now();
  state.courses = courses;
  save(state);
  return course;
}

/** Einen neuen Kurs anlegen, auch wenn es einen gleichen schon gibt. */
export function createCourse(link: string): StoredCourse {
  const state = load();
  const courses = state.courses ?? [];
  const course: StoredCourse = { id: newCourseId(courses), link, done: [], used: Date.now() };
  state.courses = [...courses, course];
  save(state);
  return course;
}

/** Inhalt eines Kurses ersetzen. Erledigte Schritte bleiben erledigt, soweit es sie noch gibt. */
export function updateCourse(id: string, link: string): void {
  const state = load();
  const course = state.courses?.find((entry) => entry.id === id);
  if (!course) return;
  course.link = link;
  course.used = Date.now();
  save(state);
}

export function removeCourse(id: string): void {
  const state = load();
  state.courses = (state.courses ?? []).filter((course) => course.id !== id);
  save(state);
}

export function markStepDone(id: string, key: string): void {
  const state = load();
  const course = state.courses?.find((entry) => entry.id === id);
  if (!course || course.done.includes(key)) return;
  course.done.push(key);
  course.used = Date.now();
  save(state);
}
