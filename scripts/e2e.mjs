/**
 * Kontrolle der gebauten Seite im Browser — so ausgeliefert wie auf GitHub
 * Pages (scripts/serve.mjs), unter der echten Basis /musiktheorie/.
 *
 * Die Unit-Tests prüfen, ob die Aufgaben stimmen und ob Links hin und zurück
 * funktionieren. Hier steht, was nur im Browser sichtbar wird: ob jede Seite
 * ihre eigene HTML-Datei hat, ob ein Klick ohne Neuladen wechselt, ob ein
 * geteilter Link wirklich dieselbe Aufgabe zeigt, ob der Ton lädt, ob die
 * Tonhöhenerkennung ein echtes Mikrofonsignal versteht.
 *
 * Aufruf: npm run e2e   (vorher `npm run build`)
 *         npm run e2e -- --headed --slow    zum Zuschauen
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { startServer } from './serve.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const SHOTS = join(ROOT, '.e2e-screenshots');
const PORT = 4319;
const BASE_PATH = process.env.BASE_PATH ?? '/musiktheorie/';
const BASE = `http://127.0.0.1:${PORT}${BASE_PATH}`;

const headed = process.argv.includes('--headed');
const slow = process.argv.includes('--slow');

/** Alle Übungen mit Titel — muss zu src/generators/ passen. */
const MODES = {
  'notenwerte-zuordnen': 'Notenwerte und Pausenzeichen zuordnen',
  'pausen-ergaenzen': 'Fehlende Pausen ergänzen',
  'intervalle-bestimmen': 'Intervalle am Notenbild bestimmen',
  'intervalle-notieren': 'Intervalle notieren',
  'intervalle-hoeren': 'Intervalle hörend erkennen',
  'tonarten-zuordnen': 'Tonarten den Vorzeichen zuordnen',
  'vorzeichen-setzen': 'Vorzeichen setzen',
  'halbtonschritte-markieren': 'Halbtonschritte markieren',
  'tonleitern-hoeren': 'Tonleitern hörend erkennen',
  'dreiklaenge-bestimmen': 'Dreiklänge bestimmen',
  'stufen-bestimmen': 'Stufen bestimmen',
  'dreiklaenge-hoeren': 'Dreiklänge hörend erkennen',
  melodiediktat: 'Rhythmus- und Melodiediktat',
};
const MODE_IDS = Object.keys(MODES);

let failures = 0;

function check(condition, label) {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}`);
  }
}

const exercise = (id, query = '') => `${BASE}ueben/${id}/${query}`;

/** Notenbild ohne die von VexFlow fortlaufend vergebenen Kennungen. */
async function scoreFingerprint(page) {
  await page.waitForSelector('.question svg');
  const svgs = await page.locator('.question svg').evaluateAll((nodes) =>
    nodes.map((node) => node.outerHTML),
  );
  return svgs.join('').replace(/\sid="[^"]*"/g, '');
}

/**
 * Ein Mikrofonsignal als WAV, so leise wie auf einem iPhone ohne
 * Sprachaufbereitung: erst eine Sekunde Raumrauschen (rund −75 dBFS), dann ein
 * obertonreicher Ton wie eine Stimme, Spitze etwa −33 dBFS. Mit der früheren
 * festen Schwelle von −40 dBFS RMS wäre dieser Ton als Stille durchgefallen.
 */
function writeToneWav(path, frequency, seconds = 4, sampleRate = 48000) {
  const count = Math.round(seconds * sampleRate);
  const buffer = Buffer.alloc(44 + count * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + count * 2, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(count * 2, 40);
  const leadIn = sampleRate; // eine Sekunde nur Raum
  let seed = 12345;
  const noise = () => {
    seed = (seed * 1103515245 + 12345) >>> 0;
    return seed / 0xffffffff - 0.5;
  };
  for (let i = 0; i < count; i++) {
    let value = 0;
    if (i >= leadIn) {
      // Grundton plus fünf Obertöne mit abnehmender Stärke.
      for (let harmonic = 1; harmonic <= 6; harmonic++) {
        value += Math.sin((2 * Math.PI * frequency * harmonic * i) / sampleRate) / harmonic;
      }
      value *= 0.014;
    }
    value += noise() * 0.0006;
    buffer.writeInt16LE(Math.round(value * 32767), 44 + i * 2);
  }
  writeFileSync(path, buffer);
}

async function main() {
  rmSync(SHOTS, { recursive: true, force: true });
  mkdirSync(SHOTS, { recursive: true });

  const server = await startServer(PORT);
  const browser = await chromium.launch({ headless: !headed, slowMo: slow ? 350 : 0 });

  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    /** Konsolenfehler und fehlgeschlagene Anfragen sammeln — beides ist ein Mangel. */
    const problems = [];
    page.on('console', (message) => {
      // Die absichtlich aufgerufene Fehlerseite meldet ihre 404 auch hier.
      if (message.type() === 'error' && !message.location().url.includes('gibt-es-nicht')) {
        problems.push(`Konsole: ${message.text()}`);
      }
    });
    page.on('requestfailed', (request) =>
      problems.push(`Anfrage: ${request.url()} — ${request.failure()?.errorText}`),
    );
    page.on('response', (response) => {
      // Die absichtlich aufgerufene Fehlerseite zählt nicht.
      if (response.status() >= 400 && !response.url().includes('gibt-es-nicht')) {
        problems.push(`HTTP ${response.status()}: ${response.url()}`);
      }
    });

    // ------------------------------------------------- eine Datei je Seite
    console.log('\nJede Seite hat ihre eigene HTML-Datei (wie auf GitHub Pages)');
    const pages = [
      ['', 'Musiktheorie üben'],
      ['ueben/', 'Alle Übungen · Musiktheorie üben'],
      ['werkzeuge/tonhoehe/', 'Tonhöhe anzeigen · Musiktheorie üben'],
      ...MODE_IDS.map((id) => [`ueben/${id}/`, `${MODES[id]} · Musiktheorie üben`]),
    ];
    let filesOk = 0;
    for (const [path, title] of pages) {
      // Ohne Browser gelesen — so, wie eine Chat-Vorschau die Seite sieht.
      const response = await fetch(BASE + path);
      const html = await response.text();
      const ok =
        response.status === 200 &&
        html.includes(`<title>${title}</title>`) &&
        html.includes('property="og:title"') &&
        html.includes('name="description"');
      if (ok) filesOk++;
      else console.log(`       ${path || '/'}: Status ${response.status}`);
    }
    check(filesOk === pages.length, `${filesOk}/${pages.length} Seiten mit eigenem Titel und Vorschau`);

    const noSlash = await fetch(`${BASE}ueben/intervalle-hoeren`, { redirect: 'manual' });
    check(
      noSlash.status === 301 && noSlash.headers.get('location')?.endsWith('/ueben/intervalle-hoeren/'),
      'Adresse ohne Schrägstrich leitet weiter',
    );

    const missing = await page.goto(`${BASE}gibt-es-nicht/`, { waitUntil: 'networkidle' });
    check(missing.status() === 404, 'unbekannte Adresse antwortet mit 404');
    check(
      (await page.locator('h1').innerText()) === 'Seite nicht gefunden',
      'und zeigt eine Fehlerseite mit Weg zurück',
    );
    const unknownExercise = await page.goto(exercise('gibt-es-nicht'), { waitUntil: 'networkidle' });
    check(unknownExercise.status() === 404, 'unbekannte Übung antwortet mit 404');

    // ----------------------------------------------------------- Startseite
    console.log('\nStartseite und Übersicht');
    const loaded = [];
    page.on('request', (request) => loaded.push(request.url()));
    await page.goto(BASE, { waitUntil: 'networkidle' });
    check(
      (await page.locator('.mode-card[href*="/ueben/"]').count()) === MODE_IDS.length,
      `${MODE_IDS.length} Übungen auf der Startseite`,
    );
    check((await page.locator('.mode-section').count()) === 6, 'fünf Themen und die Werkzeuge');
    check(
      !loaded.some((url) => url.includes('ExercisePage')),
      'die Startseite lädt den Notensatz nicht',
    );
    check(!loaded.some((url) => url.includes('/samples/')), 'die Startseite lädt keine Klaviertöne');
    await page.screenshot({ path: join(SHOTS, '00-start.png'), fullPage: true });

    // Wechsel ohne Neuladen: eine Markierung im Fenster überlebt nur dann.
    await page.evaluate(() => (window.__ohneNeuladen = true));
    await page.locator('.mode-card', { hasText: 'Intervalle am Notenbild bestimmen' }).click();
    await page.waitForSelector('.question');
    check(page.url().startsWith(exercise('intervalle-bestimmen')), 'Klick auf eine Karte öffnet die Übung');
    check(await page.evaluate(() => window.__ohneNeuladen === true), 'ohne die Seite neu zu laden');
    check(
      (await page.title()) === 'Intervalle am Notenbild bestimmen · Musiktheorie üben',
      'der Titel im Tab folgt',
    );
    await page.goBack();
    await page.waitForSelector('.mode-card');
    check(page.url() === BASE, 'der Zurück-Knopf führt zur Startseite');

    await page.goto(`${BASE}ueben/`, { waitUntil: 'networkidle' });
    check(
      (await page.locator('.mode-card').count()) === MODE_IDS.length,
      '«/ueben/» listet alle Übungen',
    );

    // ------------------------------------------------- jede Übung zeichnet sich
    console.log('\nJede Übung öffnet direkt über ihre Adresse und ist lösbar');
    for (const mode of MODE_IDS) {
      await page.goto(exercise(mode), { waitUntil: 'networkidle' });
      await page.waitForSelector('.question, .notice-warning', { timeout: 10_000 });

      const broken = await page.locator('.notice-warning').count();
      const hasInstruction = (await page.locator('.question .instruction').innerText()).length > 10;

      // Lösbar heisst: es gibt etwas anzuklicken — Antwortknöpfe, eine
      // Auswahlliste oder ein Notensystem, in das man schreiben kann.
      // Gewartet statt gemessen: VexFlow zeichnet erst nach dem ersten Rendern.
      let answerable = true;
      try {
        await page.waitForSelector(
          '.question .choice, .question select, .question .notation-input svg',
          { timeout: 5000 },
        );
      } catch {
        answerable = false;
      }
      check(
        broken === 0 && hasInstruction && answerable,
        `${mode}${broken ? ' — Generator meldet einen Fehler' : answerable ? '' : ' — nichts zum Anklicken'}`,
      );
      await page.screenshot({ path: join(SHOTS, `${mode}.png`), fullPage: true });
    }

    // -------------------------------------------------- Antworten mit einem Klick
    console.log('\nEinfachauswahl antwortet sofort');
    await page.goto(exercise('intervalle-bestimmen'), { waitUntil: 'networkidle' });
    await page.waitForSelector('.question .choice');
    check(
      (await page.locator('button:has-text("Prüfen")').count()) === 0,
      'kein Prüfen-Knopf bei einem einzelnen Knopfraster',
    );
    await page.locator('.question .choice').first().click();
    await page.waitForSelector('.feedback', { timeout: 5000 });
    check(await page.locator('.feedback').isVisible(), 'ein Klick genügt für die Rückmeldung');
    check(
      (await page.locator('.question .choice[disabled]').count()) > 0,
      'Aufgabe ist nach dem Antworten eingefroren',
    );
    await page.screenshot({ path: join(SHOTS, 'rueckmeldung.png'), fullPage: true });

    const firstTask = new URL(page.url()).searchParams.get('aufgabe');
    await page.locator('button:has-text("Nächste Aufgabe")').click();
    await page.waitForSelector('.question .choice:not([disabled])');
    check((await page.locator('.feedback').count()) === 0, 'Nächste Aufgabe kommt ohne alte Rückmeldung');
    // Die Adresse wird nach dem Zeichnen nachgeführt — darauf warten.
    let secondTask = null;
    try {
      await page.waitForFunction(
        (before) => new URL(location.href).searchParams.get('aufgabe') !== before,
        firstTask,
        { timeout: 3000 },
      );
      secondTask = new URL(page.url()).searchParams.get('aufgabe');
    } catch {
      /* bleibt null */
    }
    check(
      firstTask !== null && secondTask !== null && firstTask !== secondTask,
      `die Adresszeile zeigt immer die aktuelle Aufgabe (${firstTask} → ${secondTask})`,
    );

    // --------------------------------------------- Mehrere Felder brauchen Prüfen
    console.log('\nMehrfeldaufgabe wartet auf «Prüfen»');
    await page.goto(exercise('dreiklaenge-bestimmen'), { waitUntil: 'networkidle' });
    await page.waitForSelector('.question select');
    check(
      await page.locator('button:has-text("Prüfen")').isDisabled(),
      'Prüfen ist erst nach einer Eingabe möglich',
    );
    await page.locator('.question select').first().selectOption({ index: 1 });
    check(
      !(await page.locator('button:has-text("Prüfen")').isDisabled()),
      'Prüfen wird nach der Eingabe möglich',
    );

    // ------------------------------------------------------------ Noteneingabe
    console.log('\nNoteneingabe');
    await page.goto(exercise('intervalle-notieren'), { waitUntil: 'networkidle' });
    await page.waitForSelector('.notation-input svg');
    const staff = page.locator('.notation-input svg').first();
    const box = await staff.boundingBox();
    // In die rechte Hälfte klicken: dort liegt der zu ergänzende Ton.
    await page.mouse.click(box.x + box.width * 0.72, box.y + box.height * 0.45);
    await page.waitForTimeout(200);
    check(!(await page.locator('button:has-text("Prüfen")').isDisabled()), 'ein Klick setzt eine Note');
    await page.locator('button:has-text("Prüfen")').click();
    await page.waitForSelector('.feedback');
    check(await page.locator('.feedback').isVisible(), 'Noteneingabe wird bewertet');
    await page.screenshot({ path: join(SHOTS, 'noteneingabe.png'), fullPage: true });

    // -------------------------------------------------------------------- Klang
    console.log('\nHörbeispiel');
    // Eigener Kontext mit leerem Zwischenspeicher, damit jede Anfrage zählt.
    const fresh = await browser.newContext();
    const audioPage = await fresh.newPage();
    const samples = [];
    audioPage.on('response', (response) => {
      if (response.url().includes('/samples/') && response.status() === 200) samples.push(response.url());
    });
    await audioPage.goto(exercise('intervalle-hoeren'), { waitUntil: 'networkidle' });
    await audioPage.locator('.play-button').first().click();
    await audioPage.waitForSelector('.play-button.is-playing', { timeout: 5000 });
    check(true, 'Wiedergabe startet');
    await audioPage.waitForSelector('.play-button:not(.is-playing)', { timeout: 20_000 });
    check(true, 'Wiedergabe läuft bis zum Ende durch');
    check(
      samples.some((url) => url.startsWith(`${BASE}samples/`) && /\/\d+\.mp3$/.test(url)),
      `Klaviertöne kommen von ${BASE_PATH}samples/ (${samples.length} Dateien)`,
    );
    check((await audioPage.locator('.audio-error').count()) === 0, 'kein Audiofehler gemeldet');
    await fresh.close();

    // ------------------------------------------------------------------- Filter
    console.log('\nFilter und Adresszeile');
    await page.goto(exercise('intervalle-hoeren'), { waitUntil: 'networkidle' });
    await page.locator('.filter-toggle').click();
    await page.waitForSelector('.filter-body');
    await page
      .locator('.filter-field', { hasText: 'Welche Intervalle?' })
      .locator('button:has-text("keine")')
      .click();
    await page.waitForTimeout(150);
    const selectedChips = () =>
      page.locator('.filter-field', { hasText: 'Welche Intervalle?' }).locator('.filter-chip.is-selected').count();
    check((await selectedChips()) === 1, 'Mehrfachauswahl behält den letzten Haken');
    const filtered = new URL(page.url());
    check(
      filtered.searchParams.get('intervalle') === 'r1',
      `die Einstellung steht in der Adresszeile (${filtered.search})`,
    );

    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('.filter-toggle').click();
    await page.waitForSelector('.filter-body');
    check((await selectedChips()) === 1, 'Neuladen behält die Einstellung');

    // Ohne Parameter geöffnet: die eigenen, gespeicherten Einstellungen.
    await page.goto(exercise('intervalle-hoeren'), { waitUntil: 'networkidle' });
    await page.locator('.filter-toggle').click();
    await page.waitForSelector('.filter-body');
    check((await selectedChips()) === 1, 'ohne Link gelten die zuletzt gewählten Einstellungen');
    check(new URL(page.url()).searchParams.get('intervalle') === 'r1', 'und stehen gleich in der Adresszeile');
    await page.screenshot({ path: join(SHOTS, 'filter.png'), fullPage: true });

    // Ein fremder Link überschreibt die eigenen Einstellungen nicht.
    await page.goto(exercise('intervalle-hoeren', '?intervalle=k3,g3'), { waitUntil: 'networkidle' });
    await page.locator('.filter-toggle').click();
    await page.waitForSelector('.filter-body');
    check((await selectedChips()) === 2, 'ein Link mit «intervalle=k3,g3» stellt genau zwei ein');
    await page.goto(exercise('intervalle-hoeren'), { waitUntil: 'networkidle' });
    await page.locator('.filter-toggle').click();
    await page.waitForSelector('.filter-body');
    check((await selectedChips()) === 1, 'danach gelten wieder die eigenen Einstellungen');

    await page.locator('.filter-actions button').click();
    await page.waitForTimeout(150);
    check((await selectedChips()) === 13, 'Zurücksetzen stellt alle Werte her');
    check(!new URL(page.url()).searchParams.has('intervalle'), 'und die Adresszeile ist wieder kurz');

    // ---------------------------------------------------------------- Teilen
    console.log('\nTeilen');
    await page.goto(exercise('intervalle-notieren', '?schluessel=bass'), { waitUntil: 'networkidle' });
    await page.waitForSelector('.notation-input svg');
    const original = await scoreFingerprint(page);
    await page.locator('.share-toggle').click();
    await page.waitForSelector('.share-panel');
    const links = await page.locator('.share-url').evaluateAll((inputs) => inputs.map((input) => input.value));
    check(links.length === 2, 'zwei Links: Übung und Aufgabe');
    check(
      links[0] === exercise('intervalle-notieren', '?schluessel=bass'),
      `Übungslink ohne Aufgabe (${links[0]})`,
    );
    check(/[?&]aufgabe=[0-9a-z]+&v=\d+$/.test(links[1]), 'Aufgabenlink mit Aufgabe und Fassung');
    await page.screenshot({ path: join(SHOTS, 'teilen.png'), fullPage: true });

    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await otherPage.goto(links[1], { waitUntil: 'networkidle' });
    await otherPage.waitForSelector('.notation-input svg');
    check((await scoreFingerprint(otherPage)) === original, 'der Aufgabenlink zeigt anderswo genau dieselbe Aufgabe');

    await otherPage.goto(exercise('intervalle-notieren', '?aufgabe=1abc&v=999'), { waitUntil: 'networkidle' });
    await otherPage.waitForSelector('.question');
    check(
      (await otherPage.locator('.notice-info').innerText()).includes('älteren Fassung'),
      'ein Link aus einer alten Fassung sagt das ehrlich',
    );
    await other.close();

    // Eine Runde aus einem Link: zweimal geöffnet, dieselben Aufgaben.
    const roundLink = exercise('stufen-bestimmen', '?runde=10&aufgabe=2k9f&v=1');
    const roundPrompts = [];
    for (let attempt = 0; attempt < 2; attempt++) {
      const ctx = await browser.newContext();
      const p = await ctx.newPage();
      await p.goto(roundLink, { waitUntil: 'networkidle' });
      const prompts = [];
      for (let i = 0; i < 3; i++) {
        await p.waitForSelector('.question select');
        prompts.push(await p.locator('.question .task-prompt').innerText());
        for (const select of await p.locator('.question select').all()) await select.selectOption({ index: 1 });
        await p.locator('button:has-text("Prüfen")').click();
        await p.waitForSelector('.feedback');
        await p.locator('.question-actions .primary').click();
      }
      roundPrompts.push(prompts.join(' | '));
      await ctx.close();
    }
    check(roundPrompts[0] === roundPrompts[1], `ein Rundenlink stellt dieselben Aufgaben («${roundPrompts[0]}»)`);

    // -------------------------------------------------------------------- Runde
    console.log('\nRunde');
    await page.goto(exercise('stufen-bestimmen'), { waitUntil: 'networkidle' });
    await page.locator('button:has-text("Runde à 10")').click();
    await page.waitForSelector('.stats-round');
    let roundInUrl = true;
    try {
      await page.waitForFunction(() => new URL(location.href).searchParams.get('runde') === '10', null, {
        timeout: 3000,
      });
    } catch {
      roundInUrl = false;
    }
    check(roundInUrl, `die Runde steht in der Adresszeile (${new URL(page.url()).search})`);
    for (let i = 0; i < 10; i++) {
      await page.waitForSelector('.question select');
      for (const select of await page.locator('.question select').all()) await select.selectOption({ index: 1 });
      await page.locator('button:has-text("Prüfen")').click();
      await page.waitForSelector('.feedback');
      await page.locator('.question-actions .primary').click();
      await page.waitForTimeout(100);
    }
    await page.waitForSelector('.round-summary', { timeout: 5000 });
    const score = await page.locator('.round-score').innerText();
    check(/\bvon 10\b/.test(score), `Runde endet mit einer Auswertung über zehn Aufgaben`);
    await page.screenshot({ path: join(SHOTS, 'runde.png'), fullPage: true });
    const repeat = page.locator('button:has-text("Falsche wiederholen")');
    if ((await repeat.count()) > 0) {
      await repeat.click();
      await page.waitForSelector('.question');
      check(await page.locator('.question').isVisible(), 'Falsche lassen sich wiederholen');
    }

    // ------------------------------------------------------------------- Fehler
    console.log('\nSauberkeit');
    // Der Abbruch einer laufenden Wiedergabe meldet sich als AbortError; das
    // ist erwartetes Verhalten und kein Mangel.
    const real = problems.filter((entry) => !/AbortError|play\(\) request/i.test(entry));
    check(real.length === 0, `keine Konsolenfehler oder fehlenden Dateien${real.length ? `:\n     ${real.join('\n     ')}` : ''}`);
    await context.close();
  } finally {
    await browser.close();
  }

  // ---------------------------------------------------------- Tonhöhe
  // Eigener Browser: Chromium liest eine WAV-Datei als Mikrofon. 196 Hz mit
  // Obertönen = g (kleines g), ähnlich obertonreich wie eine Stimme — und so
  // leise, wie ein iPhone das Mikrofon liefert.
  console.log('\nTonhöhe mit künstlichem, leisem Mikrofon (wie auf iOS)');
  const wav = join(tmpdir(), `musiktheorie-e2e-${process.pid}.wav`);
  writeToneWav(wav, 196);
  const micBrowser = await chromium.launch({
    headless: !headed,
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-audio-capture=${wav}`,
      '--autoplay-policy=no-user-gesture-required',
    ],
  });
  try {
    const micContext = await micBrowser.newContext({ permissions: ['microphone'] });
    const micPage = await micContext.newPage();
    const micProblems = [];
    micPage.on('console', (message) => {
      if (message.type() === 'error') micProblems.push(message.text());
    });
    await micPage.goto(`${BASE}werkzeuge/tonhoehe/`, { waitUntil: 'networkidle' });
    const startButton = micPage.locator('button:has-text("Mikrofon einschalten")');
    const [background, colour] = await startButton.evaluate((node) => {
      const style = getComputedStyle(node);
      return [style.backgroundColor, style.color];
    });
    check(background !== colour, `der Startknopf ist lesbar (${colour} auf ${background})`);
    await startButton.click();
    let heard = '';
    try {
      await micPage.waitForFunction(
        () => document.querySelector('.pitch-note')?.textContent?.trim() === 'g',
        null,
        { timeout: 8000 },
      );
      heard = 'g';
    } catch {
      heard = (await micPage.locator('.pitch-note').innerText()).trim();
    }
    check(heard === 'g', `erkennt den leisen Ton 196 Hz als «g» (angezeigt: «${heard}»)`);
    check(
      (await micPage.locator('.level-fill.is-above').count()) === 1,
      'der Pegelmesser zeigt den Ton über der Schwelle',
    );
    const numbers = await micPage.locator('.pitch-numbers').innerText();
    const hz = Number(/([\d.]+) Hz/.exec(numbers)?.[1]);
    check(Math.abs(hz - 196) < 1.5, `misst die Frequenz genau (${numbers})`);
    await micPage.locator('.tool-help summary', { hasText: 'Technische Angaben' }).click();
    const diagnostics = await micPage.locator('.diagnostics').innerText();
    check(
      diagnostics.includes('ms je Fenster') && diagnostics.includes('Grundrauschen'),
      'zeigt die technischen Angaben für den Gerätetest',
    );
    console.log(`       ${diagnostics.split('\n').find((line) => line.includes('Grundrauschen'))}`);
    await micPage.screenshot({ path: join(SHOTS, 'tonhoehe.png'), fullPage: true });
    await micPage.locator('button:has-text("Mikrofon ausschalten")').click();
    check(
      (await micPage.locator('.pitch-numbers').innerText()).includes('Mikrofon ist aus'),
      'Mikrofon lässt sich ausschalten',
    );
    check(micProblems.length === 0, `keine Konsolenfehler${micProblems.length ? `: ${micProblems.join('; ')}` : ''}`);
  } finally {
    await micBrowser.close();
    rmSync(wav, { force: true });
    server.close();
  }

  console.log(
    failures === 0
      ? `\nAlles in Ordnung. Bildschirmfotos in ${SHOTS}`
      : `\n${failures} Kontrolle(n) fehlgeschlagen.`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
