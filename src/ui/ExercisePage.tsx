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
 */

import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import { deriveSeeds, makeRng, randomSeed } from '../generators/rng';
import type { FilterValues, Generator, Question } from '../generators/types';
import { canonicalFilters, decodeLink, encodeLink } from '../links';
import type { TaskResult } from '../scoring';
import { hrefFor, navigate, replaceQuery } from '../router';
import {
  clearFilters,
  loadFilters,
  loadSession,
  recordResult,
  saveFilters,
  saveSession,
  type SessionSettings,
} from '../settings';
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
      setAnswered(0);
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

  /** Neue Einstellungen aus dem Blatt (oder «auf Vorgabe»): speichern und neu beginnen. */
  const applySettings = useCallback(
    (next: { filters: FilterValues; session: SessionSettings }) => {
      const canonical = canonicalFilters(generator, next.filters);
      setFilters(canonical);
      if (JSON.stringify(canonical) === JSON.stringify(canonicalFilters(generator, generator.defaults))) {
        clearFilters(generator.id);
      } else {
        saveFilters(generator.id, canonical);
      }
      setSession(next.session);
      saveSession(generator.id, next.session);
      setOutdated(false);
      restart(canonical, next.session);
    },
    [generator, restart],
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

  // ---------------------------------------------------------------- Ansicht
  const topicHref = hrefFor({ page: 'thema', topic: generator.topic });
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
            onRepeat={() => restart(filters, session)}
            onRepeatWrong={repeatWrong}
            onBack={() => navigate(topicHref)}
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
          <a class="session-icon" href={topicHref} aria-label="Übung schliessen">
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
          taskHref={taskQuery !== null ? pageHref + taskQuery : null}
          onClose={(changes) => {
            setSettingsOpen(false);
            if (changes) applySettings(changes);
          }}
        />
      )}
    </div>
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
