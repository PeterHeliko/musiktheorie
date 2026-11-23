/* Herkunft: musiktheorie-scorm/src/content/schema.ts (Stand 2026-08-21), über das Projekt «training».
   Wird hier eigenständig weitergeführt; es gibt keinen Abgleich mit dem Original mehr. */
/**
 * Datenmodell des Aufgabensatzes.
 *
 * Der gesamte Prüfungsinhalt steht in `exam.ts` als typisierte Daten — kein
 * Aufgabentext ist im UI-Code fest verdrahtet. Wer Aufgaben ändern will,
 * fasst nur diese eine Datei an.
 *
 * Aus neun ursprünglich geplanten Aufgabentypen sind drei geworden: fast
 * jede Aufgabe ist im Kern «optionales Notenbild + optionales Hörbeispiel +
 * Auswahlfelder». Nur die Noteneingabe und die Freitexttabelle brauchen
 * eigene Formen.
 */

import type { Duration } from '../music/theory';

// ---------------------------------------------------------------------------
// Notenbild
// ---------------------------------------------------------------------------

export interface NoteSpec {
  /** Tonhöhen wie «g4», «fis4», «hes3». Leer bei einer Pause. */
  keys?: string[];
  duration: Duration;
  dotted?: boolean;
  rest?: boolean;
  /** Text unter der Note, z.B. eine Ziffer oder ein Fragezeichen. */
  annotation?: string;
  /** Hebt die Note farblich hervor (vorgegebene Töne in Eingabeaufgaben). */
  highlight?: boolean;
  /** Blass darstellen — Platzhalter, die noch auszufüllen sind. */
  muted?: boolean;
  /**
   * Nur ein Vorzeichen zeichnen, ohne Notenkopf — für die frei gesetzten
   * Vorzeichen der Tonart-Aufgabe. Die Höhe ergibt sich aus `keys`.
   * (Ein Notenkopf auf «durchsichtig» zu stellen genügt nicht: VexFlow zeichnet
   * das Vorzeichen in dieselbe SVG-Gruppe und würde es mit ausblenden.)
   */
  glyph?: 'sharp' | 'flat' | 'natural';
  /**
   * Leerstelle: belegt Platz im Takt und zeigt nur die Annotation, zeichnet
   * aber kein Zeichen. Wichtig für die Ergänzungsaufgaben — eine sichtbare
   * Platzhalter-Pause würde den gesuchten Notenwert verraten.
   */
  placeholder?: boolean;
  /**
   * Vorschau: zeigt blass und blau, was ein Klick setzen würde. Zählt nicht
   * zur Antwort.
   */
  preview?: boolean;
  /**
   * Zusätzliche Vorschau-Köpfe an einer bestehenden Note — für Aufgaben, bei
   * denen zu einem vorgegebenen Ton dazugesetzt wird.
   */
  previewKeys?: string[];
}

export interface MeasureSpec {
  notes: NoteSpec[];
  /** Untersystem, nur bei clef === 'grand'. */
  bass?: NoteSpec[];
}

export interface ScoreSpec {
  clef: 'treble' | 'bass' | 'grand';
  /** Schlüssel weglassen — für Zeichen-Legenden, wo er nur Ballast wäre. */
  hideClef?: boolean;
  /** VexFlow-Kürzel, z.B. «Eb». Weglassen = keine Vorzeichen. */
  keySignature?: string;
  timeSignature?: string;
  measures: MeasureSpec[];
  /** Breite in Pixeln; wird bei Bedarf responsiv skaliert. */
  width?: number;
  /**
   * Anzeigegrösse gegenüber der Zeichengrösse; ohne Angabe SCORE_SCALE
   * (render.ts). Grösser heisst: grössere Noten bei gleicher Zeichenbreite.
   */
  scale?: number;
  /**
   * In der Übungsansicht so gross wie möglich: das Bild bekommt die Höhe, die
   * neben dem Rest der Aufgabe übrig bleibt. Der Rest — die Antwortknöpfe —
   * ist immer ganz sichtbar; das Bild wird dafür notfalls klein. Nie breiter
   * als die Spalte und nie grösser als `maxScale` (auf grossen Bildschirmen
   * würde es sonst riesig). Umgesetzt in Score.tsx; `scale` gilt nur bis zur
   * ersten Messung.
   */
  fit?: { maxScale: number };
  /**
   * Platz über der obersten und unter der untersten Notenlinie, in
   * Zeicheneinheiten (Linienabstand 10). Ohne Angabe so viel, wie VexFlow
   * oben vorsieht, und genug für tiefe Hilfslinien unten. Wer weiss, wie weit
   * seine Noten reichen, spart damit leere Fläche.
   */
  space?: { above: number; below: number };
  /** Schlussstrich zeichnen. */
  endBar?: boolean;
  /**
   * Zeichen eng aneinander setzen statt über den Takt zu verteilen. Für frei
   * gesetzte Vorzeichen: nur dicht beieinander sehen sie wie ein
   * Tonartvorzeichen aus und nicht wie einzelne Noten.
   */
  tightSpacing?: boolean;
}

// ---------------------------------------------------------------------------
// Auswahlfelder
// ---------------------------------------------------------------------------

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectField {
  /** Eindeutig innerhalb der Aufgabe; bildet zusammen mit ihr die Antwort-ID. */
  id: string;
  label?: string;
  /** Namen einer wiederverwendbaren Optionsliste aus OPTION_SETS. */
  optionSet?: string;
  options?: SelectOption[];
  correct: string;
  points: number;
  /** Als Knopfraster statt als Auswahlliste darstellen (kurze Antworten). */
  buttons?: boolean;
  /**
   * Besondere Anordnung des Knopfrasters. «intervals»: nach Intervallgrösse
   * gruppiert — hochkant zeilenweise (Sekunden, Terzen, …), quer in zwei
   * Reihen wie eine Klaviatur (kleine zwischen den grossen).
   * «sizes»: die Intervallgrössen der Grobbestimmung — hochkant zwei je
   * Zeile, quer alle in einer Reihe.
   */
  buttonLayout?: 'intervals' | 'sizes';
}

// ---------------------------------------------------------------------------
// Aufgabentypen
// ---------------------------------------------------------------------------

interface TaskBase {
  id: string;
  /** Fragetext; darf einfaches Markup wie <b> enthalten. */
  prompt?: string;
}

/** Optionales Notenbild und/oder Hörbeispiel plus Auswahlfelder. */
export interface SelectTask extends TaskBase {
  kind: 'select';
  score?: ScoreSpec;
  /** Datei in public/audio/ ohne Endung; erzeugt einen Abspielknopf. */
  audio?: string;
  fields: SelectField[];
  /**
   * 'side' stellt die Auswahlfelder neben das Notenbild statt darunter.
   * Spart Höhe — im Moodle-Fenster die knappere Ressource.
   */
  layout?: 'side';
  /** Auswahlfelder in so vielen Spalten anordnen (nur mit layout: 'side'). */
  fieldColumns?: number;
}

/** Eine Aufgabe der Noteneingabe. Der Modus bestimmt Werkzeuge und Bewertung. */
export interface NotationTask extends TaskBase {
  kind: 'notation';
  mode: 'pitch' | 'melody' | 'rhythm' | 'rest' | 'keysig' | 'mark';
  audio?: string;
  /** Ausgangslage: vorgegebene Noten, Schlüssel, Taktart. */
  score: ScoreSpec;
  /** Erwartete Lösung; Bedeutung hängt vom Modus ab (siehe scoring/). */
  solution: NotationSolution;
  points: number;
  /** Zusätzliche Auswahlfelder, z.B. die Bezeichnung des gebildeten Akkords. */
  fields?: SelectField[];
  /**
   * Werkzeugleiste ohne Vorzeichen: es werden nur Stammtöne gesetzt. Für
   * Aufgaben, in denen Vorzeichen gar nicht vorkommen (Grobbestimmung).
   */
  noAccidentals?: boolean;
}

export type NotationSolution =
  /** pitch: erwartete Tonhöhen je Eingabeplatz. */
  | { type: 'pitch'; slots: PitchSlotSolution[] }
  /** melody: Tonhöhen- und Rhythmusfolge, getrennt bewertet. */
  | { type: 'melody'; measures: NoteSpec[][]; pitchPoints: number; rhythmPoints: number }
  /** rhythm/rest: der fehlende Wert je Takt. */
  | { type: 'slot'; slots: { measure: number; duration: Duration; dotted?: boolean }[] }
  /** keysig: Vorzeichen in vorgeschriebener Reihenfolge. */
  | { type: 'keysig'; accidentals: number }
  /** mark: die Zwischenräume (0-basierter Index des linken Nachbarn). */
  | { type: 'mark'; gaps: number[] };

export interface PitchSlotSolution {
  /** Index des Eingabeplatzes im Notenbild. */
  slot: number;
  /** Zulässige Tonhöhen; mehrere, wenn auf- und abwärts erlaubt sind. */
  accept: string[];
  /** Mehrere Töne gleichzeitig (Akkord) statt eines einzelnen. */
  chord?: boolean;
}

/** Freitexttabelle — wird nicht automatisch bewertet. */
export interface TextTableTask extends TaskBase {
  kind: 'text-table';
  columns: { id: string; label: string; width?: string; multiline?: boolean }[];
  rows: number;
}

export type Task = SelectTask | NotationTask | TextTableTask;

// ---------------------------------------------------------------------------
// Aufbau der Prüfung
// ---------------------------------------------------------------------------

export interface Exercise {
  id: string;
  /** Überschrift der Aufgabe, z.B. «Intervalle notieren». */
  title: string;
  /** Arbeitsanweisung. */
  instruction: string;
  /** Zusätzlicher Hinweis, z.B. zur Bedienung. */
  hint?: string;
  /** Wie oft darf ein Hörbeispiel dieser Aufgabe abgespielt werden? */
  maxPlays?: number;
  /** Gemeinsame Legende, z.B. die Notenzeichen A–D in der Zuordnungsaufgabe. */
  legend?: { label: string; score: ScoreSpec }[];
  tasks: Task[];
}

export interface Section {
  id: string;
  title: string;
  intro?: string;
  exercises: Exercise[];
}

export interface Exam {
  title: string;
  subtitle?: string;
  /** Text auf der Startseite. */
  welcome: string;
  sections: Section[];
}
