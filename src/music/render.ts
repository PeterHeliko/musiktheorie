/* Herkunft: musiktheorie-scorm/src/music/render.ts (Stand 2026-08-21), über das Projekt «training».
   Wird hier eigenständig weitergeführt; es gibt keinen Abgleich mit dem Original mehr. */
/**
 * Notensatz mit VexFlow.
 *
 * Import bewusst aus 'vexflow/bravura': nur dieser Build hat die Bravura-Schrift
 * als Base64 eingebettet. Der Standard-Build 'vexflow/core' lädt die Schrift
 * zur Laufzeit von einem CDN nach — das würde im SCORM-Paket offline brechen.
 *
 * Der Renderer liefert nicht nur SVG, sondern auch die Geometrie (welches
 * Pixel entspricht welcher Tonhöhe), weil das Eingabe-Widget darauf aufbaut.
 */

import {
  Accidental,
  Annotation,
  Dot,
  Font,
  Formatter,
  GhostNote,
  GlyphNote,
  Renderer,
  Stave,
  StaveConnector,
  StaveNote,
  Barline,
  Voice,
} from 'vexflow/bravura';
import type { MeasureSpec, NoteSpec, ScoreSpec } from '../content/schema';
import {
  accidentalGlyph,
  diatonicIndex,
  midi,
  parsePitch,
  toVexKey,
  type Pitch,
  type Step,
  STEPS,
} from './theory';

/**
 * Der 'bravura'-Build lädt die Schrift aus eingebettetem Base64 — Font.HOST_URL
 * wird dabei nicht benutzt. Wir überschreiben die CDN-Adresse trotzdem: so kann
 * auch ein künftiger VexFlow-Codepfad das Paket nicht heimlich online machen.
 * Die Offline-Garantie hängt damit an der Konstruktion, nicht an Inspektion.
 */
Font.HOST_URL = './';

/** Diatonischer Index der obersten Notenlinie je Schlüssel. */
const TOP_LINE_DIATONIC: Record<'treble' | 'bass', number> = {
  // Violinschlüssel: oberste Linie ist f2 (F5).
  treble: 5 * 7 + 3,
  // Bassschlüssel: oberste Linie ist a (A3).
  bass: 3 * 7 + 5,
};

export interface StaveGeometry {
  stave: Stave;
  clef: 'treble' | 'bass';
}

export interface RenderedScore {
  svg: SVGSVGElement;
  width: number;
  height: number;
  /** Ein Eintrag je Takt (bei clef==='grand' das obere System). */
  staves: StaveGeometry[];
  /** Unteres System, nur bei clef==='grand'. */
  bassStaves: StaveGeometry[];
  /** Gezeichnete Noten je Takt — für Treffererkennung im Eingabe-Widget. */
  notes: DrawnNote[][];
}

// ---------------------------------------------------------------------------
// Geometrie
// ---------------------------------------------------------------------------

/** y-Pixel für eine Tonhöhe auf diesem System. */
export function yForPitch(geometry: StaveGeometry, pitch: Pitch): number {
  const line = (TOP_LINE_DIATONIC[geometry.clef] - diatonicIndex(pitch)) / 2;
  return geometry.stave.getYForLine(line);
}

/** y-Pixel für eine diatonische Position (ohne Vorzeichen). */
export function yForDiatonic(geometry: StaveGeometry, diatonic: number): number {
  return geometry.stave.getYForLine((TOP_LINE_DIATONIC[geometry.clef] - diatonic) / 2);
}

/**
 * Umkehrung: welcher Stammton liegt an diesem y-Pixel? Wird auf die nächste
 * Linie oder den nächsten Zwischenraum gerundet.
 */
export function diatonicForY(geometry: StaveGeometry, y: number): number {
  const spacing = geometry.stave.getSpacingBetweenLines();
  const halfLines = (y - geometry.stave.getYForLine(0)) / (spacing / 2);
  return TOP_LINE_DIATONIC[geometry.clef] - Math.round(halfLines);
}

/** Diatonischen Index in Stammton und Oktave zerlegen. */
export function diatonicToStep(diatonic: number): { step: Step; octave: number } {
  return {
    step: STEPS[((diatonic % 7) + 7) % 7],
    octave: Math.floor(diatonic / 7),
  };
}

/** Wie weit darf die Eingabe über das System hinausgehen? (Hilfslinien) */
export const LEDGER_RANGE = 6;

// ---------------------------------------------------------------------------
// Zeichnen
// ---------------------------------------------------------------------------

/**
 * Gezeichnete Notenobjekte. GhostNote belegt Platz und zeichnet nur die
 * Annotation, GlyphNote zeichnet ein einzelnes Zeichen. Alle drei stellen
 * getAbsoluteX() bereit, worauf die Treffererkennung aufbaut.
 */
export type DrawnNote = StaveNote | GhostNote | GlyphNote;

/**
 * SMuFL-Zeichen der frei setzbaren Vorzeichen. VexFlow exportiert seine
 * `Glyphs`-Aufzählung nicht über den Paketeinstieg, deshalb hier die
 * Codepunkte direkt — es sind die Standardwerte aus der SMuFL-Spezifikation
 * (accidentalFlat, accidentalNatural, accidentalSharp).
 */
const ACCIDENTAL_GLYPHS = {
  flat: '',
  natural: '',
  sharp: '',
} as const;

/**
 * Versetzungen, die im laufenden Takt schon stehen: Stammton und Oktave →
 * Versetzung. Ein Vorzeichen gilt bis zum Taktende; ein Stammton an derselben
 * Stelle braucht danach ein Auflösungszeichen (es¹ gesetzt, e¹ als Lösung
 * daneben).
 */
type MeasureAlters = Map<string, number>;

function buildNote(spec: NoteSpec, clef: 'treble' | 'bass', alters: MeasureAlters = new Map()): DrawnNote {
  if (spec.glyph) {
    // GlyphNote zeichnet genau ein Zeichen auf einer Notenlinie — ohne
    // Notenkopf, ohne Hals. Die Zeile ergibt sich aus der Tonhöhe.
    const pitch = parsePitch(spec.keys?.[0] ?? 'b4');
    const line = (TOP_LINE_DIATONIC[clef] - diatonicIndex(pitch)) / 2;
    const glyphNote = new GlyphNote(ACCIDENTAL_GLYPHS[spec.glyph], { duration: spec.duration }, { line });
    if (spec.preview) glyphNote.setStyle(PREVIEW_STYLE);
    if (spec.mark) {
      const colour = spec.mark === 'correct' ? CORRECT_COLOUR : WRONG_COLOUR;
      glyphNote.setStyle({ fillStyle: colour, strokeStyle: colour });
    }
    return glyphNote;
  }

  if (spec.placeholder) {
    // Leerstelle: nimmt Platz ein, zeigt nur die Annotation. So verrät der
    // Platzhalter den gesuchten Notenwert nicht.
    const ghost = new GhostNote({ duration: spec.duration });
    if (spec.annotation) {
      ghost.addModifier(
        new Annotation(spec.annotation).setVerticalJustification(Annotation.VerticalJustify.TOP),
      );
    }
    return ghost;
  }

  const isRest = spec.rest || !spec.keys?.length;
  const own = (spec.keys ?? []).map(parsePitch);
  /** Färbung je eigenem Kopf (`keyMarks`), nach Tonhöhe samt Schreibweise. */
  const headMarks = new Map(
    own.map((pitch, index) => [`${pitch.step}${pitch.alter}/${pitch.octave}`, spec.keyMarks?.[index]] as const),
  );
  // Vorschau-Köpfe hängen an derselben Note, damit sie an der richtigen
  // x-Position sitzen; eingefärbt werden sie einzeln.
  const extra = (spec.previewKeys ?? []).map(parsePitch);
  const pitches = [...own, ...extra].sort((a, b) => midi(a) - midi(b));

  const note = new StaveNote({
    // Pausen werden auf der mittleren Linie gesetzt; das ist die übliche Lage.
    keys: isRest ? [clef === 'bass' ? 'd/3' : 'b/4'] : pitches.map(toVexKey),
    duration: isRest ? `${spec.duration}r` : spec.duration,
    clef,
    autoStem: true,
  });

  if (!isRest) {
    pitches.forEach((pitch, index) => {
      const glyph = accidentalGlyph(pitch.alter);
      // Auflösungszeichen nur setzen, wenn es wirklich gebraucht wird —
      // ein ♮ vor jeder Stammtonnote wäre falscher Notensatz. Gebraucht wird
      // es, wenn an derselben Stelle im Takt vorher ein Vorzeichen stand.
      const earlier = alters.get(`${pitch.step}${pitch.octave}`) ?? 0;
      const headMark = headMarks.get(`${pitch.step}${pitch.alter}/${pitch.octave}`);
      const headStyle = headMark
        ? { fillStyle: headMark === 'correct' ? CORRECT_COLOUR : WRONG_COLOUR, strokeStyle: headMark === 'correct' ? CORRECT_COLOUR : WRONG_COLOUR }
        : null;
      if (glyph && (pitch.alter !== 0 || earlier !== 0)) {
        const accidental = new Accidental(glyph);
        // Das Vorzeichen gehört zum Ton: es trägt dieselbe Farbe wie sein Kopf.
        if (headStyle) accidental.setStyle(headStyle);
        note.addModifier(accidental, index);
      }
      // Nur die Vorschau-Köpfe einfärben, die vorhandenen bleiben schwarz.
      if (extra.some((p) => midi(p) === midi(pitch) && p.step === pitch.step)) {
        note.setKeyStyle(index, PREVIEW_STYLE);
      } else if (headStyle) {
        note.setKeyStyle(index, headStyle);
      }
    });
    // Was im Takt gilt, bestimmen nur die gesetzten Töne, keine Vorschau.
    if (!spec.preview) for (const pitch of own) alters.set(`${pitch.step}${pitch.octave}`, pitch.alter);
  }

  if (spec.dotted) Dot.buildAndAttach([note], { all: true });

  if (spec.annotation) {
    note.addModifier(
      new Annotation(spec.annotation).setVerticalJustification(Annotation.VerticalJustify.TOP),
    );
  }

  if (spec.highlight) {
    note.setStyle({ fillStyle: HIGHLIGHT_COLOUR, strokeStyle: HIGHLIGHT_COLOUR });
  }
  if (spec.muted) {
    note.setStyle({ fillStyle: MUTED_COLOUR, strokeStyle: MUTED_COLOUR });
  }
  if (spec.preview) {
    note.setStyle(PREVIEW_STYLE);
  }
  if (spec.mark) {
    const colour = spec.mark === 'correct' ? CORRECT_COLOUR : WRONG_COLOUR;
    note.setStyle({ fillStyle: colour, strokeStyle: colour });
  }
  return note;
}

/** Rückmeldung nach dem Prüfen — dieselben Farben wie --good / --bad. */
export const CORRECT_COLOUR = '#00d903';
export const WRONG_COLOUR = '#b3261e';

/** Farbe für vorgegebene Töne, die der Prüfling nicht ändern darf. */
export const HIGHLIGHT_COLOUR = '#1d6fa5';
/** Farbe für selbst gesetzte Noten. */
export const INPUT_COLOUR = '#111827';
/** Farbe für Platzhalter, die noch auszufüllen sind. */
export const MUTED_COLOUR = '#b0b7c3';
/**
 * Anzeigegrösse gegenüber der Zeichengrösse. VexFlow zeichnet ein System mit
 * 10 px Linienabstand — gut für ein Prüfungsblatt, zu klein zum Üben auf dem
 * Telefon. Das SVG wird deshalb vergrössert angezeigt (höchstens so breit wie
 * der Platz). Koordinaten rechnet `toScoreCoordinates` über das viewBox um,
 * die Noteneingabe bleibt also genau.
 */
export const SCORE_SCALE = 1.5;

/** Vorschau unter dem Mauszeiger: erkennbar, aber klar als «noch nicht gesetzt». */
const PREVIEW_STYLE = { fillStyle: '#5aa9dd', strokeStyle: '#5aa9dd' };

/**
 * VexFlow reserviert oberhalb der obersten Notenlinie Platz (Vorgabe
 * spaceAboveStaffLn = 4 Linienabstände). Die y-Angabe an `new Stave()` ist
 * also NICHT die oberste Linie. Wird das übersehen, ragen tiefe Noten unten
 * aus dem SVG heraus und werden abgeschnitten.
 *
 * Statt den Wert fest zu verdrahten, messen wir ihn einmal an einem Wegwerf-
 * System — so bleibt die Rechnung auch nach einem VexFlow-Update richtig.
 */
let measuredLineOffset: number | null = null;
function staveLineOffset(): number {
  if (measuredLineOffset === null) measuredLineOffset = new Stave(0, 0, 100).getYForLine(0);
  return measuredLineOffset;
}

/** Höhe der fünf Notenlinien selbst. */
const STAFF_HEIGHT = 40;
/** Luft unterhalb für Hilfslinien und tiefe Noten. */
const SPACE_BELOW = 46;
/** Abstand zwischen den beiden Systemen des Klaviersystems. */
const GRAND_GAP = 62;
/** Breite pro Zeichen bei `tightSpacing` — so eng wie ein echtes Vorzeichen. */
const TIGHT_GLYPH_WIDTH = 13;

interface LayoutMetrics {
  prefix: number;
  measureWidth: number;
  staveTop: number;
  /** y-Wert, den das untere System bekommt (nur beim Klaviersystem). */
  bassTop: number;
  height: number;
  /** Linker Rand — beim Klaviersystem muss die Klammer hineinpassen. */
  left: number;
}

function computeLayout(spec: ScoreSpec, width: number): LayoutMetrics {
  const accidentalCount = spec.keySignature ? Math.min(7, spec.keySignature.length + 1) : 0;
  const prefix =
    (spec.hideClef ? 0 : 34) +
    (spec.keySignature && spec.keySignature !== 'C' ? 10 + accidentalCount * 11 : 0) +
    (spec.timeSignature ? 26 : 0);

  // Ohne diesen Rand schneidet das SVG die geschweifte Klammer links ab.
  const left = spec.clef === 'grand' ? 18 : 6;

  const usable = Math.max(60, width - prefix - left - 8);
  const measureWidth = usable / Math.max(1, spec.measures.length);

  const offset = staveLineOffset();
  const space = spec.space ?? { above: offset, below: SPACE_BELOW };
  // Die oberste Linie soll bei `space.above` liegen; VexFlow setzt sie
  // `offset` unter die y-Angabe des Systems. Bei wenig Platz oben wird diese
  // Angabe also negativ — das ist gewollt.
  const staveTop = space.above - offset;

  // Oberste Linie des oberen Systems liegt bei `staveTop + offset`, die
  // unterste STAFF_HEIGHT tiefer. Das untere System soll mit seiner obersten
  // Linie GRAND_GAP darunter beginnen — und bringt seinen eigenen Versatz mit.
  const bassTop = staveTop + STAFF_HEIGHT + GRAND_GAP;

  const lowestLine = (spec.clef === 'grand' ? bassTop : staveTop) + offset + STAFF_HEIGHT;
  const height = lowestLine + space.below;

  return { prefix, measureWidth, staveTop, bassTop, height, left };
}

function drawSystem(
  context: ReturnType<Renderer['getContext']>,
  spec: ScoreSpec,
  measures: MeasureSpec[],
  clef: 'treble' | 'bass',
  pick: (m: MeasureSpec) => NoteSpec[],
  layout: LayoutMetrics,
  top: number,
): { staves: StaveGeometry[]; notes: DrawnNote[][] } {
  const staves: StaveGeometry[] = [];
  const notes: DrawnNote[][] = [];

  let x = layout.left;
  measures.forEach((measure, index) => {
    const isFirst = index === 0;
    const width = layout.measureWidth + (isFirst ? layout.prefix : 0);
    const stave = new Stave(x, top, width);

    if (isFirst) {
      if (!spec.hideClef) stave.addClef(clef);
      if (spec.keySignature && spec.keySignature !== 'C') stave.addKeySignature(spec.keySignature);
      if (spec.timeSignature) stave.addTimeSignature(spec.timeSignature);
    }

    if (spec.endBar && index === measures.length - 1) stave.setEndBarType(Barline.type.END);

    stave.setContext(context).draw();
    staves.push({ stave, clef });

    const specs = pick(measure);
    const alters: MeasureAlters = new Map();
    const built = specs.map((n) => buildNote(n, clef, alters));
    notes.push(built);

    if (built.length > 0) {
      // Eine Stimme ohne Taktprüfung: unvollständige Takte sind während der
      // Eingabe der Normalfall und dürfen den Notensatz nicht sprengen.
      const voice = new Voice({ numBeats: 4, beatValue: 4 }).setStrict(false).addTickables(built);
      // Bei `tightSpacing` gerade so viel Platz, wie die Zeichen brauchen —
      // sonst verteilt der Formatierer sie über die ganze Taktbreite.
      const available = spec.tightSpacing
        ? TIGHT_GLYPH_WIDTH * built.length
        : Math.max(30, width - (isFirst ? layout.prefix + 20 : 20));
      new Formatter().joinVoices([voice]).format([voice], available);
      voice.draw(context, stave);
    }

    x += width;
  });

  return { staves, notes };
}

/**
 * Zeichnet ein Notenbild in den Container. Vorhandener Inhalt wird ersetzt,
 * damit der Aufruf bei jeder Zustandsänderung wiederholt werden kann.
 */
export function renderScore(container: HTMLDivElement, spec: ScoreSpec): RenderedScore {
  container.replaceChildren();

  const width = spec.width ?? 600;
  const layout = computeLayout(spec, width);

  const renderer = new Renderer(container, Renderer.Backends.SVG);
  renderer.resize(width, layout.height);
  const context = renderer.getContext();

  let staves: StaveGeometry[];
  let bassStaves: StaveGeometry[] = [];
  let notes: DrawnNote[][];

  if (spec.clef === 'grand') {
    const upper = drawSystem(
      context, spec, spec.measures, 'treble', (m) => m.notes, layout, layout.staveTop,
    );
    const lower = drawSystem(
      context, spec, spec.measures, 'bass', (m) => m.bass ?? [], layout, layout.bassTop,
    );

    // Klammer und durchgehender Strich verbinden die beiden Systeme.
    const first = upper.staves[0].stave;
    const firstBass = lower.staves[0].stave;
    new StaveConnector(first, firstBass).setType('brace').setContext(context).draw();
    new StaveConnector(first, firstBass).setType('singleLeft').setContext(context).draw();

    staves = upper.staves;
    bassStaves = lower.staves;
    notes = upper.notes;
  } else {
    const drawn = drawSystem(
      context, spec, spec.measures, spec.clef, (m) => m.notes, layout, layout.staveTop,
    );
    staves = drawn.staves;
    notes = drawn.notes;
  }

  const svg = container.querySelector('svg') as SVGSVGElement;

  // Grundfarbe als Attribut am Wurzelelement: sie vererbt sich an alle
  // Zeichen, und gefärbte Gruppen (markierte Note, Vorschau) übersteuern sie.
  // Nötig, weil Moodle-Themes sonst durchfärben könnten — aber eben als
  // Attribut, nicht als CSS-Regel, sonst gäbe es keine farbigen Noten mehr.
  svg.setAttribute('fill', INPUT_COLOUR);
  svg.setAttribute('stroke', INPUT_COLOUR);

  // Ohne diese Attribute skaliert das Bild auf schmalen Bildschirmen nicht mit.
  svg.setAttribute('viewBox', `0 0 ${width} ${layout.height}`);
  svg.setAttribute('preserveAspectRatio', 'xMinYMid meet');
  // Feste Breite, die nur schrumpft, wo der Platz fehlt. Nicht umgekehrt
  // (width: 100% mit max-width): in einer Flex-Zeile wie .task-visual hat das
  // Bild dann keine eigene Breite, und der Browser nimmt für ein SVG ohne
  // Breitenangabe 300 px an — grössere Notenbilder blieben still bei 300.
  svg.removeAttribute('width');
  svg.removeAttribute('height');
  svg.style.width = `${Math.round(width * (spec.scale ?? SCORE_SCALE))}px`;
  svg.style.maxWidth = '100%';
  svg.style.height = 'auto';

  return { svg, width, height: layout.height, staves, bassStaves, notes };
}

/**
 * Mitte des Notenkopfs in SVG-Koordinaten.
 *
 * Nicht dasselbe wie getAbsoluteX(): das ist der Ankerpunkt der Note und liegt
 * VOR einem allfälligen Vorzeichen. Wer damit Markierungen ausrichtet, trifft
 * bei Noten mit Vorzeichen daneben.
 */
export function noteHeadCentre(note: DrawnNote): number {
  const candidate = note as Partial<StaveNote>;
  if (typeof candidate.getNoteHeadBeginX === 'function' && typeof candidate.getNoteHeadEndX === 'function') {
    return (candidate.getNoteHeadBeginX() + candidate.getNoteHeadEndX()) / 2;
  }
  return note.getAbsoluteX();
}

/**
 * Wandelt ein Pointer-Ereignis in Koordinaten des SVG-Systems um. Nötig, weil
 * das SVG responsiv skaliert wird und Client-Pixel nicht mehr passen.
 */
export function toScoreCoordinates(
  svg: SVGSVGElement,
  event: { clientX: number; clientY: number },
): { x: number; y: number } | null {
  const rect = svg.getBoundingClientRect();
  // Ein abgehängtes oder noch nicht ausgemessenes SVG liefert ein Rechteck der
  // Grösse null. Ohne diese Prüfung entstünde daraus eine Division durch null
  // und damit eine Note an einer Fantasieposition.
  if (rect.width === 0 || rect.height === 0) return null;

  const viewBox = svg.viewBox.baseVal;
  return {
    x: (event.clientX - rect.left) * (viewBox.width / rect.width),
    y: (event.clientY - rect.top) * (viewBox.height / rect.height),
  };
}
