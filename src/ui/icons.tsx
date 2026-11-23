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
