/**
 * Eine Übungsaufgabe: Anweisung, Hörbeispiel, Aufgabe, Rückmeldung.
 *
 * Liefert die beiden unteren Teile der Übungsansicht:
 *  - die Aufgabe (scrollt, falls sie länger ist als der Bildschirm), und
 *  - die Leiste unten mit Rückmeldung und dem Hauptknopf (Prüfen / Weiter).
 *    Sie steht fest am unteren Rand, auf dem Telefon also immer in
 *    Daumenreichweite und immer an derselben Stelle.
 *
 * Gezeichnet wird die Aufgabe von `SelectTaskView` und `NotationInput`. Beide
 * bekommen nur eine `Task` und wissen nichts vom Rest der Seite.
 */

import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useRef } from 'preact/hooks';
import { PracticeAudioPlayer } from '../audio/PracticeAudioPlayer';
import type { SelectTask, Task } from '../content/schema';
import { eventsFor, tempoOf } from '../generators/index';
import type { Question } from '../generators/types';
import { NotationInput } from '../music/notation-input/NotationInput';
import { scoreTask, type TaskResult } from '../scoring';
import { AnswerProvider, type AnswerStore } from '../state';
import { FeedbackDetails, Verdict, hasDetails } from './Feedback';
import { Score } from './Score';
import { SelectTaskView } from './SelectTaskView';

/**
 * Welche Felder hat die bisherige Antwort gegenstandslos gemacht?
 *
 * Ausschlaggebend ist, was der Übende gewählt hat — nicht, was richtig wäre.
 */
function waivedFields(question: Question, store: AnswerStore): string[] {
  const waiver = question.waiver;
  if (!waiver || question.task.kind !== 'select') return [];
  const given = store.get<Record<string, string>>(question.task.id)?.[waiver.field];
  return given && waiver.values.includes(given) ? waiver.waives : [];
}

/** Dieselbe Aufgabe ohne die erlassenen Felder — Grundlage der Bewertung. */
function withoutFields(task: Task, drop: string[]): Task {
  if (drop.length === 0 || task.kind !== 'select') return task;
  const kept = task.fields.filter((field) => !drop.includes(field.id));
  // Alle Felder erlassen hiesse: keine Frage mehr. Das kann nicht sein, also
  // bleibt die Aufgabe dann unverändert und die Bewertung fällt normal aus.
  if (kept.length === 0) return task;
  return { ...task, fields: kept } as SelectTask;
}

export function QuestionView({
  question,
  store,
  result,
  instruction,
  hint,
  onAnswered,
  onCheck,
  onNext,
  canCheck,
  nextLabel,
  notice,
  showExplanation,
}: {
  question: Question;
  store: AnswerStore;
  /** Gesetzt, sobald geprüft wurde — dann ist die Aufgabe eingefroren. */
  result: TaskResult | null;
  instruction: string;
  hint?: string;
  onAnswered: () => void;
  onCheck: (result: TaskResult) => void;
  onNext: () => void;
  canCheck: boolean;
  nextLabel: string;
  /** Hinweis über der Aufgabe, etwa zu einem veralteten Link. */
  notice?: ComponentChildren;
  /**
   * Anweisung und Hinweis zeigen? Sie gelten für alle Aufgaben der Übung und
   * erscheinen deshalb nur auf Wunsch (ⓘ).
   */
  showExplanation: boolean;
}) {
  // Die Klangereignisse hängen an der Aufgabe, nicht am Zustand — sonst
  // begänne die Wiedergabe bei jedem Tastendruck von vorn.
  const events = useMemo(() => eventsFor(question), [question]);
  const tempo = useMemo(() => tempoOf(question), [question]);

  /**
   * Felder, die durch die bisher gegebene Antwort gegenstandslos sind.
   * Wird bei jedem Rendern neu bestimmt, damit die Sperre sofort greift.
   */
  const muted = waivedFields(question, store);

  /**
   * Bewertet wird gegen die Aufgabe OHNE die erlassenen Felder: sie zählen
   * dann weder als Frage noch für die Punktzahl. Sie stattdessen automatisch
   * richtig zu geben, wäre unehrlich — beantwortet wurden sie nicht.
   */
  const check = () =>
    onCheck(scoreTask(withoutFields(question.task, muted), store.get(question.task.id)));

  /**
   * Eine Frage mit genau einem Knopfraster braucht kein «Prüfen»: der Klick
   * IST die Antwort, und ein zweiter Klick auf einen Knopf, der nichts Neues
   * sagt, hält beim Üben nur auf. Bei mehreren Feldern oder einer Noteneingabe
   * geht das nicht — dort ist erst fertig, wer alles ausgefüllt hat.
   */
  const single =
    question.task.kind === 'select' && question.task.fields.length === 1 && question.task.fields[0].buttons
      ? question.task.fields[0]
      : null;

  const nextButton = useRef<HTMLButtonElement>(null);
  const details = useRef<HTMLDivElement>(null);
  const article = useRef<HTMLElement>(null);
  const showDetails = result !== null && hasDetails(result, question.task);

  // Nach dem Prüfen: «Weiter» bekommt den Fokus (Eingabetaste genügt), und
  // eine ausführliche Rückmeldung wird ins Bild geholt, falls sie unterhalb
  // des sichtbaren Bereichs liegt. Ohne ausführliche Rückmeldung sind die
  // Antwortknöpfe selbst die Rückmeldung — sie werden ins Bild geholt, denn die
  // Leiste unten wird mit dem Urteil höher und deckte sonst die letzte Reihe
  // zu (das Notenbild ist auf genau den Platz VOR dem Antworten bemessen).
  useEffect(() => {
    if (!result) return;
    nextButton.current?.focus({ preventScroll: true });
    const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const target = details.current ?? (single ? article.current?.querySelector('.field-buttons') : null);
    target?.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
  }, [result]);

  const answered = () => {
    onAnswered();
    if (!single || result) return;
    // Der Speicher ist zu diesem Zeitpunkt schon geschrieben. Leer heisst:
    // der Knopf wurde abgewählt — das ist keine Antwort.
    const given = store.get<Record<string, string>>(question.task.id)?.[single.id];
    if (given) check();
  };

  return (
    <>
      <main class="session-body">
        <div class="session-column">
          {notice}
          <article class="question" ref={article}>
            {showExplanation && (
              <div class="explanation">
                <p class="instruction" dangerouslySetInnerHTML={{ __html: instruction }} />
                {hint && <p class="hint" dangerouslySetInnerHTML={{ __html: hint }} />}
              </div>
            )}
            {question.context && question.task.kind !== 'notation' && (
              <p class="task-context">{question.context}</p>
            )}

            {question.legend && (
              <div class="legend">
                {question.legend.map((entry) => (
                  <figure key={entry.label} class="legend-item">
                    <Score spec={entry.score} />
                    <figcaption>{entry.label}</figcaption>
                  </figure>
                ))}
              </div>
            )}

            {events && (
              <PracticeAudioPlayer
                events={events}
                tempo={tempo}
                maxPlays={question.maxPlays}
                allowSlow={question.allowSlow}
                autoplay
              />
            )}

            <AnswerProvider store={store} readOnly={result !== null} onChange={answered}>
              {question.task.kind === 'select' ? (
                <ol class="task-list">
                  <SelectTaskView task={question.task} mutedFields={muted} revealed={result !== null} />
                </ol>
              ) : question.task.kind === 'notation' ? (
                <div class="question-notation">
                  {/* Bei einer Noteneingabe steht im Prompt, WAS gesucht ist — das
                      verlangte Intervall, der Name der Tonart. Ohne diese Zeile ist
                      die Aufgabe nicht lösbar. */}
                  {question.task.prompt && (
                    <p class="task-prompt task-prompt-strong">{question.task.prompt}</p>
                  )}
                  {question.context && <p class="task-context">{question.context}</p>}
                  <NotationInput task={question.task} />
                </div>
              ) : null}
            </AnswerProvider>

            {muted.length > 0 && question.waiver && (
              <p class="waiver-note">
                <span class="waiver-icon" aria-hidden="true">
                  ⊘
                </span>
                {question.waiver.reason}
              </p>
            )}

            {showDetails && (
              <div ref={details}>
                <FeedbackDetails result={result!} task={question.task} />
              </div>
            )}
          </article>
        </div>
      </main>

      {/* Schmal: Rückmeldung mittig über dem Knopf. Breit: Rückmeldung links,
          Knöpfe rechts (Container-Query in styles.css). Der Hauptknopf steht
          zuletzt, also ganz rechts. */}
      <footer class="session-bar">
        <div class="session-column">
          <div class="bar-content">
            {result && <Verdict result={result} task={question.task} />}
            <div class="session-actions">
              {result ? (
                <button type="button" class="primary" onClick={onNext} ref={nextButton}>
                  {nextLabel}
                </button>
              ) : (
                <>
                  <button type="button" class="link-button" onClick={onNext}>
                    überspringen
                  </button>
                  {!single && (
                    <button type="button" class="primary" onClick={check} disabled={!canCheck}>
                      Prüfen
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}
