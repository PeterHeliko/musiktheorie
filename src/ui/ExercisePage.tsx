/**
 * Eine laufende Übung — bildschirmfüllend und auf die Aufgabe beschränkt.
 *
 *   ┌──────────────────────────────┐
 *   │ ✕  Titel               7  ⚙ │  Leiste oben: schliessen, Fortschritt, Einstellungen
 *   ├──────────────────────────────┤
 *   │ Aufgabe (scrollt bei Bedarf) │
 *   ├──────────────────────────────┤
 *   │ Rückmeldung                  │  Leiste unten, fest: immer in Daumenreichweite
 *   │ [ Prüfen / Weiter ]          │
 *   └──────────────────────────────┘
 *
 * Alles andere — Übungsform, Filter, Teilen — liegt hinter dem ⚙.
 *
 * Die Adresszeile zeigt immer den ganzen Zustand: Einstellungen, Übungsform
 * und die Aufgabe (bzw. Runde), die gerade dasteht. Wer sie kopiert, teilt
 * genau das. Umgekehrt stellt diese Seite aus einem Link denselben Zustand her
 * (siehe `links.ts`).
 *
 * Woher die Einstellungen beim Öffnen kommen:
 *  - steht etwas zur Übung in der Adresse → genau das, und nur das;
 *  - sonst → die zuletzt gewählten (localStorage).
 * Einstellungen aus einem fremden Link werden nicht gespeichert — erst eine
 * eigene Änderung überschreibt die eigenen.
 *
 * Zwei Übungsformen:
 *  - «endlos»: eine Aufgabe nach der anderen; oben steht, die wievielte.
 *  - «Runde»: eine feste Anzahl, danach eine Auswertung. Alle Aufgaben einer
 *    Runde stammen aus EINEM Startwert, damit ein Link die ganze Runde trägt.
 *
 * Als Schritt eines Kurses (`…&kurs=<id>&schritt=2`, siehe `courses.ts`)
 * läuft die Übung als Runde mit den Einstellungen des Kurses: ✕ führt zum
 * Kurs zurück, ⚙ zeigt keine Filter, und eine fertige Runde hakt den Schritt
 * ab und bietet den nächsten an. Kennt dieses Gerät den Kurs nicht, ist es
 * einfach die Übung.
 */

import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import {
  courseTitle,
  decodeCourse,
  decodePlace,
  placeSuffix,
  stepKey,
  stepQuery,
  type CoursePlace,
} from '../courses';
import { freshSeed, roundSeeds, withoutRepeats } from '../generators/fresh';
import { makeRng, randomSeed } from '../generators/rng';
import type { FilterValues, Generator, Personal, Question } from '../generators/types';
import { canonicalFilters, decodeLink, encodeLink } from '../links';
import type { TaskResult } from '../scoring';
import { hrefFor, navigate, replaceQuery } from '../router';
import {
  clearFilters,
  findCourse,
  loadFilters,
  loadPersonal,
  loadSession,
  markStepDone,
  recordResult,
  saveFilters,
  savePersonal,
  saveSession,
  type SessionSettings,
} from '../settings';
import { closeMicrophone } from '../sing/microphone';
import { AnswerStore } from '../state';
import { CloseIcon, GearIcon, InfoIcon } from './icons';
import { QuestionView } from './QuestionView';
import { RoundSummary, isPerfect, type RoundEntry } from './RoundSummary';
import { SettingsSheet } from './SettingsSheet';

/** Aktuelle Aufgabe samt allem, was zu ihr gehört. */
interface Current {
  seed: number;
  question: Question | null;
  /** Gesetzt, wenn der Generator mit den Filtern nichts anfangen konnte. */
  error: string | null;
  store: AnswerStore;
  result: TaskResult | null;
  /** Wurde überhaupt etwas eingetragen? Steuert den Prüfen-Knopf. */
  touched: boolean;
}

/** Zustand beim Öffnen: aus dem Link, sonst aus dem Speicher. */
interface Start {
  filters: FilterValues;
  session: SessionSettings;
  seed: number;
  outdated: boolean;
}

/** Die Übung als Schritt eines Kurses auf diesem Gerät. */
export interface InCourse {
  /** Kennung des Kurses im Speicher. */
  id: string;
  title: string;
  /** Adresse der Kursseite. */
  href: string;
  /** Schlüssel des Schritts, für «erledigt». */
  key: string;
  /** Kursbezug für die Adresszeile dieser Übung. */
  place: CoursePlace;
  /** Adresse des nächsten Schritts; null beim letzten. */
  nextHref: string | null;
}

/**
 * Gehört diese Übung zu einem Kurs? Nur, wenn dieses Gerät den Kurs kennt und
 * er genau diesen Schritt hat — dieselbe Übung, dieselben Einstellungen,
 * dieselbe Rundengrösse. Wurde der Kurs inzwischen umgestellt, wird der
 * Schritt an seiner neuen Stelle gesucht.
 */
function findInCourse(generator: Generator<FilterValues>, search: string, start: Start): InCourse | null {
  const place = decodePlace(search);
  if (!place || start.session.mode !== 'runde') return null;
  const stored = findCourse(place.course);
  if (!stored) return null;
  const course = decodeCourse(stored.link);
  const key = stepKey({ exercise: generator.id, filters: start.filters, round: start.session.size });
  let index = place.step - 1;
  if (!course.steps[index] || stepKey(course.steps[index]) !== key) {
    index = course.steps.findIndex((step) => stepKey(step) === key);
  }
  if (index < 0) return null;
  const next = course.steps[index + 1];
  return {
    id: stored.id,
    title: courseTitle(course),
    href: hrefFor({ page: 'kurs' }, stored.link),
    key,
    place: { course: stored.id, step: index + 1 },
    nextHref: next
      ? hrefFor({ page: 'uebung', id: next.exercise }, stepQuery(next, { course: stored.id, step: index + 2 }))
      : null,
  };
}

function startState(generator: Generator<FilterValues>, search: string): Start {
  const link = decodeLink(generator, search);
  const stored = loadSession(generator.id);
  if (link.fromUrl) {
    return {
      filters: canonicalFilters(generator, link.filters),
      session: link.round !== null ? { mode: 'runde', size: link.round } : { mode: 'endlos', size: stored.size },
      seed: link.seed ?? randomSeed(),
      outdated: link.outdated,
    };
  }
  return {
    filters: canonicalFilters(generator, loadFilters(generator.id, generator.defaults)),
    session: stored,
    seed: randomSeed(),
    outdated: false,
  };
}

export function ExercisePage({
  generator,
  search,
}: {
  generator: Generator<FilterValues>;
  search: string;
}) {
  // Nur beim Öffnen gelesen; danach führt die Seite die Adresse selbst nach.
  const start = useMemo(() => startState(generator, search), []);
  const inCourse = useMemo(() => findInCourse(generator, search, start), []);

  const [filters, setFilters] = useState<FilterValues>(start.filters);
  const [session, setSession] = useState<SessionSettings>(start.session);
  /** Persönliches wie die Stimmlage: vom Gerät, nie aus dem Link. */
  const [personal, setPersonal] = useState<Personal>(loadPersonal);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [outdated, setOutdated] = useState(start.outdated);
  /**
   * Erklärung (Anweisung und Hinweis) zeigen? Nur auf Wunsch (ⓘ), auch beim
   * ersten Öffnen nicht von selbst. Mit der nächsten Aufgabe verschwindet sie
   * wieder.
   */
  const [explain, setExplain] = useState(false);

  const inRound = session.mode === 'runde';

  /**
   * Startwert der laufenden Runde — `null`, wenn keine Runde läuft oder die
   * Runde nur die falschen Aufgaben einer früheren wiederholt (die lassen sich
   * nicht aus einem einzigen Startwert herstellen).
   */
  const [roundSeed, setRoundSeed] = useState<number | null>(inRound ? start.seed : null);
  /** Startwerte der noch ausstehenden Aufgaben der Runde, in der Reihenfolge. */
  const firstSeeds = useMemo(
    () => (inRound ? roundSeeds(generator, start.filters, start.seed, start.session.size) : [start.seed]),
    [],
  );
  const [queue, setQueue] = useState<number[]>(() => firstSeeds.slice(1));
  const [current, setCurrent] = useState<Current>(() => build(generator, start.filters, firstSeeds[0], personal));
  /** Bereits beantwortete Aufgaben der laufenden Runde. */
  const [round, setRound] = useState<RoundEntry[]>([]);
  /**
   * Wie viele Aufgaben hat diese Runde? Normalerweise die eingestellte Grösse;
   * beim Wiederholen der falschen Aufgaben genau deren Anzahl.
   */
  const [roundTarget, setRoundTarget] = useState(session.size);
  const [summary, setSummary] = useState<RoundEntry[] | null>(null);
  /** Beantwortete Aufgaben ohne Ende, für die Zählung oben. */
  const [answered, setAnswered] = useState(0);

  // ------------------------------------------------------------ Adresszeile
  const pageHref = hrefFor({ page: 'uebung', id: generator.id });
  const taskSeed = inRound ? roundSeed : current.seed;
  const exerciseQuery = encodeLink(generator, {
    filters,
    round: inRound ? session.size : null,
    seed: null,
  });
  const taskQuery =
    taskSeed !== null && !summary
      ? encodeLink(generator, { filters, round: inRound ? session.size : null, seed: taskSeed })
      : null;

  // Im Kurs bleibt der Kursbezug in der Adresse — nur dort, nicht in den
  // Links zum Teilen: die Kennung gilt nur auf diesem Gerät.
  const placeQuery = inCourse ? placeSuffix(inCourse.place) : '';
  useEffect(() => {
    replaceQuery(pageHref + withPlace(taskQuery ?? exerciseQuery, placeQuery));
  }, [pageHref, taskQuery, exerciseQuery, placeQuery]);

  // Wer die Singübung verlässt, schaltet das Mikrofon aus — das Aufnahme-
  // zeichen des Browsers soll nicht weiterleuchten.
  useEffect(
    () => () => {
      if (generator.skill === 'singen') void closeMicrophone();
    },
    [],
  );

  // ---------------------------------------------------------------- Ablauf
  /** Neue Runde bzw. neue endlose Folge mit diesen Einstellungen. */
  const restart = useCallback(
    (values: FilterValues, next: SessionSettings, own: Personal) => {
      setRound([]);
      setSummary(null);
      setRoundTarget(next.size);
      setAnswered(0);
      if (next.mode === 'runde') {
        const seed = randomSeed();
        const seeds = roundSeeds(generator, values, seed, next.size);
        setRoundSeed(seed);
        setQueue(seeds.slice(1));
        setCurrent(build(generator, values, seeds[0], own));
      } else {
        setRoundSeed(null);
        setQueue([]);
        setCurrent((previous) =>
          build(generator, values, freshSeed(generator, values, own, previous.question, randomSeed), own),
        );
      }
    },
    [generator],
  );

  /** Neue Einstellungen aus dem Blatt (oder «auf Vorgabe»): speichern und neu beginnen. */
  const applySettings = useCallback(
    (next: { filters: FilterValues; session: SessionSettings; personal?: Personal }) => {
      const canonical = canonicalFilters(generator, next.filters);
      setFilters(canonical);
      setSession(next.session);
      // Im Kurs gehören Filter und Runde dem Kurs, nicht der übenden Person:
      // ihre eigenen gespeicherten Einstellungen bleiben, wie sie sind.
      if (!inCourse) {
        if (JSON.stringify(canonical) === JSON.stringify(canonicalFilters(generator, generator.defaults))) {
          clearFilters(generator.id);
        } else {
          saveFilters(generator.id, canonical);
        }
        saveSession(generator.id, next.session);
      }
      const own = next.personal ?? personal;
      if (next.personal) {
        setPersonal(next.personal);
        savePersonal(next.personal);
      }
      setOutdated(false);
      restart(canonical, next.session, own);
    },
    [generator, restart, personal, inCourse],
  );

  const repeatWrong = useCallback(
    (wrong: number[]) => {
      // Zwei gleiche falsche Aufgaben kämen sonst direkt nacheinander.
      const seeds = withoutRepeats(generator, filters, personal, wrong);
      setRound([]);
      setSummary(null);
      setRoundTarget(seeds.length);
      setRoundSeed(null);
      setQueue(seeds.slice(1));
      setCurrent(build(generator, filters, seeds[0], personal));
    },
    [generator, filters, personal],
  );

  const check = useCallback(
    (result: TaskResult) => {
      setCurrent((state) => ({ ...state, result }));
      recordResult(generator.id, isPerfect(result));
      setAnswered((value) => value + 1);
      if (inRound) setRound((entries) => [...entries, { seed: current.seed, result }]);
    },
    [generator.id, inRound, current.seed],
  );

  const next = useCallback(() => {
    setOutdated(false);
    setExplain(false);
    if (inRound && round.length >= roundTarget) {
      setSummary(round);
      // Erledigt heisst: die Runde ist fertig — wie gut, zählt nicht (Entscheid 2026-11-24).
      if (inCourse) markStepDone(inCourse.id, inCourse.key);
      return;
    }
    if (queue.length > 0) {
      const [seed, ...rest] = queue;
      setQueue(rest);
      setCurrent(build(generator, filters, seed, personal));
      return;
    }
    setCurrent(build(generator, filters, freshSeed(generator, filters, personal, current.question, randomSeed), personal));
  }, [queue, inRound, round, roundTarget, generator, filters, personal, current.question, inCourse]);

  // ---------------------------------------------------------------- Ansicht
  /** Wohin ✕ führt: zum Kurs, sonst zum Thema. */
  const backHref = inCourse ? inCourse.href : hrefFor({ page: 'thema', topic: generator.topic });
  const instruction = current.question?.instruction ?? generator.instruction;
  const hint = current.question?.hint ?? generator.hint;

  // Die wievielte Aufgabe steht gerade da? In der Runde mit Gesamtzahl.
  const position = inRound
    ? Math.min(round.length + (current.result ? 0 : 1), roundTarget)
    : answered + (current.result ? 0 : 1);
  const progress = summary ? null : inRound ? `${position}/${roundTarget}` : String(position);
  const progressLabel = summary
    ? ''
    : inRound
      ? `Aufgabe ${position} von ${roundTarget}`
      : `Aufgabe ${position}`;

  const notice = outdated ? (
    <div class="notice notice-info" role="status">
      <p>
        Die geteilte Aufgabe stammt aus einer älteren Fassung dieser Übung und lässt sich nicht
        mehr genau herstellen. Hier ist eine neue mit denselben Einstellungen.
      </p>
    </div>
  ) : null;

  let content;
  if (summary) {
    content = (
      <main class="session-body">
        <div class="session-column">
          <RoundSummary
            entries={summary}
            onRepeat={() => restart(filters, session, personal)}
            onRepeatWrong={repeatWrong}
            onBack={() => navigate(backHref)}
            inCourse={inCourse}
          />
        </div>
      </main>
    );
  } else if (current.error) {
    content = (
      <main class="session-body">
        <div class="session-column">
          <div class="notice notice-warning">
            <p>{current.error}</p>
            {inCourse ? (
              // Die Einstellungen gehören dem Kurs; ändern lassen sie sich hier nicht.
              <div class="notice-actions">
                <button type="button" class="primary" onClick={() => navigate(inCourse.href)}>
                  Zurück zum Kurs
                </button>
              </div>
            ) : (
              <div class="notice-actions">
                <button type="button" class="primary" onClick={() => setSettingsOpen(true)}>
                  Einstellungen ändern
                </button>
                <button
                  type="button"
                  onClick={() => applySettings({ filters: generator.defaults, session })}
                >
                  Auf Vorgabe zurücksetzen
                </button>
              </div>
            )}
          </div>
        </div>
      </main>
    );
  } else if (current.question) {
    content = (
      <QuestionView
        key={current.seed}
        question={current.question}
        store={current.store}
        result={current.result}
        instruction={instruction}
        hint={hint}
        canCheck={current.touched}
        nextLabel={inRound && round.length >= roundTarget ? 'Runde auswerten' : 'Weiter'}
        onAnswered={() => setCurrent((state) => ({ ...state, touched: true }))}
        onCheck={check}
        onNext={next}
        notice={notice}
        showExplanation={explain}
      />
    );
  }

  return (
    <div class="session">
      <header class="session-top">
        <div class="session-column session-top-inner">
          <a class="session-icon" href={backHref} aria-label={inCourse ? 'Zurück zum Kurs' : 'Übung schliessen'}>
            <CloseIcon />
          </a>
          <h1 class="session-title">{generator.title}</h1>
          {progress !== null && (
            <span class="session-progress" aria-label={progressLabel}>
              {progress}
            </span>
          )}
          <button
            type="button"
            class={`session-icon session-info ${explain ? 'is-active' : ''}`}
            aria-label="Erklärung"
            aria-pressed={explain}
            onClick={() => setExplain(!explain)}
          >
            <InfoIcon />
          </button>
          <button
            type="button"
            class="session-icon session-settings"
            aria-label="Einstellungen"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen(true)}
          >
            <GearIcon />
          </button>
        </div>
      </header>

      {content}

      {settingsOpen && (
        <SettingsSheet
          generator={generator}
          filters={filters}
          session={session}
          personal={personal}
          taskHref={taskQuery !== null ? pageHref + taskQuery : null}
          inCourse={inCourse}
          onClose={(changes) => {
            setSettingsOpen(false);
            if (changes) applySettings(changes);
          }}
        />
      )}
    </div>
  );
}

/** Abfrageteil plus Kursbezug («&kurs=…»); der Kursbezug allein beginnt mit «?». */
function withPlace(query: string, place: string): string {
  if (!place) return query;
  return query ? query + place : `?${place.slice(1)}`;
}

/**
 * Baut eine Aufgabe. Wirft der Generator — etwa weil die Filter nichts
 * zulassen —, wird die Meldung angezeigt statt der Aufgabe. Die Generatoren
 * werfen absichtlich mit einem Satz, der sagt, welcher Filter zu eng ist.
 */
function build(
  generator: Generator<FilterValues>,
  filters: FilterValues,
  seed: number,
  personal: Personal,
): Current {
  const store = new AnswerStore();
  try {
    return {
      seed,
      question: generator.generate(filters, makeRng(seed), personal),
      error: null,
      store,
      result: null,
      touched: false,
    };
  } catch (error) {
    return {
      seed,
      question: null,
      error: error instanceof Error ? error.message : String(error),
      store,
      result: null,
      touched: false,
    };
  }
}
