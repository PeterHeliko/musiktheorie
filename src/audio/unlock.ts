/**
 * Klang freischalten, bevor er gebraucht wird.
 *
 * Damit eine Höraufgabe (oder der Ausgangston einer Singaufgabe) von selbst
 * erklingen kann, muss der Audiokontext vorher in einer Nutzeraktion gestartet
 * worden sein — auf iOS zwingend in der Aktion selbst, nicht später. Die
 * passenden Aktionen sind:
 *  - der Klick auf den Link zu einer Hör-, Sing- oder Klaviaturaufgabe (die
 *    erste Aufgabe bzw. Taste soll schon klingen), und
 *  - jeder Klick innerhalb einer Übung mit Hörbeispiel oder spielbarer
 *    Klaviatur («Weiter», eine Taste …).
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
  const skill = route.page === 'uebung' ? generatorById(route.id)?.skill : undefined;
  // Klaviatur: beim Spielen klingen die Tasten. Auf iOS gibt das erste
  // Antippen einer Taste den Ton erst beim Loslassen frei (pointerdown zählt
  // dort nicht als Nutzeraktion) — deshalb schon hier.
  return skill === 'hoeren' || skill === 'singen' || skill === 'klaviatur';
}

export function installAudioUnlock(): void {
  const handler = (event: Event) => {
    const target = event.target as Element | null;
    const anchor = target?.closest?.('a[href]') as HTMLAnchorElement | null;
    const inListening = document.querySelector('.session .audio-player, .session .piano.is-interactive') !== null;
    if (inListening || (anchor && leadsToListening(anchor))) player.unlock();
  };
  // Capture: vor dem Seitenwechsel des Routers, solange die Aktion noch läuft.
  // «click» und «keydown» zählen auf allen Plattformen als Nutzeraktion,
  // «pointerdown» auf iOS nicht in jedem Fall.
  document.addEventListener('click', handler, true);
  document.addEventListener('keydown', handler, true);
}
