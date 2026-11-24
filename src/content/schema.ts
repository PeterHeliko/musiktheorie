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
  /** Nach dem Prüfen: selbst gesetzte Note grün (richtig) oder rot (falsch). */
  mark?: 'correct' | 'wrong';
  /**
   * Dasselbe je Notenkopf eines Akkords, in der Reihenfolge von `keys` —
   * für frei gesetzte Akkorde, bei denen einzelne Töne falsch sein können.
   */
  keyMarks?: ('correct' | 'wrong')[];
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
// Klaviatur
// ---------------------------------------------------------------------------

/**
 * Eine Klaviatur als Bild. Tasten heissen hier MIDI-Nummern (60 = c¹): eine
 * Taste kennt keine Schreibweise — fis und ges sind dieselbe.
 */
export interface KeyboardSpec {
  /** Tiefste und höchste Taste, beide einschliesslich; beide weiss. */
  low: number;
  high: number;
  /** Vorgegebene Tasten, mit einem Punkt markiert. */
  marked?: number[];
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
  /**
   * Weitere Werte, die ebenso richtig sind. Für eine schwarze Taste: sie
   * heisst cis oder des, beides stimmt. Die Rückmeldung nennt `correct` zuerst.
   */
  alsoCorrect?: string[];
  points: number;
  /** Als Knopfraster statt als Auswahlliste darstellen (kurze Antworten). */
  buttons?: boolean;
  /**
   * Besondere Anordnung des Knopfrasters. «intervals»: nach Intervallgrösse
   * gruppiert — hochkant zeilenweise (Sekunden, Terzen, …), quer in zwei
   * Reihen wie eine Klaviatur (kleine zwischen den grossen).
   * «sizes»: die Intervallgrössen der Grobbestimmung — hochkant zwei je
   * Zeile, quer alle in einer Reihe.
   * «notes»: Tonnamen, eine Spalte je Stammton (c … h), darüber die mit ♯,
   * darunter die mit ♭. Fehlende Namen lassen ihren Platz frei. Tonarten
   * («Es-Dur», «c-Moll») stehen beim Tonnamen ihres Grundtons.
   */
  buttonLayout?: 'intervals' | 'sizes' | 'notes';
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
  /** Klaviatur als Bild, statt oder neben dem Notenbild. Nur zum Ansehen. */
  keyboard?: KeyboardSpec;
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
  mode: 'pitch' | 'melody' | 'rhythm' | 'rest' | 'keysig' | 'mark' | 'chord';
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
  /**
   * Tonnamen auf der Tastatur setzen keinen Ton. Wo der Name die Frage ist
   * («Setze fis»), würde die Taste F die Aufgabe lösen. Die Pfeile bleiben.
   */
  noNameKeys?: boolean;
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
  | { type: 'mark'; gaps: number[] }
  /**
   * chord: ein frei gesetzter Akkord, im Klaviersystem auf beide Systeme
   * verteilt. Bewertet nach `rule`; `example` ist eine richtige Lösung, die
   * nach einem Fehler grün daneben steht (oben, und im Klaviersystem unten).
   */
  | { type: 'chord'; rule: ChordRule; example: { upper: string[]; lower?: string[] } };

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

/**
 * Singen: ein Ausgangston erklingt und steht da, gesungen wird ein Ton dazu.
 * Bewertet wird nach den Regeln in `sing/judge.ts`; die Antwort sind die
 * gehaltenen Töne (`SingAnswer`).
 */
export interface SingTask extends TaskBase {
  kind: 'sing';
  /** Notenbild mit dem Ausgangston. */
  score: ScoreSpec;
  /** Ausgangston, wie er erklingt und dasteht («e4»). */
  reference: string;
  /**
   * Gesuchter Ton in der notierten Lage. Gesungen zählt er in jeder Oktave.
   * Bei `sequence` der letzte Ton der Folge.
   */
  target: string;
  /**
   * Mehrere Töne nacheinander statt eines (Dreiklänge singen): in der
   * verlangten Reihenfolge, der erste ist der Ausgangston. Bewertet nach
   * `judgeSequence` (sing/judge.ts).
   */
  sequence?: string[];
  /** So weit darf der gesungene Ton danebenliegen (Cent). */
  tolerance: number;
  /**
   * «Ohne Fehlerurteil»: falsche Töne beenden die Aufgabe nicht, gesungen
   * wird bis zum richtigen (sing/judge.ts).
   */
  untilRight?: boolean;
  points: number;
}

/**
 * Ein Akkord, der frei gesetzt oder gespielt wird: in jeder Lage, mit
 * Verdopplungen, im Klaviersystem auch über beide Systeme verteilt. Richtig
 * ist er, wenn alle Akkordtöne da sind, kein anderer Ton, und — wo verlangt —
 * der tiefste und der höchste Ton die richtigen Akkordglieder sind
 * (Entscheid 2026-11-24). Im Notenbild zählt die Schreibweise (fis, nicht
 * ges), auf der Klaviatur nur die Taste.
 */
export interface ChordRule {
  /** Die Akkordtöne, Grundton zuerst («d4», «fis4», «a4»); die Oktave zählt nicht. */
  tones: string[];
  /** Index in `tones`: dieser Ton muss unten liegen (Umkehrung). */
  lowest?: number;
  /** Index in `tones`: dieser Ton muss oben liegen (Lage). */
  highest?: number;
}

/**
 * Auf der Klaviatur spielen: angetippt wird eine Taste, «Prüfen» wertet sie.
 * Die Antwort sind die gewählten Tasten (`KeyboardAnswer`).
 *
 * Mit `chord` wird ein Akkord gespielt: jedes Antippen nimmt eine Taste dazu
 * oder wieder weg, und bewertet wird nach `ChordRule`.
 */
export interface KeyboardTask extends TaskBase {
  kind: 'keyboard';
  /** Umfang und vorgegebene Tasten. */
  keyboard: KeyboardSpec;
  /**
   * Richtige Tasten; genau eine davon ist zu wählen. Bei `chord` eine
   * richtige Lösung, alle Tasten zusammen.
   */
  accept: number[];
  /** Ein Akkord statt einer Taste. */
  chord?: ChordRule;
  /**
   * Eine Tonleiter markieren: jedes Antippen nimmt eine Taste dazu oder weg,
   * richtig ist genau `accept` — die Töne ab dem vorgegebenen Grundton bis zur
   * Oktave, ohne ihn. Den Grundton (`keyboard.marked`) tippt man nicht an.
   */
  scale?: boolean;
  /**
   * Nur weisse Tasten lassen sich wählen — für Aufgaben ohne Vorzeichen
   * (Grobbestimmung). Eine schwarze Taste hat dort keine Grösse: c–dis ist
   * eine Sekunde, c–es eine Terz.
   */
  whiteOnly?: boolean;
  /** Angetippte Tasten erklingen. */
  sound?: boolean;
  /**
   * Wie die Rückmeldung eine Taste nennt: als Intervall von der Taste `from`
   * aus — in Halbtönen gezählt («kleine Terz aufwärts», Feinbestimmung) oder
   * in weissen Tasten («Terz aufwärts», Grobbestimmung) — oder mit ihrem
   * Tonnamen («fis/ges»).
   */
  describe: { from: number; by: 'semitones' | 'steps' } | { by: 'name' } | { by: 'chord' } | { by: 'scale' };
  points: number;
}

export type Task = SelectTask | NotationTask | TextTableTask | SingTask | KeyboardTask;

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
