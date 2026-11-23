/**
 * Werkzeug «Tonhöhe anzeigen» — zugleich der Versuch aus Phase 0.
 *
 * Bevor Singübungen gebaut werden, muss feststehen, dass die Tonhöhen-
 * erkennung auf echten Geräten trägt: mit verschiedenen Stimmen, in normalen
 * Räumen, auf Telefonen. Diese Seite zeigt deshalb nicht nur den Ton, sondern
 * unter «Technische Angaben» auch, was der Browser eingestellt hat und wie
 * lange die Auswertung braucht.
 *
 * Der Knopf «Referenzton» prüft das bekannte Risiko auf iPhones: bei offenem
 * Mikrofon kann iOS die Wiedergabe leiser stellen oder auf den Hörer umleiten.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { player } from '../audio/player';
import { parsePitch, toGermanPitch } from '../music/theory';
import { ANALYSIS_WINDOW, MicrophoneError, closeMicrophone, openMicrophone, type Microphone } from '../sing/microphone';
import { NoiseGate, rms, toDb } from '../sing/level';
import { DEFAULT_A4, midiFromFrequency, nameFromMidi, nearestNote, type NearestNote } from '../sing/notes';
import { PitchSmoother, detectPitch } from '../sing/pitch';

/** So viele Sekunden zeigt die Tonhöhenkurve. */
const HISTORY_SECONDS = 8;
/** So viele Halbtöne passen senkrecht ins Bild. */
const VISIBLE_SEMITONES = 15;
/** Innerhalb dieser Abweichung gilt ein Ton als getroffen. */
const IN_TUNE_CENTS = 15;

interface Reading {
  note: NearestNote | null;
  frequency: number | null;
  clarity: number;
  /** Eingangspegel in dBFS. */
  levelDb: number;
  /** Ab diesem Pegel gilt das Signal als Ton (dBFS). */
  thresholdDb: number;
}

const SILENT_READING: Reading = {
  note: null,
  frequency: null,
  clarity: 0,
  levelDb: -Infinity,
  thresholdDb: -Infinity,
};

interface Diagnostics {
  sampleRate: number;
  settings: MediaTrackSettings;
  baseLatency: number | null;
  /** Mittlere Rechenzeit je Auswertung in ms. */
  analysisMs: number;
  /** Auswertungen je Sekunde. */
  rate: number;
  /** Lautester Pegel der letzten Sekunde, dBFS. */
  peakDb: number;
  /** Geschätztes Grundrauschen, dBFS. */
  noiseDb: number;
  thresholdDb: number;
}

export function PitchTool() {
  const [state, setState] = useState<'idle' | 'starting' | 'running' | 'error'>('idle');
  const [error, setError] = useState('');
  const [reading, setReading] = useState<Reading>(SILENT_READING);
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const [a4, setA4] = useState(DEFAULT_A4);
  const canvas = useRef<HTMLCanvasElement>(null);
  const a4Ref = useRef(a4);
  a4Ref.current = a4;
  const stopLoop = useRef<(() => void) | null>(null);

  // Beim Verlassen der Seite: Schleife anhalten und Mikrofon schliessen,
  // damit das Aufnahmezeichen des Browsers verschwindet.
  useEffect(
    () => () => {
      stopLoop.current?.();
      void closeMicrophone();
    },
    [],
  );

  const start = async () => {
    setState('starting');
    setError('');
    try {
      const microphone = await openMicrophone();
      stopLoop.current = runLoop(microphone, canvas, a4Ref, setReading, setDiagnostics);
      setState('running');
    } catch (caught) {
      setError(
        caught instanceof MicrophoneError
          ? caught.message
          : `Das Mikrofon liess sich nicht öffnen (${String(caught)}).`,
      );
      setState('error');
    }
  };

  const stop = async () => {
    stopLoop.current?.();
    stopLoop.current = null;
    await closeMicrophone();
    setReading(SILENT_READING);
    setState('idle');
  };

  const running = state === 'running';
  const note = reading.note;
  const inTune = note !== null && Math.abs(note.cents) <= IN_TUNE_CENTS;

  return (
    <div class="tool-page">
      <h1>Tonhöhe anzeigen</h1>
      <p class="subtitle">
        Singe oder spiele einen Ton. Die Seite zeigt, welcher Ton es ist und wie genau du ihn
        triffst. <span class="tag">Versuch</span>
      </p>
      <p class="privacy-note">
        Der Ton wird nur hier in deinem Browser ausgewertet. Es wird nichts aufgenommen,
        gespeichert oder verschickt.
      </p>

      <div class="tool-controls">
        {running ? (
          <button type="button" class="secondary" onClick={stop}>
            Mikrofon ausschalten
          </button>
        ) : (
          <button type="button" class="primary" onClick={start} disabled={state === 'starting'}>
            {state === 'starting' ? 'Mikrofon wird geöffnet …' : 'Mikrofon einschalten'}
          </button>
        )}
        <ReferenceButton pitchKey="c4" />
        <ReferenceButton pitchKey="a4" />
        <label class="tool-a4">
          Kammerton a¹ ={' '}
          <select
            value={String(a4)}
            onChange={(event) => setA4(Number((event.currentTarget as HTMLSelectElement).value))}
          >
            {[440, 441, 442, 443].map((value) => (
              <option key={value} value={value}>
                {value} Hz
              </option>
            ))}
          </select>
        </label>
      </div>

      {state === 'error' && (
        <div class="notice notice-warning" role="alert">
          <p>{error}</p>
        </div>
      )}

      <div class={`pitch-display ${running ? '' : 'is-idle'}`} aria-live="polite">
        <div class={`pitch-note ${inTune ? 'is-in-tune' : ''}`}>
          {note ? <NoteName name={note.name} /> : <span class="pitch-none">–</span>}
        </div>
        <CentsMeter cents={note?.cents ?? null} />
        <LevelMeter levelDb={reading.levelDb} thresholdDb={reading.thresholdDb} active={running} />
        <div class="pitch-numbers">
          {reading.frequency !== null ? (
            <>
              {reading.frequency.toFixed(1)} Hz ·{' '}
              {note && (note.cents === 0 ? 'genau' : `${note.cents > 0 ? '+' : '−'}${Math.abs(note.cents)} Cent`)}
            </>
          ) : running ? (
            'Kein Ton erkannt'
          ) : (
            'Mikrofon ist aus'
          )}
        </div>
      </div>

      <canvas ref={canvas} class="pitch-curve" aria-label="Verlauf der Tonhöhe der letzten Sekunden" />

      {diagnostics && <DiagnosticsView diagnostics={diagnostics} />}

      <details class="tool-help">
        <summary>So probierst du es aus</summary>
        <ol>
          <li>Mikrofon einschalten und erlauben.</li>
          <li>Einen Moment still sein: die Seite lernt, wie laut der Raum ist.</li>
          <li>
            Einen Ton lang aushalten, etwa auf «a» oder «u». Der Pegel sollte deutlich über die
            Marke gehen und die Anzeige ruhig stehen.
          </li>
          <li>Langsam nach oben und unten gleiten: die Kurve sollte ohne Sprünge folgen.</li>
          <li>
            «Referenzton» antippen, während das Mikrofon an ist. Auf manchen Telefonen wird die
            Wiedergabe dann leiser — genau das soll dieser Versuch zeigen.
          </li>
        </ol>
      </details>
    </div>
  );
}

const SUPERSCRIPT_DIGITS = '⁰¹²³⁴⁵⁶⁷⁸⁹';

/** Für die Beschriftung im Bild, wo es kein <sup> gibt: «c1» → «c¹». */
function superscriptOctave(name: string): string {
  return name.replace(/\d/g, (digit) => SUPERSCRIPT_DIGITS[Number(digit)]);
}

/** «a1» → «a¹», «cis2» → «cis²». */
function NoteName({ name }: { name: string }) {
  const match = /^(.*?)(\d+)$/.exec(name);
  if (!match) return <>{name}</>;
  return (
    <>
      {match[1]}
      <sup>{match[2]}</sup>
    </>
  );
}

function CentsMeter({ cents }: { cents: number | null }) {
  // −50 … +50 Cent auf 0 … 100 %.
  const position = cents === null ? 50 : 50 + cents;
  const inTune = cents !== null && Math.abs(cents) <= IN_TUNE_CENTS;
  return (
    <div class="cents-meter" aria-hidden="true">
      <span class="cents-label">zu tief</span>
      <div class="cents-track">
        <div class="cents-zone" />
        <div class="cents-centre" />
        {cents !== null && (
          <div class={`cents-needle ${inTune ? 'is-in-tune' : ''}`} style={{ left: `${position}%` }} />
        )}
      </div>
      <span class="cents-label">zu hoch</span>
    </div>
  );
}

/** `pitchKey` in wissenschaftlicher Schreibweise wie überall im Code: «a4» = a¹ = 440 Hz. */
/** Anzeigebereich des Pegelmessers. Darunter ist Stille, darüber übersteuert es. */
const LEVEL_MIN_DB = -90;
const LEVEL_MAX_DB = -10;

function levelPercent(db: number): number {
  if (!Number.isFinite(db)) return 0;
  return Math.max(0, Math.min(100, ((db - LEVEL_MIN_DB) / (LEVEL_MAX_DB - LEVEL_MIN_DB)) * 100));
}

/**
 * Wie laut kommt das Mikrofon an — und wo liegt die Schwelle? Hilft beim
 * Ausprobieren: wer singt und keinen Ausschlag über die Marke sieht, ist zu
 * leise oder zu weit weg, nicht falsch.
 */
function LevelMeter({ levelDb, thresholdDb, active }: { levelDb: number; thresholdDb: number; active: boolean }) {
  const above = levelDb > thresholdDb;
  return (
    <div class="level-meter" aria-hidden="true">
      <span class="cents-label">Pegel</span>
      <div class="level-track">
        {active && <div class={`level-fill ${above ? 'is-above' : ''}`} style={{ width: `${levelPercent(levelDb)}%` }} />}
        {active && Number.isFinite(thresholdDb) && (
          <div class="level-threshold" style={{ left: `${levelPercent(thresholdDb)}%` }} />
        )}
      </div>
      <span class="cents-label level-value">{active && Number.isFinite(levelDb) ? `${Math.round(levelDb)} dB` : ''}</span>
    </div>
  );
}

function ReferenceButton({ pitchKey }: { pitchKey: string }) {
  const pitch = parsePitch(pitchKey);
  return (
    <button
      type="button"
      class="secondary"
      onClick={() => void player.play([{ pitches: [pitch], quarters: 3 }], 60)}
    >
      Referenzton <NoteName name={toGermanPitch(pitch)} />
    </button>
  );
}

function DiagnosticsView({ diagnostics }: { diagnostics: Diagnostics }) {
  const { settings } = diagnostics;
  const flag = (value: unknown) => (value === undefined ? 'unbekannt' : value ? 'an' : 'aus');
  return (
    <details class="tool-help">
      <summary>Technische Angaben</summary>
      <dl class="diagnostics">
        <dt>Abtastrate</dt>
        <dd>{diagnostics.sampleRate} Hz</dd>
        <dt>Pegel</dt>
        <dd>
          lautester der letzten Sekunde {formatDb(diagnostics.peakDb)}, Grundrauschen{' '}
          {formatDb(diagnostics.noiseDb)}, Schwelle {formatDb(diagnostics.thresholdDb)}
        </dd>
        <dt>Auswertung</dt>
        <dd>
          {diagnostics.analysisMs.toFixed(2)} ms je Fenster, {Math.round(diagnostics.rate)} pro Sekunde
        </dd>
        <dt>Echounterdrückung</dt>
        <dd>{flag(settings.echoCancellation)}</dd>
        <dt>Rauschunterdrückung</dt>
        <dd>{flag(settings.noiseSuppression)}</dd>
        <dt>Automatische Pegelanpassung</dt>
        <dd>{flag(settings.autoGainControl)}</dd>
        <dt>Grundlatenz</dt>
        <dd>
          {diagnostics.baseLatency !== null ? `${(diagnostics.baseLatency * 1000).toFixed(1)} ms` : 'unbekannt'}
        </dd>
        <dt>Browser</dt>
        <dd class="diagnostics-ua">{navigator.userAgent}</dd>
      </dl>
    </details>
  );
}

function formatDb(db: number): string {
  return Number.isFinite(db) ? `${Math.round(db)} dBFS` : '–';
}

// ---------------------------------------------------------------------------
// Messschleife
// ---------------------------------------------------------------------------

interface Point {
  time: number;
  /** MIDI mit Nachkommastellen, oder null bei Stille. */
  midi: number | null;
}

/**
 * Liest bei jedem Bildaufbau ein Fenster vom Mikrofon, schätzt die Tonhöhe und
 * zeichnet die Kurve. Gibt eine Funktion zum Anhalten zurück.
 */
function runLoop(
  microphone: Microphone,
  canvas: { current: HTMLCanvasElement | null },
  a4: { current: number },
  onReading: (reading: Reading) => void,
  onDiagnostics: (diagnostics: Diagnostics) => void,
): () => void {
  const { analyser, context } = microphone;
  const buffer = new Float32Array(ANALYSIS_WINDOW);
  const smoother = new PitchSmoother();
  // Ob ein Ton da ist, entscheidet der Pegel im Verhältnis zum Raum — nicht
  // eine feste Schwelle. Auf iOS kommt das Mikrofon sehr leise an.
  const gate = new NoiseGate();
  let peak = 0;
  const history: Point[] = [];
  let centre: number | null = null;
  let frame = 0;
  let handle = 0;
  let analysisTotal = 0;
  let analysisCount = 0;
  let windowStart = performance.now();
  let stopped = false;

  const tick = () => {
    if (stopped) return;
    const now = performance.now();
    analyser.getFloatTimeDomainData(buffer);
    const t0 = performance.now();
    const level = rms(buffer);
    const open = gate.update(level, now);
    // Unter der Schwelle gar nicht erst suchen: spart Rechenzeit und
    // verhindert, dass Raumgeräusche als Ton erscheinen.
    const estimate = open ? detectPitch(buffer, context.sampleRate) : null;
    analysisTotal += performance.now() - t0;
    analysisCount++;
    peak = Math.max(peak, level);

    const frequency = smoother.push(estimate);
    const midi = frequency !== null ? midiFromFrequency(frequency, a4.current) : null;
    history.push({ time: now, midi });
    while (history.length > 0 && history[0].time < now - HISTORY_SECONDS * 1000) history.shift();

    if (midi !== null) {
      // Der Bildausschnitt folgt dem Ton gemächlich, damit er nicht zittert.
      centre = centre === null ? midi : centre + (midi - centre) * 0.05;
    }

    // Text nur jedes dritte Bild nachführen: ruhiger zu lesen, weniger Arbeit.
    if (frame % 3 === 0) {
      onReading({
        note: frequency !== null ? nearestNote(frequency, a4.current) : null,
        frequency,
        clarity: estimate?.clarity ?? 0,
        levelDb: toDb(level),
        thresholdDb: toDb(gate.threshold),
      });
    }
    if (now - windowStart > 1000) {
      onDiagnostics({
        sampleRate: context.sampleRate,
        settings: microphone.settings,
        baseLatency: typeof context.baseLatency === 'number' ? context.baseLatency : null,
        analysisMs: analysisTotal / analysisCount,
        rate: (analysisCount * 1000) / (now - windowStart),
        peakDb: toDb(peak),
        noiseDb: gate.noiseFloor !== null ? toDb(gate.noiseFloor) : -Infinity,
        thresholdDb: toDb(gate.threshold),
      });
      peak = 0;
      analysisTotal = 0;
      analysisCount = 0;
      windowStart = now;
    }

    if (canvas.current) draw(canvas.current, history, centre, now);
    frame++;
    handle = requestAnimationFrame(tick);
  };

  handle = requestAnimationFrame(tick);
  return () => {
    stopped = true;
    cancelAnimationFrame(handle);
  };
}

function draw(element: HTMLCanvasElement, history: Point[], centre: number | null, now: number): void {
  const ratio = globalThis.devicePixelRatio || 1;
  const width = element.clientWidth;
  const height = element.clientHeight;
  if (element.width !== Math.round(width * ratio) || element.height !== Math.round(height * ratio)) {
    element.width = Math.round(width * ratio);
    element.height = Math.round(height * ratio);
  }
  const g = element.getContext('2d');
  if (!g) return;
  g.setTransform(ratio, 0, 0, ratio, 0, 0);

  const styles = getComputedStyle(element);
  const ink = styles.getPropertyValue('--ink-soft').trim() || '#5b6472';
  const line = styles.getPropertyValue('--line').trim() || '#d9dee6';
  const accent = styles.getPropertyValue('--accent').trim() || '#1d6fa5';
  const surface = styles.getPropertyValue('--surface').trim() || '#fff';

  g.fillStyle = surface;
  g.fillRect(0, 0, width, height);

  const mid = centre ?? 64;
  const low = mid - VISIBLE_SEMITONES / 2;
  const y = (midi: number) => height - ((midi - low) / VISIBLE_SEMITONES) * height;
  const labelWidth = 34;

  // Raster: eine Linie je Halbton, beschriftet sind die Stammtöne.
  g.font = '12px system-ui, sans-serif';
  g.textBaseline = 'middle';
  for (let midi = Math.ceil(low); midi <= low + VISIBLE_SEMITONES; midi++) {
    const natural = [0, 2, 4, 5, 7, 9, 11].includes(((midi % 12) + 12) % 12);
    g.strokeStyle = line;
    g.lineWidth = natural ? 1 : 0.5;
    g.globalAlpha = natural ? 1 : 0.5;
    g.beginPath();
    g.moveTo(labelWidth, y(midi));
    g.lineTo(width, y(midi));
    g.stroke();
    if (natural) {
      g.globalAlpha = 1;
      g.fillStyle = ink;
      g.fillText(superscriptOctave(nameFromMidi(midi)), 4, y(midi));
    }
  }
  g.globalAlpha = 1;

  // Kurve: Lücken bei Stille bleiben Lücken.
  const x = (time: number) =>
    labelWidth + ((time - (now - HISTORY_SECONDS * 1000)) / (HISTORY_SECONDS * 1000)) * (width - labelWidth);
  g.strokeStyle = accent;
  g.lineWidth = 2.5;
  g.lineJoin = 'round';
  g.beginPath();
  let drawing = false;
  for (const point of history) {
    if (point.midi === null) {
      drawing = false;
      continue;
    }
    if (drawing) g.lineTo(x(point.time), y(point.midi));
    else g.moveTo(x(point.time), y(point.midi));
    drawing = true;
  }
  g.stroke();
}
