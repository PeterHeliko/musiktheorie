/**
 * Abspielknopf.
 *
 * Zwei Eigenheiten, die zum Üben gehören:
 *
 *  - Standardmässig UNBEGRENZT abspielbar. Ein Limit misst, statt zu üben —
 *    wer es trotzdem will (etwa um Druck zu simulieren), schaltet den Filter
 *    «Wiedergaben begrenzen» ein.
 *  - Ein «langsamer»-Knopf für das Diktat: dieselbe Melodie, gemächlicher.
 *    Beim Mitschreiben ist das die häufigste Hilfe, die man sich wünscht.
 */

import { useCallback, useEffect, useState } from 'preact/hooks';
import type { AudioEvent } from '../content/audio';
import { player, samplesFor } from './player';

/** Wie stark verlangsamt der «langsamer»-Knopf? */
const SLOW_FACTOR = 0.7;

export function PracticeAudioPlayer({
  events,
  tempo,
  maxPlays,
  allowSlow = false,
}: {
  events: AudioEvent[];
  tempo: number;
  /** Weglassen = unbegrenzt. */
  maxPlays?: number;
  allowSlow?: boolean;
}) {
  const [playing, setPlaying] = useState(false);
  const [used, setUsed] = useState(0);
  const [failed, setFailed] = useState(false);

  const remaining = maxPlays === undefined ? Infinity : Math.max(0, maxPlays - used);
  const exhausted = remaining === 0;

  // Neue Aufgabe: Zähler zurück, laufende Wiedergabe abbrechen und die
  // gebrauchten Samples schon einmal holen, damit der erste Klick sitzt.
  useEffect(() => {
    player.stop();
    setPlaying(false);
    setUsed(0);
    setFailed(false);
    player.preload(samplesFor(events));
    return () => player.stop();
  }, [events]);

  const start = useCallback(
    async (factor: number) => {
      if (exhausted || playing) return;
      // Erst zählen, dann abspielen: sonst umgeht ein schneller Doppelklick
      // das Limit.
      setUsed((n) => n + 1);
      setPlaying(true);
      try {
        await player.play(events, tempo * factor);
      } catch (error) {
        console.warn('Wiedergabe fehlgeschlagen:', error);
        setFailed(true);
      } finally {
        setPlaying(false);
      }
    },
    [events, tempo, exhausted, playing],
  );

  return (
    <div class="audio-player">
      <button
        type="button"
        class={`play-button ${playing ? 'is-playing' : ''}`}
        onClick={() => void start(1)}
        disabled={exhausted || playing}
        aria-label={playing ? 'Wiedergabe läuft' : 'Hörbeispiel abspielen'}
      >
        <span class="play-icon" aria-hidden="true">
          {playing ? '❚❚' : '▶'}
        </span>
        <span>{playing ? 'Läuft …' : 'Abspielen'}</span>
      </button>

      {allowSlow && (
        <button
          type="button"
          class="play-button play-button-secondary"
          onClick={() => void start(SLOW_FACTOR)}
          disabled={exhausted || playing}
        >
          <span class="play-icon" aria-hidden="true">
            ▶
          </span>
          <span>langsamer</span>
        </button>
      )}

      {failed ? (
        <span class="audio-note audio-error">
          Kein Ton. Sind die Klaviersamples gebaut? («npm run samples»)
        </span>
      ) : maxPlays === undefined ? (
        <span class="audio-note">beliebig oft abspielbar</span>
      ) : (
        <span class={`audio-note ${exhausted ? 'audio-exhausted' : ''}`}>
          {exhausted ? 'Keine Wiedergabe mehr übrig' : `noch ${remaining}× abspielbar`}
        </span>
      )}
    </div>
  );
}
