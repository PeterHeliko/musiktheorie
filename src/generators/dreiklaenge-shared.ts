/**
 * Dreiklänge — was die beiden Gruppen teilen: Akkordbau samt sus4, Namen,
 * Grundtöne, die Lage der Töne im System, auf der Klaviatur und beim Hören,
 * und die Einstellungen.
 *
 *  - Grundstellung (`dreiklaenge-grundstellung.ts`): drei Töne eng über dem
 *    Grundton. Gefragt ist das Geschlecht, sus4 lässt sich zuschalten.
 *  - Umkehrungen & Lagen (`dreiklaenge-umkehrungen.ts`): gefragt ist die
 *    Umkehrung (tiefster Ton), die Lage (höchster Ton) oder beides.
 *
 * Auf einem System stehen drei Töne eng. Dann folgt die Lage aus der
 * Umkehrung: Grundstellung = Quintlage, Sextakkord = Oktavlage,
 * Quartsextakkord = Terzlage. Erst mit einem abgesetzten Basston — im
 * zweiten System, als eigene Taste, als eigene Stimme — sind beide frei
 * (Entscheid 2026-11-24).
 *
 * Doppelvorzeichen kommen nirgends vor: Grundtöne, über denen ein Akkordton
 * eins bräuchte (übermässig über Fis, vermindert über Es …), fallen weg.
 */

import { OPTION_SETS } from '../content/options';
import type { ScoreSpec, SelectField, SelectOption, SingTask } from '../content/schema';
import { invertTriad } from '../content/audio';
import { staffSpace } from '../music/staff-space';
import {
  INVERSION_LABELS,
  POSITION_LABELS,
  STEPS,
  germanNoteName,
  intervalBetween,
  intervalLabel,
  midi,
  parseIntervalLabel,
  transposeByInterval,
  type Inversion,
  type Pitch,
  type Position,
  type Step,
  type TriadQuality,
} from '../music/theory';
import type { Rng } from './rng';
import { TOLERANCE_OPTIONS } from './intervalle-singen';
import { CLEF_OPTIONS, candidatePitches, insist, optionsFrom, pitchKey, type Window } from './shared';
import { multi, single, toggle, type FilterSpec, type FilterValues } from './types';

// ---------------------------------------------------------------------------
// Akkorde
// ---------------------------------------------------------------------------

/** Die vier Dreiklangsgeschlechter, dazu sus4: Quarte statt Terz. */
export type ChordQuality = TriadQuality | 'sus4';

export const TRIAD_QUALITIES: TriadQuality[] = ['dur', 'moll', 'vermindert', 'uebermaessig'];

/** Mittlerer und oberer Ton als Intervall über dem Grundton. */
const CHORD_INTERVALS: Record<ChordQuality, [string, string]> = {
  dur: ['g3', 'r5'],
  moll: ['k3', 'r5'],
  vermindert: ['k3', 'v5'],
  uebermaessig: ['g3', 'ü5'],
  sus4: ['r4', 'r5'],
};

/** Dieselben Abstände in Halbtönen — so sieht man sie auf der Klaviatur. */
export const CHORD_SEMITONES: Record<ChordQuality, [number, number]> = {
  dur: [4, 7],
  moll: [3, 7],
  vermindert: [3, 6],
  uebermaessig: [4, 8],
  sus4: [5, 7],
};

/** Grundton, mittlerer und oberer Ton, eng über dem Grundton. */
export function buildChord(root: Pitch, quality: ChordQuality): Pitch[] {
  const [middle, top] = CHORD_INTERVALS[quality];
  return [
    root,
    transposeByInterval(root, parseIntervalLabel(middle)),
    transposeByInterval(root, parseIntervalLabel(top)),
  ];
}

/**
 * Unabhängig nachgerechnet: welches Geschlecht bilden drei Töne in
 * Grundstellung? Gemessen mit `intervalBetween`, nicht gebaut — so fällt auf,
 * wenn `buildChord` sich verrechnet.
 */
export function qualityOfStack(stack: readonly Pitch[]): ChordQuality | null {
  if (stack.length !== 3) return null;
  const [root, middle, top] = stack;
  const measured = [intervalLabel(intervalBetween(root, middle)), intervalLabel(intervalBetween(root, top))];
  const found = (Object.keys(CHORD_INTERVALS) as ChordQuality[]).find(
    (quality) => CHORD_INTERVALS[quality][0] === measured[0] && CHORD_INTERVALS[quality][1] === measured[1],
  );
  return found ?? null;
}

/**
 * Name des Akkords, wie er über der Aufgabe steht: Dur und übermässig mit
 * grossem, moll und vermindert mit kleinem Anfangsbuchstaben, wie bei den
 * Tonarten. «D-Dur», «d-Moll», «h vermindert», «C übermässig», «Dsus4».
 */
export function chordName(root: Pitch, quality: ChordQuality): string {
  const name = germanNoteName(root.step, root.alter);
  switch (quality) {
    case 'dur':
      return `${name}-Dur`;
    case 'moll':
      return `${name.toLowerCase()}-Moll`;
    case 'vermindert':
      return `${name.toLowerCase()} vermindert`;
    case 'uebermaessig':
      return `${name} übermässig`;
    case 'sus4':
      return `${name}sus4`;
  }
}

// ---------------------------------------------------------------------------
// Grundtöne
// ---------------------------------------------------------------------------

/** «ohne Vorzeichen» oder «auch mit ♭ ♯» — gilt für den Grundton. */
export type RootPolicy = 'stammton' | 'einfach';

/**
 * Ces, Fes, Eis und His gibt es als Akkordton (über Cis steht die Terz Eis),
 * als Grundton wären sie nur eine Lesehürde.
 */
function isPlainRoot(step: Step, alter: number): boolean {
  if (alter === 1) return step !== 'e' && step !== 'b';
  if (alter === -1) return step !== 'c' && step !== 'f';
  return alter === 0;
}

/**
 * Grundtöne, ohne Oktave, über denen sich der Akkord ohne Doppelvorzeichen
 * schreiben lässt.
 */
export function rootClasses(policy: RootPolicy, quality: ChordQuality): { step: Step; alter: number }[] {
  return rootClassesFor(policy, (root) => buildChord(root, quality));
}

/** Dasselbe für jeden Akkordbau — die Septakkorde nutzen es auch. */
export function rootClassesFor(policy: RootPolicy, build: (root: Pitch) => Pitch[]): { step: Step; alter: number }[] {
  const alters = policy === 'stammton' ? [0] : [-1, 0, 1];
  return STEPS.flatMap((step) => alters.map((alter) => ({ step, alter })))
    .filter(({ step, alter }) => isPlainRoot(step, alter))
    .filter(({ step, alter }) => build({ step, alter, octave: 4 }).every((pitch) => Math.abs(pitch.alter) <= 1));
}

// ---------------------------------------------------------------------------
// Umkehrung und Lage
// ---------------------------------------------------------------------------

export const INVERSIONS: Inversion[] = ['grundstellung', 'sextakkord', 'quartsextakkord'];
export const POSITIONS: Position[] = ['oktavlage', 'terzlage', 'quintlage'];

/** Drei Töne eng: welche Lage hat welche Umkehrung? */
export const COUPLED_POSITION: Record<Inversion, Position> = {
  grundstellung: 'quintlage',
  sextakkord: 'oktavlage',
  quartsextakkord: 'terzlage',
};

/** Umgekehrt: welcher enge Stapel hat welchen Ton oben? */
export const STACK_FOR_POSITION: Record<Position, Inversion> = {
  quintlage: 'grundstellung',
  oktavlage: 'sextakkord',
  terzlage: 'quartsextakkord',
};

/** Welches Akkordglied (0 Grundton, 1 Terz, 2 Quinte) liegt bei dieser Umkehrung unten? */
export function bassMember(inversion: Inversion): number {
  return INVERSIONS.indexOf(inversion);
}

/** Welches Akkordglied liegt bei dieser Lage oben? */
export function topMember(position: Position): number {
  return position === 'oktavlage' ? 0 : position === 'terzlage' ? 1 : 2;
}

function shiftOctaves(pitch: Pitch, octaves: number): Pitch {
  return { ...pitch, octave: pitch.octave + octaves };
}

/** Alle Verschiebungen eines Tonstapels um ganze Oktaven, deren Töne im Fenster liegen. */
export function octavePlacements(stack: readonly Pitch[], window: Window): Pitch[][] {
  const out: Pitch[][] = [];
  for (let shift = -4; shift <= 4; shift++) {
    const moved = stack.map((pitch) => shiftOctaves(pitch, shift));
    if (moved.every((pitch) => midi(pitch) >= window.low && midi(pitch) <= window.high)) out.push(moved);
  }
  return out;
}

/**
 * Ein Akkord, wie er dasteht: ohne Basston drei Töne eng, mit Basston dazu
 * ein abgesetzter Ton darunter. Alle Töne von unten nach oben: `all`.
 */
export interface Voicing {
  bass: Pitch | null;
  upper: Pitch[];
  all: Pitch[];
}

/** Der Basston liegt mindestens eine kleine Terz unter den übrigen. */
const BASS_GAP = 3;

/**
 * Alle Lagen dieses Akkords in den Fenstern.
 *
 *  - Ohne Basston: drei Töne eng in der verlangten Umkehrung; die Lage folgt
 *    daraus (`position` muss dazu passen).
 *  - Mit Basston: oben drei Töne eng mit dem verlangten Ton oben, darunter
 *    das Akkordglied der Umkehrung.
 */
export function voicingsFor(
  chord: readonly Pitch[],
  inversion: Inversion,
  position: Position,
  windows: { upper: Window; bass?: Window },
): Voicing[] {
  if (!windows.bass) {
    insist(COUPLED_POSITION[inversion] === position, `${inversion} steht eng nicht in ${position}`);
    return octavePlacements(invertTriad([...chord], inversion), windows.upper).map((upper) => ({
      bass: null,
      upper,
      all: upper,
    }));
  }
  const out: Voicing[] = [];
  const bassWindow = windows.bass;
  for (const upper of octavePlacements(invertTriad([...chord], STACK_FOR_POSITION[position]), windows.upper)) {
    const ceiling = Math.min(bassWindow.high, midi(upper[0]) - BASS_GAP);
    for (const [bass] of octavePlacements([chord[bassMember(inversion)]], { low: bassWindow.low, high: ceiling })) {
      out.push({ bass, upper, all: [bass, ...upper] });
    }
  }
  return out;
}

/**
 * Umkehrung und Lage einer Aufgabe. Ohne Basston hängen sie zusammen: gefragt
 * ist die Umkehrung (die Lage folgt) oder nur die Lage (die Umkehrung folgt).
 * Mit Basston wird beides gewürfelt; was nicht gefragt ist, aus allen.
 */
export function pickInversionAndPosition(
  rng: Rng,
  { ask, inversions, positions, withBass }: UmkehrungChoice,
): { inversion: Inversion; position: Position } {
  const askInversion = ask.includes('inv');
  const askPosition = ask.includes('pos');
  if (!withBass) {
    if (askInversion) {
      const inversion = rng.pick(inversions) as Inversion;
      return { inversion, position: COUPLED_POSITION[inversion] };
    }
    // Ist keins von beiden gefragt (nur Grundton oder Geschlecht), gelten
    // die Lagen-Einstellungen nicht: alle Lagen.
    const position = rng.pick(askPosition ? positions : POSITIONS) as Position;
    return { inversion: STACK_FOR_POSITION[position], position };
  }
  return {
    inversion: rng.pick(askInversion ? inversions : INVERSIONS) as Inversion,
    position: rng.pick(askPosition ? positions : POSITIONS) as Position,
  };
}

export interface UmkehrungChoice {
  ask: string[];
  inversions: string[];
  positions: string[];
  withBass: boolean;
}

/** Die Einstellungen der Umkehrungsübungen, mit Rückfall auf die Vorgabe. */
export function umkehrungChoice(values: FilterValues, defaults: FilterValues): UmkehrungChoice {
  return {
    ask: multi(values, 'ask', defaults.ask as string[]),
    inversions: multi(values, 'inversions', defaults.inversions as string[]),
    positions: multi(values, 'positions', defaults.positions as string[]),
    withBass: toggle(values, 'withBass', defaults.withBass as boolean),
  };
}

/** Was beim Benennen eines Akkords gefragt sein kann, in dieser Reihenfolge. */
const ASKABLE = ['root', 'quality', 'inv', 'pos'] as const;
const ASK_LABELS: Record<(typeof ASKABLE)[number], { field: string; object: string }> = {
  root: { field: 'Grundton', object: 'den Grundton' },
  quality: { field: 'Geschlecht', object: 'das Geschlecht' },
  inv: { field: 'Umkehrung', object: 'die Umkehrung' },
  pos: { field: 'Lage', object: 'die Lage' },
};

/** «Bestimme das Geschlecht des Dreiklangs.», «Bestimme Grundton, Geschlecht und Lage des Dreiklangs.» */
export function askInstruction(ask: readonly string[], subject: string): string {
  const asked = ASKABLE.filter((key) => ask.includes(key));
  if (asked.length === 1) return `Bestimme ${ASK_LABELS[asked[0]].object} ${subject}.`;
  const names = asked.map((key) => ASK_LABELS[key].field);
  return `Bestimme ${names.slice(0, -1).join(', ')} und ${names[names.length - 1]} ${subject}.`;
}

/** Der Grundton als Tonnamen-Raster, wie bei den Tönen; mehrere richtige bei einer schwarzen Taste. */
export interface RootAnswer {
  /** Richtige Namen, klein geschrieben («fis»; auf der Taste «fis», «ges»). */
  correct: string[];
  /** Alle angebotenen Namen. */
  names: string[];
}

/** Alle Tonnamen im Notenbild für diese Grundton-Einstellung, klein geschrieben. */
export function staffRootNames(policy: RootPolicy): string[] {
  const alters = policy === 'stammton' ? [0] : [-1, 0, 1];
  return STEPS.flatMap((step) => alters.map((alter) => germanNoteName(step, alter).toLowerCase()));
}

/**
 * Die Antwortfelder als Knopfreihen: Grundton, Geschlecht, Umkehrung, Lage —
 * was gefragt ist. Angeboten wird, was die Einstellungen zulassen; ohne
 * Basston bei Umkehrung und Lage also nur die Lagen, die zu den eingestellten
 * Umkehrungen gehören.
 */
export function chordFields(
  { ask, inversions, positions, withBass }: UmkehrungChoice,
  answer: { root?: RootAnswer; quality?: ChordQuality; qualities?: readonly string[]; inversion?: Inversion; position?: Position },
): SelectField[] {
  const asked = ASKABLE.filter((key) => ask.includes(key));
  const many = asked.length > 1;
  const points = many ? 1 : 2;
  const label = (key: (typeof ASKABLE)[number]) => (many ? ASK_LABELS[key].field : undefined);
  const offeredPositions =
    !withBass && ask.includes('inv') ? inversions.map((inversion) => COUPLED_POSITION[inversion as Inversion]) : positions;

  return asked.map((key): SelectField => {
    switch (key) {
      case 'root': {
        const root = answer.root!;
        insist(root.correct.every((name) => root.names.includes(name)), `«${root.correct}» fehlt im Raster`);
        return {
          id: 'root',
          label: label(key),
          options: root.names.map((name) => ({ value: name, label: name })),
          correct: root.correct[0],
          ...(root.correct.length > 1 ? { alsoCorrect: root.correct.slice(1) } : {}),
          points,
          buttons: true,
          buttonLayout: 'notes',
        };
      }
      case 'quality':
        return {
          id: 'quality',
          label: label(key),
          options: optionsFrom('chordQuality', answer.qualities!),
          correct: answer.quality!,
          points,
          buttons: true,
        };
      case 'inv':
        return {
          id: 'inv',
          label: label(key),
          options: optionsFrom('inversion', inversions),
          correct: answer.inversion!,
          points,
          buttons: true,
        };
      case 'pos':
        return {
          id: 'pos',
          label: label(key),
          options: optionsFrom('position', offeredPositions),
          correct: answer.position!,
          points,
          buttons: true,
        };
    }
  });
}

/** «Sextakkord», «Terzlage», «Sextakkord in Terzlage» — was verlangt ist. */
export function inversionPositionText(ask: string[], inversion: Inversion, position: Position): string {
  const askInversion = ask.includes('inv');
  const askPosition = ask.includes('pos');
  if (askInversion && askPosition) return `${INVERSION_LABELS[inversion]} in ${POSITION_LABELS[position]}`;
  return askInversion ? INVERSION_LABELS[inversion] : POSITION_LABELS[position];
}

// ---------------------------------------------------------------------------
// Klaviatur
// ---------------------------------------------------------------------------

function pitchClass(key: number): number {
  return ((key % 12) + 12) % 12;
}

/**
 * Was die Tasten allein sagen, ohne Schreibweise: über welcher Taste (als
 * Tonklasse) liegt ein Akkord dieses Geschlechts, und welche Akkordglieder
 * liegen unten und oben? Null, wenn die Tasten das nicht eindeutig sagen —
 * beim übermässigen Dreiklang etwa passen alle drei Töne als Grundton.
 */
export function readKeys(
  keys: readonly number[],
  quality: ChordQuality,
): { root: number; bass: number; top: number } | null {
  const classes = new Set(keys.map(pitchClass));
  const [middle, top] = CHORD_SEMITONES[quality];
  const roots = [...classes].filter((root) => {
    const wanted = new Set([root, (root + middle) % 12, (root + top) % 12]);
    return wanted.size === classes.size && [...classes].every((pc) => wanted.has(pc));
  });
  if (roots.length !== 1) return null;
  const [root] = roots;
  const member = (key: number) => [0, middle, top].indexOf((pitchClass(key) - root + 12) % 12);
  const sorted = [...keys].sort((a, b) => a - b);
  return { root, bass: member(sorted[0]), top: member(sorted[sorted.length - 1]) };
}

// ---------------------------------------------------------------------------
// Notenbild
// ---------------------------------------------------------------------------

/**
 * Fenster im System: «im System» wie bei den Intervallen. Im Klaviersystem
 * steht der Basston im Bassschlüssel zwischen G und a, ohne Hilfslinien.
 */
export const STAFF_WINDOWS: Record<'treble' | 'bass', Window> = {
  treble: { low: 60, high: 79 },
  bass: { low: 43, high: 62 },
};
export const GRAND_BASS_WINDOW: Window = { low: 43, high: 57 };

/**
 * Platz über und unter dem System: so viel, wie der äusserste Ton des
 * Fensters samt Vorzeichen braucht. Fest je Einstellung, damit das System
 * nicht von Aufgabe zu Aufgabe springt.
 */
export function chordSpace(clefs: readonly string[]): NonNullable<ScoreSpec['space']> {
  const spaces = clefs.map((clef) => {
    const which = clef === 'bass' ? 'bass' : 'treble';
    return staffSpace(which, candidatePitches(STAFF_WINDOWS[which], [-1, 0, 1]));
  });
  return {
    above: Math.max(...spaces.map((space) => space.above)),
    below: Math.max(...spaces.map((space) => space.below)),
  };
}

/** Platz im Klaviersystem: über dem oberen und unter dem unteren System. */
export function grandSpace(): NonNullable<ScoreSpec['space']> {
  return {
    above: staffSpace('treble', candidatePitches(STAFF_WINDOWS.treble, [-1, 0, 1])).above,
    below: staffSpace('bass', candidatePitches(GRAND_BASS_WINDOW, [-1, 0, 1])).below,
  };
}

// ---------------------------------------------------------------------------
// Einstellungen
// ---------------------------------------------------------------------------

export const ROOT_FILTER: FilterSpec = {
  kind: 'single',
  key: 'accidentals',
  label: 'Grundton',
  options: [
    { value: 'stammton', label: 'ohne Vorzeichen' },
    { value: 'einfach', label: 'auch mit ♭ ♯' },
  ],
};

export function rootPolicy(values: FilterValues): RootPolicy {
  return single(values, 'accidentals', 'einfach') === 'stammton' ? 'stammton' : 'einfach';
}

export const SUS4_FILTER: FilterSpec = {
  kind: 'toggle',
  key: 'sus4',
  label: 'Mit sus4',
  hint: 'Quarte statt Terz, z.B. c–f–g.',
};

export function qualityFilter(options: SelectOption[] = OPTION_SETS.triadQuality): FilterSpec {
  return { kind: 'multi', key: 'qualities', label: 'Geschlechter', options };
}

/** Die eingestellten Geschlechter, sus4 dazu, wenn eingeschaltet. */
export function chosenQualities(values: FilterValues, defaults: string[], allowSus4 = true): ChordQuality[] {
  const qualities = multi(values, 'qualities', defaults) as ChordQuality[];
  return allowSus4 && toggle(values, 'sus4', false) ? [...qualities, 'sus4'] : qualities;
}

export const CLEF_FILTER: FilterSpec = { kind: 'multi', key: 'clefs', label: 'Schlüssel', options: CLEF_OPTIONS };

export const ASK_OPTIONS: SelectOption[] = [
  { value: 'inv', label: 'Umkehrung' },
  { value: 'pos', label: 'Lage' },
];

/** Beim Benennen auch Grundton und Geschlecht (beim Hören nur das Geschlecht). */
export const ROOT_OPTION: SelectOption = { value: 'root', label: 'Grundton' };
export const QUALITY_OPTION: SelectOption = { value: 'quality', label: 'Geschlecht' };

/**
 * Gefragt ist, Umkehrungen, Lagen — in dieser Reihenfolge, dazu der
 * Basston-Schalter. Ohne `bass` (Singen: drei Töne) gibt es keinen.
 * `sets` sind die Umkehrungen und Lagen; die Septakkorde haben je vier.
 */
export function umkehrungFilters(
  bass?: { label: string; hint: string },
  askOptions: SelectOption[] = ASK_OPTIONS,
  sets: { inversions: SelectOption[]; positions: SelectOption[] } = {
    inversions: OPTION_SETS.inversion,
    positions: OPTION_SETS.position,
  },
): FilterSpec[] {
  return [
    { kind: 'multi', key: 'ask', label: 'Gefragt ist', options: askOptions },
    {
      kind: 'multi',
      key: 'inversions',
      label: 'Umkehrungen',
      options: sets.inversions,
      disabledBy: (values) =>
        multi(values, 'ask', ['inv']).includes('inv') ? null : 'Gilt nur, wenn die Umkehrung gefragt ist.',
    },
    {
      kind: 'multi',
      key: 'positions',
      label: 'Lagen',
      options: sets.positions,
      disabledBy: (values) => {
        const ask = multi(values, 'ask', ['inv']);
        if (!ask.includes('pos')) return 'Gilt nur, wenn die Lage gefragt ist.';
        if (ask.includes('inv') && !toggle(values, 'withBass', false)) {
          return 'Ohne Basston folgt die Lage aus der Umkehrung.';
        }
        return null;
      },
    },
    ...(bass ? [{ kind: 'toggle' as const, key: 'withBass', label: bass.label, hint: bass.hint }] : []),
  ];
}

export const UMKEHRUNG_DEFAULTS = {
  ask: ['inv'],
  inversions: [...INVERSIONS],
  positions: [...POSITIONS],
  withBass: false,
};

// ---------------------------------------------------------------------------
// Singen
// ---------------------------------------------------------------------------

/**
 * Dreiklänge singen (Entscheid 2026-11-24): der tiefste Ton erklingt und
 * steht im System, gesungen wird der Dreiklang von unten nach oben — jeder
 * Ton in beliebiger Oktave, die Reihenfolge zählt, den vorgespielten darf
 * man mitsingen (`judgeSequence`). Ein falscher Ton beendet die Aufgabe nicht;
 * «Ohne Fehlerurteil» gibt es deshalb nur beim Intervall.
 */
export const SING_FILTERS: FilterSpec[] = [
  CLEF_FILTER,
  {
    kind: 'single',
    key: 'tolerance',
    label: 'Genauigkeit',
    options: TOLERANCE_OPTIONS,
    hint: 'So weit darf jeder gesungene Ton danebenliegen.',
  },
  {
    kind: 'single',
    key: 'metronome',
    label: 'Metronom',
    options: [
      { value: 'aus', label: 'aus' },
      { value: '60', label: '60' },
      { value: '80', label: '80' },
      { value: '100', label: '100' },
    ],
    hint: 'Schläge pro Minute. Mit Metronom wird nach dem ersten Ton eingezählt, dann singst du auf jeden Schlag einen Ton. Die Zeit wartet nicht: ein falscher Ton bleibt falsch, und es geht weiter.',
  },
];

export const SING_DEFAULTS = { clefs: ['treble'], tolerance: '50', metronome: 'aus' };

/** Das eingestellte Metronom in Schlägen pro Minute, oder undefined ohne. */
export function metronomeOf(values: FilterValues): number | undefined {
  const tempo = Number(single(values, 'metronome', 'aus'));
  return Number.isFinite(tempo) && tempo > 0 ? tempo : undefined;
}

/** Die Anweisung, mit Metronom ergänzt: dort zählt auch der erste Ton. */
export function withTempo(task: SingTask, instruction: string): string {
  return task.tempo
    ? `${instruction} Mit Metronom: nach dem ersten Ton wird eingezählt, dann singst du auf jeden Schlag einen Ton, auch den ersten. Die Zeit wartet nicht.`
    : instruction;
}

/** Zeichenbreite je weiterer Ganze im System der Singübung, wie in SingTaskView. */
export const SUNG_NOTE_ROOM = 50;

export const SING_HINT =
  'Halte jeden Ton kurz; die Oktave ist egal. Die Linie zeigt, was du singst. Die Stimmlage stellst du unter ⚙ ein.';

/**
 * Der Akkord in der Stimmlage: Grundton und Geschlecht sind gewürfelt, bevor
 * die Stimmlage zählt — derselbe Aufgabenlink fragt bei allen denselben
 * Akkord, nur in der eigenen Lage.
 */
export function placeInVoice(rng: Rng, stack: readonly Pitch[], range: Window): Pitch[] {
  // Ein Sextakkord umfasst neun Halbtöne; nicht jeder passt ganz in eine
  // Stimmlage von gut anderthalb Oktaven. Dann darf er so wenig wie nötig
  // darüber hinausragen — gesungen zählt die Oktave ohnehin nicht.
  for (let stretch = 0; stretch <= 6; stretch++) {
    const placements = octavePlacements(stack, { low: range.low - stretch, high: range.high + stretch });
    if (placements.length > 0) return rng.pick(placements);
  }
  throw new Error(`${stack.map(pitchKey).join(' ')} passt nicht in ${range.low}–${range.high}`);
}

/** Die Singaufgabe: der tiefste Ton im System, alle drei als Folge. */
export function chordSingTask(
  id: string,
  prompt: string,
  stack: Pitch[],
  { clef, range, tolerance, reach = 1, tempo }: {
    clef: 'treble' | 'bass';
    range: Window;
    tolerance: number;
    /** Mit Metronom, Schläge pro Minute (`metronomeOf`). */
    tempo?: number;
    /**
     * So viele Halbtöne darf placeInVoice die Stimmlage überschreiten: bei
     * Dreiklängen einen, beim grossen Durseptakkord (elf Halbtöne) zwei.
     */
    reach?: number;
  },
): SingTask {
  // Platz über und unter dem System: so viel, wie der äusserste mögliche
  // Akkordton der Stimmlage braucht — fest je Einstellung.
  const space = staffSpace(clef, candidatePitches({ low: range.low - reach, high: range.high + reach }, [-1, 0, 1]));
  // Von Anfang an Platz für alle Töne: der erste steht da, die übrigen sind
  // Leerstellen, in die SingTaskView jeden richtig gesungenen Ton grün setzt.
  const slots = stack.slice(1).map(() => ({ duration: 'w' as const, placeholder: true }));
  return {
    id,
    kind: 'sing',
    prompt,
    score: {
      clef,
      width: 110 + SUNG_NOTE_ROOM * slots.length,
      scale: 1.6,
      space,
      measures: [{ notes: [{ keys: [pitchKey(stack[0])], duration: 'w' }, ...slots] }],
    },
    reference: pitchKey(stack[0]),
    target: pitchKey(stack[stack.length - 1]),
    sequence: stack.map(pitchKey),
    tolerance,
    ...(tempo ? { tempo } : {}),
    points: 2,
  };
}
