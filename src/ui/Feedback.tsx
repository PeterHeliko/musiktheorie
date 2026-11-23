/**
 * Rückmeldung nach dem Antworten — in zwei Teilen:
 *
 *  - `Verdict`: eine Zeile in der Leiste unten, direkt über «Weiter». Bei
 *    Aufgaben mit einer einzigen Antwort steht dort schon alles («✓ Richtig:
 *    kleine Terz», «✗ Richtig wäre: grosse Septime»).
 *  - `FeedbackDetails`: die Liste unter der Aufgabe, nur bei mehrteiligen
 *    Aufgaben und beim Diktat. Sie wäre für die Leiste zu lang.
 *
 * Die Bewertung liefert bereits deutsche, lesbare Texte
 * (`Detail.studentResponse` / `correctResponse`) — hier wird nichts neu
 * formuliert, sondern nur angezeigt.
 */

import type { NotationTask, ScoreSpec, Task } from '../content/schema';
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
  wrong: 'Nicht richtig',
};

/** Braucht die Aufgabe die ausführliche Liste unter der Aufgabe? */
export function hasDetails(result: TaskResult, task: Task): boolean {
  return result.details.length > 1 || solutionScore(task) !== null;
}

export function Verdict({ result, task }: { result: TaskResult; task: Task }) {
  const grade = gradeOf(result);
  const single = !hasDetails(result, task) ? result.details[0] : undefined;

  let text: string;
  if (single && grade === 'correct') text = `${WORD.correct}: ${single.studentResponse}`;
  // Beim Singen sieht man die eigene Antwort nicht als Knopf oder Note —
  // deshalb steht da, was gesungen wurde.
  else if (single && task.kind === 'sing') text = `Gesungen: ${single.studentResponse} · richtig wäre ${single.correctResponse}`;
  // Auf der Klaviatur ist die Taste zu sehen, aber nicht, welches Intervall
  // sie bildet — das sagt die Leiste.
  else if (single && task.kind === 'keyboard') text = `Gespielt: ${single.studentResponse} · richtig wäre ${single.correctResponse}`;
  else if (single) text = `Richtig wäre: ${single.correctResponse}`;
  else text = WORD[grade];

  return (
    <p class={`verdict is-${grade}`} role="status">
      <span class="verdict-mark" aria-hidden="true">
        {MARK[grade]}
      </span>
      <span class="verdict-text">{text}</span>
      {!single && result.possible > 1 && (
        <span class="verdict-score">
          {format(result.earned)} von {format(result.possible)} Punkten
        </span>
      )}
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

/** Punkte lesbar: «3» statt «3», aber «2.5» statt «2.5000000001». */
function format(value: number): string {
  return String(Math.round(value * 100) / 100);
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
