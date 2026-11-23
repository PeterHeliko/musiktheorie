/**
 * Tastenkürzel der Übungsseite.
 *
 *  - Eingabe- oder Leertaste: prüfen bzw. weiter (`QuestionView`).
 *  - Beim Intervall notieren: Tonname setzt den Ton, ↑/↓ verschiebt ihn um
 *    einen Halbton, mit Umschalt um eine Oktave, ⌫ nimmt ihn weg
 *    (`NotationInput`).
 *
 * Die Kürzel gelten auf der ganzen Seite, ohne dass erst etwas angeklickt
 * werden muss — ausser dort, wo die Tasten schon etwas anderes bedeuten.
 */

/**
 * Darf dieser Tastendruck als Kürzel gelten? Nicht in einem Eingabe- oder
 * Auswahlfeld, nicht zusammen mit Strg, Alt oder ⌘ (das sind Befehle des
 * Browsers) und nicht, solange ein Blatt wie die Einstellungen offen ist —
 * die Aufgabe liegt dann zwar noch darunter, ist aber nicht gemeint.
 */
export function shortcutAllowed(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || event.isComposing) return false;
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  if (document.querySelector('[aria-modal="true"]')) return false;
  const target = event.target;
  return !(target instanceof Element && target.closest('input, select, textarea, [contenteditable]'));
}

/**
 * Wird gerade mit Tab von Element zu Element gegangen? Bis zum nächsten Klick
 * oder Tippen gilt das als ja.
 *
 * `:focus-visible` taugt dafür nicht: Chrome lässt einen angeklickten Knopf
 * dazu wechseln, sobald irgendeine Taste gedrückt wird — auch ein Tonname.
 */
let tabbing = false;
if (typeof document !== 'undefined') {
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Tab') tabbing = true;
  }, true);
  document.addEventListener('pointerdown', () => {
    tabbing = false;
  }, true);
}

/**
 * Wurde dieses Element mit der Tastatur angesteuert? Dann gehören Eingabe-
 * und Leertaste ihm: wer mit Tab zu einem Knopf geht, will ihn auslösen. Nach
 * einem Mausklick bleibt der Fokus dagegen bloss zufällig auf dem Knopf
 * stehen — dort sollen die Tasten die Übung weiterführen und nicht denselben
 * Knopf ein zweites Mal drücken (bei den Antwortknöpfen hiesse das: abwählen).
 */
export function keyboardFocused(target: EventTarget | null): boolean {
  return tabbing && target instanceof Element && target !== document.body;
}
