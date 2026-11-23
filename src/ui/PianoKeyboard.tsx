/**
 * Klaviatur — ein Baustein für alles, was auf Tasten gezeigt oder gespielt
 * wird (CONCEPT §8): als Bild (Intervall benennen), als Eingabe (Intervall
 * spielen), später auch für Akkorde, Tonleitern und freies Spielen.
 *
 * Was sie zeigt, steht ganz in den Eigenschaften; sie selbst merkt sich
 * nichts. So kann jede Aufgabe entscheiden, was eine Taste bedeutet.
 *
 *  - Vorgegebene Tasten (`marked`) tragen einen blauen Punkt, wie die
 *    vorgegebenen Noten im Notenbild blau sind. Ein Punkt statt einer
 *    Füllung, damit eine vorgegebene Taste zugleich gewählt sein kann (Prime).
 *  - Die gewählte Taste ist blau gefüllt, wie ein gewählter Antwortknopf;
 *    nach dem Prüfen grün oder rot, und die richtige grün umrandet
 *    (`states`).
 *  - Beschriftet ist keine Taste (Entscheid 2026-11-23): die Klaviatur
 *    abzulesen ist Teil der Übung.
 *
 * Ohne `onPress` ist sie ein Bild. Mit `onPress` ist jede Taste ein Knopf —
 * antippen, mit Tab erreichen, mit Eingabe auslösen.
 */

import { useEffect, useRef } from 'preact/hooks';
import { nameFromMidi } from '../sing/notes';
import { isWhiteKey, keysBetween, whiteIndex } from '../music/piano';
import { REFIT_EVENT } from './refit';

export type KeyState = 'selected' | 'right' | 'wrong' | 'solution';

/** Breite einer schwarzen Taste im Verhältnis zur weissen. */
const BLACK_WIDTH = 0.6;

/**
 * Länge einer weissen Taste im Verhältnis zu ihrer Breite. Kürzer als am
 * Klavier (rund 6,5): zwei Oktaven sollen auch quer auf dem Telefon über die
 * Antwortknöpfe passen.
 */
const WHITE_LENGTH = 5.5;

/** Kleiner wird sie auch auf engstem Raum nicht (Höhe in px). */
const MIN_HEIGHT = 48;

export function PianoKeyboard({
  low,
  high,
  marked = [],
  states = {},
  pressable,
  onPress,
  disabled = false,
  fit = false,
  label,
}: {
  /** Tiefste und höchste Taste (MIDI), beide weiss. */
  low: number;
  high: number;
  /** Vorgegebene Tasten: ein Punkt. */
  marked?: readonly number[];
  /** Färbung einzelner Tasten. */
  states?: Readonly<Record<number, KeyState>>;
  /** Welche Tasten sich antippen lassen; ohne Angabe alle. */
  pressable?: (key: number) => boolean;
  /** Ohne: die Klaviatur ist nur ein Bild. */
  onPress?: (key: number) => void;
  /** Nach dem Prüfen: alles eingefroren, die Färbung bleibt. */
  disabled?: boolean;
  /**
   * In der Übungsansicht so gross, wie der Platz neben dem Rest der Aufgabe
   * zulässt — wie ein Notenbild mit `fit`. Die Antwortknöpfe bleiben so auch
   * quer auf dem Telefon ganz sichtbar.
   */
  fit?: boolean;
  /** Was die Klaviatur zeigt, für Bildschirmleser. */
  label: string;
}) {
  if (!isWhiteKey(low) || !isWhiteKey(high)) {
    throw new Error(`Klaviatur muss auf weissen Tasten beginnen und enden (${low}–${high})`);
  }
  const first = whiteIndex(low)!;
  const whiteCount = whiteIndex(high)! - first + 1;
  const width = 100 / whiteCount;
  const keys = keysBetween(low, high);
  const interactive = onPress !== undefined;
  const marks = new Set(marked);
  const ratio = whiteCount / WHITE_LENGTH;
  const box = useRef<HTMLDivElement>(null);

  // Gemessen wird beim Zeichnen, wenn sich das Fenster ändert und wenn die
  // Übung es meldet — nicht, wenn die Leiste unten nach dem Prüfen wächst.
  useEffect(() => {
    const element = box.current;
    if (!fit || !element) return;
    const refit = () => fitToRoom(element, ratio);
    refit();
    globalThis.addEventListener('resize', refit);
    globalThis.addEventListener(REFIT_EVENT, refit);
    return () => {
      globalThis.removeEventListener('resize', refit);
      globalThis.removeEventListener(REFIT_EVENT, refit);
    };
  }, [fit, ratio]);

  /** Lage einer Taste in Prozent der Breite. */
  const place = (key: number) => {
    if (isWhiteKey(key)) return { left: `${(whiteIndex(key)! - first) * width}%`, width: `${width}%` };
    // Mittig über der Fuge zur nächsten weissen Taste.
    const boundary = (whiteIndex(key - 1)! - first + 1) * width;
    return { left: `${boundary - (width * BLACK_WIDTH) / 2}%`, width: `${width * BLACK_WIDTH}%` };
  };

  const render = (key: number) => {
    const white = isWhiteKey(key);
    const state = states[key];
    // Gehört die Taste gar nicht zur Aufgabe (schwarz in der Grobbestimmung),
    // ist sie blasser — sonst sähe sie aus, als klemme sie.
    const inert = interactive && pressable !== undefined && !pressable(key);
    const classes = ['piano-key', white ? 'is-white' : 'is-black', inert ? 'is-inert' : '', key === high ? 'is-last' : '']
      .filter(Boolean)
      .join(' ');
    const dot = marks.has(key) ? <span class="piano-dot" aria-hidden="true" /> : null;

    if (!interactive) {
      return (
        <span key={key} class={classes} style={place(key)} data-key={key} data-state={state}>
          {dot}
        </span>
      );
    }
    return (
      <button
        key={key}
        type="button"
        class={classes}
        style={place(key)}
        data-key={key}
        data-state={state}
        role="radio"
        aria-checked={state !== undefined && state !== 'solution'}
        aria-label={`${nameFromMidi(key)}${marks.has(key) ? ', vorgegeben' : ''}`}
        disabled={disabled || inert}
        onClick={() => onPress!(key)}
      >
        {dot}
      </button>
    );
  };

  // Weisse zuerst, schwarze darüber.
  return (
    <div
      ref={box}
      class={`piano ${interactive ? 'is-interactive' : ''}`}
      role={interactive ? 'radiogroup' : 'img'}
      aria-label={label}
      style={{ '--piano-ratio': String(ratio) }}
    >
      {keys.filter(isWhiteKey).map(render)}
      {keys.filter((key) => !isWhiteKey(key)).map(render)}
    </div>
  );
}

/**
 * Breite der Klaviatur mit `fit`: so hoch, dass der Rest der Aufgabe gerade
 * noch ohne Scrollen Platz hat. Gerechnet wie bei den Notenbildern
 * (Score.tsx): Innenhöhe der scrollenden Mitte (.session-body) abzüglich
 * allem anderen darin. Breiter als die Spalte und als `max-width` wird sie
 * nie (styles.css). Ausserhalb der Übungsansicht bleibt sie, wie sie ist.
 */
function fitToRoom(piano: HTMLElement, ratio: number): void {
  const body = piano.closest<HTMLElement>('.session-body');
  const column = body?.firstElementChild;
  if (!body || !column) return;
  const style = getComputedStyle(body);
  const room = body.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
  const others = column.getBoundingClientRect().height - piano.getBoundingClientRect().height;
  const height = Math.max(room - others, MIN_HEIGHT);
  piano.style.width = `${Math.floor(height * ratio)}px`;
}
