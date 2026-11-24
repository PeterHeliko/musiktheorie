/**
 * Übungen finden: erst das Thema, dann die Übung. Zwei kurze Listen statt
 * einer langen — auf dem Telefon passt jede auf einen Bildschirm.
 *
 * Die Listen nennen nur Titel. Was eine Übung verlangt, steht in der Übung
 * selbst.
 *
 * Alle Einträge sind echte Links: in neuem Tab öffnen, kopieren, teilen. Den
 * Seitenwechsel ohne Neuladen erledigt der Router.
 */

import { countDone, courseTitle, decodeCourse } from '../courses';
import { topicSections, topicsWithGenerators } from '../generators/index';
import { topicTitle, type TopicId } from '../generators/types';
import { SITE_NAME } from '../pages';
import { hrefFor } from '../router';
import { listCourses } from '../settings';
import { GearIcon, SkillIcon } from './icons';

/**
 * Startseite, zwei Kästen (Entscheid 2026-11-24): oben die Übungen — Themen
 * und Werkzeuge —, darunter die Kurse dieses Geräts. Die Themen brauchen
 * keinen Zwischentitel: der Name der Website sagt, was sie sind.
 */
export function StartPage() {
  return (
    <>
      <div class="list-page">
        <h1>{SITE_NAME}</h1>
        <section>
          <ul class="nav-list">
            {topicsWithGenerators().map((topic) => (
              <li key={topic.id}>
                <a href={hrefFor({ page: 'thema', topic: topic.id })}>{topic.title}</a>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h2 class="nav-heading">Werkzeuge</h2>
          <ul class="nav-list">
            <li>
              <a href={hrefFor({ page: 'tonhoehe' })}>Tonhöhe anzeigen</a>
            </li>
          </ul>
        </section>
      </div>
      <section class="list-page course-box">
        <h2>Kurse</h2>
        <CourseList />
      </section>
    </>
  );
}

/** Die Kurse dieses Geräts, zuletzt benutzte zuerst, mit erledigten Schritten. */
function CourseList() {
  const courses = listCourses().map((stored) => ({ stored, course: decodeCourse(stored.link) }));
  if (courses.length === 0) {
    return (
      <p class="course-hint">
        Unter <GearIcon /> innerhalb einer Übung lassen sich Übungen zu einem Kurs hinzufügen.
      </p>
    );
  }
  return (
    <ul class="nav-list">
      {courses.map(({ stored, course }) => (
        <li key={stored.id}>
          <a href={hrefFor({ page: 'kurs' }, stored.link)}>
            <span class="nav-label">{courseTitle(course)}</span>
            <span
              class="course-progress"
              aria-label={`${countDone(course, stored.done)} von ${course.steps.length} erledigt`}
            >
              {countDone(course, stored.done)}/{course.steps.length}
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}

/**
 * Ein Thema: seine Übungen, vom Erkennen über das Notieren zum Hören. Hat das
 * Thema Gruppen (Intervalle: Grob- und Feinbestimmung), steht jede unter
 * einem eigenen Zwischentitel.
 */
export function TopicPage({ topic }: { topic: TopicId }) {
  return (
    <div class="list-page">
      <a class="back-link" href={hrefFor({ page: 'start' })}>
        ‹ Alle Themen
      </a>
      <h1>{topicTitle(topic)}</h1>
      {topicSections(topic).map((section) => (
        <section key={section.title ?? ''}>
          {section.title && <h2 class="nav-heading">{section.title}</h2>}
          <ul class="nav-list">
            {section.generators.map((generator) => (
              <li key={generator.id}>
                <a href={hrefFor({ page: 'uebung', id: generator.id })}>
                  <span class="nav-label">
                    <SkillIcon skill={generator.skill} />
                    {generator.title}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
