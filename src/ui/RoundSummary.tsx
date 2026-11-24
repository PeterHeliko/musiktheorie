/**
 * Auswertung einer Runde.
 *
 * Die Zahl allein hilft wenig — interessant ist, WAS falsch war. Deshalb steht
 * hier jede verfehlte Aufgabe mit der gegebenen und der richtigen Antwort, und
 * es gibt einen Knopf, der genau diese Aufgaben noch einmal stellt. Das ist
 * der eigentliche Grund für den reproduzierbaren Zufall: dieselben Startwerte
 * ergeben dieselben Aufgaben.
 */

import { navigate } from '../router';
import type { TaskResult } from '../scoring';

export interface RoundEntry {
  seed: number;
  result: TaskResult;
}

export function RoundSummary({
  entries,
  onRepeat,
  onRepeatWrong,
  onBack,
  inCourse,
}: {
  entries: RoundEntry[];
  onRepeat: () => void;
  onRepeatWrong: (seeds: number[]) => void;
  /** Zum Thema — im Kurs zum Kurs. */
  onBack: () => void;
  /**
   * Die Runde war ein Schritt eines Kurses. Dann geht es zuerst weiter im
   * Kurs; null beim letzten Schritt.
   */
  inCourse?: { nextHref: string | null } | null;
}) {
  const correct = entries.filter((entry) => isPerfect(entry.result)).length;
  const wrong = entries.filter((entry) => !isPerfect(entry.result));
  const percent = entries.length > 0 ? Math.round((correct / entries.length) * 100) : 0;

  return (
    <div class="round-summary">
      <h2>Übung beendet</h2>
      <p class="round-score">
        <strong>
          {correct} von {entries.length}
        </strong>{' '}
        richtig · {percent}&nbsp;%
      </p>

      {wrong.length === 0 ? (
        // Im Kurs sind die Filter fest; der Rat passt dort nicht.
        <p class="notice notice-good">{inCourse ? 'Alles richtig.' : 'Alles richtig. Zeit für einen engeren Filter?'}</p>
      ) : (
        <>
          <h3>Diese Aufgaben sassen noch nicht</h3>
          <ul class="round-list">
            {wrong.map((entry, index) => (
              <li key={`${entry.seed}-${index}`}>
                {entry.result.details
                  .filter((detail) => detail.correct === false)
                  .map((detail) => (
                    <div key={detail.id} class="round-detail">
                      <span class="feedback-given">{detail.studentResponse}</span>
                      <span class="feedback-arrow" aria-hidden="true">
                        →
                      </span>
                      <span class="feedback-correct">{detail.correctResponse}</span>
                    </div>
                  ))}
              </li>
            ))}
          </ul>
        </>
      )}

      {inCourse ? (
        <div class="round-actions">
          <button
            type="button"
            class="primary"
            onClick={() => (inCourse.nextHref ? navigate(inCourse.nextHref) : onBack())}
          >
            {inCourse.nextHref ? 'Nächste Übung' : 'Zum Kurs'}
          </button>
          {wrong.length > 0 && (
            <button type="button" onClick={() => onRepeatWrong(wrong.map((entry) => entry.seed))}>
              Falsche wiederholen ({wrong.length})
            </button>
          )}
          <button type="button" onClick={onRepeat}>
            Wiederholen
          </button>
          {inCourse.nextHref && (
            <button type="button" class="link-button" onClick={onBack}>
              Zum Kurs
            </button>
          )}
        </div>
      ) : (
        <div class="round-actions">
          {wrong.length > 0 && (
            <button
              type="button"
              class="primary"
              onClick={() => onRepeatWrong(wrong.map((entry) => entry.seed))}
            >
              Falsche wiederholen ({wrong.length})
            </button>
          )}
          <button type="button" class={wrong.length > 0 ? '' : 'primary'} onClick={onRepeat}>
            Wiederholen
          </button>
          <button type="button" class="link-button" onClick={onBack}>
            Übung wechseln
          </button>
        </div>
      )}
    </div>
  );
}

export function isPerfect(result: TaskResult): boolean {
  return result.earned >= result.possible - 1e-9;
}
