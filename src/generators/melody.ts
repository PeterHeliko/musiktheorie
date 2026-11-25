/**
 * Melodien würfeln.
 *
 * Ein Diktat braucht beliebig viele Melodien — und sie müssen wie Musik
 * klingen, nicht wie Zufall. Eine Folge zufälliger Töne ist nämlich nicht
 * «schwerer», sie ist unlösbar: man notiert Melodien, indem man Erwartungen
 * bildet, und wo es nichts zu erwarten gibt, hilft nur Raten.
 *
 * Deshalb drei Regeln, die zusammen den grössten Teil der Musikalität
 * ausmachen:
 *
 *  1. Der Rhythmus füllt jeden Takt EXAKT — sonst wäre die Aufgabe nicht
 *     notierbar. Gefüllt wird rückwärts korrigierend, nie mit Überhang.
 *  2. Die Tonhöhen laufen überwiegend schrittweise; Sprünge sind selten,
 *     begrenzt und werden gegenläufig aufgefangen. Das ist die Faustregel,
 *     nach der auch von Hand geschriebene Diktatmelodien entstehen.
 *  3. Anfang und Schluss sind gesetzt: Beginn auf Grundton oder Quinte,
 *     Schluss auf dem Grundton. Ohne Schlusston fehlt der Melodie das Ziel,
 *     und der Gehörsinn hat nichts, woran er sich festhält.
 */

import { SCALE_PATTERNS, type ScaleType } from '../content/audio';
import type { NoteSpec } from '../content/schema';
import {
  durationInQuarters,
  measureCapacity,
  midi,
  parseIntervalLabel,
  parsePitch,
  transposeByInterval,
  type Duration,
  type Pitch,
} from '../music/theory';
import type { Rng } from './rng';
import { insist, pitchKey } from './shared';

export interface MelodyOptions {
  /** Anzahl Takte. */
  bars: number;
  timeSignature: string;
  /** Grundton der Tonart, z.B. «g4». */
  tonic: Pitch;
  scale: ScaleType;
  /** Erlaubte Notenwerte als Filterwerte («q», «q.», «8»). */
  durations: { duration: Duration; dotted: boolean }[];
  /** Umfang in Tonleiterstufen ab dem Grundton, z.B. 7 für eine Oktave. */
  span: number;
  /** Grösster erlaubter Sprung in Tonleiterstufen (1 = nur Sekundschritte). */
  maxLeap: number;
  /**
   * Schritte, die nicht vorkommen dürfen, als Stufen ab dem Grundton (etwa
   * ein Tritonus, der sich schwer singen lässt). Ohne: alle erlaubt — und
   * derselbe Startwert ergibt dieselbe Melodie wie vorher.
   */
  forbid?: (from: number, to: number) => boolean;
  /**
   * Tiefste und höchste Stufe ab dem Grundton, statt sie aus `span` zu
   * rechnen (ein Drittel unter dem Grundton) — etwa die ganze Stimmlage.
   */
  bounds?: { lowest: number; highest: number };
}

/**
 * Rhythmus eines Taktes: eine Folge von Notenwerten, die den Takt exakt füllt.
 *
 * Vorgehen: solange Werte ziehen, wie sie hineinpassen; passt keiner mehr
 * genau in den Rest, wird der Rest aus den kleinsten erlaubten Werten
 * aufgefüllt. Dadurch kann die Funktion nicht scheitern, solange überhaupt ein
 * Wert den Takt teilt — und genau das prüft `usableDurations()` vorher.
 */
export function barRhythm(
  rng: Rng,
  capacity: number,
  choices: { duration: Duration; dotted: boolean }[],
  finalBar = false,
): { duration: Duration; dotted: boolean }[] {
  const quarters = (c: { duration: Duration; dotted: boolean }) =>
    durationInQuarters(c.duration, c.dotted);
  const smallest = [...choices].sort((a, b) => quarters(a) - quarters(b))[0];

  const out: { duration: Duration; dotted: boolean }[] = [];
  let left = capacity;

  while (left > 1e-9) {
    const fitting = choices.filter((c) => quarters(c) <= left + 1e-9);
    if (fitting.length === 0) break;

    // Im Schlusstakt zieht es zu den langen Werten: eine Melodie endet selten
    // auf einer Sechzehntel. Sonst leicht zu den mittleren, damit nicht jeder
    // Takt aus vier Ganzen oder sechzehn Sechzehnteln besteht.
    const weights = fitting.map((c) => {
      const q = quarters(c);
      if (finalBar && left >= capacity - 1e-9) return q * q;
      return q >= 0.5 && q <= 2 ? 3 : 1;
    });

    const choice = rng.weighted(fitting, weights);
    out.push(choice);
    left -= quarters(choice);
  }

  // Rest exakt auffüllen. Nötig, wenn der letzte gezogene Wert eine Lücke
  // lässt, in die kein erlaubter Wert mehr passt (z.B. Rest 0,5 bei nur
  // Vierteln — dann greift diese Schleife gar nicht erst, weil `fitting`
  // vorher schon leer war und `left` sauber aufgeht).
  while (left > 1e-9) {
    out.push(smallest);
    left -= quarters(smallest);
  }

  return out;
}

/**
 * Notenwerte, mit denen sich ein Takt dieser Länge überhaupt exakt füllen
 * lässt. Wer nur die punktierte Viertel zulässt, kann keinen 4/4-Takt bauen —
 * das soll nicht in einer Endlosschleife enden, sondern gemeldet werden.
 */
export function usableDurations(
  capacity: number,
  choices: { duration: Duration; dotted: boolean }[],
): { duration: Duration; dotted: boolean }[] {
  const usable = choices.filter((c) => {
    const q = durationInQuarters(c.duration, c.dotted);
    if (q > capacity + 1e-9) return false;
    // Teilt der Wert den Takt, oder lässt er sich mit dem kleinsten anderen
    // Wert zu einem vollen Takt ergänzen?
    const rest = capacity % q;
    return Math.abs(rest) < 1e-9 || choices.some((other) => {
      const oq = durationInQuarters(other.duration, other.dotted);
      return Math.abs(rest % oq) < 1e-9;
    });
  });
  return usable;
}

/**
 * Tonhöhenverlauf: ein Gang über die Tonleiterstufen mit Vorliebe für
 * Sekundschritte.
 *
 * `degree` zählt Stufen ab dem Grundton, 0 = Grundton, 7 = Oktave. Negative
 * Werte gehen unter den Grundton — erlaubt, solange der Umfang stimmt.
 */
export function walk(
  rng: Rng,
  count: number,
  options: Pick<MelodyOptions, 'span' | 'maxLeap' | 'forbid' | 'bounds'>,
): number[] {
  const { span, maxLeap, forbid, bounds } = options;
  const lowest = bounds?.lowest ?? -Math.floor(span / 3);
  const highest = bounds?.highest ?? lowest + span;

  if (count <= 1) return [0];

  /** Der Grundton, der von hier aus am nächsten und im Umfang liegt. */
  const nearestTonic = (from: number): number => {
    const candidates: number[] = [];
    for (let octave = Math.floor(lowest / 7) - 1; octave <= Math.ceil(highest / 7) + 1; octave++) {
      const tonic = octave * 7;
      if (tonic >= lowest && tonic <= highest) candidates.push(tonic);
    }
    if (candidates.length === 0) return 0;
    return candidates.reduce((best, t) => (Math.abs(t - from) < Math.abs(best - from) ? t : best));
  };

  // Beginn auf Grundton oder Quinte — die beiden Töne, die eine Tonart sofort
  // hörbar machen. Die Quinte kommt nur in Frage, wenn sie in den Umfang passt
  // UND von dort aus genug Noten bleiben, um den Grundton schrittweise wieder
  // zu erreichen; sonst müsste die Melodie am Schluss springen.
  const fifthFits = 4 <= highest && (count - 1) * maxLeap >= 4;
  let current = fifthFits && rng.chance(0.3) ? 4 : 0;

  const degrees: number[] = [current];
  let lastLeap = 0;

  for (let i = 1; i < count; i++) {
    // Wie viele Noten kommen NACH dieser? So weit darf der Grundton am Ende
    // höchstens noch entfernt sein.
    const after = count - 1 - i;
    const target = nearestTonic(current);

    if (after === 0) {
      // Schlusston. Er muss der Grundton sein — die Schrittweite ist durch die
      // Steuerung oben schon klein gehalten.
      current = target;
      degrees.push(current);
      break;
    }

    // Nach einem Sprung geht es gegenläufig weiter — die klassische
    // Sprungfüllung. Ohne sie klingt die Melodie zerfahren.
    const preferred = Math.abs(lastLeap) >= 2 ? (lastLeap > 0 ? -1 : 1) : rng.chance(0.5) ? 1 : -1;

    // 70 % Sekundschritte; der Rest verteilt sich auf die erlaubten Sprünge.
    const sizes = [1];
    const weights = [7];
    for (let leap = 2; leap <= maxLeap; leap++) {
      sizes.push(leap);
      // Grössere Sprünge werden schnell seltener; eine Melodie voller Oktaven
      // wäre zwar «erlaubt», aber niemand könnte sie mitschreiben.
      weights.push(Math.max(1, 4 - leap));
    }
    const size = rng.weighted(sizes, weights);

    // Kandidaten in der bevorzugten Richtung, dann in der Gegenrichtung, dann
    // stehen bleiben. Gültig ist ein Schritt nur, wenn er im Umfang bleibt UND
    // der Grundton danach noch schrittweise erreichbar ist.
    const reachesEnd = (value: number) => Math.abs(nearestTonic(value) - value) <= after * maxLeap;
    const inRange = (value: number) => value >= lowest && value <= highest;
    const allowed = (value: number) => !forbid?.(current, value);

    const candidates = [current + preferred * size, current - preferred * size, current];
    let next = candidates.find((value) => inRange(value) && reachesEnd(value) && allowed(value));

    if (next === undefined) {
      // Nichts passt: geradewegs auf den Grundton zu, so weit wie erlaubt —
      // mit `forbid` der weiteste Schritt, der nicht verboten ist und den
      // Schluss noch erreicht. Ohne `forbid` immer der weiteste, wie bisher.
      const direction = Math.sign(target - current);
      const widest = Math.min(maxLeap, Math.abs(target - current));
      const sizes = Array.from({ length: widest }, (_, index) => widest - index);
      const fits = (size: number) => allowed(current + direction * size) && reachesEnd(current + direction * size);
      const size = forbid ? (sizes.find(fits) ?? widest) : widest;
      next = current + direction * size;
    }

    lastLeap = next - current;
    current = next;
    degrees.push(current);
  }

  return degrees;
}

/** Stufe → Tonhöhe in der gewählten Tonart. */
export function pitchForDegree(degree: number, options: Pick<MelodyOptions, 'tonic' | 'scale'>): Pitch {
  const pattern = SCALE_PATTERNS[options.scale];
  // Die Muster enthalten die Oktave als achten Eintrag; für die Rechnung
  // zählen die sieben Stufen.
  const withinOctave = ((degree % 7) + 7) % 7;
  const octaveShift = Math.floor(degree / 7);

  let pitch = transposeByInterval(options.tonic, parseIntervalLabel(pattern[withinOctave]));
  for (let i = 0; i < Math.abs(octaveShift); i++) {
    pitch = transposeByInterval(pitch, { quality: 'r', number: 8 }, octaveShift > 0 ? 'up' : 'down');
  }
  return pitch;
}

/** Baut eine vollständige Melodie als Takte von Notenbeschreibungen. */
export function generateMelody(rng: Rng, options: MelodyOptions): NoteSpec[][] {
  const capacity = measureCapacity(options.timeSignature);
  const choices = usableDurations(capacity, options.durations);
  insist(
    choices.length > 0,
    `Mit den gewählten Notenwerten lässt sich kein ${options.timeSignature}-Takt füllen.`,
  );

  const rhythm: { duration: Duration; dotted: boolean }[][] = [];
  for (let bar = 0; bar < options.bars; bar++) {
    rhythm.push(barRhythm(rng, capacity, choices, bar === options.bars - 1));
  }

  const total = rhythm.reduce((sum, bar) => sum + bar.length, 0);
  const degrees = walk(rng, total, options);

  let index = 0;
  const measures = rhythm.map((bar) =>
    bar.map((value): NoteSpec => {
      const pitch = pitchForDegree(degrees[index++], options);
      return { keys: [pitchKey(pitch)], duration: value.duration, dotted: value.dotted || undefined };
    }),
  );

  // Jeder Takt muss exakt gefüllt sein — sonst ist die Aufgabe nicht
  // notierbar und die Bewertung vergleicht Äpfel mit Birnen.
  measures.forEach((bar, number) => {
    const sum = bar.reduce((s, note) => s + durationInQuarters(note.duration, note.dotted), 0);
    insist(
      Math.abs(sum - capacity) < 1e-9,
      `Takt ${number + 1} enthält ${sum} statt ${capacity} Viertel`,
    );
  });

  // Der Schlusston muss der Grundton sein. Zurückgelesen wird über
  // `parsePitch()` — damit prüft der Test zugleich, dass die geschriebene
  // Tonangabe überhaupt wieder einlesbar ist (der Sonderfall B).
  const flat = measures.flat();
  insist(flat.length > 0, 'Melodie ohne Noten');
  const lastKey = flat[flat.length - 1].keys?.[0];
  insist(Boolean(lastKey), 'Schlussnote ohne Tonhöhe');
  insist(
    midi(parsePitch(lastKey!)) % 12 === midi(pitchForDegree(0, options)) % 12,
    `Melodie endet auf ${lastKey}, nicht auf dem Grundton`,
  );

  return measures;
}
