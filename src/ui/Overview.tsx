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

import { topicSections, topicsWithGenerators } from '../generators/index';
import { topicTitle, type TopicId } from '../generators/types';
import { hrefFor } from '../router';
import { SkillIcon } from './icons';

/** Startseite und «/ueben/»: die Themen. */
export function TopicList({ heading }: { heading: string }) {
  return (
    <div class="list-page">
      <h1>{heading}</h1>
      <ul class="nav-list">
        {topicsWithGenerators().map((topic) => (
          <li key={topic.id}>
            <a href={hrefFor({ page: 'thema', topic: topic.id })}>{topic.title}</a>
          </li>
        ))}
      </ul>
      <ul class="nav-list">
        <li>
          <a href={hrefFor({ page: 'tonhoehe' })}>Tonhöhe anzeigen</a>
        </li>
      </ul>
    </div>
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
