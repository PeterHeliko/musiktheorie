/**
 * Auf der Klaviatur spielen: das verlangte Intervall, darunter die
 * Klaviatur mit der vorgegebenen Taste.
 *
 * Ablauf (Entscheid 2026-11-23):
 *  - Antippen wählt eine Taste und lässt sie erklingen; eine andere antippen
 *    wählt um. Auf dem Telefon ist eine weisse Taste nur gut 25 px breit —
 *    ein Fehlgriff soll nicht gleich die Antwort sein.
 *  - «Prüfen» (oder Eingabe-/Leertaste) gibt die gewählte Taste ab.
 *  - Danach ist die gewählte Taste grün oder rot; war sie falsch, ist die
 *    richtige grün umrandet — wie bei den Antwortknöpfen.
 */

import { useRef } from 'preact/hooks';
import { player, samplesFor } from '../audio/player';
import type { KeyboardTask } from '../content/schema';
import { isWhiteKey, keysBetween } from '../music/piano';
import type { KeyboardAnswer } from '../scoring';
import { pitchFromMidi } from '../sing/notes';
import { useExam } from '../state';
import { PianoKeyboard, type KeyState } from './PianoKeyboard';

/** Eine angetippte Taste klingt eine Sekunde und dann kurz aus. */
const KEY_TEMPO = 60;
const KEY_RELEASE = 0.8;

export function KeyboardTaskView({
  task,
  context,
  revealed,
}: {
  task: KeyboardTask;
  /** Was nur für diese Aufgabe gilt, etwa die Richtung. */
  context?: string;
  /** Geprüft: die Tasten zeigen richtig und falsch. */
  revealed: boolean;
}) {
  const { answer, setAnswer, readOnly } = useExam();
  const chosen = answer<KeyboardAnswer>(task.id)?.keys ?? [];
  const preloaded = useRef(false);

  const states: Record<number, KeyState> = {};
  if (revealed) {
    const right = chosen.length === 1 && task.accept.includes(chosen[0]);
    if (!right) for (const key of task.accept) states[key] = 'solution';
    for (const key of chosen) states[key] = task.accept.includes(key) ? 'right' : 'wrong';
  } else {
    for (const key of chosen) states[key] = 'selected';
  }

  const press = (key: number) => {
    if (readOnly) return;
    if (task.sound) {
      // Im Tippen selbst freischalten — iOS lässt den Ton sonst nicht zu.
      player.unlock();
      void player
        .play([{ pitches: [pitchFromMidi(key)], quarters: 1 }], KEY_TEMPO, { finalRelease: KEY_RELEASE })
        .catch((error) => console.warn('Wiedergabe fehlgeschlagen:', error));
      // Wer einmal getippt hat, tippt weiter: dann den Rest der Klaviatur
      // holen. Vorher nicht — zwei Oktaven sind rund 750 kB.
      if (!preloaded.current) {
        preloaded.current = true;
        const all = keysBetween(task.keyboard.low, task.keyboard.high);
        player.preload(samplesFor(all.map((other) => ({ pitches: [pitchFromMidi(other)], quarters: 1 }))));
      }
    }
    setAnswer(task.id, { keys: [key] });
  };

  return (
    <div class="keyboard-task">
      {task.prompt && <p class="task-prompt task-prompt-strong">{task.prompt}</p>}
      {context && <p class="task-context">{context}</p>}
      <PianoKeyboard
        low={task.keyboard.low}
        high={task.keyboard.high}
        marked={task.keyboard.marked}
        states={states}
        pressable={task.whiteOnly ? isWhiteKey : undefined}
        onPress={press}
        disabled={readOnly}
        fit
        label={task.prompt ? `Klaviatur: ${task.prompt}` : 'Klaviatur'}
      />
    </div>
  );
}
