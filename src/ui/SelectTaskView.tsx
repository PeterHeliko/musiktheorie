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
  revealed = false,
}: {
  task: SelectTask;
  index?: number;
  /** Felder, die durch eine andere Antwort gegenstandslos geworden sind. */
  mutedFields?: string[];
  /** Geprüft: die Knöpfe zeigen richtig und falsch. */
  revealed?: boolean;
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
          revealed={revealed}
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

/**
 * Klassen eines Antwortknopfs. Vor dem Prüfen ist die Wahl blau — da ist noch
 * nichts entschieden. Danach zeigt der Knopf selbst, wie es war: die eigene
 * Wahl grün oder rot, und war sie falsch (oder fehlt sie), steht die richtige
 * Antwort grün umrandet daneben.
 */
function choiceClass(value: string, current: string, field: SelectField, reveal: boolean): string {
  const selected = current === value;
  if (!reveal) return selected ? 'choice is-selected' : 'choice';
  if (value === field.correct) return selected ? 'choice is-selected is-right' : 'choice is-solution';
  return selected ? 'choice is-selected is-wrong' : 'choice';
}

function Field({
  taskId,
  field,
  muted,
  revealed,
}: {
  taskId: string;
  field: SelectField;
  muted?: boolean;
  revealed?: boolean;
}) {
  const { answer, setField, readOnly } = useExam();
  const locked = readOnly || Boolean(muted);
  const current = answer<Record<string, string>>(taskId)?.[field.id] ?? '';
  const options = resolveOptions(field);
  const inputId = `${taskId}-${field.id}`;
  // Ein erlassenes Feld wurde nicht bewertet — es zeigt also auch kein Urteil.
  const reveal = Boolean(revealed) && !muted;

  if (field.buttons && field.buttonLayout === 'intervals') {
    return (
      <fieldset class={`field field-buttons ${muted ? 'is-muted' : ''}`} disabled={locked}>
        {field.label && <legend>{field.label}</legend>}
        <div
          class="button-grid interval-grid"
          role="radiogroup"
          aria-label={field.label ?? 'Antwort'}
          style={intervalAreas(options.map((option) => option.value))}
        >
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={current === option.value}
              class={choiceClass(option.value, current, field, reveal)}
              style={{ gridArea: INTERVAL_AREA[option.value] }}
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
              class={choiceClass(option.value, current, field, reveal)}
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

// ---------------------------------------------------------------------------
// Intervall-Raster
// ---------------------------------------------------------------------------

/** Rasterfeld je Intervall (CSS-Namen dürfen nicht mit einer Ziffer beginnen). */
const INTERVAL_AREA: Record<string, string> = {
  r1: 'r1',
  k2: 'k2',
  g2: 'g2',
  k3: 'k3',
  g3: 'g3',
  r4: 'r4',
  tritonus: 'tt',
  r5: 'r5',
  k6: 'k6',
  g6: 'g6',
  k7: 'k7',
  g7: 'g7',
  r8: 'r8',
};

/**
 * Hochkant: eine Zeile je Intervallgrösse — Sekunden, Terzen, Quarte/Tritonus/
 * Quinte, Sexten, Septimen, Prime/Oktave. Sechs Spalten, damit zwei und drei
 * Knöpfe je Zeile gleichmässig aufgehen.
 */
const PORTRAIT = [
  'k2 k2 k2 g2 g2 g2',
  'k3 k3 k3 g3 g3 g3',
  'r4 r4 tt tt r5 r5',
  'k6 k6 k6 g6 g6 g6',
  'k7 k7 k7 g7 g7 g7',
  'r1 r1 r1 r8 r8 r8',
];

/**
 * Quer: zwei Reihen wie eine Klaviatur. Unten die grossen und reinen
 * Intervalle (die «weissen Tasten»), oben die kleinen und der Tritonus jeweils
 * dazwischen — dort, wo sie der Halbtonzahl nach hingehören. Zwischen grosser
 * Terz und Quarte und zwischen grosser Septime und Oktave bleibt oben frei,
 * wie zwischen e und f, h und c.
 */
const LANDSCAPE = [
  '. k2 k2 k3 k3 . . tt tt k6 k6 k7 k7 . . .',
  'r1 r1 g2 g2 g3 g3 r4 r4 r5 r5 g6 g6 g7 g7 r8 r8',
];

/**
 * Rasterbelegung für die angebotenen Intervalle. Fehlende bleiben leer und an
 * ihrem Platz, damit jedes Intervall immer an derselben Stelle steht; ganz
 * leere Zeilen fallen weg. Hochkant und quer werden als CSS-Variablen
 * übergeben — welche gilt, entscheidet die Media Query in styles.css.
 */
function intervalAreas(values: string[]): Record<string, string> {
  const present = new Set(values.map((value) => INTERVAL_AREA[value]));
  const layout = (rows: string[]) =>
    rows
      .map((row) => row.split(' ').map((cell) => (present.has(cell) ? cell : '.')))
      .filter((cells) => cells.some((cell) => cell !== '.'))
      .map((cells) => `"${cells.join(' ')}"`)
      .join(' ');
  return { '--portrait': layout(PORTRAIT), '--landscape': layout(LANDSCAPE) };
}
