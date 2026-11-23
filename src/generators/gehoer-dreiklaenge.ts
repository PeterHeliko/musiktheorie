/**
 * Gehörbildung — Dreiklänge hörend erkennen.
 *
 * Vorgabe ist das Geschlecht in Grundstellung — das ist die Grundfertigkeit.
 * Umkehrungen lassen sich zuschalten und auch abfragen; beides ist deutlich
 * schwerer und deshalb nicht von Anfang an eingeschaltet.
 */

import { invertTriad } from '../content/audio';
import { OPTION_SETS } from '../content/options';
import {
  TRIAD_LABELS,
  analyseTriad,
  buildTriad,
  type Inversion,
  type TriadQuality,
} from '../music/theory';
import type { Rng } from './rng';
import { candidatePitches, insist, pitchKey, taskId } from './shared';
import { multi, single, toggle, type FilterValues, type Generator, type Question } from './types';

const LIMITED_PLAYS = 3;

/**
 * Geschlechter, deren Umkehrung sich NICHT hören lässt.
 *
 * Der übermässige Dreiklang teilt die Oktave in drei gleich grosse Terzen:
 * c–e–gis, e–gis–c und gis–c–e sind derselbe Klang, nur verschoben. Welcher
 * Ton der Grundton ist, entscheidet allein die Schreibweise — und die sieht
 * man beim Hören nicht. Die Frage nach der Umkehrung ist hier also nicht
 * schwer, sondern unbeantwortbar.
 *
 * Der verminderte Dreiklang ist NICHT betroffen: seine Terzen sind klein,
 * klein und übermässig (3+3+6 Halbtöne), die Umkehrungen klingen verschieden.
 *
 * In der Notenbild-Übung `dreiklaenge-bestimmen` gilt das alles nicht — dort
 * steht die Schreibweise da und die Umkehrung ist ablesbar.
 */
const SYMMETRIC_QUALITIES = ['uebermaessig'];

const WAIVER_REASON =
  'Ein übermässiger Dreiklang besteht aus drei gleich grossen Terzen — seine ' +
  'Umkehrungen klingen identisch. Die Umkehrung entfällt deshalb.';

/**
 * Gesperrt wird die Umkehrungsfrage nur, wenn AUSSCHLIESSLICH symmetrische
 * Geschlechter zugelassen sind: dann liefe der Schalter ins Leere, weil jede
 * einzelne Aufgabe die Umkehrung ohnehin erlassen würde.
 *
 * Sind auch andere Geschlechter dabei, bleibt der Schalter nutzbar — die
 * Aufgabe entscheidet dann je nach gegebener Antwort (siehe `waiver`).
 */
function inversionNeverAskable(qualities: string[]): string | null {
  const askable = qualities.filter((quality) => !SYMMETRIC_QUALITIES.includes(quality));
  if (askable.length > 0) return null;
  return `${WAIVER_REASON} Nimm ein weiteres Geschlecht dazu, um sie abzufragen.`;
}

/**
 * Fenster für den Grundton. Nach oben Luft für die Umkehrungen: ein
 * Quartsextakkord liegt eine Oktave über seinem Grundton.
 */
const ROOT_WINDOW = { low: 50, high: 68 };

interface Filters extends FilterValues {
  qualities: string[];
  inversions: string[];
  askInversion: boolean;
  playback: string;
  limitPlays: boolean;
}

export const gehoerDreiklaenge: Generator<Filters> = {
  id: 'dreiklaenge-hoeren',
  topic: 'dreiklaenge',
  skill: 'hoeren',
  version: 1,
  title: 'Dreiklänge hörend erkennen',
  instruction: 'Du hörst den Dreiklang gebrochen und dann zusammen. Bestimme das Geschlecht.',

  filters: [
    { kind: 'multi', key: 'qualities', label: 'Welche Geschlechter?', options: OPTION_SETS.triadQuality },
    {
      kind: 'multi',
      key: 'inversions',
      label: 'Welche Umkehrungen?',
      options: OPTION_SETS.inversion,
      hint: 'Umkehrungen ändern den Klang deutlich — ein guter nächster Schritt, wenn das Geschlecht sitzt.',
    },
    {
      kind: 'toggle',
      key: 'askInversion',
      label: 'Umkehrung mitfragen',
      hint: 'Wirkt nur, wenn mehr als eine Umkehrung erlaubt ist.',
      disabledBy: (values) =>
        inversionNeverAskable(multi(values, 'qualities', gehoerDreiklaenge.defaults.qualities)),
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

  defaults: {
    qualities: OPTION_SETS.triadQuality.map((option) => option.value),
    inversions: ['grundstellung'],
    askInversion: false,
    playback: 'beides',
    limitPlays: false,
  },

  generate(values, rng: Rng): Question {
    const qualities = multi(values, 'qualities', this.defaults.qualities);
    const inversions = multi(values, 'inversions', this.defaults.inversions);
    // Dieselbe Bedingung wie im Filter, hier aber verbindlich: ein gespeicherter
    // Filterstand kann aus einer Sitzung stammen, in der die Kombination noch
    // erlaubt war.
    const askInversion =
      toggle(values, 'askInversion', false) &&
      inversions.length > 1 &&
      inversionNeverAskable(qualities) === null;
    const broken = single(values, 'playback', 'beides') !== 'zusammen';
    const limitPlays = toggle(values, 'limitPlays', false);

    const quality = rng.pick(qualities) as TriadQuality;
    const inversion = rng.pick(inversions) as Inversion;
    // Einfache Vorzeichen genügen: übermässige und verminderte Dreiklänge über
    // einem doppelt versetzten Grundton wären nicht mehr notierbar.
    const root = rng.pick(candidatePitches(ROOT_WINDOW, [-1, 0, 1]));

    const notes = invertTriad(buildTriad(root, quality), inversion);

    // Unabhängig nachrechnen: der Theoriekern muss in den erklingenden Tönen
    // genau den Akkord erkennen, der als Antwort hinterlegt wird.
    const analysis = analyseTriad(notes);
    insist(analysis !== null, `${notes.map(pitchKey).join(' ')} ist kein Dreiklang`);
    insist(
      analysis!.quality === quality,
      `${notes.map(pitchKey).join(' ')} klingt ${analysis!.quality}, nicht ${quality}`,
    );
    insist(
      analysis!.inversion === inversion,
      `${notes.map(pitchKey).join(' ')} ist ${analysis!.inversion}, nicht ${inversion}`,
    );

    const id = taskId('ga', rng);
    return {
      task: {
        id,
        kind: 'select',
        fieldColumns: 2,
        fields: [
          {
            id: 'a',
            label: askInversion ? 'Geschlecht' : undefined,
            optionSet: 'triadQuality',
            correct: quality,
            points: 1,
            buttons: true,
          },
          ...(askInversion
            ? [
                {
                  id: 'inv',
                  label: 'Umkehrung',
                  optionSet: 'inversion',
                  correct: inversion,
                  points: 1,
                  buttons: true,
                },
              ]
            : []),
        ],
      },
      audio: { id, kind: 'chord', root: pitchKey(root), quality, inversion, broken },
      // Wer «übermässig» antwortet, muss die Umkehrung nicht mehr angeben —
      // sie ist bei diesem Geschlecht nicht hörbar. Die Sperre hängt an der
      // gegebenen Antwort, nicht an der richtigen; sonst wäre sie ein Verrat.
      waiver: askInversion
        ? { field: 'a', values: SYMMETRIC_QUALITIES, waives: ['inv'], reason: WAIVER_REASON }
        : undefined,
      instruction: broken
        ? `Du hörst den Dreiklang gebrochen und dann zusammen. Bestimme ${
            askInversion ? 'Geschlecht und Umkehrung' : 'das Geschlecht'
          }.`
        : `Du hörst den Dreiklang als Zusammenklang. Bestimme ${
            askInversion ? 'Geschlecht und Umkehrung' : 'das Geschlecht'
          }.`,
      maxPlays: limitPlays ? LIMITED_PLAYS : undefined,
    };
  },
};

/** Für Tests und Anzeige: der ausgeschriebene Name eines Geschlechts. */
export { TRIAD_LABELS };
