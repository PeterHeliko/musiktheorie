/**
 * Kurse — Übungen mit festen Einstellungen, von irgendwem zusammengestellt und
 * als Link geteilt (CONCEPT §7, Entscheid 2026-11-24):
 *
 *   /kurs/?titel=Terzen+und+Sexten
 *         &1=intervalle-bestimmen~intervalle:k3,g3,k6,g6~runde:10
 *         &2=intervalle-notieren~intervalle:k3,g3~schluessel:bass~runde:10
 *
 * Der Link IST der Kurs. Es gibt keinen Server und keine zentrale Fassung:
 * ein geteilter Kurs lässt sich nachträglich nicht ändern, nur neu teilen.
 *
 * Jeder Schritt ist ein Übungslink (`links.ts`) in einer Zeile — die
 * Übungskennung, dann dieselben Parameter, «~» statt «&» und «:» statt «=»,
 * immer mit Rundengrösse. Damit gelten für Kurse dieselben Regeln wie für
 * Übungslinks: nur Abweichungen von der Vorgabe stehen da, Unlesbares fällt
 * still auf die Vorgabe zurück, und die Namen sind öffentlich.
 *
 * Ein Kurs hält Einstellungen, keine Aufgaben: wer ihn öffnet, bekommt neue
 * Aufgaben der festgelegten Art. So kann keine neue Generatorfassung einen
 * Kurs verderben.
 */

import { generatorById } from './generators/index';
import type { FilterValues, Generator } from './generators/types';
import { canonicalFilters, decodeLink, encodeLink, sameValue } from './links';

/** Höchstlänge des Titels, in Zeichen. */
export const MAX_TITLE = 30;
/** Höchstzahl der Schritte; was darüber hinausgeht, fällt weg. */
export const MAX_STEPS = 30;
/** Rundengrösse, wenn der Link keine (gültige) nennt. */
export const DEFAULT_ROUND = 10;

export interface CourseStep {
  /** Kennung der Übung, wie in `/ueben/<id>/`. */
  exercise: string;
  filters: FilterValues;
  /** Aufgaben in der Runde dieses Schritts. */
  round: number;
}

export interface Course {
  title: string;
  steps: CourseStep[];
}

export interface DecodedCourse extends Course {
  /** So viele Schritte nannten eine Übung, die es nicht (mehr) gibt. */
  missing: number;
}

/** Titel säubern: Leerraum zusammenziehen, auf MAX_TITLE Zeichen kürzen. */
export function cleanTitle(text: string): string {
  // Nach Zeichen kürzen, nicht nach UTF-16-Einheiten — sonst zerfällt ein Emoji.
  return [...text.replace(/\s+/g, ' ').trim()].slice(0, MAX_TITLE).join('').trim();
}

// ---------------------------------------------------------------------------
// Schritte
// ---------------------------------------------------------------------------

/**
 * Ein Schritt als Text, z.B. «intervalle-notieren~schluessel:bass~runde:10».
 * Derselbe Schritt ergibt immer denselben Text — er dient auch als Kennung,
 * an der der Fortschritt hängt. Null, wenn es die Übung nicht gibt.
 */
export function encodeStep(step: CourseStep): string | null {
  const generator = generatorById(step.exercise);
  if (!generator) return null;
  const query = encodeLink(generator, { filters: step.filters, round: step.round, seed: null });
  const params = query
    .replace(/^\?/, '')
    .split('&')
    .filter(Boolean)
    .map((part) => part.replace('=', ':'));
  return [step.exercise, ...params].join('~');
}

/** Text → Schritt; null, wenn die Übung unbekannt ist. Liest nie Ungültiges ein. */
export function decodeStep(text: string): CourseStep | null {
  const [exercise, ...parts] = text.split('~');
  const generator = generatorById(exercise);
  if (!generator) return null;
  // Zurück in die Form eines Übungslinks, damit `decodeLink` alles prüft.
  const query = parts
    .map((part) => {
      const colon = part.indexOf(':');
      if (colon <= 0) return null;
      return `${encodeURIComponent(part.slice(0, colon))}=${encodeURIComponent(part.slice(colon + 1))}`;
    })
    .filter((part): part is string => part !== null)
    .join('&');
  const link = decodeLink(generator, `?${query}`);
  return {
    exercise,
    filters: canonicalFilters(generator, link.filters),
    round: link.round ?? DEFAULT_ROUND,
  };
}

/** Kennung eines Schritts für den Fortschritt: sein Text. */
export function stepKey(step: CourseStep): string {
  return encodeStep(step) ?? step.exercise;
}

// ---------------------------------------------------------------------------
// Ganze Kurse
// ---------------------------------------------------------------------------

/** Kurs → Abfrageteil der Adresse, mit führendem «?». */
export function encodeCourse(course: Course): string {
  // «+» statt «%20»: in der Adresszeile lesbarer, und URLSearchParams liest es
  // als Leerzeichen.
  const parts = [`titel=${encodeURIComponent(cleanTitle(course.title)).replace(/%20/g, '+')}`];
  for (const step of course.steps) {
    if (parts.length > MAX_STEPS) break;
    const text = encodeStep(step);
    if (text !== null) parts.push(`${parts.length}=${text}`);
  }
  return `?${parts.join('&')}`;
}

/** Abfrageteil → Kurs. Schritte in der Reihenfolge ihrer Nummern. */
export function decodeCourse(search: string): DecodedCourse {
  const params = new URLSearchParams(search);
  const numbered = [...params.entries()]
    .filter(([key]) => /^[1-9][0-9]{0,2}$/.test(key))
    .sort((a, b) => Number(a[0]) - Number(b[0]));

  const steps: CourseStep[] = [];
  let missing = 0;
  for (const [, text] of numbered) {
    if (steps.length >= MAX_STEPS) break;
    const step = decodeStep(text);
    if (step) steps.push(step);
    else missing++;
  }
  return { title: cleanTitle(params.get('titel') ?? ''), steps, missing };
}

/** Steht in diesem Link überhaupt ein Kurs? */
export function isCourse(course: DecodedCourse): boolean {
  return course.steps.length > 0;
}

/** Titel zum Anzeigen. Neue Kurse haben immer einen; ein Link vielleicht nicht. */
export function courseTitle(course: Course): string {
  return course.title || 'Kurs ohne Titel';
}

/** Ist dieser Schritt erledigt? `done` sind die Schlüssel aus dem Speicher. */
export function isDone(step: CourseStep, done: readonly string[]): boolean {
  return done.includes(stepKey(step));
}

/** Wie viele Schritte erledigt sind — nur solche, die der Kurs noch hat. */
export function countDone(course: Course, done: readonly string[]): number {
  return course.steps.filter((step) => isDone(step, done)).length;
}

// ---------------------------------------------------------------------------
// Ein Schritt in der Übung
// ---------------------------------------------------------------------------

/**
 * Die Übung eines Schritts trägt in ihrer Adresse, zu welchem Kurs sie gehört:
 * `…&kurs=k3x9q&schritt=2`. Die Kennung gilt nur auf diesem Gerät; wer den
 * Link anderswo öffnet, bekommt die Übung allein (unbekannte Parameter
 * werden überhört).
 */
export interface CoursePlace {
  /** Kennung des Kurses im Speicher dieses Geräts. */
  course: string;
  /** Der wievielte Schritt, ab 1. */
  step: number;
}

/** Abfrageteil der Übung eines Schritts, mit führendem «?». */
export function stepQuery(step: CourseStep, place: CoursePlace): string {
  const generator = generatorById(step.exercise);
  const query = generator ? encodeLink(generator, { filters: step.filters, round: step.round, seed: null }) : '';
  const own = `kurs=${place.course}&schritt=${place.step}`;
  return query ? `${query}&${own}` : `?${own}`;
}

/** Den Kursbezug aus der Adresse einer Übung lesen, oder null. */
export function decodePlace(search: string): CoursePlace | null {
  const params = new URLSearchParams(search);
  const course = params.get('kurs');
  const step = Number(params.get('schritt'));
  if (!course || !/^[0-9a-z]{1,12}$/.test(course)) return null;
  if (!Number.isInteger(step) || step < 1 || step > MAX_STEPS) return null;
  return { course, step };
}

/** Kursbezug für das Ende einer Übungsadresse, mit führendem «&». */
export function placeSuffix(place: CoursePlace): string {
  return `&kurs=${place.course}&schritt=${place.step}`;
}

// ---------------------------------------------------------------------------
// Beschreibung
// ---------------------------------------------------------------------------

/**
 * Was an einem Schritt von der Vorgabe der Übung abweicht, in Worten aus den
 * Filterbeschriftungen — z.B. ["Abgefragte Intervalle: kleine Terz, grosse
 * Terz", "Schlüssel: Bassschlüssel"]. Zwei Schritte derselben Übung lassen
 * sich so auseinanderhalten.
 *
 * Mit der Beschriftung des Filters davor: die Optionen allein sagen oft zu
 * wenig («Keine», «Grundton», «b»), und bei «Pausen ergänzen» stehen dieselben
 * Notenwerte in zwei Filtern. Ist die Beschriftung eine Frage, folgt die
 * Antwort ohne Doppelpunkt («Was wird gefragt? Pausenzeichen»).
 */
export function describeSettings(generator: Generator<FilterValues>, filters: FilterValues): string[] {
  const parts: string[] = [];
  const labelled = (label: string, text: string) => (label.endsWith('?') ? `${label} ${text}` : `${label}: ${text}`);
  for (const filter of generator.filters) {
    const value = filters[filter.key];
    if (value === undefined || sameValue(value, generator.defaults[filter.key])) continue;
    // Was gesperrt ist, wirkt nicht — also auch nicht erwähnen.
    if (filter.disabledBy?.(filters)) continue;
    switch (filter.kind) {
      case 'multi': {
        const chosen = Array.isArray(value) ? value : [];
        const labels = filter.options.filter((option) => chosen.includes(option.value)).map((option) => option.label);
        if (labels.length > 0) parts.push(labelled(filter.label, labels.join(', ')));
        break;
      }
      case 'single': {
        const option = filter.options.find((entry) => entry.value === value);
        if (option) parts.push(labelled(filter.label, option.label));
        break;
      }
      case 'toggle':
        parts.push(value ? filter.label : `${filter.label}: nein`);
        break;
      case 'range':
        // «Länge 4 Takte», «Tempo 96 bpm»; ohne Einheit wie die übrigen:
        // «Maximale Anzahl Vorzeichen: 3».
        parts.push(filter.unit ? `${filter.label} ${value} ${filter.unit}` : labelled(filter.label, String(value)));
        break;
    }
  }
  return parts;
}
