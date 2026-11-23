/**
 * Die Schwelle «Ton oder Raum» — vor allem: sie darf nicht davon abhängen, wie
 * laut ein Gerät das Mikrofon liefert. Genau daran scheiterte die erste
 * Fassung auf iOS, wo Gesang ohne Sprachaufbereitung sehr leise ankommt.
 */

import { describe, expect, it } from 'vitest';
import { NoiseGate, rms, toDb } from './level';

/** Fenster alle 1000/60 ms, wie beim Bildaufbau. */
const FRAME = 1000 / 60;

/** Spielt eine Folge von Pegeln durch und sammelt die Entscheidungen. */
function run(gate: NoiseGate, levels: number[], start = 0): boolean[] {
  return levels.map((level, index) => gate.update(level, start + index * FRAME));
}

/** n Fenster mit leicht schwankendem Pegel um `level`. */
function steady(level: number, frames: number): number[] {
  return Array.from({ length: frames }, (_, i) => level * (1 + 0.1 * Math.sin(i * 0.7)));
}

/** Eine typische Übung: Raum, Ton, Atempause, Ton, Raum. */
function session(noise: number, voice: number): number[] {
  return [
    ...steady(noise, 60),
    ...steady(voice, 180),
    ...steady(noise, 30),
    ...steady(voice * 0.5, 120),
    ...steady(noise, 60),
  ];
}

describe('rms / toDb', () => {
  it('misst den Effektivwert', () => {
    const square = new Float32Array(1000).map((_, i) => (i % 2 === 0 ? 0.5 : -0.5));
    expect(rms(square)).toBeCloseTo(0.5, 6);
    expect(toDb(1)).toBe(0);
    expect(toDb(0.1)).toBeCloseTo(-20, 6);
  });
});

describe('NoiseGate', () => {
  it('lässt Gesang durch und den Raum nicht', () => {
    const gate = new NoiseGate();
    const decisions = run(gate, session(0.002, 0.05));
    expect(decisions.slice(0, 60).every((d) => !d)).toBe(true);
    expect(decisions.slice(60, 240).every((d) => d)).toBe(true);
    expect(decisions.slice(240, 270).every((d) => !d)).toBe(true);
    expect(decisions.slice(270, 390).every((d) => d)).toBe(true);
    expect(decisions.slice(390).every((d) => !d)).toBe(true);
  });

  it('entscheidet am leisen iOS-Mikrofon genauso wie am Rechner', () => {
    // Dieselbe Szene, 25 dB leiser — so viel leiser kommt das Signal auf
    // einem iPhone ohne Sprachaufbereitung an.
    const scale = 10 ** (-25 / 20);
    const desktop = run(new NoiseGate(), session(0.004, 0.06));
    const phone = run(new NoiseGate(), session(0.004 * scale, 0.06 * scale));
    expect(phone).toEqual(desktop);
    expect(phone.filter(Boolean).length).toBeGreaterThan(250);
  });

  it('hält einen langen Ton ohne Atempause durch', () => {
    const gate = new NoiseGate();
    run(gate, steady(0.002, 60));
    // 40 Sekunden ununterbrochen gesungen, nur 20 dB über dem Raum.
    const decisions = run(gate, steady(0.02, 40 * 60), 1000);
    expect(decisions.every((d) => d)).toBe(true);
  });

  it('beginnt mit der ersten Messung als Raum', () => {
    const gate = new NoiseGate();
    // Brummen von Anfang an: gehört sofort zum Raum.
    expect(run(gate, steady(0.001, 120)).some((d) => d)).toBe(false);
  });

  it('lernt ein später einsetzendes Brummen als Raum', () => {
    const gate = new NoiseGate();
    run(gate, steady(0.0005, 60));
    // Ein Lüfter springt an, 12 dB lauter als der Raum. Zuerst gilt er als
    // Ton (die Tonhöhenerkennung verwirft ihn dann an der Eindeutigkeit), nach
    // spätestens einer Minute gehört er zum Raum.
    const decisions = run(gate, steady(0.002, 60 * 60), 1000);
    expect(decisions.slice(-60).every((d) => !d)).toBe(true);
  });

  it('überspringt den Anlauf des Mikrofons', () => {
    const gate = new NoiseGate();
    // Erst Nullen, dann halb gefüllte Fenster mit winzigem Pegel, dann der Raum.
    run(gate, [...new Array(30).fill(0), 0.00001, 0.00005, 0.0003, 0.001, ...steady(0.002, 60)]);
    expect(gate.noiseFloor).toBeGreaterThan(0.0015);
  });

  it('nimmt nach einer Pause sofort den leiseren Raum an', () => {
    const gate = new NoiseGate();
    run(gate, steady(0.01, 60));
    gate.update(0.0005, 2000);
    expect(gate.noiseFloor).toBeLessThanOrEqual(0.0005);
    expect(gate.update(0.01, 2020)).toBe(true);
  });

  it('nennt digitale Stille nie einen Ton', () => {
    const gate = new NoiseGate();
    expect(run(gate, steady(0.00005, 120)).some((d) => d)).toBe(false);
    expect(gate.update(0, 3000)).toBe(false);
  });
});
