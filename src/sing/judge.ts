/**
 * Gesungene Töne gegen die Aufgabe — ohne Browser, deshalb testbar.
 *
 * Gilt für «Intervalle singen» und folgt drei Entscheiden (2026-11-23).
 * Tonfolgen (Dreiklänge, Septakkorde, Tonleitern singen) stehen weiter unten
 * bei `judgeSequence`; dort gibt es kein «Ohne Fehlerurteil».
 *
 *  - Der erste gehaltene Ton entscheidet; es gibt kein «Prüfen». Mit der
 *    Einstellung «Ohne Fehlerurteil» (`untilRight`) entscheidet erst der
 *    erste richtige: falsche Versuche zählen nicht, man singt weiter.
 *  - Den vorgespielten Ausgangston darf man vorher nachsingen. Er zählt nie
 *    als Antwort und nie gegen einen — auch mehrmals und in jeder Oktave.
 *  - Die Oktave ist egal: der richtige Ton eine Oktave tiefer oder höher als
 *    notiert ist richtig. Dafür prüft die Bewertung auch die Richtung nicht —
 *    eine Terz aufwärts und eine Sexte abwärts enden auf demselben Ton.
 *
 * Mit egaler Oktave gibt es eine Lücke: bei der Oktave haben Ausgangs- und
 * Zielton denselben Namen. Dort zählt deshalb der Abstand: ein Ton desselben
 * Namens ist die Antwort, wenn er eine Oktave vom gespielten Ton liegt oder
 * von dem Ausgangston, wie man ihn selbst nachgesungen hat. Sonst gilt er als
 * nachgesungener Ausgangston in der eigenen Lage.
 *
 * Diese Regeln stehen nur hier. Die Übungsansicht entscheidet damit, wann die
 * Antwort gefallen ist, und die Bewertung (scoring/) mit denselben Regeln, ob
 * sie stimmt — beides kann nicht auseinanderlaufen.
 */

export interface SingGoal {
  /** Ausgangston, MIDI. */
  reference: number;
  /** Zielton in der notierten Lage, MIDI. */
  target: number;
  /** So weit darf der Zielton danebenliegen (Cent). */
  tolerance: number;
}

/** Was ein gehaltener Ton war: der nachgesungene Ausgangston oder die Antwort. */
export type HeldRole = 'reference' | 'answer';

export function pitchClass(midi: number): number {
  return ((Math.round(midi) % 12) + 12) % 12;
}

/**
 * Rolle jedes gehaltenen Tons, in der gesungenen Reihenfolge. Nach der ersten
 * Antwort ist die Aufgabe entschieden; was danach kommt, ist bedeutungslos.
 */
export function rolesOf(goal: SingGoal, notes: readonly number[]): HeldRole[] {
  const referenceClass = pitchClass(goal.reference);
  const span = Math.abs(goal.target - goal.reference);
  const sameName = pitchClass(goal.target) === referenceClass;
  // Wo der Ausgangston liegt: gespielt, und wie er nachgesungen wurde.
  const anchors = [goal.reference];

  return notes.map((note): HeldRole => {
    const nearest = Math.round(note);
    if (pitchClass(nearest) !== referenceClass) return 'answer';
    if (!sameName) return 'reference';
    // Prime: der Ausgangston ist die Antwort.
    if (span === 0) return 'answer';
    // Oktave: eine Oktave neben einem der Ausgangstöne.
    if (anchors.some((anchor) => Math.abs(nearest - anchor) === span)) return 'answer';
    anchors.push(nearest);
    return 'reference';
  });
}

/** Wie ein einzelner gesungener Ton als Antwort dasteht. */
export interface NoteVerdict {
  correct: boolean;
  /** Der richtige Ton, unabhängig von der Genauigkeit. */
  rightNote: boolean;
  /**
   * Abweichung vom Zielton in der gesungenen Oktave (Cent, positiv = zu
   * hoch) — nur, wenn der richtige Ton gesungen wurde, sonst null.
   */
  cents: number | null;
  /** In welcher Oktave, relativ zur notierten: −1 = eine Oktave tiefer. */
  octaveShift: number;
}

export interface SungVerdict extends NoteVerdict {
  /** Stelle der entscheidenden Antwort in der Liste; -1 = noch keine. */
  index: number;
  /** Der entscheidende Ton (MIDI mit Nachkommastellen), oder null. */
  note: number | null;
}

/** Ein gesungener Ton als Antwort — ob er der Ausgangston war, sagt `rolesOf()`. */
export function judgeNote(goal: SingGoal, note: number): NoteVerdict {
  const rightNote = pitchClass(note) === pitchClass(goal.target);
  const octaveShift = Math.round((note - goal.target) / 12);
  const cents = rightNote ? Math.round((note - (goal.target + 12 * octaveShift)) * 100) : null;
  return {
    correct: rightNote && Math.abs(cents!) <= goal.tolerance,
    rightNote,
    cents,
    octaveShift: rightNote ? octaveShift : 0,
  };
}

/**
 * Das Urteil über die gesungenen Töne. Gewöhnlich entscheidet die erste
 * Antwort; mit `untilRight` die erste richtige — ohne sie gibt es dann noch
 * kein Urteil.
 */
export function judgeSung(
  goal: SingGoal,
  notes: readonly number[],
  { untilRight = false }: { untilRight?: boolean } = {},
): SungVerdict {
  const roles = rolesOf(goal, notes);
  for (let index = 0; index < notes.length; index++) {
    if (roles[index] !== 'answer') continue;
    const verdict = judgeNote(goal, notes[index]);
    if (verdict.correct || !untilRight) return { index, note: notes[index], ...verdict };
  }
  return { index: -1, note: null, correct: false, rightNote: false, cents: null, octaveShift: 0 };
}

// ---------------------------------------------------------------------------
// Mehrere Töne nacheinander (Dreiklänge, Septakkorde, Tonleitern singen)
// ---------------------------------------------------------------------------

/**
 * Eine Tonfolge singen, etwa die drei Töne eines Dreiklangs von unten nach
 * oben (Entscheid 2026-11-24). Der vorgespielte Ton ist der erste der Folge.
 */
export interface SequenceGoal {
  /** Der vorgespielte Ton, MIDI. */
  reference: number;
  /** Die Töne in der notierten Lage, MIDI, in der verlangten Reihenfolge; der erste ist `reference`. */
  targets: number[];
  /** So weit darf ein Ton danebenliegen (Cent). */
  tolerance: number;
  /**
   * Der letzte Ton ist frei (die Oktave am Ende einer Tonleiter): Ton für Ton
   * ist die Folge mit dem vorletzten zu Ende, im Tempo darf der letzte Schlag
   * stumm bleiben.
   */
  optionalLast?: boolean;
}

/** Wie viele Töne der Folge gesungen sein müssen. */
export function requiredTones(goal: SequenceGoal): number {
  return goal.optionalLast ? goal.targets.length - 1 : goal.targets.length;
}

/** Wie ein gehaltener Ton in der Folge zählt. */
export type SequenceRole = 'right' | 'wrong' | 'repeat' | 'after' | 'missing';

export interface SequenceVerdict {
  /** Alle Töne der Folge sind richtig gesungen — die Aufgabe ist zu Ende. */
  done: boolean;
  /** Zu Ende, und kein falscher Ton dazwischen. */
  correct: boolean;
  /** Je gehaltenem Ton, in der gesungenen Reihenfolge. */
  roles: SequenceRole[];
  /**
   * Die richtig gesungenen Töne: welcher Ton der Folge (`step`) und welcher
   * gehaltene Ton es war. Der vorgespielte erste fehlt, wenn er nicht
   * mitgesungen wurde.
   */
  right: { step: number; index: number; note: number; verdict: NoteVerdict }[];
  /** Wie viele Töne der Folge erledigt sind — der vorgespielte zählt mit, sobald es weitergeht. */
  reached: number;
  /** Jeder falsch gesungene Ton und welcher Ton der Folge verlangt war, in der gesungenen Reihenfolge. */
  wrong: { index: number; note: number; verdict: NoteVerdict; expected: number }[];
}

/**
 * Das Urteil über eine gesungene Tonfolge. Wie beim Intervall: die Oktave
 * jedes Tons ist egal, die Reihenfolge zählt.
 *
 * Ein falscher Ton beendet die Folge nicht (Entscheid 2026-11-24): er zählt
 * als Fehler, verlangt bleibt derselbe Ton, und es geht weiter, bis er
 * kommt. Zu Ende ist die Folge, wenn alle Töne richtig gesungen sind;
 * richtig ist sie, wenn dabei keiner falsch war. Sonst ginge es nach einem
 * Fehler — Tonleitern und Akkorde bauen auf dem vorigen Ton auf — nur noch
 * daneben weiter.
 *
 * Der erste Ton der Folge ist der vorgespielte. Ihn mitzusingen ist erlaubt,
 * aber nicht nötig — wie beim Intervall singen. Wer gleich mit dem zweiten
 * beginnt, liegt richtig; ein kurz angesungener, nicht gehaltener
 * Ausgangston darf deshalb nichts kosten.
 *
 * Einen schon richtig gesungenen Ton noch einmal zu singen, ist kein Fehler —
 * er wird übergangen, solange er nicht der verlangte ist. Sonst zählte ein
 * Ton, der über ein Atemholen hinweg oder nach kurzem Schwanken noch einmal
 * als gehalten erkannt wird (hold.ts), gegen den nächsten. Das gilt auch für
 * den Grundton einer Tonleiter, obwohl er als Oktave am Schluss noch einmal
 * kommt.
 */
export function judgeSequence(goal: SequenceGoal, notes: readonly number[]): SequenceVerdict {
  const roles: SequenceRole[] = [];
  const right: SequenceVerdict['right'] = [];
  const wrong: SequenceVerdict['wrong'] = [];
  let at = 0;
  let done = false;
  const samePitch = (a: number, b: number) => pitchClass(a) === pitchClass(b);

  notes.forEach((note, index) => {
    if (done) {
      roles.push('after');
      return;
    }
    const sung = [goal.reference, ...goal.targets.slice(0, at)];
    if (at > 0 && !samePitch(goal.targets[at], note) && sung.some((tone) => samePitch(tone, note))) {
      roles.push('repeat');
      return;
    }
    // Nicht der vorgespielte Ton: der gilt als gegeben, weiter mit dem zweiten.
    if (at === 0 && goal.targets.length > 1 && !samePitch(goal.targets[0], note)) at = 1;
    const verdict = judgeNote({ reference: goal.reference, target: goal.targets[at], tolerance: goal.tolerance }, note);
    if (verdict.correct) {
      roles.push('right');
      right.push({ step: at, index, note, verdict });
      at++;
      done = at >= requiredTones(goal);
      return;
    }
    roles.push('wrong');
    wrong.push({ index, note, verdict, expected: at });
  });

  return { done, correct: done && wrong.length === 0, roles, right, reached: at, wrong };
}

// ---------------------------------------------------------------------------
// Im Tempo (mit Metronom)
// ---------------------------------------------------------------------------

/** Ein Messpunkt: Zeit (ms) und Tonhöhe, null = nichts Klares gesungen. */
export interface TimedFrame {
  time: number;
  midi: number | null;
}

/**
 * Welcher Teil eines Schlags zählt: ohne den Einsatz (der Ton braucht einen
 * Moment, bis er steht, und die Erkennung hinkt nach) und ohne das Ende (da
 * geht es schon zum nächsten).
 */
export const BEAT_CORE = { from: 0.25, to: 0.9 };

/** So viel des Kerns muss gesungen sein, sonst gilt der Schlag als stumm. */
export const BEAT_VOICED = 0.4;

/**
 * Die Tonhöhe eines Schlags: der Median der gesungenen Werte in seinem Kern.
 * Null, wenn dort zu wenig gesungen wurde.
 */
export function beatPitch(frames: readonly TimedFrame[], start: number, length: number): number | null {
  const from = start + length * BEAT_CORE.from;
  const to = start + length * BEAT_CORE.to;
  const core = frames.filter((frame) => frame.time >= from && frame.time <= to);
  const voiced = core.flatMap((frame) => (frame.midi === null ? [] : [frame.midi])).sort((a, b) => a - b);
  if (core.length === 0 || voiced.length < core.length * BEAT_VOICED) return null;
  const middle = Math.floor(voiced.length / 2);
  return voiced.length % 2 ? voiced[middle] : (voiced[middle - 1] + voiced[middle]) / 2;
}

/**
 * Das Urteil im Tempo: Schlag für Schlag, jeder gegen seinen Ton der Folge,
 * in jeder Oktave. Ein falscher oder stummer Schlag bleibt falsch, und der
 * nächste ist trotzdem dran — die Zeit wartet nicht. Den vorgespielten
 * ersten Ton singt man hier mit: auf den ersten Schlag.
 *
 * Dasselbe Format wie `judgeSequence`, damit Ansicht und Bewertung beides
 * gleich zeigen; `index` ist hier der Schlag. Stumme Schläge stehen in
 * `missing` und haben die Rolle «missing».
 */
export function judgeTimed(
  goal: SequenceGoal,
  beats: readonly (number | null)[],
): SequenceVerdict & { missing: number[] } {
  const roles: SequenceRole[] = [];
  const right: SequenceVerdict['right'] = [];
  const wrong: SequenceVerdict['wrong'] = [];
  const missing: number[] = [];
  beats.slice(0, goal.targets.length).forEach((note, step) => {
    if (note === null && step >= requiredTones(goal)) {
      // Der freie letzte Ton, nicht gesungen: zählt nicht.
      roles.push('after');
      return;
    }
    if (note === null) {
      roles.push('missing');
      missing.push(step);
      return;
    }
    const verdict = judgeNote({ reference: goal.reference, target: goal.targets[step], tolerance: goal.tolerance }, note);
    roles.push(verdict.correct ? 'right' : 'wrong');
    (verdict.correct ? right : wrong).push({ step, index: step, note, verdict, expected: step });
  });
  const done = roles.length === goal.targets.length;
  return {
    done,
    correct: done && wrong.length === 0 && missing.length === 0,
    roles,
    right,
    reached: roles.length,
    wrong,
    missing,
  };
}
