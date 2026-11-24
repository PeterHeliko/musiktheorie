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
import { chromium, devices } from 'playwright';
import { startServer } from './serve.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const SHOTS = join(ROOT, '.e2e-screenshots');
const PORT = Number(process.env.E2E_PORT ?? 4319);
const BASE_PATH = process.env.BASE_PATH ?? '/musiktheorie/';
const BASE = `http://127.0.0.1:${PORT}${BASE_PATH}`;

const headed = process.argv.includes('--headed');
const slow = process.argv.includes('--slow');

/** Alle Übungen mit Titel im Tab (samt Gruppe) — muss zu src/generators/ passen. */
const MODES = {
  'toene-klaviatur-benennen': 'Töne auf Klaviatur benennen',
  'toene-klaviatur-spielen': 'Töne auf Klaviatur spielen',
  'noten-benennen': 'Noten benennen',
  'noten-schreiben': 'Noten schreiben',
  'notenwerte-zuordnen': 'Notenwerte und Pausenzeichen zuordnen',
  'pausen-ergaenzen': 'Fehlende Pausen ergänzen',
  'intervalle-grob-bestimmen': 'Intervalle in Noten benennen (Grobbestimmung)',
  'intervalle-grob-notieren': 'Intervalle notieren (Grobbestimmung)',
  'intervalle-grob-klaviatur-benennen': 'Intervalle auf Klaviatur benennen (Grobbestimmung)',
  'intervalle-grob-klaviatur-spielen': 'Intervalle auf Klaviatur spielen (Grobbestimmung)',
  'intervalle-bestimmen': 'Intervalle in Noten benennen (Feinbestimmung)',
  'intervalle-notieren': 'Intervalle notieren (Feinbestimmung)',
  'intervalle-klaviatur-benennen': 'Intervalle auf Klaviatur benennen (Feinbestimmung)',
  'intervalle-klaviatur-spielen': 'Intervalle auf Klaviatur spielen (Feinbestimmung)',
  'intervalle-hoeren': 'Intervalle hörend erkennen (Feinbestimmung)',
  'intervalle-singen': 'Intervalle singen (Feinbestimmung)',
  'dreiklaenge-bestimmen': 'Dreiklänge in Noten benennen (Grundstellung)',
  'dreiklaenge-notieren': 'Dreiklänge notieren (Grundstellung)',
  'dreiklaenge-klaviatur-benennen': 'Dreiklänge auf Klaviatur benennen (Grundstellung)',
  'dreiklaenge-klaviatur-spielen': 'Dreiklänge auf Klaviatur spielen (Grundstellung)',
  'dreiklaenge-hoeren': 'Dreiklänge hörend erkennen (Grundstellung)',
  'dreiklaenge-singen': 'Dreiklänge singen (Grundstellung)',
  'umkehrungen-benennen': 'Umkehrungen & Lagen in Noten benennen',
  'umkehrungen-notieren': 'Umkehrungen & Lagen notieren',
  'umkehrungen-klaviatur-benennen': 'Umkehrungen & Lagen auf Klaviatur benennen',
  'umkehrungen-klaviatur-spielen': 'Umkehrungen & Lagen auf Klaviatur spielen',
  'umkehrungen-hoeren': 'Umkehrungen & Lagen hörend erkennen',
  'umkehrungen-singen': 'Umkehrungen & Lagen singen',
  'tonarten-zuordnen': 'Tonarten den Vorzeichen zuordnen',
  'vorzeichen-setzen': 'Vorzeichen setzen',
  'halbtonschritte-markieren': 'Halbtonschritte markieren',
  'stufen-bestimmen': 'Stufen bestimmen',
  'tonleitern-hoeren': 'Tonleitern hörend erkennen',
  melodiediktat: 'Rhythmus- und Melodiediktat',
};
const MODE_IDS = Object.keys(MODES);

/** Themen mit Übungen — muss zu src/generators/types.ts (TOPICS) passen. */
const TOPICS = ['toene', 'rhythmus', 'intervalle', 'dreiklaenge', 'tonleitern', 'melodie'];

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

/**
 * Wartet, bis eine Bedingung im Browser gilt. Adresszeile und Fokus werden
 * erst nach dem Zeichnen nachgeführt — sofort nachzusehen hiesse, zu früh.
 */
async function eventually(page, test, arg = null, timeout = 3000) {
  try {
    await page.waitForFunction(test, arg, { timeout });
    return true;
  } catch {
    return false;
  }
}

/** Für eventually(): steht dieser Parameter mit diesem Wert in der Adresszeile? */
const hasParam = ([name, value]) => new URL(location.href).searchParams.get(name) === value;

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
      ['', 'Übungen Musiktheorie'],
      ['ueben/', 'Übungen · Übungen Musiktheorie'],
      ['ueben/intervalle/', 'Intervalle · Übungen Musiktheorie'],
      ['ueben/tonleitern/', 'Tonleitern und Tonarten · Übungen Musiktheorie'],
      ['werkzeuge/tonhoehe/', 'Tonhöhe anzeigen · Übungen Musiktheorie'],
      ...MODE_IDS.map((id) => [`ueben/${id}/`, `${MODES[id]} · Übungen Musiktheorie`]),
    ];
    let filesOk = 0;
    for (const [path, title] of pages) {
      // Ohne Browser gelesen — so, wie eine Chat-Vorschau die Seite sieht.
      const response = await fetch(BASE + path);
      const html = await response.text();
      const ok =
        response.status === 200 &&
        html.includes(`<title>${title.replaceAll('&', '&amp;')}</title>`) &&
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

    // ------------------------------------------------- Themen → Übungen
    console.log('\nAuswahl: Themen, dann Übungen');
    const loaded = [];
    page.on('request', (request) => loaded.push(request.url()));
    await page.goto(BASE, { waitUntil: 'networkidle' });
    const topicLinks = page.locator('.nav-list').first().locator('a');
    check((await topicLinks.count()) === TOPICS.length, `${TOPICS.length} Themen auf der Startseite`);
    check(
      (await page.locator('.list-page').innerText()).includes('Tonhöhe anzeigen'),
      'darunter das Werkzeug «Tonhöhe anzeigen»',
    );
    check(!loaded.some((url) => url.includes('ExercisePage')), 'die Startseite lädt den Notensatz nicht');
    check(!loaded.some((url) => url.includes('/samples/')), 'die Startseite lädt keine Klaviertöne');
    await page.screenshot({ path: join(SHOTS, '00-start.png'), fullPage: true });

    // Wechsel ohne Neuladen: eine Markierung im Fenster überlebt nur dann.
    await page.evaluate(() => (window.__ohneNeuladen = true));
    await topicLinks.filter({ hasText: /^Intervalle$/ }).click();
    await page.waitForSelector('.list-page h1:has-text("Intervalle")');
    check(page.url() === `${BASE}ueben/intervalle/`, 'ein Thema öffnet seine Übungsliste');
    const exerciseLinks = await page.locator('.nav-list a').allInnerTexts();
    check(
      exerciseLinks.join('|') ===
        [
          'Intervalle in Noten benennen',
          'Intervalle notieren',
          'Intervalle auf Klaviatur benennen',
          'Intervalle auf Klaviatur spielen',
          'Intervalle in Noten benennen',
          'Intervalle notieren',
          'Intervalle auf Klaviatur benennen',
          'Intervalle auf Klaviatur spielen',
          'Intervalle hörend erkennen',
          'Intervalle singen',
        ].join('|'),
      `die Liste nennt die Titel, ohne Beschreibung (${exerciseLinks.join(', ')})`,
    );
    const groupHeadings = await page.locator('.list-page h2').allInnerTexts();
    check(
      groupHeadings.join('|') === 'Grobbestimmung|Feinbestimmung',
      `gegliedert in Grob- und Feinbestimmung (${groupHeadings.join(', ')})`,
    );
    const itemCount = await page.locator('.list-page .nav-list li').count();
    check(
      (await page.locator('.list-page .nav-list li .skill-icon').count()) === itemCount &&
        (await page.locator('.session-bar .skill-icon, .session-title .skill-icon').count()) === 0,
      `jede Übung trägt ihr Zeichen vor dem Titel (${itemCount})`,
    );
    await page.screenshot({ path: join(SHOTS, '01-thema.png'), fullPage: true });
    await page
      .locator('.list-page section', { has: page.locator('h2', { hasText: 'Feinbestimmung' }) })
      .locator('.nav-list a', { hasText: 'Intervalle in Noten benennen' })
      .click();
    await page.waitForSelector('.question');
    check(page.url().startsWith(exercise('intervalle-bestimmen')), 'eine Übung öffnet sich');
    check(await page.evaluate(() => window.__ohneNeuladen === true), 'alles ohne die Seite neu zu laden');
    check(
      (await page.title()) === 'Intervalle in Noten benennen (Feinbestimmung) · Übungen Musiktheorie',
      `der Titel im Tab folgt, mit der Gruppe («${await page.title()}»)`,
    );
    check(
      (await page.locator('.session-title').innerText()) === 'Intervalle in Noten benennen',
      'die Kopfzeile zeigt den kurzen Titel',
    );
    check((await page.locator('.site-header').count()) === 0, 'in der Übung ist die Kopfzeile der Website weg');
    await page.locator('.session-icon[aria-label="Übung schliessen"]').click();
    await page.waitForSelector('.list-page h1:has-text("Intervalle")');
    check(page.url() === `${BASE}ueben/intervalle/`, '✕ führt zurück zum Thema');
    await page.goBack();
    await page.waitForSelector('.question');
    check(page.url().startsWith(exercise('intervalle-bestimmen')), 'der Zurück-Knopf des Browsers funktioniert');

    await page.goto(`${BASE}ueben/`, { waitUntil: 'networkidle' });
    check(
      (await page.locator('.nav-list').first().locator('a').count()) === TOPICS.length,
      '«/ueben/» listet die Themen',
    );

    // ------------------------------------------------- jede Übung zeichnet sich
    console.log('\nJede Übung öffnet direkt über ihre Adresse und ist lösbar');
    for (const mode of MODE_IDS) {
      await page.goto(exercise(mode), { waitUntil: 'networkidle' });
      await page.waitForSelector('.question, .notice-warning', { timeout: 10_000 });

      const broken = await page.locator('.notice-warning').count();
      // Die Anweisung steht hinter ⓘ.
      await page.locator('.session-info').click();
      const hasInstruction = (await page.locator('.question .instruction').innerText()).length > 10;

      // Lösbar heisst: es gibt etwas anzuklicken — Antwortknöpfe, eine
      // Auswahlliste, ein Notensystem, in das man schreiben kann, oder beim
      // Singen der Knopf fürs Mikrofon.
      // Gewartet statt gemessen: VexFlow zeichnet erst nach dem ersten Rendern.
      let answerable = true;
      try {
        await page.waitForSelector(
          '.question .choice, .question select, .question .notation-input svg, .question .sing-mic button, .question .piano-key:not([disabled])',
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

    // ------------------------------------------- auf dem Telefon: nur die Aufgabe
    console.log('\nÜbung auf dem Telefon');
    const phone = await browser.newContext({ ...devices['iPhone 13'] });
    const phonePage = await phone.newPage();
    for (const mode of ['intervalle-hoeren', 'umkehrungen-benennen', 'melodiediktat', 'intervalle-singen']) {
      await phonePage.goto(exercise(mode), { waitUntil: 'networkidle' });
      await phonePage.waitForSelector('.question');
      const viewport = phonePage.viewportSize();
      const question = await phonePage.locator('.question').boundingBox();
      const bar = await phonePage.locator('.session-bar').boundingBox();
      check(question.y < 120, `${mode}: die Aufgabe beginnt gleich unter der Leiste (bei ${Math.round(question.y)} px)`);
      check(
        Math.abs(bar.y + bar.height - viewport.height) < 2,
        `${mode}: der Hauptknopf steht am unteren Rand`,
      );
      await phonePage.screenshot({ path: join(SHOTS, `telefon-${mode}.png`) });
    }
    await phonePage.locator('.session-settings').click();
    await phonePage.waitForSelector('.sheet');
    await phonePage.screenshot({ path: join(SHOTS, 'telefon-einstellungen.png') });
    await phone.close();

    // -------------------------------------------------- Antworten mit einem Klick
    console.log('\nEinfachauswahl antwortet sofort');
    await page.goto(exercise('intervalle-bestimmen'), { waitUntil: 'networkidle' });
    await page.waitForSelector('.question .choice');
    check(
      (await page.locator('button:has-text("Prüfen")').count()) === 0,
      'kein Prüfen-Knopf bei einem einzelnen Knopfraster',
    );
    check((await page.locator('.session-progress').innerText()) === '1', 'oben steht die wievielte Aufgabe');
    await page.locator('.question .choice').first().click();
    await page.waitForSelector('.verdict', { timeout: 5000 });
    const verdict = await page.locator('.verdict').innerText();
    const verdictWord = await page.locator('.verdict-text').innerText();
    // Die Knöpfe zeigen die Lösung; die Leiste nennt nur das Urteil.
    check(
      verdictWord === 'Richtig' || verdictWord === 'Falsch',
      `ein Klick genügt; die Leiste unten sagt nur das Urteil («${verdictWord}»)`,
    );
    check(
      (await page.locator('.question .choice[disabled]').count()) > 0,
      'Aufgabe ist nach dem Antworten eingefroren',
    );
    // Die gewählte Antwort zeigt das Urteil selbst: grün oder rot, und bei
    // falscher Wahl ist die richtige grün umrandet.
    const wasRight = /^✓/.test(verdict.trim());
    check(
      (await page.locator(`.question .choice.is-selected.${wasRight ? 'is-right' : 'is-wrong'}`).count()) === 1 &&
        (await page.locator('.question .choice.is-solution').count()) === (wasRight ? 0 : 1),
      `die gewählte Antwort ist ${wasRight ? 'grün' : 'rot, die richtige grün umrandet'}`,
    );
    check(
      await eventually(page, () => document.activeElement?.textContent?.trim() === 'Weiter'),
      '«Weiter» hat den Fokus',
    );
    await page.screenshot({ path: join(SHOTS, 'rueckmeldung.png'), fullPage: true });

    const firstTask = new URL(page.url()).searchParams.get('aufgabe');
    await page.locator('.session-bar button:has-text("Weiter")').click();
    await page.waitForSelector('.question .choice:not([disabled])');
    check((await page.locator('.verdict').count()) === 0, 'die nächste Aufgabe kommt ohne alte Rückmeldung');
    check((await page.locator('.session-progress').innerText()) === '2', 'und wird mitgezählt');
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
    await page.goto(exercise('umkehrungen-benennen', '?gefragt=umkehrung,lage&mit-bass=ja'), {
      waitUntil: 'networkidle',
    });
    await page.waitForSelector('.question .choice');
    check(await page.locator('button:has-text("Prüfen")').isDisabled(), 'Prüfen ist erst nach einer Eingabe möglich');
    for (const group of await page.locator('.question fieldset').all()) await group.locator('.choice').first().click();
    check(!(await page.locator('button:has-text("Prüfen")').isDisabled()), 'Prüfen wird nach der Eingabe möglich');
    await page.locator('button:has-text("Prüfen")').click();
    await page.waitForSelector('.verdict');
    // Beide Knopfreihen zeigen die Lösung selbst: je eine gewählte Antwort grün
    // oder rot, keine Liste in Worten darunter.
    check(
      (await page.locator('.question .choice.is-selected.is-right, .question .choice.is-selected.is-wrong').count()) ===
        2 && (await page.locator('.question .feedback-list').count()) === 0,
      'jede Knopfreihe zeigt ihr Urteil, das Gesamturteil steht in der Leiste',
    );
    await page.screenshot({ path: join(SHOTS, 'rueckmeldung-mehrteilig.png'), fullPage: true });

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
    await page.waitForSelector('.verdict');
    check(await page.locator('.verdict').isVisible(), 'Noteneingabe wird bewertet');
    await page.screenshot({ path: join(SHOTS, 'noteneingabe.png'), fullPage: true });

    // Ein Akkord über zwei Systeme: oben und unten setzen, wegnehmen, prüfen.
    console.log('\nNoteneingabe: Akkord im Klaviersystem');
    await page.goto(exercise('umkehrungen-notieren', '?mit-bass=ja'), { waitUntil: 'networkidle' });
    await page.waitForSelector('.notation-input svg');
    const grandBox = await page.locator('.notation-input svg').first().boundingBox();
    const summary = () => page.locator('.input-summary').innerText();
    // Ein Drittel von oben liegt im oberen System, vier Fünftel im unteren.
    const upperSpot = { x: grandBox.x + grandBox.width * 0.55, y: grandBox.y + grandBox.height * 0.3 };
    const lowerSpot = { x: grandBox.x + grandBox.width * 0.55, y: grandBox.y + grandBox.height * 0.78 };
    await page.mouse.click(upperSpot.x, upperSpot.y);
    await page.waitForTimeout(100);
    await page.mouse.click(lowerSpot.x, lowerSpot.y);
    await page.waitForTimeout(100);
    const placedNames = (await summary()).replace('Gesetzt: ', '').split(', ');
    check(
      placedNames.length === 2 && /\d$/.test(placedNames[1]) && !/\d$/.test(placedNames[0]),
      `ein Ton oben (eingestrichen oder höher), einer unten (${placedNames.join(', ')})`,
    );
    await page.mouse.click(lowerSpot.x, lowerSpot.y);
    await page.waitForTimeout(100);
    check((await summary()).split(', ').length === 1, 'noch einmal antippen nimmt den Ton unten wieder weg');
    await page.locator('button:has-text("Prüfen")').click();
    await page.waitForSelector('.verdict');
    // VexFlow zeichnet nach dem Prüfen neu — darauf warten.
    const exampleShown = await eventually(
      page,
      () =>
        [...document.querySelectorAll('.notation-input svg .vf-stavenote')].filter((note) =>
          note.outerHTML.includes('#00d903'),
        ).length >= 2,
    );
    check(
      (await page.locator('.verdict-text').innerText()) === 'Falsch' && exampleShown,
      'ein einzelner Ton ist kein Akkord: Falsch, eine richtige Lösung steht grün in beiden Systemen',
    );
    await page.screenshot({ path: join(SHOTS, 'noteneingabe-akkord.png'), fullPage: true });

    // Feste Aufgabe: des¹, grosse Terz aufwärts → f¹. Gesetzt wird fis¹.
    console.log('\nNoteneingabe: die Lösung steht im System');
    await page.goto(exercise('intervalle-notieren', '?intervalle=g3&richtung=auf&aufgabe=3&v=2'), {
      waitUntil: 'networkidle',
    });
    await page.waitForSelector('.notation-input svg');
    await page.keyboard.press('f');
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(80);
    check(/fis/.test(await page.locator('.input-summary').innerText()), 'fis¹ gesetzt');
    await page.keyboard.press('Enter');
    await page.waitForSelector('.verdict');
    const staffNotes = page.locator('.notation-input svg .vf-stavenote');
    check((await page.locator('.verdict-text').innerText()) === 'Falsch', 'die Leiste sagt nur «Falsch»');
    // VexFlow schreibt die Farbe an die Gruppe der Note oder an ihre Teile.
    const notationColours = await staffNotes.evaluateAll((notes) =>
      notes.map((note) =>
        note.outerHTML.includes('#00d903') ? 'green' : note.outerHTML.includes('#b3261e') ? 'red' : 'black',
      ),
    );
    check(
      notationColours.join(' ') === 'black red green',
      `die gesetzte Note ist rot, die richtige steht grün daneben (${notationColours.join(', ')})`,
    );
    check(
      (await staffNotes.nth(2).evaluate((note) => note.textContent)).includes(''),
      'das f¹ nach dem fis¹ trägt ein Auflösungszeichen',
    );
    check(
      /richtig wäre f1/.test(await page.locator('.verdict .visually-hidden').textContent()),
      'Bildschirmleser hören die Lösung trotzdem',
    );
    await page.screenshot({ path: join(SHOTS, 'noteneingabe-loesung.png'), fullPage: true });

    // ------------------------------------------------- Ziehen und loslassen
    console.log('\nNoteneingabe: ziehen, gesetzt wird beim Loslassen');
    await page.goto(exercise('intervalle-notieren'), { waitUntil: 'networkidle' });
    await page.waitForSelector('.notation-input svg');
    const area = await page.locator('.score-click-area').boundingBox();
    const prüfen = page.locator('button:has-text("Prüfen")');
    await page.mouse.move(area.x + area.width * 0.72, area.y + area.height * 0.3);
    await page.mouse.down();
    await page.mouse.move(area.x + area.width * 0.72, area.y + area.height * 0.6, { steps: 6 });
    check(await prüfen.isDisabled(), 'beim Drücken und Ziehen ist noch nichts gesetzt');
    check(
      (await page.locator('.score-click-area svg [fill="#5aa9dd"], .score-click-area svg [stroke="#5aa9dd"]').count()) > 0,
      'die Vorschau folgt dem Zeiger',
    );
    await page.mouse.up();
    await page.waitForTimeout(150);
    check(!(await prüfen.isDisabled()), 'beim Loslassen wird die Note gesetzt');
    const placedText = await page.locator('.input-summary').innerText();
    check(/Gesetzt:/.test(placedText), `und genannt («${placedText}»)`);
    // Nur ein Ton wird gesetzt — ein Vorzeichen gilt also auch nachträglich.
    await page.locator('.toolbar button[aria-label^="Kreuz"]').click();
    const sharpened = await page.locator('.input-summary').innerText();
    check(
      sharpened !== placedText && /is\b|is,|is$/.test(sharpened.replace(/\d/g, '')),
      `ein Vorzeichen gilt auch für den gesetzten Ton («${sharpened}»)`,
    );

    await page.locator('.toolbar button:has-text("Zurücksetzen")').click();
    await page.mouse.move(area.x + area.width * 0.5, area.y + area.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(area.x + area.width * 0.5, area.y + area.height + 80, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(150);
    // «Zurücksetzen» zählt selbst als Eingabe (Prüfen wird frei) — ob eine Note
    // steht, sagt die Zeile unter dem Notenbild.
    const afterCancel = await page.locator('.input-summary').innerText();
    check(!/Gesetzt:/.test(afterCancel), `Loslassen ausserhalb des Notenbilds bricht ab («${afterCancel}»)`);

    // ------------------------------------------------- Ziehen mit dem Finger
    console.log('\nNoteneingabe mit dem Finger (Telefon)');
    const touch = await browser.newContext({ ...devices['iPhone 13'] });
    const touchPage = await touch.newPage();
    await touchPage.goto(exercise('intervalle-notieren'), { waitUntil: 'networkidle' });
    await touchPage.waitForSelector('.notation-input svg');
    await touchPage.locator('.score-click-area').scrollIntoViewIfNeeded();
    const scrollBefore = await touchPage.locator('.session-body').evaluate((el) => el.scrollTop);
    const touchArea = await touchPage.locator('.score-click-area').boundingBox();
    const cdp = await touch.newCDPSession(touchPage);
    const finger = (type, x, y) =>
      cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    const tx = touchArea.x + touchArea.width * 0.72;
    await finger('touchStart', tx, touchArea.y + touchArea.height * 0.2);
    for (let step = 1; step <= 8; step++) {
      await finger('touchMove', tx, touchArea.y + touchArea.height * (0.2 + step * 0.06));
    }
    const midDrag = await touchPage.locator('.input-summary').innerText();
    await finger('touchEnd', tx, touchArea.y + touchArea.height * 0.68);
    await touchPage.waitForTimeout(200);
    const scrollAfter = await touchPage.locator('.session-body').evaluate((el) => el.scrollTop);
    check(!/Gesetzt:/.test(midDrag), 'während des Ziehens ist noch nichts gesetzt');
    check(/Gesetzt:/.test(await touchPage.locator('.input-summary').innerText()), 'beim Loslassen steht die Note');
    check(scrollAfter === scrollBefore, `Ziehen verschiebt die Seite nicht (${scrollBefore} → ${scrollAfter})`);
    await touch.close();

    // ------------------------------------------------- Tastatur
    console.log('\nTastatur');
    await page.goto(exercise('intervalle-notieren'), { waitUntil: 'networkidle' });
    await page.waitForSelector('.notation-input svg');
    const typed = async () => (await page.locator('.input-summary').innerText()).replace(/^Gesetzt:\s*/, '').trim();
    const press = async (key) => {
      await page.keyboard.press(key);
      await page.waitForTimeout(80);
      return typed();
    };
    await press('Space');
    check((await page.locator('.verdict').count()) === 0, 'ohne Eingabe tut die Leertaste nichts');
    check(/^c[,\d]*$/i.test(await press('c')), `c setzt den Ton c («${await typed()}»)`);
    check(/^cis[,\d]*$/i.test(await press('ArrowUp')), `↑ geht einen Halbton hinauf («${await typed()}»)`);
    check(/^d[,\d]*$/i.test(await press('ArrowUp')), `und noch einen, auf den Stammton («${await typed()}»)`);
    check(/^des[,\d]*$/i.test(await press('ArrowDown')), `↓ geht abwärts mit b («${await typed()}»)`);
    const lowDes = await typed();
    const highDes = await press('Shift+ArrowUp');
    check(/^des/i.test(highDes) && highDes !== lowDes, `Umschalt + ↑ springt eine Oktave (${lowDes} → ${highDes})`);
    check(/^b[,\d]*$/i.test(await press('b')), `b setzt das B («${await typed()}»)`);
    await press('Backspace');
    check(!/Gesetzt:/.test(await page.locator('.input-summary').innerText()), '⌫ nimmt den Ton weg');
    // Mit der Maus gewählt, bleibt der Fokus auf dem ♯-Knopf. Die Eingabetaste
    // soll trotzdem prüfen und nicht den Knopf ein zweites Mal drücken.
    await page.locator('.toolbar button[aria-label^="Kreuz"]').click();
    check(/^e[,\d]*$/i.test(await press('e')), `ein Tonname setzt den Stammton («${await typed()}»)`);
    await press('Enter');
    check(await page.locator('.verdict').isVisible(), 'die Eingabetaste prüft');
    await page.waitForTimeout(250);
    check(await page.locator('.verdict').isVisible(), 'und bleibt bei der Rückmeldung stehen');
    check(/^e[,\d]*$/i.test(await press('f')), 'nach dem Prüfen ändern Tonnamen nichts mehr');
    await press('Space');
    check(
      (await page.locator('.verdict').count()) === 0 && !/Gesetzt:/.test(await page.locator('.input-summary').innerText()),
      'die Leertaste führt zur nächsten Aufgabe',
    );
    await press('g');
    await press('Space');
    await page.waitForTimeout(250);
    check(await page.locator('.verdict').isVisible(), 'die Leertaste prüft, das Loslassen drückt nicht auch «Weiter»');

    // ------------------------------------------------- grösseres Notenbild
    console.log('\nNotenbild');
    await page.goto(exercise('intervalle-bestimmen'), { waitUntil: 'networkidle' });
    await page.waitForSelector('.question .task-visual svg');
    const scoreBox = await page.locator('.question .task-visual svg').boundingBox();
    check(scoreBox.width >= 220, `das Notenbild wird vergrössert angezeigt (${Math.round(scoreBox.width)} px breit)`);

    // ------------------------------------------------- Antwortoptionen
    console.log('\nAntwortoptionen folgen den Einstellungen');
    await page.goto(exercise('intervalle-hoeren', '?intervalle=k3,g3'), { waitUntil: 'networkidle' });
    await page.waitForSelector('.question .choice');
    const shownChoices = await page.locator('.question .choice').allInnerTexts();
    check(
      shownChoices.join('|') === 'kleine Terz|grosse Terz',
      `nur die eingestellten Intervalle stehen zur Wahl (${shownChoices.join(', ')})`,
    );

    // Intervalle quer: zwei Reihen wie eine Klaviatur.
    await page.goto(exercise('intervalle-hoeren'), { waitUntil: 'networkidle' });
    await page.waitForSelector('.interval-grid');
    const centre = async (p, label) => {
      const box = await p.locator('.interval-grid .choice', { hasText: new RegExp(`^${label}$`) }).boundingBox();
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    };
    // Die Prime ist nicht vorgegeben (Entscheid 2026-11-23): ihr Platz bleibt leer.
    check(
      (await page.locator('.interval-grid .choice', { hasText: /^reine Prime$/ }).count()) === 0,
      'ohne Prime in der Vorgabe',
    );
    const k2 = await centre(page, 'kleine Sekunde');
    const g2 = await centre(page, 'grosse Sekunde');
    const k3 = await centre(page, 'kleine Terz');
    const g3 = await centre(page, 'grosse Terz');
    const tritone = await centre(page, 'Tritonus');
    const fourth = await centre(page, 'reine Quarte');
    const fifth = await centre(page, 'reine Quinte');
    const octave = await centre(page, 'reine Oktave');
    check(
      Math.abs(g2.y - octave.y) < 2 && Math.abs(g2.y - fourth.y) < 2 && k2.y < g2.y - 10,
      'quer: grosse und reine unten, kleine oben',
    );
    check(
      k2.x < g2.x && k3.x > g2.x && k3.x < g3.x && tritone.x > fourth.x && tritone.x < fifth.x,
      'quer: kleine Terz zwischen grosser Sekunde und grosser Terz, Tritonus zwischen Quarte und Quinte',
    );
    await page.screenshot({ path: join(SHOTS, 'intervalle-quer.png'), fullPage: true });

    const portrait = await browser.newContext({ ...devices['iPhone 13'] });
    const portraitPage = await portrait.newPage();
    await portraitPage.goto(exercise('intervalle-hoeren'), { waitUntil: 'networkidle' });
    await portraitPage.waitForSelector('.interval-grid');
    const pk2 = await centre(portraitPage, 'kleine Sekunde');
    const pg2 = await centre(portraitPage, 'grosse Sekunde');
    const pk3 = await centre(portraitPage, 'kleine Terz');
    const p4 = await centre(portraitPage, 'reine Quarte');
    const ptt = await centre(portraitPage, 'Tritonus');
    const p5 = await centre(portraitPage, 'reine Quinte');
    const p8 = await centre(portraitPage, 'reine Oktave');
    check(
      Math.abs(pk2.y - pg2.y) < 2 && pk3.y > pk2.y && Math.abs(p4.y - ptt.y) < 2 && Math.abs(ptt.y - p5.y) < 2,
      'hochkant: Sekunden, Terzen, Quarte/Tritonus/Quinte je in einer Zeile',
    );
    check(p8.y > p5.y && Math.abs(p8.x - pg2.x) < 2, 'hochkant: Oktave zuletzt, an ihrem Platz rechts');
    await portraitPage.screenshot({ path: join(SHOTS, 'telefon-intervalle-hochkant.png') });
    await portrait.close();

    // Quer oder hochkant entscheidet die Breite, nicht die Ausrichtung.
    const narrow = await browser.newContext({ viewport: { width: 520, height: 420 } });
    const narrowPage = await narrow.newPage();
    await narrowPage.goto(exercise('intervalle-hoeren'), { waitUntil: 'networkidle' });
    await narrowPage.waitForSelector('.interval-grid');
    const nk2 = await centre(narrowPage, 'kleine Sekunde');
    const ng2 = await centre(narrowPage, 'grosse Sekunde');
    check(Math.abs(nk2.y - ng2.y) < 2, 'schmales Querformat-Fenster: Zeilen wie hochkant');
    await narrow.close();

    // ------------------------------------------------- Grobbestimmung
    console.log('\nGrobbestimmung: nur die Grösse, keine Vorzeichen');
    await page.goto(exercise('intervalle-grob-notieren'), { waitUntil: 'networkidle' });
    await page.waitForSelector('.notation-input svg');
    check(
      (await page.locator('.toolbar button[aria-label^="Kreuz"]').count()) === 0,
      'Notieren: keine Vorzeichen in der Werkzeugleiste',
    );
    await page.screenshot({ path: join(SHOTS, 'grob-notieren.png'), fullPage: true });

    const sizeCentre = async (p, label) => {
      const box = await p.locator('.size-grid .choice', { hasText: new RegExp(`^${label}$`) }).boundingBox();
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    };
    await page.goto(exercise('intervalle-grob-bestimmen'), { waitUntil: 'networkidle' });
    await page.waitForSelector('.size-grid');
    const sizeLabels = await page.locator('.size-grid .choice').allInnerTexts();
    check(
      sizeLabels.join('|') === 'Sekunde|Terz|Quarte|Quinte|Sexte|Septime|Oktave',
      `Bestimmen: sieben Grössen, Sekunde bis Oktave — ohne Prime (${sizeLabels.join(', ')})`,
    );
    const wideSecond = await sizeCentre(page, 'Sekunde');
    const wideOctave = await sizeCentre(page, 'Oktave');
    check(Math.abs(wideSecond.y - wideOctave.y) < 2, 'quer: alle Grössen in einer Reihe');
    await page.screenshot({ path: join(SHOTS, 'grob-bestimmen-quer.png'), fullPage: true });

    const sizePhone = await browser.newContext({ ...devices['iPhone 13'] });
    const sizePhonePage = await sizePhone.newPage();
    await sizePhonePage.goto(exercise('intervalle-grob-bestimmen'), { waitUntil: 'networkidle' });
    await sizePhonePage.waitForSelector('.size-grid');
    const pSecond = await sizeCentre(sizePhonePage, 'Sekunde');
    const pThird = await sizeCentre(sizePhonePage, 'Terz');
    const pFourth = await sizeCentre(sizePhonePage, 'Quarte');
    check(
      Math.abs(pSecond.y - pThird.y) < 2 && pFourth.y > pSecond.y && Math.abs(pFourth.x - pSecond.x) < 2,
      'hochkant: zwei Grössen je Zeile',
    );
    await sizePhonePage.screenshot({ path: join(SHOTS, 'telefon-grob-bestimmen.png') });

    // Notenbild so gross, wie der Platz zulässt: die Knöpfe bleiben ohne
    // Scrollen sichtbar, auch nach dem Antworten, wenn die Leiste unten wächst.
    console.log('\nIntervall-Notenbild füllt den Platz');
    for (const id of ['intervalle-grob-bestimmen', 'intervalle-bestimmen']) {
      await sizePhonePage.goto(exercise(id), { waitUntil: 'networkidle' });
      await sizePhonePage.waitForSelector('.question svg');
      const staffHeight = await sizePhonePage
        .locator('.question svg')
        .first()
        .evaluate((svg) => (svg.getBoundingClientRect().height * 40) / svg.viewBox.baseVal.height);
      const lastChoice = sizePhonePage.locator('.question .choice').last();
      const lastBox = await lastChoice.boundingBox();
      const barTop = (await sizePhonePage.locator('.session-bar').boundingBox()).y;
      check(
        lastBox.y + lastBox.height <= barTop + 1 && staffHeight > 82,
        `${id}: System ${Math.round(staffHeight)} px hoch, alle Knöpfe ohne Scrollen sichtbar`,
      );
      await lastChoice.click();
      await sizePhonePage.waitForSelector('.verdict');
      await sizePhonePage.waitForTimeout(800);
      const answeredBox = await lastChoice.boundingBox();
      const answeredBarTop = (await sizePhonePage.locator('.session-bar').boundingBox()).y;
      check(
        answeredBox.y + answeredBox.height <= answeredBarTop + 1,
        `${id}: nach dem Antworten ist die letzte Knopfreihe nicht verdeckt`,
      );
    }
    await sizePhone.close();

    // Quer gehaltenes Telefon: kaum Höhe. Die Antworten gehen vor, das
    // Notenbild bekommt, was übrig bleibt.
    const landscape = await browser.newContext({ ...devices['iPhone 13 landscape'], viewport: { width: 750, height: 340 } });
    const landscapePage = await landscape.newPage();
    for (const id of ['intervalle-grob-bestimmen', 'intervalle-bestimmen']) {
      await landscapePage.goto(exercise(id, '?lage=weit'), { waitUntil: 'networkidle' });
      await landscapePage.waitForSelector('.question svg');
      const lastBox = await landscapePage.locator('.question .choice').last().boundingBox();
      const barTop = (await landscapePage.locator('.session-bar').boundingBox()).y;
      check(lastBox.y + lastBox.height <= barTop + 1, `${id}, quer, mit Hilfslinien: alle Knöpfe ohne Scrollen sichtbar`);
      await landscapePage.screenshot({ path: join(SHOTS, `telefon-quer-${id}.png`) });
    }
    await landscape.close();

    // ------------------------------------------------- Klaviatur
    console.log('\nKlaviatur');
    await page.goto(exercise('intervalle-klaviatur-benennen'), { waitUntil: 'networkidle' });
    await page.waitForSelector('.question .piano');
    const keyCount = async (p, selector) => p.locator(`.question .piano ${selector}`).count();
    check(
      (await keyCount(page, '.piano-key.is-white')) === 14 && (await keyCount(page, '.piano-key.is-black')) === 10,
      'zwei Oktaven: 14 weisse und 10 schwarze Tasten',
    );
    const lowest = await page.locator('.question .piano .piano-key').first().getAttribute('data-key');
    check(lowest === '48', `sie beginnt auf c (Taste ${lowest})`);
    check(
      (await keyCount(page, '[data-state="given"]')) === 2 && (await keyCount(page, 'button')) === 0,
      'Benennen: zwei Tasten markiert, die Klaviatur ist nur ein Bild',
    );
    const givenColour = await page
      .locator('.question .piano [data-state="given"]')
      .first()
      .evaluate((key) => getComputedStyle(key).backgroundColor);
    check(givenColour === 'rgb(29, 111, 165)', `markiert wird mit blauer Füllung (${givenColour})`);
    await page.locator('.question .choice').first().click();
    await page.waitForSelector('.verdict');
    check(true, 'Benennen: ein Klick auf eine Antwort genügt');
    await page.screenshot({ path: join(SHOTS, 'klaviatur-benennen.png'), fullPage: true });

    /** Startet eine Spielaufgabe und gibt die markierte Taste zurück. */
    const startKey = async (p) => {
      await p.waitForSelector('.question .piano [data-state="given"]');
      return Number(await p.locator('.question .piano-key[data-state="given"]').getAttribute('data-key'));
    };
    const keyAt = (p, key) => p.locator(`.question .piano-key[data-key="${key}"]`);

    // Jeder angeschlagene Ton (ausser dem stillen Freischalt-Ton): wann er
    // geplant ist, gemessen an der Uhr des Audiokontexts.
    await page.addInitScript(() => {
      const original = AudioBufferSourceNode.prototype.start;
      window.__tones = [];
      AudioBufferSourceNode.prototype.start = function (when = 0, ...rest) {
        if ((this.buffer?.length ?? 0) > 1) window.__tones.push({ lead: when - this.context.currentTime });
        return original.call(this, when, ...rest);
      };
    });
    // Feste Aufgabe: c¹, kleine Terz aufwärts → es¹. Mit zufälliger Starttaste
    // lägen die Nachbartasten, die hier gedrückt werden, mal ausserhalb.
    const fixedTask = exercise('intervalle-klaviatur-spielen', '?intervalle=k3&richtung=auf&aufgabe=i&v=1');
    await page.goto(fixedTask, { waitUntil: 'networkidle' });
    let start = await startKey(page);
    check(start === 60, `die Aufgabe aus dem Link beginnt auf c¹ (Taste ${start})`);
    const checkButton = page.locator('.session-bar button:has-text("Prüfen")');
    check(await checkButton.isDisabled(), 'Spielen: Prüfen erst nach dem Antippen');
    const samplesLoaded = await page.evaluate(
      () => performance.getEntriesByType('resource').filter((entry) => entry.name.includes('/samples/')).length,
    );
    check(samplesLoaded >= 24, `die Töne der Klaviatur sind vor dem ersten Antippen geladen (${samplesLoaded})`);
    const pressBox = await keyAt(page, start + 4).boundingBox();
    await page.mouse.move(pressBox.x + pressBox.width / 2, pressBox.y + pressBox.height * 0.8);
    await page.mouse.down();
    const tonesWhileDown = await page.evaluate(() => window.__tones);
    check(
      (await keyAt(page, start + 4).getAttribute('data-state')) === 'selected',
      'Niederdrücken wählt die Taste, ohne Loslassen',
    );
    check(
      tonesWhileDown.length === 1 && tonesWhileDown[0].lead <= 0.005,
      `und sie klingt sofort, ohne Vorlauf (${tonesWhileDown.map((tone) => `${Math.round(tone.lead * 1000)} ms`).join(', ')})`,
    );
    await page.mouse.up();
    check((await page.evaluate(() => window.__tones.length)) === 1, 'das Loslassen schlägt sie nicht noch einmal an');
    await keyAt(page, start + 3).click();
    check(
      (await page.locator('.question .piano-key[data-state="selected"]').count()) === 1 &&
        (await keyAt(page, start + 3).getAttribute('data-state')) === 'selected',
      'eine andere Taste antippen wählt um',
    );
    check((await page.locator('.verdict').count()) === 0, 'Antippen allein wertet noch nicht');
    // Mit der Tastatur: Tab auf eine Taste, Eingabe spielt sie.
    await keyAt(page, start + 2).focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Enter');
    check(
      (await keyAt(page, start + 2).getAttribute('data-state')) === 'selected' && (await page.locator('.verdict').count()) === 0,
      'mit Tab erreicht, spielt die Eingabetaste die Taste',
    );
    await keyAt(page, start + 3).click();
    await page.keyboard.press('Enter');
    await page.waitForSelector('.verdict');
    const rightVerdict = await page.locator('.verdict-text').innerText();
    check(rightVerdict === 'Richtig', `die Eingabetaste prüft («${rightVerdict}»)`);
    check((await keyAt(page, start + 3).getAttribute('data-state')) === 'right', 'die richtige Taste wird grün');
    check((await page.locator('.question .piano-key:not([disabled])').count()) === 0, 'danach ist die Klaviatur eingefroren');
    await page.goto(fixedTask, { waitUntil: 'networkidle' });
    start = await startKey(page);
    await keyAt(page, start + 4).click();
    await checkButton.click();
    await page.waitForSelector('.verdict');
    const wrongVerdict = await page.locator('.verdict-text').innerText();
    check(wrongVerdict === 'Falsch', `falsch: die Leiste sagt nur das Urteil («${wrongVerdict}»)`);
    check(
      /gespielt grosse Terz aufwärts, richtig wäre kleine Terz aufwärts/.test(
        await page.locator('.verdict .visually-hidden').textContent(),
      ),
      'Bildschirmleser hören, was gespielt wurde',
    );
    check(
      (await keyAt(page, start + 4).getAttribute('data-state')) === 'wrong' &&
        (await keyAt(page, start + 3).getAttribute('data-state')) === 'solution',
      'die gewählte Taste wird rot, die richtige grün umrandet',
    );
    await page.screenshot({ path: join(SHOTS, 'klaviatur-spielen.png'), fullPage: true });

    await page.goto(exercise('intervalle-grob-klaviatur-spielen'), { waitUntil: 'networkidle' });
    await startKey(page);
    check(
      (await page.locator('.question .piano-key.is-black[disabled]').count()) === 10 &&
        (await page.locator('.question .piano-key.is-white:not([disabled])').count()) === 14,
      'Grobbestimmung: nur die weissen Tasten lassen sich antippen',
    );
    const blackColour = await page
      .locator('.question .piano-key.is-black')
      .first()
      .evaluate((key) => getComputedStyle(key).backgroundColor);
    check(blackColour === 'rgb(26, 29, 36)', `die schwarzen Tasten bleiben schwarz (${blackColour})`);
    await page.screenshot({ path: join(SHOTS, 'klaviatur-grob-spielen.png'), fullPage: true });

    // Ein Akkord: jedes Antippen nimmt eine Taste dazu oder weg. Nur Dur über
    // Stammtönen, damit sich der Akkord aus dem Namen ablesen lässt.
    const chordTask = exercise('dreiklaenge-klaviatur-spielen', '?geschlechter=dur&vorzeichen=stammton');
    const ROOT_KEYS = { C: 48, D: 50, E: 52, F: 53, G: 55, A: 57, H: 59 };
    const chordRoot = async () => {
      await page.waitForSelector('.question .keyboard-task .task-prompt');
      return ROOT_KEYS[(await page.locator('.question .task-prompt').innerText()).trim()[0]];
    };
    await page.goto(chordTask, { waitUntil: 'networkidle' });
    let root = await chordRoot();
    for (const key of [root, root + 4, root + 7]) await keyAt(page, key).click();
    check(
      (await page.locator('.question .piano-key[data-state="selected"]').count()) === 3,
      'Akkord: drei angetippte Tasten bleiben gewählt',
    );
    await keyAt(page, root + 4).click();
    check(
      (await keyAt(page, root + 4).getAttribute('data-state')) === null &&
        (await page.locator('.question .piano-key[data-state="selected"]').count()) === 2,
      'noch einmal antippen nimmt die Taste weg',
    );
    await keyAt(page, root + 4).click();
    await checkButton.click();
    await page.waitForSelector('.verdict');
    check(
      (await page.locator('.verdict-text').innerText()) === 'Richtig' &&
        (await page.locator('.question .piano-key[data-state="right"]').count()) === 3,
      'der richtige Akkord: Richtig, alle drei Tasten grün',
    );
    await page.locator('.session-bar button:has-text("Weiter")').click();
    root = await chordRoot();
    // Dieselben Töne, aber die Terz unten: keine Grundstellung.
    for (const key of [root + 4, root + 7, root + 12]) await keyAt(page, key).click();
    await checkButton.click();
    await page.waitForSelector('.verdict');
    check(
      (await page.locator('.verdict-text').innerText()) === 'Falsch' &&
        (await keyAt(page, root + 4).getAttribute('data-state')) === 'wrong' &&
        (await page.locator('.question .piano-key[data-state="solution"]').count()) >= 1,
      'Terz unten: Falsch, die tiefste Taste rot, eine richtige Lage grün umrandet',
    );
    await page.screenshot({ path: join(SHOTS, 'klaviatur-akkord-falsch.png'), fullPage: true });

    const pianoPhone = await browser.newContext({ ...devices['iPhone 13'] });
    const pianoPhonePage = await pianoPhone.newPage();
    for (const id of ['intervalle-klaviatur-spielen', 'intervalle-klaviatur-benennen']) {
      await pianoPhonePage.goto(exercise(id), { waitUntil: 'networkidle' });
      await pianoPhonePage.waitForSelector('.question .piano');
      const pianoBox = await pianoPhonePage.locator('.question .piano').boundingBox();
      const whiteBox = await pianoPhonePage.locator('.question .piano-key.is-white').first().boundingBox();
      const barTop = (await pianoPhonePage.locator('.session-bar').boundingBox()).y;
      const lastChoice = pianoPhonePage.locator('.question .choice').last();
      const bottom = (await lastChoice.count()) ? await lastChoice.boundingBox() : pianoBox;
      check(
        pianoBox.x >= 15 && pianoBox.x + pianoBox.width <= pianoPhonePage.viewportSize().width - 15 &&
          whiteBox.width >= 22 && bottom.y + bottom.height <= barTop + 1,
        `${id}, Telefon: Klaviatur in der Spalte, weisse Tasten ${Math.round(whiteBox.width)} px breit, alles ohne Scrollen sichtbar`,
      );
      await pianoPhonePage.screenshot({ path: join(SHOTS, `telefon-${id}.png`) });
    }
    await pianoPhone.close();

    const pianoLandscape = await browser.newContext({ ...devices['iPhone 13 landscape'], viewport: { width: 750, height: 340 } });
    const pianoLandscapePage = await pianoLandscape.newPage();
    for (const id of ['intervalle-klaviatur-benennen', 'intervalle-grob-klaviatur-benennen', 'intervalle-klaviatur-spielen']) {
      await pianoLandscapePage.goto(exercise(id), { waitUntil: 'networkidle' });
      await pianoLandscapePage.waitForSelector('.question .piano');
      const barTop = (await pianoLandscapePage.locator('.session-bar').boundingBox()).y;
      const lastChoice = pianoLandscapePage.locator('.question .choice').last();
      const bottom = (await lastChoice.count())
        ? await lastChoice.boundingBox()
        : await pianoLandscapePage.locator('.question .piano').boundingBox();
      check(bottom.y + bottom.height <= barTop + 1, `${id}, quer: alles ohne Scrollen sichtbar`);
      await pianoLandscapePage.screenshot({ path: join(SHOTS, `telefon-quer-${id}.png`) });
    }
    await pianoLandscape.close();

    // ------------------------------------------------- Erklärung
    console.log('\nErklärung nur hinter ⓘ');
    const explainContext = await browser.newContext();
    const explainPage = await explainContext.newPage();
    await explainPage.goto(exercise('intervalle-bestimmen'), { waitUntil: 'networkidle' });
    await explainPage.waitForSelector('.question');
    check((await explainPage.locator('.explanation').count()) === 0, 'auch beim ersten Öffnen ist die Erklärung verborgen');
    await explainPage.locator('.session-info').click();
    check((await explainPage.locator('.explanation').count()) === 1, 'ⓘ zeigt sie');
    await explainPage.locator('.session-info').click();
    check((await explainPage.locator('.explanation').count()) === 0, 'ⓘ verbirgt sie wieder');
    await explainPage.locator('.session-info').click();
    await explainPage.locator('.question .choice').first().click();
    await explainPage.locator('.session-bar button:has-text("Weiter")').click();
    await explainPage.waitForSelector('.question .choice:not([disabled])');
    check((await explainPage.locator('.explanation').count()) === 0, 'mit der nächsten Aufgabe ist sie wieder weg');
    await explainPage.goto(exercise('melodiediktat'), { waitUntil: 'networkidle' });
    await explainPage.waitForSelector('.task-context');
    const dictationContext = await explainPage.locator('.task-context').innerText();
    check(/\d Takte, \d\/\d-Takt, \S+-(Dur|Moll)/.test(dictationContext), `das Diktat nennt seine Eckdaten («${dictationContext}»)`);
    await explainContext.close();

    // ------------------------------------------------- Leiste unten
    console.log('\nRückmeldung in der Leiste');
    const barCheck = async (p) => {
      await p.goto(exercise('intervalle-bestimmen'), { waitUntil: 'networkidle' });
      await p.locator('.question .choice').first().click();
      await p.waitForSelector('.verdict');
      return {
        verdict: await p.locator('.verdict').boundingBox(),
        button: await p.locator('.session-bar button:has-text("Weiter")').boundingBox(),
        width: p.viewportSize().width,
      };
    };
    const wide = await barCheck(page);
    check(
      wide.verdict.x + wide.verdict.width <= wide.button.x && Math.abs(wide.verdict.y + wide.verdict.height / 2 - (wide.button.y + wide.button.height / 2)) < 12,
      'breit: Rückmeldung links, «Weiter» rechts in einer Zeile',
    );
    const phoneBar = await browser.newContext({ ...devices['iPhone 13'] });
    const phoneBarPage = await phoneBar.newPage();
    const slim = await barCheck(phoneBarPage);
    check(
      slim.verdict.y + slim.verdict.height <= slim.button.y + 1 &&
        Math.abs(slim.verdict.x + slim.verdict.width / 2 - slim.width / 2) < 4,
      'schmal: Rückmeldung mittig über dem Knopf',
    );
    await phoneBarPage.screenshot({ path: join(SHOTS, 'telefon-rueckmeldung.png') });
    await phoneBar.close();

    // Die Aufgabe steht mittig.
    await page.goto(exercise('intervalle-hoeren'), { waitUntil: 'networkidle' });
    const playBox = await page.locator('.play-button').boundingBox();
    const columnBox = await page.locator('.session-body .session-column').boundingBox();
    check(
      Math.abs(playBox.x + playBox.width / 2 - (columnBox.x + columnBox.width / 2)) < 80,
      'der Abspielknopf steht mittig über den Antworten',
    );

    // ------------------------------------------------- automatisch abspielen
    console.log('\nHörbeispiel spielt von selbst');
    const autoContext = await browser.newContext();
    const autoPage = await autoContext.newPage();
    await autoPage.goto(`${BASE}ueben/intervalle/`, { waitUntil: 'networkidle' });
    await autoPage.locator('.nav-list a', { hasText: 'Intervalle hörend erkennen' }).click();
    let autoStarted = true;
    try {
      await autoPage.waitForSelector('.play-button.is-playing', { timeout: 6000 });
    } catch {
      autoStarted = false;
    }
    check(autoStarted, 'nach dem Öffnen aus der Liste erklingt die erste Aufgabe');
    await autoPage.waitForSelector('.play-button:not(.is-playing)', { timeout: 20_000 });
    await autoPage.locator('.question .choice').first().click();
    await autoPage.waitForSelector('.verdict');
    await autoPage.locator('.session-bar button:has-text("Weiter")').click();
    let autoAgain = true;
    try {
      await autoPage.waitForSelector('.play-button.is-playing', { timeout: 6000 });
    } catch {
      autoAgain = false;
    }
    check(autoAgain, 'nach «Weiter» erklingt die nächste von selbst');
    await autoContext.close();

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
    // Ohne vorherige Nutzeraktion spielt nichts von selbst — der Knopf schon.
    await audioPage.waitForSelector('.play-button:not(.is-playing)', { timeout: 20_000 });
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

    // ---------------------------------------------------- Einstellungen (⚙)
    console.log('\nEinstellungen und Adresszeile');
    const openSettings = async () => {
      await page.locator('.session-settings').click();
      await page.waitForSelector('.sheet');
    };
    const closeSettings = async () => {
      await page.locator('.sheet-bar button:has-text("Fertig")').click();
      await page.waitForSelector('.sheet', { state: 'detached' });
    };
    const selectedChips = () =>
      page.locator('.filter-field', { hasText: 'Abgefragte Intervalle' }).locator('.filter-chip.is-selected').count();

    await page.goto(exercise('intervalle-hoeren'), { waitUntil: 'networkidle' });
    await page.waitForSelector('.question');
    await eventually(page, () => new URL(location.href).searchParams.has('aufgabe'));
    const untouched = new URL(page.url()).searchParams.get('aufgabe');
    await openSettings();
    await page.screenshot({ path: join(SHOTS, 'einstellungen.png'), fullPage: true });
    await closeSettings();
    await page.waitForTimeout(300);
    check(
      new URL(page.url()).searchParams.get('aufgabe') === untouched,
      'Schliessen ohne Änderung lässt die Aufgabe stehen',
    );

    await openSettings();
    await page
      .locator('.filter-field', { hasText: 'Abgefragte Intervalle' })
      .locator('button:has-text("keine")')
      .click();
    check((await selectedChips()) === 1, 'Mehrfachauswahl behält den letzten Haken');
    check(
      new URL(page.url()).searchParams.get('intervalle') === null,
      'die Änderung gilt erst beim Schliessen',
    );
    await closeSettings();
    check(
      await eventually(page, hasParam, ['intervalle', 'k2']),
      'danach steht sie in der Adresszeile',
    );
    check(
      await eventually(page, (before) => new URL(location.href).searchParams.get('aufgabe') !== before, untouched),
      'und es gibt eine neue Aufgabe',
    );

    await page.reload({ waitUntil: 'networkidle' });
    await openSettings();
    check((await selectedChips()) === 1, 'Neuladen behält die Einstellung');
    await closeSettings();

    // Ohne Parameter geöffnet: die eigenen, gespeicherten Einstellungen.
    await page.goto(exercise('intervalle-hoeren'), { waitUntil: 'networkidle' });
    await openSettings();
    check((await selectedChips()) === 1, 'ohne Link gelten die zuletzt gewählten Einstellungen');
    await closeSettings();
    check(await eventually(page, hasParam, ['intervalle', 'k2']), 'und stehen gleich in der Adresszeile');

    // Ein fremder Link überschreibt die eigenen Einstellungen nicht.
    await page.goto(exercise('intervalle-hoeren', '?intervalle=k3,g3'), { waitUntil: 'networkidle' });
    await openSettings();
    check((await selectedChips()) === 2, 'ein Link mit «intervalle=k3,g3» stellt genau zwei ein');
    await closeSettings();
    await page.goto(exercise('intervalle-hoeren'), { waitUntil: 'networkidle' });
    await openSettings();
    check((await selectedChips()) === 1, 'danach gelten wieder die eigenen Einstellungen');

    await page.locator('.sheet button:has-text("Auf Vorgabe zurücksetzen")').click();
    check((await selectedChips()) === 12, 'Zurücksetzen stellt die Vorgabe her (alle ausser der Prime)');
    await closeSettings();
    check(
      await eventually(page, () => !new URL(location.href).searchParams.has('intervalle')),
      'und die Adresszeile ist wieder kurz',
    );

    // ---------------------------------------------------------------- Teilen
    console.log('\nTeilen');
    await page.goto(exercise('intervalle-notieren', '?schluessel=bass'), { waitUntil: 'networkidle' });
    await page.waitForSelector('.notation-input svg');
    const original = await scoreFingerprint(page);
    await openSettings();
    const links = await page.locator('.share-url').evaluateAll((inputs) => inputs.map((input) => input.value));
    check(links.length === 2, 'zwei Links: Übung und Aufgabe');
    check(
      links[0] === exercise('intervalle-notieren', '?schluessel=bass'),
      `Übungslink ohne Aufgabe (${links[0]})`,
    );
    check(/[?&]aufgabe=[0-9a-z]+&v=\d+$/.test(links[1]), 'Aufgabenlink mit Aufgabe und Fassung');
    await closeSettings();

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
        await p.waitForSelector('.verdict');
        await p.locator('.session-bar .primary').click();
      }
      roundPrompts.push(prompts.join(' | '));
      await ctx.close();
    }
    check(roundPrompts[0] === roundPrompts[1], `ein Rundenlink stellt dieselben Aufgaben («${roundPrompts[0]}»)`);

    // -------------------------------------------------------------------- Runde
    console.log('\nRunde');
    await page.goto(exercise('stufen-bestimmen'), { waitUntil: 'networkidle' });
    await openSettings();
    await page.locator('.sheet .filter-chip', { hasText: 'Runde à 10' }).click();
    await closeSettings();
    check((await page.locator('.session-progress').innerText()) === '1/10', 'oben steht «1/10»');
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
      await page.waitForSelector('.verdict');
      await page.locator('.session-bar .primary').click();
      await page.waitForTimeout(100);
    }
    await page.waitForSelector('.round-summary', { timeout: 5000 });
    const score = await page.locator('.round-score').innerText();
    check(/\bvon 10\b/.test(score), 'Runde endet mit einer Auswertung über zehn Aufgaben');
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

    // ------------------------------------------------- Intervalle singen
    // Dasselbe künstliche g, als gesungene Antwort. Feste Aufgaben, damit das
    // Urteil feststeht (Stimmlage «mittel», die Vorgabe):
    //  - Es → grosse Terz aufwärts → G: das g eine Oktave tiefer ist richtig;
    //  - H → kleine Terz aufwärts → D: das g ist falsch.
    console.log('\nIntervalle singen mit künstlichem Mikrofon');
    const singPage = await micContext.newPage();
    singPage.on('console', (message) => {
      if (message.type() === 'error') micProblems.push(message.text());
    });
    await singPage.goto(`${BASE}ueben/intervalle-singen/?intervalle=g3&richtung=auf&aufgabe=2&v=2`, {
      waitUntil: 'networkidle',
    });
    check(
      (await singPage.locator('.sing-task .task-prompt').innerText()) === 'grosse Terz aufwärts',
      'nennt das Intervall',
    );
    check((await singPage.locator('.sing-task .score svg').count()) === 1, 'zeigt den Ausgangston im System');
    check((await singPage.locator('button:has-text("Prüfen")').count()) === 0, 'kein Prüfen-Knopf');
    await singPage.locator('.sing-mic button').click();
    await singPage.waitForSelector('.sing-curve canvas');
    check(
      (await singPage.locator('.sing-status').innerText()).includes('Hör zu'),
      'spielt zuerst den Ausgangston und hört dabei nicht zu',
    );
    await singPage.waitForSelector('.verdict', { timeout: 12_000 });
    const rightVerdict = await singPage.locator('.verdict-text').innerText();
    check(rightVerdict === 'Richtig', `der Zielton eine Oktave tiefer ist richtig («${rightVerdict}»)`);
    /** Die Noten im System: «black», «red» oder «green», in ihrer Reihenfolge. */
    const staffColours = () =>
      singPage.locator('.sing-task .score svg .vf-stavenote').evaluateAll((notes) =>
        notes.map((note) =>
          note.outerHTML.includes('#00d903') ? 'green' : note.outerHTML.includes('#b3261e') ? 'red' : 'black',
        ),
      );
    const rightStaff = await staffColours();
    check(
      rightStaff.join(' ') === 'black green',
      `im System stehen Ausgangston und Zielton, dieser grün (${rightStaff.join(', ')})`,
    );
    check(
      (await singPage.locator('.session-bar.is-correct').count()) === 1,
      'die Leiste unten wird grün',
    );
    const drawn = await singPage.locator('.sing-curve canvas').evaluate((canvas) => {
      const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
      // Grüne Kurve: deutlich mehr Grün als Rot und Blau.
      let green = 0;
      for (let i = 0; i < data.length; i += 4) if (data[i + 1] > 90 && data[i] < 80 && data[i + 2] < 120) green++;
      return green;
    });
    check(drawn > 50, `zeichnet die gesungene Linie grün (${drawn} Pixel)`);
    await singPage.screenshot({ path: join(SHOTS, 'intervalle-singen-richtig.png') });

    // Neu geladen ist das Mikrofon wieder zu. Danach, mit «Weiter», bleibt es offen.
    await singPage.goto(`${BASE}ueben/intervalle-singen/?intervalle=k3&richtung=auf&aufgabe=1&v=2`, {
      waitUntil: 'networkidle',
    });
    await singPage.locator('.sing-mic button').click();
    await singPage.waitForSelector('.verdict', { timeout: 12_000 });
    const wrongVerdict = await singPage.locator('.verdict-text').innerText();
    check(wrongVerdict === 'Falsch', `ein anderer Ton ist falsch («${wrongVerdict}»)`);
    const wrongStaff = await singPage.locator('.sing-task .score svg .vf-stavenote').count();
    const wrongColours = await staffColours();
    check(
      wrongStaff === 3 && wrongColours.join(' ') === 'black red green',
      `im System: Ausgangston, das gesungene g rot, der Zielton grün (${wrongColours.join(', ')})`,
    );
    check(
      /gesungen g, richtig wäre d2/.test(await singPage.locator('.verdict .visually-hidden').textContent()),
      'Bildschirmleser hören, was gesungen wurde',
    );
    check((await singPage.locator('.session-bar.is-wrong').count()) === 1, 'die Leiste unten wird rot');
    await singPage.screenshot({ path: join(SHOTS, 'intervalle-singen-falsch.png') });
    await singPage.locator('.session-actions button.primary').click();
    await singPage.waitForSelector('.sing-curve canvas', { timeout: 5000 });
    check(
      (await singPage.locator('.sing-mic').count()) === 0,
      'die nächste Aufgabe braucht keinen Mikrofonknopf mehr',
    );

    // Dreiklänge singen, mit demselben g. Feste Aufgaben (Stimmlage «mittel»):
    //  - G-Dur, g h d: das g ist der erste Ton, dann wartet die Übung auf h;
    //  - E-Dur, e gis h: das g als erster Ton ist falsch.
    console.log('\nDreiklänge singen mit künstlichem Mikrofon');
    await singPage.goto(`${BASE}ueben/dreiklaenge-singen/?geschlechter=dur&vorzeichen=stammton&aufgabe=8&v=1`, {
      waitUntil: 'networkidle',
    });
    check((await singPage.locator('.sing-task .task-prompt').innerText()) === 'G-Dur', 'nennt den Dreiklang');
    // Neu geladen ist das Mikrofon zu.
    await singPage.locator('.sing-mic button').click();
    await singPage.waitForSelector('.sing-curve canvas');
    let counted = '';
    try {
      await singPage.waitForFunction(
        () => document.querySelector('.sing-status')?.textContent?.includes('1 von 3'),
        null,
        { timeout: 12_000 },
      );
      counted = '1 von 3';
    } catch {
      counted = await singPage.locator('.sing-status').innerText();
    }
    check(counted === '1 von 3', `das g zählt als erster Ton, die Übung zählt mit («${counted}»)`);
    await singPage.waitForTimeout(1500);
    check((await singPage.locator('.verdict').count()) === 0, 'das g noch einmal ist kein Fehler: sie wartet auf den nächsten Ton');
    await singPage.screenshot({ path: join(SHOTS, 'dreiklaenge-singen-zaehlt.png') });

    await singPage.goto(`${BASE}ueben/dreiklaenge-singen/?geschlechter=dur&vorzeichen=stammton&aufgabe=2&v=1`, {
      waitUntil: 'networkidle',
    });
    await singPage.locator('.sing-mic button').click();
    await singPage.waitForSelector('.verdict', { timeout: 12_000 });
    const chordStaff = await staffColours();
    check(
      (await singPage.locator('.verdict-text').innerText()) === 'Falsch' &&
        chordStaff.join(' ') === 'black red green green',
      `E-Dur mit g begonnen: Falsch; im System e, das g rot, gis und h grün (${chordStaff.join(', ')})`,
    );
    await singPage.screenshot({ path: join(SHOTS, 'dreiklaenge-singen-falsch.png') });

    // «Ohne Fehlerurteil»: das falsche g beendet die Aufgabe nicht.
    await singPage.goto(
      `${BASE}ueben/intervalle-singen/?intervalle=k3&richtung=auf&ohne-fehlerurteil=ja&aufgabe=1&v=2`,
      { waitUntil: 'networkidle' },
    );
    await singPage.locator('.sing-mic button').click();
    await singPage.waitForSelector('.sing-curve canvas');
    await singPage.waitForTimeout(300);
    /** Pixel der Kurve in einer Farbe: «green» (#00d903) oder «red». */
    const curvePixels = (colour) =>
      singPage.locator('.sing-curve canvas').evaluate((canvas, wanted) => {
        const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
        let count = 0;
        for (let i = 0; i < data.length; i += 4) {
          const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
          if (wanted === 'green' ? g > 150 && r < 80 && b < 80 : r > 140 && g < 80 && b < 80) count++;
        }
        return count;
      }, colour);
    const greenAtStart = await curvePixels('green');
    check(greenAtStart > 50, `Ohne Fehlerurteil: der Zielton steht von Anfang an da (${greenAtStart} Pixel)`);
    let redPixels = 0;
    for (let waited = 0; waited < 12_000 && redPixels <= 50; waited += 500) {
      await singPage.waitForTimeout(500);
      redPixels = await curvePixels('red');
    }
    check(redPixels > 50, `der falsche Versuch ist in der Kurve rot (${redPixels} Pixel)`);
    await singPage.waitForTimeout(2500);
    check((await singPage.locator('.verdict').count()) === 0, 'und beendet die Aufgabe nicht');
    check(
      !(await singPage.locator('.sing-status').innerText()).includes('Noch nicht'),
      'ohne Meldung «Noch nicht»',
    );
    await singPage.screenshot({ path: join(SHOTS, 'intervalle-singen-ohne-fehlerurteil.png') });

    await singPage.locator('.session-icon[aria-label="Übung schliessen"]').click();
    await singPage.waitForSelector('.list-page, .topic-page, .start-page', { timeout: 5000 }).catch(() => {});
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
