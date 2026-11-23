/* Herkunft: musiktheorie-scorm/src/exercises/SelectTaskView.tsx (Stand 2026-08-21), über das Projekt «training».
   Wird hier eigenständig weitergeführt; es gibt keinen Abgleich mit dem Original mehr. */
/**
 * Aufgaben mit Auswahlfeldern — der häufigste Typ.
 *
 * Deckt Intervallbestimmung, Dreiklangsbestimmung, Tonartenzuordnung,
 * Gehörbildung und die Stufenaufgaben ab: optional ein Notenbild, optional ein
 * Hörbeispiel, dazu ein bis vier Auswahlfelder.
 */

import { resolveOptions } from '../content/options';
import type { SelectField, SelectTask } from '../content/schema';
import { useExam } from '../state';
import { Score } from './Score';

export function SelectTaskView({
  task,
  index,
  mutedFields,
}: {
  task: SelectTask;
  index?: number;
  /** Felder, die durch eine andere Antwort gegenstandslos geworden sind. */
  mutedFields?: string[];
}) {
  const hasVisual = Boolean(task.score);
  const side = task.layout === 'side';

  const fields = (
    <div
      class={`field-row ${task.fields.length > 2 && !side ? 'field-row-wide' : ''} ${
        side ? 'field-grid' : ''
      }`}
      style={side && task.fieldColumns ? { '--field-columns': task.fieldColumns } : undefined}
    >
      {task.fields.map((field) => (
        <Field
          key={field.id}
          taskId={task.id}
          field={field}
          muted={mutedFields?.includes(field.id)}
        />
      ))}
    </div>
  );

  return (
    <li class="task">
      {index !== undefined && (
        <div class="task-number" aria-hidden="true">
          {index}
        </div>
      )}
      <div class="task-body">
        {task.prompt && (
          <p class="task-prompt" dangerouslySetInnerHTML={{ __html: task.prompt }} />
        )}

        {/* «side» stellt Notenbild und Antwortfelder nebeneinander — spart
            Höhe, die auf kleinen Bildschirmen knapper ist als Breite. */}
        <div class={side ? 'task-side' : ''}>
          {hasVisual && (
            <div class="task-visual">
              {task.score && <Score spec={task.score} />}
            </div>
          )}
          {fields}
        </div>
      </div>
    </li>
  );
}

function Field({ taskId, field, muted }: { taskId: string; field: SelectField; muted?: boolean }) {
  const { answer, setField, readOnly } = useExam();
  const locked = readOnly || Boolean(muted);
  const current = answer<Record<string, string>>(taskId)?.[field.id] ?? '';
  const options = resolveOptions(field);
  const inputId = `${taskId}-${field.id}`;

  if (field.buttons) {
    return (
      <fieldset class={`field field-buttons ${muted ? 'is-muted' : ''}`} disabled={locked}>
        {field.label && <legend>{field.label}</legend>}
        <div class="button-grid" role="radiogroup" aria-label={field.label ?? 'Antwort'}>
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={current === option.value}
              class={`choice ${current === option.value ? 'is-selected' : ''}`}
              onClick={() => setField(taskId, field.id, current === option.value ? '' : option.value)}
              disabled={locked}
            >
              {option.label}
            </button>
          ))}
        </div>
      </fieldset>
    );
  }

  return (
    <div class={`field ${muted ? 'is-muted' : ''}`}>
      {field.label && <label for={inputId}>{field.label}</label>}
      <select
        id={inputId}
        value={current}
        disabled={locked}
        onChange={(event) => setField(taskId, field.id, (event.target as HTMLSelectElement).value)}
      >
        <option value="">— bitte wählen —</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
