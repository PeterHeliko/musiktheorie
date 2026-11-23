/**
 * Eine laufende Übung.
 *
 * Die Adresszeile zeigt immer den ganzen Zustand: Einstellungen, Übungsform
 * und die Aufgabe (bzw. Runde), die gerade dasteht. Wer sie kopiert, teilt
 * genau das. Umgekehrt stellt diese Seite aus einem Link denselben Zustand her
 * (siehe `links.ts`).
 *
 * Woher die Einstellungen beim Öffnen kommen:
 *  - steht etwas zur Übung in der Adresse → genau das, und nur das;
 *  - sonst → die zuletzt im Filterformular gewählten (localStorage).
 * Einstellungen aus einem fremden Link werden nicht gespeichert — erst eine
 * eigene Änderung im Formular überschreibt die eigenen.
 *
 * Zwei Übungsformen:
 *  - «endlos»: eine Aufgabe nach der anderen, sofortige Rückmeldung.
 *  - «Runde»: eine feste Anzahl, danach eine Auswertung. Alle Aufgaben einer
 *    Runde stammen aus EINEM Startwert, damit ein Link die ganze Runde trägt.
 */

import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import { deriveSeeds, makeRng, randomSeed } from '../generators/rng';
import { SKILL_LABELS, topicTitle, type FilterValues, type Generator } from '../generators/types';
import { canonicalFilters, decodeLink, encodeLink } from '../links';
import type { TaskResult } from '../scoring';
import { hrefFor, navigate, replaceQuery } from '../router';
import {
  ROUND_SIZES,
  clearFilters,
  loadFilters,
  loadSession,
  recordResult,
  saveFilters,
  saveSession,
  type SessionSettings,
} from '../settings';
import { AnswerStore } from '../state';
import type { Question } from '../generators/types';
import { FilterPanel } from './FilterPanel';
import { QuestionView } from './QuestionView';
import { RoundSummary, isPerfect, type RoundEntry } from './RoundSummary';
import { SharePanel } from './SharePanel';

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

  const [filters, setFilters] = useState<FilterValues>(start.filters);
  const [session, setSession] = useState<SessionSettings>(start.session);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [outdated, setOutdated] = useState(start.outdated);

  const inRound = session.mode === 'runde';

  /**
   * Startwert der laufenden Runde — `null`, wenn keine Runde läuft oder die
   * Runde nur die falschen Aufgaben einer früheren wiederholt (die lassen sich
   * nicht aus einem einzigen Startwert herstellen).
   */
  const [roundSeed, setRoundSeed] = useState<number | null>(inRound ? start.seed : null);
  /** Startwerte der noch ausstehenden Aufgaben der Runde, in der Reihenfolge. */
  const [queue, setQueue] = useState<number[]>(() =>
    inRound ? deriveSeeds(start.seed, start.session.size).slice(1) : [],
  );
  const [current, setCurrent] = useState<Current>(() =>
    build(
      generator,
      start.filters,
      inRound ? deriveSeeds(start.seed, start.session.size)[0] : start.seed,
    ),
  );
  /** Bereits beantwortete Aufgaben der laufenden Runde. */
  const [round, setRound] = useState<RoundEntry[]>([]);
  /**
   * Wie viele Aufgaben hat diese Runde? Normalerweise die eingestellte Grösse;
   * beim Wiederholen der falschen Aufgaben genau deren Anzahl.
   */
  const [roundTarget, setRoundTarget] = useState(session.size);
  const [summary, setSummary] = useState<RoundEntry[] | null>(null);
  const [streak, setStreak] = useState(0);
  const [tally, setTally] = useState({ attempted: 0, correct: 0 });

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

  useEffect(() => {
    replaceQuery(pageHref + (taskQuery ?? exerciseQuery));
  }, [pageHref, taskQuery, exerciseQuery]);

  // ---------------------------------------------------------------- Ablauf
  /** Neue Runde bzw. neue endlose Folge mit diesen Einstellungen. */
  const restart = useCallback(
    (values: FilterValues, next: SessionSettings) => {
      setRound([]);
      setSummary(null);
      setRoundTarget(next.size);
      if (next.mode === 'runde') {
        const seed = randomSeed();
        const seeds = deriveSeeds(seed, next.size);
        setRoundSeed(seed);
        setQueue(seeds.slice(1));
        setCurrent(build(generator, values, seeds[0]));
      } else {
        setRoundSeed(null);
        setQueue([]);
        setCurrent(build(generator, values, randomSeed()));
      }
    },
    [generator],
  );

  const applyFilters = useCallback(
    (next: FilterValues) => {
      const canonical = canonicalFilters(generator, next);
      setFilters(canonical);
      saveFilters(generator.id, canonical);
      setOutdated(false);
      // Neue Filter gelten sofort — eine Aufgabe stehen zu lassen, die den
      // neuen Filtern nicht entspricht, wäre verwirrend.
      restart(canonical, session);
    },
    [generator, restart, session],
  );

  const resetFilters = useCallback(() => {
    clearFilters(generator.id);
    setFilters(generator.defaults);
    setOutdated(false);
    restart(generator.defaults, session);
  }, [generator, restart, session]);

  const changeSession = useCallback(
    (next: SessionSettings) => {
      setSession(next);
      saveSession(generator.id, next);
      setOutdated(false);
      restart(filters, next);
    },
    [generator.id, filters, restart],
  );

  const repeatWrong = useCallback(
    (seeds: number[]) => {
      setRound([]);
      setSummary(null);
      setRoundTarget(seeds.length);
      setRoundSeed(null);
      setQueue(seeds.slice(1));
      setCurrent(build(generator, filters, seeds[0]));
    },
    [generator, filters],
  );

  const check = useCallback(
    (result: TaskResult) => {
      setCurrent((state) => ({ ...state, result }));
      const correct = isPerfect(result);
      recordResult(generator.id, correct);
      setStreak((value) => (correct ? value + 1 : 0));
      setTally((value) => ({
        attempted: value.attempted + 1,
        correct: value.correct + (correct ? 1 : 0),
      }));
      if (inRound) setRound((entries) => [...entries, { seed: current.seed, result }]);
    },
    [generator.id, inRound, current.seed],
  );

  const next = useCallback(() => {
    setOutdated(false);
    if (inRound && round.length >= roundTarget) {
      setSummary(round);
      return;
    }
    if (queue.length > 0) {
      const [seed, ...rest] = queue;
      setQueue(rest);
      setCurrent(build(generator, filters, seed));
      return;
    }
    setCurrent(build(generator, filters, randomSeed()));
  }, [queue, inRound, round, roundTarget, generator, filters]);

  const instruction = current.question?.instruction ?? generator.instruction;
  const hint = current.question?.hint ?? generator.hint;
  const rate = tally.attempted > 0 ? Math.round((tally.correct / tally.attempted) * 100) : null;
  const position = Math.min(round.length + (current.result ? 0 : 1), roundTarget);
  const overview = hrefFor({ page: 'ueben' });

  return (
    <>
      <header class="practice-header">
        <nav class="crumbs" aria-label="Navigation">
          <a href={overview} class="link-button">
            ← Alle Übungen
          </a>
          <span class="crumb-section">
            {topicTitle(generator.topic)} · {SKILL_LABELS[generator.skill]}
          </span>
        </nav>
        <div class="practice-title">
          <h1>{generator.title}</h1>
          <SharePanel
            title={generator.title}
            exerciseHref={pageHref + exerciseQuery}
            taskHref={taskQuery !== null ? pageHref + taskQuery : null}
            taskLabel={inRound ? 'Diese Runde' : 'Diese Aufgabe'}
          />
        </div>

        <div class="stats-bar">
          <span>
            <strong>{tally.attempted}</strong> bearbeitet
          </span>
          {rate !== null && (
            <span>
              <strong>{rate}&nbsp;%</strong> richtig
            </span>
          )}
          {streak > 1 && (
            <span class="stats-streak">
              Serie <strong>{streak}</strong>
            </span>
          )}
          {inRound && !summary && (
            <span class="stats-round">
              Runde <strong>{position}</strong> / {roundTarget}
            </span>
          )}
        </div>

        <div class="session-switch" role="radiogroup" aria-label="Übungsform">
          <button
            type="button"
            role="radio"
            aria-checked={session.mode === 'endlos'}
            class={`filter-chip ${session.mode === 'endlos' ? 'is-selected' : ''}`}
            onClick={() => changeSession({ ...session, mode: 'endlos' })}
          >
            Üben ohne Ende
          </button>
          {ROUND_SIZES.map((size) => (
            <button
              key={size}
              type="button"
              role="radio"
              aria-checked={inRound && session.size === size}
              class={`filter-chip ${inRound && session.size === size ? 'is-selected' : ''}`}
              onClick={() => changeSession({ mode: 'runde', size })}
            >
              Runde à {size}
            </button>
          ))}
        </div>
      </header>

      <FilterPanel
        filters={generator.filters}
        values={filters}
        onChange={applyFilters}
        onReset={resetFilters}
        open={filtersOpen}
        onToggle={() => setFiltersOpen((value) => !value)}
      />

      <main>
        {outdated && (
          <div class="notice notice-info" role="status">
            <p>
              Die geteilte Aufgabe stammt aus einer älteren Fassung dieser Übung und lässt sich
              nicht mehr genau herstellen. Hier ist eine neue mit denselben Einstellungen.
            </p>
          </div>
        )}
        {summary ? (
          <RoundSummary
            entries={summary}
            onRepeat={() => restart(filters, session)}
            onRepeatWrong={repeatWrong}
            onBack={() => navigate(overview)}
          />
        ) : current.error ? (
          <div class="notice notice-warning">
            <p>{current.error}</p>
            <button type="button" class="primary" onClick={resetFilters}>
              Filter zurücksetzen
            </button>
          </div>
        ) : current.question ? (
          <QuestionView
            key={current.seed}
            question={current.question}
            store={current.store}
            result={current.result}
            instruction={instruction}
            hint={hint}
            canCheck={current.touched}
            nextLabel={inRound && round.length >= roundTarget ? 'Runde auswerten' : 'Nächste Aufgabe'}
            onAnswered={() => setCurrent((state) => ({ ...state, touched: true }))}
            onCheck={check}
            onNext={next}
          />
        ) : null}
      </main>

      <footer class="practice-footer">
        <span>
          Thema: <strong>{topicTitle(generator.topic)}</strong>
        </span>
        <a href={overview} class="link-button">
          Übung wechseln
        </a>
      </footer>
    </>
  );
}

/**
 * Baut eine Aufgabe. Wirft der Generator — etwa weil die Filter nichts
 * zulassen —, wird die Meldung angezeigt statt der Aufgabe. Die Generatoren
 * werfen absichtlich mit einem Satz, der sagt, welcher Filter zu eng ist.
 */
function build(generator: Generator<FilterValues>, filters: FilterValues, seed: number): Current {
  const store = new AnswerStore();
  try {
    return {
      seed,
      question: generator.generate(filters, makeRng(seed)),
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
