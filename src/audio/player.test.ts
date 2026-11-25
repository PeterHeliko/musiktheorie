/**
 * Wann gilt eine Wiedergabe als fertig? Nicht erst nach der vollen
 * Ausklingzeit, sondern sobald nichts mehr zu hören ist. Gemessen wird das
 * einmal je Sample, und diese Messung prüfen wir hier.
 */

import { describe, expect, it } from 'vitest';
import { audibleSeconds } from './player';

/** Ein Puffer wie von decodeAudioData, aus festen Werten. */
function buffer(channels: number[][], sampleRate = 10): Parameters<typeof audibleSeconds>[0] {
  return {
    numberOfChannels: channels.length,
    sampleRate,
    getChannelData: (channel: number) => Float32Array.from(channels[channel]),
  };
}

describe('audibleSeconds', () => {
  it('endet nach dem letzten hörbaren Wert', () => {
    expect(audibleSeconds(buffer([[0.5, -0.4, 0.2, 0, 0, 0]]))).toBeCloseTo(0.3);
  });

  it('überhört den leisen Rest unter -50 dBFS', () => {
    // -40 dBFS ist noch zu hören, -60 dBFS nicht mehr.
    expect(audibleSeconds(buffer([[0.5, 0.01, 0.001, 0.001, 0.001]]))).toBeCloseTo(0.2);
  });

  it('nimmt den Kanal, der länger klingt', () => {
    expect(audibleSeconds(buffer([[0.5, 0, 0, 0, 0], [0.5, 0.3, 0.2, 0.1, 0]]))).toBeCloseTo(0.4);
  });

  it('ist bei Stille null', () => {
    expect(audibleSeconds(buffer([[0, 0.0001, 0]]))).toBe(0);
  });
});
