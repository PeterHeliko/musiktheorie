/**
 * Eine Übungsaufgabe: Anweisung, Hörbeispiel, Aufgabe, Rückmeldung.
 *
 * Gezeichnet wird von `SelectTaskView` und `NotationInput`. Beide bekommen nur
 * eine `Task` und wissen nichts vom Rest der Seite — der Rahmen drumherum
 * (Abspielknopf, Prüfen, Rückmeldung) gehört dieser Datei.
 */

import { useMemo } from 'preact/hooks';
import { PracticeAudioPlayer } from '../audio/PracticeAudioPlayer';
import type { SelectTask, Task } from '../content/schema';
import { eventsFor, tempoOf } from '../generators/index';
import type { Question } from '../generators/types';
import { NotationInput } from '../music/notation-input/NotationInput';
import { scoreTask, type TaskResult } from '../scoring';
import { AnswerProvider, type AnswerStore } from '../state';
import { Feedback } from './Feedback';
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

  const answered = () => {
    onAnswered();
    if (!single || result) return;
    // Der Speicher ist zu diesem Zeitpunkt schon geschrieben. Leer heisst:
    // der Knopf wurde abgewählt — das ist keine Antwort.
    const given = store.get<Record<string, string>>(question.task.id)?.[single.id];
    if (given) check();
  };

  return (
    <article class="question">
      <p class="instruction" dangerouslySetInnerHTML={{ __html: instruction }} />
      {hint && <p class="hint" dangerouslySetInnerHTML={{ __html: hint }} />}

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
        />
      )}

      <AnswerProvider store={store} readOnly={result !== null} onChange={answered}>
        {question.task.kind === 'select' ? (
          <ol class="task-list">
            <SelectTaskView task={question.task} mutedFields={muted} />
          </ol>
        ) : question.task.kind === 'notation' ? (
          <div class="question-notation">
            {/* Bei einer Noteneingabe steht im Prompt, WAS gesucht ist — das
                verlangte Intervall, der Name der Tonart. Ohne diese Zeile ist
                die Aufgabe nicht lösbar. */}
            {question.task.prompt && (
              <p class="task-prompt task-prompt-strong">{question.task.prompt}</p>
            )}
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

      {result && <Feedback result={result} task={question.task} />}

      <div class="question-actions">
        {result ? (
          <button type="button" class="primary" onClick={onNext} autofocus>
            {nextLabel}
          </button>
        ) : (
          <>
            {!single && (
              <button type="button" class="primary" onClick={check} disabled={!canCheck}>
                Prüfen
              </button>
            )}
            <button type="button" class="link-button" onClick={onNext}>
              überspringen
            </button>
          </>
        )}
      </div>
    </article>
  );
}
