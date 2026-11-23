/**
 * Antwortzustand der aktuellen Übungsaufgabe.
 *
 * Bewusst winzig: es lebt immer nur EINE Aufgabe, und die ist mit «Nächste»
 * weg. Antworten werden nirgends gespeichert.
 *
 * Der Speicher ist bewusst ein veränderliches Objekt mit Neuzeichen-Zähler und
 * nicht `useState`: `NotationInput` liest im selben Ereignis, in dem es
 * schreibt (`useNotationAnswer`), und würde bei einem noch nicht angewandten
 * Zustand die eigene Eingabe überschreiben.
 */

import { createContext, type ComponentChildren } from 'preact';
import { useCallback, useContext, useMemo, useState } from 'preact/hooks';

/** Antworten einer Aufgabe, nach Aufgaben-ID. */
export class AnswerStore {
  private answers: Record<string, unknown> = {};

  get<T>(taskId: string): T | undefined {
    return this.answers[taskId] as T | undefined;
  }

  set(taskId: string, value: unknown): void {
    this.answers[taskId] = value;
  }

  /** Für die Bewertung: der gesamte Stand. */
  get all(): Record<string, unknown> {
    return this.answers;
  }

  clear(): void {
    this.answers = {};
  }
}

export interface AnswerContextValue {
  answer<T>(taskId: string): T | undefined;
  setAnswer(taskId: string, value: unknown): void;
  setField(taskId: string, fieldId: string, value: string): void;
  /** Nach «Prüfen» ist die Aufgabe eingefroren. */
  readOnly: boolean;
}

const AnswerContext = createContext<AnswerContextValue | null>(null);

export function AnswerProvider({
  store,
  readOnly,
  onChange,
  children,
}: {
  store: AnswerStore;
  readOnly: boolean;
  /** Meldet jede Eingabe nach oben — die Übungsseite aktiviert damit «Prüfen». */
  onChange?: () => void;
  children: ComponentChildren;
}) {
  const [revision, bump] = useState(0);
  const rerender = useCallback(() => bump((n) => n + 1), []);

  // `revision` MUSS in den Abhängigkeiten stehen. Die Kinder kommen als
  // unveränderte `children`-Prop herein — Preact überspringt ihr Neuzeichnen,
  // wenn sich der Context-Wert nicht auch in seiner Identität ändert.
  const value = useMemo<AnswerContextValue>(
    () => ({
      readOnly,
      answer: <T,>(taskId: string) => store.get<T>(taskId),
      setAnswer(taskId, next) {
        if (readOnly) return;
        store.set(taskId, next);
        rerender();
        onChange?.();
      },
      setField(taskId, fieldId, next) {
        if (readOnly) return;
        const current = (store.get<Record<string, string>>(taskId) ?? {}) as Record<string, string>;
        store.set(taskId, { ...current, [fieldId]: next });
        rerender();
        onChange?.();
      },
    }),
    [store, readOnly, rerender, onChange, revision],
  );

  return <AnswerContext.Provider value={value}>{children}</AnswerContext.Provider>;
}

export function useExam(): AnswerContextValue {
  const context = useContext(AnswerContext);
  if (!context) throw new Error('useExam ausserhalb von AnswerProvider verwendet');
  return context;
}
