/**
 * Ist da gerade ein Ton — oder nur der Raum?
 *
 * Eine feste Lautstärkeschwelle taugt dafür nicht: wie laut das Mikrofon
 * liefert, hängt vom Gerät ab. Auf iOS kommt das Signal ohne die übliche
 * Sprachaufbereitung (die wir abschalten, siehe microphone.ts) rund 20–30 dB
 * leiser an als am Rechner — eine Schwelle, die am Rechner Rauschen
 * wegschneidet, schneidet dort auch die Stimme weg.
 *
 * Deshalb zählt das Verhältnis zum Raum: die Schwelle lernt das Grundrauschen
 * und lässt durch, was deutlich darüber liegt. Wird das ganze Signal leiser
 * (anderes Gerät, grösserer Abstand), werden Rauschen und Stimme gleichermassen
 * leiser, und die Entscheidung bleibt dieselbe.
 *
 * Wie das Grundrauschen verfolgt wird:
 *  - Die erste echte Messung ist die erste Schätzung. Wer das Mikrofon
 *    einschaltet, singt meist nicht im selben Augenblick; und falls doch,
 *    korrigiert die erste Atempause die Schätzung (nächster Punkt).
 *  - Fällt der Pegel unter die bisherige Schätzung, gilt sofort der neue Wert.
 *    Jede Atempause zeigt also, wie leise der Raum ist.
 *  - Sonst steigt die Schätzung langsam (Faktor 2 je 30 s). So lernt sie ein
 *    später einsetzendes Brummen nach einer Weile als Raum, ohne dass ein lang
 *    gehaltener Ton zum Rauschen erklärt wird — dafür müsste man rund eine
 *    Minute ohne Atempause singen.
 *  - Die erste Viertelsekunde zählt nicht. Bevor das Mikrofon läuft, liefert
 *    der Audiokontext Nullen, und die ersten Fenster danach sind nur teilweise
 *    gefüllt — ihr Pegel läge weit unter dem echten Raum und zöge die Schätzung
 *    auf beinahe null.
 */

/** Mittlere Leistung eines Fensters als Effektivwert (RMS), 0…1. */
export function rms(samples: Float32Array): number {
  let energy = 0;
  for (let i = 0; i < samples.length; i++) energy += samples[i] * samples[i];
  return Math.sqrt(energy / samples.length);
}

/** Effektivwert → Dezibel unter Vollaussteuerung (dBFS); Stille ergibt −∞. */
export function toDb(value: number): number {
  return 20 * Math.log10(value);
}

export interface NoiseGateOptions {
  /**
   * Darunter ist es in jedem Fall Stille — praktisch digitale Null. Liegt weit
   * unter allem, was ein Mikrofon bei Gesang liefert, auch auf iOS.
   */
  absoluteFloor?: number;
  /** So viel lauter als das Grundrauschen muss ein Ton sein. 3 ≈ 10 dB. */
  ratio?: number;
  /** Um diesen Faktor darf die Rauschschätzung je 30 s steigen. */
  risePer30s?: number;
  /** So lange nach dem ersten Signal wird noch nichts gelernt (ms). */
  warmupMs?: number;
}

/** Darunter ist ein Fenster keine Messung, sondern Leerlauf (lauter Nullen). */
const NO_DATA = 1e-6;

export class NoiseGate {
  private readonly absoluteFloor: number;
  private readonly ratio: number;
  private readonly risePer30s: number;
  private readonly warmupMs: number;
  /** Geschätztes Grundrauschen; null, solange noch nichts gemessen wurde. */
  private noise: number | null = null;
  private lastTime: number | null = null;
  /** Zeitpunkt des ersten Signals. */
  private firstData: number | null = null;

  constructor({
    absoluteFloor = 0.0002,
    ratio = 3,
    risePer30s = 2,
    warmupMs = 250,
  }: NoiseGateOptions = {}) {
    this.absoluteFloor = absoluteFloor;
    this.ratio = ratio;
    this.risePer30s = risePer30s;
    this.warmupMs = warmupMs;
  }

  /**
   * Neues Fenster: Pegel (RMS) und Zeitpunkt in ms. Gibt zurück, ob es als Ton
   * gelten soll.
   */
  update(level: number, time: number): boolean {
    const elapsed = this.lastTime === null ? 0 : Math.max(0, time - this.lastTime);
    this.lastTime = time;

    if (level >= NO_DATA) this.firstData ??= time;
    const learning = this.firstData !== null && time - this.firstData >= this.warmupMs;

    if (learning) {
      if (this.noise === null || level < this.noise) {
        this.noise = level;
      } else {
        this.noise *= this.risePer30s ** (elapsed / 30_000);
      }
    }
    // Im Anlauf ist der Raum noch unbekannt: lieber eine Viertelsekunde nichts
    // melden als Rauschen für einen Ton halten.
    return learning && level > this.threshold;
  }

  /** Geschätztes Grundrauschen (RMS), oder null vor der ersten Messung. */
  get noiseFloor(): number | null {
    return this.noise;
  }

  /** Ab diesem Pegel (RMS) gilt ein Fenster als Ton. */
  get threshold(): number {
    return Math.max(this.absoluteFloor, (this.noise ?? 0) * this.ratio);
  }
}
