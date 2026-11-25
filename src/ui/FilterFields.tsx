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
  const set = (key: string, value: FilterValues[string]) =>
    onChange(withShown(filters, withPushed(filters, { ...values, [key]: value }, key)));
  return (
    <>
      {filters.map((filter) => (
        <FilterField key={filter.key} filter={filter} values={values} set={set} />
      ))}
    </>
  );
}

/**
 * Ein Schieberegler, der seinen Partner überholt hätte (tiefster Ton über dem
 * höchsten), schiebt ihn mit: beide stehen danach auf demselben Wert.
 */
function withPushed(filters: FilterSpec[], values: FilterValues, changed: string): FilterValues {
  const filter = filters.find((entry) => entry.key === changed);
  if (filter?.kind !== 'single' || !filter.slider) return values;
  const index = (key: string) => filter.options.findIndex((option) => option.value === values[key]);
  const own = index(changed);
  const { notAbove, notBelow } = filter.slider;
  if (notAbove && index(notAbove) >= 0 && own > index(notAbove)) return { ...values, [notAbove]: values[changed] };
  if (notBelow && index(notBelow) >= 0 && own < index(notBelow)) return { ...values, [notBelow]: values[changed] };
  return values;
}

/**
 * Zeigt ein Feld nach einer Änderung andere Optionen (`shownOptions`), wird
 * sein Wert zum Gegenstück aus der neuen Liste (`equivalent`) oder, ohne
 * eines, zu ihrer ersten Option.
 */
export function withShown(filters: FilterSpec[], values: FilterValues): FilterValues {
  let out = values;
  for (const filter of filters) {
    if (filter.kind !== 'single' || !filter.shownOptions) continue;
    const shown = filter.shownOptions(out);
    const current = out[filter.key];
    if (shown.length === 0 || shown.some((option) => option.value === current)) continue;
    const counterpart = typeof current === 'string' ? filter.equivalent?.[current] : undefined;
    const next = shown.find((option) => option.value === counterpart) ?? shown[0];
    out = { ...out, [filter.key]: next.value };
  }
  return out;
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

/**
 * Vorzeichen in Beschriftungen («♭ ♯», «𝄫 ♭ ♯ 𝄪») zeichnet Bravura, wie in
 * der Werkzeugleiste. Als Unicode kämen ♭ ♯ und 𝄫 𝄪 aus zwei verschiedenen
 * Blöcken und damit je nach System aus verschiedenen Schriften: ungleich
 * gross und auf ungleicher Höhe.
 */
const ACCIDENTAL_GLYPHS: Record<string, { glyph: string; spoken: string; flat?: boolean }> = {
  '𝄫': { glyph: '\uE264', spoken: 'Doppel-b', flat: true },
  '♭': { glyph: '\uE260', spoken: 'b', flat: true },
  '♯': { glyph: '\uE262', spoken: 'Kreuz' },
  '𝄪': { glyph: '\uE263', spoken: 'Doppelkreuz' },
};
const ACCIDENTAL_PATTERN = /(𝄫|♭|♯|𝄪)/u;

function OptionLabel({ label }: { label: string }) {
  const parts = label.split(ACCIDENTAL_PATTERN);
  if (parts.length === 1) return <>{label}</>;
  return (
    <>
      {parts.map((part, index) => {
        const accidental = ACCIDENTAL_GLYPHS[part];
        if (!accidental) return part;
        return (
          <span key={index} class={`chip-accidental ${accidental.flat ? 'is-flat' : ''}`} aria-hidden="true">
            {accidental.glyph}
          </span>
        );
      })}
    </>
  );
}

/** Vorlesbare Fassung, nur wo die Beschriftung Vorzeichen enthält. */
function spokenLabel(label: string): string | undefined {
  if (!ACCIDENTAL_PATTERN.test(label)) return undefined;
  return label.replace(new RegExp(ACCIDENTAL_PATTERN.source, 'gu'), (symbol) => ACCIDENTAL_GLYPHS[symbol].spoken);
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
              aria-label={spokenLabel(option.label)}
              onClick={() => toggle(option.value)}
            >
              <OptionLabel label={option.label} />
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
  if (filter.slider) {
    const inputId = `filter-${filter.key}`;
    const index = Math.max(
      0,
      filter.options.findIndex((option) => option.value === current),
    );
    const label = filter.options[index]?.label ?? '';
    return (
      <div class="filter-range">
        <input
          id={inputId}
          type="range"
          min={0}
          max={filter.options.length - 1}
          step={1}
          value={index}
          aria-label={filter.label}
          aria-valuetext={label}
          onInput={(event) => {
            const option = filter.options[Number((event.target as HTMLInputElement).value)];
            if (option) set(filter.key, option.value);
          }}
        />
        <output for={inputId} class="filter-range-value">
          {label}
        </output>
      </div>
    );
  }
  // Wo die Liste von anderen Einstellungen abhängt, zählt ein Wert aus der
  // anderen Liste als sein Gegenstück (ein Link mit «Terz» bei chromatisch).
  const shown = filter.shownOptions?.(values) ?? filter.options;
  const selected =
    current !== undefined && !shown.some((option) => option.value === current) ? filter.equivalent?.[current] : current;
  return (
    <div class="filter-options" role="radiogroup" aria-label={filter.label}>
      {shown.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={selected === option.value}
          class={`filter-chip ${selected === option.value ? 'is-selected' : ''}`}
          aria-label={spokenLabel(option.label)}
          onClick={() => set(filter.key, option.value)}
        >
          <OptionLabel label={option.label} />
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
