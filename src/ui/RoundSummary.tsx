/**
 * Auswertung einer Runde.
 *
 * Die Zahl allein hilft wenig — interessant ist, WAS falsch war. Deshalb steht
 * hier jede verfehlte Aufgabe mit der gegebenen und der richtigen Antwort, und
 * es gibt einen Knopf, der genau diese Aufgaben noch einmal stellt. Das ist
 * der eigentliche Grund für den reproduzierbaren Zufall: dieselben Startwerte
 * ergeben dieselben Aufgaben.
 */

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
}: {
  entries: RoundEntry[];
  onRepeat: () => void;
  onRepeatWrong: (seeds: number[]) => void;
  onBack: () => void;
}) {
  const correct = entries.filter((entry) => isPerfect(entry.result)).length;
  const wrong = entries.filter((entry) => !isPerfect(entry.result));
  const percent = entries.length > 0 ? Math.round((correct / entries.length) * 100) : 0;

  return (
    <div class="round-summary">
      <h2>Runde beendet</h2>
      <p class="round-score">
        <strong>
          {correct} von {entries.length}
        </strong>{' '}
        richtig · {percent}&nbsp;%
      </p>

      {wrong.length === 0 ? (
        <p class="notice notice-good">Alles richtig. Zeit für einen engeren Filter?</p>
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
          Neue Runde
        </button>
        <button type="button" class="link-button" onClick={onBack}>
          Übung wechseln
        </button>
      </div>
    </div>
  );
}

export function isPerfect(result: TaskResult): boolean {
  return result.earned >= result.possible - 1e-9;
}
