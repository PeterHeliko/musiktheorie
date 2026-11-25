/**
 * Ereignis am Fenster: der Platz um die Aufgabe hat sich geändert, ohne dass
 * das Fenster ein resize-Ereignis geschickt hätte (etwa beim Ein- und
 * Ausblenden der Erklärung, oder wenn Safari nach dem Drehen seine Leiste
 * einfährt; ExercisePage.tsx). Bilder, die den übrigen Platz füllen —
 * Notenbilder mit `fit`, die Klaviatur —, messen dann neu.
 *
 * Eine eigene Datei, damit die Klaviatur sie kennt, ohne den Notensatz
 * mitzuladen.
 */
export const REFIT_EVENT = 'score-refit';

/**
 * Ereignis am Fenster: ein Notenbild mit `fit` hat seine Grösse neu bestimmt.
 * Steht darunter eine Klaviatur, die sich ebenfalls einpasst (Noten auf
 * Klaviatur spielen), nimmt sie danach den Rest. So hängt das Ergebnis nicht
 * davon ab, wer zuerst misst.
 */
export const SCORE_FITTED_EVENT = 'score-fitted';
