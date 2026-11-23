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
    if (!container.current) return;
    const rendered = renderScore(container.current, spec);
    onRendered?.(rendered, container.current);
    // `signature` als Abhängigkeit: `spec` ist bei jedem Rendern ein neues
    // Objekt, der Inhalt aber meist identisch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return <div class={`score ${className ?? ''}`} ref={container} />;
}
