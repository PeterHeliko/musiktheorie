/* Herkunft: musiktheorie-scorm/src/ui/Score.tsx (Stand 2026-08-21), über das Projekt «training».
   Wird hier eigenständig weitergeführt; es gibt keinen Abgleich mit dem Original mehr. */
/**
 * Preact-Hülle um den VexFlow-Renderer.
 *
 * VexFlow zeichnet imperativ ins DOM, deshalb bekommt es einen eigenen
 * Container, den Preact nicht anfasst. Neu gezeichnet wird nur, wenn sich die
 * Beschreibung tatsächlich geändert hat.
 */

import { useEffect, useRef } from 'preact/hooks';
import type { ScoreSpec } from '../content/schema';
import { renderScore, type RenderedScore } from '../music/render';

export function Score({
  spec,
  onRendered,
  className,
}: {
  spec: ScoreSpec;
  /** Zugriff auf Geometrie und Notenobjekte, z.B. für das Eingabe-Widget. */
  onRendered?: (rendered: RenderedScore, container: HTMLDivElement) => void;
  className?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const signature = JSON.stringify(spec);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const rendered = renderScore(element, spec);
    onRendered?.(rendered, element);

    const fit = spec.fit;
    if (!fit) return;
    // Neu gemessen wird beim Zeichnen und wenn sich das Fenster ändert
    // (Drehen, Safaris ein- und ausfahrende Leisten) — nicht, wenn die Leiste
    // unten nach dem Antworten höher wird: sonst schrumpfte das Bild mitten
    // in der Rückmeldung.
    const refit = () => fitToRoom(element, fit);
    refit();
    globalThis.addEventListener('resize', refit);
    return () => globalThis.removeEventListener('resize', refit);
    // `signature` als Abhängigkeit: `spec` ist bei jedem Rendern ein neues
    // Objekt, der Inhalt aber meist identisch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return <div class={`score ${spec.fit ? 'score-fit' : ''} ${className ?? ''}`} ref={container} />;
}

/**
 * Grösse eines Notenbilds mit `fit`: so gross, dass der Rest der Aufgabe
 * gerade noch ohne Scrollen Platz hat, zwischen `minScale` und `maxScale`.
 *
 * Gerechnet wird in der scrollenden Mitte der Übungsansicht (.session-body):
 * deren Innenhöhe, abzüglich allem, was ausser dem Bild darin steht. Der Rest
 * hängt nicht von der Bildgrösse ab — die Knöpfe richten sich nach der Breite
 * der Spalte —, deshalb genügt ein Durchgang. Breiter als die Spalte wird das
 * Bild nie (max-width: 100%, render.ts). Ausserhalb der Übungsansicht bleibt
 * es bei `scale`.
 */
function fitToRoom(
  container: HTMLDivElement,
  { minScale, maxScale }: NonNullable<ScoreSpec['fit']>,
): void {
  const svg = container.querySelector('svg');
  const body = container.closest<HTMLElement>('.session-body');
  const column = body?.firstElementChild;
  if (!svg || !body || !column) return;
  const { width: drawnWidth, height: drawnHeight } = svg.viewBox.baseVal;
  if (!drawnWidth || !drawnHeight) return;

  const style = getComputedStyle(body);
  const room = body.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
  // Die Spalte umschliesst die Ränder ihres Inhalts (display: flow-root,
  // styles.css) — sonst fehlten sie hier.
  const others = column.getBoundingClientRect().height - svg.getBoundingClientRect().height;
  const height = Math.min(Math.max(room - others, drawnHeight * minScale), drawnHeight * maxScale);
  svg.style.width = `${Math.floor((height * drawnWidth) / drawnHeight)}px`;
}
