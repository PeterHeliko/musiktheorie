/**
 * Teilen — zwei Links zur Auswahl, im Einstellungsblatt der Übung:
 *  - die Übung mit den aktuellen Einstellungen (wer ihn öffnet, bekommt neue
 *    Aufgaben derselben Art), und
 *  - genau diese Aufgabe bzw. diese Runde.
 *
 * Auf Telefonen öffnet sich das Teilen-Menü des Systems, sonst wird der Link
 * kopiert. Der Link steht zusätzlich als markierbarer Text da: Kopieren in die
 * Zwischenablage kann scheitern (alte Browser, eingebettete Ansichten), und
 * dann soll man ihn trotzdem bekommen.
 */

import { useEffect, useState } from 'preact/hooks';
import { absoluteUrl } from '../router';

export function ShareLinks({
  title,
  exerciseHref,
  taskHref,
  taskLabel,
  taskHint,
}: {
  title: string;
  exerciseHref: string;
  /** null, wenn sich die laufende Aufgabe nicht als Link fassen lässt. */
  taskHref: string | null;
  taskLabel: string;
  taskHint: string;
}) {
  return (
    <div class="share-links">
      <ShareRow
        label="Diese Übung"
        hint="mit diesen Einstellungen, neue Aufgaben"
        title={title}
        url={absoluteUrl(exerciseHref)}
      />
      {taskHref !== null && (
        <ShareRow
          label={taskLabel}
          hint={taskHint}
          title={title}
          url={absoluteUrl(taskHref)}
        />
      )}
    </div>
  );
}

/** Ein Link zum Teilen. Auch für Kurse (CoursePage). */
export function ShareRow({
  label,
  hint,
  title,
  text,
  url,
}: {
  label: string;
  hint: string;
  title: string;
  /**
   * Begleittext im Teilen-Menü des Telefons. Für Kurse: die Linkvorschau kann
   * ihren Titel nicht zeigen, der Text schon.
   */
  text?: string;
  url: string;
}) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const canShare = typeof navigator.share === 'function' && isTouchDevice();

  useEffect(() => setState('idle'), [url]);

  const share = async () => {
    if (canShare) {
      try {
        await navigator.share(text ? { title, text, url } : { title, url });
        return;
      } catch (error) {
        // Abgebrochen ist kein Fehler; alles andere: kopieren versuchen.
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setState('copied');
    } catch {
      setState('failed');
    }
  };

  return (
    <div class="share-row">
      <div class="share-row-head">
        <span>
          <strong>{label}:</strong> <span class="share-hint">{hint}</span>
        </span>
        <button type="button" class="share-copy" onClick={share}>
          {state === 'copied' ? 'Kopiert ✓' : canShare ? 'Teilen …' : 'Link kopieren'}
        </button>
      </div>
      <input
        class="share-url"
        type="text"
        readOnly
        value={url}
        aria-label={`Link: ${label}`}
        onFocus={(event) => (event.currentTarget as HTMLInputElement).select()}
      />
      {state === 'failed' && (
        <p class="share-hint">Kopieren ging nicht. Markiere den Link und kopiere ihn von Hand.</p>
      )}
    </div>
  );
}

/** Teilen-Menü nur auf Touch-Geräten; am Rechner ist Kopieren der erwartete Weg. */
function isTouchDevice(): boolean {
  return globalThis.matchMedia?.('(pointer: coarse)').matches ?? false;
}
