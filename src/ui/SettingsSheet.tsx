/**
 * Einstellungen einer Übung — hinter dem ⚙ in der Übungsansicht.
 *
 * Hier steht alles, was nicht die Aufgabe selbst ist: Übungsform, Filter,
 * Zurücksetzen, Zum Kurs hinzufügen, Teilen. So bleibt die Übung selbst frei
 * davon.
 *
 * Änderungen gelten beim Schliessen, nicht bei jedem Antippen: wer drei Filter
 * umstellt, bekommt eine neue Aufgabe, nicht drei. Ändert sich nichts, läuft
 * die Aufgabe einfach weiter.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { DEFAULT_ROUND } from '../courses';
import { fullTitle, type FilterValues, type Generator, type Personal } from '../generators/types';
import { canonicalFilters, encodeLink } from '../links';
import { hrefFor } from '../router';
import { ROUND_SIZES, type SessionSettings } from '../settings';
import { VOICE_OPTIONS, isVoice } from '../sing/voice';
import { AddToCourse } from './AddToCourse';
import { FilterFields } from './FilterFields';
import { ShareLinks } from './ShareLinks';

export function SettingsSheet({
  generator,
  filters,
  session,
  personal,
  taskHref,
  inCourse,
  onClose,
}: {
  generator: Generator<FilterValues>;
  filters: FilterValues;
  session: SessionSettings;
  /** Persönliches wie die Stimmlage — steht nie im Link. */
  personal: Personal;
  /** Link zur laufenden Aufgabe bzw. Runde; null, wenn es keinen gibt. */
  taskHref: string | null;
  /**
   * Die Übung ist ein Schritt dieses Kurses. Übungsform und Filter gehören
   * dann dem Kurs und stehen nicht zur Wahl; «Frei üben» öffnet dieselbe
   * Übung ausserhalb des Kurses.
   */
  inCourse?: { title: string } | null;
  /** Mit den neuen Werten — oder null, wenn sich nichts geändert hat. */
  onClose: (next: { filters: FilterValues; session: SessionSettings; personal: Personal } | null) => void;
}) {
  const [draftFilters, setDraftFilters] = useState(filters);
  const [draftSession, setDraftSession] = useState(session);
  const [draftPersonal, setDraftPersonal] = useState(personal);
  const done = useRef<HTMLButtonElement>(null);

  const filtersChanged = JSON.stringify(canonicalFilters(generator, draftFilters)) !==
    JSON.stringify(canonicalFilters(generator, filters));
  const sessionChanged =
    draftSession.mode !== session.mode || (draftSession.mode === 'runde' && draftSession.size !== session.size);
  const personalChanged = draftPersonal.voice !== personal.voice;
  const changed = filtersChanged || sessionChanged || personalChanged;

  const close = () =>
    onClose(
      changed
        ? { filters: canonicalFilters(generator, draftFilters), session: draftSession, personal: draftPersonal }
        : null,
    );

  useEffect(() => {
    done.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  const isDefault = JSON.stringify(canonicalFilters(generator, draftFilters)) ===
    JSON.stringify(canonicalFilters(generator, generator.defaults));

  // Der Übungslink zeigt, was gerade eingestellt ist. Den Aufgabenlink gibt es
  // nur für das, was tatsächlich dasteht — nach einer Änderung nicht mehr.
  const exerciseHref =
    hrefFor({ page: 'uebung', id: generator.id }) +
    encodeLink(generator, {
      filters: draftFilters,
      round: draftSession.mode === 'runde' ? draftSession.size : null,
      seed: null,
    });

  // «Frei üben»: dieselbe Übung mit den Einstellungen des Kurses, ohne Ende
  // und ohne Kursbezug — dort lässt sich wieder alles einstellen.
  const freeHref =
    hrefFor({ page: 'uebung', id: generator.id }) + encodeLink(generator, { filters, round: null, seed: null });

  return (
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
      <header class="sheet-bar">
        <div class="session-column sheet-bar-inner">
          <h2 id="sheet-title">Einstellungen</h2>
          <button type="button" class="primary" ref={done} onClick={close}>
            Fertig
          </button>
        </div>
      </header>

      <div class="sheet-body">
        <div class="session-column">
          {inCourse ? (
            <section class="sheet-section">
              <h3>Kurs «{inCourse.title}»</h3>
              <p class="share-hint">Übungsform und Einstellungen gehören zum Kurs.</p>
              <p class="course-free">
                <a class="link-button" href={freeHref}>
                  Frei üben
                </a>
              </p>
            </section>
          ) : (
            <>
              <section class="sheet-section">
                <div class="filter-field">
                  <div class="filter-label">Übungsform</div>
                  <div class="filter-options" role="radiogroup" aria-label="Übungsform">
                    <button
                      type="button"
                      role="radio"
                      aria-checked={draftSession.mode === 'endlos'}
                      class={`filter-chip ${draftSession.mode === 'endlos' ? 'is-selected' : ''}`}
                      onClick={() => setDraftSession({ ...draftSession, mode: 'endlos' })}
                    >
                      Üben ohne Ende
                    </button>
                    {ROUND_SIZES.map((size) => {
                      const active = draftSession.mode === 'runde' && draftSession.size === size;
                      return (
                        <button
                          key={size}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          class={`filter-chip ${active ? 'is-selected' : ''}`}
                          onClick={() => setDraftSession({ mode: 'runde', size })}
                        >
                          Runde à {size}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </section>

              <section class="sheet-section">
                <FilterFields filters={generator.filters} values={draftFilters} onChange={setDraftFilters} />
                <div class="filter-actions">
                  <button
                    type="button"
                    class="link-button"
                    disabled={isDefault}
                    onClick={() => setDraftFilters(generator.defaults)}
                  >
                    Auf Vorgabe zurücksetzen
                  </button>
                </div>
              </section>
            </>
          )}

          {generator.skill === 'singen' && (
            <section class="sheet-section">
              <FilterFields
                filters={[
                  {
                    kind: 'single',
                    key: 'voice',
                    label: 'Stimmlage',
                    options: VOICE_OPTIONS,
                  },
                ]}
                values={{ voice: draftPersonal.voice }}
                onChange={(next) => {
                  if (isVoice(next.voice)) setDraftPersonal({ ...draftPersonal, voice: next.voice });
                }}
              />
            </section>
          )}

          {!inCourse && (
            <AddToCourse
              step={{
                exercise: generator.id,
                filters: canonicalFilters(generator, draftFilters),
                round: draftSession.mode === 'runde' ? draftSession.size : DEFAULT_ROUND,
              }}
            />
          )}

          <section class="sheet-section">
            <h3>Teilen</h3>
            <ShareLinks
              title={fullTitle(generator)}
              exerciseHref={exerciseHref}
              taskHref={changed ? null : taskHref}
              taskLabel={session.mode === 'runde' ? 'Diese Runde' : 'Diese Aufgabe'}
            />
          </section>
        </div>
      </div>
    </div>
  );
}
