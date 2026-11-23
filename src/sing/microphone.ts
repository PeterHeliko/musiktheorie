/**
 * Mikrofonzugang — einmal geöffnet, für alle Seiten.
 *
 * Es gibt genau einen Zugang. Er bleibt offen, solange die Seite nicht neu
 * lädt, auch wenn man zwischen Übungen wechselt: Safari würde sonst bei jedem
 * Öffnen erneut um Erlaubnis fragen.
 *
 * Datenschutz: das Signal wird nur hier im Browser ausgewertet. Es wird nichts
 * aufgezeichnet, gespeichert oder verschickt.
 */

export interface Microphone {
  context: AudioContext;
  analyser: AnalyserNode;
  stream: MediaStream;
  /** Was der Browser tatsächlich eingestellt hat — für die Fehlersuche auf Geräten. */
  settings: MediaTrackSettings;
}

/** Fenstergrösse für die Tonhöhenerkennung; siehe detectPitch(). */
export const ANALYSIS_WINDOW = 2048;

let current: Promise<Microphone> | null = null;

/**
 * Mikrofon öffnen oder das offene zurückgeben. Muss aus einer Nutzeraktion
 * heraus aufgerufen werden (Klick), sonst verweigern Safari und Chrome den
 * Audiokontext.
 */
export function openMicrophone(): Promise<Microphone> {
  if (!current) {
    current = open().catch((error) => {
      current = null;
      throw error;
    });
  }
  return current;
}

async function open(): Promise<Microphone> {
  if (!globalThis.navigator?.mediaDevices?.getUserMedia) {
    throw new MicrophoneError(
      'unsupported',
      'Dieser Browser erlaubt keinen Zugriff auf das Mikrofon (oder die Seite ist nicht über https geöffnet).',
    );
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        // Alle drei Aufbereitungen verfälschen die Tonhöhe oder schneiden
        // gehaltene Töne ab — für Sprache gedacht, nicht für Gesang.
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
  } catch (error) {
    const name = error instanceof DOMException ? error.name : '';
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      throw new MicrophoneError(
        'denied',
        'Der Zugriff auf das Mikrofon wurde nicht erlaubt. Du kannst ihn in den Einstellungen des Browsers für diese Seite freigeben.',
      );
    }
    if (name === 'NotFoundError' || name === 'OverconstrainedError') {
      throw new MicrophoneError('missing', 'Es wurde kein Mikrofon gefunden.');
    }
    throw new MicrophoneError('failed', `Das Mikrofon liess sich nicht öffnen (${name || String(error)}).`);
  }

  const context = new AudioContext();
  // iOS startet den Kontext angehalten, auch aus einem Klick heraus.
  if (context.state === 'suspended') await context.resume();

  const source = context.createMediaStreamSource(stream);
  const analyser = context.createAnalyser();
  analyser.fftSize = ANALYSIS_WINDOW;
  // Keine Glättung: die Zeitdaten sollen roh sein.
  analyser.smoothingTimeConstant = 0;
  source.connect(analyser);
  // Bewusst NICHT mit context.destination verbinden — sonst hört man sich
  // selbst, und über Lautsprecher entstünde eine Rückkopplung.

  const settings = stream.getAudioTracks()[0]?.getSettings() ?? {};
  return { context, analyser, stream, settings };
}

/** Mikrofon schliessen — das Aufnahmezeichen des Browsers verschwindet. */
export async function closeMicrophone(): Promise<void> {
  if (!current) return;
  const pending = current;
  current = null;
  try {
    const microphone = await pending;
    for (const track of microphone.stream.getTracks()) track.stop();
    await microphone.context.close();
  } catch {
    // War gar nicht offen.
  }
}

export class MicrophoneError extends Error {
  constructor(
    readonly reason: 'unsupported' | 'denied' | 'missing' | 'failed',
    message: string,
  ) {
    super(message);
  }
}
