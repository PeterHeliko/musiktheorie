/**
 * Bauplan eines Aufgabengenerators.
 *
 * Der Kniff, der die Seite klein hält: ein Generator liefert eine `Task` im
 * Format von `content/schema.ts`. Damit zeichnen die vorhandenen Ansichten
 * sie, und `scoreTask()` bewertet sie — es gibt weder ein zweites
 * Noteneingabe-Widget noch eine zweite Bewertung.
 *
 * Die Filter sind absichtlich Daten und keine Oberfläche: `FilterPanel`
 * zeichnet sie einmal generisch, und eine neue Übung ist damit eine Datei
 * plus ein Eintrag in der Liste — kein neues Formular.
 */

import type { AudioEvent, AudioItem } from '../content/audio';
import type { ScoreSpec, SelectOption, Task } from '../content/schema';
import type { Rng } from './rng';

/**
 * Eine Antwort, die andere Felder gegenstandslos macht.
 *
 * Der Fall, für den es das gibt: beim Hören eines übermässigen Dreiklangs ist
 * die Umkehrung nicht bestimmbar — alle drei klingen gleich. Wer «übermässig»
 * antwortet, kann die Umkehrung also gar nicht wissen, und die Aufgabe darf
 * sie nicht verlangen.
 *
 * Entscheidend ist, dass die Sperre an der GEGEBENEN Antwort hängt und nicht
 * an der richtigen: würde das Feld ausgrauen, sobald die Lösung «übermässig»
 * lautet, verriete die Oberfläche genau das, wonach sie fragt.
 */
export interface Waiver {
  /** Sobald dieses Auswahlfeld … */
  field: string;
  /** … einen dieser Werte trägt … */
  values: string[];
  /** … zählen diese Felder nicht mehr — weder als Frage noch für die Punkte. */
  waives: string[];
  /** Warum; steht unter der Aufgabe und in der Rückmeldung. */
  reason: string;
}

/** Eine fertig gewürfelte Aufgabe. */
export interface Question {
  /** Wird von SelectTaskView bzw. NotationInput gezeichnet. */
  task: Task;
  /** Hörbeispiel; wird über `expandAudioItem()` zu Klangereignissen. */
  audio?: AudioItem;
  /** Töne der Melodie — nur beim Diktat, wo `audio` sie nicht selbst kennt. */
  melody?: AudioEvent[];
  /**
   * Zeichenlegende über der Aufgabe, z.B. die Notenwerte A–D, aus denen
   * ausgewählt wird.
   */
  legend?: { label: string; score: ScoreSpec }[];
  /** Antwort, die andere Felder gegenstandslos macht. */
  waiver?: Waiver;
  /** Anweisung, die von der Vorgabe der Übung abweicht (z.B. Richtung). */
  instruction?: string;
  /** Zusätzlicher Bedienhinweis unter der Anweisung. */
  hint?: string;
  /** Abspiellimit; weglassen = unbegrenzt (die Übungs-Vorgabe). */
  maxPlays?: number;
  /** «langsamer»-Knopf anbieten (Diktat). */
  allowSlow?: boolean;
}

interface FilterBase {
  /** Zeigt auf ein Feld der Filterwerte des Generators. */
  key: string;
  label: string;
  hint?: string;
  /**
   * Sperrt das Feld, wenn andere Einstellungen es sinnlos machen.
   *
   * Rückgabe ist die BEGRÜNDUNG, oder null wenn das Feld nutzbar ist. Der Text
   * erscheint statt des Hinweises — wer eine Einstellung ausgegraut vorfindet,
   * soll nicht rätseln müssen, warum.
   *
   * Wichtig: die Sperre ist nur die Anzeige. Der Generator muss dieselbe
   * Bedingung noch einmal selbst durchsetzen, denn gespeicherte Filterwerte
   * können aus einer Zeit stammen, in der die Kombination noch erlaubt war.
   */
  disabledBy?(values: FilterValues): string | null;
}

/**
 * Ein Filterfeld.
 *
 * `multi` speichert `string[]`, `single` einen `string`, `toggle` ein
 * `boolean`, `range` eine `number`.
 */
export type FilterSpec =
  | (FilterBase & {
      kind: 'multi';
      options: SelectOption[];
      /** So viele müssen mindestens angekreuzt bleiben. Vorgabe 1. */
      min?: number;
    })
  | (FilterBase & { kind: 'single'; options: SelectOption[] })
  | (FilterBase & { kind: 'toggle' })
  | (FilterBase & {
      kind: 'range';
      min: number;
      max: number;
      step?: number;
      /** Einheit hinter der Zahl, z.B. «Takte». */
      unit?: string;
    });

/** Beliebige Filterwerte; jeder Generator kennt seine eigene Form genauer. */
export type FilterValues = Record<string, string | string[] | boolean | number>;

/**
 * Die Themen der Seite — die Zeilen des Rasters «Thema × Fertigkeit».
 * Reihenfolge = Reihenfolge auf der Übersicht.
 */
export const TOPICS = [
  { id: 'notenlesen', title: 'Notenlesen' },
  { id: 'rhythmus', title: 'Rhythmus' },
  { id: 'intervalle', title: 'Intervalle' },
  { id: 'tonleitern', title: 'Tonleitern und Tonarten' },
  { id: 'dreiklaenge', title: 'Dreiklänge' },
  { id: 'melodie', title: 'Melodie' },
] as const;

export type TopicId = (typeof TOPICS)[number]['id'];

/** Die Spalten des Rasters: was die übende Person tut. */
export type Skill = 'erkennen' | 'notieren' | 'klaviatur' | 'hoeren' | 'singen' | 'klopfen';

export const SKILL_LABELS: Record<Skill, string> = {
  erkennen: 'Erkennen',
  notieren: 'Notieren',
  klaviatur: 'Klaviatur',
  hoeren: 'Hören',
  singen: 'Singen',
  klopfen: 'Klopfen',
};

export function topicTitle(id: TopicId): string {
  return TOPICS.find((topic) => topic.id === id)?.title ?? id;
}

export interface Generator<F extends FilterValues = FilterValues> {
  /**
   * Stabil — steht in jedem geteilten Link (`/ueben/<id>/`). Nach dem Start
   * nicht mehr umbenennen, sonst führen alte Links ins Leere.
   */
  id: string;
  topic: TopicId;
  skill: Skill;
  /**
   * Fassung der Aufgabenerzeugung. Ein Aufgabenlink stellt seine Aufgabe aus
   * dem Startwert neu her — das klappt nur, solange `generate()` denselben
   * Zufall gleich verwendet. Wer daran etwas ändert, das bei gleichem
   * Startwert eine andere Aufgabe ergibt, zählt hier hoch; alte Aufgabenlinks
   * melden dann ehrlich, dass es ihre Aufgabe nicht mehr gibt.
   */
  version: number;
  title: string;
  /** Arbeitsanweisung, die über der Aufgabe steht. */
  instruction: string;
  hint?: string;
  filters: FilterSpec[];
  defaults: F;
  /**
   * Würfelt eine Aufgabe. Muss die eigene Lösung gegen den Theoriekern prüfen
   * und lieber werfen als eine falsche Aufgabe stellen — eine Übungsseite, die
   * Falsches beibringt, ist schlimmer als eine, die abstürzt.
   */
  generate(filters: F, rng: Rng): Question;
}

/**
 * Bequemer Zugriff auf Filterwerte. Die Werte kommen aus dem localStorage und
 * können veraltet sein (ein Filter wurde umbenannt, eine Option entfernt) —
 * deshalb überall mit Rückfall auf die Vorgabe.
 */
export function multi(values: FilterValues, key: string, fallback: string[]): string[] {
  const value = values[key];
  if (!Array.isArray(value) || value.length === 0) return fallback;
  return value;
}

export function single(values: FilterValues, key: string, fallback: string): string {
  const value = values[key];
  return typeof value === 'string' && value ? value : fallback;
}

export function toggle(values: FilterValues, key: string, fallback: boolean): boolean {
  const value = values[key];
  return typeof value === 'boolean' ? value : fallback;
}

export function range(values: FilterValues, key: string, fallback: number): number {
  const value = values[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
