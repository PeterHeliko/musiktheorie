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
 * Sieben Modi, siehe NotationTask['mode'].
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { RefObject } from 'preact';
import type { MeasureSpec, NotationTask, NoteSpec, PitchSlotSolution, ScoreSpec } from '../../content/schema';
import { useExam } from '../../state';
import { Score } from '../../ui/Score';
import {
  SCORE_SCALE,
  diatonicForY,
  diatonicToStep,
  noteHeadCentre,
  toScoreCoordinates,
  type RenderedScore,
} from '../render';
import {
  diatonicIndex,
  keySignaturePitches,
  midi,
  naturalAt,
  nearestWithStep,
  parsePitch,
  semitoneStep,
  toGermanPitch,
  STEPS,
  type Pitch,
  type Step,
} from '../theory';
import type {
  ChordAnswer,
  InputNote,
  KeysigAnswer,
  MarkAnswer,
  MelodyAnswer,
  NotationAnswer,
  PitchAnswer,
  SlotAnswer,
} from '../../scoring';
import { judgeChordNotes, judgeKeySignature, pitchSlotCorrect, toPitch } from '../../scoring';
import { shortcutAllowed } from '../../ui/keyboard';
import { AccidentalPalette, DurationPalette, EditActions, ToolbarActions, type DurationChoice } from './toolbar';

// ---------------------------------------------------------------------------
// Gemeinsames
// ---------------------------------------------------------------------------

/** Wie weit darf über das System hinaus gesetzt werden? In diatonischen Stufen. */
const LEDGER_STEPS = 6;

/** Klickabstand in Pixeln, ab dem eine bestehende Note als getroffen gilt. */
const HIT_TOLERANCE = 18;

/** Rückgängig und wiederholen, über alle Änderungen der Antwort. */
interface AnswerHistory {
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

interface ModeProps {
  task: NotationTask;
  answer: NotationAnswer;
  update: (next: unknown) => void;
  history: AnswerHistory;
  readOnly: boolean;
}

/**
 * Jede Änderung der Antwort — setzen, Vorzeichen, Tastatur, alles löschen —
 * merkt sich den Stand davor; Rückgängig geht dorthin zurück, Wiederholen
 * wieder vor. Eine neue Änderung verwirft, was sich wiederholen liesse. Eine
 * Änderung, die nichts ändert (derselbe Ton noch einmal), zählt nicht als
 * Schritt. Der Verlauf gehört zur Aufgabe: mit der nächsten ist er weg, die
 * Ansicht wird dafür neu aufgebaut.
 *
 * Der Stand wird immer frisch aus dem Speicher gelesen, nicht aus dem letzten
 * Rendern (siehe state.tsx).
 */
function useNotationAnswer(task: NotationTask) {
  const { answer, setAnswer, readOnly } = useExam();
  const current = answer<NotationAnswer>(task.id) ?? {};
  const past = useRef<unknown[]>([]);
  const future = useRef<unknown[]>([]);
  // Sicherheitshalber: sollte die Ansicht doch einmal für eine andere Aufgabe
  // weiterleben, beginnt der Verlauf neu.
  const owner = useRef(task.id);
  if (owner.current !== task.id) {
    owner.current = task.id;
    past.current = [];
    future.current = [];
  }

  const read = () => answer<NotationAnswer>(task.id)?.n;
  const write = (next: unknown) => {
    const existing = (answer<NotationAnswer>(task.id) ?? {}) as NotationAnswer;
    setAnswer(task.id, { ...existing, n: next });
  };

  const update = (next: unknown) => {
    if (readOnly) return;
    const before = read();
    if (JSON.stringify(before) === JSON.stringify(next)) return;
    past.current.push(before);
    future.current = [];
    write(next);
  };

  const history: AnswerHistory = {
    undo() {
      if (readOnly || past.current.length === 0) return;
      future.current.push(read());
      write(past.current.pop());
    },
    redo() {
      if (readOnly || future.current.length === 0) return;
      past.current.push(read());
      write(future.current.pop());
    },
    canUndo: !readOnly && past.current.length > 0,
    canRedo: !readOnly && future.current.length > 0,
  };

  return { current, update, history, readOnly };
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
 * Misst die verfügbare Breite und gibt die Breite zurück, mit der das
 * Notenbild gezeichnet werden muss, um sie zu füllen. Ohne das bliebe rechts
 * ungenutzter Platz stehen, und auf schmalen Geräten würde es zu breit.
 *
 * Geteilt durch SCORE_SCALE: das Bild wird vergrössert angezeigt. Wer es mit
 * der vollen Breite zeichnete, bekäme breitere Takte, aber keine grösseren
 * Noten.
 *
 * `minDraw`: so breit muss mindestens gezeichnet werden, damit die Takte nicht
 * zu eng werden. Auf schmalen Bildschirmen fällt die Vergrösserung dann
 * entsprechend kleiner aus — höchstens bis zur ursprünglichen Grösse, nie
 * darunter.
 */
function drawWidthFor(available: number, minDraw: number): number {
  return Math.max(Math.floor(available / SCORE_SCALE), Math.min(available, minDraw));
}

function useMeasuredWidth(fallback: number, minDraw = 0): [RefObject<HTMLDivElement>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(drawWidthFor(fallback, minDraw));

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      const measured = drawWidthFor(Math.round(element.clientWidth), minDraw);
      // Kleine Schwankungen ignorieren, sonst zeichnet VexFlow dauernd neu.
      if (measured > 0) setWidth((previous) => (Math.abs(previous - measured) < 3 ? previous : measured));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [minDraw]);

  return [ref, width];
}

/**
 * Mindestbreite in Zeicheneinheiten für ein System mit so vielen Takten:
 * Schlüssel, Vorzeichen und Taktart vorweg, dann rund 90 je Takt — genug für
 * vier Viertel oder acht Achtel samt Vorzeichen.
 */
function minDrawWidth(measures: number): number {
  return 90 + measures * 90;
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

/**
 * Zeigen, ziehen, loslassen.
 *
 * Gesetzt wird beim LOSLASSEN, nicht beim Drücken. Bis dahin zeigt die blaue
 * Vorschau, wo die Note landen würde, und folgt dem Finger bzw. der Maus. So
 * lässt sich die Tonhöhe auf dem Telefon in Ruhe suchen — der Finger verdeckt
 * die Stelle, an der er aufsetzt, und ein Tippen träfe selten die richtige
 * Linie.
 *
 * - Mit der Maus erscheint die Vorschau schon beim Darüberfahren.
 * - Loslassen ausserhalb des Notenbilds bricht ab, ebenso ein vom System
 *   abgebrochener Zeiger (z.B. ein eingehender Anruf).
 * - Der Zeiger wird am Rahmen festgehalten (Pointer Capture). Der Rahmen bleibt
 *   beim Neuzeichnen bestehen, das SVG darin nicht — ohne Capture ginge das
 *   Loslassen ins Leere, sobald die Vorschau das SVG ersetzt hat.
 * - Im Rahmen scrollt der Finger nicht die Seite, sonst würde senkrechtes
 *   Ziehen die Seite verschieben statt die Tonhöhe. Dafür reicht CSS
 *   (touch-action: none) nicht: iOS Safari kennt davon nur «auto» und
 *   «manipulation». Deshalb zusätzlich touchstart/touchmove mit
 *   preventDefault — als nicht-passive Listener, sonst ignoriert der Browser
 *   das preventDefault.
 * - Damit diese Touch-Ereignisse überhaupt beim Rahmen ankommen, darf das
 *   berührte Element nicht verschwinden: iOS schickt alle weiteren
 *   Touch-Ereignisse an das Element, auf dem der Finger aufsetzte — wird es
 *   ersetzt (die Vorschau zeichnet das SVG neu), steigen sie nicht mehr auf.
 *   Das SVG nimmt deshalb keine Zeigerereignisse an (CSS pointer-events:
 *   none), getroffen wird immer der beständige Rahmen darum.
 *
 * `pressed`: ob gerade gedrückt gezogen wird (Finger auf dem Glas, Maustaste
 * unten). Wo die neue Note die gesetzte ersetzt, verschwindet diese dann
 * sofort (PitchInput).
 */
function usePointerPlacement(
  hover: { onMove: (event: MouseEvent) => void; onLeave: () => void },
  enabled: boolean,
  commit: (event: PointerEvent) => void,
  area: RefObject<HTMLElement>,
) {
  const active = useRef<number | null>(null);
  const [pressed, setPressed] = useState(false);
  // Immer die aktuelle Fassung: `commit` ist bei jedem Rendern eine neue Funktion.
  const commitRef = useRef(commit);
  commitRef.current = commit;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => {
    const element = area.current;
    if (!element) return;
    // Nach dem Prüfen (gesperrt) darf über dem Notenbild wieder gescrollt werden.
    const block = (event: TouchEvent) => {
      if (enabledRef.current) event.preventDefault();
    };
    element.addEventListener('touchstart', block, { passive: false });
    element.addEventListener('touchmove', block, { passive: false });
    return () => {
      element.removeEventListener('touchstart', block);
      element.removeEventListener('touchmove', block);
    };
  }, [area]);

  const finish = (event: PointerEvent, apply: boolean) => {
    if (active.current !== event.pointerId) return;
    active.current = null;
    setPressed(false);
    const area = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const inside =
      event.clientX >= area.left &&
      event.clientX <= area.right &&
      event.clientY >= area.top &&
      event.clientY <= area.bottom;
    if (apply && inside) commitRef.current(event);
    // Ohne Maus gibt es kein «Darüberfahren»: nach dem Loslassen verschwindet
    // die Vorschau.
    if (event.pointerType !== 'mouse' || !inside) hover.onLeave();
  };

  const handlers = {
    onPointerDown: (event: PointerEvent) => {
      if (!enabled || event.button !== 0) return;
      active.current = event.pointerId;
      setPressed(true);
      (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
      // Kein Markieren von Text, kein Fokuswechsel beim Ziehen.
      event.preventDefault();
      hover.onMove(event);
    },
    onPointerMove: (event: PointerEvent) => {
      if (active.current === event.pointerId || event.pointerType === 'mouse') hover.onMove(event);
    },
    onPointerUp: (event: PointerEvent) => finish(event, true),
    onPointerCancel: (event: PointerEvent) => finish(event, false),
    onPointerLeave: (event: PointerEvent) => {
      if (active.current === null && event.pointerType === 'mouse') hover.onLeave();
    },
  };

  return { pressed, handlers };
}

/** Ton auf der mittleren Notenlinie: h¹ im Violin-, d im Bassschlüssel. */
function middleLine(clef: ScoreSpec['clef']): Pitch {
  return clef === 'bass' ? { step: 'd', alter: 0, octave: 3 } : { step: 'b', alter: 0, octave: 4 };
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
  const { current, update, history, readOnly } = useNotationAnswer(task);
  const props: ModeProps = { task, answer: current, update, history, readOnly };

  return (
    <div class="notation-input">
      {task.mode === 'pitch' && <PitchInput {...props} />}
      {task.mode === 'melody' && <MelodyInput {...props} />}
      {(task.mode === 'rhythm' || task.mode === 'rest') && <SlotInput {...props} />}
      {task.mode === 'keysig' && <KeySignatureInput {...props} />}
      {task.mode === 'mark' && <MarkInput {...props} />}
      {task.mode === 'chord' && <ChordInput {...props} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modus «pitch» — einzelne Töne oder Akkordtöne setzen
// ---------------------------------------------------------------------------

/** Tonnamen auf der Tastatur, deutsch: h ist H, b ist B (H mit b). */
const KEY_LETTERS = new Map<string, { step: Step; alter: number }>([
  ['c', { step: 'c', alter: 0 }],
  ['d', { step: 'd', alter: 0 }],
  ['e', { step: 'e', alter: 0 }],
  ['f', { step: 'f', alter: 0 }],
  ['g', { step: 'g', alter: 0 }],
  ['a', { step: 'a', alter: 0 }],
  ['h', { step: 'b', alter: 0 }],
  ['b', { step: 'b', alter: -1 }],
]);

/**
 * Zeichenbreite vor und nach den Noten eines Takts (Schlüssel, Ränder). Grob
 * genug, um ein Notenbild für eine Note mehr zu verbreitern, ohne dass die
 * vorhandenen rutschen.
 */
const SCORE_PREFIX = 60;

/**
 * Die Lösung als grüne Note, nachdem falsch oder gar nicht geantwortet wurde
 * — nur bei einem einzelnen Ton (Intervall notieren); bei Akkorden und
 * mehreren Plätzen gäbe es keinen eindeutigen Ort für sie. Sind beide
 * Richtungen richtig, die, die dem gesetzten Ton näher liegt: sie zeigt, wo
 * er hingehört hätte. Ohne gesetzten Ton die erste.
 */
function solutionNote(
  slots: { slot: number; accept: string[]; chord?: boolean }[],
  placed: PitchAnswer,
): NoteSpec | null {
  if (slots.length !== 1 || slots[0].chord) return null;
  const [slot] = slots;
  const own = placed[String(slot.slot)] ?? [];
  if (own.length > 0 && pitchSlotCorrect(slot, own)) return null;
  const at = own.length > 0 ? midi(toPitch(own[0])) : null;
  const distance = (key: string) => (at === null ? 0 : Math.abs(midi(parsePitch(key)) - at));
  const nearest = slot.accept.reduce((best, key) => (distance(key) < distance(best) ? key : best));
  return { keys: [nearest], duration: 'w', mark: 'correct' };
}

/** Der aktive Platz: der gewählte, sonst der erste leere, sonst der erste. */
function pickActive(slots: PitchSlotSolution[], placed: PitchAnswer, active: number | null): PitchSlotSolution {
  return (
    slots.find((slot) => slot.slot === active) ??
    slots.find((slot) => !(placed[String(slot.slot)] ?? []).length) ??
    slots[0]
  );
}

/** Der nächste leere Platz nach `after`, sonst der erste leere davor; null, wenn alle stehen. */
function nextEmpty(slots: PitchSlotSolution[], placed: PitchAnswer, after: number): number | null {
  const empty = slots.filter((slot) => !(placed[String(slot.slot)] ?? []).length).map((slot) => slot.slot);
  return empty.find((slot) => slot > after) ?? empty[0] ?? null;
}

/** Der nächste Ton vor diesem Platz: gesetzt oder vorgegeben. */
function previousNote(task: NotationTask, slots: PitchSlotSolution[], placed: PitchAnswer, slot: number): Pitch | null {
  for (let index = slot - 1; index >= 0; index--) {
    const own = slots.some((entry) => entry.slot === index) ? placed[String(index)]?.[0] : undefined;
    if (own) return toPitch(own);
    const given = task.score.measures[0]?.notes[index]?.keys?.[0];
    if (given && !slots.some((entry) => entry.slot === index)) return parsePitch(given);
  }
  return null;
}

function PitchInput({ task, answer, update, history, readOnly }: ModeProps) {
  const solution = task.solution;
  const placed = (answer.n as PitchAnswer | undefined) ?? {};
  const [alter, setAlter] = useState(0);
  const { rendered, onRendered, live } = useRenderedRef();
  const { hover, onMove, onLeave } = useHover(live, !readOnly);
  const area = useRef<HTMLDivElement>(null);
  const pointer = usePointerPlacement({ onMove, onLeave }, !readOnly, handleClick, area);

  /**
   * Mehrere Plätze für je einen Ton (Tonleiter notieren, Entscheid
   * 2026-11-24): einer ist aktiv. Gezogen wird irgendwo im System, gesetzt in
   * den aktiven Platz — so lässt sich neben der Note ziehen, und der Finger
   * verdeckt sie nicht. Danach rückt der aktive Platz zum nächsten leeren;
   * die Nummern unter dem System wählen ihn von Hand.
   */
  const sequential = solution.type === 'pitch' && solution.slots.length > 1 && !solution.slots.some((s) => s.chord);
  const [active, setActive] = useState<number | null>(null);
  const activeSlot = sequential && solution.type === 'pitch' ? pickActive(solution.slots, placed, active) : null;

  /**
   * Der Platz, dem Vorzeichen und Tastatur gelten: der einzige (Intervall
   * notieren) oder der aktive (Tonleiter notieren). Bei Akkorden keiner.
   */
  const current =
    solution.type === 'pitch' && solution.slots.length === 1 && !solution.slots[0].chord ? solution.slots[0] : activeSlot;

  // Die Vorzeichenknöpfe zeigen das Vorzeichen des Tons im aktuellen Platz
  // (siehe changeAlter). Holt Rückgängig oder Wiederholen einen Ton mit
  // anderem Vorzeichen zurück, oder wird ein anderer Platz gewählt, folgen sie ihm.
  const currentAlter = current ? placed[String(current.slot)]?.[0]?.a : undefined;
  useEffect(() => {
    if (currentAlter !== undefined) setAlter(currentAlter);
  }, [currentAlter, current?.slot]);

  // Die Nummern unter dem System stehen unter ihren Plätzen: aus der
  // gezeichneten Lage gemessen, wie die Knöpfe beim Halbtonschritte-Markieren.
  const [slotXs, setSlotXs] = useState<number[]>([]);
  const measureSlots = useCallback(() => {
    const result = live();
    const box = area.current;
    if (!result || !box) return;
    const svgRect = result.svg.getBoundingClientRect();
    const boxRect = box.getBoundingClientRect();
    if (svgRect.width === 0) return;
    const scale = svgRect.width / result.width;
    const xs = (result.notes[0] ?? []).map((note) => svgRect.left - boxRect.left + noteHeadCentre(note) * scale);
    setSlotXs((previous) =>
      previous.length === xs.length && previous.every((x, i) => Math.abs(x - xs[i]) < 0.5) ? previous : xs,
    );
  }, [live]);
  const onScoreRendered = useCallback(
    (result: RenderedScore, element: HTMLDivElement) => {
      onRendered(result, element);
      if (sequential) requestAnimationFrame(measureSlots);
    },
    [onRendered, measureSlots, sequential],
  );
  useEffect(() => {
    if (!sequential || typeof ResizeObserver === 'undefined' || !area.current) return;
    const observer = new ResizeObserver(() => measureSlots());
    observer.observe(area.current);
    return () => observer.disconnect();
  }, [sequential, measureSlots]);

  // Tastatur (siehe ui/keyboard.ts). Gehorcht wird am Fenster, damit niemand
  // erst ins Notenbild klicken muss. `handleKey` entsteht bei jedem Rendern
  // neu und sieht so immer die aktuelle Antwort.
  const keyHandler = useRef(handleKey);
  keyHandler.current = handleKey;
  useEffect(() => {
    const listener = (event: KeyboardEvent) => keyHandler.current(event);
    globalThis.addEventListener('keydown', listener);
    return () => globalThis.removeEventListener('keydown', listener);
  }, []);

  if (solution.type !== 'pitch') return null;
  const slots = solution.slots;
  const isChord = slots.some((s) => s.chord);

  /** Der vorgegebene Ton — von ihm aus geht es los, solange nichts gesetzt ist. */
  const givenKey = task.score.measures[0]?.notes.find(
    (note, index) => !slots.some((slot) => slot.slot === index) && note.keys?.length,
  )?.keys?.[0];
  const given = givenKey ? parsePitch(givenKey) : null;

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
    const target = hover ? (activeSlot ?? slotNear(hover.x)) : null;

    const notes: NoteSpec[] = measure.notes.map((note, index) => {
      const slot = slots.find((s) => s.slot === index);
      const own = placed[String(index)] ?? [];
      if (!slot) return note;

      // Nach dem Prüfen keine Vorschau mehr: die Maus steht meist noch da,
      // wo zuletzt gesetzt wurde, und zeichnete sonst einen zweiten Kopf.
      const previewKey =
        !readOnly && hover && target?.slot === index
          ? noteKey(noteFrom(hover.diatonic, alter, { duration: 'w', dotted: false }))
          : null;

      if (slot.chord) {
        const keys = [...(note.keys ?? []), ...own.map(noteKey)];
        return { ...note, keys, previewKeys: previewKey ? [previewKey] : undefined };
      }
      // Mehrere Plätze (Tonleiter notieren), geprüft: jeder gesetzte Ton grün
      // oder rot; die Lösung steht darunter (`solutionBelow`).
      if (readOnly && slots.length > 1) {
        if (own.length === 0) return { ...note, annotation: undefined };
        return { keys: [noteKey(own[0])], duration: note.duration, mark: pitchSlotCorrect(slot, own) ? 'correct' : 'wrong' };
      }
      // Wird gedrückt gezogen, ersetzt die neue Note beim Loslassen die
      // gesetzte — die verschwindet deshalb sofort, zu sehen ist nur noch die
      // gezogene. Bricht der Zug ab (Loslassen ausserhalb), steht sie wieder da.
      const replacing = pointer.pressed && previewKey !== null;
      if (own.length === 0 || replacing) {
        // Geprüft, ohne dass etwas steht (gesetzt und gelöscht): an der
        // Leerstelle steht dann gleich die Lösung.
        const solution = readOnly ? solutionNote(slots, placed) : null;
        if (solution) return solution;
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
        // Nach dem Prüfen ist die Antwort eingefroren — dann zeigt die Farbe
        // der gesetzten Note, ob sie stimmt.
        mark: readOnly ? (pitchSlotCorrect(slot, own) ? 'correct' : 'wrong') : undefined,
      };
    });

    // War der gesetzte Ton falsch, steht die Lösung grün daneben. Das Bild
    // wird dafür breiter statt enger: so bleiben die beiden Töne, wo sie
    // waren, und die Lösung kommt rechts dazu.
    const own = slots.length === 1 ? (placed[String(slots[0].slot)] ?? []) : [];
    const solution = readOnly && own.length > 0 ? solutionNote(slots, placed) : null;
    if (solution) {
      const width = task.score.width ?? 600;
      return {
        ...task.score,
        width: width + Math.round((width - SCORE_PREFIX) / notes.length),
        measures: [{ ...measure, notes: [...notes, solution] }],
      };
    }

    return { ...task.score, measures: [{ ...measure, notes }] };
  }, [
    task.score,
    JSON.stringify(placed),
    JSON.stringify(slots),
    hover?.diatonic,
    hover?.x,
    alter,
    readOnly,
    pointer.pressed,
    activeSlot?.slot,
  ]);

  /**
   * Mehrere Plätze, geprüft und nicht alles richtig: die ganze Lösung grün in
   * einem zweiten System darunter, gleich gebaut — so steht jeder richtige Ton
   * genau unter dem eigenen. Im selben System neben dem eigenen Ton läse sich
   * eine Sekunde daneben wie zwei Töne der Leiter.
   */
  const solutionBelow = useMemo<ScoreSpec | null>(() => {
    if (!readOnly || slots.length < 2 || slots.some((slot) => slot.chord)) return null;
    if (slots.every((slot) => pitchSlotCorrect(slot, placed[String(slot.slot)] ?? []))) return null;
    const measure = task.score.measures[0];
    const notes = measure.notes.map((note, index): NoteSpec => {
      const slot = slots.find((s) => s.slot === index);
      return slot ? { keys: [slot.accept[0]], duration: note.duration, mark: 'correct' } : note;
    });
    return { ...task.score, measures: [{ ...measure, notes }] };
  }, [task.score, JSON.stringify(placed), JSON.stringify(slots), readOnly]);

  function handleClick(event: PointerEvent) {
    // Aufgerufen beim Loslassen (usePointerPlacement), an der Stelle, an der
    // die Vorschau zuletzt stand.
    if (event.button !== 0) return;
    if (readOnly) return;
    const hit = locate(live(), event);
    if (!hit) return;

    const target = activeSlot ?? slotNear(hit.x);
    const key = String(target.slot);
    const own = placed[key] ?? [];
    const incoming = noteFrom(hit.diatonic, alter, { duration: 'w', dotted: false });
    if (activeSlot) {
      // Gesetzt in den aktiven Platz; dann weiter zum nächsten leeren.
      const next = { ...placed, [key]: [incoming] };
      update(next);
      setActive(nextEmpty(slots, next, target.slot) ?? target.slot);
      return;
    }

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

  /**
   * Wird nur ein einziger Ton gesetzt (Intervall notieren), ist klar, wem ein
   * Vorzeichen gilt: dem schon gesetzten Ton genauso wie dem nächsten. Erst
   * die Stelle, dann das Vorzeichen zu wählen, ist dann ebenso richtig wie
   * umgekehrt. Bei Akkorden bleibt es beim «nächsten Ton» — welcher der
   * gesetzten gemeint wäre, ist dort nicht zu erraten.
   */
  const lone = !isChord && slots.length === 1 ? slots[0] : null;

  function changeAlter(next: number) {
    setAlter(next);
    if (!current || readOnly) return;
    const key = String(current.slot);
    const own = placed[key];
    if (own?.length === 1 && own[0].a !== next) update({ ...placed, [key]: [{ ...own[0], a: next }] });
  }

  /**
   * Tastatur — nur wenn ein einziger Ton zu setzen ist; bei Akkorden wäre
   * nicht klar, welcher Ton sich bewegen soll.
   *
   *  - Tonname (c d e f g a h, b): setzt diesen Ton in die nächste Lage zum
   *    gesetzten Ton, sonst zum vorgegebenen. Aus, wo der Name die Frage ist
   *    (`noNameKeys`).
   *  - ↑/↓: ein Halbton (`semitoneStep`); ohne Vorzeichen eine Stufe. Ist noch
   *    nichts gesetzt, geht es vom vorgegebenen Ton aus, ohne ihn von der
   *    Mittellinie.
   *  - Umschalt + ↑/↓: eine Oktave.
   *  - ⌫ oder Entf: den gesetzten Ton wegnehmen.
   */
  function handleKey(event: KeyboardEvent) {
    if (solution.type !== 'pitch' || !current || readOnly || !shortcutAllowed(event)) return;
    const key = String(current.slot);
    const own = placed[key]?.[0];
    if (activeSlot && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      // Den aktiven Platz wechseln.
      event.preventDefault();
      const index = slots.findIndex((slot) => slot.slot === activeSlot.slot);
      const neighbour = slots[index + (event.key === 'ArrowRight' ? 1 : -1)];
      if (neighbour) setActive(neighbour.slot);
      return;
    }
    // Leer geht es vom nächsten Ton davor aus (bei der Tonleiter dem vorigen
    // Platz), sonst vom vorgegebenen; ohne beide von der Mittellinie.
    const before = activeSlot ? previousNote(task, slots, placed, activeSlot.slot) : null;
    const anchor = before ?? given;
    const from: Pitch = own ? { step: own.s, alter: own.a, octave: own.o } : (anchor ?? middleLine(task.score.clef));

    let next: Pitch;
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      const direction = event.key === 'ArrowUp' ? 1 : -1;
      next = event.shiftKey
        ? { ...from, octave: from.octave + direction }
        : task.noAccidentals
          ? naturalAt(diatonicIndex(from) + direction)
          : semitoneStep(from, direction);
    } else if (event.key === 'Backspace' || event.key === 'Delete') {
      if (!own) return;
      event.preventDefault();
      if (lone) {
        update({});
      } else {
        const { [key]: _removed, ...rest } = placed;
        update(rest);
      }
      return;
    } else {
      const letter = task.noNameKeys ? undefined : KEY_LETTERS.get(event.key.toLowerCase());
      if (!letter || (!own && !anchor) || (task.noAccidentals && letter.alter !== 0)) return;
      next = nearestWithStep(letter.step, letter.alter, from);
    }

    // Auch am Rand des Erlaubten sollen die Pfeile die Seite nicht verschieben.
    event.preventDefault();
    if (!withinReach(next)) return;
    setAlter(next.alter);
    update({ ...placed, [key]: [{ s: next.step, o: next.octave, a: next.alter, d: 'w' }] });
  }

  /** So weit wie mit dem Zeiger: bis LEDGER_STEPS Stufen über und unter das System. */
  function withinReach(pitch: Pitch): boolean {
    const geometry = live()?.staves[0];
    if (!geometry) return true;
    const top = diatonicForY(geometry, geometry.stave.getYForLine(0));
    const bottom = diatonicForY(geometry, geometry.stave.getYForLine(4));
    const index = diatonicIndex(pitch);
    return index <= top + LEDGER_STEPS && index >= bottom - LEDGER_STEPS;
  }

  const summary = slots
    .flatMap((slot) => (placed[String(slot.slot)] ?? []).map((n) => toGermanPitch(parsePitch(noteKey(n)))));

  return (
    <>
      <div class="toolbar toolbar-one-row toolbar-bare">
        {/* Ohne Vorzeichen bleibt `alter` bei 0: gesetzt werden nur Stammtöne. */}
        {!task.noAccidentals && (
          <AccidentalPalette
            value={alter}
            onChange={changeAlter}
            disabled={readOnly}
            label={lone ? 'Vorzeichen' : 'Vorzeichen für den nächsten Ton'}
            bare
          />
        )}
        <EditActions
          onClear={() => update({})}
          canClear={summary.length > 0}
          onUndo={history.undo}
          canUndo={history.canUndo}
          onRedo={history.redo}
          canRedo={history.canRedo}
          disabled={readOnly}
        />
      </div>

      <div class="score-click-area score-click-area-bare" ref={area} {...pointer.handlers}>
        <Score spec={spec} onRendered={onScoreRendered} />
      </div>

      {activeSlot && !readOnly && (
        <div class="slot-row" role="group" aria-label="Platz wählen">
          {slots.map((slot) => (
            <button
              key={slot.slot}
              type="button"
              class={`slot-button ${slot.slot === activeSlot.slot ? 'is-active' : ''}`}
              style={{ left: `${slotXs[slot.slot] ?? 0}px`, visibility: slotXs.length ? 'visible' : 'hidden' }}
              aria-pressed={slot.slot === activeSlot.slot}
              aria-label={`Ton ${slot.slot + 1}`}
              onClick={() => setActive(slot.slot)}
            >
              {slot.slot + 1}
            </button>
          ))}
        </div>
      )}

      {solutionBelow && (
        <div class="score-solution" role="img" aria-label={`Lösung: ${slots.map((slot) => toGermanPitch(parsePitch(slot.accept[0]))).join(', ')}`}>
          <Score spec={solutionBelow} />
        </div>
      )}

      <p class="input-summary">
        {summary.length > 0 ? (
          <>
            Gesetzt: <b>{summary.join(', ')}</b>
          </>
        ) : isChord ? (
          'Setze zwei Töne über den vorgegebenen Grundton. Gesetzt wird beim Loslassen.'
        ) : activeSlot ? (
          'Ziehe auf die Tonhöhe, gern auch neben der Note. Gesetzt wird beim Loslassen in den blauen Platz.'
        ) : (
          'Auf die gewünschte Tonhöhe tippen oder dorthin ziehen. Gesetzt wird beim Loslassen.'
        )}
      </p>
    </>
  );
}

// ---------------------------------------------------------------------------
// Modus «chord» — einen Akkord frei setzen, auch über zwei Systeme
// ---------------------------------------------------------------------------

/** Wo im Akkord-Notenbild liegt der Zeiger: oberes (oder einziges) System, unteres. */
interface ChordLocation {
  staff: 'u' | 'l';
  diatonic: number;
}

/**
 * Im Klaviersystem entscheidet die Höhe, welches System gemeint ist: die
 * Grenze liegt mitten zwischen der untersten Linie oben und der obersten
 * unten. So reicht jedes System mit Hilfslinien bis zur Mitte.
 */
function locateChord(rendered: RenderedScore | null, event: MouseEvent): ChordLocation | null {
  if (!rendered) return null;
  const point = toScoreCoordinates(rendered.svg, event);
  const upper = rendered.staves[0];
  if (!point || !upper) return null;
  const lower = rendered.bassStaves[0];
  const below = lower && point.y > (upper.stave.getYForLine(4) + lower.stave.getYForLine(0)) / 2;
  const geometry = below ? lower : upper;
  const highest = diatonicForY(geometry, geometry.stave.getYForLine(0)) + LEDGER_STEPS;
  const lowest = diatonicForY(geometry, geometry.stave.getYForLine(4)) - LEDGER_STEPS;
  return {
    staff: below ? 'l' : 'u',
    diatonic: Math.min(highest, Math.max(lowest, diatonicForY(geometry, point.y))),
  };
}

/**
 * Ein Akkord, frei gesetzt (Entscheid 2026-11-24): jede Stelle antippen setzt
 * einen Ton, dieselbe Stelle noch einmal nimmt ihn weg (mit anderem
 * Vorzeichen: ändert es). Im Klaviersystem gehören die Töne beider Systeme
 * zum selben Akkord. Bewertet wird nach `ChordRule` (scoring/chord.ts).
 *
 * Nach dem Prüfen ist jeder gesetzte Ton grün oder rot, wie bewertet; war der
 * Akkord falsch, steht eine richtige Lösung grün daneben.
 */
function ChordInput({ task, answer, update, history, readOnly }: ModeProps) {
  const solution = task.solution;
  const placed = (answer.n as ChordAnswer | undefined) ?? {};
  const [alter, setAlter] = useState(0);
  const { onRendered, live } = useRenderedRef();
  const [hover, setHover] = useState<ChordLocation | null>(null);
  const area = useRef<HTMLDivElement>(null);
  const onMove = useCallback(
    (event: MouseEvent) => {
      if (readOnly) return;
      const next = locateChord(live(), event);
      setHover((previous) =>
        previous && next && previous.staff === next.staff && previous.diatonic === next.diatonic ? previous : next,
      );
    },
    [readOnly, live],
  );
  const onLeave = useCallback(() => setHover(null), []);
  const pointer = usePointerPlacement({ onMove, onLeave }, !readOnly, handleClick, area);

  const upper = placed.u ?? [];
  const lower = placed.l ?? [];
  const grand = task.score.clef === 'grand';

  const spec = useMemo<ScoreSpec>(() => {
    if (solution.type !== 'chord') return task.score;
    const measure = task.score.measures[0];
    const judged = readOnly ? judgeChordNotes(solution.rule, [...upper, ...lower].map(toPitch)) : null;
    const marks = (from: number, count: number): NoteSpec['keyMarks'] =>
      judged?.marks.slice(from, from + count).map((mark) => (mark === 'right' ? 'correct' : 'wrong'));

    const staffNote = (own: InputNote[], staff: 'u' | 'l', empty: NoteSpec, from: number): NoteSpec => {
      const previewKey =
        !readOnly && hover?.staff === staff ? noteKey(noteFrom(hover.diatonic, alter, { duration: 'w', dotted: false })) : null;
      if (own.length === 0) return previewKey ? { keys: [previewKey], duration: 'w', preview: true } : empty;
      return {
        keys: own.map(noteKey),
        duration: 'w',
        previewKeys: previewKey ? [previewKey] : undefined,
        keyMarks: marks(from, own.length),
      };
    };

    const notes = [staffNote(upper, 'u', measure.notes[0], 0)];
    const bass = grand ? [staffNote(lower, 'l', measure.bass?.[0] ?? { duration: 'w', placeholder: true }, upper.length)] : undefined;

    // Falsch: eine richtige Lösung grün daneben. Das Bild wird dafür breiter,
    // damit der eigene Akkord bleibt, wo er war.
    if (judged && !judged.correct) {
      notes.push({ keys: solution.example.upper, duration: 'w', mark: 'correct' });
      bass?.push(
        solution.example.lower?.length
          ? { keys: solution.example.lower, duration: 'w', mark: 'correct' }
          : { duration: 'w', placeholder: true },
      );
      const width = task.score.width ?? 600;
      return { ...task.score, width: width + Math.round(width - SCORE_PREFIX), measures: [{ notes, bass }] };
    }
    return { ...task.score, measures: [{ notes, bass }] };
  }, [task.score, JSON.stringify(placed), hover?.staff, hover?.diatonic, alter, readOnly]);

  function handleClick(event: PointerEvent) {
    if (event.button !== 0 || readOnly) return;
    const hit = locateChord(live(), event);
    if (!hit) return;
    const own = placed[hit.staff] ?? [];
    const incoming = noteFrom(hit.diatonic, alter, { duration: 'w', dotted: false });
    // Dieselbe Stelle noch einmal: gleiches Vorzeichen nimmt den Ton weg,
    // ein anderes ändert ihn.
    const existing = own.findIndex((note) => note.s === incoming.s && note.o === incoming.o);
    const next =
      existing >= 0 && own[existing].a === incoming.a
        ? own.filter((_, index) => index !== existing)
        : existing >= 0
          ? own.map((note, index) => (index === existing ? incoming : note))
          : [...own, incoming].sort((a, b) => midi(toPitch(a)) - midi(toPitch(b)));
    update({ ...placed, [hit.staff]: next });
  }

  if (solution.type !== 'chord') return null;
  const summary = [...lower, ...upper].map((note) => toGermanPitch(toPitch(note)));

  return (
    <>
      <div class="toolbar toolbar-one-row toolbar-bare">
        <AccidentalPalette
          value={alter}
          onChange={setAlter}
          disabled={readOnly}
          label="Vorzeichen für den nächsten Ton"
          bare
        />
        <EditActions
          onClear={() => update({})}
          canClear={summary.length > 0}
          onUndo={history.undo}
          canUndo={history.canUndo}
          onRedo={history.redo}
          canRedo={history.canRedo}
          disabled={readOnly}
        />
      </div>

      <div class="score-click-area score-click-area-bare" ref={area} {...pointer.handlers}>
        <Score spec={spec} onRendered={onRendered} />
      </div>

      <p class="input-summary">
        {summary.length > 0 ? (
          <>
            Gesetzt: <b>{summary.join(', ')}</b>
          </>
        ) : grand ? (
          'Setze die Töne in die beiden Systeme. Noch einmal auf denselben Ton tippen nimmt ihn weg.'
        ) : (
          'Setze die Töne ins System. Noch einmal auf denselben Ton tippen nimmt ihn weg.'
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
  const [wrapper, width] = useMeasuredWidth(720, minDrawWidth(task.score.measures.length));
  const pointer = usePointerPlacement({ onMove, onLeave }, !readOnly, handleClick, wrapper);

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
    // Aufgerufen beim Loslassen (usePointerPlacement), an der Stelle, an der
    // die Vorschau zuletzt stand.
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
        {...pointer.handlers}
        onKeyDown={handleKeyDown}
        role="application"
        aria-label="Noteneingabe für das Diktat"
      >
        <Score spec={spec} onRendered={onRendered} />
      </div>

      <p class="input-hint">
        {editMode === 'eingabe'
          ? 'Notenwert wählen, dann auf die gewünschte Tonhöhe tippen oder dorthin ziehen. Gesetzt wird beim Loslassen.'
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
  const [wrapper, width] = useMeasuredWidth(760, minDrawWidth(task.score.measures.length));
  const pointer = usePointerPlacement({ onMove, onLeave }, !readOnly, handleClick, wrapper);

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
    // Aufgerufen beim Loslassen (usePointerPlacement), an der Stelle, an der
    // die Vorschau zuletzt stand.
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
        {...pointer.handlers}
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

/**
 * Wie die übrigen Eingaben (Entscheid 2026-11-24): ♭ und ♯ wählen die
 * Vorzeichenart, daneben alles löschen, rückgängig, wiederholen. Gesetzt wird
 * beim Loslassen, an die Stelle der blauen Vorschau; dieselbe Stelle noch
 * einmal nimmt das Zeichen wieder weg. Die Art zu wechseln, ändert alle
 * gesetzten Zeichen mit — ein gemischter Satz wäre ohnehin falsch, und die
 * Stellen bleiben, wo sie sind.
 *
 * Nach dem Prüfen ist jedes Zeichen grün oder rot (`judgeKeySignature`); war
 * der Satz falsch, steht der richtige grün daneben, an den üblichen Stellen.
 * Stimmt er, steht aber nicht ganz an den üblichen Stellen (eine andere
 * Oktave), steht der übliche bernsteinfarben daneben, mit einer Zeile darunter.
 */
/** Zeichenbreite mit dem richtigen Satz daneben: zwei Takte à sieben Zeichen samt Schlüssel. */
const KEYSIG_SOLUTION_WIDTH = 270;

function KeySignatureInput({ task, answer, update, history, readOnly }: ModeProps) {
  const solution = task.solution;
  const value = (answer.n as KeysigAnswer | undefined) ?? { sign: 1, placed: [] };
  const { setAnswer } = useExam();
  const { onRendered, live } = useRenderedRef();
  const { hover, onMove, onLeave } = useHover(live, !readOnly);
  const area = useRef<HTMLDivElement>(null);
  const pointer = usePointerPlacement({ onMove, onLeave }, !readOnly, handleClick, area);

  // Eine Tonart ohne Vorzeichen verlangt ein leeres System. Damit «Prüfen»
  // dafür nicht erst eine Eingabe braucht, steht die leere Antwort von Anfang
  // an da — sie verrät nichts, die Aufgabe sagt es ohnehin dazu.
  const empty = solution.type === 'keysig' && solution.accidentals === 0;
  useEffect(() => {
    if (empty && !readOnly && answer.n === undefined) setAnswer(task.id, { ...answer, n: { sign: 1, placed: [] } });
  }, [task.id]);

  const spec = useMemo<ScoreSpec>(() => {
    if (solution.type !== 'keysig') return task.score;
    const glyph = value.sign > 0 ? ('sharp' as const) : ('flat' as const);
    const clef = task.score.clef === 'bass' ? 'bass' : 'treble';
    const judged = readOnly ? judgeKeySignature(solution.accidentals, value, clef) : null;
    const notes: NoteSpec[] = value.placed.map((entry, index) => ({
      keys: [`${entry.s}${entry.o}`],
      duration: 'w',
      glyph,
      ...(judged ? { mark: judged.marks[index] ? ('correct' as const) : ('wrong' as const) } : {}),
    }));
    if (hover && !readOnly) {
      const { step, octave } = diatonicToStep(hover.diatonic);
      notes.push({ keys: [`${step}${octave}`], duration: 'w', glyph, preview: true });
    }
    if (judged && (!judged.correct || judged.unusual)) {
      // Der richtige Satz als zweiter Takt, damit der eigene bleibt, wo er
      // war: grün, wenn der eigene falsch war; bernsteinfarben, wenn er
      // stimmt, aber anders üblich ist (Entscheid 2026-11-24).
      const right: NoteSpec[] = keySignaturePitches(solution.accidentals, clef).map((pitch) => ({
        keys: [`${pitch.step}${pitch.octave}`],
        duration: 'w',
        glyph: pitch.alter > 0 ? 'sharp' : 'flat',
        mark: judged.correct ? 'usual' : 'correct',
      }));
      // Beide Takte sind gleich breit und brauchen Platz für sieben Zeichen;
      // breiter als nötig machte das ganze Bild nur kleiner.
      return {
        ...task.score,
        width: Math.max(task.score.width ?? 600, KEYSIG_SOLUTION_WIDTH),
        measures: [{ notes }, { notes: right.length > 0 ? right : [{ duration: 'w', placeholder: true }] }],
      };
    }
    return { ...task.score, measures: [{ notes }] };
  }, [task.score, JSON.stringify(value), hover?.diatonic, readOnly]);

  if (solution.type !== 'keysig') return null;
  const usualElsewhere =
    readOnly && judgeKeySignature(solution.accidentals, value, task.score.clef === 'bass' ? 'bass' : 'treble').unusual;

  function handleClick(event: PointerEvent) {
    // Aufgerufen beim Loslassen (usePointerPlacement), an der Stelle, an der
    // die Vorschau zuletzt stand.
    if (event.button !== 0 || readOnly) return;
    const hit = locate(live(), event);
    if (!hit) return;
    const { step, octave } = diatonicToStep(hit.diatonic);
    const existing = value.placed.findIndex((entry) => entry.s === step && entry.o === octave);
    const placed =
      existing >= 0
        ? value.placed.filter((_, index) => index !== existing)
        : [...value.placed, { s: step, o: octave }];
    update({ sign: value.sign, placed });
  }

  return (
    <>
      <div class="toolbar toolbar-one-row toolbar-bare">
        <AccidentalPalette
          value={value.sign}
          onChange={(sign) => update({ sign, placed: value.placed })}
          disabled={readOnly}
          label="Vorzeichenart"
          bare
          only={[-1, 1]}
        />
        <EditActions
          onClear={() => update({ sign: value.sign, placed: [] })}
          canClear={value.placed.length > 0}
          onUndo={history.undo}
          canUndo={history.canUndo}
          onRedo={history.redo}
          canRedo={history.canRedo}
          disabled={readOnly}
        />
      </div>

      <div class="score-click-area score-click-area-bare" ref={area} {...pointer.handlers}>
        <Score spec={spec} onRendered={onRendered} />
      </div>

      {usualElsewhere ? (
        <p class="input-summary is-usual">Andere Platzierung üblich</p>
      ) : (
        <p class="input-summary">
          {value.placed.length > 0
            ? `Gesetzt: ${value.placed.length} ${value.sign > 0 ? (value.placed.length === 1 ? 'Kreuz' : 'Kreuze') : 'b'}`
            : 'Wähle ♭ oder ♯ und setze die Vorzeichen der Reihe nach. Noch einmal auf dieselbe Stelle tippen nimmt eines weg.'}
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
