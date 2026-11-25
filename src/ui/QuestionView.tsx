/**
 * Eine Übungsaufgabe: Anweisung, Hörbeispiel, Aufgabe, Rückmeldung.
 *
 * Liefert die beiden unteren Teile der Übungsansicht:
 *  - die Aufgabe (scrollt, falls sie länger ist als der Bildschirm), und
 *  - die Leiste unten mit Rückmeldung und dem Hauptknopf (Prüfen / Weiter).
 *    Sie steht fest am unteren Rand, auf dem Telefon also immer in
 *    Daumenreichweite und immer an derselben Stelle.
 *
 * Gezeichnet wird die Aufgabe von `SelectTaskView`, `NotationInput`,
 * `SingTaskView` oder `KeyboardTaskView`. Sie bekommen nur eine `Task` und wissen nichts vom Rest der
 * Seite.
 */

import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useRef } from 'preact/hooks';
import { PracticeAudioPlayer } from '../audio/PracticeAudioPlayer';
import { player, samplesFor } from '../audio/player';
import { DEFAULT_TEMPO, type AudioEvent } from '../content/audio';
import { parsePitch } from '../music/theory';
import type { SelectTask, Task } from '../content/schema';
import { eventsFor, tempoOf } from '../generators/index';
import type { Question } from '../generators/types';
import { NotationInput } from '../music/notation-input/NotationInput';
import { answeredTones, scoreTask, type TaskResult } from '../scoring';
import { AnswerProvider, type AnswerStore } from '../state';
import { FeedbackDetails, Verdict, gradeOf, hasDetails } from './Feedback';
import { KeyboardTaskView } from './KeyboardTaskView';
import { keyboardFocused, shortcutAllowed } from './keyboard';
import { REFIT_EVENT, Score } from './Score';
import { SelectTaskView } from './SelectTaskView';
import { SingTaskView } from './SingTaskView';

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
   * Nach dem Prüfen erklingt einmal das gefragte Intervall oder der gefragte
   * Akkord, alle Töne zusammen (Entscheid 2026-11-24). Geladen wird gleich
   * mit der Aufgabe, damit er ohne Verzögerung kommt; mit der nächsten
   * Aufgabe verstummt er. War eine geschriebene oder gespielte Antwort
   * richtig, klingt sie selbst — in ihrer Oktave und Lage.
   */
  const afterSound = useMemo<AudioEvent[] | null>(
    () => (question.afterSound ? [{ pitches: question.afterSound.map(parsePitch), quarters: 3 }] : null),
    [question],
  );
  useEffect(() => {
    if (!afterSound) return;
    player.preload(samplesFor(afterSound));
    return () => player.stop();
  }, [afterSound]);
  useEffect(() => {
    if (!result || !afterSound) return;
    const own = gradeOf(result) === 'correct' ? answeredTones(question.task, store.get(question.task.id)) : null;
    const sound = own ? [{ pitches: own, quarters: afterSound[0].quarters }] : afterSound;
    player.play(sound, DEFAULT_TEMPO).catch((error) => console.warn('Wiedergabe fehlgeschlagen:', error));
  }, [result]);

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
  /**
   * Beim Singen ebenso: der erste gehaltene Ton ist die Antwort, die
   * Singansicht trägt ihn ein, sobald er feststeht.
   */
  const sung = question.task.kind === 'sing';
  const selfChecking = single !== null || sung;

  // Die Erklärung steht über der Aufgabe: ein- oder ausgeblendet ändert sie den
  // Platz, den ein Notenbild mit `fit` füllen darf.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    globalThis.dispatchEvent(new Event(REFIT_EVENT));
  }, [showExplanation]);

  const nextButton = useRef<HTMLButtonElement>(null);
  const details = useRef<HTMLDivElement>(null);
  const article = useRef<HTMLElement>(null);
  const showDetails = result !== null && hasDetails(result, question.task);

  // Nach dem Prüfen: «Weiter» bekommt den Fokus (Eingabetaste genügt), und
  // eine ausführliche Rückmeldung wird ins Bild geholt, falls sie unterhalb
  // des sichtbaren Bereichs liegt. Ohne ausführliche Rückmeldung sind die
  // Antwortknöpfe selbst die Rückmeldung — die letzte Reihe wird ins Bild
  // geholt, denn die Leiste unten wird mit dem Urteil höher und deckte sie
  // sonst zu (das Notenbild ist auf genau den Platz VOR dem Antworten bemessen).
  useEffect(() => {
    if (!result) return;
    nextButton.current?.focus({ preventScroll: true });
    const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const rows = article.current?.querySelectorAll('.field-buttons');
    const target = details.current ?? (rows && rows.length > 0 ? rows[rows.length - 1] : null);
    target?.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
  }, [result]);

  /**
   * Eingabe- oder Leertaste löst den Hauptknopf unten aus: «Prüfen», sobald
   * etwas eingetragen ist, danach «Weiter». Gibt es gerade nichts zu tun,
   * bleiben die Tasten beim Browser (die Leertaste scrollt dann wie gewohnt).
   */
  const primary = (): (() => void) | null => (result ? onNext : !selfChecking && canCheck ? check : null);
  const primaryRef = useRef(primary);
  primaryRef.current = primary;

  useEffect(() => {
    // Die Leertaste löst einen Knopf erst beim Loslassen aus. Wurde sie hier
    // schon verwendet, darf das Loslassen nicht auch noch den Knopf drücken,
    // der inzwischen den Fokus hat (nach dem Prüfen «Weiter»).
    let spaceUsed = false;
    const down = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      if (event.shiftKey || !shortcutAllowed(event) || keyboardFocused(event.target)) return;
      const action = primaryRef.current();
      if (!action) return;
      event.preventDefault();
      // Gedrückt halten soll nicht durch die Aufgaben rasen.
      if (event.repeat) return;
      if (event.key === ' ') spaceUsed = true;
      action();
    };
    const up = (event: KeyboardEvent) => {
      if (event.key !== ' ' || !spaceUsed) return;
      spaceUsed = false;
      event.preventDefault();
    };
    globalThis.addEventListener('keydown', down);
    globalThis.addEventListener('keyup', up);
    return () => {
      globalThis.removeEventListener('keydown', down);
      globalThis.removeEventListener('keyup', up);
    };
  }, []);

  const answered = () => {
    onAnswered();
    if (!selfChecking || result) return;
    if (sung) {
      check();
      return;
    }
    // Der Speicher ist zu diesem Zeitpunkt schon geschrieben. Leer heisst:
    // der Knopf wurde abgewählt — das ist keine Antwort.
    const given = store.get<Record<string, string>>(question.task.id)?.[single!.id];
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
            {/* Noteneingabe und Klaviatur stellen die Zeile selbst unter das
                verlangte Intervall. */}
            {question.context && question.task.kind !== 'notation' && question.task.kind !== 'keyboard' && (
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
              ) : question.task.kind === 'sing' ? (
                <SingTaskView task={question.task} />
              ) : question.task.kind === 'keyboard' ? (
                <KeyboardTaskView task={question.task} context={question.context} revealed={result !== null} />
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

      {/* Eine Zeile, vor und nach dem Prüfen gleich hoch (Entscheid
          2026-11-25): links «überspringen», nach dem Prüfen das Urteil;
          rechts der Hauptknopf, erst «Prüfen», dann «Weiter». Nach dem
          Prüfen ist die Leiste in der Farbe des Urteils getönt (styles.css). */}
      <footer class={`session-bar ${result ? `has-verdict is-${gradeOf(result)}` : ''}`}>
        <div class="session-column bar-content">
          {result ? (
            <Verdict result={result} task={question.task} />
          ) : (
            <button type="button" class="bar-skip" onClick={onNext}>
              überspringen
            </button>
          )}
          {result ? (
            <button
              type="button"
              class="bar-primary"
              onClick={onNext}
              ref={nextButton}
              aria-keyshortcuts="Enter Space"
            >
              {nextLabel}
            </button>
          ) : (
            !selfChecking && (
              <button
                type="button"
                class="bar-primary"
                onClick={check}
                disabled={!canCheck}
                aria-keyshortcuts="Enter Space"
              >
                Prüfen
              </button>
            )
          )}
        </div>
      </footer>
    </>
  );
}
