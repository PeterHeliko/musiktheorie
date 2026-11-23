/**
 * Tonhöhe aus einem Stück Mikrofonsignal — das YIN-Verfahren
 * (de Cheveigné & Kawahara, 2002).
 *
 * Die Idee: ein periodisches Signal gleicht sich selbst, wenn man es um genau
 * eine Periode verschiebt. YIN misst für jede Verschiebung τ, wie verschieden
 * Signal und verschobenes Signal sind, und sucht die kleinste Verschiebung, bei
 * der sie sich deutlich gleichen. Die Frequenz ist dann Abtastrate / τ.
 *
 * Warum gerade YIN: es ist klein, ohne Abhängigkeiten zu haben und gut
 * verstanden. Und es nimmt die ERSTE deutliche Übereinstimmung, also die
 * kürzeste Periode — das vermeidet den häufigsten Fehler bei Stimmen, eine
 * Oktave zu tief zu messen.
 *
 * Die Funktion hängt nicht vom Browser ab und wird mit künstlichen Signalen
 * getestet (pitch.test.ts).
 */

export interface PitchEstimate {
  /** Grundfrequenz in Hz. */
  frequency: number;
  /**
   * Wie eindeutig periodisch das Signal ist, 0…1. Gesungene Töne liegen meist
   * über 0,9; Rauschen, Konsonanten und Atem darunter.
   */
  clarity: number;
}

export interface DetectOptions {
  /** Tiefste gesuchte Frequenz. Tiefe Männerstimmen reichen bis gut 70 Hz. */
  minFrequency?: number;
  /** Höchste gesuchte Frequenz. Sopran bis etwa c³ ≈ 1047 Hz. */
  maxFrequency?: number;
  /**
   * Schwelle der normierten Differenz. Die erste Verschiebung darunter gilt als
   * Periode. 0,1–0,15 ist der übliche Bereich.
   */
  threshold?: number;
  /** Unterhalb dieser Lautstärke (RMS) gilt das Signal als Stille. */
  minRms?: number;
}

const DEFAULTS: Required<DetectOptions> = {
  minFrequency: 65,
  maxFrequency: 1100,
  threshold: 0.12,
  minRms: 0.01,
};

/**
 * Schätzt die Grundfrequenz. Gibt null zurück, wenn das Signal zu leise ist
 * oder sich keine Periode finden lässt.
 *
 * Das Fenster muss mindestens zwei Perioden des tiefsten gesuchten Tons
 * fassen: bei 48 kHz und 65 Hz also gut 1500 Abtastwerte. 2048 reichen.
 */
export function detectPitch(
  samples: Float32Array,
  sampleRate: number,
  options: DetectOptions = {},
): PitchEstimate | null {
  const { minFrequency, maxFrequency, threshold, minRms } = { ...DEFAULTS, ...options };

  let energy = 0;
  for (let i = 0; i < samples.length; i++) energy += samples[i] * samples[i];
  if (Math.sqrt(energy / samples.length) < minRms) return null;

  const tauMin = Math.max(2, Math.floor(sampleRate / maxFrequency));
  const tauMax = Math.min(Math.ceil(sampleRate / minFrequency), Math.floor(samples.length / 2));
  if (tauMax <= tauMin) return null;
  // Über so viele Werte wird je Verschiebung verglichen.
  const width = samples.length - tauMax;

  // Differenzfunktion d(τ) und gleich daraus die kumulativ normierte d'(τ).
  // Die Normierung macht d' bei τ = 0 zu 1 und lässt echte Perioden als
  // Senken weit unter 1 erscheinen, unabhängig von der Lautstärke.
  const normalised = new Float32Array(tauMax + 1);
  normalised[0] = 1;
  let runningSum = 0;
  for (let tau = 1; tau <= tauMax; tau++) {
    let sum = 0;
    for (let i = 0; i < width; i++) {
      const delta = samples[i] - samples[i + tau];
      sum += delta * delta;
    }
    runningSum += sum;
    normalised[tau] = runningSum > 0 ? (sum * tau) / runningSum : 1;
  }

  // Erste Verschiebung unter der Schwelle, dann bis zum Boden der Senke.
  let tau = -1;
  for (let t = tauMin; t <= tauMax; t++) {
    if (normalised[t] < threshold) {
      while (t + 1 <= tauMax && normalised[t + 1] < normalised[t]) t++;
      tau = t;
      break;
    }
  }

  // Nichts unter der Schwelle: das tiefste Minimum nehmen, aber nur, wenn es
  // halbwegs deutlich ist. Sonst ist es Rauschen.
  if (tau === -1) {
    let best = tauMin;
    for (let t = tauMin + 1; t <= tauMax; t++) {
      if (normalised[t] < normalised[best]) best = t;
    }
    if (normalised[best] > 0.35) return null;
    tau = best;
  }

  // Parabel durch die drei Punkte um das Minimum: genauer als ganze
  // Abtastwerte. Ohne diesen Schritt läge der Fehler bei hohen Tönen bei
  // mehreren Cent.
  let refined = tau;
  if (tau > 1 && tau < tauMax) {
    const a = normalised[tau - 1];
    const b = normalised[tau];
    const c = normalised[tau + 1];
    const denominator = a - 2 * b + c;
    if (denominator !== 0) refined = tau + (a - c) / (2 * denominator);
  }

  const frequency = sampleRate / refined;
  if (frequency < minFrequency * 0.97 || frequency > maxFrequency * 1.03) return null;
  return { frequency, clarity: Math.max(0, Math.min(1, 1 - normalised[tau])) };
}

/**
 * Glättet eine Folge von Schätzungen: Median der letzten paar eindeutigen
 * Werte. Der Median ignoriert einzelne Ausreisser (ein Oktavsprung in einem
 * einzigen Fenster, ein Konsonant), ohne wie ein Mittelwert hinterherzuhinken.
 */
export class PitchSmoother {
  private readonly recent: number[] = [];

  constructor(
    private readonly size = 5,
    private readonly minClarity = 0.85,
  ) {}

  /** Neue Schätzung hinein, geglättete Frequenz heraus (oder null bei Stille). */
  push(estimate: PitchEstimate | null): number | null {
    if (!estimate || estimate.clarity < this.minClarity) {
      // Eine Lücke leert den Puffer: der nächste Ton soll nicht mit dem
      // vorigen verrechnet werden.
      this.recent.length = 0;
      return null;
    }
    this.recent.push(estimate.frequency);
    if (this.recent.length > this.size) this.recent.shift();
    const sorted = [...this.recent].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }

  reset(): void {
    this.recent.length = 0;
  }
}
