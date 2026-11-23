/* Herkunft: musiktheorie-scorm/src/music/notation-input/NotationInput.tsx (Stand 2026-08-21), über das Projekt «training».
   Wird hier eigenständig weitergeführt; es gibt keinen Abgleich mit dem Original mehr. */
/**
 * Noteneingabe-Widget.
 *
 * Es gibt keine wartungsaktive, offline nutzbare Fertiglösung für grafische
 * Noteneingabe (flat.io und Noteflight brauchen Konto und Netzwerk), deshalb
 * Eigenbau auf VexFlow.
 *
 * Grundprinzip: das Widget verändert keine VexFlow-Objekte, sondern baut aus
 * «vorgegebenes Notenbild + Antwort + Vorschau» jedes Mal eine neue
 * Beschreibung und lässt neu zeichnen. Das ist bei Schnipseln dieser Grösse
 * schnell genug und spart die gesamte Fehlerklasse «Anzeige und Zustand laufen
 * auseinander».
 *
 * Sechs Modi, siehe NotationTask['mode'].
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Ref } from 'preact';
import type { MeasureSpec, NotationTask, NoteSpec, ScoreSpec } from '../../content/schema';
import { useExam } from '../../state';
import { Score } from '../../ui/Score';
import {
  diatonicForY,
  diatonicToStep,
  noteHeadCentre,
  toScoreCoordinates,
  type RenderedScore,
} from '../render';
import { parsePitch, toGermanPitch, STEPS } from '../theory';
import type {
  InputNote,
  KeysigAnswer,
  MarkAnswer,
  MelodyAnswer,
  NotationAnswer,
  PitchAnswer,
  SlotAnswer,
} from '../../scoring';
import { AccidentalPalette, DurationPalette, ToolbarActions, type DurationChoice } from './toolbar';

// ---------------------------------------------------------------------------
// Gemeinsames
// ---------------------------------------------------------------------------

/** Wie weit darf über das System hinaus gesetzt werden? In diatonischen Stufen. */
const LEDGER_STEPS = 6;

/** Klickabstand in Pixeln, ab dem eine bestehende Note als getroffen gilt. */
const HIT_TOLERANCE = 18;

interface ModeProps {
  task: NotationTask;
  answer: NotationAnswer;
  update: (next: unknown) => void;
  readOnly: boolean;
}

function useNotationAnswer(task: NotationTask) {
  const { answer, setAnswer, readOnly } = useExam();
  const current = answer<NotationAnswer>(task.id) ?? {};
  const update = useCallback(
    (next: unknown) => {
      const existing = (answer<NotationAnswer>(task.id) ?? {}) as NotationAnswer;
      setAnswer(task.id, { ...existing, n: next });
    },
    [answer, setAnswer, task.id],
  );
  return { current, update, readOnly };
}

/**
 * Hält die zuletzt gezeichnete Geometrie fest, ohne ein Neuzeichnen auszulösen.
 *
 * Zusätzlich wird der Container gemerkt. Grund: die Vorschau zeichnet das SVG
 * bei jeder Zeigerbewegung neu und ersetzt dabei das Element. Trifft ein Klick
 * ein, bevor Preact den Effekt erneut ausgeführt hat, zeigt `rendered.current`
 * noch auf das abgehängte SVG — dessen Rechteck ist null gross und die
 * Umrechnung liefert Unsinn. Für die Umrechnung wird deshalb immer das aktuell
 * eingehängte SVG benutzt; die Geometrie in Bildkoordinaten bleibt gleich.
 */
function useRenderedRef() {
  const rendered = useRef<RenderedScore | null>(null);
  const container = useRef<HTMLDivElement | null>(null);

  const onRendered = useCallback((result: RenderedScore, element: HTMLDivElement) => {
    rendered.current = result;
    container.current = element;
  }, []);

  /** Geometrie mit garantiert eingehängtem SVG. */
  const live = useCallback((): RenderedScore | null => {
    const result = rendered.current;
    if (!result) return null;
    if (result.svg.isConnected) return result;
    const current = container.current?.querySelector('svg');
    return current ? { ...result, svg: current as SVGSVGElement } : null;
  }, []);

  return { rendered, onRendered, live };
}

/**
 * Misst die verfügbare Breite. Ohne das bliebe rechts neben dem Notenbild
 * ungenutzter Platz stehen, und auf schmalen Geräten würde es zu breit.
 */
function useMeasuredWidth(fallback: number): [Ref<HTMLDivElement>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(fallback);

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      const measured = Math.round(element.clientWidth);
      // Kleine Schwankungen ignorieren, sonst zeichnet VexFlow dauernd neu.
      if (measured > 0) setWidth((previous) => (Math.abs(previous - measured) < 3 ? previous : measured));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, width];
}

/** Wo im Notenbild liegt dieser Zeigerpunkt? */
interface Location {
  measure: number;
  diatonic: number;
  x: number;
}

function locate(rendered: RenderedScore | null, event: MouseEvent): Location | null {
  if (!rendered) return null;
  const point = toScoreCoordinates(rendered.svg, event);
  if (!point) return null;
  const { x, y } = point;

  let measure = 0;
  for (let i = 0; i < rendered.staves.length; i++) {
    if (x >= rendered.staves[i].stave.getNoteStartX() - 10) measure = i;
  }

  const geometry = rendered.staves[measure];
  if (!geometry) return null;

  // Auf einen sinnvollen Bereich rund um das System begrenzen: so weit, wie
  // Hilfslinien noch lesbar sind, aber nicht beliebig weit nach oben/unten.
  const highest = diatonicForY(geometry, geometry.stave.getYForLine(0)) + LEDGER_STEPS;
  const lowest = diatonicForY(geometry, geometry.stave.getYForLine(4)) - LEDGER_STEPS;
  const diatonic = Math.min(highest, Math.max(lowest, diatonicForY(geometry, y)));

  return { measure, diatonic, x };
}

/** Merkt sich die Zeigerposition, aber nur wenn sie auf ein neues Feld zeigt. */
function useHover(live: () => RenderedScore | null, enabled: boolean) {
  const [hover, setHover] = useState<Location | null>(null);

  const onMove = useCallback(
    (event: MouseEvent) => {
      if (!enabled) return;
      const next = locate(live(), event);
      setHover((previous) =>
        previous && next && previous.measure === next.measure && previous.diatonic === next.diatonic
          ? previous
          : next,
      );
    },
    [enabled, live],
  );

  const onLeave = useCallback(() => setHover(null), []);
  return { hover, onMove, onLeave, clearHover: onLeave };
}

function noteFrom(diatonic: number, alter: number, choice: DurationChoice, rest = false): InputNote {
  const { step, octave } = diatonicToStep(diatonic);
  return {
    s: step,
    o: octave,
    a: alter,
    d: choice.duration,
    ...(choice.dotted ? { dot: true } : {}),
    ...(rest ? { r: true } : {}),
  };
}

function toNoteSpec(note: InputNote): NoteSpec {
  return {
    keys: note.r ? undefined : [noteKey(note)],
    duration: note.d,
    dotted: note.dot,
    rest: note.r,
  };
}

/** Baut eine Tonangabe, die parsePitch wieder einlesen kann. */
function accidentalSuffix(alter: number): string {
  if (alter === 1) return '#';
  if (alter === 2) return '##';
  if (alter === -1) return 'b';
  if (alter === -2) return 'bb';
  return '';
}

function noteKey(note: InputNote): string {
  // Sonderfall B (erniedrigtes H): «b4» liest parsePitch als deutsches H und
  // «bb4» als Doppel-b — beides falsch. Geschrieben wird deshalb «hes», wie im
  // deutschen Konvention. Ohne diesen Zweig zeichnet das Widget jedes
  // gesetzte B als Heses, also mit Doppel-b.
  if (note.s === 'b' && note.a === -1) return `hes${note.o}`;
  return `${note.s}${accidentalSuffix(note.a)}${note.o}`;
}

function shiftPitch(note: InputNote, steps: number): InputNote {
  const { step, octave } = diatonicToStep(note.o * 7 + STEPS.indexOf(note.s) + steps);
  return { ...note, s: step, o: octave };
}

// ---------------------------------------------------------------------------
// Einstieg
// ---------------------------------------------------------------------------

export function NotationInput({ task }: { task: NotationTask }) {
  const { current, update, readOnly } = useNotationAnswer(task);
  const props: ModeProps = { task, answer: current, update, readOnly };

  return (
    <div class="notation-input">
      {task.mode === 'pitch' && <PitchInput {...props} />}
      {task.mode === 'melody' && <MelodyInput {...props} />}
      {(task.mode === 'rhythm' || task.mode === 'rest') && <SlotInput {...props} />}
      {task.mode === 'keysig' && <KeySignatureInput {...props} />}
      {task.mode === 'mark' && <MarkInput {...props} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modus «pitch» — einzelne Töne oder Akkordtöne setzen
// ---------------------------------------------------------------------------

function PitchInput({ task, answer, update, readOnly }: ModeProps) {
  const solution = task.solution;
  const placed = (answer.n as PitchAnswer | undefined) ?? {};
  const [alter, setAlter] = useState(0);
  const { rendered, onRendered, live } = useRenderedRef();
  const { hover, onMove, onLeave } = useHover(live, !readOnly);

  if (solution.type !== 'pitch') return null;
  const slots = solution.slots;
  const isChord = slots.some((s) => s.chord);

  /** Welcher Eingabeplatz liegt diesem x-Wert am nächsten? */
  const slotNear = (x: number) =>
    slots.reduce((best, slot) => {
      const drawn = rendered.current?.notes[0]?.[slot.slot];
      const bestDrawn = rendered.current?.notes[0]?.[best.slot];
      if (!drawn) return best;
      const distance = Math.abs(noteHeadCentre(drawn) - x);
      const bestDistance = bestDrawn ? Math.abs(noteHeadCentre(bestDrawn) - x) : Infinity;
      return distance < bestDistance ? slot : best;
    }, slots[0]);

  const spec = useMemo<ScoreSpec>(() => {
    const measure = task.score.measures[0];
    const target = hover ? slotNear(hover.x) : null;

    const notes: NoteSpec[] = measure.notes.map((note, index) => {
      const slot = slots.find((s) => s.slot === index);
      const own = placed[String(index)] ?? [];
      if (!slot) return note;

      const previewKey =
        hover && target?.slot === index
          ? noteKey(noteFrom(hover.diatonic, alter, { duration: 'w', dotted: false }))
          : null;

      if (slot.chord) {
        const keys = [...(note.keys ?? []), ...own.map(noteKey)];
        return { ...note, keys, previewKeys: previewKey ? [previewKey] : undefined };
      }
      if (own.length === 0) {
        // Die Leerstelle ist eine GhostNote und kann keine Köpfe tragen.
        // Sobald etwas vorzuschauen ist, wird sie durch eine echte, blau
        // gezeichnete Note ersetzt — sonst käme die Vorschau erst zum
        // Vorschein, wenn schon ein Ton gesetzt ist.
        return previewKey
          ? { keys: [previewKey], duration: note.duration, preview: true }
          : note;
      }
      return {
        keys: [noteKey(own[0])],
        duration: note.duration,
        previewKeys: previewKey ? [previewKey] : undefined,
      };
    });

    return { ...task.score, measures: [{ ...measure, notes }] };
  }, [task.score, JSON.stringify(placed), JSON.stringify(slots), hover?.diatonic, hover?.x, alter]);

  function handleClick(event: PointerEvent) {
    // pointerdown statt click: die Vorschau zeichnet das SVG neu, sobald sich
    // der Zeiger bewegt. Läge dazwischen ein mousedown, verlöre der Browser
    // das Ziel und das click-Ereignis bliebe aus.
    if (event.button !== 0) return;
    if (readOnly) return;
    const hit = locate(live(), event);
    if (!hit) return;

    const target = slotNear(hit.x);
    const key = String(target.slot);
    const own = placed[key] ?? [];
    const incoming = noteFrom(hit.diatonic, alter, { duration: 'w', dotted: false });

    if (target.chord) {
      // Gleiche Position noch einmal angeklickt = wieder entfernen.
      const existing = own.findIndex((n) => n.s === incoming.s && n.o === incoming.o);
      const next =
        existing >= 0 && own[existing].a === incoming.a
          ? own.filter((_, i) => i !== existing)
          : existing >= 0
            ? own.map((n, i) => (i === existing ? incoming : n))
            : [...own, incoming];
      update({ ...placed, [key]: next });
    } else {
      update({ ...placed, [key]: [incoming] });
    }
  }

  const summary = slots
    .flatMap((slot) => (placed[String(slot.slot)] ?? []).map((n) => toGermanPitch(parsePitch(noteKey(n)))));

  return (
    <>
      <div class="toolbar">
        <AccidentalPalette
          value={alter}
          onChange={setAlter}
          disabled={readOnly}
          label="Vorzeichen für den nächsten Ton"
        />
        <ToolbarActions>
          <button type="button" class="tool tool-wide" onClick={() => update({})} disabled={readOnly}>
            Zurücksetzen
          </button>
        </ToolbarActions>
      </div>

      <div class="score-click-area" onPointerDown={handleClick} onMouseMove={onMove} onMouseLeave={onLeave}>
        <Score spec={spec} onRendered={onRendered} />
      </div>

      <p class="input-summary">
        {summary.length > 0 ? (
          <>
            Gesetzt: <b>{summary.join(', ')}</b>
          </>
        ) : isChord ? (
          'Klicke zwei Töne über den vorgegebenen Grundton.'
        ) : (
          'Klicke auf die gewünschte Tonhöhe.'
        )}
      </p>
    </>
  );
}

// ---------------------------------------------------------------------------
// Modus «melody» — Diktat
// ---------------------------------------------------------------------------

type EditMode = 'eingabe' | 'bearbeiten';

interface Selection {
  measure: number;
  index: number;
}

function MelodyInput({ task, answer, update, readOnly }: ModeProps) {
  const solution = task.solution;
  const [choice, setChoice] = useState<DurationChoice>({ duration: 'q', dotted: false });
  const [alter, setAlter] = useState(0);
  const [editMode, setEditMode] = useState<EditMode>('eingabe');
  const [selection, setSelection] = useState<Selection[]>([]);
  const { rendered, onRendered, live } = useRenderedRef();
  const { hover, onMove, onLeave, clearHover } = useHover(live, !readOnly && editMode === 'eingabe');
  const [wrapper, width] = useMeasuredWidth(720);

  if (solution.type !== 'melody') return null;

  const measureCount = task.score.measures.length;

  // Der vorgegebene Startton steht fest und darf nicht verändert werden.
  const givenNote = task.score.measures[0].notes[0];
  const given: InputNote | null = givenNote?.keys?.length
    ? (() => {
        const pitch = parsePitch(givenNote.keys[0]);
        return { s: pitch.step, o: pitch.octave, a: pitch.alter, d: givenNote.duration };
      })()
    : null;

  const stored = (answer.n as MelodyAnswer | undefined) ?? [];
  const measures: InputNote[][] = Array.from({ length: measureCount }, (_, i) => stored[i] ?? []);
  if (given && measures[0].length === 0) measures[0] = [given];

  const isLocked = (measure: number, index: number) => Boolean(given) && measure === 0 && index === 0;
  const isSelected = (measure: number, index: number) =>
    selection.some((s) => s.measure === measure && s.index === index);

  const spec = useMemo<ScoreSpec>(() => {
    const built: MeasureSpec[] = measures.map((notes, measureIndex) => {
      const specs: NoteSpec[] = notes.map((note, index) => ({
        ...toNoteSpec(note),
        // Blau markiert ausschliesslich die Auswahl. Der vorgegebene
        // Startton bleibt schwarz wie jede andere Note; dass er fest ist,
        // regelt isLocked() und nicht die Farbe.
        highlight: isSelected(measureIndex, index),
      }));

      // Vorschau als zusätzliche Note am Ende des betroffenen Takts.
      if (hover && hover.measure === measureIndex) {
        specs.push({
          ...toNoteSpec(noteFrom(hover.diatonic, alter, choice)),
          preview: true,
        });
      }
      return { notes: specs };
    });
    return { ...task.score, width, measures: built };
  }, [
    JSON.stringify(measures),
    JSON.stringify(selection),
    hover?.measure,
    hover?.diatonic,
    JSON.stringify(choice),
    alter,
    width,
    task.score,
  ]);

  function handleClick(event: PointerEvent) {
    // pointerdown statt click: die Vorschau zeichnet das SVG neu, sobald sich
    // der Zeiger bewegt. Läge dazwischen ein mousedown, verlöre der Browser
    // das Ziel und das click-Ereignis bliebe aus.
    if (event.button !== 0) return;
    if (readOnly) return;
    const hit = locate(live(), event);
    if (!hit) return;

    const drawn = rendered.current?.notes[hit.measure] ?? [];
    let nearest = -1;
    let nearestDistance = Infinity;
    drawn.forEach((noteObject, index) => {
      // Die Vorschau-Note hängt hinten dran und zählt nicht als Treffer.
      if (index >= (measures[hit.measure]?.length ?? 0)) return;
      const distance = Math.abs(noteHeadCentre(noteObject) - hit.x);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = index;
      }
    });

    if (editMode === 'bearbeiten') {
      if (nearest < 0 || nearestDistance > HIT_TOLERANCE) return;
      if (isLocked(hit.measure, nearest)) return;
      const entry = { measure: hit.measure, index: nearest };
      setSelection((previous) =>
        previous.some((s) => s.measure === entry.measure && s.index === entry.index)
          ? previous.filter((s) => !(s.measure === entry.measure && s.index === entry.index))
          : [...previous, entry],
      );
      return;
    }

    // Eingabemodus: immer anfügen, nie ersetzen.
    const next = measures.map((m) => [...m]);
    next[hit.measure] = [...next[hit.measure], noteFrom(hit.diatonic, alter, choice)];
    update(next);
  }

  function modifySelection(change: (note: InputNote) => InputNote) {
    if (readOnly || selection.length === 0) return;
    const next = measures.map((m) => [...m]);
    for (const entry of selection) {
      if (isLocked(entry.measure, entry.index)) continue;
      const note = next[entry.measure]?.[entry.index];
      if (note) next[entry.measure][entry.index] = change(note);
    }
    update(next);
  }

  function deleteSelection() {
    if (readOnly || selection.length === 0) return;
    const next = measures.map((m, measureIndex) =>
      m.filter(
        (_, index) => isLocked(measureIndex, index) || !isSelected(measureIndex, index),
      ),
    );
    update(next);
    setSelection([]);
  }

  function removeLast() {
    if (readOnly) return;
    const next = measures.map((m) => [...m]);
    for (let i = next.length - 1; i >= 0; i--) {
      const lastIndex = next[i].length - 1;
      if (lastIndex < 0 || isLocked(i, lastIndex)) continue;
      next[i] = next[i].slice(0, -1);
      update(next);
      return;
    }
  }

  function resetAll() {
    if (readOnly) return;
    update(measures.map((_, i) => (i === 0 && given ? [given] : [])));
    setSelection([]);
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (readOnly || editMode !== 'bearbeiten' || selection.length === 0) return;
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      modifySelection((note) => shiftPitch(note, event.key === 'ArrowUp' ? 1 : -1));
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      deleteSelection();
    }
  }

  function switchMode(next: EditMode) {
    setEditMode(next);
    setSelection([]);
    clearHover();
  }

  return (
    <>
      <div class="mode-switch" role="radiogroup" aria-label="Werkzeug">
        <button
          type="button"
          role="radio"
          aria-checked={editMode === 'eingabe'}
          class={`mode-tab ${editMode === 'eingabe' ? 'is-active' : ''}`}
          onClick={() => switchMode('eingabe')}
          disabled={readOnly}
        >
          Noten eingeben
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={editMode === 'bearbeiten'}
          class={`mode-tab ${editMode === 'bearbeiten' ? 'is-active' : ''}`}
          onClick={() => switchMode('bearbeiten')}
          disabled={readOnly}
        >
          Bearbeiten
        </button>
      </div>

      <div class="toolbar">
        {editMode === 'eingabe' ? (
          <>
            <DurationPalette
              value={choice}
              onChange={setChoice}
              disabled={readOnly}
              hideLabels
            />
            <AccidentalPalette value={alter} onChange={setAlter} disabled={readOnly} />
            <ToolbarActions>
              <button type="button" class="tool tool-wide" onClick={removeLast} disabled={readOnly}>
                Letzte Note löschen
              </button>
              <button type="button" class="tool tool-wide" onClick={resetAll} disabled={readOnly}>
                Alles zurücksetzen
              </button>
            </ToolbarActions>
          </>
        ) : (
          <>
            <div class="palette">
              <span class="palette-label">Ausgewählte Noten verschieben</span>
              <div class="palette-buttons">
                <button
                  type="button"
                  class="tool"
                  onClick={() => modifySelection((n) => shiftPitch(n, 1))}
                  disabled={readOnly || selection.length === 0}
                  title="Eine Stufe höher"
                >
                  <span class="tool-symbol" aria-hidden="true">↑</span>
                  <span class="tool-text">höher</span>
                </button>
                <button
                  type="button"
                  class="tool"
                  onClick={() => modifySelection((n) => shiftPitch(n, -1))}
                  disabled={readOnly || selection.length === 0}
                  title="Eine Stufe tiefer"
                >
                  <span class="tool-symbol" aria-hidden="true">↓</span>
                  <span class="tool-text">tiefer</span>
                </button>
              </div>
            </div>
            <ToolbarActions>
              <button
                type="button"
                class="tool tool-wide"
                onClick={deleteSelection}
                disabled={readOnly || selection.length === 0}
              >
                {selection.length > 1 ? `${selection.length} Noten löschen` : 'Note löschen'}
              </button>
              <button type="button" class="tool tool-wide" onClick={resetAll} disabled={readOnly}>
                Alles zurücksetzen
              </button>
            </ToolbarActions>
          </>
        )}
      </div>

      <div
        ref={wrapper}
        class={`score-click-area ${editMode === 'bearbeiten' ? 'is-editing' : ''}`}
        tabIndex={0}
        onPointerDown={handleClick}
        onMouseMove={onMove}
        onMouseLeave={onLeave}
        onKeyDown={handleKeyDown}
        role="application"
        aria-label="Noteneingabe für das Diktat"
      >
        <Score spec={spec} onRendered={onRendered} />
      </div>

      <p class="input-hint">
        {editMode === 'eingabe'
          ? 'Notenwert wählen, dann auf die gewünschte Tonhöhe klicken.'
          : 'Noten anklicken, um sie auszuwählen. Ausgewählte Noten lassen sich verschieben oder löschen.'}
      </p>
    </>
  );
}

// ---------------------------------------------------------------------------
// Modi «rhythm» und «rest» — fehlenden Wert je Takt ergänzen
// ---------------------------------------------------------------------------

function SlotInput({ task, answer, update, readOnly }: ModeProps) {
  const solution = task.solution;
  const placed = (answer.n as SlotAnswer | undefined) ?? {};
  const [choice, setChoice] = useState<DurationChoice>({ duration: 'q', dotted: false });
  const { onRendered, live } = useRenderedRef();
  const { hover, onMove, onLeave } = useHover(live, !readOnly);
  const [wrapper, width] = useMeasuredWidth(760);

  if (solution.type !== 'slot') return null;
  const asRest = task.mode === 'rest';

  const spec = useMemo<ScoreSpec>(() => {
    const measures: MeasureSpec[] = task.score.measures.map((measure, measureIndex) => ({
      ...measure,
      notes: measure.notes.map((note) => {
        if (note.annotation !== 'x') return note;
        const chosen = placed[String(measureIndex)];
        const preview = hover?.measure === measureIndex && !chosen;

        // Ohne Antwort bleibt die Leerstelle leer — eine Platzhalter-Pause
        // würde den gesuchten Notenwert verraten.
        if (!chosen) {
          return preview
            ? {
                keys: asRest ? undefined : ['h4'],
                duration: choice.duration,
                dotted: choice.dotted,
                rest: asRest,
                annotation: 'x',
                preview: true,
              }
            : note;
        }
        return {
          keys: asRest ? undefined : ['h4'],
          duration: chosen.d,
          dotted: chosen.dot,
          rest: asRest,
          annotation: 'x',
        };
      }),
    }));
    return { ...task.score, width, measures };
  }, [task.score, JSON.stringify(placed), asRest, hover?.measure, JSON.stringify(choice), width]);

  function handleClick(event: PointerEvent) {
    // pointerdown statt click: die Vorschau zeichnet das SVG neu, sobald sich
    // der Zeiger bewegt. Läge dazwischen ein mousedown, verlöre der Browser
    // das Ziel und das click-Ereignis bliebe aus.
    if (event.button !== 0) return;
    if (readOnly) return;
    const hit = locate(live(), event);
    if (!hit) return;
    update({
      ...placed,
      [String(hit.measure)]: { d: choice.duration, ...(choice.dotted ? { dot: true } : {}) },
    });
  }

  const filled = Object.keys(placed).length;

  return (
    <>
      <div class="toolbar">
        <DurationPalette
          value={choice}
          onChange={setChoice}
          disabled={readOnly}
          label={asRest ? 'Pausenwert' : 'Notenwert'}
          restGlyphs={asRest}
          hideLabels={asRest}
        />
        <ToolbarActions>
          <button type="button" class="tool tool-wide" onClick={() => update({})} disabled={readOnly || filled === 0}>
            Alles zurücksetzen
          </button>
        </ToolbarActions>
      </div>

      <div
        ref={wrapper}
        class="score-click-area"
        onPointerDown={handleClick}
        onMouseMove={onMove}
        onMouseLeave={onLeave}
      >
        <Score spec={spec} onRendered={onRendered} />
      </div>

      <p class="input-hint">
        {asRest ? 'Pausenwert' : 'Notenwert'} wählen, dann beim <b>x</b> einfügen. Ein weiterer
        Klick überschreibt den Eintrag.
      </p>
    </>
  );
}

// ---------------------------------------------------------------------------
// Modus «keysig» — Vorzeichen setzen
// ---------------------------------------------------------------------------

function KeySignatureInput({ task, answer, update, readOnly }: ModeProps) {
  const solution = task.solution;
  const value = (answer.n as KeysigAnswer | undefined) ?? { sign: 1, placed: [] };
  const { onRendered, live } = useRenderedRef();
  const { hover, onMove, onLeave } = useHover(live, !readOnly);

  if (solution.type !== 'keysig') return null;

  const spec = useMemo<ScoreSpec>(() => {
    const glyph = value.sign > 0 ? ('sharp' as const) : ('flat' as const);
    const notes: NoteSpec[] = value.placed.map((entry) => ({
      keys: [`${entry.s}${entry.o}`],
      duration: 'w',
      glyph,
    }));
    if (hover) {
      const { step, octave } = diatonicToStep(hover.diatonic);
      notes.push({ keys: [`${step}${octave}`], duration: 'w', glyph, preview: true });
    }
    return { ...task.score, measures: [{ notes }] };
  }, [task.score, JSON.stringify(value), hover?.diatonic]);

  function handleClick(event: PointerEvent) {
    // pointerdown statt click: die Vorschau zeichnet das SVG neu, sobald sich
    // der Zeiger bewegt. Läge dazwischen ein mousedown, verlöre der Browser
    // das Ziel und das click-Ereignis bliebe aus.
    if (event.button !== 0) return;
    if (readOnly) return;
    const hit = locate(live(), event);
    if (!hit) return;
    const { step, octave } = diatonicToStep(hit.diatonic);
    update({ sign: value.sign, placed: [...value.placed, { s: step, o: octave }] });
  }

  function setSign(sign: 1 | -1) {
    if (readOnly) return;
    // Vorzeichenart wechseln heisst neu anfangen — ein gemischter Satz wäre falsch.
    update({ sign, placed: [] });
  }

  return (
    <>
      <div class="toolbar">
        <div class="palette">
          <span class="palette-label">Vorzeichenart</span>
          <div class="palette-buttons">
            <button
              type="button"
              class={`tool ${value.sign === 1 ? 'is-active' : ''}`}
              aria-pressed={value.sign === 1}
              onClick={() => setSign(1)}
              disabled={readOnly}
              title="Kreuze"
            >
              <span class="tool-symbol" aria-hidden="true">♯</span>
              <span class="tool-text">Kreuz</span>
            </button>
            <button
              type="button"
              class={`tool ${value.sign === -1 ? 'is-active' : ''}`}
              aria-pressed={value.sign === -1}
              onClick={() => setSign(-1)}
              disabled={readOnly}
              title="b"
            >
              <span class="tool-symbol" aria-hidden="true">♭</span>
              <span class="tool-text">b</span>
            </button>
          </div>
        </div>
        <ToolbarActions>
          <button
            type="button"
            class="tool tool-wide"
            onClick={() => update({ sign: value.sign, placed: value.placed.slice(0, -1) })}
            disabled={readOnly || value.placed.length === 0}
          >
            Letztes löschen
          </button>
          <button
            type="button"
            class="tool tool-wide"
            onClick={() => update({ sign: value.sign, placed: [] })}
            disabled={readOnly || value.placed.length === 0}
          >
            Alle löschen
          </button>
        </ToolbarActions>
      </div>

      <div class="score-click-area" onPointerDown={handleClick} onMouseMove={onMove} onMouseLeave={onLeave}>
        <Score spec={spec} onRendered={onRendered} />
      </div>

      {value.placed.length === 0 && (
        <p class="input-summary">
          Wähle ♯ oder ♭ und klicke die Vorzeichen der Reihe nach auf die richtigen Linien.
        </p>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Modus «mark» — Halbtonschritte markieren
// ---------------------------------------------------------------------------

function MarkInput({ task, answer, update, readOnly }: ModeProps) {
  const solution = task.solution;
  const marks = (answer.n as MarkAnswer | undefined) ?? [];
  const area = useRef<HTMLDivElement>(null);
  const rendered = useRef<RenderedScore | null>(null);
  /** Knopfpositionen in Pixeln, relativ zum Rahmen. */
  const [positions, setPositions] = useState<number[]>([]);

  /**
   * Die Knöpfe müssen exakt zwischen zwei Notenköpfen sitzen. Prozentwerte
   * reichen dafür nicht: das SVG wird per CSS skaliert und sitzt nicht
   * zwingend bündig im Rahmen. Deshalb aus der tatsächlichen Bildschirmlage
   * rechnen — und bei jeder Grössenänderung neu.
   */
  const measure = useCallback(() => {
    const result = rendered.current;
    const box = area.current;
    if (!result || !box) return;

    const svgRect = result.svg.getBoundingClientRect();
    const boxRect = box.getBoundingClientRect();
    if (svgRect.width === 0) return;

    const scale = svgRect.width / result.width;
    const offset = svgRect.left - boxRect.left;
    const xs = (result.notes[0] ?? []).map((note) => offset + noteHeadCentre(note) * scale);

    setPositions((previous) =>
      previous.length === xs.length && previous.every((p, i) => Math.abs(p - xs[i]) < 0.5)
        ? previous
        : xs,
    );
  }, []);

  const onRendered = useCallback(
    (result: RenderedScore) => {
      rendered.current = result;
      measure();
    },
    [measure],
  );

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => measure());
    if (area.current) observer.observe(area.current);
    return () => observer.disconnect();
  }, [measure]);

  if (solution.type !== 'mark') return null;

  function toggle(gap: number) {
    if (readOnly) return;
    update(marks.includes(gap) ? marks.filter((g) => g !== gap) : [...marks, gap].sort((a, b) => a - b));
  }

  return (
    <div class="mark-area" ref={area}>
      <Score spec={task.score} onRendered={onRendered} />
      <div class="mark-overlay">
        {positions.slice(0, -1).map((x, index) => (
          <button
            key={index}
            type="button"
            class={`mark-button ${marks.includes(index) ? 'is-active' : ''}`}
            style={{ left: `${(x + positions[index + 1]) / 2}px` }}
            onClick={() => toggle(index)}
            disabled={readOnly}
            aria-pressed={marks.includes(index)}
            aria-label={`Halbtonschritt zwischen Ton ${index + 1} und ${index + 2}`}
          >
            <span aria-hidden="true">⌄</span>
          </button>
        ))}
      </div>
    </div>
  );
}
