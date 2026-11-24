/**
 * Umkehrungen & Lagen — welcher Akkordton liegt unten, welcher oben?
 *
 *  - Umkehrung: der tiefste Ton. Grundton = Grundstellung, Terz =
 *    Sextakkord, Quinte = Quartsextakkord.
 *  - Lage: der höchste Ton. Grundton = Oktavlage, Terz = Terzlage, Quinte =
 *    Quintlage.
 *
 * Gefragt ist das eine, das andere oder beides (Einstellung «Gefragt ist»).
 * Ohne Basston stehen drei Töne eng, und die Lage folgt aus der Umkehrung;
 * mit Basston sind beide frei (Entscheid 2026-11-24, `dreiklaenge-shared.ts`).
 *
 * Beim Hören und auf der Klaviatur fehlt der übermässige Dreiklang: er teilt
 * die Oktave in drei gleiche Teile, seine Umkehrungen klingen und liegen
 * gleich. Welcher Ton der Grundton ist, sagt allein die Schreibweise — die es
 * dort nicht gibt.
 */

import type { ScoreSpec, SelectTask } from '../content/schema';
import { INTERVAL_KEYBOARD } from '../music/piano';
import { analyseTriad, midi, type Inversion, type Pitch, type Position } from '../music/theory';
import {
  CLEF_FILTER,
  GRAND_BASS_WINDOW,
  ROOT_FILTER,
  STAFF_WINDOWS,
  UMKEHRUNG_DEFAULTS,
  bassMember,
  buildChord,
  chordSpace,
  grandSpace,
  inversionPositionFields,
  pickInversionAndPosition,
  qualityFilter,
  readKeys,
  rootClasses,
  rootPolicy,
  topMember,
  umkehrungChoice,
  umkehrungFilters,
  voicingsFor,
  type RootPolicy,
  type Voicing,
} from './dreiklaenge-shared';
import { OPTION_SETS } from '../content/options';
import type { Rng } from './rng';
import { insist, noteName, pitchKey, taskId, type Window } from './shared';
import { multi, single, toggle, type FilterValues, type Generator, type Question } from './types';
import type { TriadQuality } from '../music/theory';

const LIMITED_PLAYS = 3;

/** Ohne übermässig — dort, wo nur Klang oder Tasten zählen. */
const AUDIBLE_QUALITIES = OPTION_SETS.triadQuality.filter((option) => option.value !== 'uebermaessig');

/** Alle Lagen eines Akkords dieses Geschlechts mit dieser Umkehrung und Lage. */
function voicingsOf(
  quality: TriadQuality,
  policy: RootPolicy,
  inversion: Inversion,
  position: Position,
  windows: { upper: Window; bass?: Window },
): { root: Pitch; voicing: Voicing }[] {
  return rootClasses(policy, quality).flatMap((root) => {
    const chord = buildChord({ ...root, octave: 4 }, quality);
    return voicingsFor(chord, inversion, position, windows).map((voicing) => ({ root: chord[0], voicing }));
  });
}

/**
 * Unabhängig nachgerechnet: der Theoriekern sieht in den Tönen genau den
 * Akkord, nach dem gefragt wird — Grundton, Geschlecht, Umkehrung, Lage.
 */
function checkVoicing(all: Pitch[], root: Pitch, quality: TriadQuality, inversion: Inversion, position: Position) {
  const shown = all.map(pitchKey).join(' ');
  const analysis = analyseTriad(all);
  insist(analysis !== null, `${shown} ist kein Dreiklang`);
  insist(analysis!.quality === quality, `${shown} ist ${analysis!.quality}, nicht ${quality}`);
  insist(analysis!.inversion === inversion, `${shown} ist ${analysis!.inversion}, nicht ${inversion}`);
  insist(analysis!.position === position, `${shown} steht in ${analysis!.position}, nicht ${position}`);
  insist(noteName(analysis!.root) === noteName(root), `${shown} hat den Grundton ${noteName(analysis!.root)}`);
}

/** Dasselbe, nur aus den Tasten: sie sagen Umkehrung und Lage eindeutig. */
function checkKeys(keys: number[], quality: TriadQuality, inversion: Inversion, position: Position): void {
  const read = readKeys(keys, quality);
  insist(read !== null, `Tasten ${keys.join(' ')} sagen den Grundton nicht eindeutig`);
  insist(read!.bass === bassMember(inversion), `Tasten ${keys.join(' ')}: unten nicht die ${inversion}`);
  insist(read!.top === topMember(position), `Tasten ${keys.join(' ')}: oben nicht die ${position}`);
}

function instructionFor(ask: string[], subject: string): string {
  if (ask.includes('inv') && ask.includes('pos')) return `Bestimme Umkehrung und Lage ${subject}.`;
  return ask.includes('inv') ? `Bestimme die Umkehrung ${subject}.` : `Bestimme die Lage ${subject}.`;
}

const HINT =
  'Umkehrung: der tiefste Ton — Grundton = Grundstellung, Terz = Sextakkord, Quinte = Quartsextakkord. ' +
  'Lage: der höchste Ton — Grundton = Oktavlage, Terz = Terzlage, Quinte = Quintlage.';

// ---------------------------------------------------------------------------
// In Noten benennen
// ---------------------------------------------------------------------------

interface NamingFilters extends FilterValues {
  ask: string[];
  inversions: string[];
  positions: string[];
  withBass: boolean;
  clefs: string[];
  qualities: string[];
  accidentals: string;
}

export const umkehrungenBenennen: Generator<NamingFilters> = {
  id: 'umkehrungen-benennen',
  topic: 'dreiklaenge',
  group: 'umkehrungen',
  skill: 'erkennen',
  version: 1,
  title: 'Umkehrungen & Lagen in Noten benennen',
  instruction: instructionFor(['inv'], 'des Dreiklangs'),
  hint: HINT,

  filters: [
    ...umkehrungFilters({
      label: 'Zwei Systeme (Basston im Bassschlüssel)',
      hint: 'Erst mit eigenem Basston sind Umkehrung und Lage unabhängig voneinander.',
    }),
    {
      ...CLEF_FILTER,
      disabledBy: (values) =>
        toggle(values, 'withBass', false) ? 'Mit zwei Systemen: oben Violin-, unten Bassschlüssel.' : null,
    },
    qualityFilter(),
    ROOT_FILTER,
  ],

  defaults: {
    ...UMKEHRUNG_DEFAULTS,
    clefs: ['treble'],
    qualities: ['dur', 'moll'],
    accidentals: 'einfach',
  },

  generate(values, rng: Rng): Question {
    const choice = umkehrungChoice(values, this.defaults);
    const clefs = multi(values, 'clefs', this.defaults.clefs);
    const qualities = multi(values, 'qualities', this.defaults.qualities) as TriadQuality[];
    const policy = rootPolicy(values);

    const { inversion, position } = pickInversionAndPosition(rng, choice);
    const quality = rng.pick(qualities);
    const clef = choice.withBass ? 'treble' : (rng.pick(clefs) as 'treble' | 'bass');
    const windows = choice.withBass
      ? { upper: STAFF_WINDOWS.treble, bass: GRAND_BASS_WINDOW }
      : { upper: STAFF_WINDOWS[clef] };
    const candidates = voicingsOf(quality, policy, inversion, position, windows);
    insist(candidates.length > 0, `kein ${quality} als ${inversion} in ${position}`);
    const { root, voicing } = rng.pick(candidates);
    checkVoicing(voicing.all, root, quality, inversion, position);

    const score: ScoreSpec = voicing.bass
      ? {
          clef: 'grand',
          width: 150,
          scale: 2,
          fit: { maxScale: 3 },
          space: grandSpace(),
          measures: [
            {
              notes: [{ keys: voicing.upper.map(pitchKey), duration: 'w' }],
              bass: [{ keys: [pitchKey(voicing.bass)], duration: 'w' }],
            },
          ],
        }
      : {
          clef,
          width: 150,
          scale: 2,
          fit: { maxScale: 4 },
          space: chordSpace(clefs),
          measures: [{ notes: [{ keys: voicing.upper.map(pitchKey), duration: 'w' }] }],
        };

    const task: SelectTask = {
      id: taskId('ub', rng),
      kind: 'select',
      score,
      fields: inversionPositionFields(choice, { inversion, position }),
    };
    return { task, instruction: instructionFor(choice.ask, 'des Dreiklangs') };
  },
};

// ---------------------------------------------------------------------------
// Auf Klaviatur benennen
// ---------------------------------------------------------------------------

interface KeyNamingFilters extends FilterValues {
  ask: string[];
  inversions: string[];
  positions: string[];
  withBass: boolean;
  qualities: string[];
  accidentals: string;
}

export const umkehrungenKlaviaturBenennen: Generator<KeyNamingFilters> = {
  id: 'umkehrungen-klaviatur-benennen',
  topic: 'dreiklaenge',
  group: 'umkehrungen',
  skill: 'klaviatur',
  version: 1,
  title: 'Umkehrungen & Lagen auf Klaviatur benennen',
  instruction: instructionFor(['inv'], 'des Dreiklangs auf den markierten Tasten'),
  hint: HINT,

  filters: [
    ...umkehrungFilters({
      label: 'Mit Basston (vier Tasten)',
      hint: 'Erst mit eigenem Basston sind Umkehrung und Lage unabhängig voneinander.',
    }),
    {
      ...qualityFilter(AUDIBLE_QUALITIES),
      hint: 'Ohne übermässig: seine Umkehrungen liegen auf denselben Tasten.',
    },
    ROOT_FILTER,
  ],

  defaults: { ...UMKEHRUNG_DEFAULTS, qualities: ['dur', 'moll'], accidentals: 'einfach' },

  generate(values, rng: Rng): Question {
    const choice = umkehrungChoice(values, this.defaults);
    // Ein gespeicherter Stand kann «übermässig» noch enthalten.
    const qualities = multi(values, 'qualities', this.defaults.qualities).filter((quality) =>
      AUDIBLE_QUALITIES.some((option) => option.value === quality),
    ) as TriadQuality[];
    const policy = rootPolicy(values);

    const { inversion, position } = pickInversionAndPosition(rng, choice);
    const quality = rng.pick(qualities.length > 0 ? qualities : (this.defaults.qualities as TriadQuality[]));
    const windows = choice.withBass
      ? { upper: INTERVAL_KEYBOARD, bass: INTERVAL_KEYBOARD }
      : { upper: INTERVAL_KEYBOARD };
    const candidates = voicingsOf(quality, policy, inversion, position, windows);
    insist(candidates.length > 0, `kein ${quality} als ${inversion} in ${position} auf der Klaviatur`);
    const { root, voicing } = rng.pick(candidates);
    checkVoicing(voicing.all, root, quality, inversion, position);
    const keys = voicing.all.map(midi);
    checkKeys(keys, quality, inversion, position);

    const task: SelectTask = {
      id: taskId('ukb', rng),
      kind: 'select',
      keyboard: { ...INTERVAL_KEYBOARD, marked: keys },
      fields: inversionPositionFields(choice, { inversion, position }),
    };
    return { task, instruction: instructionFor(choice.ask, 'des Dreiklangs auf den markierten Tasten') };
  },
};

// ---------------------------------------------------------------------------
// Hörend erkennen
// ---------------------------------------------------------------------------

/** Beim Hören: oben angenehm, der Basston nicht zu tief. */
const HEARING_UPPER: Window = { low: 52, high: 76 };
const HEARING_BASS: Window = { low: 40, high: 55 };

interface HearingFilters extends FilterValues {
  ask: string[];
  inversions: string[];
  positions: string[];
  withBass: boolean;
  qualities: string[];
  playback: string;
  limitPlays: boolean;
}

export const umkehrungenHoeren: Generator<HearingFilters> = {
  id: 'umkehrungen-hoeren',
  topic: 'dreiklaenge',
  group: 'umkehrungen',
  skill: 'hoeren',
  version: 1,
  title: 'Umkehrungen & Lagen hörend erkennen',
  instruction: 'Du hörst den Dreiklang gebrochen und dann zusammen. Bestimme die Umkehrung.',
  hint: 'Achte auf den tiefsten Ton für die Umkehrung und auf den höchsten für die Lage.',

  filters: [
    ...umkehrungFilters({
      label: 'Mit Basston (vier Töne)',
      hint: 'Erst mit eigenem Basston sind Umkehrung und Lage unabhängig voneinander.',
    }),
    {
      ...qualityFilter(AUDIBLE_QUALITIES),
      hint: 'Ohne übermässig: seine Umkehrungen klingen gleich.',
    },
    {
      kind: 'single',
      key: 'playback',
      label: 'Wiedergabe',
      options: [
        { value: 'beides', label: 'gebrochen, dann zusammen' },
        { value: 'zusammen', label: 'nur zusammen' },
      ],
    },
    { kind: 'toggle', key: 'limitPlays', label: `Wiedergaben begrenzen (${LIMITED_PLAYS}×)` },
  ],

  defaults: { ...UMKEHRUNG_DEFAULTS, qualities: ['dur', 'moll'], playback: 'beides', limitPlays: false },

  generate(values, rng: Rng): Question {
    const choice = umkehrungChoice(values, this.defaults);
    const qualities = multi(values, 'qualities', this.defaults.qualities).filter((quality) =>
      AUDIBLE_QUALITIES.some((option) => option.value === quality),
    ) as TriadQuality[];
    const broken = single(values, 'playback', 'beides') !== 'zusammen';
    const limitPlays = toggle(values, 'limitPlays', false);

    const { inversion, position } = pickInversionAndPosition(rng, choice);
    const quality = rng.pick(qualities.length > 0 ? qualities : (this.defaults.qualities as TriadQuality[]));
    const windows = choice.withBass ? { upper: HEARING_UPPER, bass: HEARING_BASS } : { upper: HEARING_UPPER };
    const { root, voicing } = rng.pick(voicingsOf(quality, 'einfach', inversion, position, windows));
    checkVoicing(voicing.all, root, quality, inversion, position);
    checkKeys(voicing.all.map(midi), quality, inversion, position);

    const id = taskId('gu', rng);
    const what =
      choice.ask.includes('inv') && choice.ask.includes('pos')
        ? 'Umkehrung und Lage'
        : choice.ask.includes('inv')
          ? 'die Umkehrung'
          : 'die Lage';
    return {
      task: { id, kind: 'select', fields: inversionPositionFields(choice, { inversion, position }) },
      audio: { id, kind: 'voicing', notes: voicing.all.map(pitchKey), broken },
      instruction: broken
        ? `Du hörst den Dreiklang gebrochen und dann zusammen. Bestimme ${what}.`
        : `Du hörst den Dreiklang als Zusammenklang. Bestimme ${what}.`,
      maxPlays: limitPlays ? LIMITED_PLAYS : undefined,
    };
  },
};


