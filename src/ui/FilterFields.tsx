/**
 * Filterfelder — einmal geschrieben, für alle Übungen.
 *
 * Die Filter eines Generators sind Daten (`FilterSpec[]`), nicht Oberfläche.
 * Deshalb steht hier ein einziges Formular, das jede Übung bedienen kann, und
 * eine neue Übung bringt ihr Formular von selbst mit. Gezeigt wird es im
 * Einstellungsblatt der Übung (SettingsSheet).
 *
 * Eine Regel ist wichtiger als alle Gestaltung: eine Mehrfachauswahl darf nie
 * leer werden. Ein Generator ohne erlaubte Werte kann nichts würfeln, und der
 * Fehler wäre für Übende nicht zu deuten — deshalb lässt sich der letzte
 * Haken nicht entfernen.
 */

import type { FilterSpec, FilterValues } from '../generators/types';

export function FilterFields({
  filters,
  values,
  onChange,
}: {
  filters: FilterSpec[];
  values: FilterValues;
  onChange: (next: FilterValues) => void;
}) {
  const set = (key: string, value: FilterValues[string]) => onChange({ ...values, [key]: value });
  return (
    <>
      {filters.map((filter) => (
        <FilterField key={filter.key} filter={filter} values={values} set={set} />
      ))}
    </>
  );
}

function FilterField({
  filter,
  values,
  set,
}: {
  filter: FilterSpec;
  values: FilterValues;
  set: (key: string, value: FilterValues[string]) => void;
}) {
  // Gesperrte Felder bleiben sichtbar, statt zu verschwinden: ein Feld, das
  // beim Umstellen einer anderen Einstellung aus der Liste springt, ist
  // schwerer zu verstehen als eines, das ausgegraut dasteht und sagt, warum.
  const locked = filter.disabledBy?.(values) ?? null;
  const ignore = () => undefined;
  const setter = locked ? ignore : set;

  return (
    <div class={`filter-field ${locked ? 'is-locked' : ''}`}>
      <div class="filter-label">{filter.label}</div>
      <fieldset class="filter-control" disabled={Boolean(locked)}>
        {filter.kind === 'multi' && <MultiField filter={filter} values={values} set={setter} />}
        {filter.kind === 'single' && <SingleField filter={filter} values={values} set={setter} />}
        {filter.kind === 'toggle' && (
          <ToggleField filter={filter} values={values} set={setter} forceOff={Boolean(locked)} />
        )}
        {filter.kind === 'range' && <RangeField filter={filter} values={values} set={setter} />}
      </fieldset>
      {locked ? <p class="filter-locked">{locked}</p> : filter.hint && <p class="filter-hint">{filter.hint}</p>}
    </div>
  );
}

function MultiField({
  filter,
  values,
  set,
}: {
  filter: Extract<FilterSpec, { kind: 'multi' }>;
  values: FilterValues;
  set: (key: string, value: string[]) => void;
}) {
  const selected = (values[filter.key] as string[] | undefined) ?? [];
  const minimum = filter.min ?? 1;
  const allSelected = selected.length === filter.options.length;

  const toggle = (value: string) => {
    const next = selected.includes(value)
      ? selected.filter((entry) => entry !== value)
      : [...selected, value];
    // Der letzte Haken bleibt: ohne erlaubten Wert kann nichts gewürfelt werden.
    if (next.length < minimum) return;
    set(filter.key, next);
  };

  return (
    <>
      <div class="filter-options">
        {filter.options.map((option) => {
          const active = selected.includes(option.value);
          const locked = active && selected.length <= minimum;
          return (
            <button
              key={option.value}
              type="button"
              role="checkbox"
              aria-checked={active}
              class={`filter-chip ${active ? 'is-selected' : ''}`}
              disabled={locked}
              title={locked ? `Mindestens ${minimum} muss ausgewählt bleiben.` : undefined}
              onClick={() => toggle(option.value)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      <div class="filter-bulk">
        <button
          type="button"
          class="link-button"
          disabled={allSelected}
          onClick={() => set(filter.key, filter.options.map((o) => o.value))}
        >
          alle
        </button>
        <button
          type="button"
          class="link-button"
          disabled={selected.length <= minimum}
          onClick={() => set(filter.key, selected.slice(0, minimum))}
        >
          keine
        </button>
      </div>
    </>
  );
}

function SingleField({
  filter,
  values,
  set,
}: {
  filter: Extract<FilterSpec, { kind: 'single' }>;
  values: FilterValues;
  set: (key: string, value: string) => void;
}) {
  const current = values[filter.key] as string | undefined;
  return (
    <div class="filter-options" role="radiogroup" aria-label={filter.label}>
      {filter.options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={current === option.value}
          class={`filter-chip ${current === option.value ? 'is-selected' : ''}`}
          onClick={() => set(filter.key, option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function ToggleField({
  filter,
  values,
  set,
  forceOff,
}: {
  filter: Extract<FilterSpec, { kind: 'toggle' }>;
  values: FilterValues;
  set: (key: string, value: boolean) => void;
  /** Gesperrt: der Generator ignoriert den Wert, also darf «ein» nicht dastehen. */
  forceOff?: boolean;
}) {
  const current = Boolean(values[filter.key]) && !forceOff;
  return (
    <div class="filter-options">
      <button
        type="button"
        role="switch"
        aria-checked={current}
        class={`filter-chip ${current ? 'is-selected' : ''}`}
        onClick={() => set(filter.key, !current)}
      >
        {current ? 'ein' : 'aus'}
      </button>
    </div>
  );
}

function RangeField({
  filter,
  values,
  set,
}: {
  filter: Extract<FilterSpec, { kind: 'range' }>;
  values: FilterValues;
  set: (key: string, value: number) => void;
}) {
  const current = Number(values[filter.key] ?? filter.min);
  const inputId = `filter-${filter.key}`;
  return (
    <div class="filter-range">
      <input
        id={inputId}
        type="range"
        min={filter.min}
        max={filter.max}
        step={filter.step ?? 1}
        value={current}
        onInput={(event) => set(filter.key, Number((event.target as HTMLInputElement).value))}
      />
      <output for={inputId} class="filter-range-value">
        {current}
        {filter.unit ? ` ${filter.unit}` : ''}
      </output>
    </div>
  );
}
