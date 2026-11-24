/**
 * Ein Kurs: seine Schritte, was davon erledigt ist, und der Link zum Teilen.
 *
 * Der Kurs steht ganz in der Adresse (`courses.ts`). Beim Öffnen kommt er in
 * die Liste dieses Geräts — oder es öffnet sich der Eintrag, der genau diesen
 * Inhalt schon hat, samt Fortschritt. Jeder Schritt ist ein Link auf seine
 * Übung, mit dem Kursbezug in der Adresse.
 */

import { useEffect, useState } from 'preact/hooks';
import {
  courseTitle,
  decodeCourse,
  describeSettings,
  encodeCourse,
  isCourse,
  isDone,
  stepQuery,
  type CourseStep,
  type DecodedCourse,
} from '../courses';
import { generatorById } from '../generators/index';
import { fullTitle } from '../generators/types';
import { SITE_NAME } from '../pages';
import { absoluteUrl, hrefFor, replaceQuery } from '../router';
import { openCourse, type StoredCourse } from '../settings';
import { SkillIcon } from './icons';
import { ShareRow } from './ShareLinks';

interface Opened {
  course: DecodedCourse;
  stored: StoredCourse;
}

export function CoursePage({ search }: { search: string }) {
  // Nur beim Öffnen gelesen; was die Seite danach ändert, schreibt sie selbst
  // in die Adresse.
  const [opened] = useState<Opened | null>(() => {
    const course = decodeCourse(search);
    if (!isCourse(course)) return null;
    return { course, stored: openCourse(encodeCourse(course)) };
  });

  const href = opened ? hrefFor({ page: 'kurs' }, opened.stored.link) : null;

  // Feste Schreibweise in der Adresszeile: was sich nicht lesen liess, ist weg.
  useEffect(() => {
    if (href) replaceQuery(href);
  }, [href]);

  const title = opened ? courseTitle(opened.course) : 'Kein Kurs';
  useEffect(() => {
    document.title = `${title} · Kurs · ${SITE_NAME}`;
  }, [title]);

  if (!opened) return <NoCourse search={search} />;

  const { course, stored } = opened;

  return (
    <div class="list-page">
      <a class="back-link" href={hrefFor({ page: 'start' })}>
        ‹ Startseite
      </a>
      <h1>{title}</h1>

      {course.missing > 0 && (
        <div class="notice notice-info" role="status">
          <p>{missingText(course.missing)}</p>
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
    </div>
  );
}

function stepHref(step: CourseStep, course: string, index: number): string {
  return hrefFor({ page: 'uebung', id: step.exercise }, stepQuery(step, { course, step: index + 1 }));
}

function StepLink({ step, href, done }: { step: CourseStep; href: string; done: boolean }) {
  const generator = generatorById(step.exercise)!;
  const settings = [...describeSettings(generator, step.filters), `${step.round} Aufgaben`].join(' · ');
  return (
    <a href={href}>
      <span class="nav-label">
        <SkillIcon skill={generator.skill} />
        <span class="course-step">
          <span>{fullTitle(generator)}</span>
          <span class="course-step-settings">{settings}</span>
        </span>
      </span>
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
          : 'In diesem Link steht kein Kurs — vielleicht fehlt ein Stück.'}
      </p>
    </div>
  );
}
