/**
 * Rückmeldung nach dem Antworten — wo immer es geht, zeigt die Aufgabe sie
 * selbst, statt sie hinzuschreiben (Entscheid 2026-11-23): die richtige
 * Antwort ist der grün umrandete Knopf, die grün umrandete Taste, die grüne
 * Note im System. Wer sie dort sieht, braucht sie nicht noch einmal zu lesen.
 *
 *  - `Verdict`: eine Zeile in der Leiste unten, direkt über «Weiter». Zeigt
 *    die Aufgabe die Lösung, steht dort nur das Urteil («✓ Richtig»,
 *    «✗ Falsch»). Sonst, bei einer einzigen Antwort, auch sie («✗ Richtig
 *    wäre: e2»). Bei mehreren Teilen (Felder, Töne, Takte), nicht alle
 *    richtig, steht statt des Urteils, wie viele es sind («≈ 5 von 7
 *    richtig»). Punkte gibt es nicht zu sehen (Entscheid 2026-11-27).
 *  - `FeedbackDetails`: die Liste unter der Aufgabe, nur bei mehrteiligen
 *    Aufgaben, deren Lösung nicht schon zu sehen ist, und beim Diktat.
 *
 * Die Bewertung liefert bereits deutsche, lesbare Texte
 * (`Detail.studentResponse` / `correctResponse`) — hier wird nichts neu
 * formuliert, sondern nur angezeigt. Bildschirmleser bekommen sie auch dort,
 * wo die Leiste sie nicht zeigt: Farben und Umrandungen sehen sie nicht.
 */

import type { NotationTask, ScoreSpec, Task } from '../content/schema';
import type { Detail } from '../scoring';
import type { TaskResult } from '../scoring';
import { Score } from './Score';

export type Grade = 'correct' | 'partial' | 'wrong';

export function gradeOf(result: TaskResult): Grade {
  if (result.earned >= result.possible - 1e-9) return 'correct';
  return result.earned > 1e-9 ? 'partial' : 'wrong';
}

const MARK: Record<Grade, string> = { correct: '✓', partial: '≈', wrong: '✗' };
const WORD: Record<Grade, string> = {
  correct: 'Richtig',
  partial: 'Teilweise richtig',
  wrong: 'Falsch',
};

/**
 * Zeigt die Aufgabe nach dem Prüfen die Lösung selbst?
 *
 *  - Knopfraster: die eigene Wahl grün oder rot, die richtige grün umrandet.
 *  - Klaviatur: ebenso die Tasten.
 *  - Gesetzte Töne (Intervall, Tonleiter): falsch, steht der richtige grün
 *    daneben.
 *  - Ein frei gesetzter Akkord: jeder Ton grün oder rot, falsch steht eine
 *    richtige Lösung grün daneben.
 *  - Vorzeichen: jedes gesetzte grün oder rot, falsch steht der richtige Satz
 *    grün daneben.
 *  - Singen: Zielton grün im System, ein falscher Ton rot davor.
 *
 * Auswahllisten, Diktat, Pausen und Halbtonschritte zeigen sie (noch) nicht —
 * dort bleibt sie in Worten.
 */
export function showsSolution(task: Task): boolean {
  switch (task.kind) {
    case 'select':
      return task.fields.every((field) => field.buttons);
    case 'keyboard':
    case 'sing':
      return true;
    case 'notation':
      if (task.solution.type === 'chord') return !task.fields?.length;
      if (task.solution.type === 'keysig') return true;
      return (
        task.solution.type === 'pitch' &&
        task.solution.slots.every((slot) => !slot.chord) &&
        !task.fields?.length
      );
    default:
      return false;
  }
}

/** Braucht die Aufgabe die ausführliche Liste unter der Aufgabe? */
export function hasDetails(result: TaskResult, task: Task): boolean {
  if (showsSolution(task)) return false;
  return result.details.length > 1 || solutionScore(task) !== null;
}

/** Die Antwort in Worten, wie sie früher in der Leiste stand. */
function spokenAnswer(detail: Detail, task: Task): string {
  if (detail.correct) return detail.studentResponse;
  if (task.kind === 'sing') return `gesungen ${detail.studentResponse}, richtig wäre ${detail.correctResponse}`;
  if (task.kind === 'keyboard') return `gespielt ${detail.studentResponse}, richtig wäre ${detail.correctResponse}`;
  return `richtig wäre ${detail.correctResponse}`;
}

export function Verdict({ result, task }: { result: TaskResult; task: Task }) {
  const grade = gradeOf(result);
  const shown = showsSolution(task);
  const single = result.details.length === 1 && !hasDetails(result, task) ? result.details[0] : undefined;

  const count = countOf(result);

  let text: string;
  if (count && grade !== 'correct') text = `${count.right} von ${count.of} richtig`;
  else if (shown || !single) text = WORD[grade];
  else if (grade === 'correct') text = `${WORD.correct}: ${single.studentResponse}`;
  else text = `Richtig wäre: ${single.correctResponse}`;

  const many = result.details.length > 1;
  const spoken = shown
    ? result.details.map((detail) => (many ? `${detail.label} ` : '') + spokenAnswer(detail, task)).join('; ')
    : '';

  return (
    <p class={`verdict is-${grade}`} role="status">
      <span class="verdict-mark" aria-hidden="true">
        {MARK[grade]}
      </span>
      <span class="verdict-text">{text}</span>
      {spoken && <span class="visually-hidden">: {spoken}</span>}
    </p>
  );
}

export function FeedbackDetails({ result, task }: { result: TaskResult; task: Task }) {
  const solution = solutionScore(task);
  return (
    <div class="feedback">
      <ul class="feedback-list">
        {result.details.map((detail) => (
          <li key={detail.id} class={detail.correct ? 'is-correct' : 'is-wrong'}>
            <span class="feedback-detail-mark" aria-hidden="true">
              {detail.correct ? '✓' : '✗'}
            </span>
            <span class="feedback-detail-body">
              {detail.label !== 'Antwort' && <span class="feedback-detail-label">{detail.label}</span>}
              <span class="feedback-given">{detail.studentResponse}</span>
              {!detail.correct && (
                <>
                  <span class="feedback-arrow" aria-hidden="true">
                    →
                  </span>
                  <span class="feedback-correct">{detail.correctResponse}</span>
                </>
              )}
            </span>
          </li>
        ))}
      </ul>

      {solution && (
        <figure class="feedback-solution">
          <figcaption>So klang die Melodie:</figcaption>
          <Score spec={solution} />
        </figure>
      )}
    </div>
  );
}

/**
 * Wie viele Teile einer mehrteiligen Aufgabe richtig sind. Ein Teil ohne
 * Gewicht (ein leer gelassener freier Platz) zählt nicht mit. Null bei
 * weniger als zwei Teilen, und wo ein Teil halb zählen kann (Rhythmus und
 * Tonhöhen im Diktat): «0 von 2 richtig» stimmte dort nicht, die Liste unter
 * der Aufgabe zeigt es genauer.
 */
function countOf(result: TaskResult): { right: number; of: number } | null {
  const parts = result.details.filter((detail) => detail.possible > 0);
  const full = (detail: Detail) => detail.earned >= detail.possible - 1e-9;
  if (parts.length < 2 || parts.some((detail) => detail.earned > 1e-9 && !full(detail))) return null;
  return { right: parts.filter(full).length, of: parts.length };
}

/**
 * Das Notenbild der Musterlösung — nur beim Diktat. Eine Melodie in Worten
 * («g1 a1 h1 c2 …») kann man nicht mit dem vergleichen, was man selbst
 * geschrieben hat — man muss sie sehen.
 */
function solutionScore(task: Task): ScoreSpec | null {
  if (task.kind !== 'notation') return null;
  const notation = task as NotationTask;
  if (notation.solution.type !== 'melody') return null;

  return {
    clef: notation.score.clef,
    keySignature: notation.score.keySignature,
    timeSignature: notation.score.timeSignature,
    endBar: true,
    measures: notation.solution.measures.map((notes) => ({ notes })),
  };
}
