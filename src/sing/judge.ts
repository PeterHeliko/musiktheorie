/**
 * Gesungene Töne gegen die Aufgabe — ohne Browser, deshalb testbar.
 *
 * Gilt für «Intervalle singen» und folgt drei Entscheiden (2026-11-23):
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
