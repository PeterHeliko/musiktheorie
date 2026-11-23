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
 *  - Mit `autoplay` erklingt jede neue Aufgabe von selbst, sofern der Browser
 *    es erlaubt (nach einer Nutzeraktion auf der Seite, siehe player.unlock).
 *    Sonst bleibt es beim Knopf. Bei begrenzten Wiedergaben zählt das
 *    automatische Abspielen als erste.
 */

import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { AudioEvent } from '../content/audio';
import { player, samplesFor } from './player';

/** Wie stark verlangsamt der «langsamer»-Knopf? */
const SLOW_FACTOR = 0.7;

export function PracticeAudioPlayer({
  events,
  tempo,
  maxPlays,
  allowSlow = false,
  autoplay = false,
}: {
  events: AudioEvent[];
  tempo: number;
  /** Weglassen = unbegrenzt. */
  maxPlays?: number;
  allowSlow?: boolean;
  /** Neue Aufgabe gleich abspielen, wenn der Browser es zulässt. */
  autoplay?: boolean;
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

    let cancelled = false;
    if (autoplay) {
      void player.canPlayWithoutGesture().then((allowed) => {
        if (allowed && !cancelled) void startRef.current(1);
      });
    }
    return () => {
      cancelled = true;
      player.stop();
    };
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
  // Für das automatische Abspielen: immer die aktuelle Fassung von `start`.
  const startRef = useRef(start);
  startRef.current = start;

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

      {/* Ein Hinweis nur, wenn er etwas sagt: bei begrenzten Wiedergaben oder
          wenn der Ton nicht lädt. «Beliebig oft» ist der Normalfall. */}
      {failed ? (
        <span class="audio-note audio-error">
          Der Ton liess sich nicht laden. Prüfe die Verbindung und versuche es nochmals.
        </span>
      ) : maxPlays === undefined ? null : (
        <span class={`audio-note ${exhausted ? 'audio-exhausted' : ''}`}>
          {exhausted ? 'Keine Wiedergabe mehr übrig' : `noch ${remaining}×`}
        </span>
      )}
    </div>
  );
}
