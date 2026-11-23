/**
 * Der Tonhöhenerkenner mit künstlichen Signalen.
 *
 * Künstlich heisst hier: die richtige Antwort ist bekannt. Geprüft wird über
 * den ganzen Stimmumfang, mit obertonreichem Klang (wie eine Stimme, anders
 * als ein Sinus), mit Rauschen, mit Vibrato — und dass Stille und reines
 * Rauschen KEINEN Ton ergeben.
 */

import { describe, expect, it } from 'vitest';
import { makeRng } from '../generators/rng';
import { nameFromMidi, nearestNote } from './notes';
import { PitchSmoother, detectPitch } from './pitch';

const WINDOW = 2048;

function cents(measured: number, expected: number): number {
  return 1200 * Math.log2(measured / expected);
}

/** Ein Fenster eines Signals; `wave` bekommt die Phase in Perioden. */
function signal(
  frequency: number,
  sampleRate: number,
  wave: (phase: number) => number,
  { amplitude = 0.4, noise = 0, vibratoCents = 0, seed = 1 } = {},
): Float32Array {
  const rng = makeRng(seed);
  const out = new Float32Array(WINDOW);
  let phase = 0;
  for (let i = 0; i < WINDOW; i++) {
    const t = i / sampleRate;
    // Vibrato 5,5 Hz — typisch für gesungene Töne.
    const f = frequency * 2 ** ((vibratoCents * Math.sin(2 * Math.PI * 5.5 * t)) / 1200);
    phase += f / sampleRate;
    out[i] = amplitude * wave(phase) + noise * (rng.next() * 2 - 1);
  }
  return out;
}

const sine = (phase: number) => Math.sin(2 * Math.PI * phase);
/** Sägezahn: alle Obertöne, ähnlich obertonreich wie eine Stimme. */
const saw = (phase: number) => 2 * (phase - Math.floor(phase + 0.5));
/** Schwacher Grundton, kräftige Oktave — die Falle für Oktavfehler. */
const weakFundamental = (phase: number) =>
  0.3 * Math.sin(2 * Math.PI * phase) + Math.sin(4 * Math.PI * phase) + 0.5 * Math.sin(6 * Math.PI * phase);

// Vom tiefen E einer Bassstimme bis zum c³ eines Soprans.
const FREQUENCIES = [82.41, 110, 146.83, 196, 261.63, 329.63, 440, 587.33, 783.99, 1046.5];

describe('detectPitch', () => {
  for (const sampleRate of [44100, 48000]) {
    it(`trifft Sinustöne auf 3 Cent genau (${sampleRate} Hz)`, () => {
      for (const frequency of FREQUENCIES) {
        const estimate = detectPitch(signal(frequency, sampleRate, sine), sampleRate);
        expect(estimate, `${frequency} Hz`).not.toBeNull();
        expect(Math.abs(cents(estimate!.frequency, frequency)), `${frequency} Hz`).toBeLessThan(3);
        expect(estimate!.clarity).toBeGreaterThan(0.95);
      }
    });

    it(`trifft obertonreiche Klänge ohne Oktavfehler (${sampleRate} Hz)`, () => {
      for (const frequency of FREQUENCIES) {
        const estimate = detectPitch(signal(frequency, sampleRate, saw), sampleRate);
        expect(estimate, `${frequency} Hz`).not.toBeNull();
        expect(Math.abs(cents(estimate!.frequency, frequency)), `${frequency} Hz`).toBeLessThan(5);
      }
    });
  }

  it('misst einen schwachen Grundton nicht eine Oktave zu hoch', () => {
    for (const frequency of [110, 220, 330]) {
      const estimate = detectPitch(signal(frequency, 48000, weakFundamental), 48000);
      expect(estimate, `${frequency} Hz`).not.toBeNull();
      expect(Math.abs(cents(estimate!.frequency, frequency)), `${frequency} Hz`).toBeLessThan(5);
    }
  });

  it('kommt mit Rauschen zurecht', () => {
    for (const frequency of [130.81, 261.63, 523.25]) {
      // Rauschen mit einem Viertel der Amplitude des Tons — ein lautes Zimmer.
      const estimate = detectPitch(signal(frequency, 48000, saw, { noise: 0.1, seed: frequency }), 48000);
      expect(estimate, `${frequency} Hz`).not.toBeNull();
      expect(Math.abs(cents(estimate!.frequency, frequency)), `${frequency} Hz`).toBeLessThan(10);
    }
  });

  it('bleibt bei Vibrato in der Nähe des Tons', () => {
    // Das Fenster ist 43 ms lang, das Vibrato schwingt ±40 Cent mit 5,5 Hz:
    // innerhalb eines Fensters wandert der Ton also nur ein Stück. Erwartet
    // ist eine Schätzung innerhalb des Vibratobereichs.
    const estimate = detectPitch(signal(220, 48000, saw, { vibratoCents: 40 }), 48000);
    expect(estimate).not.toBeNull();
    expect(Math.abs(cents(estimate!.frequency, 220))).toBeLessThan(45);
  });

  it('meldet Stille als keinen Ton', () => {
    expect(detectPitch(new Float32Array(WINDOW), 48000)).toBeNull();
    expect(detectPitch(signal(440, 48000, sine, { amplitude: 0.002 }), 48000)).toBeNull();
  });

  it('meldet reines Rauschen als keinen oder einen unklaren Ton', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const estimate = detectPitch(signal(440, 48000, () => 0, { noise: 0.3, seed }), 48000);
      if (estimate) expect(estimate.clarity, `seed ${seed}`).toBeLessThan(0.85);
    }
  });
});

describe('PitchSmoother', () => {
  it('überhört einen einzelnen Ausreisser', () => {
    const smoother = new PitchSmoother(5, 0.85);
    const values = [220, 221, 440, 219, 220].map((frequency) =>
      smoother.push({ frequency, clarity: 0.95 }),
    );
    expect(values[values.length - 1]).toBe(220);
  });

  it('beginnt nach einer Pause von vorn', () => {
    const smoother = new PitchSmoother(5, 0.85);
    smoother.push({ frequency: 220, clarity: 0.95 });
    smoother.push({ frequency: 220, clarity: 0.95 });
    expect(smoother.push(null)).toBeNull();
    expect(smoother.push({ frequency: 330, clarity: 0.95 })).toBe(330);
  });

  it('ignoriert unklare Schätzungen', () => {
    const smoother = new PitchSmoother(5, 0.85);
    expect(smoother.push({ frequency: 220, clarity: 0.5 })).toBeNull();
  });
});

describe('nearestNote', () => {
  it('benennt Töne deutsch', () => {
    expect(nearestNote(440)).toEqual({ midi: 69, cents: 0, name: 'a1' });
    expect(nearestNote(261.63).name).toBe('c1');
    expect(nearestNote(466.16).name).toBe('b1');
    expect(nearestNote(493.88).name).toBe('h1');
    expect(nearestNote(311.13).name).toBe('es1');
    expect(nearestNote(130.81).name).toBe('c');
    expect(nearestNote(65.41).name).toBe('C');
    expect(nameFromMidi(73)).toBe('cis2');
  });

  it('misst die Abweichung in Cent', () => {
    expect(nearestNote(440 * 2 ** (20 / 1200)).cents).toBe(20);
    expect(nearestNote(440 * 2 ** (-35 / 1200)).cents).toBe(-35);
  });

  it('rechnet mit anderem Kammerton', () => {
    expect(nearestNote(442, 442)).toEqual({ midi: 69, cents: 0, name: 'a1' });
    expect(nearestNote(442).cents).toBe(8);
  });
});
