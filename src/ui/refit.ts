/**
 * Ereignis am Fenster: der Platz um die Aufgabe hat sich geändert, ohne dass
 * das Fenster seine Grösse geändert hätte (etwa beim Ein- und Ausblenden der
 * Erklärung). Bilder, die den übrigen Platz füllen — Notenbilder mit `fit`,
 * die Klaviatur —, messen dann neu.
 *
 * Eine eigene Datei, damit die Klaviatur sie kennt, ohne den Notensatz
 * mitzuladen.
 */
export const REFIT_EVENT = 'score-refit';
