/**
 * Gehaltene Töne aus der Tonhöhenkurve — das «notenweise» Hören (CONCEPT §6).
 *
 * Ein Ton zählt erst, wenn er eine Weile ruhig steht. So fallen Anschleifen,
 * Durchgänge und das Suchen nach dem Ton heraus: wer von c¹ nach e¹ gleitet,
 * streift das d¹ nur und hält es nicht.
 *
 * «Ruhig» heisst: alle Messungen der letzten HOLD_MS liegen höchstens einen
 * halben Halbton um ihren Mittelwert. Ein übliches Vibrato bleibt darin, ein
 * Gleiten nicht. Der Mittelwert ist dann der gesungene Ton.
 *
 * Ein gehaltener Ton wird genau einmal gemeldet. Erst wer ihn verlässt — auf
 * einen anderen Ton oder in eine Pause —, kann den nächsten halten.
 */

/** So lange muss ein Ton ruhig stehen (ms). */
export const HOLD_MS = 400;

/** Höchste Abweichung vom Mittelwert innerhalb eines gehaltenen Tons (Halbtöne). */
const STEADY = 0.5;

/** Weiter als das vom gemeldeten Ton entfernt, und er ist verlassen (Halbtöne). */
const LEAVE = 0.7;

/**
 * Längere Lücken zwischen zwei Messungen unterbrechen den Ton — etwa wenn der
 * Browser die Seite im Hintergrund anhält.
 */
const MAX_GAP_MS = 150;

/** Mindestens so viele Messungen braucht ein gehaltener Ton. */
const MIN_FRAMES = 5;

export interface HeldNote {
  /** Gesungener Ton als MIDI-Nummer mit Nachkommastellen. */
  midi: number;
  /** Zeitraum, über den gemittelt wurde (ms). */
  start: number;
  end: number;
}

export class HoldDetector {
  private frames: { time: number; midi: number }[] = [];
  /** Beginn der laufenden, lückenlosen Folge. */
  private since: number | null = null;
  private last: number | null = null;
  /** Der zuletzt gemeldete Ton, solange er noch klingt. */
  private locked: number | null = null;

  constructor(private readonly holdMs = HOLD_MS) {}

  /** Neue Messung (MIDI oder null bei Stille). Gibt einen Ton zurück, sobald er gehalten ist. */
  push(time: number, midi: number | null): HeldNote | null {
    if (midi === null || (this.last !== null && time - this.last > MAX_GAP_MS)) this.reset();
    if (midi === null) return null;
    this.last = time;

    if (this.locked !== null) {
      if (Math.abs(midi - this.locked) <= LEAVE) return null;
      // Verlassen: der nächste Ton beginnt hier, ohne das Gleiten davor.
      this.locked = null;
      this.frames = [];
      this.since = time;
    }

    this.since ??= time;
    this.frames.push({ time, midi });
    while (this.frames.length > 0 && this.frames[0].time < time - this.holdMs) this.frames.shift();
    if (time - this.since < this.holdMs || this.frames.length < MIN_FRAMES) return null;

    const mean = this.frames.reduce((sum, frame) => sum + frame.midi, 0) / this.frames.length;
    if (this.frames.some((frame) => Math.abs(frame.midi - mean) > STEADY)) return null;

    this.locked = mean;
    return { midi: mean, start: this.frames[0].time, end: time };
  }

  reset(): void {
    this.frames = [];
    this.since = null;
    this.last = null;
    this.locked = null;
  }
}
