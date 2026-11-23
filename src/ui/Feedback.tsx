/**
 * Rückmeldung nach dem Antworten.
 *
 * Die Bewertung liefert bereits deutsche, lesbare Texte
 * (`Detail.studentResponse` / `correctResponse`) — hier wird nichts neu
 * formuliert, sondern nur angezeigt.
 *
 * Beim Diktat kommt das Notenbild der Lösung dazu. Eine Melodie in Worten
 * («g1 a1 h1 c2 …») kann man nicht mit dem vergleichen, was man selbst
 * geschrieben hat — man muss sie sehen.
 */

import type { NotationTask, ScoreSpec, Task } from '../content/schema';
import type { TaskResult } from '../scoring';
import { Score } from './Score';

export function Feedback({ result, task }: { result: TaskResult; task: Task }) {
  const perfect = result.earned >= result.possible - 1e-9;
  const partial = !perfect && result.earned > 1e-9;

  return (
    <div class={`feedback ${perfect ? 'is-correct' : partial ? 'is-partial' : 'is-wrong'}`}>
      <div class="feedback-head">
        <span class="feedback-mark" aria-hidden="true">
          {perfect ? '✓' : partial ? '≈' : '✗'}
        </span>
        <strong>
          {perfect ? 'Richtig' : partial ? 'Teilweise richtig' : 'Nicht richtig'}
        </strong>
        {result.possible > 1 && (
          <span class="feedback-score">
            {format(result.earned)} von {format(result.possible)} Punkten
          </span>
        )}
      </div>

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

      {solutionScore(task) && (
        <figure class="feedback-solution">
          <figcaption>So klang die Melodie:</figcaption>
          <Score spec={solutionScore(task)!} />
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
 * Das Notenbild der Musterlösung — nur beim Diktat. Bei allen anderen Aufgaben
 * steht die Lösung ohnehin in der Aufgabe oder im Antworttext.
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
