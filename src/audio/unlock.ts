/**
 * Klang freischalten, bevor er gebraucht wird.
 *
 * Damit eine Höraufgabe von selbst erklingen kann, muss der Audiokontext
 * vorher in einer Nutzeraktion gestartet worden sein — auf iOS zwingend in der
 * Aktion selbst, nicht später. Die passenden Aktionen sind:
 *  - der Klick auf den Link zu einer Höraufgabe (die erste Aufgabe soll schon
 *    klingen), und
 *  - jeder Klick innerhalb einer Übung mit Hörbeispiel («Weiter», «Fertig» …).
 *
 * Auf allen anderen Seiten bleibt der Audiokontext unberührt.
 */

import { generatorById } from '../generators/index';
import { routeFromPath } from '../pages';
import { BASE } from '../router';
import { player } from './player';

function leadsToListening(anchor: HTMLAnchorElement): boolean {
  const url = new URL(anchor.href, globalThis.location.href);
  if (url.origin !== globalThis.location.origin || !url.pathname.startsWith(BASE)) return false;
  const route = routeFromPath(url.pathname.slice(BASE.length));
  return route.page === 'uebung' && generatorById(route.id)?.skill === 'hoeren';
}

export function installAudioUnlock(): void {
  const handler = (event: Event) => {
    const target = event.target as Element | null;
    const anchor = target?.closest?.('a[href]') as HTMLAnchorElement | null;
    const inListening = document.querySelector('.session .audio-player') !== null;
    if (inListening || (anchor && leadsToListening(anchor))) player.unlock();
  };
  // Capture: vor dem Seitenwechsel des Routers, solange die Aktion noch läuft.
  // «click» und «keydown» zählen auf allen Plattformen als Nutzeraktion,
  // «pointerdown» auf iOS nicht in jedem Fall.
  document.addEventListener('click', handler, true);
  document.addEventListener('keydown', handler, true);
}
