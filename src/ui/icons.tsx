/**
 * Strichsymbole für die Leiste der Übungsansicht.
 *
 * Übernommen aus padago (public/index.html, Symbole «i-close», «i-gear» und
 * «i-info»), Zeichnung unverändert: 24er-Raster, Linien in der Schriftfarbe,
 * runde Enden. Strichstärke und Grösse stehen in styles.css (.icon),
 * ebenfalls wie dort.
 *
 * Sie ersetzen die Schriftzeichen ✕, ⚙ und ⓘ — die zeichnet jedes System mit
 * einer anderen Schrift, mal fett, mal dünn, mal als farbiges Emoji.
 */

import type { Skill } from '../generators/types';

export function CloseIcon() {
  return (
    <svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M6.3 6.3 17.7 17.7M17.7 6.3 6.3 17.7" />
    </svg>
  );
}

export function GearIcon() {
  return (
    <svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M18.06 10.26 20.41 10.21 20.41 13.79 18.06 13.74 16.53 16.38 17.75 18.39 14.66 20.18 13.52 18.11 10.48 18.11 9.34 20.18 6.25 18.39 7.47 16.38 5.94 13.74 3.59 13.79 3.59 10.21 5.94 10.26 7.47 7.62 6.25 5.61 9.34 3.82 10.48 5.89 13.52 5.89 14.66 3.82 17.75 5.61 16.53 7.62Z" />
      <circle cx="12" cy="12" r="2.6" />
    </svg>
  );
}

export function InfoIcon() {
  return (
    <svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="8.8" />
      <path d="M12 11.4v5" />
      <circle cx="12" cy="7.9" r=".9" fill="currentColor" stroke="none" />
    </svg>
  );
}

/**
 * Was eine Übung verlangt, als Zeichen vor ihrem Titel in den Listen
 * (Entscheid 2026-11-24, nur dort — nicht in der Leiste der Übung):
 * Notenlinien für Benennen und Notieren im Notenbild, eine Klaviatur, ein
 * Ohr fürs Hören, ein Mikrofon fürs Singen. Gezeichnet wie die Symbole
 * oben: 24er-Raster, Linien in der Schriftfarbe.
 */
export function SkillIcon({ skill }: { skill: Skill }) {
  switch (skill) {
    case 'erkennen':
    case 'notieren':
      return (
        <svg class="icon skill-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M2.5 4h19M2.5 8h19M2.5 12h19M2.5 16h19M2.5 20h19" stroke-width="1" />
          <ellipse cx="11" cy="14" rx="3.3" ry="2.4" transform="rotate(-20 11 14)" fill="currentColor" stroke="none" />
          <path d="M14 13.1V2.5" stroke-width="1.6" />
        </svg>
      );
    case 'klaviatur':
      return (
        <svg class="icon skill-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <rect x="3" y="4.5" width="18" height="15" rx="1.5" />
          <path d="M16.5 4.5v15M7.5 12v7.5M12 12v7.5" />
          <path d="M6.2 4.5h2.6V12H6.2zM10.7 4.5h2.6V12h-2.6z" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'hoeren':
      return (
        <svg class="icon skill-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M6.5 9a5.5 5.5 0 0 1 11 0c0 4.5-4.5 5-4.5 8.5a3 3 0 0 1-6 0" />
          <path d="M14.5 9a2.5 2.5 0 0 0-5 0v.8a1.8 1.8 0 0 1 0 3.6" />
        </svg>
      );
    case 'singen':
      return (
        <svg class="icon skill-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <rect x="9.25" y="3" width="5.5" height="10.5" rx="2.75" />
          <path d="M6 11a6 6 0 0 0 12 0M12 17v3.5M8.75 20.5h6.5" />
        </svg>
      );
    default:
      return null;
  }
}
