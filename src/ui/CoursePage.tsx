/**
 * Ein Kurs: seine Schritte, was davon erledigt ist, und der Link zum Teilen.
 *
 * Der Kurs steht ganz in der Adresse (`courses.ts`). Beim Öffnen kommt er in
 * die Liste dieses Geräts — oder es öffnet sich der Eintrag, der genau diesen
 * Inhalt schon hat, samt Fortschritt. Jeder Schritt ist ein Link auf seine
 * Übung, mit dem Kursbezug in der Adresse.
 *
 * «Bearbeiten» ändert die eigene Fassung: Titel, Reihenfolge, Rundengrösse,
 * Schritte entfernen. Jede Änderung gilt sofort, im Speicher und in der
 * Adresszeile. Ein schon geteilter Link bleibt, wie er war.
 */

import { useEffect, useState } from 'preact/hooks';
import {
  MAX_TITLE,
  courseTitle,
  decodeCourse,
  describeSettings,
  encodeCourse,
  isCourse,
  isDone,
  stepQuery,
  type Course,
  type CourseStep,
  type DecodedCourse,
} from '../courses';
import { generatorById } from '../generators/index';
import { fullTitle } from '../generators/types';
import { SITE_NAME } from '../pages';
import { absoluteUrl, hrefFor, navigate, replaceQuery } from '../router';
import { ROUND_SIZES, openCourse, removeCourse, updateCourse, type StoredCourse } from '../settings';
import { CloseIcon, SkillIcon } from './icons';
import { ShareRow } from './ShareLinks';

interface Opened {
  course: DecodedCourse;
  stored: StoredCourse;
}

type Mode = 'ansehen' | 'bearbeiten' | 'entfernen';

export function CoursePage({ search }: { search: string }) {
  // Nur beim Öffnen gelesen; was die Seite danach ändert, schreibt sie selbst
  // in die Adresse.
  const [opened] = useState<Opened | null>(() => {
    const course = decodeCourse(search);
    if (!isCourse(course)) return null;
    return { course, stored: openCourse(encodeCourse(course)) };
  });
  const [course, setCourse] = useState<Course | null>(opened?.course ?? null);
  const [link, setLink] = useState(opened?.stored.link ?? '');
  const [mode, setMode] = useState<Mode>('ansehen');

  const href = opened ? hrefFor({ page: 'kurs' }, link) : null;

  // Feste Schreibweise in der Adresszeile: was sich nicht lesen liess, ist weg.
  useEffect(() => {
    if (href) replaceQuery(href);
  }, [href]);

  const title = course ? courseTitle(course) : 'Kein Kurs';
  useEffect(() => {
    document.title = `${title} · Kurs · ${SITE_NAME}`;
  }, [title]);

  if (!opened || !course) return <NoCourse search={search} />;

  const { stored } = opened;

  const change = (next: Course) => {
    const nextLink = encodeCourse(next);
    updateCourse(stored.id, nextLink);
    setCourse(next);
    setLink(nextLink);
  };

  return (
    <div class="list-page">
      <a class="back-link" href={hrefFor({ page: 'start' })}>
        ‹ Startseite
      </a>
      <h1>{title}</h1>

      {mode === 'bearbeiten' ? (
        <CourseEditor course={course} onChange={change} onDone={() => setMode('ansehen')} />
      ) : (
        <>
          {opened.course.missing > 0 && (
            <div class="notice notice-info" role="status">
              <p>{missingText(opened.course.missing)}</p>
            </div>
          )}

          <ol class="nav-list course-steps">
            {course.steps.map((step, index) => (
              <li key={index}>
                <StepLink step={step} href={stepHref(step, stored.id, index)} done={isDone(step, stored.done)} />
              </li>
            ))}
          </ol>

          <section class="course-share">
            <ShareRow
              label="Diesen Kurs teilen"
              hint="wer ihn öffnet, bekommt dieselben Übungen mit neuen Aufgaben"
              title={title}
              text={`Kurs «${title}»`}
              url={absoluteUrl(href!)}
            />
          </section>

          {mode === 'entfernen' ? (
            <div class="notice notice-warning course-remove" role="alert">
              <p>
                «{title}» von diesem Gerät entfernen? Erledigte Schritte gehen verloren. Wer den Link hat,
                kann den Kurs weiter öffnen.
              </p>
              <div class="notice-actions">
                <button
                  type="button"
                  class="primary"
                  onClick={() => {
                    removeCourse(stored.id);
                    navigate(hrefFor({ page: 'start' }));
                  }}
                >
                  Entfernen
                </button>
                <button type="button" onClick={() => setMode('ansehen')}>
                  Abbrechen
                </button>
              </div>
            </div>
          ) : (
            <div class="course-actions">
              <button type="button" class="link-button" onClick={() => setMode('bearbeiten')}>
                Bearbeiten
              </button>
              <button type="button" class="link-button" onClick={() => setMode('entfernen')}>
                Vom Gerät entfernen
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Den Kurs umstellen. Die Einstellungen eines Schritts ändern sich hier
 * nicht — dafür die Übung öffnen, einstellen und neu hinzufügen.
 */
function CourseEditor({
  course,
  onChange,
  onDone,
}: {
  course: Course;
  onChange: (next: Course) => void;
  onDone: () => void;
}) {
  const steps = course.steps;
  const withSteps = (next: CourseStep[]) => onChange({ ...course, steps: next });
  const move = (from: number, to: number) => {
    const next = [...steps];
    const [step] = next.splice(from, 1);
    next.splice(to, 0, step);
    withSteps(next);
  };

  return (
    <div class="course-editor">
      <label class="filter-label" for="course-title">
        Titel
      </label>
      <input
        id="course-title"
        type="text"
        value={course.title}
        maxLength={MAX_TITLE}
        autoComplete="off"
        onInput={(event) => onChange({ ...course, title: (event.currentTarget as HTMLInputElement).value })}
      />

      <ol class="course-edit-steps">
        {steps.map((step, index) => (
          <li key={index}>
            {/* Die Rundengrösse steht gleich darunter zur Wahl. */}
            <StepText step={step} withRound={false} />
            <div class="course-edit-controls">
              <button
                type="button"
                class="link-button"
                aria-label="Nach oben"
                disabled={index === 0}
                onClick={() => move(index, index - 1)}
              >
                ↑
              </button>
              <button
                type="button"
                class="link-button"
                aria-label="Nach unten"
                disabled={index === steps.length - 1}
                onClick={() => move(index, index + 1)}
              >
                ↓
              </button>
              <select
                aria-label="Aufgaben in der Übung"
                value={String(step.round)}
                onChange={(event) =>
                  withSteps(
                    steps.map((entry, at) =>
                      at === index ? { ...entry, round: Number((event.currentTarget as HTMLSelectElement).value) } : entry,
                    ),
                  )
                }
              >
                {roundSizes(step.round).map((size) => (
                  <option key={size} value={String(size)}>
                    {tasksText(size)}
                  </option>
                ))}
              </select>
              {/* Ein Kurs ohne Übung wäre kein Kurs mehr; dafür gibt es «Vom Gerät entfernen». */}
              <button
                type="button"
                class="link-button"
                aria-label="Schritt entfernen"
                disabled={steps.length === 1}
                onClick={() => withSteps(steps.filter((_, at) => at !== index))}
              >
                <CloseIcon />
              </button>
            </div>
          </li>
        ))}
      </ol>

      <div class="course-actions">
        <button type="button" class="primary" onClick={onDone}>
          Fertig
        </button>
      </div>
    </div>
  );
}

/** Die Rundengrössen der Oberfläche, dazu die eines Links, falls sie abweicht. */
function roundSizes(current: number): number[] {
  return [...new Set([...ROUND_SIZES, current])].sort((a, b) => a - b);
}

function tasksText(count: number): string {
  return `${count} ${count === 1 ? 'Aufgabe' : 'Aufgaben'}`;
}

function stepHref(step: CourseStep, course: string, index: number): string {
  return hrefFor({ page: 'uebung', id: step.exercise }, stepQuery(step, { course, step: index + 1 }));
}

/** Zeichen der Fertigkeit, Titel der Übung, darunter ihre Einstellungen und die Rundengrösse. */
function StepText({ step, withRound = true }: { step: CourseStep; withRound?: boolean }) {
  const generator = generatorById(step.exercise)!;
  const parts = describeSettings(generator, step.filters);
  const settings = (withRound ? [...parts, tasksText(step.round)] : parts).join(' · ');
  return (
    <span class="nav-label">
      <SkillIcon skill={generator.skill} />
      <span class="course-step">
        <span>{fullTitle(generator)}</span>
        {settings && <span class="course-step-settings">{settings}</span>}
      </span>
    </span>
  );
}

function StepLink({ step, href, done }: { step: CourseStep; href: string; done: boolean }) {
  return (
    <a href={href}>
      <StepText step={step} />
      {done && (
        <span class="course-done" role="img" aria-label="erledigt">
          ✓
        </span>
      )}
    </a>
  );
}

function missingText(count: number): string {
  return count === 1
    ? 'Eine Übung aus diesem Kurs gibt es nicht mehr; sie fehlt hier.'
    : `${count} Übungen aus diesem Kurs gibt es nicht mehr; sie fehlen hier.`;
}

/** Im Link steht kein Kurs — oder nur Übungen, die es nicht mehr gibt. */
function NoCourse({ search }: { search: string }) {
  const { missing } = decodeCourse(search);
  return (
    <div class="list-page">
      <a class="back-link" href={hrefFor({ page: 'start' })}>
        ‹ Startseite
      </a>
      <h1>Kein Kurs</h1>
      <p class="subtitle">
        {missing > 0
          ? 'Die Übungen dieses Kurses gibt es nicht mehr.'
          : 'In diesem Link steht kein Kurs. Vielleicht fehlt ein Stück.'}
      </p>
    </div>
  );
}
