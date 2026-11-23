/**
 * Einstellungen einer Übung — hinter dem ⚙ in der Übungsansicht.
 *
 * Hier steht alles, was nicht die Aufgabe selbst ist: Übungsform, Filter,
 * Zurücksetzen, Teilen. So bleibt die Übung selbst frei davon.
 *
 * Änderungen gelten beim Schliessen, nicht bei jedem Antippen: wer drei Filter
 * umstellt, bekommt eine neue Aufgabe, nicht drei. Ändert sich nichts, läuft
 * die Aufgabe einfach weiter.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import type { FilterValues, Generator } from '../generators/types';
import { canonicalFilters, encodeLink } from '../links';
import { hrefFor } from '../router';
import { ROUND_SIZES, type SessionSettings } from '../settings';
import { FilterFields } from './FilterFields';
import { ShareLinks } from './ShareLinks';

export function SettingsSheet({
  generator,
  filters,
  session,
  taskHref,
  onClose,
}: {
  generator: Generator<FilterValues>;
  filters: FilterValues;
  session: SessionSettings;
  /** Link zur laufenden Aufgabe bzw. Runde; null, wenn es keinen gibt. */
  taskHref: string | null;
  /** Mit den neuen Werten — oder null, wenn sich nichts geändert hat. */
  onClose: (next: { filters: FilterValues; session: SessionSettings } | null) => void;
}) {
  const [draftFilters, setDraftFilters] = useState(filters);
  const [draftSession, setDraftSession] = useState(session);
  const done = useRef<HTMLButtonElement>(null);

  const filtersChanged = JSON.stringify(canonicalFilters(generator, draftFilters)) !==
    JSON.stringify(canonicalFilters(generator, filters));
  const sessionChanged =
    draftSession.mode !== session.mode || (draftSession.mode === 'runde' && draftSession.size !== session.size);
  const changed = filtersChanged || sessionChanged;

  const close = () =>
    onClose(changed ? { filters: canonicalFilters(generator, draftFilters), session: draftSession } : null);

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

          <section class="sheet-section">
            <h3>Teilen</h3>
            <ShareLinks
              title={generator.title}
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
