/* Herkunft: musiktheorie-scorm/src/music/notation-input/toolbar.tsx (Stand 2026-08-21), über das Projekt «training».
   Wird hier eigenständig weitergeführt; es gibt keinen Abgleich mit dem Original mehr. */
/**
 * Werkzeugleiste der Noteneingabe.
 *
 * Die Zeichen kommen aus der Bravura-Notenschrift, die VexFlow ohnehin
 * einbettet und beim Laden als Schriftart «Bravura» anmeldet.
 *
 * Vorher standen hier Unicode-Zeichen wie ♩ und ♪ — die stammen aus zwei
 * verschiedenen Unicode-Blöcken und werden je nach System von ganz
 * unterschiedlichen Schriften gezeichnet: mal schmaler, mal kleiner, mal in
 * einem anderen Stil. Mit Bravura sind alle Zeichen aus derselben Feder wie
 * das Notenbild darunter.
 */

import { useEffect, useRef } from 'preact/hooks';
import { commandAllowed } from '../../ui/keyboard';
import { RedoIcon, TrashIcon, UndoIcon } from '../../ui/icons';
import type { Duration } from '../theory';

/**
 * SMuFL-Zeichen (Bravura). VexFlow exportiert seine Glyphs-Aufzählung nicht
 * über den Paketeinstieg, deshalb die Codepunkte direkt — es sind die
 * Standardwerte der SMuFL-Spezifikation.
 */
const GLYPH = {
  noteWhole: '\uE1D2',
  noteHalf: '\uE1D3',
  noteQuarter: '\uE1D5',
  note8th: '\uE1D7',
  note16th: '\uE1D9',
  restWhole: '\uE4E3',
  restHalf: '\uE4E4',
  restQuarter: '\uE4E5',
  rest8th: '\uE4E6',
  rest16th: '\uE4E7',
  augmentationDot: '\uE1E7',
  accidentalFlat: '\uE260',
  accidentalNatural: '\uE261',
  accidentalSharp: '\uE262',
} as const;

export interface DurationChoice {
  duration: Duration;
  dotted: boolean;
}

interface DurationButton {
  duration: Duration;
  dotted: boolean;
  /** Zeichen für die Notenwert-Ansicht. */
  note: string;
  /** Zeichen für die Pausen-Ansicht. */
  rest: string;
  label: string;
}

const DURATION_BUTTONS: DurationButton[] = [
  { duration: 'w', dotted: false, note: GLYPH.noteWhole, rest: GLYPH.restWhole, label: 'Ganze' },
  { duration: 'h', dotted: false, note: GLYPH.noteHalf, rest: GLYPH.restHalf, label: 'Halbe' },
  { duration: 'q', dotted: false, note: GLYPH.noteQuarter, rest: GLYPH.restQuarter, label: 'Viertel' },
  { duration: 'q', dotted: true, note: GLYPH.noteQuarter, rest: GLYPH.restQuarter, label: 'Viertel punktiert' },
  { duration: '8', dotted: false, note: GLYPH.note8th, rest: GLYPH.rest8th, label: 'Achtel' },
  { duration: '16', dotted: false, note: GLYPH.note16th, rest: GLYPH.rest16th, label: 'Sechzehntel' },
];

export function DurationPalette({
  value,
  onChange,
  disabled,
  allowed,
  label = 'Notenwert',
  restGlyphs = false,
  hideLabels = false,
}: {
  value: DurationChoice;
  onChange: (choice: DurationChoice) => void;
  disabled?: boolean;
  /** Auswahl einschränken; leer = alle. */
  allowed?: Duration[];
  label?: string;
  /** Pausenzeichen statt Notenzeichen darstellen. */
  restGlyphs?: boolean;
  /** Nur Zeichen zeigen — bei Pausen sind die Wörter Ballast. */
  hideLabels?: boolean;
}) {
  const buttons = allowed
    ? DURATION_BUTTONS.filter((b) => allowed.includes(b.duration))
    : DURATION_BUTTONS;

  return (
    <div class="palette">
      <span class="palette-label">{label}</span>
      <div class="palette-buttons">
        {buttons.map((button) => {
          const active = value.duration === button.duration && value.dotted === button.dotted;
          return (
            <button
              key={`${button.duration}${button.dotted ? '.' : ''}`}
              type="button"
              // Ohne Beschriftung auch keinen Tooltip: die Notenzeichen sind
              // eindeutig, ein aufpoppender Text stört beim Zielen. Das
              // aria-label bleibt, Screenreader lesen weiter mit.
              class={`tool ${active ? 'is-active' : ''} ${hideLabels ? 'tool-glyph' : ''}`}
              title={hideLabels ? undefined : button.label}
              aria-label={button.label}
              aria-pressed={active}
              disabled={disabled}
              onClick={() => onChange({ duration: button.duration, dotted: button.dotted })}
            >
              <span class={`tool-symbol tool-symbol-music ${restGlyphs ? 'is-rest' : ''}`} aria-hidden="true">
                {restGlyphs ? button.rest : button.note}
                {/* Der Punktierungspunkt ist in SMuFL ein eigenes Zeichen und
                    sitzt auf derselben Grundlinie — dadurch stimmt seine Höhe
                    von selbst. Nur den Abstand ziehen wir enger. */}
                {button.dotted && <span class="tool-dot">{GLYPH.augmentationDot}</span>}
              </span>
              {!hideLabels && <span class="tool-text">{button.label}</span>}
            </button>
          );
        })}
      </div>

    </div>
  );
}

/**
 * `alter: 0` bedeutet «kein Vorzeichen», nicht «Auflösungszeichen» — der
 * Renderer zeichnet dafür nichts. Deshalb trägt der mittlere Knopf einen
 * Strich und die Beschriftung «ohne»; ein ♮ hätte suggeriert, dass vor jeder
 * Note ein Auflösungszeichen steht.
 *
 * Die schlanke Fassung (`bare`, Intervall notieren) zeigt dagegen nur die drei
 * Zeichen ♭ ♮ ♯ in Bravura. Dort steht das Intervall ohne Tonartvorzeichen,
 * «ohne Vorzeichen» ist also gleichbedeutend mit dem Stammton — und als
 * Dreiergruppe liest sich ♭ ♮ ♯ auf einen Blick.
 */
const ACCIDENTALS: { alter: number; symbol: string; glyph: string; label: string; text: string }[] = [
  { alter: -1, symbol: '♭', glyph: GLYPH.accidentalFlat, label: 'b — Ton erniedrigen', text: 'b' },
  { alter: 0, symbol: '–', glyph: GLYPH.accidentalNatural, label: 'ohne Vorzeichen', text: 'ohne' },
  { alter: 1, symbol: '♯', glyph: GLYPH.accidentalSharp, label: 'Kreuz — Ton erhöhen', text: 'Kreuz' },
];

export function AccidentalPalette({
  value,
  onChange,
  disabled,
  label = 'Vorzeichen',
  bare = false,
  only,
}: {
  value: number;
  onChange: (alter: number) => void;
  disabled?: boolean;
  label?: string;
  /** Nur die Zeichen ♭ ♮ ♯, ohne Überschrift und Wörter. */
  bare?: boolean;
  /** Nur diese Versetzungen anbieten — ♯ und ♭ beim Vorzeichensetzen. */
  only?: number[];
}) {
  const choices = only ? ACCIDENTALS.filter((accidental) => only.includes(accidental.alter)) : ACCIDENTALS;
  return (
    <div class="palette">
      {!bare && <span class="palette-label">{label}</span>}
      <div class="palette-buttons" role={bare ? 'group' : undefined} aria-label={bare ? label : undefined}>
        {choices.map((accidental) => {
          const active = value === accidental.alter;
          return (
            <button
              key={accidental.alter}
              type="button"
              class={`tool ${active ? 'is-active' : ''} ${bare ? 'tool-glyph' : ''}`}
              title={bare ? undefined : accidental.label}
              aria-label={accidental.label}
              aria-pressed={active}
              disabled={disabled}
              onClick={() => onChange(accidental.alter)}
            >
              {bare ? (
                <span class={`tool-symbol tool-symbol-accidental is-alter${accidental.alter}`} aria-hidden="true">
                  {accidental.glyph}
                </span>
              ) : (
                <>
                  <span class="tool-symbol" aria-hidden="true">
                    {accidental.symbol}
                  </span>
                  <span class="tool-text">{accidental.text}</span>
                </>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ToolbarActions({ children }: { children: preact.ComponentChildren }) {
  return <div class="palette palette-actions">{children}</div>;
}

/**
 * Alles löschen, rückgängig, wiederholen — an der Stelle des früheren
 * «Zurücksetzen» (Entscheid 2026-11-24). Nur Zeichen (aus padago, siehe
 * ui/icons.tsx), so gross wie die Vorzeichenknöpfe daneben; Bildschirmleser
 * lesen die Beschriftung. Auch «Alles löschen» lässt sich rückgängig machen.
 *
 * Mit der Tastatur: Strg/⌘ + Z, mit Umschalt (oder Strg + Y) wiederholen.
 */
export function EditActions({
  onClear,
  canClear,
  onUndo,
  canUndo,
  onRedo,
  canRedo,
  disabled,
}: {
  onClear: () => void;
  canClear: boolean;
  onUndo: () => void;
  canUndo: boolean;
  onRedo: () => void;
  canRedo: boolean;
  disabled?: boolean;
}) {
  // Der Tastenhorcher bleibt derselbe und sieht über die Ref immer den
  // aktuellen Stand.
  const latest = useRef({ onUndo, canUndo, onRedo, canRedo, disabled });
  latest.current = { onUndo, canUndo, onRedo, canRedo, disabled };
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if ((key !== 'z' && key !== 'y') || !commandAllowed(event)) return;
      const state = latest.current;
      if (state.disabled) return;
      if (key === 'y' || event.shiftKey) {
        if (!state.canRedo) return;
        event.preventDefault();
        state.onRedo();
      } else {
        if (!state.canUndo) return;
        event.preventDefault();
        state.onUndo();
      }
    };
    globalThis.addEventListener('keydown', listener);
    return () => globalThis.removeEventListener('keydown', listener);
  }, []);

  return (
    <ToolbarActions>
      <button type="button" class="tool tool-glyph" aria-label="Alles löschen" onClick={onClear} disabled={disabled || !canClear}>
        <TrashIcon />
      </button>
      <button
        type="button"
        class="tool tool-glyph"
        aria-label="Rückgängig"
        aria-keyshortcuts="Control+Z Meta+Z"
        onClick={onUndo}
        disabled={disabled || !canUndo}
      >
        <UndoIcon />
      </button>
      <button
        type="button"
        class="tool tool-glyph"
        aria-label="Wiederholen"
        aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z Control+Y"
        onClick={onRedo}
        disabled={disabled || !canRedo}
      >
        <RedoIcon />
      </button>
    </ToolbarActions>
  );
}
