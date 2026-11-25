/**
 * Auf der Klaviatur spielen: das verlangte Intervall, darunter die
 * Klaviatur mit der vorgegebenen Taste.
 *
 * Ablauf (Entscheid 2026-11-23):
 *  - Antippen wählt eine Taste und lässt sie sofort erklingen (beim
 *    Niederdrücken, ohne Vorlauf); eine andere antippen wählt um. Auf dem Telefon ist eine weisse Taste nur gut 25 px breit —
 *    ein Fehlgriff soll nicht gleich die Antwort sein.
 *  - «Prüfen» (oder Eingabe-/Leertaste) gibt die gewählte Taste ab.
 *  - Danach ist die gewählte Taste grün oder rot; war sie falsch, ist die
 *    richtige grün umrandet — wie bei den Antwortknöpfen.
 *
 * Ein Akkord (`task.chord`, Entscheid 2026-11-24): jedes Antippen nimmt eine
 * Taste dazu (sie klingt) oder wieder weg. Nach dem Prüfen ist jede gespielte
 * Taste grün oder rot — rot, wenn sie nicht zum Akkord gehört oder als
 * tiefste bzw. höchste das falsche Akkordglied ist. War der Akkord falsch,
 * steht die richtige Lage, die dem Gespielten am nächsten liegt, grün
 * umrandet da.
 *
 * Eine Tonleiter (`task.scale`) geht gleich: antippen nimmt dazu oder weg, der
 * blaue Grundton lässt sich nicht antippen. Nach dem Prüfen ist jede getippte
 * Taste grün oder rot, jede fehlende grün umrandet.
 *
 * Eine gehörte Melodie (`task.melody`, Entscheide 2026-11-25/26): der erste
 * Ton steht grau im System, keine Taste ist markiert. Jede angetippte Taste
 * klingt und füllt den nächsten Platz, der erste ersetzt den grauen Ton;
 * sind alle voll, klingt sie nur noch. Zurücknehmen gibt es nicht. Nach dem
 * Prüfen ist jeder gespielte Ton grün oder rot, und war etwas falsch, steht
 * die Melodie grün in einer zweiten Zeile darunter, ähnlich wie beim
 * Melodiediktat. Die Tasten selbst bleiben dabei ohne Farbe: was stimmt,
 * zeigt das System. Quer verschwindet die Klaviatur dann (styles.css).
 */

import { useEffect } from 'preact/hooks';
import { player, samplesFor } from '../audio/player';
import type { KeyboardTask, NoteSpec, ScoreSpec } from '../content/schema';
import { pitchKey } from '../generators/shared';
import { chordExamples, isWhiteKey, keysBetween, spellPlayedKey } from '../music/piano';
import { midi, parsePitch } from '../music/theory';
import { judgeChordKeys, scaleKeysCorrect, type KeyboardAnswer } from '../scoring';
import { pitchFromMidi } from '../sing/notes';
import { useExam } from '../state';
import { PianoKeyboard, type KeyState } from './PianoKeyboard';
import { Score } from './Score';

/**
 * Mit einem Notenbild darüber (Noten auf Klaviatur spielen) behält die
 * Klaviatur mindestens so viel Höhe; das Bild bekommt den Rest. Quer auf dem
 * Telefon sind das breite, gut treffbare Tasten und ein noch lesbares System.
 */
const KEYBOARD_RESERVE = 100;

/** Eine angetippte Taste klingt eine Sekunde und dann kurz aus. */
const KEY_SECONDS = 1;
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

  // Alle Töne der Klaviatur gleich holen: wer erst beim Antippen lädt, hört
  // die Taste spät. Einmal geladen, bleiben sie für alle weiteren Aufgaben
  // (rund 750 kB für zwei Oktaven).
  useEffect(() => {
    if (!task.sound) return;
    const keys = keysBetween(task.keyboard.low, task.keyboard.high);
    player.preload(samplesFor(keys.map((key) => ({ pitches: [pitchFromMidi(key)], quarters: 1 }))));
    return () => player.stop();
  }, [task]);

  const states: Record<number, KeyState> = {};
  if (task.melody) {
    // Keine Farben auf den Tasten: was gespielt ist, steht im System.
  } else if (revealed && task.scale) {
    // Eine Tonleiter: jede getippte Taste grün oder rot, jede fehlende grün
    // umrandet — die freie Oktave nur, wenn sonst etwas nicht stimmte.
    const right = scaleKeysCorrect(task, chosen);
    for (const key of task.accept) if (!right || !(task.optional ?? []).includes(key)) states[key] = 'solution';
    for (const key of chosen) states[key] = task.accept.includes(key) ? 'right' : 'wrong';
  } else if (revealed && task.chord) {
    // Ein Akkord: jede gespielte Taste grün oder rot; war er falsch, steht
    // eine richtige Lage grün umrandet da — die, die dem Gespielten am
    // nächsten liegt.
    const judged = judgeChordKeys(task.chord, chosen);
    if (!judged.correct) for (const key of nearestExample(task, chosen)) states[key] = 'solution';
    chosen.forEach((key, index) => (states[key] = judged.marks[index]));
  } else if (revealed) {
    const right = chosen.length === 1 && task.accept.includes(chosen[0]);
    if (!right) for (const key of task.accept) states[key] = 'solution';
    for (const key of chosen) states[key] = task.accept.includes(key) ? 'right' : 'wrong';
  } else {
    for (const key of chosen) states[key] = 'selected';
  }

  const press = (key: number) => {
    if (readOnly) return;
    if (task.melody) {
      // Jede Taste klingt; sie füllt den nächsten leeren Platz, solange es
      // einen gibt.
      if (task.sound) player.strike(pitchFromMidi(key), { seconds: KEY_SECONDS, release: KEY_RELEASE });
      if (chosen.length < task.accept.length) setAnswer(task.id, { keys: [...chosen, key] });
      return;
    }
    if (task.chord || task.scale) {
      // Antippen nimmt die Taste dazu oder wieder weg. Nur was dazukommt,
      // klingt.
      const removing = chosen.includes(key);
      if (!removing && task.sound) player.strike(pitchFromMidi(key), { seconds: KEY_SECONDS, release: KEY_RELEASE });
      const keys = removing ? chosen.filter((entry) => entry !== key) : [...chosen, key].sort((a, b) => a - b);
      setAnswer(task.id, { keys });
      return;
    }
    // Erst der Ton, dann alles andere: er soll sofort da sein.
    if (task.sound) player.strike(pitchFromMidi(key), { seconds: KEY_SECONDS, release: KEY_RELEASE });
    setAnswer(task.id, { keys: [key] });
  };

  return (
    <div class={`keyboard-task ${revealed && task.melody ? 'is-melody-checked' : ''}`}>
      {task.prompt && <p class="task-prompt task-prompt-strong">{task.prompt}</p>}
      {context && <p class="task-context">{context}</p>}
      {task.score && <Score spec={task.melody ? playedScore(task, chosen, revealed) : task.score} />}
      <PianoKeyboard
        low={task.keyboard.low}
        high={task.keyboard.high}
        marked={task.keyboard.marked}
        states={states}
        pressable={pressableFor(task)}
        onPress={press}
        multiple={Boolean(task.chord || task.scale)}
        disabled={readOnly}
        fit
        reserve={task.score ? KEYBOARD_RESERVE : undefined}
        label={task.prompt ? `Klaviatur: ${task.prompt}` : 'Klaviatur'}
      />
    </div>
  );
}

/**
 * Das System einer Melodie mit den gespielten Tasten in ihren Plätzen; nach
 * dem Prüfen jeder Ton grün oder rot. Was noch nicht gespielt ist, bleibt,
 * wie es war: der graue erste Ton, sonst ein leerer Platz.
 *
 * War etwas falsch, steht die Melodie grün in einer zweiten Zeile desselben
 * Bilds darunter (MeasureSpec.newLine), gleich gebaut: jeder Ton unter
 * seinem Platz, beide Zeilen gleich gross, auch wenn quer die Klaviatur
 * ihnen Platz macht (Entscheid 2026-11-26).
 */
function playedScore(task: KeyboardTask, chosen: readonly number[], revealed: boolean): ScoreSpec {
  const score = task.score!;
  const melody = task.melody!;
  const [measure] = score.measures;
  const notes = measure.notes.map((note, index): NoteSpec => {
    const played = chosen[index];
    if (played === undefined) return note;
    const pitch = spellPlayedKey(melody, task.accept, index, played);
    const right = played === task.accept[index];
    return { keys: [pitchKey(pitch)], duration: note.duration, ...(revealed ? { mark: right ? 'correct' : 'wrong' } : {}) };
  });
  const allRight = task.accept.every((key, index) => chosen[index] === key);
  if (!revealed || allRight) return { ...score, measures: [{ ...measure, notes }] };
  const solution = measure.notes.map((note, index): NoteSpec => ({ keys: [melody.written[index]], duration: note.duration, mark: 'correct' }));
  return { ...score, measures: [{ ...measure, notes }, { notes: solution, newLine: true }] };
}

/**
 * Welche Tasten sich antippen lassen: in der Grobbestimmung nur weisse, bei
 * der Tonleiter alle ausser dem vorgegebenen Grundton.
 */
function pressableFor(task: KeyboardTask): ((key: number) => boolean) | undefined {
  if (task.whiteOnly) return isWhiteKey;
  if (task.scale) return (key) => !(task.keyboard.marked ?? []).includes(key);
  return undefined;
}

/**
 * Eine richtige Lage des Akkords, so nah wie möglich am Gespielten (gemessen
 * an der tiefsten Taste). Ohne gespielte Taste die des Generators.
 */
function nearestExample(task: KeyboardTask, chosen: number[]): number[] {
  const rule = task.chord!;
  const classes = rule.tones.map((tone) => ((midi(parsePitch(tone)) % 12) + 12) % 12);
  const examples = chordExamples(classes, rule, task.keyboard.low, task.keyboard.high);
  if (chosen.length === 0 || examples.length === 0) return task.accept;
  const lowest = Math.min(...chosen);
  return examples.reduce((best, keys) => (Math.abs(keys[0] - lowest) < Math.abs(best[0] - lowest) ? keys : best));
}
