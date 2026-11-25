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
import type { Voice } from '../sing/voice';
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
  /**
   * Anweisung, die von der Vorgabe der Übung abweicht (z.B. Richtung). Wie die
   * Vorgabe gehört sie zur Erklärung, die beim ersten Mal erscheint und sonst
   * hinter ⓘ liegt — sie gilt für alle Aufgaben mit diesen Einstellungen.
   */
  instruction?: string;
  /** Zusätzlicher Bedienhinweis, ebenfalls Teil der Erklärung. */
  hint?: string;
  /**
   * Was nur für DIESE Aufgabe gilt und ohne das sie sich nicht lösen lässt —
   * steht als eine kurze Zeile immer bei der Aufgabe. Etwa beim Diktat Takte,
   * Tonart und erster Ton. Allgemeines gehört nicht hierher, sondern in
   * `instruction`.
   */
  context?: string;
  /**
   * Was nach dem Prüfen einmal zusammen erklingt (Entscheid 2026-11-24): das
   * gefragte Intervall oder der gefragte Akkord, wo das Hören nicht die
   * Übung ist — so lernt das Ohr mit. Vorher bleibt es still, sonst liesse
   * sich die Antwort hören statt lesen oder abzählen. Tonhöhen wie «c4».
   */
  afterSound?: string[];
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
      /**
       * Tonnamen als Raster wie die Antwortknöpfe (eine Spalte je Stammton, ♯
       * oben, ♭ unten) statt als Reihe.
       */
      layout?: 'notes';
      /** Werte, die nur zusammen an- und abgehen: cis und des sind eine Taste. */
      together?: string[][];
      /** Schnellwahl unter den Knöpfen («Stammtöne», «alle») statt «alle · keine». */
      presets?: { label: string; values: string[] }[];
    })
  | (FilterBase & {
      kind: 'single';
      options: SelectOption[];
      /**
       * Als Schieberegler über die Optionen, in ihrer Reihenfolge, statt als
       * Knöpfe: für lange, geordnete Listen wie Tonhöhen (tiefster Ton c¹).
       * `notAbove` bzw. `notBelow` nennt einen zweiten Regler mit denselben
       * Optionen, den dieser nicht überholen darf; er wird mitgeschoben. Der
       * Generator muss die Reihenfolge trotzdem selbst herstellen, denn ein
       * Link kann beide vertauscht liefern.
       */
      slider?: { notAbove?: string; notBelow?: string };
      /**
       * Nur einen Teil der Optionen zeigen, je nach den übrigen Einstellungen
       * (feine Intervalle, sobald «chromatisch» gewählt ist). `options` bleibt
       * die ganze Liste: Links und Speicher kennen jeden Wert. Steht der
       * gewählte Wert nicht mehr darunter, gilt sein Gegenstück aus
       * `equivalent` (Terz ↔ grosse Terz). Der Generator muss beide Werte
       * trotzdem selbst verstehen, denn ein Link kann jeden liefern.
       */
      shownOptions?(values: FilterValues): SelectOption[];
      equivalent?: Record<string, string>;
    })
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
  { id: 'toene', title: 'Töne' },
  { id: 'rhythmus', title: 'Rhythmus' },
  { id: 'intervalle', title: 'Intervalle' },
  { id: 'dreiklaenge', title: 'Dreiklänge' },
  { id: 'septakkorde', title: 'Septakkorde' },
  { id: 'tonleitern', title: 'Tonleitern und Tonarten' },
  { id: 'melodie', title: 'Melodie' },
] as const;

export type TopicId = (typeof TOPICS)[number]['id'];

/**
 * Unterteilung eines Themas, wo eine flache Liste zu wenig sagt. Die Themen-
 * seite zeigt die Gruppen als Zwischentitel, in dieser Reihenfolge; jede Übung
 * eines solchen Themas nennt ihre Gruppe (`Generator.group`, Test).
 */
export const TOPIC_GROUPS: Partial<Record<TopicId, { id: string; title: string }[]>> = {
  intervalle: [
    { id: 'grob', title: 'Grobbestimmung' },
    { id: 'fein', title: 'Feinbestimmung' },
  ],
  dreiklaenge: [
    { id: 'grundstellung', title: 'Grundstellung' },
    { id: 'umkehrungen', title: 'Umkehrungen & Lagen' },
  ],
  septakkorde: [
    { id: 'grundstellung', title: 'Grundstellung' },
    { id: 'umkehrungen', title: 'Umkehrungen & Lagen' },
  ],
};

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

/**
 * Titel für Tab, Linkvorschau und Teilen: mit der Gruppe, wo das Thema
 * welche hat. Grob- und Feinbestimmung tragen dieselben Übungstitel
 * («Intervalle notieren»); ein geteilter Link soll trotzdem sagen, welche es
 * ist. Die Kopfzeile der Übung und die Liste zeigen den kurzen Titel — dort
 * steht die Gruppe schon daneben (Entscheid 2026-11-23). Steht die Gruppe
 * schon im Titel («Umkehrungen & Lagen notieren»), kommt stattdessen das
 * Thema dazu: so heissen die Übungen bei Dreiklängen und Septakkorden.
 */
export function fullTitle(generator: { topic: TopicId; group?: string; title: string }): string {
  const group = TOPIC_GROUPS[generator.topic]?.find((entry) => entry.id === generator.group);
  if (!group) return generator.title;
  return generator.title.includes(group.title)
    ? `${generator.title} (${topicTitle(generator.topic)})`
    : `${generator.title} (${group.title})`;
}

export interface Generator<F extends FilterValues = FilterValues> {
  /**
   * Stabil — steht in jedem geteilten Link (`/ueben/<id>/`). Nach dem Start
   * nicht mehr umbenennen, sonst führen alte Links ins Leere.
   */
  id: string;
  topic: TopicId;
  /** Gruppe innerhalb des Themas, falls es welche hat (TOPIC_GROUPS). */
  group?: string;
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
   * Einstellungen, die es nicht mehr gibt, die alte Links und gespeicherte
   * Stände aber noch nennen (links.ts, Regel 3). Gelesen werden sie wie die
   * übrigen, gezeigt und geschrieben nirgends; `upgrade` übersetzt sie in die
   * heutigen.
   */
  retiredFilters?: FilterSpec[];
  /** Alte Filterwerte → heutige. Läuft auf jedem Weg in die Seite (`canonicalFilters`). */
  upgrade?(values: FilterValues): FilterValues;
  /**
   * Würfelt eine Aufgabe. Muss die eigene Lösung gegen den Theoriekern prüfen
   * und lieber werfen als eine falsche Aufgabe stellen — eine Übungsseite, die
   * Falsches beibringt, ist schlimmer als eine, die abstürzt.
   *
   * `personal` sind die persönlichen Einstellungen der übenden Person (etwa
   * die Stimmlage). Sie stehen nie im Link: derselbe Aufgabenlink ergibt bei
   * jemand anderem dieselbe Aufgabe in dessen Lage.
   */
  generate(filters: F, rng: Rng, personal?: Personal): Question;
}

/**
 * Was zur Person gehört und nicht zur Übung: bleibt auf dem Gerät, gilt für
 * alle Übungen und steht nie in einem Link (CONCEPT §7).
 */
export interface Personal {
  /** Stimmlage für die Singübungen. */
  voice: Voice;
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
