/* Herkunft: musiktheorie-scorm/src/music/theory.ts (Stand 2026-08-21), über das Projekt «training».
   Wird hier eigenständig weitergeführt; es gibt keinen Abgleich mit dem Original mehr. */
/**
 * Musiktheorie-Kern nach deutscher/schweizerischer Konvention.
 *
 * Wichtig für alle Beitragenden:
 *  - Intern werden ENGLISCHE Stammtonbuchstaben (c d e f g a b) verwendet, weil
 *    VexFlow diese erwartet. `b` ist also der siebte Stammton = deutsch «H».
 *  - Nach aussen (Anzeige, Antwortvergleich) gilt deutsch: C D E F G A H,
 *    und «B» bezeichnet das erniedrigte H.
 *  - Oktavlagen intern wissenschaftlich (C4 = eingestrichenes c), angezeigt
 *    deutsch (c1). Die Vorlage schreibt «Startton g1» → G4.
 *  - Schweizer Rechtschreibung: durchgehend «ss», nie «ß».
 */

export type Step = 'c' | 'd' | 'e' | 'f' | 'g' | 'a' | 'b';

export interface Pitch {
  /** Stammton, englische Schreibweise. `b` = deutsch H. */
  step: Step;
  /** Versetzung in Halbtönen: -2 = Doppel-b, -1 = b, 0 = ohne, 1 = Kreuz, 2 = Doppelkreuz. */
  alter: number;
  /** Wissenschaftliche Oktave: 4 = eingestrichene Oktave (C4 = mittleres C). */
  octave: number;
}

export const STEPS: Step[] = ['c', 'd', 'e', 'f', 'g', 'a', 'b'];

/** Diatonischer Index innerhalb der Oktave: c=0 … b=6. */
export function stepIndex(step: Step): number {
  return STEPS.indexOf(step);
}

/** Halbtöne vom c aus für den unveränderten Stammton. */
const STEP_SEMITONES: Record<Step, number> = {
  c: 0,
  d: 2,
  e: 4,
  f: 5,
  g: 7,
  a: 9,
  b: 11,
};

/** Absolute MIDI-Nummer. C4 (eingestrichenes c) = 60. */
export function midi(p: Pitch): number {
  return (p.octave + 1) * 12 + STEP_SEMITONES[p.step] + p.alter;
}

/** Fortlaufende diatonische Position; braucht man für Intervallgrössen. */
export function diatonicIndex(p: Pitch): number {
  return p.octave * 7 + stepIndex(p.step);
}

/** Der Stammton an einer diatonischen Position — Umkehrung von `diatonicIndex()`. */
export function naturalAt(index: number): Pitch {
  return { step: STEPS[((index % 7) + 7) % 7], alter: 0, octave: Math.floor(index / 7) };
}

/**
 * Einen Halbton höher oder tiefer, geschrieben wie in Notensatzprogrammen:
 * auf dem Stammton, wo es einen gibt, sonst aufwärts mit Kreuz und abwärts
 * mit b. Aufwärts also c → cis → d → dis → e → f, abwärts e → es → d → des
 * → c → h → b.
 */
export function semitoneStep(p: Pitch, direction: 1 | -1): Pitch {
  const target = midi(p) + direction;
  // Auch ein doppelt versetzter Ton liegt höchstens zwei Stufen neben seinem
  // Klang; drei Stufen nach jeder Seite reichen also immer.
  const here = diatonicIndex(p);
  const naturals = [-3, -2, -1, 0, 1, 2, 3].map((offset) => naturalAt(here + offset));
  const natural = naturals.find((n) => midi(n) === target);
  if (natural) return natural;
  // Zwischen zwei Stammtönen liegt höchstens ein Halbton. Ist das Ziel keiner,
  // sind beide Nachbarn Stammtöne.
  const neighbour = naturals.find((n) => midi(n) === target - direction)!;
  return { ...neighbour, alter: direction };
}

/**
 * Der Ton mit diesem Stammton, der `reference` am nächsten liegt — gezählt in
 * Stufen, also höchstens eine Quarte entfernt (wie der relative Modus von
 * LilyPond). Bei gleichem Abstand gewinnt die Quarte aufwärts.
 */
export function nearestWithStep(step: Step, alter: number, reference: Pitch): Pitch {
  const from = diatonicIndex(reference);
  const up = (((stepIndex(step) - from) % 7) + 7) % 7;
  const index = from + (up > 3 ? up - 7 : up);
  return { step, alter, octave: Math.floor(index / 7) };
}

// ---------------------------------------------------------------------------
// Deutsche Tonnamen
// ---------------------------------------------------------------------------

const GERMAN_BASE: Record<Step, string> = {
  c: 'C',
  d: 'D',
  e: 'E',
  f: 'F',
  g: 'G',
  a: 'A',
  b: 'H',
};

/**
 * Deutscher Tonname ohne Oktavangabe, z.B. «Fis», «Es», «B», «H».
 * Die Ausnahmen (Es statt Ees, As statt Aes, B statt Hes) sind die Stellen,
 * an denen sich englische Logik am häufigsten einschleicht.
 */
export function germanNoteName(step: Step, alter: number): string {
  const base = GERMAN_BASE[step];
  if (alter === 0) return base;

  if (alter > 0) {
    // Kreuze: an den Stammton wird je Kreuz «is» angehängt.
    return base + 'is'.repeat(alter);
  }

  // Erniedrigungen mit ihren stehenden Sonderformen.
  const singleFlat: Record<Step, string> = {
    c: 'Ces',
    d: 'Des',
    e: 'Es',
    f: 'Fes',
    g: 'Ges',
    a: 'As',
    b: 'B',
  };
  const doubleFlat: Record<Step, string> = {
    c: 'Ceses',
    d: 'Deses',
    e: 'Eses',
    f: 'Feses',
    g: 'Geses',
    a: 'Ases',
    b: 'Heses',
  };
  if (alter === -1) return singleFlat[step];
  if (alter === -2) return doubleFlat[step];
  return singleFlat[step] + 'es'.repeat(-alter - 1);
}

/**
 * Vollständige deutsche Tonbezeichnung inklusive Oktavlage:
 * C4 → «c1», G4 → «g1», C3 → «c», C2 → «C», C1 → «C,», C5 → «c2».
 */
export function toGermanPitch(p: Pitch): string {
  const name = germanNoteName(p.step, p.alter);
  if (p.octave >= 4) return name.toLowerCase() + String(p.octave - 3);
  if (p.octave === 3) return name.toLowerCase();
  if (p.octave === 2) return name;
  return name + ','.repeat(2 - p.octave);
}

/** Schlüssel im VexFlow-Format, z.B. «c/4». Die Versetzung wird separat gesetzt. */
export function toVexKey(p: Pitch): string {
  return `${p.step}/${p.octave}`;
}

/** VexFlow-Kürzel für ein Vorzeichen, oder null wenn keines nötig ist. */
export function accidentalGlyph(alter: number): string | null {
  switch (alter) {
    case -2:
      return 'bb';
    case -1:
      return 'b';
    case 0:
      return 'n';
    case 1:
      return '#';
    case 2:
      return '##';
    default:
      return null;
  }
}

/**
 * Liest eine kompakte Tonangabe wie «g4», «fis4», «b3», «c#5».
 * Akzeptiert sowohl die deutsche («fis», «es», «b») als auch die
 * englisch-wissenschaftliche Schreibweise («f#», «eb»), damit exam.json
 * bequem zu schreiben bleibt. Die Oktave ist immer wissenschaftlich.
 */
export function parsePitch(text: string): Pitch {
  const m = /^([a-hA-H])(is|es|s|##|bb|#|b|x)?(-?\d+)$/.exec(text.trim());
  if (!m) throw new Error(`Ungültige Tonangabe: «${text}»`);

  const letter = m[1].toLowerCase();
  const suffix = (m[2] ?? '').toLowerCase();
  const octave = Number(m[3]);

  // Deutsches «h» ist der englische Stammton «b».
  let step = (letter === 'h' ? 'b' : letter) as Step;
  let alter = 0;

  switch (suffix) {
    case '':
      // «b3» ohne Suffix ist zweideutig. Wir lesen es als englisches b (= H),
      // weil exam.json wissenschaftlich notiert; deutsches B schreibt man «hes3».
      break;
    case 'is':
    case '#':
      alter = 1;
      break;
    case '##':
    case 'x':
      alter = 2;
      break;
    case 'es':
    case 's':
    case 'b':
      alter = -1;
      break;
    case 'bb':
      alter = -2;
      break;
  }

  // «es» und «as» sind die deutschen Kurzformen; «s» deckt genau diese ab.
  if (suffix === 's' && !(letter === 'e' || letter === 'a')) {
    throw new Error(`Ungültige Tonangabe: «${text}»`);
  }
  if (!STEPS.includes(step)) throw new Error(`Ungültige Tonangabe: «${text}»`);
  step = step as Step;

  return { step, alter, octave };
}

// ---------------------------------------------------------------------------
// Intervalle
// ---------------------------------------------------------------------------

/** r = rein, k = klein, g = gross, v = vermindert, ü = übermässig. */
export type IntervalQuality = 'r' | 'k' | 'g' | 'v' | 'ü';

export interface Interval {
  quality: IntervalQuality;
  /** Ordnungszahl 1–8 (Prime bis Oktave). */
  number: number;
}

/** Die Ordnungszahlen mit «reiner» statt «grosser/kleiner» Qualität. */
const PERFECT_NUMBERS = new Set([1, 4, 5, 8]);

/** Halbtöne der reinen bzw. grossen Form je Ordnungszahl. */
const REFERENCE_SEMITONES: Record<number, number> = {
  1: 0,
  2: 2,
  3: 4,
  4: 5,
  5: 7,
  6: 9,
  7: 11,
  8: 12,
};

export function isPerfectNumber(n: number): boolean {
  return PERFECT_NUMBERS.has(n);
}

/**
 * Bestimmt das Intervall zwischen zwei Tönen. Die Richtung ist egal —
 * gemessen wird immer vom tieferen zum höheren Ton.
 */
export function intervalBetween(a: Pitch, b: Pitch): Interval {
  const [low, high] = midi(a) <= midi(b) ? [a, b] : [b, a];

  const number = diatonicIndex(high) - diatonicIndex(low) + 1;
  const semitones = midi(high) - midi(low);

  const reference = REFERENCE_SEMITONES[number];
  if (reference === undefined) {
    throw new Error(`Intervall ausserhalb des geprüften Bereichs (Ordnungszahl ${number})`);
  }

  const diff = semitones - reference;
  return { quality: qualityFromDiff(number, diff), number };
}

function qualityFromDiff(number: number, diff: number): IntervalQuality {
  if (isPerfectNumber(number)) {
    if (diff === 0) return 'r';
    if (diff === 1) return 'ü';
    if (diff === -1) return 'v';
  } else {
    if (diff === 0) return 'g';
    if (diff === -1) return 'k';
    if (diff === 1) return 'ü';
    if (diff === -2) return 'v';
  }
  throw new Error(`Kein benanntes Intervall: Ordnungszahl ${number}, Abweichung ${diff} Halbtöne`);
}

function diffFromQuality(number: number, quality: IntervalQuality): number {
  if (isPerfectNumber(number)) {
    switch (quality) {
      case 'r':
        return 0;
      case 'ü':
        return 1;
      case 'v':
        return -1;
      default:
        throw new Error(`Eine ${number} kann nicht «${quality}» sein — nur r, v oder ü.`);
    }
  }
  switch (quality) {
    case 'g':
      return 0;
    case 'k':
      return -1;
    case 'ü':
      return 1;
    case 'v':
      return -2;
    default:
      throw new Error(`Eine ${number} kann nicht «${quality}» sein — nur k, g, v oder ü.`);
  }
}

/** Kurzschreibweise wie in der Vorlage: «g3», «k7», «ü4». */
export function intervalLabel(iv: Interval): string {
  return `${iv.quality}${iv.number}`;
}

export function parseIntervalLabel(text: string): Interval {
  const m = /^([rkgvü])\s*([1-8])$/.exec(text.trim());
  if (!m) throw new Error(`Ungültige Intervallangabe: «${text}»`);
  return { quality: m[1] as IntervalQuality, number: Number(m[2]) };
}

/** Ausgeschriebener Name für die Auswertungsseite, z.B. «kleine Septime». */
export function intervalFullName(iv: Interval): string {
  const numbers = [
    '',
    'Prime',
    'Sekunde',
    'Terz',
    'Quarte',
    'Quinte',
    'Sexte',
    'Septime',
    'Oktave',
  ];
  const qualities: Record<IntervalQuality, string> = {
    r: 'reine',
    k: 'kleine',
    g: 'grosse',
    v: 'verminderte',
    ü: 'übermässige',
  };
  return `${qualities[iv.quality]} ${numbers[iv.number]}`;
}

/**
 * Konstruiert den Zielton eines Intervalls über oder unter einem Startton.
 * Wird sowohl für Musterlösungen als auch für die Bewertung gebraucht.
 */
export function transposeByInterval(
  from: Pitch,
  iv: Interval,
  direction: 'up' | 'down' = 'up',
): Pitch {
  const sign = direction === 'up' ? 1 : -1;
  const targetDiatonic = diatonicIndex(from) + sign * (iv.number - 1);
  const step = STEPS[((targetDiatonic % 7) + 7) % 7];
  const octave = Math.floor(targetDiatonic / 7);

  const targetMidi = midi(from) + sign * (REFERENCE_SEMITONES[iv.number] + diffFromQuality(iv.number, iv.quality));
  const natural = (octave + 1) * 12 + STEP_SEMITONES[step];

  return { step, alter: targetMidi - natural, octave };
}

// ---------------------------------------------------------------------------
// Dreiklänge
// ---------------------------------------------------------------------------

export type TriadQuality = 'dur' | 'moll' | 'vermindert' | 'uebermaessig';

export const TRIAD_LABELS: Record<TriadQuality, string> = {
  dur: 'Dur',
  moll: 'moll',
  vermindert: 'vermindert',
  uebermaessig: 'übermässig',
};

/** Umkehrung, benannt nach dem Basston. */
export type Inversion = 'grundstellung' | 'sextakkord' | 'quartsextakkord';

export const INVERSION_LABELS: Record<Inversion, string> = {
  grundstellung: 'Grundstellung',
  sextakkord: 'Sextakkord',
  quartsextakkord: 'Quartsextakkord',
};

/** Lage, benannt nach dem obersten Ton. */
export type Position = 'oktavlage' | 'terzlage' | 'quintlage';

export const POSITION_LABELS: Record<Position, string> = {
  oktavlage: 'Oktavlage',
  terzlage: 'Terzlage',
  quintlage: 'Quintlage',
};

export interface TriadAnalysis {
  root: Pitch;
  quality: TriadQuality;
  inversion: Inversion;
  position: Position;
}

/** Terz- und Quintabstand in Halbtönen je Akkordgeschlecht. */
const TRIAD_INTERVALS: Record<TriadQuality, [number, number]> = {
  dur: [4, 7],
  moll: [3, 7],
  vermindert: [3, 6],
  uebermaessig: [4, 8],
};

/**
 * Analysiert einen Dreiklang aus beliebig verteilten Tönen (auch über zwei
 * Systeme hinweg, wie in der Vorlage). Verdopplungen sind erlaubt.
 * Liefert null, wenn die Töne keinen Dreiklang bilden.
 */
export function analyseTriad(pitches: Pitch[]): TriadAnalysis | null {
  if (pitches.length < 3) return null;

  const sorted = [...pitches].sort((x, y) => midi(x) - midi(y));
  const bass = sorted[0];
  const top = sorted[sorted.length - 1];

  // Auf drei verschiedene Tonklassen reduzieren; die tiefste Instanz vertritt sie.
  const unique: Pitch[] = [];
  for (const p of sorted) {
    const seen = unique.some(
      (q) => q.step === p.step && ((q.alter - p.alter) % 12 === 0),
    );
    if (!seen) unique.push(p);
  }
  if (unique.length !== 3) return null;

  for (const candidate of unique) {
    const others = unique.filter((p) => p !== candidate);

    // Die beiden übrigen Töne auf Terz- und Quintlage über dem Grundton bringen.
    const relative = others
      .map((p) => normaliseAbove(candidate, p))
      .sort((x, y) => x.semitones - y.semitones);

    const [third, fifth] = relative;
    if (third.diatonic !== 2 || fifth.diatonic !== 4) continue;

    const quality = (Object.keys(TRIAD_INTERVALS) as TriadQuality[]).find((q) => {
      const [t, f] = TRIAD_INTERVALS[q];
      return third.semitones === t && fifth.semitones === f;
    });
    if (!quality) continue;

    return {
      root: candidate,
      quality,
      inversion: chordMemberOf(candidate, bass, 'inversion') as Inversion,
      position: chordMemberOf(candidate, top, 'position') as Position,
    };
  }

  return null;
}

/** Abstand von `p` über `root`, in die erste Oktave darüber gefaltet. */
function normaliseAbove(root: Pitch, p: Pitch): { diatonic: number; semitones: number } {
  const diatonic = ((diatonicIndex(p) - diatonicIndex(root)) % 7 + 7) % 7;
  let semitones = ((midi(p) - midi(root)) % 12 + 12) % 12;
  // Eine übermässige Quinte (8 HT) hat diatonisch 4 — passt. Aber eine
  // verminderte Quinte darf nicht als übermässige Quarte durchgehen; die
  // diatonische Prüfung beim Aufrufer fängt das ab.
  if (diatonic === 0 && semitones !== 0) semitones = semitones > 6 ? semitones - 12 : semitones;
  return { diatonic, semitones };
}

/** Welches Akkordglied ist `note` bezogen auf `root`? */
function chordMemberOf(root: Pitch, note: Pitch, kind: 'inversion' | 'position'): string {
  const diatonic = ((diatonicIndex(note) - diatonicIndex(root)) % 7 + 7) % 7;
  if (kind === 'inversion') {
    if (diatonic === 0) return 'grundstellung';
    if (diatonic === 2) return 'sextakkord';
    return 'quartsextakkord';
  }
  if (diatonic === 0) return 'oktavlage';
  if (diatonic === 2) return 'terzlage';
  return 'quintlage';
}

/**
 * Kurzbezeichnung wie in der Vorlage: «fm⁶ 8» = f-moll Sextakkord in Oktavlage.
 * Dur wird gross, moll klein geschrieben.
 */
export function triadLabel(a: TriadAnalysis): string {
  const name = germanNoteName(a.root.step, a.root.alter);
  const root = a.quality === 'dur' || a.quality === 'uebermaessig' ? name : name.toLowerCase();
  const suffix: Record<TriadQuality, string> = {
    dur: '',
    moll: 'm',
    vermindert: '°',
    uebermaessig: '+',
  };
  const inv: Record<Inversion, string> = {
    grundstellung: '',
    sextakkord: '⁶',
    quartsextakkord: '⁶₄',
  };
  const pos: Record<Position, string> = {
    oktavlage: '8',
    terzlage: '3',
    quintlage: '5',
  };
  return `${root}${suffix[a.quality]}${inv[a.inversion]} ${pos[a.position]}`;
}

/** Baut einen Dreiklang in Grundstellung, eng, ab dem angegebenen Grundton. */
export function buildTriad(root: Pitch, quality: TriadQuality): Pitch[] {
  const thirdQuality: IntervalQuality =
    quality === 'dur' || quality === 'uebermaessig' ? 'g' : 'k';
  const fifthQuality: IntervalQuality =
    quality === 'vermindert' ? 'v' : quality === 'uebermaessig' ? 'ü' : 'r';
  return [
    root,
    transposeByInterval(root, { quality: thirdQuality, number: 3 }),
    transposeByInterval(root, { quality: fifthQuality, number: 5 }),
  ];
}

// ---------------------------------------------------------------------------
// Septakkorde
// ---------------------------------------------------------------------------

/**
 * Die fünf üblichen Septakkorde (Entscheid 2026-11-24): Dreiklang plus
 * Septime über dem Grundton. Die Werte stehen so im Link.
 */
export type SeventhQuality = 'dominant' | 'gross-dur' | 'klein-moll' | 'halbvermindert' | 'vermindert';

/** Ausgeschriebene Namen, wie in der Aufgabe: «Dominantseptakkord auf G». */
export const SEVENTH_LABELS: Record<SeventhQuality, string> = {
  dominant: 'Dominantseptakkord',
  'gross-dur': 'grosser Durseptakkord',
  'klein-moll': 'kleiner Mollseptakkord',
  halbvermindert: 'halbverminderter Septakkord',
  vermindert: 'verminderter Septakkord',
};

/** Akkordsymbol ohne Grundton: «G7», «Cmaj7», «Dm7», «Hm7♭5», «Cis°7». */
export const SEVENTH_SYMBOLS: Record<SeventhQuality, string> = {
  dominant: '7',
  'gross-dur': 'maj7',
  'klein-moll': 'm7',
  halbvermindert: 'm7♭5',
  vermindert: '°7',
};

/** Terz, Quinte und Septime über dem Grundton, in Halbtönen. */
export const SEVENTH_SEMITONES: Record<SeventhQuality, [number, number, number]> = {
  dominant: [4, 7, 10],
  'gross-dur': [4, 7, 11],
  'klein-moll': [3, 7, 10],
  halbvermindert: [3, 6, 10],
  vermindert: [3, 6, 9],
};

/** Umkehrung, benannt nach dem Basston: Grundton, Terz, Quinte, Septime. */
export type SeventhInversion = 'grundstellung' | 'quintsextakkord' | 'terzquartakkord' | 'sekundakkord';

export const SEVENTH_INVERSION_LABELS: Record<SeventhInversion, string> = {
  grundstellung: 'Grundstellung',
  quintsextakkord: 'Quintsextakkord',
  terzquartakkord: 'Terzquartakkord',
  sekundakkord: 'Sekundakkord',
};

/** Lage, benannt nach dem obersten Ton: Grundton, Terz, Quinte, Septime. */
export type SeventhPosition = 'oktavlage' | 'terzlage' | 'quintlage' | 'septlage';

export const SEVENTH_POSITION_LABELS: Record<SeventhPosition, string> = {
  oktavlage: 'Oktavlage',
  terzlage: 'Terzlage',
  quintlage: 'Quintlage',
  septlage: 'Septlage',
};

export interface SeventhAnalysis {
  root: Pitch;
  quality: SeventhQuality;
  inversion: SeventhInversion;
  position: SeventhPosition;
}

/**
 * Analysiert einen Septakkord aus beliebig verteilten Tönen, auch über zwei
 * Systeme hinweg; Verdopplungen sind erlaubt. Gezählt wird diatonisch und in
 * Halbtönen — die Schreibweise zählt: c e g ais ist kein Septakkord.
 * Liefert null, wenn die Töne keinen der fünf Septakkorde bilden.
 */
export function analyseSeventh(pitches: Pitch[]): SeventhAnalysis | null {
  if (pitches.length < 4) return null;

  const sorted = [...pitches].sort((x, y) => midi(x) - midi(y));
  const unique: Pitch[] = [];
  for (const p of sorted) {
    if (!unique.some((q) => q.step === p.step && q.alter === p.alter)) unique.push(p);
  }
  if (unique.length !== 4) return null;

  const memberOf = (root: Pitch, note: Pitch) => ((diatonicIndex(note) - diatonicIndex(root)) % 7 + 7) % 7;
  const inversions = Object.keys(SEVENTH_INVERSION_LABELS) as SeventhInversion[];
  const positions = Object.keys(SEVENTH_POSITION_LABELS) as SeventhPosition[];

  for (const candidate of unique) {
    const relative = unique
      .filter((p) => p !== candidate)
      .map((p) => normaliseAbove(candidate, p))
      .sort((x, y) => x.diatonic - y.diatonic);
    if (relative.map((r) => r.diatonic).join() !== '2,4,6') continue;

    const quality = (Object.keys(SEVENTH_SEMITONES) as SeventhQuality[]).find((q) =>
      SEVENTH_SEMITONES[q].every((semitones, index) => relative[index].semitones === semitones),
    );
    if (!quality) continue;

    return {
      root: candidate,
      quality,
      inversion: inversions[memberOf(candidate, sorted[0]) / 2],
      position: positions[memberOf(candidate, sorted[sorted.length - 1]) / 2],
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Tonarten
// ---------------------------------------------------------------------------

/** Reihenfolge der Kreuze: Fis Cis Gis Dis Ais Eis His. */
export const SHARP_ORDER: Step[] = ['f', 'c', 'g', 'd', 'a', 'e', 'b'];
/** Reihenfolge der b: B Es As Des Ges Ces Fes. */
export const FLAT_ORDER: Step[] = ['b', 'e', 'a', 'd', 'g', 'c', 'f'];

export interface KeyInfo {
  /** Deutscher Name der Durtonart, z.B. «Es-Dur». */
  major: string;
  /** Deutscher Name der parallelen Molltonart, z.B. «c-Moll». */
  minor: string;
  /** Positiv = Kreuze, negativ = b, 0 = keine Vorzeichen. */
  accidentals: number;
}

/**
 * Quintenzirkel von 7 b bis 7 Kreuzen. Die Molltonart ist jeweils die
 * PARALLELE (gleiche Vorzeichen), nicht die Varianttonart.
 */
export const CIRCLE_OF_FIFTHS: KeyInfo[] = [
  { major: 'Ces-Dur', minor: 'as-Moll', accidentals: -7 },
  { major: 'Ges-Dur', minor: 'es-Moll', accidentals: -6 },
  { major: 'Des-Dur', minor: 'b-Moll', accidentals: -5 },
  { major: 'As-Dur', minor: 'f-Moll', accidentals: -4 },
  { major: 'Es-Dur', minor: 'c-Moll', accidentals: -3 },
  { major: 'B-Dur', minor: 'g-Moll', accidentals: -2 },
  { major: 'F-Dur', minor: 'd-Moll', accidentals: -1 },
  { major: 'C-Dur', minor: 'a-Moll', accidentals: 0 },
  { major: 'G-Dur', minor: 'e-Moll', accidentals: 1 },
  { major: 'D-Dur', minor: 'h-Moll', accidentals: 2 },
  { major: 'A-Dur', minor: 'fis-Moll', accidentals: 3 },
  { major: 'E-Dur', minor: 'cis-Moll', accidentals: 4 },
  { major: 'H-Dur', minor: 'gis-Moll', accidentals: 5 },
  { major: 'Fis-Dur', minor: 'dis-Moll', accidentals: 6 },
  { major: 'Cis-Dur', minor: 'ais-Moll', accidentals: 7 },
];

export function keyByMajorName(name: string): KeyInfo {
  const found = CIRCLE_OF_FIFTHS.find((k) => k.major.toLowerCase() === name.trim().toLowerCase());
  if (!found) throw new Error(`Unbekannte Durtonart: «${name}»`);
  return found;
}

/**
 * Findet eine Tonart über ihren Dur- ODER Mollnamen, z.B. «Des-Dur» oder
 * «d-Moll». Nötig, weil in der Vorzeichenaufgabe beide Geschlechter vorkommen.
 */
export function keyByName(name: string): KeyInfo {
  const needle = name.trim().toLowerCase();
  const found = CIRCLE_OF_FIFTHS.find(
    (k) => k.major.toLowerCase() === needle || k.minor.toLowerCase() === needle,
  );
  if (!found) throw new Error(`Unbekannte Tonart: «${name}»`);
  return found;
}

/**
 * Die Stammtöne, die in dieser Tonart ein Vorzeichen tragen — in der
 * Reihenfolge, in der sie notiert werden müssen.
 */
export function keySignatureSteps(accidentals: number): { steps: Step[]; sign: 1 | -1 } {
  if (accidentals >= 0) return { steps: SHARP_ORDER.slice(0, accidentals), sign: 1 };
  return { steps: FLAT_ORDER.slice(0, -accidentals), sign: -1 };
}

/** VexFlow-Kürzel der Tonart, z.B. «Eb» für Es-Dur. Nur für die Anzeige. */
export function vexKeySignature(accidentals: number): string {
  const sharps = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#'];
  const flats = ['C', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb'];
  return accidentals >= 0 ? sharps[accidentals] : flats[-accidentals];
}

/** Die sieben Stammtöne einer Durtonleiter ab dem Grundton. */
export function majorScale(tonic: Pitch): Pitch[] {
  const pattern: Interval[] = [
    { quality: 'r', number: 1 },
    { quality: 'g', number: 2 },
    { quality: 'g', number: 3 },
    { quality: 'r', number: 4 },
    { quality: 'r', number: 5 },
    { quality: 'g', number: 6 },
    { quality: 'g', number: 7 },
  ];
  return pattern.map((iv) => transposeByInterval(tonic, iv));
}

/** Geschlecht der leitereigenen Dreiklänge einer Durtonart, Stufe I–VII. */
export const DIATONIC_TRIAD_QUALITIES: TriadQuality[] = [
  'dur',
  'moll',
  'moll',
  'dur',
  'dur',
  'moll',
  'vermindert',
];

export const ROMAN_NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

/** Funktionsnamen auf ihre Stufe abbilden (1-basiert). */
export const FUNCTION_DEGREES: Record<string, number> = {
  tonika: 1,
  subdominante: 4,
  dominante: 5,
};

/**
 * Löst Aufgaben vom Typ «Die IV. Stufe von C-Dur» bzw. «Die Dominante von
 * B-Dur» auf und liefert den vollständigen Akkordnamen, z.B. «F-Dur».
 */
export function degreeChordName(majorKeyName: string, degree: number): string {
  const key = keyByMajorName(majorKeyName);
  const tonicName = key.major.replace(/-Dur$/i, '');
  const tonic = tonicPitchFromName(tonicName);
  const scale = majorScale(tonic);
  const root = scale[degree - 1];
  const quality = DIATONIC_TRIAD_QUALITIES[degree - 1];
  const name = germanNoteName(root.step, root.alter);
  return quality === 'dur' ? `${name}-Dur` : quality === 'moll' ? `${name}-Moll` : `${name}-vermindert`;
}

/** Deutschen Tonnamen («Es», «Fis», «B», «H») in einen Pitch der Oktave 4 lesen. */
export function tonicPitchFromName(name: string): Pitch {
  const normalised = name.trim();
  for (const step of STEPS) {
    for (const alter of [0, 1, -1, 2, -2]) {
      if (germanNoteName(step, alter).toLowerCase() === normalised.toLowerCase()) {
        return { step, alter, octave: 4 };
      }
    }
  }
  throw new Error(`Unbekannter Tonname: «${name}»`);
}

// ---------------------------------------------------------------------------
// Notenwerte
// ---------------------------------------------------------------------------

/** VexFlow-Dauernkürzel, die im Test vorkommen. */
export type Duration = 'w' | 'h' | 'q' | '8' | '16';

export const DURATION_LABELS: Record<Duration, { note: string; rest: string }> = {
  w: { note: 'Ganze Note', rest: 'Ganze Pause' },
  h: { note: 'Halbe Note', rest: 'Halbe Pause' },
  q: { note: 'Viertelnote', rest: 'Viertelpause' },
  '8': { note: 'Achtelnote', rest: 'Achtelpause' },
  '16': { note: 'Sechzehntelnote', rest: 'Sechzehntelpause' },
};

/** Dauer in Vierteln. Eine punktierte Note ist das 1,5-fache. */
export function durationInQuarters(duration: Duration, dotted = false): number {
  const base: Record<Duration, number> = { w: 4, h: 2, q: 1, '8': 0.5, '16': 0.25 };
  return base[duration] * (dotted ? 1.5 : 1);
}

/** Wie viele Viertel fasst ein Takt der angegebenen Taktart? */
export function measureCapacity(timeSignature: string): number {
  const m = /^(\d+)\s*\/\s*(\d+)$/.exec(timeSignature.trim());
  if (!m) throw new Error(`Ungültige Taktart: «${timeSignature}»`);
  const beats = Number(m[1]);
  const unit = Number(m[2]);
  return (beats * 4) / unit;
}
