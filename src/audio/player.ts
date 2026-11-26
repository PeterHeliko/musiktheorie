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
 * rund zweieinhalb Sekunden, und bei einer Melodie läge am Schluss alles
 * gleichzeitig übereinander. Deshalb richtet sich der Nachklang nach der
 * Notendauer — kurze Noten klingen kurz nach, lange lange.
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

/**
 * Begrenzer vor dem Lautsprecher.
 *
 * Jeder Ton für sich bleibt unter -4 dBFS, aber gleichzeitige Töne addieren
 * sich: ein Dreiklang mit Bass erreicht über +2 dBFS, und klingen die
 * gebrochenen Töne davor noch nach, kommt das obendrauf. Über 0 dBFS schneidet
 * der Browser hart ab, und das knackt beim Anschlag.
 *
 * Unterhalb der Schwelle greift der Begrenzer nicht ein, ein einzelner Ton
 * klingt also unverändert. Web Audio hebt dabei alles um gut 1 dB an (das
 * gehört zum Verfahren); auch ein Zusammenklang von +6 dBFS kommt so noch
 * unter 0 dBFS heraus, in Chromium nachgemessen.
 *
 * Der Begrenzer schaut 6 ms voraus und hält dafür jeden Ton 6 ms zurück. In
 * `play()` geht das im Vorlauf unter. Die Klaviatur (`strike`) führt an ihm
 * vorbei: dort soll zwischen Antippen und Klang nichts liegen, und ein
 * angeschlagener Ton übersteuert allein nicht.
 */
const LIMIT_THRESHOLD = -2;
const LIMIT_RATIO = 20;
const LIMIT_ATTACK = 0.002;
const LIMIT_RELEASE = 0.15;

/**
 * Ab diesem Pegel gilt ein Sample als verklungen: -50 dBFS.
 *
 * Die Dateien enden erst tief unten (siehe scripts/generate-samples.ts), damit
 * nichts hörbar abbricht. Auf diesen leisen Rest muss «Läuft …» aber nicht
 * warten. Er klingt weiter, nur gilt die Wiedergabe schon als fertig.
 */
const SILENT_BELOW = Math.pow(10, -50 / 20);

function releaseFor(length: number): number {
  return Math.min(MAX_RELEASE, Math.max(MIN_RELEASE, length * RELEASE_RATIO));
}

/** Wie lange ein Sample zu hören ist: bis zum letzten Wert über SILENT_BELOW, in Sekunden. */
export function audibleSeconds(buffer: Pick<AudioBuffer, 'numberOfChannels' | 'sampleRate' | 'getChannelData'>): number {
  let last = -1;
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    // Von hinten: so wird nur der leise Ausklang durchsucht, nicht der ganze Ton.
    for (let i = data.length - 1; i > last; i--) {
      if (Math.abs(data[i]) > SILENT_BELOW) {
        last = i;
        break;
      }
    }
  }
  return (last + 1) / buffer.sampleRate;
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
  /** Gemeinsamer Ausgang aller Töne, siehe LIMIT_THRESHOLD. */
  private output: AudioNode | null = null;
  private readonly buffers = new Map<string, AudioBuffer>();
  /** Je Sample: wie lange es zu hören ist (audibleSeconds), einmal beim Laden gemessen. */
  private readonly audible = new Map<string, number>();
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

  /** Alle Töne laufen durch denselben Begrenzer, sonst addierten sie sich daran vorbei. */
  private out(): AudioNode {
    if (!this.output) {
      const context = this.ctx();
      const limiter = context.createDynamicsCompressor();
      limiter.threshold.value = LIMIT_THRESHOLD;
      limiter.knee.value = 0;
      limiter.ratio.value = LIMIT_RATIO;
      limiter.attack.value = LIMIT_ATTACK;
      limiter.release.value = LIMIT_RELEASE;
      limiter.connect(context.destination);
      this.output = limiter;
    }
    return this.output;
  }

  private load(name: string): Promise<AudioBuffer | null> {
    const cached = this.loading.get(name);
    if (cached) return cached;

    const task = (async () => {
      try {
        const response = await fetch(sampleUrl(name));
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const buffer = await this.ctx().decodeAudioData(await response.arrayBuffer());
        this.audible.set(name, audibleSeconds(buffer));
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
   * Spielt die Ereignisfolge ab und löst auf, sobald die Musik vorbei und
   * nichts mehr zu hören ist. Ein laufendes Beispiel wird vorher abgebrochen.
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
    /** Bis wann irgendein Ton noch zu hören ist, in der Zeit des Kontexts. */
    let heardUntil = start;
    const sound = (name: string, rate: number, at: number, length: number, ringOut: number | null) => {
      const scheduled = this.schedule(name, rate, at, length, ringOut, sources);
      if (scheduled) heardUntil = Math.max(heardUntil, scheduled.heardUntil);
    };
    events.forEach((event, index) => {
      const at = start + offset * secondsPerQuarter;
      const length = event.quarters * secondsPerQuarter;
      const isLast = index === events.length - 1;
      offset += event.quarters;

      if (event.click) {
        sound(CLICK, 1, at, length, null);
        return;
      }
      for (const pitch of event.pitches) {
        const { name, rate } = sampleFor(pitch);
        sound(name, rate, at, length, isLast ? finalRelease : null);
      }
    });

    // Fertig ist, wenn die Musik vorbei ist UND nichts mehr zu hören ist. Nie
    // vor dem notierten Ende: das Metronom beim Singen im Tempo zählt bis zum
    // letzten Schlag. Aber auch nicht später, als der Schlusston wirklich
    // klingt; die volle Ausklingzeit war sonst zum grossen Teil Stille.
    const finished = Math.max(start + offset * secondsPerQuarter, heardUntil);

    return new Promise<void>((resolve) => {
      const timer = globalThis.setTimeout(() => {
        if (this.playing?.sources === sources) this.playing = null;
        resolve();
      }, (finished - context.currentTime) * 1000);

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
      // Direkt zum Lautsprecher, am Begrenzer vorbei (siehe LIMIT_THRESHOLD).
      const scheduled = this.schedule(name, rate, context.currentTime, seconds, release, [], context.destination);
      if (!scheduled) return;
      const { source } = scheduled;
      this.struck.add(source);
      source.onended = () => this.struck.delete(source);
    };
    if (this.buffers.has(name)) sound();
    else void this.load(name).then((buffer) => buffer && sound());
  }

  /**
   * Ein Ton: Sample → Hüllkurve → Ausgang. Die Hüllkurve dämpft am notierten
   * Ende; ohne sie klängen alle Töne bis zum Ende des Samples weiter.
   *
   * `heardUntil`: bis dahin ist der Ton zu hören. Je nachdem, was früher
   * kommt: das Ende der Hüllkurve oder das Verklingen des Samples selbst.
   */
  private schedule(
    name: string,
    rate: number,
    at: number,
    length: number,
    /** Ausklingzeit des Schlusstons; null = gewöhnlicher Ton. */
    ringOut: number | null,
    sources: AudioBufferSourceNode[],
    /** Wohin der Ton geht; gewöhnlich durch den Begrenzer. */
    output?: AudioNode,
  ): { source: AudioBufferSourceNode; heardUntil: number } | null {
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

    source.connect(gain).connect(output ?? this.out());
    source.start(at);
    source.stop(dampenAt + release);
    sources.push(source);
    const audible = this.audible.get(name) ?? buffer.duration;
    return { source, heardUntil: Math.min(dampenAt + release, at + audible / rate) };
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
