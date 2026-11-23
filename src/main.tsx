/**
 * Einstiegspunkt der Website.
 *
 * Keine Anmeldung, kein Server: die Seite ist eine reine Übungsumgebung und
 * behält nichts ausser Einstellungen und Trefferquoten im Browser.
 */

import { render } from 'preact';
import './styles.css';
import { App } from './ui/App';
import { interceptLinks } from './router';
import { installAudioUnlock } from './audio/unlock';

const root = document.getElementById('app');
if (!root) throw new Error('Kein Element mit der Kennung «app» gefunden.');

interceptLinks();
installAudioUnlock();
render(<App />, root);

// Klaviersamples werden nicht hier vorgeladen, sondern von jeder Aufgabe mit
// Hörbeispiel selbst, sobald sie erscheint (PracticeAudioPlayer). So lädt
// eine Seite ohne Klang — Übersicht, Tonhöhe, Notenbild-Aufgaben — keine
// 1,5 MB Klavier herunter.
