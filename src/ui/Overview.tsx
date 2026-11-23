/**
 * Übersicht aller Übungen, nach Thema gegliedert — als Startseite und unter
 * «/ueben/».
 *
 * Die Karten sind echte Links: man kann sie in einem neuen Tab öffnen,
 * kopieren und teilen. Den Seitenwechsel ohne Neuladen erledigt der Router.
 */

import { topicsWithGenerators } from '../generators/index';
import { SKILL_LABELS } from '../generators/types';
import { plainText } from '../pages';
import { hrefFor } from '../router';
import { loadStats } from '../settings';

export function Overview({ variant }: { variant: 'start' | 'ueben' }) {
  return (
    <div class="start-page">
      {variant === 'start' ? (
        <>
          <h1>Musiktheorie üben</h1>
          <p class="subtitle">
            Jede Aufgabe wird neu gewürfelt — mit Einstellungen für das, woran du gerade arbeitest.
            Jede Übung lässt sich als Link teilen. Kein Konto, nichts wird gespeichert ausser in
            deinem Browser.
          </p>
        </>
      ) : (
        <>
          <h1>Alle Übungen</h1>
          <p class="subtitle">Nach Thema geordnet. Jede Aufgabe wird neu gewürfelt.</p>
        </>
      )}

      {topicsWithGenerators().map((topic, index) => (
        <section key={topic.id} class="mode-section">
          <h2>
            <span class="mode-section-number">{index + 1}</span>
            {topic.title}
          </h2>
          <div class="mode-grid">
            {topic.generators.map((generator) => {
              const stats = loadStats(generator.id);
              const rate =
                stats.attempted > 0 ? Math.round((stats.correct / stats.attempted) * 100) : null;
              return (
                <a
                  key={generator.id}
                  class="mode-card"
                  href={hrefFor({ page: 'uebung', id: generator.id })}
                >
                  <span class="mode-card-skill">{SKILL_LABELS[generator.skill]}</span>
                  <span class="mode-card-title">{generator.title}</span>
                  <span class="mode-card-hint">{plainText(generator.instruction)}</span>
                  {rate !== null && (
                    <span class="mode-card-stats">
                      {rate}&nbsp;% richtig · {stats.attempted}{' '}
                      {stats.attempted === 1 ? 'Aufgabe' : 'Aufgaben'}
                    </span>
                  )}
                </a>
              );
            })}
          </div>
        </section>
      ))}

      {variant === 'start' && (
        <section class="mode-section">
          <h2>
            <span class="mode-section-number">+</span>
            Werkzeuge
          </h2>
          <div class="mode-grid">
            <a class="mode-card" href={hrefFor({ page: 'tonhoehe' })}>
              <span class="mode-card-skill">Versuch</span>
              <span class="mode-card-title">Tonhöhe anzeigen</span>
              <span class="mode-card-hint">
                Singe einen Ton — die Seite zeigt, welcher es ist und wie genau du ihn triffst.
              </span>
            </a>
          </div>
        </section>
      )}
    </div>
  );
}
