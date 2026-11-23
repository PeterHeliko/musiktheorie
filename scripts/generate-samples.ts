/**
 * Erzeugt die Klaviersamples der Übungsseite.
 *
 *   je eine Tonhöhe → MusicXML → MuseScore (Stapelmodus) → MP3 → ffmpeg → MP3
 *
 * Die Aufgaben entstehen zur Laufzeit, es gibt also kein festes Hörbeispiel,
 * das sich vorrendern liesse. Deshalb rendern wir den kleinsten gemeinsamen
 * Nenner: EINEN Ton je Halbton. Den Rest (Reihenfolge, Zusammenklänge, Tempo,
 * Hüllkurve) setzt `src/audio/player.ts` im Browser zusammen.
 *
 * Enharmonik ist bewusst egal: fis1 und ges1 klingen gleich und teilen sich
 * dieselbe Datei. Deshalb wird nach MIDI-Nummer benannt, nicht nach Tonname.
 *
 * Aufruf:  npm run samples
 * Voraussetzungen: MuseScore Studio (AppImage oder im PATH) und ffmpeg.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const OUT_DIR = join(ROOT, 'public', 'samples');
const WORK_DIR = join(ROOT, '.sample-build');

/**
 * Tonumfang C2–C6 (MIDI 36–84).
 *
 * Untergrenze: der Bassschlüssel der Dreiklangsaufgaben geht bis in die
 * grosse Oktave. Obergrenze: die höchste Aufgabe ist eine Oktave über dem
 * höchsten Startton der Intervallaufgaben. Ein grösserer Umfang kostet nur
 * Platz, ein kleinerer bringt stumme Aufgaben — deshalb hier grosszügig.
 */
const LOWEST_MIDI = 36;
const HIGHEST_MIDI = 84;

/** Ein Viertel entspricht so vielen MusicXML-«divisions». */
const DIVISIONS = 8;

/**
 * Bei diesem Tempo klingt eine Ganze rund 3,4 Sekunden — lang genug, dass ein
 * Ton auch als Schlusston einer Melodie natürlich ausklingt, und kurz genug,
 * dass 49 Dateien zusammen im Megabyte-Bereich bleiben.
 */
const RENDER_TEMPO = 70;

/** Ab welchem Pegel gilt etwas als Stille? */
const SILENCE_THRESHOLD = '-55dB';

/**
 * Ein- und Ausblenden in Sekunden.
 *
 * Ein Sample beginnt nach dem Beschneiden mitten in der Schwingung, nicht beim
 * Nulldurchgang. Ohne diese wenigen Millisekunden knackt jeder Ton beim
 * Einsetzen — und am Ende beim Abbrechen.
 */
const FADE_IN = 0.004;
const FADE_OUT = 0.02;

/**
 * Spitzenpegel, auf den ALLE Samples gemeinsam gebracht werden, in dBFS.
 *
 * Gemeinsam, nicht einzeln: Töne einzeln auf gleiche Lautheit zu bringen
 * (etwa mit `loudnorm`) zerstört das natürliche Gefälle eines Klaviers — hohe
 * Töne sind leiser als tiefe, und das gehört zum Klang. Schlimmer noch:
 * `loudnorm` regelt in einem Durchgang DYNAMISCH nach und zieht bei einem
 * kurzen, abklingenden Ton die Lautstärke im Verlauf hoch. Das hört man als
 * Pumpen und als Knacken am Anfang.
 *
 * Ein einziger Faktor für alle Dateien hebt den Pegel an, ohne irgendetwas am
 * Verhältnis der Töne zueinander zu ändern.
 *
 * Der Abstand zur Vollaussteuerung ist bewusst grosszügig: MP3 ist verlustbehaftet
 * und rekonstruiert scharfe Einschwingvorgänge — den Holzblock des Einzählers
 * vor allem — ein bis zwei Dezibel ÜBER dem gemessenen Pegel. Ohne diesen
 * Sicherheitsabstand übersteuert ausgerechnet das schärfste Geräusch und
 * knackt.
 */
const TARGET_PEAK_DB = -4;

// ---------------------------------------------------------------------------
// Werkzeuge finden
// ---------------------------------------------------------------------------

function findMuseScore(): string {
  const candidates = [
    process.env.MUSESCORE,
    ...readdirSafe(join(process.env.HOME ?? '', 'Applications'))
      .filter((f) => /^MuseScore.*\.AppImage$/i.test(f))
      .map((f) => join(process.env.HOME ?? '', 'Applications', f)),
    join(process.env.HOME ?? '', '.local', 'bin', 'musescore'),
    '/usr/bin/mscore',
    '/usr/bin/musescore',
  ].filter((c): c is string => Boolean(c));

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(
    'MuseScore nicht gefunden. Erwartet wird ein AppImage in ~/Applications oder\n' +
      'mscore im PATH. Alternativ den Pfad über die Umgebungsvariable MUSESCORE setzen.',
  );
}

function readdirSafe(path: string): string[] {
  try {
    return readdirSync(path);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// MusicXML
// ---------------------------------------------------------------------------

/** Stammton und Versetzung zu einer MIDI-Nummer. Kreuze, willkürlich aber egal. */
function spellMidi(midi: number): { step: string; alter: number; octave: number } {
  const NAMES: [string, number][] = [
    ['C', 0], ['C', 1], ['D', 0], ['D', 1], ['E', 0], ['F', 0],
    ['F', 1], ['G', 0], ['G', 1], ['A', 0], ['A', 1], ['B', 0],
  ];
  const [step, alter] = NAMES[midi % 12];
  return { step, alter, octave: Math.floor(midi / 12) - 1 };
}

/** Ein einzelner Ton als Ganze Note, im Violinschlüssel notiert. */
function noteXml(midi: number): string {
  const { step, alter, octave } = spellMidi(midi);
  const alterXml = alter === 0 ? '' : `<alter>${alter}</alter>`;
  return (
    `<note><pitch><step>${step}</step>${alterXml}<octave>${octave}</octave></pitch>` +
    `<duration>${4 * DIVISIONS}</duration><type>whole</type></note>`
  );
}

/** Ein einzelner Holzblockschlag für den Einzähler des Diktats. */
function clickXml(): string {
  return (
    `<note><unpitched><display-step>C</display-step><display-octave>5</display-octave></unpitched>` +
    `<duration>${DIVISIONS}</duration><instrument id="P1-I1"/><type>quarter</type></note>` +
    `<note><rest/><duration>${3 * DIVISIONS}</duration><type>half</type><dot/></note>`
  );
}

function buildMusicXml(body: string, percussion: boolean): string {
  const instrument = percussion
    ? `<score-instrument id="P1-I1">
        <instrument-name>Woodblock</instrument-name>
        <instrument-sound>wood.block</instrument-sound>
      </score-instrument>
      <midi-instrument id="P1-I1"><midi-channel>10</midi-channel><midi-unpitched>77</midi-unpitched></midi-instrument>`
    : `<score-instrument id="P1-I1"><instrument-name>Acoustic Grand Piano</instrument-name></score-instrument>
      <midi-instrument id="P1-I1"><midi-channel>1</midi-channel><midi-program>1</midi-program></midi-instrument>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1">
      <part-name>${percussion ? 'Einzähler' : 'Klavier'}</part-name>
      ${instrument}
    </score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>${DIVISIONS}</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>${percussion ? 'percussion' : 'G'}</sign><line>2</line></clef>
      </attributes>
      <direction placement="above"><direction-type><words>.</words></direction-type><sound tempo="${RENDER_TEMPO}"/></direction>
      ${body}
    </measure>
  </part>
</score-partwise>
`;
}

// ---------------------------------------------------------------------------
// Ablauf
// ---------------------------------------------------------------------------

function run(command: string, args: string[], label: string): void {
  try {
    execFileSync(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      // MuseScore braucht kein Fenster; ohne diese Variable startet es nicht.
      env: { ...process.env, QT_QPA_PLATFORM: 'offscreen' },
      timeout: 15 * 60 * 1000,
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} fehlgeschlagen:\n${details}`);
  }
}

/**
 * Beschneiden und Ein-/Ausblenden — für Messung und Ausgabe identisch, damit
 * der gemessene Spitzenwert wirklich zum ausgegebenen Signal passt.
 *
 * Die Stille am Anfang muss WEG und darf nicht wieder angefügt werden: der
 * Browser setzt die Töne auf die Millisekunde genau aneinander, und jede
 * Vorlaufstille würde als Verzögerung hörbar — eine Tonleiter klänge dann
 * nicht mehr gleichmässig.
 *
 * Der Trick beim Ausblenden: nach `areverse` ist das Ende der Datei ihr
 * Anfang, also blendet ein zweites `afade=t=in` dort ein, wo im Original
 * ausgeblendet werden soll. So braucht es die Gesamtdauer nicht zu kennen.
 */
const TRIM_AND_FADE = [
  `silenceremove=start_periods=1:start_threshold=${SILENCE_THRESHOLD}:start_silence=0`,
  `afade=t=in:st=0:d=${FADE_IN}`,
  'areverse',
  `silenceremove=start_periods=1:start_threshold=${SILENCE_THRESHOLD}:start_silence=0.05`,
  `afade=t=in:st=0:d=${FADE_OUT}`,
  'areverse',
].join(',');

/** Spitzenpegel einer Datei in dBFS, nach demselben Zuschnitt wie die Ausgabe. */
function peakOf(path: string): number {
  const result = spawnSync(
    'ffmpeg',
    ['-v', 'info', '-i', path, '-af', `${TRIM_AND_FADE},volumedetect`, '-f', 'null', '-'],
    { encoding: 'utf8', timeout: 60_000 },
  );
  const match = /max_volume:\s*(-?[\d.]+) dB/.exec(result.stderr ?? '');
  if (!match) throw new Error(`Spitzenpegel von ${path} nicht messbar:\n${result.stderr}`);
  return Number(match[1]);
}

interface Sample {
  name: string;
  xml: string;
}

function allSamples(): Sample[] {
  const samples: Sample[] = [];
  for (let midi = LOWEST_MIDI; midi <= HIGHEST_MIDI; midi++) {
    samples.push({ name: String(midi), xml: buildMusicXml(noteXml(midi), false) });
  }
  samples.push({ name: 'click', xml: buildMusicXml(clickXml(), true) });
  return samples;
}

function main(): void {
  const force = process.argv.includes('--force');
  const museScore = findMuseScore();

  mkdirSync(OUT_DIR, { recursive: true });
  rmSync(WORK_DIR, { recursive: true, force: true });
  mkdirSync(WORK_DIR, { recursive: true });

  // Nur neu rendern, was fehlt oder älter ist als dieses Skript.
  const specTime = statSync(fileURLToPath(import.meta.url)).mtimeMs;
  const samples = allSamples();
  const todo = samples.filter((sample) => {
    const target = join(OUT_DIR, `${sample.name}.mp3`);
    if (force || !existsSync(target)) return true;
    return statSync(target).mtimeMs < specTime;
  });

  if (todo.length === 0) {
    console.log(`Alle ${samples.length} Samples sind aktuell. (--force erzwingt neu)`);
    return;
  }

  console.log(`Erzeuge ${todo.length} von ${samples.length} Samples …`);

  const job: { in: string; out: string }[] = [];
  for (const sample of todo) {
    const xmlPath = join(WORK_DIR, `${sample.name}.musicxml`);
    writeFileSync(xmlPath, sample.xml, 'utf8');
    job.push({ in: xmlPath, out: join(WORK_DIR, `${sample.name}.mp3`) });
  }

  // Ein einziger MuseScore-Start für alle Dateien: der Programmstart dauert
  // länger als das Rendern selbst.
  const jobPath = join(WORK_DIR, 'job.json');
  writeFileSync(jobPath, JSON.stringify(job), 'utf8');
  run(museScore, ['-j', jobPath, '-b', '320'], 'MuseScore-Stapelverarbeitung');

  for (const sample of todo) {
    if (!existsSync(join(WORK_DIR, `${sample.name}.mp3`))) {
      throw new Error(`MuseScore hat ${sample.name}.mp3 nicht erzeugt`);
    }
  }

  // Erst messen, dann anheben: der Faktor gilt für alle Dateien gemeinsam,
  // damit das Lautstärkegefälle des Klaviers erhalten bleibt.
  console.log('Messe Spitzenpegel …');
  const peaks = todo.map((sample) => peakOf(join(WORK_DIR, `${sample.name}.mp3`)));
  const loudest = Math.max(...peaks);
  const gain = TARGET_PEAK_DB - loudest;
  console.log(`  lautester Ton bei ${loudest.toFixed(1)} dB → alle um ${gain.toFixed(1)} dB anheben`);

  for (const sample of todo) {
    const rendered = join(WORK_DIR, `${sample.name}.mp3`);

    // Mono, zugeschnitten, ein- und ausgeblendet, gemeinsam angehoben.
    // Der natürliche Ausklang bleibt stehen; ihn kürzt der Abspieler bei
    // Bedarf mit seiner eigenen Hüllkurve.
    run(
      'ffmpeg',
      [
        '-y', '-v', 'error',
        '-i', rendered,
        '-af', `${TRIM_AND_FADE},volume=${gain.toFixed(2)}dB`,
        '-ac', '1',
        '-ar', '44100',
        '-codec:a', 'libmp3lame',
        '-b:a', '96k',
        join(OUT_DIR, `${sample.name}.mp3`),
      ],
      `ffmpeg für ${sample.name}`,
    );
  }

  rmSync(WORK_DIR, { recursive: true, force: true });

  const total = samples.reduce(
    (sum, sample) => sum + statSync(join(OUT_DIR, `${sample.name}.mp3`)).size,
    0,
  );
  console.log(
    `Fertig. ${samples.length} Dateien (MIDI ${LOWEST_MIDI}–${HIGHEST_MIDI} + click), ` +
      `zusammen ${(total / 1024 / 1024).toFixed(1)} MB.`,
  );
}

main();
