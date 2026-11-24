/**
 * Klaviatur — ein Baustein für alles, was auf Tasten gezeigt oder gespielt
 * wird (CONCEPT §8): als Bild (Intervall benennen), als Eingabe (Intervall
 * spielen), später auch für Akkorde, Tonleitern und freies Spielen.
 *
 * Was sie zeigt, steht ganz in den Eigenschaften; sie selbst merkt sich
 * nichts. So kann jede Aufgabe entscheiden, was eine Taste bedeutet.
 *
 *  - Markiert wird immer mit einer Füllung (Entscheid 2026-11-23):
 *    vorgegebene Tasten (`marked`) blau wie die vorgegebenen Noten im
 *    Notenbild, die gewählte hellblau wie die Vorschau beim Notieren, nach
 *    dem Prüfen grün oder rot, und die richtige grün umrandet (`states`).
 *    Eine Färbung aus `states` geht der Vorgabe vor.
 *  - Beschriftet ist keine Taste (Entscheid 2026-11-23): die Klaviatur
 *    abzulesen ist Teil der Übung.
 *
 * Ohne `onPress` ist sie ein Bild. Mit `onPress` ist jede Taste ein Knopf —
 * antippen, mit Tab erreichen, mit Eingabe auslösen. Ausgelöst wird beim
 * Niederdrücken, nicht beim Loslassen: wie am Klavier klingt die Taste, sobald
 * der Finger sie trifft.
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
  multiple = false,
  disabled = false,
  fit = false,
  label,
}: {
  /** Tiefste und höchste Taste (MIDI), beide weiss. */
  low: number;
  high: number;
  /** Vorgegebene Tasten, blau gefüllt. */
  marked?: readonly number[];
  /** Färbung einzelner Tasten. */
  states?: Readonly<Record<number, KeyState>>;
  /** Welche Tasten sich antippen lassen; ohne Angabe alle. Die übrigen sehen gleich aus. */
  pressable?: (key: number) => boolean;
  /** Ohne: die Klaviatur ist nur ein Bild. */
  onPress?: (key: number) => void;
  /** Mehrere Tasten zugleich wählbar (Akkord) statt genau einer. */
  multiple?: boolean;
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
    const state: KeyState | 'given' | undefined = states[key] ?? (marks.has(key) ? 'given' : undefined);
    const classes = `piano-key ${white ? 'is-white' : 'is-black'}${key === high ? ' is-last' : ''}`;

    if (!interactive) {
      return <span key={key} class={classes} style={place(key)} data-key={key} data-state={state} />;
    }
    const usable = !disabled && (pressable?.(key) ?? true);
    return (
      <button
        key={key}
        type="button"
        class={classes}
        style={place(key)}
        data-key={key}
        data-state={state}
        role={multiple ? 'checkbox' : 'radio'}
        aria-checked={state === 'selected' || state === 'right' || state === 'wrong'}
        aria-label={`${nameFromMidi(key)}${marks.has(key) ? ', vorgegeben' : ''}`}
        disabled={!usable}
        onPointerDown={(event) => {
          // Nur die Haupttaste der Maus; Finger und Stift immer.
          if (usable && event.button === 0) onPress!(key);
        }}
        // Mit Eingabe- oder Leertaste ausgelöst, kommt kein pointerdown —
        // dann zählt der Klick (detail 0). Ein Klick mit Maus oder Finger ist
        // beim Niederdrücken schon erledigt.
        onClick={(event) => {
          if (usable && event.detail === 0) onPress!(key);
        }}
      />
    );
  };

  // Weisse zuerst, schwarze darüber.
  return (
    <div
      ref={box}
      class={`piano ${interactive ? 'is-interactive' : ''}`}
      role={interactive ? (multiple ? 'group' : 'radiogroup') : 'img'}
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
