/**
 * Eine Singaufgabe: das verlangte Intervall, der Ausgangston im System, der
 * Abspielknopf und darunter die Tonhöhenkurve wie im Werkzeug «Tonhöhe».
 *
 * Ablauf (Entscheid 2026-11-23):
 *  1. Der Ausgangston erklingt — beim ersten Mal, sobald das Mikrofon offen
 *     ist, danach bei jeder neuen Aufgabe von selbst.
 *  2. Erst wenn er verklungen ist, hört die Seite zu. Lautsprecher und
 *     Mikrofon dürfen sich nicht überlagern (CONCEPT §6): sonst hörte sie das
 *     Klavier, womöglich eine Oktave daneben.
 *  3. Jeder gehaltene Ton wird nach `sing/judge.ts` eingeordnet. Der
 *     nachgesungene Ausgangston wird übergangen, der erste andere Ton ist die
 *     Antwort. Dann bleibt die Kurve stehen, der gewertete Teil wird grün oder
 *     rot, der Zielton erscheint, und die Übung wertet — ohne «Prüfen».
 *
 * Das Mikrofon bleibt über die Aufgaben hinweg offen; geschlossen wird es
 * beim Verlassen der Übung (ExercisePage).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { player, samplesFor } from '../audio/player';
import type { AudioEvent } from '../content/audio';
import type { SingTask } from '../content/schema';
import { midi, parsePitch, toGermanPitch, type Pitch } from '../music/theory';
import { drawCurve, type CurveLine, type CurvePoint } from '../sing/curve';
import { HoldDetector } from '../sing/hold';
import { judgeSung, rolesOf, type SingGoal } from '../sing/judge';
import { NoiseGate, rms } from '../sing/level';
import {
  ANALYSIS_WINDOW,
  MicrophoneError,
  openMicrophone,
  openedMicrophone,
  type Microphone,
} from '../sing/microphone';
import { midiFromFrequency } from '../sing/notes';
import { PitchSmoother, detectPitch } from '../sing/pitch';
import { useExam } from '../state';
import { Score } from './Score';

/** Der Ausgangston: anderthalb Sekunden, dann kurz ausklingen. */
const REFERENCE_TEMPO = 60;
const REFERENCE_QUARTERS = 1.5;
const REFERENCE_RELEASE = 0.4;

/** So viele Sekunden zeigt die Kurve. */
const HISTORY_SECONDS = 6;

/** Ungefähr so viele Pixel je Halbton; daraus folgt, wie viele ins Bild passen. */
const PIXELS_PER_SEMITONE = 22;
const MIN_SEMITONES = 12;
const MAX_SEMITONES = 24;

type MicState = 'off' | 'opening' | 'on' | 'error';
type Phase = 'waiting' | 'playing' | 'listening' | 'done';

export function SingTaskView({ task }: { task: SingTask }) {
  const { setAnswer } = useExam();
  const reference = useMemo(() => parsePitch(task.reference), [task]);
  const target = useMemo(() => parsePitch(task.target), [task]);
  const goal = useMemo<SingGoal>(
    () => ({ reference: midi(reference), target: midi(target), tolerance: task.tolerance }),
    [task],
  );
  const events = useMemo<AudioEvent[]>(() => [{ pitches: [reference], quarters: REFERENCE_QUARTERS }], [task]);

  const [mic, setMic] = useState<MicState>(() => (openedMicrophone() ? 'on' : 'off'));
  const [micError, setMicError] = useState('');
  const [phase, setPhaseState] = useState<Phase>('waiting');
  const [playing, setPlaying] = useState(false);
  const [playFailed, setPlayFailed] = useState(false);
  const [heardReference, setHeardReference] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);

  // Die Messschleife liest die Phase bei jedem Bild — als Ref, nicht als Zustand.
  const phaseRef = useRef<Phase>('waiting');
  const setPhase = (next: Phase) => {
    phaseRef.current = next;
    setPhaseState(next);
  };
  const mounted = useRef(true);
  const playToken = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      player.stop();
    };
  }, []);

  const play = useCallback(async () => {
    // Ein neuer Klick bricht die laufende Wiedergabe ab; nur die letzte zählt.
    const token = ++playToken.current;
    setPlaying(true);
    setPlayFailed(false);
    if (phaseRef.current !== 'done') setPhase('playing');
    try {
      await player.play(events, REFERENCE_TEMPO, { finalRelease: REFERENCE_RELEASE });
    } catch (error) {
      console.warn('Wiedergabe fehlgeschlagen:', error);
      if (mounted.current) setPlayFailed(true);
    }
    if (!mounted.current || token !== playToken.current) return;
    setPlaying(false);
    if (phaseRef.current === 'playing') setPhase('listening');
  }, [events]);

  // Neue Aufgabe bei offenem Mikrofon: gleich abspielen, wenn der Browser es
  // zulässt. Sonst sofort zuhören — der Knopf spielt den Ton auf Wunsch.
  useEffect(() => {
    player.preload(samplesFor(events));
    if (mic !== 'on') return;
    let cancelled = false;
    void player.canPlayWithoutGesture().then((allowed) => {
      if (cancelled) return;
      if (allowed) void play();
      else setPhase('listening');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const startMicrophone = async () => {
    setMic('opening');
    setMicError('');
    try {
      await openMicrophone();
      if (!mounted.current) return;
      setMic('on');
      void play();
    } catch (caught) {
      if (!mounted.current) return;
      setMicError(
        caught instanceof MicrophoneError ? caught.message : `Das Mikrofon liess sich nicht öffnen (${String(caught)}).`,
      );
      setMic('error');
    }
  };

  // Zuhören, solange das Mikrofon offen ist und die Aufgabe dasteht.
  useEffect(() => {
    if (mic !== 'on') return;
    const microphone = openedMicrophone();
    if (!microphone) return;
    return listen(microphone, {
      canvas,
      phase: phaseRef,
      goal,
      referencePitch: reference,
      targetPitch: target,
      onReference: () => setHeardReference(true),
      onAnswer: (notes) => {
        setPhase('done');
        setAnswer(task.id, { notes });
      },
    });
  }, [mic]);

  const status =
    phase === 'playing'
      ? 'Hör zu …'
      : phase === 'listening'
        ? heardReference
          ? 'Ausgangston erkannt – jetzt das Intervall.'
          : 'Jetzt singen.'
        : '';

  return (
    <div class="sing-task">
      {task.prompt && <p class="task-prompt task-prompt-strong">{task.prompt}</p>}
      <Score spec={task.score} />

      <div class="audio-player">
        <button
          type="button"
          class={`play-button ${playing ? 'is-playing' : ''}`}
          onClick={() => void play()}
          disabled={playing}
          aria-label={playing ? 'Ausgangston läuft' : 'Ausgangston abspielen'}
        >
          <span class="play-icon" aria-hidden="true">
            {playing ? '❚❚' : '▶'}
          </span>
          <span>{playing ? 'Läuft …' : 'Abspielen'}</span>
        </button>
        {playFailed && (
          <span class="audio-note audio-error">
            Der Ton liess sich nicht laden. Prüfe die Verbindung und versuche es nochmals.
          </span>
        )}
      </div>

      {mic === 'on' ? (
        <>
          <div class="sing-curve">
            <canvas ref={canvas} aria-label="Verlauf der gesungenen Tonhöhe" />
          </div>
          <p class="sing-status" aria-live="polite">
            {status}
          </p>
        </>
      ) : (
        <div class="sing-mic">
          <p class="privacy-note">
            Zum Singen braucht die Seite das Mikrofon. Der Ton wird nur hier in deinem Browser
            ausgewertet; es wird nichts aufgenommen, gespeichert oder verschickt.
          </p>
          <button type="button" class="primary" onClick={startMicrophone} disabled={mic === 'opening'}>
            {mic === 'opening' ? 'Mikrofon wird geöffnet …' : 'Mikrofon einschalten'}
          </button>
          {mic === 'error' && (
            <p class="sing-mic-error" role="alert">
              {micError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Messschleife
// ---------------------------------------------------------------------------

/** Dieser Ton in einer anderen Oktave, mit derselben Schreibweise: «eis1» → «eis». */
function nameInOctave(pitch: Pitch, at: number): string {
  return toGermanPitch({ ...pitch, octave: pitch.octave + Math.round((at - midi(pitch)) / 12) });
}

/**
 * Liest bei jedem Bildaufbau ein Fenster vom Mikrofon, schätzt die Tonhöhe,
 * sucht gehaltene Töne und zeichnet die Kurve. Hält an, sobald die Antwort
 * gefallen ist; die Kurve bleibt dann stehen. Gibt eine Funktion zum Anhalten
 * zurück.
 */
function listen(
  microphone: Microphone,
  {
    canvas,
    phase,
    goal,
    referencePitch,
    targetPitch,
    onReference,
    onAnswer,
  }: {
    canvas: { current: HTMLCanvasElement | null };
    phase: { current: Phase };
    goal: SingGoal;
    referencePitch: Pitch;
    targetPitch: Pitch;
    onReference: () => void;
    onAnswer: (notes: number[]) => void;
  },
): () => void {
  const { analyser, context } = microphone;
  const buffer = new Float32Array(ANALYSIS_WINDOW);
  const smoother = new PitchSmoother();
  // Ob ein Ton da ist, entscheidet der Pegel im Verhältnis zum Raum (level.ts).
  const gate = new NoiseGate();
  const detector = new HoldDetector();
  const history: CurvePoint[] = [];
  const held: number[] = [];
  let centre = goal.reference;
  let lines: CurveLine[] = [
    { midi: goal.reference, kind: 'reference', label: (at) => nameInOctave(referencePitch, at) },
  ];
  let lastNow = performance.now();
  let handle = 0;
  let stopped = false;

  const render = () => {
    const element = canvas.current;
    if (!element) return;
    const semitones = Math.max(
      MIN_SEMITONES,
      Math.min(MAX_SEMITONES, Math.round(element.clientHeight / PIXELS_PER_SEMITONE)),
    );
    drawCurve(element, history, { now: lastNow, seconds: HISTORY_SECONDS, centre, semitones, lines });
  };

  const tick = () => {
    if (stopped) return;
    const now = performance.now();
    lastNow = now;
    analyser.getFloatTimeDomainData(buffer);
    // Der Pegel läuft immer mit, damit die Schwelle den Raum kennt — gesucht
    // wird aber nur, solange zugehört wird.
    const open = gate.update(rms(buffer), now);
    const listening = phase.current === 'listening';
    const frequency = smoother.push(open && listening ? detectPitch(buffer, context.sampleRate) : null);
    const value = frequency !== null ? midiFromFrequency(frequency) : null;

    history.push({ time: now, midi: value });
    while (history.length > 0 && history[0].time < now - HISTORY_SECONDS * 1000) history.shift();
    // Der Ausschnitt folgt der Stimme gemächlich, damit er nicht zittert —
    // auch in eine andere Oktave.
    if (value !== null) centre += (value - centre) * 0.05;

    const note = listening ? detector.push(now, value) : null;
    if (!listening) detector.reset();

    if (note) {
      held.push(note.midi);
      const roles = rolesOf(goal, held);
      if (roles[roles.length - 1] === 'answer') {
        const verdict = judgeSung(goal, held);
        for (const point of history) {
          if (point.midi !== null && point.time >= note.start && point.time <= note.end) {
            point.mark = verdict.correct ? 'right' : 'wrong';
          }
        }
        lines = [
          ...lines,
          {
            midi: goal.target,
            kind: 'target',
            band: goal.tolerance,
            label: (at) => nameInOctave(targetPitch, at),
          },
        ];
        // Zielton und gesungener Ton gemeinsam ins Bild, in der gesungenen Oktave.
        const shownTarget = goal.target + 12 * Math.round((note.midi - goal.target) / 12);
        centre = (note.midi + shownTarget) / 2;
        stopped = true;
        render();
        onAnswer(held.slice());
        return;
      }
      onReference();
    }

    render();
    handle = requestAnimationFrame(tick);
  };

  // Steht die Kurve still, zeichnet sie sich nach dem Drehen neu.
  const onResize = () => {
    if (stopped) render();
  };
  globalThis.addEventListener('resize', onResize);
  handle = requestAnimationFrame(tick);
  return () => {
    stopped = true;
    cancelAnimationFrame(handle);
    globalThis.removeEventListener('resize', onResize);
  };
}
