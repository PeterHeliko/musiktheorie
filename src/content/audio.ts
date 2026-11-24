/* Herkunft: musiktheorie-scorm/src/content/audio.ts (Stand 2026-08-21), über das Projekt «training».
   Wird hier eigenständig weitergeführt; es gibt keinen Abgleich mit dem Original mehr. */
/**
 * Beschreibung der Hörbeispiele.
 *
 * Hier steht, WAS erklingt: der Generator erzeugt die Beschreibung, und
 * `src/audio/player.ts` spielt sie mit Klaviersamples ab. Die Beschreibung
 * bleibt bewusst musikalisch («kleine Terz über c1») statt eine Tonliste zu
 * sein — so lässt sich in den Tests nachrechnen, dass das Hörbeispiel
 * wirklich zur ausgewiesenen Lösung passt.
 */

import { scalePitches, type ScaleType } from '../music/scales';
import {
  parseIntervalLabel,
  parsePitch,
  transposeByInterval,
  type Inversion,
  type Pitch,
} from '../music/theory';

// Die Tonleitern selbst stehen in music/scales.ts; hier nur weitergereicht.
export { SCALE_PATTERNS, type ScaleType } from '../music/scales';

export type AudioItem =
  /**
   * `from` ist immer der TIEFERE Ton. `direction: 'down'` spielt das Intervall
   * absteigend vor, also zuerst den oberen Ton — der Zusammenklang am Schluss
   * bleibt gleich. `melodic: false` lässt das Nacheinander weg und spielt nur
   * den Zusammenklang.
   */
  | {
      id: string;
      kind: 'interval';
      from: string;
      interval: string;
      direction?: 'up' | 'down';
      melodic?: boolean;
    }
  /**
   * Ein Akkord, Ton für Ton von unten nach oben («c4», «e4», «g4») — so
   * lassen sich auch ein abgesetzter Basston und sus4 beschreiben. Erst
   * gebrochen von unten nach oben, dann zusammen; `broken: false` lässt das
   * Arpeggio weg.
   */
  | { id: string; kind: 'voicing'; notes: string[]; broken?: boolean }
  | { id: string; kind: 'scale'; tonic: string; scale: ScaleType; direction?: 'up' | 'down' }
  /** Melodie; die Töne übergibt der Aufrufer, weil sie vom Generator stammen. */
  | { id: string; kind: 'melody'; tempo: number; countIn?: boolean };

/** Ein Klangereignis: gleichzeitig klingende Töne plus Dauer in Vierteln. */
export interface AudioEvent {
  /** Leer = Pause. */
  pitches: Pitch[];
  quarters: number;
  /**
   * Einzähler statt Musik: wird auf einem Holzblock gespielt, damit er sich
   * klanglich klar von der Melodie abhebt und nicht mitnotiert wird.
   */
  click?: boolean;
}

/** Wie viele Viertel wird vor dem Diktat eingezählt? */
const COUNT_IN_BEATS = 4;

/** Tonleitern und Dreiklänge werden ruhig gespielt, damit man sie hört. */
export const DEFAULT_TEMPO = 84;

/** Der Ton eine reine Oktave höher. */
function octaveUp(pitch: Pitch): Pitch {
  return transposeByInterval(pitch, { quality: 'r', number: 8 });
}

/**
 * Dreiklangstöne in der verlangten Umkehrung, von unten nach oben.
 * Grundstellung [1 3 5] → Sextakkord [3 5 1'] → Quartsextakkord [5 1' 3'].
 */
export function invertTriad(notes: Pitch[], inversion: Inversion = 'grundstellung'): Pitch[] {
  const shift = inversion === 'sextakkord' ? 1 : inversion === 'quartsextakkord' ? 2 : 0;
  return notes.map((_, index) => {
    const source = notes[(index + shift) % notes.length];
    // Die nach oben gewanderten Töne brauchen ihre Oktave dazu, sonst läge der
    // Akkord wieder in Grundstellung.
    return index + shift >= notes.length ? octaveUp(source) : source;
  });
}

/**
 * Setzt ein Hörbeispiel in eine Folge von Klangereignissen um.
 * Melodien werden vom Aufrufer geliefert, weil sie aus dem Generator stammen.
 */
export function expandAudioItem(item: AudioItem, melody?: AudioEvent[]): AudioEvent[] {
  const rest = (quarters: number): AudioEvent => ({ pitches: [], quarters });

  switch (item.kind) {
    case 'interval': {
      const low = parsePitch(item.from);
      const high = transposeByInterval(low, parseIntervalLabel(item.interval));
      const together: AudioEvent = { pitches: [low, high], quarters: 3 };
      if (item.melodic === false) return [together];

      const melodic = item.direction === 'down' ? [high, low] : [low, high];
      // Erst nacheinander, dann zusammen — so wie es die Aufgabe ankündigt.
      return [
        { pitches: [melodic[0]], quarters: 1 },
        { pitches: [melodic[1]], quarters: 1 },
        rest(0.5),
        together,
      ];
    }

    case 'voicing': {
      const notes = item.notes.map(parsePitch);
      const together: AudioEvent = { pitches: notes, quarters: 3 };
      if (item.broken === false) return [together];
      return [...notes.map((pitch) => ({ pitches: [pitch], quarters: 0.5 })), rest(0.5), together];
    }

    case 'scale': {
      // Abwärts von der Oktave zum Grundton — melodisch Moll dann in der
      // natürlichen Form. Die Dauern hängen an der Position, nicht am Ton:
      // der SCHLUSSTON bleibt länger stehen.
      const ordered = scalePitches(parsePitch(item.tonic), item.scale, item.direction ?? 'up');
      return ordered.map((pitch, index) => ({
        pitches: [pitch],
        quarters: index === ordered.length - 1 ? 2 : 1,
      }));
    }

    case 'melody': {
      if (!melody) throw new Error(`Melodie für ${item.id} nicht übergeben`);
      if (item.countIn === false) return melody;
      // Vorgezählt wird auf einem Holzblock: ohne Puls ist ein Diktat kaum zu
      // notieren.
      const countIn: AudioEvent[] = Array.from({ length: COUNT_IN_BEATS }, () => ({
        pitches: [parsePitch('c5')],
        quarters: 1,
        click: true,
      }));
      return [...countIn, ...melody];
    }
  }
}

export function tempoFor(item: AudioItem): number {
  return item.kind === 'melody' ? item.tempo : DEFAULT_TEMPO;
}
