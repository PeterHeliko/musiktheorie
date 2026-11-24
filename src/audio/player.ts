/**
 * Abspieler für generierte Hörbeispiele.
 *
 * Jede Aufgabe wird neu gewürfelt — es gibt also nichts, was sich vorab
 * rendern liesse. Stattdessen liegt je Halbton EIN Klavierton bereit (siehe
 * `scripts/generate-samples.ts`), und hier wird daraus zur Laufzeit
 * zusammengesetzt, was die Aufgabe gerade verlangt.
 *
 * Warum Samples und kein Synthesizer: Gehörbildung lebt davon, dass der Klang
 * dem entspricht, was man später wiedererkennen soll. Ein Sägezahn taugt zum
 * Stimmen, nicht zum Hören lernen.
 */

import type { AudioEvent } from '../content/audio';
import { midi as midiOf, type Pitch } from '../music/theory';

/** Muss zu scripts/generate-samples.ts passen. */
export const LOWEST_MIDI = 36;
export const HIGHEST_MIDI = 84;

/** Datei des Einzähler-Holzblocks. */
const CLICK = 'click';

/**
 * Ganz kurzes Einblenden.
 *
 * Ein Sample beginnt nicht zwingend beim Nullwert der Schwingung; setzt die
 * Wiedergabe dort hart ein, entsteht ein Knacken. Vier Millisekunden reichen,
 * um das zu vermeiden, und sind zu kurz, um den Anschlag weich zu machen.
 */
const ATTACK = 0.004;

/**
 * Wie lange klingt ein Ton nach, nachdem seine Notendauer um ist?
 *
 * Töne DÜRFEN und SOLLEN einander überlappen — auf einem Klavier hört der
 * vorige Ton nicht auf, wenn der nächste beginnt. Ohne Nachklang klingt eine
 * Tonleiter abgehackt und wie mit der Schere geschnitten.
 *
 * Ganz stehen lassen geht aber auch nicht: die Samples sind ganze Noten von
 * rund drei Sekunden, und bei einer Melodie läge am Schluss alles gleichzeitig
 * übereinander. Deshalb richtet sich der Nachklang nach der Notendauer —
 * kurze Noten klingen kurz nach, lange lange.
 */
const RELEASE_RATIO = 0.9;
const MIN_RELEASE = 0.3;
const MAX_RELEASE = 1.1;

/** Der Schlusston darf ausklingen, statt gedämpft zu werden. */
const FINAL_RELEASE = 2.2;

/**
 * Ein Ton hält seine volle Lautstärke etwas über die Notendauer hinaus — so
 * wie bei einem Pianisten, der die Taste nicht genau auf den Schlag loslässt.
 */
const OVERHANG_RATIO = 0.25;
const MAX_OVERHANG = 0.2;

/** Vorlauf, damit die Planung nie in der Vergangenheit beginnt. */
const SCHEDULE_LEAD = 0.06;

function releaseFor(length: number): number {
  return Math.min(MAX_RELEASE, Math.max(MIN_RELEASE, length * RELEASE_RATIO));
}

function sampleUrl(name: string): string {
  return `${import.meta.env.BASE_URL}samples/${name}.mp3`;
}

/**
 * Welche Datei klingt für diesen Ton, und wie weit muss sie verstimmt werden?
 *
 * Im Regelfall gar nicht: es gibt je Halbton ein Sample, Enharmonik teilt sich
 * eines (fis1 und ges1 klingen gleich). Nur wenn eine Aufgabe aus dem
 * gerenderten Umfang fällt, wird oktavweise verschoben — hörbar in der Lage,
 * aber nie stumm.
 */
export function sampleFor(pitch: Pitch): { name: string; rate: number } {
  const wanted = midiOf(pitch);
  let source = wanted;
  while (source < LOWEST_MIDI) source += 12;
  while (source > HIGHEST_MIDI) source -= 12;
  return { name: String(source), rate: Math.pow(2, (wanted - source) / 12) };
}

/** Alle Sample-Namen, die diese Ereignisfolge braucht. */
export function samplesFor(events: AudioEvent[]): string[] {
  const names = new Set<string>();
  for (const event of events) {
    if (event.click) {
      names.add(CLICK);
      continue;
    }
    for (const pitch of event.pitches) names.add(sampleFor(pitch).name);
  }
  return [...names];
}

export class SamplePlayer {
  private context: AudioContext | null = null;
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly loading = new Map<string, Promise<AudioBuffer | null>>();
  /** Was gerade läuft — damit «Nächste» die Wiedergabe abbrechen kann. */
  private playing: { sources: AudioBufferSourceNode[]; done: () => void } | null = null;
  /** Angeschlagene Einzeltöne (`strike`), solange sie klingen. */
  private readonly struck = new Set<AudioBufferSourceNode>();

  /**
   * Der AudioContext entsteht erst beim ersten Bedarf und darf zu diesem
   * Zeitpunkt noch angehalten sein — Browser erlauben Klang erst nach einer
   * Nutzeraktion. Dekodieren geht auch im angehaltenen Zustand, deshalb kann
   * schon vor dem ersten Klick vorgeladen werden.
   */
  private ctx(): AudioContext {
    if (!this.context) {
      const Ctor = globalThis.AudioContext ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) throw new Error('Dieser Browser kann kein Audio abspielen.');
      this.context = new Ctor();
    }
    return this.context;
  }

  private load(name: string): Promise<AudioBuffer | null> {
    const cached = this.loading.get(name);
    if (cached) return cached;

    const task = (async () => {
      try {
        const response = await fetch(sampleUrl(name));
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const buffer = await this.ctx().decodeAudioData(await response.arrayBuffer());
        this.buffers.set(name, buffer);
        return buffer;
      } catch (error) {
        // Einen einzelnen fehlenden Ton soll die Aufgabe überleben: der Rest
        // erklingt, und die Oberfläche meldet den Fehler.
        console.warn(`Sample ${name} konnte nicht geladen werden:`, error);
        this.loading.delete(name);
        return null;
      }
    })();

    this.loading.set(name, task);
    return task;
  }

  /** Lädt im Hintergrund, ohne dass der Aufrufer warten muss. */
  preload(names: string[]): void {
    for (const name of names) void this.load(name);
  }

  /** Wartet, bis alle genannten Samples bereitstehen. */
  async ensure(names: string[]): Promise<void> {
    await Promise.all(names.map((name) => this.load(name)));
  }

  ready(names: string[]): boolean {
    return names.every((name) => this.buffers.has(name));
  }

  /**
   * Aus einer Nutzeraktion heraus aufrufen (Klick, Tastendruck): danach darf
   * die Seite Klang abspielen, ohne dass erneut geklickt wird — etwa beim
   * automatischen Abspielen der nächsten Aufgabe.
   *
   * Chrome und Firefox merken sich jede Nutzeraktion auf der Seite. iOS nicht:
   * dort muss der Audiokontext IN der Aktion gestartet werden, und erst ein
   * tatsächlich gespielter (hier stiller) Ton gibt ihn dauerhaft frei.
   */
  unlock(): void {
    try {
      const context = this.ctx();
      if (context.state !== 'running') void context.resume();
      const silence = context.createBufferSource();
      silence.buffer = context.createBuffer(1, 1, 22050);
      silence.connect(context.destination);
      silence.start(0);
    } catch {
      // Kein Audio im Browser: dann gibt es auch nichts freizuschalten.
    }
  }

  /**
   * Darf jetzt ohne Klick abgespielt werden? Versucht den Kontext zu starten
   * und wartet dafür kurz. Ohne vorherige Nutzeraktion bleibt er angehalten —
   * dann wird eben nicht automatisch abgespielt, und der Knopf tut es.
   */
  async canPlayWithoutGesture(timeoutMs = 250): Promise<boolean> {
    let context: AudioContext;
    try {
      context = this.ctx();
    } catch {
      return false;
    }
    if (context.state === 'running') return true;
    const resumed = context.resume().then(
      () => true,
      () => false,
    );
    const timeout = new Promise<boolean>((done) => setTimeout(() => done(false), timeoutMs));
    // `state` hat sich durch resume() womöglich geändert — TypeScript weiss das nicht.
    return (await Promise.race([resumed, timeout])) && (context.state as AudioContextState) === 'running';
  }

  /**
   * Spielt die Ereignisfolge ab und löst auf, wenn der letzte Ton verklungen
   * ist. Ein laufendes Beispiel wird vorher abgebrochen.
   *
   * `finalRelease`: so lange klingt der Schlusston aus (s). Vorgabe ist das
   * lange Ausklingen; beim Singen soll er bald schweigen, denn erst danach
   * hört das Mikrofon zu.
   */
  async play(
    events: AudioEvent[],
    tempo: number,
    {
      finalRelease = FINAL_RELEASE,
      onStart,
    }: {
      finalRelease?: number;
      /**
       * Sagt, wann das erste Ereignis zu hören ist, in der Zeit von
       * `performance.now()` — fürs Singen im Tempo, das die Schläge des
       * Metronoms mit dem Mikrofon vergleicht.
       */
      onStart?: (at: number) => void;
    } = {},
  ): Promise<void> {
    this.stop();
    await this.ensure(samplesFor(events));

    const context = this.ctx();
    // Nach einer Nutzeraktion darf der Kontext laufen; ohne dieses resume()
    // bliebe er beim ersten Klick stumm.
    if (context.state === 'suspended') await context.resume();

    const secondsPerQuarter = 60 / tempo;
    const start = context.currentTime + SCHEDULE_LEAD;
    const sources: AudioBufferSourceNode[] = [];
    // Zu hören ist es erst nach der Ausgabeverzögerung (wo der Browser sie kennt).
    const latency = (context as AudioContext & { outputLatency?: number }).outputLatency ?? context.baseLatency ?? 0;
    onStart?.(performance.now() + (start - context.currentTime + latency) * 1000);

    let offset = 0;
    events.forEach((event, index) => {
      const at = start + offset * secondsPerQuarter;
      const length = event.quarters * secondsPerQuarter;
      const isLast = index === events.length - 1;
      offset += event.quarters;

      if (event.click) {
        this.schedule(CLICK, 1, at, length, null, sources);
        return;
      }
      for (const pitch of event.pitches) {
        const { name, rate } = sampleFor(pitch);
        this.schedule(name, rate, at, length, isLast ? finalRelease : null, sources);
      }
    });

    // Fertig ist, wenn der Schlusston verklungen ist: Notendauer, Überhang, Ausklingen.
    const last = events[events.length - 1];
    const overhang = last ? Math.min(MAX_OVERHANG, last.quarters * secondsPerQuarter * OVERHANG_RATIO) : 0;
    const total = offset * secondsPerQuarter + overhang + finalRelease;

    return new Promise<void>((resolve) => {
      const timer = globalThis.setTimeout(() => {
        if (this.playing?.sources === sources) this.playing = null;
        resolve();
      }, (SCHEDULE_LEAD + total) * 1000);

      this.playing = {
        sources,
        done: () => {
          globalThis.clearTimeout(timer);
          resolve();
        },
      };
    });
  }

  /**
   * Ein einzelner Ton, sofort — für die Klaviatur. Anders als `play()` ohne
   * Vorlauf und, wenn das Sample schon geladen ist, ohne auf irgendetwas zu
   * warten: zwischen Antippen und Klang soll nichts liegen. Ein zuvor
   * angeschlagener Ton klingt darunter weiter aus, wie am Klavier.
   *
   * Ist das Sample noch nicht da, erklingt der Ton, sobald es geladen ist.
   */
  strike(pitch: Pitch, { seconds = 1, release = 0.8 }: { seconds?: number; release?: number } = {}): void {
    let context: AudioContext;
    try {
      context = this.ctx();
    } catch {
      return;
    }
    if (context.state !== 'running') void context.resume();
    const { name, rate } = sampleFor(pitch);
    const sound = () => {
      const source = this.schedule(name, rate, context.currentTime, seconds, release, []);
      if (!source) return;
      this.struck.add(source);
      source.onended = () => this.struck.delete(source);
    };
    if (this.buffers.has(name)) sound();
    else void this.load(name).then((buffer) => buffer && sound());
  }

  /**
   * Ein Ton: Sample → Hüllkurve → Ausgang. Die Hüllkurve dämpft am notierten
   * Ende; ohne sie klängen alle Töne bis zum Ende des Samples weiter.
   */
  private schedule(
    name: string,
    rate: number,
    at: number,
    length: number,
    /** Ausklingzeit des Schlusstons; null = gewöhnlicher Ton. */
    ringOut: number | null,
    sources: AudioBufferSourceNode[],
  ): AudioBufferSourceNode | null {
    const buffer = this.buffers.get(name);
    if (!buffer) return null;

    const context = this.ctx();
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;

    const gain = context.createGain();
    const release = ringOut ?? releaseFor(length);
    const dampenAt = at + length + Math.min(MAX_OVERHANG, length * OVERHANG_RATIO);

    // Einblenden gegen das Knacken am Tonanfang …
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(1, at + ATTACK);
    // … volle Lautstärke bis über das Notenende hinaus …
    gain.gain.setValueAtTime(1, dampenAt);
    // … und dann ausklingen. Exponentiell klingt natürlicher als linear, darf
    // aber nie auf 0 laufen — deshalb der winzige Restwert.
    gain.gain.exponentialRampToValueAtTime(0.0001, dampenAt + release);

    source.connect(gain).connect(context.destination);
    source.start(at);
    source.stop(dampenAt + release);
    sources.push(source);
    return source;
  }

  /** Bricht ab, was gerade läuft oder geplant ist, auch angeschlagene Töne. */
  stop(): void {
    for (const source of this.struck) {
      try {
        source.stop();
      } catch {
        // Schon verklungen.
      }
    }
    this.struck.clear();
    const current = this.playing;
    if (!current) return;
    this.playing = null;
    for (const source of current.sources) {
      try {
        source.stop();
      } catch {
        // Eine Quelle, die nie gestartet wurde, wirft — das ist hier egal.
      }
    }
    current.done();
  }
}

/** Ein Abspieler für die ganze Seite; mehrere AudioContexts wären Verschwendung. */
export const player = new SamplePlayer();
