/**
 * Septakkorde — was die beiden Gruppen teilen: Akkordbau, Namen und Symbole,
 * Umkehrungen und Lagen, die Tasten und die Einstellungen. Notenbild, Grundtöne
 * und Singen kommen von den Dreiklängen (`dreiklaenge-shared.ts`).
 *
 *  - Grundstellung (`septakkorde-grundstellung.ts`): vier Töne eng über dem
 *    Grundton. Gefragt ist die Art.
 *  - Umkehrungen & Lagen (`septakkorde-umkehrungen.ts`): gefragt ist die
 *    Umkehrung (tiefster Ton), die Lage (höchster Ton) oder beides.
 *
 * Entscheide 2026-11-24:
 *
 *  - Die fünf üblichen Septakkorde: Dominantseptakkord, grosser
 *    Durseptakkord, kleiner Mollseptakkord, halbvermindert, vermindert.
 *  - Bezeichnung umschaltbar (Einstellung): Akkordsymbole («G7», Vorgabe)
 *    oder ausgeschriebene Namen («Dominantseptakkord auf G»).
 *  - Vier Töne eng: die Lage folgt aus der Umkehrung — Grundstellung =
 *    Septlage, Quintsextakkord = Oktavlage, Terzquartakkord = Terzlage,
 *    Sekundakkord = Quintlage. Mit abgesetztem Basston steht der Akkord
 *    vierstimmig: unten der Basston, darüber die drei übrigen Töne eng, jeder
 *    Ton einmal. Dann ist die Lage frei, nur liegt das Akkordglied im Bass nie
 *    zugleich oben.
 *
 * Doppelvorzeichen kommen nirgends vor: Grundtöne, über denen ein Akkordton
 * eins bräuchte (vermindert über C: heses), fallen weg.
 */

import { OPTION_SETS } from '../content/options';
import type { SelectField, SelectOption } from '../content/schema';
import {
  SEVENTH_INVERSION_LABELS,
  SEVENTH_LABELS,
  SEVENTH_POSITION_LABELS,
  SEVENTH_SEMITONES,
  SEVENTH_SYMBOLS,
  germanNoteName,
  midi,
  parseIntervalLabel,
  transposeByInterval,
  type Pitch,
  type SeventhInversion,
  type SeventhPosition,
  type SeventhQuality,
  type Step,
} from '../music/theory';
import {
  ROOT_OPTION,
  octavePlacements,
  rootClassesFor,
  umkehrungFilters,
  type RootAnswer,
  type RootPolicy,
  type UmkehrungChoice,
  type Voicing,
} from './dreiklaenge-shared';
import type { Rng } from './rng';
import { insist, optionsFrom, type Window } from './shared';
import { multi, single, type FilterSpec, type FilterValues } from './types';

// ---------------------------------------------------------------------------
// Akkorde
// ---------------------------------------------------------------------------

export const SEVENTH_QUALITIES: SeventhQuality[] = ['dominant', 'gross-dur', 'klein-moll', 'halbvermindert', 'vermindert'];

/** Terz, Quinte und Septime als Intervalle über dem Grundton. */
const SEVENTH_INTERVALS: Record<SeventhQuality, [string, string, string]> = {
  dominant: ['g3', 'r5', 'k7'],
  'gross-dur': ['g3', 'r5', 'g7'],
  'klein-moll': ['k3', 'r5', 'k7'],
  halbvermindert: ['k3', 'v5', 'k7'],
  vermindert: ['k3', 'v5', 'v7'],
};

/** Grundton, Terz, Quinte, Septime — eng über dem Grundton. */
export function buildSeventh(root: Pitch, quality: SeventhQuality): Pitch[] {
  return [root, ...SEVENTH_INTERVALS[quality].map((label) => transposeByInterval(root, parseIntervalLabel(label)))];
}

/** Grundtöne ohne Oktave, über denen der Akkord ohne Doppelvorzeichen auskommt. */
export function seventhRootClasses(policy: RootPolicy, quality: SeventhQuality): { step: Step; alter: number }[] {
  return rootClassesFor(policy, (root) => buildSeventh(root, quality));
}

// ---------------------------------------------------------------------------
// Bezeichnung
// ---------------------------------------------------------------------------

export type Wording = 'namen' | 'symbole';

export const WORDING_FILTER: FilterSpec = {
  kind: 'single',
  key: 'wording',
  label: 'Bezeichnung',
  options: [
    { value: 'symbole', label: 'Akkordsymbole' },
    { value: 'namen', label: 'Namen' },
  ],
  hint: 'Etwa «G7» oder «Dominantseptakkord auf G».',
};

/** Vorgabe sind die Akkordsymbole (Entscheid 2026-11-24). */
export function wordingOf(values: FilterValues): Wording {
  return single(values, 'wording', 'symbole') === 'namen' ? 'namen' : 'symbole';
}

/** Kurz genug für einen Knopf; «halbvermindert» statt «halbverminderter Septakkord». */
const BUTTON_NAMES: Record<SeventhQuality, string> = {
  dominant: 'Dominantseptakkord',
  'gross-dur': 'grosser Durseptakkord',
  'klein-moll': 'kleiner Mollseptakkord',
  halbvermindert: 'halbvermindert',
  vermindert: 'vermindert',
};

/** Was zu notieren, spielen oder singen ist: «Dominantseptakkord auf G» oder «G7». */
export function seventhName(root: Pitch, quality: SeventhQuality, wording: Wording): string {
  const name = germanNoteName(root.step, root.alter);
  return wording === 'symbole' ? `${name}${SEVENTH_SYMBOLS[quality]}` : `${SEVENTH_LABELS[quality]} auf ${name}`;
}

/** Die Antwortknöpfe der Art, in fester Reihenfolge. */
export function seventhQualityOptions(qualities: readonly string[], wording: Wording): SelectOption[] {
  return SEVENTH_QUALITIES.filter((quality) => qualities.includes(quality)).map((quality) => ({
    value: quality,
    label: wording === 'symbole' ? SEVENTH_SYMBOLS[quality] : BUTTON_NAMES[quality],
  }));
}

/** In den Einstellungen beides, damit man in jeder Bezeichnung weiss, was gemeint ist. */
const QUALITY_FILTER_OPTIONS: SelectOption[] = SEVENTH_QUALITIES.map((quality) => ({
  value: quality,
  label: `${BUTTON_NAMES[quality]} (${SEVENTH_SYMBOLS[quality]})`,
}));

export function seventhQualityFilter(without?: SeventhQuality, hint?: string): FilterSpec {
  return {
    kind: 'multi',
    key: 'chordTypes',
    label: 'Septakkorde',
    options: QUALITY_FILTER_OPTIONS.filter((option) => option.value !== without),
    ...(hint ? { hint } : {}),
  };
}

/**
 * Die eingestellten Arten. Ein gespeicherter Stand kann eine Art enthalten,
 * die die Übung nicht (mehr) anbietet; dann gilt die Vorgabe.
 */
export function chosenSevenths(values: FilterValues, defaults: string[], without?: SeventhQuality): SeventhQuality[] {
  const chosen = multi(values, 'chordTypes', defaults).filter(
    (value) => SEVENTH_QUALITIES.includes(value as SeventhQuality) && value !== without,
  );
  return (chosen.length > 0 ? chosen : defaults) as SeventhQuality[];
}

/** Zum Nachmessen: Dreiklang und Septime, in der gewählten Bezeichnung. */
export function seventhHint(qualities: readonly SeventhQuality[], wording: Wording): string {
  const RECIPES: Record<SeventhQuality, string> = {
    dominant: 'Dur + kleine Septime',
    'gross-dur': 'Dur + grosse Septime',
    'klein-moll': 'moll + kleine Septime',
    halbvermindert: 'vermindert + kleine Septime',
    vermindert: 'vermindert + verminderte Septime',
  };
  const name = (quality: SeventhQuality) => (wording === 'symbole' ? SEVENTH_SYMBOLS[quality] : BUTTON_NAMES[quality]);
  return `Bestimme den Dreiklang über dem Grundton und die Septime: ${qualities
    .map((quality) => `${RECIPES[quality]} = ${name(quality)}`)
    .join(', ')}.`;
}

/** Dasselbe in Halbtönen, für die Klaviatur. */
export function seventhKeyHint(qualities: readonly SeventhQuality[], wording: Wording): string {
  const name = (quality: SeventhQuality) => (wording === 'symbole' ? SEVENTH_SYMBOLS[quality] : BUTTON_NAMES[quality]);
  const steps = (quality: SeventhQuality) => {
    const [third, fifth, seventh] = SEVENTH_SEMITONES[quality];
    return `${third} + ${fifth - third} + ${seventh - fifth}`;
  };
  return `Zähle die Halbtöne vom tiefsten Ton aus: ${qualities.map((quality) => `${steps(quality)} = ${name(quality)}`).join(', ')}.`;
}

// ---------------------------------------------------------------------------
// Umkehrung und Lage
// ---------------------------------------------------------------------------

export const SEVENTH_INVERSIONS = Object.keys(SEVENTH_INVERSION_LABELS) as SeventhInversion[];
export const SEVENTH_POSITIONS = Object.keys(SEVENTH_POSITION_LABELS) as SeventhPosition[];

/** Welches Akkordglied (0 Grundton, 1 Terz, 2 Quinte, 3 Septime) liegt unten? */
export function seventhBassMember(inversion: SeventhInversion): number {
  return SEVENTH_INVERSIONS.indexOf(inversion);
}

/** Welches Akkordglied liegt oben? */
export function seventhTopMember(position: SeventhPosition): number {
  return SEVENTH_POSITIONS.indexOf(position);
}

/** Vier Töne eng: oben liegt das Akkordglied unter dem Basston. */
export const COUPLED_SEVENTH_POSITION: Record<SeventhInversion, SeventhPosition> = {
  grundstellung: 'septlage',
  quintsextakkord: 'oktavlage',
  terzquartakkord: 'terzlage',
  sekundakkord: 'quintlage',
};

/** Umgekehrt: welcher enge Stapel hat welchen Ton oben? */
const SEVENTH_STACK_FOR_POSITION: Record<SeventhPosition, SeventhInversion> = {
  septlage: 'grundstellung',
  oktavlage: 'quintsextakkord',
  terzlage: 'terzquartakkord',
  quintlage: 'sekundakkord',
};

/** Töne eng übereinander, in der gegebenen Reihenfolge: jeder knapp über dem vorigen. */
function closeStack(pitches: readonly Pitch[]): Pitch[] {
  const out = [pitches[0]];
  for (const pitch of pitches.slice(1)) {
    const below = out[out.length - 1];
    let placed = { ...pitch, octave: below.octave - 1 };
    while (midi(placed) <= midi(below)) placed = { ...placed, octave: placed.octave + 1 };
    out.push(placed);
  }
  return out;
}

/** Die vier Töne eng, mit dem Akkordglied der Umkehrung unten. */
export function invertSeventh(chord: readonly Pitch[], inversion: SeventhInversion): Pitch[] {
  const shift = seventhBassMember(inversion);
  return closeStack(chord.map((_, index) => chord[(index + shift) % chord.length]));
}

/** Der Basston liegt mindestens eine kleine Terz unter den übrigen. */
const BASS_GAP = 3;

/**
 * Alle Lagen dieses Akkords in den Fenstern.
 *
 *  - Ohne Basston: vier Töne eng in der verlangten Umkehrung; die Lage folgt
 *    daraus (`position` muss dazu passen).
 *  - Mit Basston (vierstimmig): unten das Akkordglied der Umkehrung, darüber
 *    die drei übrigen eng, das der Lage oben.
 */
export function seventhVoicings(
  chord: readonly Pitch[],
  inversion: SeventhInversion,
  position: SeventhPosition,
  windows: { upper: Window; bass?: Window },
): Voicing[] {
  if (!windows.bass) {
    insist(COUPLED_SEVENTH_POSITION[inversion] === position, `${inversion} steht eng nicht in ${position}`);
    return octavePlacements(invertSeventh(chord, inversion), windows.upper).map((upper) => ({
      bass: null,
      upper,
      all: upper,
    }));
  }
  const bassMember = seventhBassMember(inversion);
  const topMember = seventhTopMember(position);
  insist(bassMember !== topMember, `vierstimmig liegt das ${position}-Glied nicht zugleich im Bass`);
  // Reihum ab dem Glied über dem obersten, ohne das im Bass: so endet der
  // enge Stapel mit dem verlangten Ton oben.
  const order = [1, 2, 3, 4].map((step) => (topMember + step) % 4).filter((member) => member !== bassMember);
  const stack = closeStack(order.map((member) => chord[member]));

  const out: Voicing[] = [];
  const bassWindow = windows.bass;
  for (const upper of octavePlacements(stack, windows.upper)) {
    const ceiling = Math.min(bassWindow.high, midi(upper[0]) - BASS_GAP);
    for (const [bass] of octavePlacements([chord[bassMember]], { low: bassWindow.low, high: ceiling })) {
      out.push({ bass, upper, all: [bass, ...upper] });
    }
  }
  return out;
}

/**
 * Umkehrung und Lage einer Aufgabe. Ohne Basston hängen sie zusammen: gefragt
 * ist die Umkehrung (die Lage folgt) oder nur die Lage (die Umkehrung folgt).
 * Vierstimmig wird ein Paar gewürfelt, bei dem der Basston nicht zugleich oben
 * liegt; was nicht gefragt ist, aus allen.
 */
export function pickSeventhInversionAndPosition(
  rng: Rng,
  { ask, inversions, positions, withBass }: UmkehrungChoice,
): { inversion: SeventhInversion; position: SeventhPosition } {
  const askInversion = ask.includes('inv');
  const askPosition = ask.includes('pos');
  if (!withBass) {
    if (askInversion) {
      const inversion = rng.pick(inversions) as SeventhInversion;
      return { inversion, position: COUPLED_SEVENTH_POSITION[inversion] };
    }
    const position = rng.pick(askPosition ? positions : SEVENTH_POSITIONS) as SeventhPosition;
    return { inversion: SEVENTH_STACK_FOR_POSITION[position], position };
  }
  const inversionPool = (askInversion ? inversions : SEVENTH_INVERSIONS) as SeventhInversion[];
  const pairs = (pool: readonly string[]) =>
    inversionPool.flatMap((inversion) =>
      (pool as SeventhPosition[])
        .filter((position) => seventhTopMember(position) !== seventhBassMember(inversion))
        .map((position) => ({ inversion, position })),
    );
  const wanted = pairs(askPosition ? positions : SEVENTH_POSITIONS);
  // Nur Grundstellung und nur Oktavlage geht vierstimmig nicht; dann gilt
  // die Umkehrung, und die Lage ist eine der möglichen.
  return rng.pick(wanted.length > 0 ? wanted : pairs(SEVENTH_POSITIONS));
}

// ---------------------------------------------------------------------------
// Antwortfelder
// ---------------------------------------------------------------------------

/** Was beim Benennen gefragt sein kann, in dieser Reihenfolge. */
const ASKABLE = ['root', 'type', 'inv', 'pos'] as const;
const ASK_LABELS: Record<(typeof ASKABLE)[number], { field: string; object: string }> = {
  root: { field: 'Grundton', object: 'den Grundton' },
  type: { field: 'Art', object: 'die Art' },
  inv: { field: 'Umkehrung', object: 'die Umkehrung' },
  pos: { field: 'Lage', object: 'die Lage' },
};

export const TYPE_OPTION: SelectOption = { value: 'type', label: 'Art' };
export const SEVENTH_ASK_OPTIONS: SelectOption[] = [
  { value: 'inv', label: 'Umkehrung' },
  { value: 'pos', label: 'Lage' },
];
export { ROOT_OPTION };

/** «Bestimme die Art des Septakkords.», «Bestimme Grundton, Art und Lage des Septakkords.» */
export function seventhAskInstruction(ask: readonly string[], subject: string): string {
  const asked = ASKABLE.filter((key) => ask.includes(key));
  if (asked.length === 1) return `Bestimme ${ASK_LABELS[asked[0]].object} ${subject}.`;
  const names = asked.map((key) => ASK_LABELS[key].field);
  return `Bestimme ${names.slice(0, -1).join(', ')} und ${names[names.length - 1]} ${subject}.`;
}

/**
 * Die Antwortfelder als Knopfreihen: Grundton, Art, Umkehrung, Lage — was
 * gefragt ist. Angeboten wird, was die Einstellungen zulassen; ohne Basston
 * bei Umkehrung und Lage also nur die Lagen der eingestellten Umkehrungen.
 */
export function seventhFields(
  { ask, inversions, positions, withBass }: UmkehrungChoice,
  answer: {
    root?: RootAnswer;
    quality?: SeventhQuality;
    qualities?: readonly string[];
    inversion?: SeventhInversion;
    position?: SeventhPosition;
  },
  wording: Wording,
): SelectField[] {
  const asked = ASKABLE.filter((key) => ask.includes(key));
  const many = asked.length > 1;
  const points = many ? 1 : 2;
  const label = (key: (typeof ASKABLE)[number]) => (many ? ASK_LABELS[key].field : undefined);
  // Vierstimmig kann die gewürfelte Lage ausserhalb der eingestellten liegen
  // (pickSeventhInversionAndPosition); angeboten wird sie trotzdem.
  const offeredPositions =
    !withBass && ask.includes('inv')
      ? inversions.map((inversion) => COUPLED_SEVENTH_POSITION[inversion as SeventhInversion])
      : SEVENTH_POSITIONS.filter((position) => positions.includes(position) || position === answer.position);

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
      case 'type':
        return {
          id: 'type',
          label: label(key),
          options: seventhQualityOptions(answer.qualities!, wording),
          correct: answer.quality!,
          points,
          buttons: true,
        };
      case 'inv':
        return {
          id: 'inv',
          label: label(key),
          options: optionsFrom('seventhInversion', inversions),
          correct: answer.inversion!,
          points,
          buttons: true,
        };
      case 'pos':
        return {
          id: 'pos',
          label: label(key),
          options: optionsFrom('seventhPosition', offeredPositions),
          correct: answer.position!,
          points,
          buttons: true,
        };
    }
  });
}

/** «Quintsextakkord», «Terzlage», «Quintsextakkord in Terzlage» — was verlangt ist. */
export function seventhInversionPositionText(
  ask: string[],
  inversion: SeventhInversion,
  position: SeventhPosition,
): string {
  const askInversion = ask.includes('inv');
  const askPosition = ask.includes('pos');
  if (askInversion && askPosition) {
    return `${SEVENTH_INVERSION_LABELS[inversion]} in ${SEVENTH_POSITION_LABELS[position]}`;
  }
  return askInversion ? SEVENTH_INVERSION_LABELS[inversion] : SEVENTH_POSITION_LABELS[position];
}

// ---------------------------------------------------------------------------
// Klaviatur
// ---------------------------------------------------------------------------

function pitchClass(key: number): number {
  return ((key % 12) + 12) % 12;
}

/**
 * Was die Tasten allein sagen: über welcher Taste (als Tonklasse) liegt ein
 * Septakkord dieser Art, und welche Akkordglieder liegen unten und oben?
 * Null, wenn die Tasten das nicht eindeutig sagen — beim verminderten
 * Septakkord passt jeder der vier Töne als Grundton.
 */
export function readSeventhKeys(
  keys: readonly number[],
  quality: SeventhQuality,
): { root: number; bass: number; top: number } | null {
  const classes = new Set(keys.map(pitchClass));
  const offsets = [0, ...SEVENTH_SEMITONES[quality]];
  const roots = [...classes].filter((root) => {
    const wanted = new Set(offsets.map((offset) => (root + offset) % 12));
    return wanted.size === classes.size && [...classes].every((pc) => wanted.has(pc));
  });
  if (roots.length !== 1) return null;
  const [root] = roots;
  const member = (key: number) => offsets.indexOf((pitchClass(key) - root + 12) % 12);
  const sorted = [...keys].sort((a, b) => a - b);
  return { root, bass: member(sorted[0]), top: member(sorted[sorted.length - 1]) };
}

// ---------------------------------------------------------------------------
// Einstellungen
// ---------------------------------------------------------------------------

/** Gefragt ist, Umkehrungen, Lagen und der Basston-Schalter, mit den vier Umkehrungen und Lagen. */
export function seventhUmkehrungFilters(
  bass?: { label: string; hint: string },
  askOptions: SelectOption[] = SEVENTH_ASK_OPTIONS,
): FilterSpec[] {
  return umkehrungFilters(bass, askOptions, {
    inversions: OPTION_SETS.seventhInversion,
    positions: OPTION_SETS.seventhPosition,
  });
}

export const SEVENTH_UMKEHRUNG_DEFAULTS = {
  ask: ['inv'],
  inversions: [...SEVENTH_INVERSIONS],
  positions: [...SEVENTH_POSITIONS],
  withBass: false,
};

/** Was der Basston-Schalter bewirkt — steht bei jeder Übung mit Basston. */
export const VIERSTIMMIG_HINT =
  'Vierstimmig: unten der Basston, darüber die drei übrigen Töne eng, jeder Ton einmal. ' +
  'Umkehrung und Lage sind dann frei, nur liegt der Basston nie zugleich oben.';

/**
 * Vier Töne eng umfassen bis zu elf Halbtöne (grosser Durseptakkord in
 * Grundstellung); nicht jeder passt ganz in eine Stimmlage. placeInVoice lässt
 * ihn dann so wenig wie nötig hinausragen — höchstens zwei Halbtöne.
 */
export const SING_REACH = 2;
