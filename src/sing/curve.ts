/**
 * Tonhöhenkurve auf einer Zeichenfläche — im Werkzeug «Tonhöhe anzeigen» und
 * in den Singübungen.
 *
 * Waagrecht die Zeit (rechts ist jetzt), senkrecht die Tonhöhe mit einer Linie
 * je Halbton; beschriftet sind die Stammtöne. Die gesungene Tonhöhe ist eine
 * Linie mit Lücken, wo Stille war.
 *
 * Für die Übungen kommen Markierungen dazu: der Ausgangston, nach dem Urteil
 * der Zielton, und der Teil der Kurve, der gewertet wurde — grün oder rot.
 */

import { nameFromMidi } from './notes';

export interface CurvePoint {
  time: number;
  /** MIDI mit Nachkommastellen, oder null bei Stille. */
  midi: number | null;
  /** Gehört zur gewerteten Antwort. */
  mark?: 'right' | 'wrong';
}

/** Waagrechte Markierung, in jeder sichtbaren Oktave gezeichnet. */
export interface CurveLine {
  midi: number;
  kind: 'reference' | 'target';
  /** Band von ± so vielen Cent um die Linie (die verlangte Genauigkeit). */
  band?: number;
  /** Beschriftung in der Oktave `midi`; ohne Angabe der übliche Tonname. */
  label?: (midi: number) => string;
}

export interface CurveView {
  /** Jetzt (ms, wie die Zeiten der Punkte). */
  now: number;
  /** So viele Sekunden zeigt die Kurve. */
  seconds: number;
  /** Tonhöhe in der Mitte des Bilds; null = noch keine. */
  centre: number | null;
  /** So viele Halbtöne passen senkrecht ins Bild. */
  semitones: number;
  lines?: CurveLine[];
}

const SUPERSCRIPT_DIGITS = '⁰¹²³⁴⁵⁶⁷⁸⁹';

/** Für die Beschriftung im Bild, wo es kein <sup> gibt: «c1» → «c¹». */
export function superscriptOctave(name: string): string {
  return name.replace(/\d/g, (digit) => SUPERSCRIPT_DIGITS[Number(digit)]);
}

const NATURALS = [0, 2, 4, 5, 7, 9, 11];

export function drawCurve(element: HTMLCanvasElement, history: readonly CurvePoint[], view: CurveView): void {
  const ratio = globalThis.devicePixelRatio || 1;
  const width = element.clientWidth;
  const height = element.clientHeight;
  if (element.width !== Math.round(width * ratio) || element.height !== Math.round(height * ratio)) {
    element.width = Math.round(width * ratio);
    element.height = Math.round(height * ratio);
  }
  const g = element.getContext('2d');
  if (!g) return;
  g.setTransform(ratio, 0, 0, ratio, 0, 0);

  const styles = getComputedStyle(element);
  const color = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;
  const ink = color('--ink-soft', '#5b6472');
  const line = color('--line', '#d9dee6');
  const accent = color('--accent', '#1d6fa5');
  const surface = color('--surface', '#fff');
  const good = color('--good', '#00d903');
  // Grüne Schrift auf Weiss braucht den dunkleren Ton (styles-base.css).
  const goodInk = color('--good-ink', '#007a02');
  const goodSoft = color('--good-soft', '#e6fbe6');
  const bad = color('--bad', '#b3261e');

  g.fillStyle = surface;
  g.fillRect(0, 0, width, height);

  const { semitones } = view;
  const low = (view.centre ?? 64) - semitones / 2;
  const high = low + semitones;
  const y = (midi: number) => height - ((midi - low) / semitones) * height;
  const labelWidth = 34;

  // Markierungen in jeder sichtbaren Oktave, mit ihrer eigenen Beschriftung.
  const marks = (view.lines ?? []).flatMap((mark) => {
    const out: { midi: number; mark: CurveLine }[] = [];
    for (let midi = mark.midi + 12 * Math.ceil((low - 1 - mark.midi) / 12); midi <= high + 1; midi += 12) {
      out.push({ midi, mark });
    }
    return out;
  });
  const labelled = new Set(marks.map((entry) => entry.midi));

  // Bänder zuerst, damit Raster und Kurve darüber liegen.
  for (const { midi, mark } of marks) {
    if (!mark.band) continue;
    g.fillStyle = mark.kind === 'target' ? goodSoft : line;
    const top = y(midi + mark.band / 100);
    g.fillRect(labelWidth, top, width - labelWidth, y(midi - mark.band / 100) - top);
  }

  // Raster: eine Linie je Halbton, beschriftet sind die Stammtöne.
  g.font = '12px system-ui, sans-serif';
  g.textBaseline = 'middle';
  for (let midi = Math.ceil(low); midi <= high; midi++) {
    const natural = NATURALS.includes(((midi % 12) + 12) % 12);
    g.strokeStyle = line;
    g.lineWidth = natural ? 1 : 0.5;
    g.globalAlpha = natural ? 1 : 0.5;
    g.beginPath();
    g.moveTo(labelWidth, y(midi));
    g.lineTo(width, y(midi));
    g.stroke();
    if (natural && !labelled.has(midi)) {
      g.globalAlpha = 1;
      g.fillStyle = ink;
      g.fillText(superscriptOctave(nameFromMidi(midi)), 4, y(midi));
    }
  }
  g.globalAlpha = 1;

  for (const { midi, mark } of marks) {
    const target = mark.kind === 'target';
    // Der Zielton dünn: die gesungene Linie liegt darüber und soll sichtbar bleiben.
    g.strokeStyle = target ? good : ink;
    g.lineWidth = target ? 1 : 1.5;
    g.setLineDash(target ? [] : [6, 4]);
    g.beginPath();
    g.moveTo(labelWidth, y(midi));
    g.lineTo(width, y(midi));
    g.stroke();
    g.setLineDash([]);
    g.font = '600 12px system-ui, sans-serif';
    g.fillStyle = target ? goodInk : ink;
    g.fillText(superscriptOctave(mark.label?.(midi) ?? nameFromMidi(midi)), 4, y(midi));
  }

  // Kurve: Lücken bei Stille bleiben Lücken; die Farbe wechselt mit der Wertung.
  const start = view.now - view.seconds * 1000;
  const x = (time: number) => labelWidth + ((time - start) / (view.seconds * 1000)) * (width - labelWidth);
  const stroke = (mark: CurvePoint['mark']) => (mark === 'right' ? good : mark === 'wrong' ? bad : accent);
  g.lineWidth = 2.5;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  let previous: CurvePoint | null = null;
  for (const point of history) {
    if (point.midi === null) {
      previous = null;
      continue;
    }
    if (previous && previous.midi !== null) {
      g.strokeStyle = stroke(point.mark ?? previous.mark);
      g.beginPath();
      g.moveTo(x(previous.time), y(previous.midi));
      g.lineTo(x(point.time), y(point.midi));
      g.stroke();
    }
    previous = point;
  }
}
