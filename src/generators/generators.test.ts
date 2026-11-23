/**
 * Prüft die Generatoren gegen den Theoriekern.
 *
 * Anders als bei einem festen Aufgabensatz kann hier niemand die Lösungen
 * einmal durchsehen: sie entstehen bei jedem Aufruf neu. Eine Übungsseite,
 * die falsche Lösungen behauptet, ist schlimmer als gar keine — man übt sich
 * den Fehler ein und merkt es erst, wenn es zählt.
 *
 * Vier Fragen an jeden Generator:
 *
 *  1. Stimmt die behauptete Lösung? (rechnet der Generator selbst nach, per
 *     `insist()` — hier zählt, dass er dabei nicht wirft)
 *  2. Bewertet `scoreTask()` die Musterlösung als vollständig richtig, und
 *     eine falsche Antwort als falsch?
 *  3. Wirken die Filter? Jeder eingeschaltete Wert muss vorkommen, jeder
 *     ausgeschaltete nie.
 *  4. Gehen die Takte auf, und bleiben Melodien im gewählten Rahmen?
 */

import { describe, expect, it } from 'vitest';
import { GENERATORS, generatorById } from './index';
import { makeRng } from './rng';
import { TOPIC_GROUPS, type FilterValues, type Question } from './types';
import type { NotationTask, SelectTask, SingTask, Task } from '../content/schema';
import { INTERVAL_SIZE_OPTIONS, intervalAnswer, intervalSizeAnswer, resolveOptions } from '../content/options';
import { VOICE_RANGES, type Voice } from '../sing/voice';
import { fromPitch, scoreTask, type InputNote } from '../scoring';
import { LEDGER_ROOM, windowFor } from './shared';
import {
  durationInQuarters,
  intervalBetween,
  intervalFullName,
  intervalLabel,
  keySignatureSteps,
  measureCapacity,
  midi,
  parsePitch,
  type Duration,
} from '../music/theory';

/** So viele Aufgaben je Durchgang — genug, dass seltene Fälle vorkommen. */
const RUNS = 200;

/** Erzeugt `count` Aufgaben mit den gegebenen Filtern. */
function generate(id: string, filters: FilterValues = {}, count = RUNS): Question[] {
  const generator = generatorById(id);
  if (!generator) throw new Error(`Unbekannter Generator: ${id}`);
  const merged = { ...generator.defaults, ...filters };
  return Array.from({ length: count }, (_, i) => generator.generate(merged, makeRng(i * 2654435761)));
}

// ---------------------------------------------------------------------------
// Musterlösung bauen
// ---------------------------------------------------------------------------

/**
 * Die Antwort, die jemand ohne Fehler gäbe. Absichtlich aus der
 * Aufgabe abgeleitet und nicht vom Generator mitgeliefert: so prüft der Test
 * den Weg, den auch die Oberfläche geht.
 */
function correctAnswerFor(task: Task): unknown {
  if (task.kind === 'select') {
    return Object.fromEntries(task.fields.map((field) => [field.id, field.correct]));
  }
  if (task.kind === 'sing') {
    // Erst den Ausgangston nachsingen (erlaubt), dann genau den Zielton.
    return { notes: [midi(parsePitch(task.reference)), midi(parsePitch(task.target))] };
  }
  if (task.kind !== 'notation') return {};

  const fields = Object.fromEntries((task.fields ?? []).map((f) => [f.id, f.correct]));
  return { n: notationAnswerFor(task), ...(task.fields?.length ? { f: fields } : {}) };
}

function notationAnswerFor(task: NotationTask): unknown {
  const solution = task.solution;
  switch (solution.type) {
    case 'pitch':
      return Object.fromEntries(
        solution.slots.map((slot) => [
          String(slot.slot),
          slot.chord
            ? slot.accept.map((key) => fromPitch(parsePitch(key), 'w'))
            : [fromPitch(parsePitch(slot.accept[0]), 'w')],
        ]),
      );
    case 'slot':
      return Object.fromEntries(
        solution.slots.map((slot) => [
          String(slot.measure),
          { d: slot.duration, ...(slot.dotted ? { dot: true } : {}) },
        ]),
      );
    case 'keysig': {
      const { steps, sign } = keySignatureSteps(solution.accidentals);
      return { sign, placed: steps.map((s) => ({ s, o: 4 })) };
    }
    case 'mark':
      return solution.gaps;
    case 'melody':
      return solution.measures.map((bar) =>
        bar.map((note) => fromPitch(parsePitch(note.keys![0]), note.duration, note.dotted)),
      );
  }
}

/** Eine garantiert falsche Antwort — für die Gegenprobe. */
function wrongAnswerFor(task: Task): unknown {
  if (task.kind === 'select') {
    return Object.fromEntries(task.fields.map((field) => [field.id, `${field.correct}-falsch`]));
  }
  if (task.kind === 'sing') {
    // Einen Halbton neben dem Ziel; ist das der Ausgangston (kleine Sekunde
    // abwärts), zwei — der Ausgangston wäre gar keine Antwort.
    const target = midi(parsePitch(task.target));
    const reference = midi(parsePitch(task.reference));
    const wrong = (target + 1 - reference) % 12 === 0 ? target + 2 : target + 1;
    return { notes: [wrong] };
  }
  if (task.kind !== 'notation') return {};
  const solution = (task as NotationTask).solution;
  if (solution.type === 'mark') {
    // Eine Lücke, die garantiert nicht dabei ist.
    return { n: [99] };
  }
  return { n: undefined };
}

// ---------------------------------------------------------------------------
// Allgemeines
// ---------------------------------------------------------------------------

describe('Verzeichnis', () => {
  it('vergibt eindeutige Kennungen', () => {
    const ids = GENERATORS.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('ordnet jede Übung eines gegliederten Themas einer seiner Gruppen zu', () => {
    for (const generator of GENERATORS) {
      const groups = TOPIC_GROUPS[generator.topic];
      if (groups) {
        expect(
          groups.map((group) => group.id),
          `${generator.id}: Gruppe «${generator.group}» gibt es im Thema nicht`,
        ).toContain(generator.group);
      } else {
        expect(generator.group, `${generator.id}: Thema ohne Gruppen`).toBeUndefined();
      }
    }
  });

  it('nennt für jeden Filter einen Vorgabewert', () => {
    for (const generator of GENERATORS) {
      for (const filter of generator.filters) {
        expect(
          generator.defaults[filter.key],
          `${generator.id}: Filter «${filter.key}» ohne Vorgabe`,
        ).toBeDefined();
      }
    }
  });

  it('kommt mit leeren Filterwerten zurecht', () => {
    // Der gespeicherte Zustand kann veraltet sein — dann muss die Vorgabe
    // greifen, statt dass die Seite mit einer Ausnahme stehen bleibt.
    for (const generator of GENERATORS) {
      const run = () => generator.generate({} as never, makeRng(1));
      expect(run, generator.id).not.toThrow();
    }
  });
});

describe.each(GENERATORS.map((g) => g.id))('%s', (id) => {
  const questions = generate(id);

  it('erzeugt Aufgaben ohne Ausnahme', () => {
    expect(questions).toHaveLength(RUNS);
  });

  it('bewertet die Musterlösung als vollständig richtig', () => {
    for (const question of questions) {
      const result = scoreTask(question.task, correctAnswerFor(question.task));
      expect(result.possible, `${id}: Aufgabe ohne Punkte`).toBeGreaterThan(0);
      expect(
        result.earned,
        `${id}: Musterlösung gibt ${result.earned} von ${result.possible} Punkten — ` +
          result.details.map((d) => `${d.label}: «${d.studentResponse}» statt «${d.correctResponse}»`).join('; '),
      ).toBeCloseTo(result.possible, 6);
    }
  });

  it('bewertet eine falsche Antwort als falsch', () => {
    for (const question of questions) {
      const result = scoreTask(question.task, wrongAnswerFor(question.task));
      expect(result.earned, `${id}: falsche Antwort bekommt Punkte`).toBe(0);
    }
  });

  it('vergibt eindeutige Aufgabenkennungen je Frage', () => {
    // Die Kennung ist der Schlüssel im Antwortspeicher. Zwei Aufgaben mit
    // derselben Kennung würden einander die Antwort überschreiben.
    for (const question of questions) {
      expect(question.task.id).toMatch(/^[a-z]+-[0-9a-z]+$/);
    }
  });

  it('nennt zu jedem Hörbeispiel eine Wiedergabe', () => {
    for (const question of questions) {
      if (!question.audio) continue;
      expect(question.audio.id).toBe(question.task.id);
      if (question.audio.kind === 'melody') expect(question.melody?.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Filter wirken wirklich
// ---------------------------------------------------------------------------

/** Sammelt die Antwortwerte eines Auswahlfelds über viele Aufgaben. */
function answersFor(questions: Question[], fieldId: string): Set<string> {
  const seen = new Set<string>();
  for (const question of questions) {
    const task = question.task as SelectTask;
    const field = task.fields?.find((f) => f.id === fieldId);
    if (field) seen.add(field.correct);
  }
  return seen;
}

describe('Filter', () => {
  it('beschränkt die Gehör-Intervalle auf die angekreuzten', () => {
    const wanted = ['k3', 'g3'];
    const seen = answersFor(generate('intervalle-hoeren', { intervals: wanted }), 'a');
    expect([...seen].sort()).toEqual([...wanted].sort());
  });

  it('lässt jedes angekreuzte Gehör-Intervall auch vorkommen', () => {
    const wanted = ['k2', 'r5', 'tritonus', 'r8'];
    const seen = answersFor(generate('intervalle-hoeren', { intervals: wanted }), 'a');
    expect([...seen].sort()).toEqual([...wanted].sort());
  });

  it('beschränkt die Tonleiterarten', () => {
    const seen = answersFor(
      generate('tonleitern-hoeren', { scaleTypes: ['dur', 'moll-harmonisch'] }),
      'a',
    );
    expect([...seen].sort()).toEqual(['dur', 'moll-harmonisch']);
  });

  it('beschränkt die Dreiklangsgeschlechter beim Hören', () => {
    const seen = answersFor(generate('dreiklaenge-hoeren', { qualities: ['vermindert'] }), 'a');
    expect([...seen]).toEqual(['vermindert']);
  });

  it('spielt Umkehrungen nur, wenn sie erlaubt sind', () => {
    const questions = generate('dreiklaenge-hoeren', {
      inversions: ['grundstellung', 'sextakkord'],
    });
    const seen = new Set(
      questions.map((q) => (q.audio?.kind === 'chord' ? q.audio.inversion : undefined)),
    );
    expect([...seen].sort()).toEqual(['grundstellung', 'sextakkord']);
  });

  it('fragt die Umkehrung auch dann, wenn übermässige Dreiklänge dabei sind', () => {
    // Der Filter bleibt offen: bei Dur, moll und vermindert ist die Umkehrung
    // hörbar. Nur die einzelne Aufgabe entscheidet später, ob sie zählt.
    const questions = generate('dreiklaenge-hoeren', {
      qualities: ['dur', 'uebermaessig'],
      inversions: ['grundstellung', 'sextakkord', 'quartsextakkord'],
      askInversion: true,
    });
    for (const question of questions) {
      expect((question.task as SelectTask).fields.map((f) => f.id)).toEqual(['a', 'inv']);
    }
  });

  it('erlässt die Umkehrung, wer «übermässig» antwortet', () => {
    const [question] = generate(
      'dreiklaenge-hoeren',
      { qualities: ['dur', 'uebermaessig'], inversions: ['grundstellung', 'sextakkord'], askInversion: true },
      1,
    );
    const waiver = question.waiver!;
    expect(waiver.field).toBe('a');
    expect(waiver.values).toEqual(['uebermaessig']);
    expect(waiver.waives).toEqual(['inv']);

    // Die Sperre hängt an der GEGEBENEN Antwort. Sie an der richtigen
    // aufzuhängen würde verraten, wonach gefragt wird.
    const task = question.task as SelectTask;
    const quality = task.fields.find((f) => f.id === 'a')!.correct;
    expect(waiver.values.includes(quality)).toBe(quality === 'uebermaessig');
  });

  it('wertet ohne Umkehrung als vollständig richtig, wenn sie erlassen ist', () => {
    // Die Bewertung sieht die Aufgabe ohne das erlassene Feld — so wie es die
    // Oberfläche macht, wenn «übermässig» gewählt wurde.
    const questions = generate(
      'dreiklaenge-hoeren',
      { qualities: ['uebermaessig'], inversions: ['grundstellung', 'sextakkord'], askInversion: true },
      5,
    );
    for (const question of questions) {
      const task = question.task as SelectTask;
      const withoutInversion: SelectTask = {
        ...task,
        fields: task.fields.filter((field) => field.id !== 'inv'),
      };
      const result = scoreTask(withoutInversion, { a: 'uebermaessig' });
      expect(result.earned).toBeCloseTo(result.possible, 6);
      expect(result.details.map((d) => d.id)).not.toContain(`${task.id}_inv`);
    }
  });

  it('sperrt die Umkehrungsfrage nur, wenn NUR übermässige erlaubt sind', () => {
    const filter = generatorById('dreiklaenge-hoeren')!.filters.find(
      (entry) => entry.key === 'askInversion',
    )!;
    expect(filter.disabledBy).toBeTypeOf('function');
    expect(filter.disabledBy!({ qualities: ['dur', 'moll'] })).toBeNull();
    expect(filter.disabledBy!({ qualities: ['vermindert'] })).toBeNull();
    expect(filter.disabledBy!({ qualities: ['dur', 'uebermaessig'] })).toBeNull();
    expect(filter.disabledBy!({ qualities: ['uebermaessig'] })).toMatch(/übermässig/);
  });

  it('spielt übermässige Dreiklänge weiterhin in allen Umkehrungen', () => {
    // Erlassen ist nur die FRAGE. Als Klangbild bleibt die Umkehrung erlaubt —
    // sie verändert die Lage, und das Geschlecht ist hörbar.
    const questions = generate('dreiklaenge-hoeren', {
      qualities: ['uebermaessig'],
      inversions: ['grundstellung', 'sextakkord', 'quartsextakkord'],
    });
    const seen = new Set(
      questions.map((q) => (q.audio?.kind === 'chord' ? q.audio.inversion : undefined)),
    );
    expect([...seen].sort()).toEqual(['grundstellung', 'quartsextakkord', 'sextakkord']);
  });

  it('beschränkt die notierten Intervalle', () => {
    const wanted = ['k6', 'g7'];
    const seen = answersFor(generate('intervalle-bestimmen', { intervals: wanted }), 'a');
    expect([...seen].sort()).toEqual([...wanted].sort());
  });

  it('hält Aufgaben mit «nur Stammtöne» ohne Vorzeichen', () => {
    const questions = generate('intervalle-bestimmen', { accidentals: 'stammton' });
    for (const question of questions) {
      const keys = (question.task as SelectTask).score!.measures[0].notes[0].keys!;
      for (const key of keys) {
        expect(parsePitch(key).alter, `${key} trägt ein Vorzeichen`).toBe(0);
      }
    }
  });

  it('hält Aufgaben im Bassschlüssel im Bassbereich', () => {
    const questions = generate('intervalle-bestimmen', { clefs: ['bass'], width: 'eng' });
    for (const question of questions) {
      const score = (question.task as SelectTask).score!;
      expect(score.clef).toBe('bass');
      for (const key of score.measures[0].notes[0].keys!) {
        expect(midi(parsePitch(key))).toBeLessThanOrEqual(62);
        expect(midi(parsePitch(key))).toBeGreaterThanOrEqual(43);
      }
    }
  });

  it('akzeptiert bei fester Richtung nur diese eine Lösung', () => {
    for (const direction of ['up', 'down'] as const) {
      const questions = generate('intervalle-notieren', { direction, intervals: ['g3', 'r5'] });
      for (const question of questions) {
        const task = question.task as NotationTask;
        const solution = task.solution;
        expect(solution.type).toBe('pitch');
        if (solution.type !== 'pitch') continue;
        expect(solution.slots[0].accept).toHaveLength(1);

        const start = parsePitch(task.score.measures[0].notes[0].keys![0]);
        const target = parsePitch(solution.slots[0].accept[0]);
        if (direction === 'up') expect(midi(target)).toBeGreaterThan(midi(start));
        else expect(midi(target)).toBeLessThan(midi(start));
      }
    }
  });

  it('verlangt beim Intervall-Notieren nie ein Doppelvorzeichen', () => {
    // Die Werkzeugleiste kennt nur b, Kreuz und ohne. Bei freier Richtung
    // darf auch die nicht gewertete Richtung keins brauchen: sonst sucht man
    // dort vergeblich, statt umzudrehen.
    for (const direction of ['frei', 'up', 'down']) {
      for (const accidentals of ['stammton', 'einfach', 'alle']) {
        for (const width of ['eng', 'weit']) {
          for (const clef of ['treble', 'bass'] as const) {
            const questions = generate('intervalle-notieren', { direction, accidentals, width, clefs: [clef] });
            for (const question of questions) {
              const task = question.task as NotationTask;
              if (task.solution.type !== 'pitch') continue;
              const accept = task.solution.slots[0].accept;
              for (const key of accept) {
                expect(Math.abs(parsePitch(key).alter), `${key} als Lösung`).toBeLessThanOrEqual(1);
              }
              if (direction !== 'frei' || accept.length === 2) continue;

              // Die Gegenrichtung fehlt: dann nur, weil sie zu weit aus dem
              // System führt, nicht wegen eines Doppelvorzeichens.
              const startKey = task.score.measures[0].notes[0].keys![0];
              const start = midi(parsePitch(startKey));
              const other = 2 * start - midi(parsePitch(accept[0]));
              const window = windowFor(clef, width);
              expect(
                other < window.low - LEDGER_ROOM || other > window.high + LEDGER_ROOM,
                `${startKey}: Gegenrichtung zu ${accept[0]} fehlt`,
              ).toBe(true);
            }
          }
        }
      }
    }
  });

  it('beschränkt die Grobbestimmung auf die angekreuzten Grössen', () => {
    const wanted = ['terz', 'septime'];
    const seen = answersFor(generate('intervalle-grob-bestimmen', { intervals: wanted }), 'a');
    expect([...seen].sort()).toEqual([...wanted].sort());
  });

  it('stellt bei der Grobbestimmung nur Stammtöne mit der richtigen Grösse', () => {
    for (const clef of ['treble', 'bass']) {
      for (const width of ['eng', 'weit']) {
        for (const question of generate('intervalle-grob-bestimmen', { clefs: [clef], width })) {
          const task = question.task as SelectTask;
          const [low, high] = task.score!.measures[0].notes[0].keys!.map(parsePitch);
          expect(low.alter, 'Vorzeichen im Notenbild').toBe(0);
          expect(high.alter, 'Vorzeichen im Notenbild').toBe(0);
          expect(intervalSizeAnswer(intervalBetween(low, high).number)).toBe(task.fields[0].correct);
        }
      }
    }
  });

  it('notiert bei der Grobbestimmung ohne Vorzeichen, in jeder Lage', () => {
    for (const clef of ['treble', 'bass']) {
      for (const width of ['eng', 'weit']) {
        for (const question of generate('intervalle-grob-notieren', { clefs: [clef], width })) {
          const task = question.task as NotationTask;
          expect(task.noAccidentals, 'Werkzeugleiste ohne Vorzeichen').toBe(true);
          const solution = task.solution;
          if (solution.type !== 'pitch') throw new Error('keine Tonhöhenaufgabe');
          const start = parsePitch(task.score.measures[0].notes[0].keys![0]);
          expect(start.alter).toBe(0);
          for (const key of solution.slots[0].accept) {
            const target = parsePitch(key);
            expect(target.alter, `${key} trägt ein Vorzeichen`).toBe(0);
            expect(INTERVAL_SIZE_OPTIONS[intervalBetween(start, target).number - 1].label).toBe(task.prompt);
          }
        }
      }
    }
  });

  it('akzeptiert bei der Grobbestimmung mit fester Richtung nur diese eine Lösung', () => {
    for (const direction of ['up', 'down'] as const) {
      for (const question of generate('intervalle-grob-notieren', { direction, intervals: ['sekunde', 'sexte'] })) {
        const task = question.task as NotationTask;
        const solution = task.solution;
        if (solution.type !== 'pitch') throw new Error('keine Tonhöhenaufgabe');
        expect(solution.slots[0].accept).toHaveLength(1);
        const start = parsePitch(task.score.measures[0].notes[0].keys![0]);
        const target = parsePitch(solution.slots[0].accept[0]);
        if (direction === 'up') expect(midi(target)).toBeGreaterThan(midi(start));
        else expect(midi(target)).toBeLessThan(midi(start));
      }
    }
  });

  it('nimmt bei der Prime den Startton genau einmal als Lösung', () => {
    for (const question of generate('intervalle-grob-notieren', { intervals: ['prime'] })) {
      const task = question.task as NotationTask;
      const solution = task.solution;
      if (solution.type !== 'pitch') throw new Error('keine Tonhöhenaufgabe');
      expect(solution.slots[0].accept).toEqual(task.score.measures[0].notes[0].keys);
    }
  });

  it('begrenzt die Vorzeichen der Tonartaufgaben', () => {
    const questions = generate('vorzeichen-setzen', { maxAccidentals: 2 });
    for (const question of questions) {
      const solution = (question.task as NotationTask).solution;
      expect(solution.type).toBe('keysig');
      if (solution.type === 'keysig') expect(Math.abs(solution.accidentals)).toBeLessThanOrEqual(2);
    }
  });

  it('stellt nur die gefragten Felder der Dreiklangsbestimmung', () => {
    const questions = generate('dreiklaenge-bestimmen', { ask: ['inv'] });
    for (const question of questions) {
      const fields = (question.task as SelectTask).fields;
      expect(fields.map((f) => f.id)).toEqual(['inv']);
    }
  });

  it('zeigt im Klaviersystem alle erlaubten Umkehrungen und Lagen', () => {
    const questions = generate('dreiklaenge-bestimmen', {
      ask: ['inv', 'pos'],
      system: 'grand',
    });
    expect([...answersFor(questions, 'inv')].sort()).toEqual([
      'grundstellung',
      'quartsextakkord',
      'sextakkord',
    ]);
    expect([...answersFor(questions, 'pos')].sort()).toEqual([
      'oktavlage',
      'quintlage',
      'terzlage',
    ]);
  });

  it('beschränkt die Stufenaufgabe auf die angekreuzten Stufen', () => {
    const questions = generate('stufen-bestimmen', { degrees: ['5'], keys: ['C-Dur'] });
    for (const question of questions) {
      const fields = (question.task as SelectTask).fields;
      // Die V. Stufe von C-Dur ist G-Dur.
      expect(fields.find((f) => f.id === 'root')!.correct).toBe('G');
      expect(fields.find((f) => f.id === 'gender')!.correct).toBe('dur');
    }
  });

  it('kennt auch die verminderte VII. Stufe', () => {
    const questions = generate('stufen-bestimmen', { degrees: ['7'], keys: ['C-Dur'] }, 20);
    for (const question of questions) {
      const fields = (question.task as SelectTask).fields;
      expect(fields.find((f) => f.id === 'root')!.correct).toBe('H');
      expect(fields.find((f) => f.id === 'gender')!.correct).toBe('vermindert');
    }
  });
});

// ---------------------------------------------------------------------------
// Rhythmus und Melodie gehen auf
// ---------------------------------------------------------------------------

describe('Intervalle singen', () => {
  const sing = (question: Question) => question.task as SingTask;
  const generator = generatorById('intervalle-singen')!;
  /** Wie `generate()`, aber mit Stimmlage. */
  const withVoice = (voice: Voice, filters: FilterValues = {}, count = RUNS) =>
    Array.from({ length: count }, (_, i) =>
      generator.generate({ ...generator.defaults, ...filters }, makeRng(i * 2654435761), { voice }),
    );

  it('bleibt mit beiden Tönen in der Stimmlage', () => {
    for (const voice of ['hoch', 'mittel', 'tief'] as const) {
      const { low, high } = VOICE_RANGES[voice];
      for (const question of withVoice(voice)) {
        for (const key of [sing(question).reference, sing(question).target]) {
          const value = midi(parsePitch(key));
          expect(value, `${voice}: ${key}`).toBeGreaterThanOrEqual(low);
          expect(value, `${voice}: ${key}`).toBeLessThanOrEqual(high);
        }
      }
    }
  });

  it('zeigt den Ausgangston in den angekreuzten Schlüsseln, unabhängig von der Stimmlage', () => {
    for (const voice of ['hoch', 'tief'] as const) {
      const used = new Set(withVoice(voice, { clefs: ['treble', 'bass'] }).map((q) => sing(q).score.clef));
      expect([...used].sort(), voice).toEqual(['bass', 'treble']);
      for (const question of withVoice(voice, { clefs: ['bass'] }, 20)) {
        expect(sing(question).score.clef).toBe('bass');
      }
    }
    const shown = sing(withVoice('mittel', {}, 1)[0]);
    expect(shown.score.clef).toBe('treble');
    expect(shown.score.measures[0].notes[0].keys).toEqual([shown.reference]);
  });

  it('hält den Platz um das System je Einstellung fest', () => {
    for (const voice of ['hoch', 'mittel', 'tief'] as const) {
      for (const clef of ['treble', 'bass']) {
        const spaces = new Set(withVoice(voice, { clefs: [clef] }, 60).map((q) => JSON.stringify(sing(q).score.space)));
        expect(spaces.size, `${voice}/${clef}`).toBe(1);
      }
    }
    // Tiefe Lage im Violinschlüssel braucht unten viel mehr Platz als im Bassschlüssel.
    const below = (clef: string) => sing(withVoice('tief', { clefs: [clef] }, 1)[0]).score.space!.below;
    expect(below('treble')).toBeGreaterThan(below('bass') + 40);
  });

  it('fragt mit und ohne Schlüssel-Einstellung dieselbe Aufgabe', () => {
    // Der Schlüssel wird zuletzt gewürfelt: alte Aufgabenlinks bleiben gültig.
    const plain = withVoice('mittel', {}, 30);
    withVoice('mittel', { clefs: ['treble', 'bass'] }, 30).forEach((question, i) => {
      expect(sing(question).reference).toBe(sing(plain[i]).reference);
      expect(sing(question).target).toBe(sing(plain[i]).target);
    });
  });

  it('verlangt das genannte Intervall in der genannten Richtung', () => {
    for (const question of generate('intervalle-singen')) {
      const task = sing(question);
      const reference = parsePitch(task.reference);
      const target = parsePitch(task.target);
      const name = intervalFullName(intervalBetween(reference, target));
      if (midi(target) === midi(reference)) expect(task.prompt).toBe(name);
      else expect(task.prompt).toBe(`${name} ${midi(target) > midi(reference) ? 'aufwärts' : 'abwärts'}`);
    }
  });

  it('fragt nur die angekreuzten Intervalle, und jedes davon', () => {
    const asked = new Set(
      generate('intervalle-singen', { intervals: ['k3', 'tritonus', 'r8'] }).map((question) => {
        const task = sing(question);
        return intervalAnswer(intervalLabel(intervalBetween(parsePitch(task.reference), parsePitch(task.target))));
      }),
    );
    expect([...asked].sort()).toEqual(['k3', 'r8', 'tritonus']);
  });

  it('hält die Richtung ein', () => {
    for (const question of generate('intervalle-singen', { directions: ['down'], intervals: ['g3', 'r5'] })) {
      const task = sing(question);
      expect(midi(parsePitch(task.target))).toBeLessThan(midi(parsePitch(task.reference)));
      expect(task.prompt).toMatch(/abwärts$/);
    }
  });

  it('übernimmt die Genauigkeit', () => {
    for (const question of generate('intervalle-singen', { tolerance: '15' }, 10)) {
      expect(sing(question).tolerance).toBe(15);
    }
  });

  it('fragt mit demselben Startwert in jeder Stimmlage dasselbe Intervall', () => {
    const [hoch, tief] = [withVoice('hoch', {}, 50), withVoice('tief', {}, 50)];
    hoch.forEach((question, i) => expect(sing(tief[i]).prompt).toBe(sing(question).prompt));
  });

  it('wertet die ganze Aufgabe eine Oktave tiefer als richtig', () => {
    // Ausgangston eine Oktave tiefer nachgesungen, dann der Zielton dort.
    for (const question of generate('intervalle-singen', {}, 50)) {
      const task = sing(question);
      const notes = [midi(parsePitch(task.reference)) - 12, midi(parsePitch(task.target)) - 12];
      expect(scoreTask(task, { notes }).earned, task.prompt).toBe(task.points);
    }
  });

  it('wertet den Zielton allein in einer anderen Oktave als richtig, ausser bei der Oktave', () => {
    // Bei der Oktave wäre der Zielton eine Oktave tiefer der gespielte Ton.
    for (const question of generate('intervalle-singen', { intervals: ['k3', 'r5', 'g7'] }, 50)) {
      const task = sing(question);
      const lower = midi(parsePitch(task.target)) - 12;
      expect(scoreTask(task, { notes: [lower] }).earned, task.prompt).toBe(task.points);
    }
  });

  it('nimmt nach dem Ausgangston den ersten anderen Ton als Antwort', () => {
    for (const question of generate('intervalle-singen', { intervals: ['g3'] }, 20)) {
      const task = sing(question);
      const target = midi(parsePitch(task.target));
      // Ausgangston, dann daneben, dann richtig: zählt nicht mehr.
      const result = scoreTask(task, { notes: [midi(parsePitch(task.reference)), target + 1, target] });
      expect(result.earned).toBe(0);
    }
  });
});

describe('Takte gehen auf', () => {
  it.each(['4/4', '3/4', '2/4'])('füllt bei %s jeden Takt der Pausenaufgabe', (timeSignature) => {
    const questions = generate('pausen-ergaenzen', { timeSignature });
    const capacity = measureCapacity(timeSignature);

    for (const question of questions) {
      const task = question.task as NotationTask;
      const solution = task.solution;
      expect(solution.type).toBe('slot');
      if (solution.type !== 'slot') continue;

      task.score.measures.forEach((bar, index) => {
        const slot = solution.slots.find((s) => s.measure === index)!;
        expect(slot, `Takt ${index + 1} ohne Lücke`).toBeDefined();

        const sum = bar.notes.reduce(
          (total, note) =>
            total +
            (note.placeholder
              ? durationInQuarters(slot.duration, slot.dotted)
              : durationInQuarters(note.duration, note.dotted)),
          0,
        );
        expect(sum, `Takt ${index + 1} bei ${timeSignature}`).toBeCloseTo(capacity, 6);
      });

      // Genau eine Lücke je Takt — sonst stimmt die Anweisung nicht.
      for (const bar of task.score.measures) {
        expect(bar.notes.filter((n) => n.placeholder)).toHaveLength(1);
      }
    }
  });

  it('sucht nur die angekreuzten Pausenwerte', () => {
    const questions = generate('pausen-ergaenzen', {
      durations: ['h', 'q', '8'],
      gaps: ['h'],
    });
    for (const question of questions) {
      const solution = (question.task as NotationTask).solution;
      if (solution.type !== 'slot') continue;
      for (const slot of solution.slots) {
        expect(slot.duration).toBe('h');
        expect(slot.dotted).toBeFalsy();
      }
    }
  });
});

describe('Melodiediktat', () => {
  it.each(['4/4', '3/4', '2/4', '6/8'])('füllt bei %s jeden Takt', (timeSignature) => {
    const questions = generate('melodiediktat', { timeSignature }, 60);
    const capacity = measureCapacity(timeSignature);

    for (const question of questions) {
      const solution = (question.task as NotationTask).solution;
      expect(solution.type).toBe('melody');
      if (solution.type !== 'melody') continue;

      solution.measures.forEach((bar, index) => {
        const sum = bar.reduce(
          (total, note) => total + durationInQuarters(note.duration, note.dotted),
          0,
        );
        expect(sum, `Takt ${index + 1} bei ${timeSignature}`).toBeCloseTo(capacity, 6);
      });
    }
  });

  it('hält die verlangte Anzahl Takte ein', () => {
    for (const bars of [2, 4, 8]) {
      const questions = generate('melodiediktat', { bars }, 30);
      for (const question of questions) {
        const solution = (question.task as NotationTask).solution;
        if (solution.type !== 'melody') continue;
        expect(solution.measures).toHaveLength(bars);
        expect((question.task as NotationTask).score.measures).toHaveLength(bars);
      }
    }
  });

  it('endet auf dem Grundton', () => {
    const questions = generate('melodiediktat', { keys: ['C-Dur'], scale: 'dur' }, 60);
    for (const question of questions) {
      const solution = (question.task as NotationTask).solution;
      if (solution.type !== 'melody') continue;
      const flat = solution.measures.flat();
      const last = flat[flat.length - 1];
      expect(midi(parsePitch(last.keys![0])) % 12).toBe(0);
    }
  });

  it('verwendet nur die erlaubten Notenwerte', () => {
    const allowed: Duration[] = ['h', 'q'];
    const questions = generate('melodiediktat', { durations: ['h', 'q'] }, 60);
    for (const question of questions) {
      const solution = (question.task as NotationTask).solution;
      if (solution.type !== 'melody') continue;
      for (const note of solution.measures.flat()) {
        expect(allowed).toContain(note.duration);
        expect(note.dotted).toBeFalsy();
      }
    }
  });

  it('hält den gewählten Sprungrahmen ein', () => {
    // «nur Sekundschritte»: zwischen zwei Tönen liegt nie mehr als ein
    // Ganzton — abgesehen von der übermässigen Sekunde in harmonisch Moll.
    const questions = generate('melodiediktat', { maxLeap: '1', scale: 'dur' }, 60);
    for (const question of questions) {
      const solution = (question.task as NotationTask).solution;
      if (solution.type !== 'melody') continue;
      const pitches = solution.measures.flat().map((note) => midi(parsePitch(note.keys![0])));
      for (let i = 1; i < pitches.length; i++) {
        expect(Math.abs(pitches[i] - pitches[i - 1]), 'Sprung trotz «nur Sekundschritte»').toBeLessThanOrEqual(2);
      }
    }
  });

  it('bleibt im gewählten Tonumfang', () => {
    // «Quinte» heisst: zwischen tiefstem und höchstem Ton liegen höchstens
    // sieben Halbtöne. Ein zu weiter Umfang macht das Diktat unnötig schwer
    // und sprengt das Notensystem.
    const limits: Record<string, number> = { '4': 7, '7': 12, '9': 16 };
    for (const [span, semitones] of Object.entries(limits)) {
      const questions = generate('melodiediktat', { span, keys: ['C-Dur'] }, 40);
      for (const question of questions) {
        const solution = (question.task as NotationTask).solution;
        if (solution.type !== 'melody') continue;
        const pitches = solution.measures.flat().map((note) => midi(parsePitch(note.keys![0])));
        const reach = Math.max(...pitches) - Math.min(...pitches);
        expect(reach, `Umfang «${span}» ergibt ${reach} Halbtöne`).toBeLessThanOrEqual(semitones);
      }
    }
  });

  it.each(['2', '4'])('hält auch den Sprungrahmen «bis %s Stufen» ein', (maxLeap) => {
    const questions = generate('melodiediktat', { maxLeap, scale: 'dur' }, 40);
    // Eine Stufe sind höchstens zwei Halbtöne, also ist die Obergrenze das
    // Doppelte des erlaubten Stufensprungs.
    const limit = Number(maxLeap) * 2;
    for (const question of questions) {
      const solution = (question.task as NotationTask).solution;
      if (solution.type !== 'melody') continue;
      const pitches = solution.measures.flat().map((note) => midi(parsePitch(note.keys![0])));
      for (let i = 1; i < pitches.length; i++) {
        expect(Math.abs(pitches[i] - pitches[i - 1])).toBeLessThanOrEqual(limit);
      }
    }
  });

  it('gibt die erste Note vor, wenn es verlangt ist', () => {
    const withNote = generate('melodiediktat', { giveFirstNote: true }, 20);
    for (const question of withNote) {
      const task = question.task as NotationTask;
      const solution = task.solution;
      if (solution.type !== 'melody') continue;
      expect(task.score.measures[0].notes).toHaveLength(1);
      expect(task.score.measures[0].notes[0].keys).toEqual(solution.measures[0][0].keys);
    }

    const without = generate('melodiediktat', { giveFirstNote: false }, 20);
    for (const question of without) {
      expect((question.task as NotationTask).score.measures[0].notes).toHaveLength(0);
    }
  });

  it('wirft verständlich, wenn kein Notenwert in den Takt passt', () => {
    const generator = generatorById('melodiediktat')!;
    expect(() =>
      generator.generate(
        { ...generator.defaults, timeSignature: '4/4', durations: ['q.'] } as never,
        makeRng(7),
      ),
    ).toThrow(/Takt/);
  });
});

describe('Halbtonschritte', () => {
  it('markiert bei Dur die Stellen 3–4 und 7–8', () => {
    const questions = generate('halbtonschritte-markieren', { scales: ['dur'], directions: ['up'] });
    for (const question of questions) {
      const solution = (question.task as NotationTask).solution;
      if (solution.type !== 'mark') continue;
      expect(solution.gaps).toEqual([2, 6]);
    }
  });

  it('markiert bei natürlichem Moll die Stellen 2–3 und 5–6', () => {
    const questions = generate('halbtonschritte-markieren', {
      scales: ['moll-natuerlich'],
      directions: ['up'],
    });
    for (const question of questions) {
      const solution = (question.task as NotationTask).solution;
      if (solution.type !== 'mark') continue;
      expect(solution.gaps).toEqual([1, 4]);
    }
  });

  it('zählt bei harmonischem Moll die übermässige Sekunde nicht mit', () => {
    const questions = generate('halbtonschritte-markieren', {
      scales: ['moll-harmonisch'],
      directions: ['up'],
    });
    for (const question of questions) {
      const solution = (question.task as NotationTask).solution;
      if (solution.type !== 'mark') continue;
      // 2–3, 5–6 und 7–8; der Anderthalbtonschritt 6–7 gehört nicht dazu.
      expect(solution.gaps).toEqual([1, 4, 6]);
    }
  });

  it('dreht die Stellen beim Abwärtsspielen mit', () => {
    const questions = generate('halbtonschritte-markieren', {
      scales: ['dur'],
      directions: ['down'],
    });
    for (const question of questions) {
      const solution = (question.task as NotationTask).solution;
      if (solution.type !== 'mark') continue;
      // Aufwärts 2 und 6, gespiegelt an sieben Zwischenräumen: 0 und 4.
      expect(solution.gaps).toEqual([0, 4]);
    }
  });

  it('zeichnet acht Töne', () => {
    for (const question of generate('halbtonschritte-markieren', {}, 40)) {
      expect((question.task as NotationTask).score.measures[0].notes).toHaveLength(8);
    }
  });
});

describe('Notenwerte zuordnen', () => {
  it('bietet bei «Name → Zeichen» vier Zeichen an', () => {
    const questions = generate('notenwerte-zuordnen', { direction: 'name-zeichen' }, 60);
    for (const question of questions) {
      expect(question.legend).toHaveLength(4);
      const correct = (question.task as SelectTask).fields[0].correct;
      expect(question.legend!.map((entry) => entry.label)).toContain(correct);
    }
  });

  it('zeigt bei «Zeichen → Name» genau ein Zeichen', () => {
    const questions = generate('notenwerte-zuordnen', { direction: 'zeichen-name' }, 60);
    for (const question of questions) {
      expect(question.legend).toBeUndefined();
      expect((question.task as SelectTask).score!.measures[0].notes).toHaveLength(1);
    }
  });

  it('fragt nur die angekreuzten Werte', () => {
    const seen = answersFor(
      generate('notenwerte-zuordnen', { durations: ['w', 'h'], direction: 'zeichen-name' }),
      'a',
    );
    expect([...seen].sort()).toEqual(['h', 'w']);
  });
});

// ---------------------------------------------------------------------------
// Antwortformat
// ---------------------------------------------------------------------------

describe('Antwortformat', () => {
  it('liest jede erzeugte Tonangabe wieder ein', () => {
    // Der Sonderfall B: «hes4» muss als erniedrigtes H zurückkommen und nicht
    // als Heses. Ein Fehler hier fiele erst im Notenbild auf.
    for (const generator of GENERATORS) {
      for (const question of generate(generator.id, {}, 30)) {
        for (const key of allKeysOf(question.task)) {
          const pitch = parsePitch(key);
          expect(Math.abs(pitch.alter), `${generator.id}: ${key}`).toBeLessThanOrEqual(2);
        }
      }
    }
  });

  it('nennt für jede Melodie so viele Klangereignisse wie Noten', () => {
    for (const question of generate('melodiediktat', {}, 20)) {
      const solution = (question.task as NotationTask).solution;
      if (solution.type !== 'melody') continue;
      expect(question.melody).toHaveLength(solution.measures.flat().length);
    }
  });
});

function allKeysOf(task: Task): string[] {
  const keys: string[] = [];
  const collect = (score?: { measures: { notes: { keys?: string[] }[]; bass?: { keys?: string[] }[] }[] }) => {
    for (const bar of score?.measures ?? []) {
      for (const note of [...bar.notes, ...(bar.bass ?? [])]) keys.push(...(note.keys ?? []));
    }
  };
  if (task.kind === 'select') collect(task.score);
  if (task.kind === 'sing') {
    collect(task.score);
    keys.push(task.reference, task.target);
  }
  if (task.kind === 'notation') {
    collect(task.score);
    if (task.solution.type === 'melody') {
      for (const bar of task.solution.measures) for (const note of bar) keys.push(...(note.keys ?? []));
    }
    if (task.solution.type === 'pitch') {
      for (const slot of task.solution.slots) keys.push(...slot.accept);
    }
  }
  return keys;
}

/** Nur damit der Import benutzt wird, wenn Tests umgebaut werden. */
export type { InputNote };

// ---------------------------------------------------------------------------
// Antwortoptionen folgen den Einstellungen
// ---------------------------------------------------------------------------

/** Werte der Auswahloptionen eines Felds — so, wie die Oberfläche sie zeigt. */
function offered(question: Question, fieldId: string): string[] {
  const task = question.task as SelectTask;
  const field = task.fields.find((entry) => entry.id === fieldId);
  if (!field) throw new Error(`Feld ${fieldId} fehlt`);
  return resolveOptions(field).map((option) => option.value);
}

describe('Antwortoptionen', () => {
  it('bieten bei jeder Übung die richtige Antwort an', () => {
    // Die wichtigste Regel beim Einschränken: nie so weit, dass die Lösung fehlt.
    for (const generator of GENERATORS) {
      for (const question of generate(generator.id, {}, 60)) {
        if (question.task.kind !== 'select') continue;
        for (const field of question.task.fields) {
          expect(resolveOptions(field).map((o) => o.value), `${generator.id}.${field.id}`).toContain(field.correct);
        }
      }
    }
  });

  it('bieten beim Intervallhören nur die eingestellten Intervalle an', () => {
    for (const question of generate('intervalle-hoeren', { intervals: ['k3', 'g3'] }, 20)) {
      expect(offered(question, 'a')).toEqual(['k3', 'g3']);
    }
  });

  it('bieten beim Intervallbestimmen nur die eingestellten Intervalle an', () => {
    for (const question of generate('intervalle-bestimmen', { intervals: ['r4', 'tritonus', 'r5'] }, 20)) {
      expect(offered(question, 'a')).toEqual(['r4', 'tritonus', 'r5']);
    }
  });

  it('ordnen Intervalle als Raster an', () => {
    for (const id of ['intervalle-hoeren', 'intervalle-bestimmen']) {
      const field = (generate(id, {}, 1)[0].task as SelectTask).fields[0];
      expect(field.buttonLayout, id).toBe('intervals');
    }
  });

  it('bieten beim Tonleiterhören nur die eingestellten Arten an', () => {
    for (const question of generate('tonleitern-hoeren', { scaleTypes: ['dur', 'moll-harmonisch'] }, 20)) {
      expect(offered(question, 'a')).toEqual(['dur', 'moll-harmonisch']);
    }
  });

  it('bieten beim Dreiklanghören nur die eingestellten Geschlechter und Umkehrungen an', () => {
    const questions = generate(
      'dreiklaenge-hoeren',
      { qualities: ['dur', 'moll'], inversions: ['grundstellung', 'sextakkord'], askInversion: true },
      20,
    );
    for (const question of questions) {
      expect(offered(question, 'a')).toEqual(['dur', 'moll']);
      expect(offered(question, 'inv')).toEqual(['grundstellung', 'sextakkord']);
    }
  });

  it('bieten beim Dreiklangbestimmen nur Eingestelltes an', () => {
    const questions = generate(
      'dreiklaenge-bestimmen',
      { qualities: ['moll'], inversions: ['sextakkord'], positions: ['terzlage', 'quintlage'], accidentals: 'stammton' },
      20,
    );
    for (const question of questions) {
      expect(offered(question, 'quality')).toEqual(['moll']);
      expect(offered(question, 'inv')).toEqual(['sextakkord']);
      expect(offered(question, 'pos')).toEqual(['terzlage', 'quintlage']);
      expect(offered(question, 'root')).toEqual(['C', 'D', 'E', 'F', 'G', 'A', 'H']);
    }
    // Mit Vorzeichen: alle Grundtöne.
    const withAccidentals = generate('dreiklaenge-bestimmen', { accidentals: 'einfach' }, 1)[0];
    expect(offered(withAccidentals, 'root').length).toBeGreaterThan(7);
  });

  it('bieten beim Tonartenzuordnen nur Tonarten innerhalb der Vorzeichengrenze an', () => {
    for (const question of generate('tonarten-zuordnen', { maxAccidentals: 1, signs: ['kreuz', 'keine'] }, 20)) {
      expect(offered(question, 'dur')).toEqual(['C-Dur', 'G-Dur']);
      expect(offered(question, 'moll')).toEqual(['a-Moll', 'e-Moll']);
    }
  });

  it('bieten beim Notenwertezuordnen nur die eingestellten Werte an', () => {
    const questions = generate('notenwerte-zuordnen', { durations: ['h', 'q', '8'], direction: 'zeichen-name' }, 20);
    for (const question of questions) {
      expect(offered(question, 'a')).toEqual(['h', 'q', '8']);
    }
  });
});
