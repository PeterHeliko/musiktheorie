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

import { useLayoutEffect, useRef } from 'preact/hooks';
import { nameFromMidi } from '../sing/notes';
import { isWhiteKey, keysBetween, whiteIndex } from '../music/piano';
import { REFIT_EVENT, SCORE_FITTED_EVENT } from './refit';

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
const MIN_HEIGHT = 72;

/**
 * Breiter wird sie nie (Entscheid 2026-11-25): auf dem Tablet gross genug zum
 * Spielen, zwei Oktaven mit weissen Tasten von gut 70 px. Das ist breiter als
 * die Spalte der Übung (760 px); die Klaviatur darf über sie hinaus.
 */
const MAX_WIDTH = 1000;

/**
 * Eine weisse Taste wird nie breiter als die grösste einer Klaviatur mit zwei
 * Oktaven (14 weisse Tasten). Eine Klaviatur mit wenigen Tasten (tiefster und
 * höchster Ton nah beieinander) zieht so keine riesigen Tasten über die ganze
 * Breite; ab 14 Tasten ändert sich nichts.
 */
const TWO_OCTAVES = 14;
const MAX_KEY_WIDTH = MAX_WIDTH / TWO_OCTAVES;

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
  reserve,
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
  /**
   * Mit `fit` unter einem Notenbild, das sich ebenfalls einpasst: so viel
   * Höhe (px) behält die Klaviatur mindestens. Das Notenbild rechnet mit
   * diesem Platz, die Klaviatur nimmt danach, was übrig bleibt.
   */
  reserve?: number;
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
  // Beim Zeichnen schon vor dem ersten Bild, wie beim Notenbild: sonst stünde
  // die Klaviatur einen Augenblick lang in voller Grösse da.
  useLayoutEffect(() => {
    const element = box.current;
    if (!fit || !element) return;
    const refit = () => fitToRoom(element, ratio);
    refit();
    globalThis.addEventListener('resize', refit);
    globalThis.addEventListener(REFIT_EVENT, refit);
    globalThis.addEventListener(SCORE_FITTED_EVENT, refit);
    return () => {
      globalThis.removeEventListener('resize', refit);
      globalThis.removeEventListener(REFIT_EVENT, refit);
      globalThis.removeEventListener(SCORE_FITTED_EVENT, refit);
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
      style={{ '--piano-ratio': String(ratio), '--piano-max-width': `${Math.round(Math.min(MAX_WIDTH, whiteCount * MAX_KEY_WIDTH))}px` }}
      data-fit-reserve={fit && reserve ? reserve : undefined}
    >
      {keys.filter(isWhiteKey).map(render)}
      {keys.filter((key) => !isWhiteKey(key)).map(render)}
    </div>
  );
}

/**
 * Die Klaviatur in den Platz bringen, den der Rest der Aufgabe übrig lässt.
 *
 * In der Breite hat sie die ganze Übung, nicht nur deren Spalte: links und
 * rechts bleibt der Rand der Spalte frei, und mehr als MAX_WIDTH wird es nie.
 * Mit weniger als 14 weissen Tasten nur ein entsprechender Teil davon
 * (MAX_KEY_WIDTH). Ist sie breiter als die Spalte, steht sie mittig über ihr
 * hinaus. Passt sie in ihrem Seitenverhältnis (WHITE_LENGTH), bleibt es dabei.
 * Wird die Höhe knapp (quer auf dem Telefon), bleibt die Breite, und sie wird
 * niedriger: breite Tasten treffen sich besser als lange (Entscheid
 * 2026-11-24). Die Tasten sind in Prozent gesetzt und folgen jedem
 * Seitenverhältnis.
 */
function fitToRoom(piano: HTMLElement, ratio: number): void {
  const body = piano.closest<HTMLElement>('.session-body');
  const column = body?.firstElementChild as HTMLElement | null | undefined;
  const parent = piano.parentElement;
  if (!body || !column || !parent) return;
  const style = getComputedStyle(body);
  const room = body.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
  const others = column.getBoundingClientRect().height - piano.getBoundingClientRect().height;
  const available = room - others;
  const columnStyle = getComputedStyle(column);
  const gutters = parseFloat(columnStyle.paddingLeft) + parseFloat(columnStyle.paddingRight);
  const full = body.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - gutters;
  const widest = Math.floor(Math.min(full, MAX_WIDTH, ratio * WHITE_LENGTH * MAX_KEY_WIDTH));
  const natural = widest / ratio;
  const height = available >= natural ? natural : Math.max(available, MIN_HEIGHT);
  const parentStyle = getComputedStyle(parent);
  const inside = parent.clientWidth - parseFloat(parentStyle.paddingLeft) - parseFloat(parentStyle.paddingRight);
  const overhang = Math.min(0, (inside - widest) / 2);
  piano.style.width = `${widest}px`;
  piano.style.height = `${Math.floor(height)}px`;
  piano.style.maxWidth = 'none';
  piano.style.marginLeft = overhang < 0 ? `${overhang}px` : '';
  piano.style.marginRight = overhang < 0 ? `${overhang}px` : '';
  piano.style.aspectRatio = 'auto';
}
