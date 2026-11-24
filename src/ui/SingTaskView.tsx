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
 *     «Ohne Fehlerurteil»: der Zielbereich steht von Anfang an in der Kurve,
 *     ein falscher Ton wird dort nur rot, und es geht weiter, bis der richtige
 *     kommt.
 *
 * Eine Tonfolge (`task.sequence`: Dreiklänge, Septakkorde, Tonleitern):
 * gesungen wird Ton für Ton in der verlangten Reihenfolge. Der erste ist der
 * vorgespielte; ihn mitzusingen ist erlaubt, aber nicht nötig. Jeder richtige
 * Ton wird in der Kurve und im System grün, die Zeile darunter zählt mit. Ein
 * falscher wird rot, an seinem Platz im System, und verlangt bleibt derselbe
 * Ton (Entscheid 2026-11-24); zu Ende ist es, wenn alle richtig gesungen
 * sind. Die Regeln stehen in `judgeSequence`.
 *
 * Nach dem Urteil spielt «Abspielen» die ganze Lösung: Ausgangs- und
 * Zielton bzw. alle Töne der Folge einzeln, dann zusammen.
 *
 * Das Mikrofon bleibt über die Aufgaben hinweg offen; geschlossen wird es
 * beim Verlassen der Übung (ExercisePage).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { player, samplesFor } from '../audio/player';
import { DEFAULT_TEMPO, type AudioEvent } from '../content/audio';
import type { NoteSpec, ScoreSpec, SingTask } from '../content/schema';
import { pitchKey } from '../generators/shared';
import { staffSpace } from '../music/staff-space';
import { midi, parsePitch, toGermanPitch, type Pitch } from '../music/theory';
import type { SingAnswer } from '../scoring';
import { drawCurve, type CurveLine, type CurvePoint } from '../sing/curve';
import { HoldDetector } from '../sing/hold';
import {
  judgeNote,
  judgeSequence,
  judgeSung,
  rolesOf,
  type SequenceGoal,
  type SequenceVerdict,
  type SingGoal,
  type SungVerdict,
} from '../sing/judge';
import { NoiseGate, rms } from '../sing/level';
import {
  ANALYSIS_WINDOW,
  MicrophoneError,
  openMicrophone,
  openedMicrophone,
  type Microphone,
} from '../sing/microphone';
import { midiFromFrequency, pitchFromMidi } from '../sing/notes';
import { PitchSmoother, detectPitch } from '../sing/pitch';
import { useExam } from '../state';
import { Score } from './Score';

/**
 * Der Ausgangston: eine Sekunde, dann rasch ausklingen. Erst danach hört die
 * Seite zu — jede Zehntelsekunde mehr hält das Mikrofon zu. Länger lohnt
 * nicht: die Klaviertöne sind nach einer Sekunde rund 15–20 dB leiser als
 * beim Anschlag, die hohen (ab etwa g¹) als Aufnahme überhaupt nur gut eine
 * Sekunde lang. Mit 1,5 s und 0,4 s Ausklingen blieb am Ende fast eine
 * Sekunde, in der nichts mehr zu hören war und trotzdem niemand zuhörte.
 */
const REFERENCE_TEMPO = 60;
const REFERENCE_QUARTERS = 1;
const REFERENCE_RELEASE = 0.25;

/** So viele Sekunden zeigt die Kurve. */
const HISTORY_SECONDS = 6;

/** Ungefähr so viele Pixel je Halbton; daraus folgt, wie viele ins Bild passen. */
const PIXELS_PER_SEMITONE = 22;
const MIN_SEMITONES = 12;
const MAX_SEMITONES = 24;

type MicState = 'off' | 'opening' | 'on' | 'error';
type Phase = 'waiting' | 'playing' | 'listening' | 'done';

export function SingTaskView({ task }: { task: SingTask }) {
  const { answer, setAnswer } = useExam();
  const reference = useMemo(() => parsePitch(task.reference), [task]);
  const target = useMemo(() => parsePitch(task.target), [task]);
  const goal = useMemo<SingGoal>(
    () => ({ reference: midi(reference), target: midi(target), tolerance: task.tolerance }),
    [task],
  );
  const sequence = useMemo(() => task.sequence?.map(parsePitch) ?? null, [task]);
  const sequenceGoal = useMemo<SequenceGoal | null>(
    () =>
      sequence && { reference: midi(reference), targets: sequence.map(midi), tolerance: task.tolerance },
    [task],
  );
  /** Wie weit die Folge ist: richtig und falsch gesungene Töne. */
  const [progress, setProgress] = useState<SequenceVerdict | null>(null);
  const events = useMemo<AudioEvent[]>(() => [{ pitches: [reference], quarters: REFERENCE_QUARTERS }], [task]);
  /**
   * Nach dem Urteil spielt «Abspielen» die ganze Lösung: die Töne einzeln,
   * wie sie zu singen waren, dann zusammen — wie in den Hörübungen.
   */
  const solution = useMemo<AudioEvent[]>(() => {
    const tones = sequence ?? [reference, target];
    return [
      ...tones.map((pitch) => ({ pitches: [pitch], quarters: 1 })),
      { pitches: [], quarters: 0.5 },
      { pitches: tones, quarters: 3 },
    ];
  }, [task]);

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
    const judged = phaseRef.current === 'done';
    if (!judged) setPhase('playing');
    try {
      await (judged
        ? player.play(solution, DEFAULT_TEMPO)
        : player.play(events, REFERENCE_TEMPO, { finalRelease: REFERENCE_RELEASE }));
    } catch (error) {
      console.warn('Wiedergabe fehlgeschlagen:', error);
      if (mounted.current) setPlayFailed(true);
    }
    if (!mounted.current || token !== playToken.current) return;
    setPlaying(false);
    if (phaseRef.current === 'playing') setPhase('listening');
  }, [events, solution]);

  // Neue Aufgabe bei offenem Mikrofon: gleich abspielen, wenn der Browser es
  // zulässt. Sonst sofort zuhören — der Knopf spielt den Ton auf Wunsch.
  useEffect(() => {
    player.preload(samplesFor([...events, ...solution]));
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
    // Tonfolgen kennen kein «Ohne Fehlerurteil»: ein falscher Ton beendet sie nie.
    const untilRight = !sequenceGoal && task.untilRight === true;
    const referenceLine: CurveLine = {
      midi: goal.reference,
      kind: 'reference',
      label: (at) => nameInOctave(reference, at),
    };
    const targetLine = (pitch: Pitch): CurveLine => ({
      midi: midi(pitch),
      kind: 'target',
      band: task.tolerance,
      label: (at) => nameInOctave(pitch, at),
    });
    const targets = sequence ? sequence.slice(1) : [target];
    const allLines = [referenceLine, ...targets.map(targetLine)];
    // Gewöhnlich erscheinen die Zieltöne erst mit dem Urteil — sonst stünde
    // die Antwort schon da. «Ohne Fehlerurteil» zeigt sie gleich, und das
    // Bild beginnt so, dass alle zu sehen sind.
    const centreOf = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
    return listen(microphone, {
      canvas,
      phase: phaseRef,
      startLines: untilRight ? allLines : [referenceLine],
      endLines: allLines,
      centre: untilRight ? centreOf(allLines.map((line) => line.midi)) : goal.reference,
      judge: sequenceGoal
        ? (held) => {
            const verdict = judgeSequence(sequenceGoal, held);
            const role = verdict.roles[verdict.roles.length - 1];
            setProgress(verdict);
            if (role === 'repeat' || role === 'after') return { kind: 'reference' };
            const mark = role === 'right' ? 'right' : 'wrong';
            if (!verdict.done) return { kind: 'progress', mark };
            const counted = held.filter((_, index) => verdict.roles[index] === 'right' || verdict.roles[index] === 'wrong');
            return { kind: 'done', mark, centre: centreOf(counted) };
          }
        : (held) => {
            const roles = rolesOf(goal, held);
            if (roles[roles.length - 1] === 'reference') return { kind: 'reference' };
            const note = held[held.length - 1];
            const verdict = judgeNote(goal, note);
            const mark = verdict.correct ? 'right' : 'wrong';
            if (untilRight && !verdict.correct) return { kind: 'progress', mark };
            // Zielton und gesungener Ton gemeinsam ins Bild, in der gesungenen Oktave.
            const shownTarget = goal.target + 12 * Math.round((note - goal.target) / 12);
            return { kind: 'done', mark, centre: (note + shownTarget) / 2 };
          },
      onReference: () => setHeardReference(true),
      onAnswer: (notes) => {
        setPhase('done');
        setAnswer(task.id, { notes });
      },
    });
  }, [mic]);

  // Nach dem Urteil steht es auch im System: der Zielton grün, ein falscher
  // Ton rot davor.
  const sung = answer<SingAnswer>(task.id)?.notes;
  const score = useMemo(() => {
    if (sequence && sequenceGoal) {
      const verdict = sung ? judgeSequence(sequenceGoal, sung) : null;
      return verdict?.done ? sequenceScore(task, sequence, verdict) : progressScore(task, progress);
    }
    if (!sung) return task.score;
    const verdict = judgeSung(goal, sung, { untilRight: task.untilRight });
    return verdict.note === null ? task.score : verdictScore(task, target, verdict);
  }, [task, sung, progress]);

  const status =
    phase === 'playing'
      ? 'Hör zu …'
      : phase !== 'listening'
        ? ''
        : sequence
          ? sequenceStatus(progress, sequence.length)
          : heardReference
            ? 'Ausgangston erkannt.'
            : 'Jetzt singen.';

  return (
    <div class="sing-task">
      {task.prompt && <p class="task-prompt task-prompt-strong">{task.prompt}</p>}
      <Score spec={score} />

      <div class="audio-player">
        <button
          type="button"
          class={`play-button ${playing ? 'is-playing' : ''}`}
          onClick={() => void play()}
          disabled={playing}
          aria-label={
            phase === 'done'
              ? playing
                ? 'Lösung läuft'
                : 'Lösung abspielen'
              : playing
                ? 'Ausgangston läuft'
                : 'Ausgangston abspielen'
          }
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
// System nach dem Urteil
// ---------------------------------------------------------------------------

/** So viel Zeichenbreite braucht jede weitere Ganze samt Vorzeichen. */
const NOTE_ROOM = 50;

/**
 * Das System nach dem Urteil: Ausgangston, ein falsch gesungener Ton rot, der
 * Zielton grün — so notiert, wie die Aufgabe ihn meint.
 *
 * Die Oktave zählt beim Singen nicht. Ein falscher Ton steht deshalb in der
 * Oktave, die dem Zielton am nächsten liegt: dort sieht man, wie weit er
 * daneben war. Geschrieben wird er, wie man ihn meist liest (Cis, Es, Fis,
 * As, B); der richtige Ton, nur zu ungenau gesungen, wie der Zielton.
 */
function verdictScore(task: SingTask, target: Pitch, verdict: SungVerdict): ScoreSpec {
  const notes: NoteSpec[] = [{ keys: [task.reference], duration: 'w' }];
  const shown: Pitch[] = [parsePitch(task.reference), target];
  if (!verdict.correct && verdict.note !== null) {
    const heard = pitchFromMidi(Math.round(verdict.note));
    const sung = verdict.rightNote
      ? target
      : { ...heard, octave: heard.octave + Math.round((midi(target) - midi(heard)) / 12) };
    notes.push({ keys: [pitchKey(sung)], duration: 'w', mark: 'wrong' });
    shown.push(sung);
  }
  notes.push({ keys: [task.target], duration: 'w', mark: 'correct' });

  // Mindestens so viel Platz wie vorher, damit das System nicht springt —
  // und genug für die neuen Töne.
  const clef = task.score.clef === 'bass' ? 'bass' : 'treble';
  const needed = staffSpace(clef, shown);
  const before = task.score.space ?? needed;
  return {
    ...task.score,
    width: (task.score.width ?? 110) + NOTE_ROOM * (notes.length - 1),
    space: { above: Math.max(before.above, needed.above), below: Math.max(before.below, needed.below) },
    measures: [{ notes }],
  };
}

/** Die Zeile unter der Kurve während einer Tonfolge. */
function sequenceStatus(progress: SequenceVerdict | null, length: number): string {
  if (!progress) return 'Jetzt singen.';
  const after = progress.right.filter((entry) => entry.step > 0).length;
  const lastWrong = progress.roles[progress.roles.length - 1] === 'wrong';
  if (lastWrong) return `${after} von ${length - 1} Tönen gesungen — der letzte war daneben, versuch ihn noch einmal.`;
  if (after > 0) return `${after} von ${length - 1} Tönen gesungen.`;
  return progress.right.some((entry) => entry.step === 0) ? 'Ausgangston erkannt.' : 'Jetzt singen.';
}

/**
 * Ein falsch gesungener Ton im System: in der Oktave, die dem verlangten am
 * nächsten liegt — dort sieht man, wie weit er daneben war. Geschrieben wird
 * er, wie man ihn meist liest; der richtige Ton, nur zu ungenau gesungen,
 * wie der verlangte.
 */
function wrongPitch(expected: Pitch, wrong: SequenceVerdict['wrong'][number]): Pitch {
  if (wrong.verdict.rightNote) return expected;
  const heard = pitchFromMidi(Math.round(wrong.note));
  return { ...heard, octave: heard.octave + Math.round((midi(expected) - midi(heard)) / 12) };
}

/** Der letzte falsche Ton je verlangtem Ton der Folge. */
function lastWrongs(verdict: SequenceVerdict): Map<number, SequenceVerdict['wrong'][number]> {
  return new Map(verdict.wrong.map((entry) => [entry.expected, entry]));
}

/**
 * Das System während einer Tonfolge: jeder richtig gesungene Ton steht grün
 * an seinem Platz, in der notierten Lage; wo gerade falsch gesungen wurde,
 * steht der falsche rot. Die übrigen Plätze sind noch leer (chordSingTask
 * hält sie von Anfang an frei).
 */
function progressScore(task: SingTask, progress: SequenceVerdict | null): ScoreSpec {
  if (!progress || (progress.right.length === 0 && progress.wrong.length === 0)) return task.score;
  const sequence = task.sequence!.map(parsePitch);
  const done = new Set(progress.right.map((entry) => entry.step));
  const wrongs = lastWrongs(progress);
  const [measure] = task.score.measures;
  const notes = measure.notes.map((note, step): NoteSpec => {
    if (done.has(step)) return step === 0 ? { ...note, mark: 'correct' } : { keys: [task.sequence![step]], duration: 'w', mark: 'correct' };
    const wrong = wrongs.get(step);
    if (wrong && step === progress.reached && step > 0) {
      return { keys: [pitchKey(wrongPitch(sequence[step], wrong))], duration: 'w', mark: 'wrong' };
    }
    return note;
  });
  const clef = task.score.clef === 'bass' ? 'bass' : 'treble';
  const shown = notes.flatMap((note) => (note.keys ?? []).map(parsePitch));
  const needed = staffSpace(clef, shown);
  const before = task.score.space ?? needed;
  return {
    ...task.score,
    space: { above: Math.max(before.above, needed.above), below: Math.max(before.below, needed.below) },
    measures: [{ ...measure, notes }],
  };
}

/**
 * Das System nach einer Tonfolge: der vorgespielte Ton, dann jeder Ton der
 * Folge grün — und wo vorher falsch gesungen wurde, der (letzte) falsche rot
 * davor.
 */
function sequenceScore(task: SingTask, sequence: Pitch[], verdict: SequenceVerdict): ScoreSpec {
  const notes: NoteSpec[] = [];
  const shown: Pitch[] = [...sequence];
  const wrongs = lastWrongs(verdict);
  sequence.forEach((expected, step) => {
    const wrong = wrongs.get(step);
    const wrongNote = (): NoteSpec => {
      const sung = wrongPitch(expected, wrong!);
      shown.push(sung);
      return { keys: [pitchKey(sung)], duration: 'w', mark: 'wrong' };
    };
    if (step === 0) {
      // Der vorgespielte Ton steht schon da; richtig nachgesungen wird er grün.
      const sungIt = verdict.right.some((entry) => entry.step === 0);
      notes.push({ keys: [task.reference], duration: 'w', ...(sungIt ? { mark: 'correct' } : {}) });
      if (wrong) notes.push(wrongNote());
      return;
    }
    if (wrong) notes.push(wrongNote());
    notes.push({ keys: [pitchKey(expected)], duration: 'w', mark: 'correct' });
  });

  const clef = task.score.clef === 'bass' ? 'bass' : 'treble';
  const needed = staffSpace(clef, shown);
  const before = task.score.space ?? needed;
  // Platz für die Töne war von Anfang an da; nur die falschen kommen dazu.
  const reserved = task.score.measures[0].notes.length;
  return {
    ...task.score,
    width: (task.score.width ?? 110) + NOTE_ROOM * (notes.length - reserved),
    space: { above: Math.max(before.above, needed.above), below: Math.max(before.below, needed.below) },
    measures: [{ notes }],
  };
}

// ---------------------------------------------------------------------------
// Messschleife
// ---------------------------------------------------------------------------

/**
 * Was ein gehaltener Ton bedeutet: ein nachgesungener Ausgangston, ein
 * Schritt (richtig oder ein verfehlter Versuch), oder die Entscheidung — dann
 * bleibt die Kurve stehen, mit `centre` in der Mitte.
 */
type HeldOutcome =
  | { kind: 'reference' }
  | { kind: 'progress'; mark: 'right' | 'wrong' }
  | { kind: 'done'; mark: 'right' | 'wrong'; centre: number };

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
    startLines,
    endLines,
    centre: startCentre,
    judge,
    onReference,
    onAnswer,
  }: {
    canvas: { current: HTMLCanvasElement | null };
    phase: { current: Phase };
    /** Markierungen beim Zuhören … */
    startLines: CurveLine[];
    /** … und nach dem Urteil. */
    endLines: CurveLine[];
    /** Tonhöhe in der Mitte des Bilds zu Beginn. */
    centre: number;
    /** Ordnet den zuletzt gehaltenen Ton ein, mit allen bisherigen. */
    judge: (held: number[]) => HeldOutcome;
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
  let lines = startLines;
  let centre = startCentre;
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
      const outcome = judge(held.slice());
      if (outcome.kind === 'reference') {
        onReference();
      } else {
        for (const point of history) {
          if (point.midi !== null && point.time >= note.start && point.time <= note.end) point.mark = outcome.mark;
        }
        if (outcome.kind === 'done') {
          lines = endLines;
          centre = outcome.centre;
          stopped = true;
          render();
          onAnswer(held.slice());
          return;
        }
        // Ein verfehlter Versuch: weiter zuhören, auch auf demselben Ton,
        // damit sich ein knapp verfehlter nachstimmen lässt.
        if (outcome.mark === 'wrong') detector.again();
      }
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
