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

import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
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
  'toene-klaviatur-benennen': 'Tasten benennen',
  'toene-klaviatur-spielen': 'Tonnamen auf Klaviatur spielen',
  'noten-benennen': 'Noten benennen',
  'noten-schreiben': 'Noten schreiben',
  'noten-klaviatur-spielen': 'Noten auf Klaviatur spielen',
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
  'umkehrungen-benennen': 'Umkehrungen & Lagen in Noten benennen (Dreiklänge)',
  'umkehrungen-notieren': 'Umkehrungen & Lagen notieren (Dreiklänge)',
  'umkehrungen-klaviatur-benennen': 'Umkehrungen & Lagen auf Klaviatur benennen (Dreiklänge)',
  'umkehrungen-klaviatur-spielen': 'Umkehrungen & Lagen auf Klaviatur spielen (Dreiklänge)',
  'umkehrungen-hoeren': 'Umkehrungen & Lagen hörend erkennen (Dreiklänge)',
  'umkehrungen-singen': 'Umkehrungen & Lagen singen (Dreiklänge)',
  'septakkorde-benennen': 'Septakkorde in Noten benennen (Grundstellung)',
  'septakkorde-notieren': 'Septakkorde notieren (Grundstellung)',
  'septakkorde-klaviatur-benennen': 'Septakkorde auf Klaviatur benennen (Grundstellung)',
  'septakkorde-klaviatur-spielen': 'Septakkorde auf Klaviatur spielen (Grundstellung)',
  'septakkorde-hoeren': 'Septakkorde hörend erkennen (Grundstellung)',
  'septakkorde-singen': 'Septakkorde singen (Grundstellung)',
  'septakkorde-umkehrungen-benennen': 'Umkehrungen & Lagen in Noten benennen (Septakkorde)',
  'septakkorde-umkehrungen-notieren': 'Umkehrungen & Lagen notieren (Septakkorde)',
  'septakkorde-umkehrungen-klaviatur-benennen': 'Umkehrungen & Lagen auf Klaviatur benennen (Septakkorde)',
  'septakkorde-umkehrungen-klaviatur-spielen': 'Umkehrungen & Lagen auf Klaviatur spielen (Septakkorde)',
  'septakkorde-umkehrungen-hoeren': 'Umkehrungen & Lagen hörend erkennen (Septakkorde)',
  'septakkorde-umkehrungen-singen': 'Umkehrungen & Lagen singen (Septakkorde)',
  'tonarten-zuordnen': 'Tonarten den Vorzeichen zuordnen',
  'vorzeichen-setzen': 'Vorzeichen setzen',
  'tonleitern-notieren': 'Tonleitern notieren',
  'tonleitern-klaviatur': 'Tonleitern auf Klaviatur markieren',
  'tonleitern-hoeren': 'Tonleitern hörend erkennen',
  'tonleitern-singen': 'Tonleitern singen',
  'gehoerte-melodie-klaviatur-spielen': 'Gehörte Melodie auf Klaviatur spielen',
  'generiertes-melodiediktat': 'Generiertes Melodiediktat',
  melodiediktat: 'Rhythmus- und Melodiediktat',
  'generierte-melodie-singen': 'Generierte Melodie singen',
};
const MODE_IDS = Object.keys(MODES);

/** Themen mit Übungen — muss zu src/generators/types.ts (TOPICS) passen. */
const TOPICS = ['toene', 'intervalle', 'dreiklaenge', 'septakkorde', 'tonleitern', 'melodie'];

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
      // Frühere Adresse: Titel und Vorschau der Startseite, die jetzt dort steht.
      ['ueben/', 'Übungen Musiktheorie'],
      ['ueben/intervalle/', 'Intervalle · Übungen Musiktheorie'],
      ['ueben/tonleitern/', 'Tonleitern und Tonarten · Übungen Musiktheorie'],
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
        html.includes('name="description"') &&
        // Sonst ist env(safe-area-inset-*) auf dem iPhone 0: die Leiste unten läge unter dem Balken.
        html.includes('viewport-fit=cover');
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
    // Vorerst zurückgestellt (2026-11-25): das Thema Rhythmus und das Werkzeug «Tonhöhe anzeigen».
    const startText = await page.locator('.list-page').first().innerText();
    check(
      !startText.includes('Rhythmus') && !startText.includes('Tonhöhe anzeigen') && !startText.includes('Werkzeuge'),
      'ohne Rhythmus und ohne Werkzeuge',
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
      'die frühere Adresse «/ueben/» zeigt die Themen der Startseite',
    );
    check(page.url() === BASE, '… und die Adresszeile wechselt zur Startseite');

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
          '.question .choice, .question select, .question .notation-input .score svg, .question .sing-mic button, .question .piano-key:not([disabled])',
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
    await page.waitForSelector('.notation-input .score svg');
    const staff = page.locator('.notation-input .score svg').first();
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
    await page.waitForSelector('.notation-input .score svg');
    const grandBox = await page.locator('.notation-input .score svg').first().boundingBox();
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
        [...document.querySelectorAll('.notation-input .score svg .vf-stavenote')].filter((note) =>
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
    await page.waitForSelector('.notation-input .score svg');
    await page.keyboard.press('f');
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(80);
    check(/fis/.test(await page.locator('.input-summary').innerText()), 'fis¹ gesetzt');
    await page.keyboard.press('Enter');
    await page.waitForSelector('.verdict');
    const staffNotes = page.locator('.notation-input .score svg .vf-stavenote');
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
    await page.waitForSelector('.notation-input .score svg');
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

    // Noch einmal ziehen: die gesetzte Note verschwindet sofort, zu sehen sind
    // nur der vorgegebene Ton und die gezogene Vorschau. Abgebrochen, steht
    // die gesetzte wieder da.
    const heads = () => page.locator('.score-click-area svg .vf-notehead').count();
    const headsBefore = await heads();
    await page.mouse.move(area.x + area.width * 0.72, area.y + area.height * 0.35);
    await page.mouse.down();
    await page.mouse.move(area.x + area.width * 0.72, area.y + area.height * 0.55, { steps: 6 });
    const headsWhileDragging = await heads();
    const blueWhileDragging = await page
      .locator('.score-click-area svg [fill="#5aa9dd"], .score-click-area svg [stroke="#5aa9dd"]')
      .count();
    check(
      headsBefore === 2 && headsWhileDragging === 2 && blueWhileDragging > 0,
      `beim erneuten Ziehen steht nur noch die gezogene Note (Köpfe: ${headsBefore} → ${headsWhileDragging})`,
    );
    await page.mouse.move(area.x + area.width * 0.72, area.y + area.height + 80, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(150);
    check(
      (await page.locator('.input-summary').innerText()) === sharpened && (await heads()) === 2,
      'abgebrochen, steht die gesetzte Note wieder da',
    );

    // Löschen, rückgängig, wiederholen — mit den Knöpfen und mit Strg + Z.
    const tool = (label) => page.locator(`.toolbar button[aria-label="${label}"]`);
    const shown = () => page.locator('.input-summary').innerText();
    check(
      (await tool('Alles löschen').count()) === 1 && (await page.locator('.toolbar button:has-text("Zurücksetzen")').count()) === 0,
      'Löschen, Rückgängig und Wiederholen ersetzen «Zurücksetzen»',
    );
    check(await tool('Wiederholen').isDisabled(), 'ohne Rückgängig gibt es nichts zu wiederholen');
    await tool('Rückgängig').click();
    await page.waitForTimeout(80);
    const undoneText = await shown();
    const naturalPressed = await page.locator('.toolbar button[aria-label="ohne Vorzeichen"]').getAttribute('aria-pressed');
    check(
      undoneText === placedText && naturalPressed === 'true',
      `Rückgängig nimmt das Kreuz zurück, die Vorzeichenknöpfe folgen («${undoneText}», ohne Vorzeichen gedrückt: ${naturalPressed})`,
    );
    await tool('Wiederholen').click();
    check((await shown()) === sharpened, 'Wiederholen setzt es wieder');
    await tool('Alles löschen').click();
    check(!/Gesetzt:/.test(await shown()) && (await tool('Alles löschen').isDisabled()), 'Alles löschen nimmt den Ton weg');
    await page.keyboard.press('Control+z');
    check((await shown()) === sharpened, 'Strg + Z holt ihn zurück');
    await page.keyboard.press('Control+Shift+z');
    check(!/Gesetzt:/.test(await shown()), 'Strg + Umschalt + Z löscht wieder');

    await page.mouse.move(area.x + area.width * 0.5, area.y + area.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(area.x + area.width * 0.5, area.y + area.height + 80, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(150);
    // Löschen zählt selbst als Eingabe (Prüfen wird frei) — ob eine Note
    // steht, sagt die Zeile unter dem Notenbild.
    const afterCancel = await shown();
    check(!/Gesetzt:/.test(afterCancel), `Loslassen ausserhalb des Notenbilds bricht ab («${afterCancel}»)`);
    await page.screenshot({ path: join(SHOTS, 'noteneingabe-leiste.png'), fullPage: true });

    // ------------------------------------------------- Ziehen mit dem Finger
    console.log('\nNoteneingabe mit dem Finger (Telefon)');
    const touch = await browser.newContext({ ...devices['iPhone 13'] });
    const touchPage = await touch.newPage();
    await touchPage.goto(exercise('intervalle-notieren'), { waitUntil: 'networkidle' });
    await touchPage.waitForSelector('.notation-input .score svg');
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
    await page.waitForSelector('.notation-input .score svg');
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
    await page.waitForSelector('.notation-input .score svg');
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
    // geplant ist, gemessen an der Uhr des Audiokontexts, und welche Taste
    // (MIDI) — jede Taste hat ihr eigenes Sample, «60.mp3» für c¹.
    await page.addInitScript(() => {
      const urls = new WeakMap();
      const samples = new WeakMap();
      const arrayBuffer = Response.prototype.arrayBuffer;
      Response.prototype.arrayBuffer = async function () {
        const data = await arrayBuffer.call(this);
        urls.set(data, this.url);
        return data;
      };
      const decode = BaseAudioContext.prototype.decodeAudioData;
      BaseAudioContext.prototype.decodeAudioData = async function (data, ...rest) {
        const url = urls.get(data);
        const buffer = await decode.call(this, data, ...rest);
        if (url) samples.set(buffer, Number(/(\d+)\.mp3/.exec(url)?.[1]));
        return buffer;
      };
      const original = AudioBufferSourceNode.prototype.start;
      window.__tones = [];
      AudioBufferSourceNode.prototype.start = function (when = 0, ...rest) {
        if ((this.buffer?.length ?? 0) > 1) {
          window.__tones.push({ lead: when - this.context.currentTime, key: samples.get(this.buffer) });
        }
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
    const tonesBeforeCheck = await page.evaluate(() => window.__tones.length);
    await checkButton.click();
    await page.waitForSelector('.verdict');
    check(
      await eventually(page, (before) => window.__tones.length >= before + 3, tonesBeforeCheck),
      'nach dem Prüfen erklingt der Akkord, alle drei Töne zusammen',
    );
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

    // Ein Septakkord, von Haus aus als Akkordsymbol. Feste Aufgabe: C7 ab
    // der tiefsten Taste (c e g b). Gespielt weit, die Terz oben: richtig,
    // und so erklingt er nach dem Prüfen — nicht in der Lage des Generators.
    await page.goto(
      exercise('septakkorde-klaviatur-spielen', '?arten=dominant&vorzeichen=stammton&aufgabe=1&v=1'),
      { waitUntil: 'networkidle' },
    );
    root = await chordRoot();
    check(
      (await page.locator('.question .task-prompt').innerText()).trim() === 'C7' && root === 48,
      'Septakkord: als Akkordsymbol genannt («C7»)',
    );
    const spread = [48, 55, 58, 64];
    for (const key of spread) await keyAt(page, key).click();
    const tonesBeforeSeventh = await page.evaluate(() => window.__tones.length);
    await checkButton.click();
    await page.waitForSelector('.verdict');
    check(
      (await page.locator('.verdict-text').innerText()) === 'Richtig' &&
        (await page.locator('.question .piano-key[data-state="right"]').count()) === 4,
      'Septakkord: vier Tasten, Richtig, alle grün',
    );
    const soundedAfter = (await eventually(page, (before) => window.__tones.length >= before + 4, tonesBeforeSeventh))
      ? await page.evaluate((before) => window.__tones.slice(before).map((tone) => tone.key), tonesBeforeSeventh)
      : [];
    check(
      soundedAfter.length === 4 && [...soundedAfter].sort((a, b) => a - b).join() === spread.join(),
      `nach dem Prüfen erklingt der Akkord so, wie er gespielt wurde (${soundedAfter.join(' ')})`,
    );

    // Vierstimmig verlangt (Terz unten, Quinte oben). Gespielt werden zwei
    // Tasten, die nicht zum Akkord gehören — so liegt keine unter der grün
    // umrandeten Lösung, und die muss vierstimmig sein: alle vier Töne, die
    // Terz unten, die Quinte oben.
    await page.goto(
      exercise(
        'septakkorde-umkehrungen-klaviatur-spielen',
        '?arten=dominant&vorzeichen=stammton&gefragt=umkehrung,lage&mit-bass=ja' +
          '&umkehrungen=quintsextakkord&lagen=quintlage',
      ),
      { waitUntil: 'networkidle' },
    );
    root = await chordRoot();
    check(
      /^[A-H]7, Quintsextakkord in Quintlage$/.test((await page.locator('.question .task-prompt').innerText()).trim()),
      'Septakkord-Umkehrung: Akkord, Umkehrung und Lage genannt',
    );
    for (const key of [root + 1, root + 2]) await keyAt(page, key).click();
    await checkButton.click();
    await page.waitForSelector('.verdict');
    const outlined = (
      await page
        .locator('.question .piano-key[data-state="solution"]')
        .evaluateAll((keys) => keys.map((key) => Number(key.dataset.key)))
    ).sort((a, b) => a - b);
    const member = (key) => (key - root + 120) % 12;
    check(
      (await page.locator('.verdict-text').innerText()) === 'Falsch' &&
        outlined.length === 4 &&
        new Set(outlined.map(member)).size === 4 &&
        member(outlined[0]) === 4 &&
        member(outlined[3]) === 7,
      `vierstimmig: Falsch, grün eine Lage mit allen vier Tönen, Terz unten, Quinte oben (${outlined.join(' ')})`,
    );
    await page.screenshot({ path: join(SHOTS, 'klaviatur-septakkord-vierstimmig.png'), fullPage: true });

    // Noten auf Klaviatur spielen: die Note steht im System, jede Oktave
    // zählt. Nur c¹ im Umfang, damit die richtige Taste feststeht.
    await page.goto(
      exercise('noten-klaviatur-spielen', '?vorzeichen=stammton&violin-tiefster=c1&violin-hoechster=c1'),
      { waitUntil: 'networkidle' },
    );
    await page.waitForSelector('.question .keyboard-task .score svg');
    check(
      (await page.locator('.question .keyboard-task .task-prompt').count()) === 0 &&
        (await page.locator('.question .keyboard-task .piano').count()) === 1,
      'Noten auf Klaviatur: Notenbild über der Klaviatur, kein Name',
    );
    await keyAt(page, 48).click();
    await checkButton.click();
    await page.waitForSelector('.verdict');
    check(
      (await page.locator('.verdict-text').innerText()) === 'Richtig' && (await keyAt(page, 48).getAttribute('data-state')) === 'right',
      'das c der anderen Oktave zählt auch',
    );
    await page.locator('.session-bar button:has-text("Weiter")').click();
    await page.waitForSelector('.question .piano-key:not([disabled])');
    await keyAt(page, 50).click();
    await checkButton.click();
    await page.waitForSelector('.verdict');
    check(
      (await page.locator('.verdict-text').innerText()) === 'Falsch' &&
        (await keyAt(page, 50).getAttribute('data-state')) === 'wrong' &&
        (await keyAt(page, 48).getAttribute('data-state')) === 'solution' &&
        (await keyAt(page, 60).getAttribute('data-state')) === 'solution',
      'falsch: beide c grün umrandet',
    );
    // Die nächste Aufgabe steht gleich ganz da: kein Bild, in dem die
    // Klaviatur ohne Notenbild oben stünde und dann nach unten spränge.
    const keyboardTop = (await page.locator('.question .piano').boundingBox()).y;
    await page.evaluate(() => {
      window.__frames = [];
      const tick = () => {
        const piano = document.querySelector('.question .piano');
        window.__frames.push({
          staff: Boolean(document.querySelector('.question .keyboard-task .score svg')),
          top: piano ? piano.getBoundingClientRect().top : null,
        });
        if (window.__frames.length < 40) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await page.locator('.session-bar button:has-text("Weiter")').click();
    await page.waitForFunction(() => window.__frames.length >= 40);
    const nextFrames = await page.evaluate(() => window.__frames);
    check(
      nextFrames.every((frame) => frame.staff && Math.abs(frame.top - keyboardTop) < 1),
      `neue Aufgabe: in jedem Bild Notenbild darüber, die Klaviatur springt nicht (${nextFrames.filter((frame) => !frame.staff).length} Bilder ohne)`,
    );

    const pianoPhone = await browser.newContext({ ...devices['iPhone 13'] });
    const pianoPhonePage = await pianoPhone.newPage();
    for (const id of ['intervalle-klaviatur-spielen', 'intervalle-klaviatur-benennen', 'noten-klaviatur-spielen']) {
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

    // Tablet: die Klaviatur darf über die Spalte (760 px) hinaus, bis 1000 px.
    for (const [name, viewport, expected] of [
      ['quer', { width: 1180, height: 820 }, 1000],
      ['hoch', { width: 820, height: 1180 }, 820 - 32],
    ]) {
      const tablet = await browser.newPage({ viewport, hasTouch: true, isMobile: true });
      for (const id of ['intervalle-klaviatur-spielen', 'toene-klaviatur-benennen']) {
        await tablet.goto(exercise(id), { waitUntil: 'networkidle' });
        await tablet.waitForSelector('.question .piano');
        const box = await tablet.locator('.question .piano').boundingBox();
        const barTop = (await tablet.locator('.session-bar').boundingBox()).y;
        const lastChoice = tablet.locator('.question .choice').last();
        const bottom = (await lastChoice.count()) ? await lastChoice.boundingBox() : box;
        const scrollsSideways = await tablet.evaluate(
          () => document.querySelector('.session-body').scrollWidth > document.querySelector('.session-body').clientWidth,
        );
        check(
          Math.abs(box.width - expected) <= 1 &&
            Math.abs(box.x + box.width / 2 - viewport.width / 2) <= 1 &&
            !scrollsSideways &&
            bottom.y + bottom.height <= barTop + 1,
          `${id}, Tablet ${name}: Klaviatur ${Math.round(box.width)} px breit (erwartet ${expected}), mittig, alles ohne Scrollen sichtbar`,
        );
        await tablet.screenshot({ path: join(SHOTS, `tablet-${name}-${id}.png`) });
      }
      await tablet.close();
    }

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
    // Notenbild und Klaviatur teilen sich die Höhe: die Klaviatur behält
    // ihren Mindestplatz, das System den Rest.
    await pianoLandscapePage.goto(exercise('noten-klaviatur-spielen'), { waitUntil: 'networkidle' });
    await pianoLandscapePage.waitForSelector('.question .keyboard-task .score svg');
    await pianoLandscapePage.waitForTimeout(200);
    {
      const barTop = (await pianoLandscapePage.locator('.session-bar').boundingBox()).y;
      const piano = await pianoLandscapePage.locator('.question .piano').boundingBox();
      const staff = await pianoLandscapePage.locator('.question .keyboard-task .score svg').boundingBox();
      check(
        piano.y + piano.height <= barTop + 1 && piano.height >= 95 && staff.height >= 60,
        `noten-klaviatur-spielen, quer: System ${Math.round(staff.height)} px und Klaviatur ${Math.round(piano.height)} px hoch, ohne Scrollen`,
      );
      await pianoLandscapePage.screenshot({ path: join(SHOTS, 'telefon-quer-noten-klaviatur-spielen.png') });
    }
    await pianoLandscape.close();

    // Drehen auf dem iPhone: Safari schickt das resize-Ereignis, solange seine
    // Leiste noch Platz nimmt, und keines mehr, wenn sie danach einfährt.
    const rotating = await browser.newContext({ viewport: { width: 390, height: 664 }, hasTouch: true, isMobile: true });
    await rotating.addInitScript(() =>
      window.addEventListener(
        'resize',
        (event) => {
          if (window.__blockResize) event.stopImmediatePropagation();
        },
        true,
      ),
    );
    const rotatingPage = await rotating.newPage();
    await rotatingPage.goto(exercise('noten-klaviatur-spielen'), { waitUntil: 'networkidle' });
    await rotatingPage.waitForSelector('.question .keyboard-task .score svg');
    await rotatingPage.setViewportSize({ width: 750, height: 280 });
    await rotatingPage.waitForTimeout(300);
    await rotatingPage.evaluate(() => (window.__blockResize = true));
    await rotatingPage.setViewportSize({ width: 750, height: 340 });
    await rotatingPage.waitForTimeout(300);
    const rotatedGap = await rotatingPage.evaluate(() => {
      const column = document.querySelector('.session-body').firstElementChild.getBoundingClientRect();
      return document.querySelector('.session-bar').getBoundingClientRect().top - column.bottom;
    });
    check(
      rotatedGap >= 0 && rotatedGap <= 16,
      `gedreht, danach fährt Safaris Leiste ein: Notenbild und Klaviatur füllen den Platz (${Math.round(rotatedGap)} px bis zur Leiste)`,
    );
    await rotating.close();

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

    // ------------------------------------------------- Als App, offline
    console.log('\nAls App installierbar und offline nutzbar');
    {
      // Eigener Server: er wird unten abgeschaltet, «offline» heisst hier
      // wirklich kein Netz. Eigener Ursprung, also auch eigene Zwischenspeicher.
      const appServer = await startServer(PORT + 1);
      const APP_BASE = `http://127.0.0.1:${PORT + 1}${BASE_PATH}`;
      const allSamples = readdirSync(join(ROOT, 'dist', 'samples')).length;

      /** Einträge in den Zwischenspeichern des Service Workers, nach Art. */
      const cached = (p) =>
        p.evaluate(async () => {
          const counts = { app: 0, samples: 0 };
          for (const name of await caches.keys()) {
            const kind = /(app|samples)-[0-9a-f]+$/.exec(name)?.[1];
            if (kind) counts[kind] += (await (await caches.open(name)).keys()).length;
          }
          return counts;
        });
      /** Wie eventually(), aber für Bedingungen, die selbst warten müssen. */
      const until = async (condition, timeout = 15_000) => {
        for (const end = Date.now() + timeout; Date.now() < end; await new Promise((r) => setTimeout(r, 200))) {
          if (await condition()) return true;
        }
        return false;
      };
      const controlled = (p) => eventually(p, () => navigator.serviceWorker.controller !== null, null, 15_000);

      const exerciseHtml = await (await fetch(`${APP_BASE}ueben/intervalle-hoeren/`)).text();
      check(
        exerciseHtml.includes(`<link rel="manifest" href="${BASE_PATH}manifest.webmanifest"`) &&
          exerciseHtml.includes(`<link rel="apple-touch-icon" href="${BASE_PATH}icons/apple-touch-icon.png"`),
        'jede Seite verweist auf Manifest und Symbol fürs iPhone',
      );

      // Im Browser-Tab: App gespeichert, Klaviertöne nur, was gespielt wurde.
      const tab = await browser.newContext();
      const tabPage = await tab.newPage();
      await tabPage.goto(APP_BASE, { waitUntil: 'networkidle' });

      const cdp = await tab.newCDPSession(tabPage);
      const manifest = await cdp.send('Page.getAppManifest');
      const parsed = manifest.data ? JSON.parse(manifest.data) : {};
      check(
        manifest.errors.length === 0 && parsed.display === 'standalone' && parsed.short_name === 'Musiktheorie',
        `Manifest ohne Fehler: «${parsed.short_name}», ohne Adresszeile`,
      );
      const icons = await Promise.all(
        [...(parsed.icons ?? []).map((icon) => icon.src), 'icons/apple-touch-icon.png'].map((src) =>
          fetch(new URL(src, manifest.url)),
        ),
      );
      check(
        icons.length === 4 && icons.every((r) => r.ok && r.headers.get('content-type') === 'image/png'),
        `${icons.length} Symbole vorhanden`,
      );
      check(await controlled(tabPage), 'Service Worker übernimmt die Seite');
      // Playwright-Kontexte zählen als Inkognito-Fenster; dort bietet Chrome
      // nie an zu installieren. Alles andere wäre ein Mangel.
      const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
      const blocking = installabilityErrors.map((e) => e.errorId).filter((id) => id !== 'in-incognito');
      check(blocking.length === 0, `Chrome hält die Seite für installierbar${blocking.length ? ` (${blocking.join(', ')})` : ''}`);
      const afterStart = await cached(tabPage);
      check(afterStart.app > 3 && afterStart.samples === 0, `App gespeichert (${afterStart.app} Dateien), keine Klaviertöne`);

      await tabPage.goto(`${APP_BASE}ueben/intervalle-hoeren/`, { waitUntil: 'networkidle' });
      await tabPage.waitForSelector('.play-button:not(.is-playing)', { timeout: 20_000 });
      const afterPlay = await cached(tabPage);
      check(
        afterPlay.samples > 0 && afterPlay.samples < allSamples,
        `im Tab nur die Klaviertöne der Aufgabe (${afterPlay.samples} von ${allSamples})`,
      );
      await tab.close();

      // Vom Startbildschirm: alle Klaviertöne. Playwright kann den
      // display-mode nicht nachstellen, darum meldet matchMedia ihn hier.
      const app = await browser.newContext();
      await app.addInitScript(() => {
        const matchMedia = window.matchMedia.bind(window);
        const standalone = (media) => ({
          matches: true,
          media,
          onchange: null,
          addEventListener() {},
          removeEventListener() {},
          addListener() {},
          removeListener() {},
          dispatchEvent: () => false,
        });
        window.matchMedia = (query) => (/display-mode:\s*standalone/.test(query) ? standalone(query) : matchMedia(query));
      });
      const appPage = await app.newPage();
      await appPage.goto(APP_BASE, { waitUntil: 'networkidle' });
      check(await controlled(appPage), 'installierte App: Service Worker übernimmt');
      check(
        await until(async () => (await cached(appPage)).samples === allSamples),
        `installierte App hält alle ${allSamples} Klaviertöne bereit`,
      );

      appServer.closeAllConnections();
      await new Promise((done) => appServer.close(done));
      await app.setOffline(true);

      // Eine Übung, die noch nie geöffnet war, samt Klang.
      await appPage.goto(`${APP_BASE}ueben/dreiklaenge-hoeren/`);
      check(
        await eventually(appPage, (title) => document.title.startsWith(title), MODES['dreiklaenge-hoeren'], 10_000),
        'offline: eine noch nie geöffnete Übung startet',
      );
      await appPage.waitForSelector('.play-button:not(.is-playing)', { timeout: 20_000 });
      await appPage.locator('.play-button').first().click();
      const offlinePlays = await appPage
        .waitForSelector('.play-button.is-playing', { timeout: 5000 })
        .then(() => true, () => false);
      check(offlinePlays && (await appPage.locator('.audio-error').count()) === 0, 'offline: das Hörbeispiel klingt');
      await app.close();
    }

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

    // Tiefster und höchster Ton: Schieberegler, der tiefste schiebt den
    // höchsten mit.
    await page.goto(exercise('toene-klaviatur-benennen'), { waitUntil: 'networkidle' });
    await page.waitForSelector('.question');
    await openSettings();
    const slider = (label) => page.locator('.filter-field', { has: page.locator('.filter-label', { hasText: label }) });
    check(
      (await slider('Tiefster Ton').locator('output').innerText()) === 'c' &&
        (await slider('Höchster Ton').locator('output').innerText()) === 'h¹',
      'Tiefster und höchster Ton: Vorgabe c bis h¹',
    );
    // Der Regler behält den Fokus, auch wenn sich dabei ein anderer
    // mitbewegt: sonst endet das Ziehen auf dem iPhone nach einem Schritt.
    // Beim Öffnen bekommt ihn zuerst «Fertig».
    await page.waitForFunction(() => document.activeElement?.textContent?.trim() === 'Fertig');
    const keepsFocus = await slider('Tiefster Ton')
      .locator('input[type="range"]')
      .evaluate(async (input) => {
        input.focus();
        input.value = '22';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 100));
        return document.activeElement === input;
      });
    check(keepsFocus, 'der gezogene Regler behält den Fokus');
    check(
      (await slider('Tiefster Ton').locator('output').innerText()) === 'd²' &&
        (await slider('Höchster Ton').locator('output').innerText()) === 'd²',
      'der tiefste über den höchsten geschoben nimmt ihn mit',
    );
    await closeSettings();
    check(
      await eventually(page, () => {
        const params = new URL(location.href).searchParams;
        return params.get('tiefster') === 'd2' && params.get('hoechster') === 'd2';
      }),
      'beide stehen deutsch in der Adresszeile (tiefster=d2&hoechster=d2)',
    );
    await page.waitForSelector('.question .piano');
    check(
      (await page.locator('.question .piano-key').count()) === 1,
      'die Klaviatur hat dann eine einzige Taste',
    );
    await openSettings();
    await page.locator('.sheet button:has-text("Auf Vorgabe zurücksetzen")').click();
    await closeSettings();

    await page.goto(exercise('noten-benennen'), { waitUntil: 'networkidle' });
    await page.waitForSelector('.question');
    await openSettings();
    check(
      (await slider('Tiefster Ton im Bassschlüssel').locator('.filter-locked').innerText()) === 'Nur mit Bassschlüssel.' &&
        (await slider('Tiefster Ton im Violinschlüssel').locator('.filter-locked').count()) === 0,
      'Noten benennen: die Regler des nicht gewählten Schlüssels sind gesperrt',
    );
    await closeSettings();

    // ---------------------------------------------------------------- Teilen
    console.log('\nTeilen');
    await page.goto(exercise('intervalle-notieren', '?schluessel=bass'), { waitUntil: 'networkidle' });
    await page.waitForSelector('.notation-input .score svg');
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
    await otherPage.waitForSelector('.notation-input .score svg');
    check((await scoreFingerprint(otherPage)) === original, 'der Aufgabenlink zeigt anderswo genau dieselbe Aufgabe');

    await otherPage.goto(exercise('intervalle-notieren', '?aufgabe=1abc&v=999'), { waitUntil: 'networkidle' });
    await otherPage.waitForSelector('.question');
    check(
      (await otherPage.locator('.notice-info').innerText()).includes('älteren Fassung'),
      'ein Link aus einer alten Fassung sagt das ehrlich',
    );
    await other.close();

    // Eine Runde aus einem Link: zweimal geöffnet, dieselben Aufgaben.
    const roundLink = exercise('intervalle-bestimmen', '?runde=10&aufgabe=2k9f&v=2');
    const roundTasks = [];
    for (let attempt = 0; attempt < 2; attempt++) {
      const ctx = await browser.newContext();
      const p = await ctx.newPage();
      await p.goto(roundLink, { waitUntil: 'networkidle' });
      const tasks = [];
      for (let i = 0; i < 3; i++) {
        // Freie Knöpfe heisst: die nächste Aufgabe steht da, nicht mehr die beantwortete.
        await p.waitForSelector('.question .choice:not([disabled])');
        tasks.push(await scoreFingerprint(p));
        await p.locator('.question .choice:not([disabled])').first().click();
        await p.waitForSelector('.verdict');
        await p.locator('.session-bar .primary').click();
      }
      roundTasks.push(tasks.join(' | '));
      await ctx.close();
    }
    check(
      roundTasks[0] === roundTasks[1] && new Set(roundTasks[0].split(' | ')).size > 1,
      'ein Rundenlink stellt dieselben Aufgaben',
    );

    // -------------------------------------------------------------------- Runde
    console.log('\nRunde');
    await page.goto(exercise('intervalle-bestimmen'), { waitUntil: 'networkidle' });
    await openSettings();
    await page.locator('.sheet .filter-chip', { hasText: 'Übung à 10' }).click();
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
      await page.locator('.question .choice:not([disabled])').first().click();
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

    // ----------------------------------------------------------- Töne wählen
    console.log('\nTöne wählen');
    {
      await page.goto(exercise('toene-klaviatur-benennen'), { waitUntil: 'networkidle' });
      await page.waitForSelector('.question');
      await page.locator('.session-settings').click();
      await page.waitForSelector('.sheet');
      const field = page.locator('.filter-field', { hasText: 'Töne' });
      const chip = (name) => field.locator('.filter-chip').filter({ hasText: new RegExp(`^${name}$`) });
      const chosen = async () => (await field.locator('.filter-chip.is-selected').allInnerTexts()).join(' ');
      const [cis, c, des] = await Promise.all(['cis', 'c', 'des'].map((name) => chip(name).boundingBox()));
      const d = await chip('d').boundingBox();
      check(
        (await field.locator('.filter-chip').count()) === 17 &&
          Math.abs(cis.x - c.x) < 1 && cis.y < c.y && Math.abs(des.x - d.x) < 1 && des.y > d.y,
        'Einstellungen: «Töne» als Raster wie die Antworten, cis über c, des unter d',
      );
      await field.locator('button:has-text("Stammtöne")').click();
      check((await chosen()) === 'c d e f g a h', 'Schnellwahl «Stammtöne»');
      await chip('cis').click();
      check((await chosen()) === 'c cis des d e f g a h', 'Tasten benennen: cis wählt des mit, eine Taste');
      await page.screenshot({ path: join(SHOTS, 'einstellungen-toene.png'), fullPage: true });
      await page.locator('.sheet-bar button:has-text("Fertig")').click();
      await page.waitForSelector('.sheet', { state: 'detached' });
      check(
        await eventually(page, () => new URL(location.href).searchParams.get('toene') === 'c,cis,des,d,e,f,g,a,h'),
        'die Wahl steht im Link («toene=c,cis,des,d,e,f,g,a,h»)',
      );

      // Ein Link von früher: «nur Stammtöne» heisst jetzt Töne c bis h.
      await page.goto(exercise('noten-benennen', '?vorzeichen=stammton'), { waitUntil: 'networkidle' });
      await page.waitForSelector('.question');
      check(
        await eventually(page, () => {
          const params = new URL(location.href).searchParams;
          return params.get('toene') === 'c,d,e,f,g,a,h' && !params.has('vorzeichen');
        }),
        'alter Link «vorzeichen=stammton» wird zu «toene=c,d,e,f,g,a,h»',
      );
      check((await page.locator('.question .note-grid .choice').count()) === 7, 'und bietet wie früher c bis h an');
    }

    // -------------------------------------------------------------------- Kurse
    console.log('\nKurse');
    await page.goto(BASE, { waitUntil: 'networkidle' });
    check((await page.locator('.course-hint').count()) === 1, 'ohne Kurs steht unter «Kurse» der Hinweis auf ⚙');
    {
      const titles = await page.locator('.box-title').evaluateAll((all) =>
        all.map((title) => `${title.textContent}:${getComputedStyle(title).fontSize}`),
      );
      check(
        titles.length === 2 && titles[0].startsWith('Übungen:') && titles[1].startsWith('Kurse:') &&
          titles[0].split(':')[1] === titles[1].split(':')[1],
        `Startseite: «Übungen» und «Kurse» gleich gross (${titles.join(', ')})`,
      );
    }

    // Zusammenstellen: ⚙ → «Zu Kurs hinzufügen», mit den Einstellungen im Blatt.
    await page.goto(exercise('intervalle-bestimmen'), { waitUntil: 'networkidle' });
    await openSettings();
    await page.locator('.sheet button:has-text("Zu Kurs hinzufügen")').click();
    await page.fill('#course-new-title', 'Probekurs');
    await page.locator('.sheet button:has-text("Anlegen")').click();
    check(
      (await page.locator('.course-added').innerText()).includes('«Probekurs»'),
      'eine Übung kommt in einen neuen Kurs',
    );
    await page.locator('.sheet button:has-text("Zu Kurs hinzufügen")').click();
    check(
      await page.locator('.course-choices button', { hasText: 'Probekurs' }).isDisabled(),
      'dieselbe Übung mit denselben Einstellungen ist «schon drin»',
    );
    await closeSettings();

    // Einen Kurs aus einem Link öffnen und durchgehen.
    await page.goto(
      `${BASE}kurs/?titel=Zwei+Schritte&1=intervalle-bestimmen~runde:2&2=gibt-es-nicht&3=noten-benennen~runde:1`,
      { waitUntil: 'networkidle' },
    );
    check((await page.locator('.course-steps li').count()) === 2, 'ein Kurslink zeigt seine Schritte');
    check(
      (await page.locator('.notice').innerText()).includes('gibt es nicht mehr'),
      'eine verschwundene Übung fällt mit Hinweis weg',
    );
    check(!page.url().includes('gibt-es-nicht'), 'die Adresszeile zeigt den Kurs in fester Schreibweise');
    check(await eventually(page, () => document.title.startsWith('Zwei Schritte · Kurs')), 'der Tab nennt den Kurs');
    await page.locator('.course-steps a').first().click();
    await page.waitForSelector('.question');
    check(
      await eventually(page, () => new URL(location.href).searchParams.get('schritt') === '1'),
      'die Übung eines Schritts trägt den Kurs in der Adresse',
    );
    await openSettings();
    check(
      (await page.locator('.sheet .filter-field').count()) === 0 &&
        (await page.locator('.sheet a:has-text("Frei üben")').count()) === 1,
      'im Kurs zeigt ⚙ keine Filter, aber «Frei üben»',
    );
    await closeSettings();
    for (let i = 0; i < 2; i++) {
      await page.locator('.question .choice:not([disabled])').first().click();
      await page.waitForSelector('.verdict');
      await page.locator('.session-bar .primary').click();
    }
    await page.waitForSelector('.round-summary');
    await page.locator('.round-actions button:has-text("Nächste Übung")').click();
    await page.waitForSelector('.question');
    check(
      await eventually(
        page,
        () =>
          location.pathname.endsWith('/ueben/noten-benennen/') &&
          new URL(location.href).searchParams.get('schritt') === '2',
      ),
      '«Nächste Übung» öffnet den nächsten Schritt',
    );
    await page.locator('.session-icon[aria-label="Zurück zum Kurs"]').click();
    await page.waitForSelector('.course-steps');
    check((await page.locator('.course-steps .course-done').count()) === 1, 'eine fertige Runde hakt ihren Schritt ab');
    await page.goto(BASE, { waitUntil: 'networkidle' });
    const courseRows = await page.locator('.course-box a').allInnerTexts();
    check(
      courseRows.some((row) => row.includes('Zwei Schritte') && row.includes('1/2')) &&
        courseRows.some((row) => row.includes('Probekurs')),
      `die Startseite listet die Kurse mit Fortschritt (${courseRows.join(' | ').replace(/\n/g, ' ')})`,
    );

    // ------------------------------------------------- Tonleitern und Tonarten
    console.log('\nTonleitern und Tonarten');
    // Tonleiter notieren: gezogen wird irgendwo im System (hier ganz links,
    // beim Schlüssel), gesetzt in den aktiven Platz, der danach weiterrückt.
    // C-Dur ohne die Oktave am Ende ist richtig.
    await page.goto(exercise('tonleitern-notieren', '?tonleitern=dur&max-vorzeichen=0'), { waitUntil: 'networkidle' });
    await page.waitForSelector('.slot-button.is-active');
    check((await page.locator('.slot-button.is-active').innerText()) === '2', 'Tonleiter notieren: Platz 2 ist zuerst aktiv');
    const stave = await page.locator('.score-click-area svg .vf-stave').first().boundingBox();
    const halfSpace = stave.height / 8;
    for (let step = 0; step < 6; step++) {
      await page.mouse.click(stave.x + 15, stave.y + stave.height + halfSpace - step * halfSpace);
      await page.waitForTimeout(80);
    }
    check(
      /d1, e1, f1, g1, a1, h1/.test(await page.locator('.input-summary').innerText()) &&
        (await page.locator('.slot-button.is-active').innerText()) === '8',
      `neben den Noten gezogen, landet jeder Ton im aktiven Platz, der weiterrückt («${await page.locator('.input-summary').innerText()}»)`,
    );
    await page.locator('.slot-button', { hasText: '3' }).click();
    check((await page.locator('.slot-button.is-active').innerText()) === '3', 'eine Nummer antippen wählt den Platz');
    await checkButton.click();
    await page.waitForSelector('.verdict');
    check(
      (await page.locator('.verdict-text').innerText()) === 'Richtig' && (await page.locator('.score-solution').count()) === 0,
      'ohne die Oktave am Ende: Richtig',
    );
    await page.screenshot({ path: join(SHOTS, 'tonleitern-notieren-plaetze.png') });

    // ------------------------------------------------- Generiertes Melodiediktat
    // D-Dur, der erste Ton a², dann g² fis² e² fis² …: die Tonart gilt beim
    // Setzen. Auf der obersten Linie gesetzt, steht fis²; ein gewähltes ♮ gilt
    // nur für einen Ton, ein zweiter Druck nimmt es wieder weg.
    console.log('\nGeneriertes Melodiediktat');
    await page.goto(exercise('generiertes-melodiediktat', '?tonleitern=dur&max-vorzeichen=2&aufgabe=2&v=1'), {
      waitUntil: 'networkidle',
    });
    await page.waitForSelector('.slot-button.is-active');
    check((await page.locator('.question-notation .task-prompt').innerText()) === 'D-Dur', 'nennt die Tonart');
    check((await page.locator('.slot-button').count()) === 7, 'ein leerer Platz je Ton nach dem ersten');
    const dictation = await page.locator('.score-click-area svg .vf-stave').first().boundingBox();
    const dictationHalf = dictation.height / 8;
    const natural = page.locator('.notation-input .toolbar .tool[aria-label="Auflösungszeichen"]');
    const dictationSummary = () => page.locator('.input-summary').innerText();
    const placeAt = async (steps) => {
      await page.mouse.click(dictation.x + 15, dictation.y - steps * dictationHalf);
      await page.waitForTimeout(80);
    };
    await placeAt(1);
    await placeAt(0);
    check(/g2, fis2$/.test(await dictationSummary()), `auf der F-Linie steht in D-Dur fis («${await dictationSummary()}»)`);
    await natural.click();
    check((await natural.getAttribute('aria-pressed')) === 'true', '♮ gewählt für den nächsten Ton');
    await placeAt(0);
    check((await natural.getAttribute('aria-pressed')) === 'false', 'nach dem Setzen ist ♮ wieder ab');
    await placeAt(0);
    check(/g2, fis2, f2, fis2$/.test(await dictationSummary()), `♮ galt nur für einen Ton («${await dictationSummary()}»)`);
    await page.locator('.slot-button', { hasText: '4' }).click();
    check((await natural.getAttribute('aria-pressed')) === 'true', 'der Platz mit f zeigt sein ♮');
    await natural.click();
    check(/g2, fis2, fis2, fis2$/.test(await dictationSummary()), `ein zweiter Druck nimmt das ♮ weg («${await dictationSummary()}»)`);
    await checkButton.click();
    await page.waitForSelector('.verdict');
    const dictationColours = await eventually(page, () => {
      const html = document.querySelector('.score-click-area svg')?.outerHTML ?? '';
      return html.includes('#00d903') && html.includes('#b3261e');
    });
    check(
      dictationColours && (await page.locator('.score-solution').count()) === 1,
      'geprüft: richtige Töne grün, falsche rot, die Melodie grün darunter',
    );
    await page.screenshot({ path: join(SHOTS, 'melodiediktat-generiert.png') });

    // ------------------------------------------ Gehörte Melodie auf Klaviatur
    // Dieselbe Melodie auf der Klaviatur c¹ bis h², a² blau markiert. Jede
    // Taste füllt den nächsten Platz; sind alle voll, klingt sie nur noch.
    console.log('\nGehörte Melodie auf Klaviatur spielen');
    await page.goto(exercise('gehoerte-melodie-klaviatur-spielen', '?tonleitern=dur&max-vorzeichen=2&aufgabe=2&v=1'), {
      waitUntil: 'networkidle',
    });
    await page.waitForSelector('.keyboard-task .score svg');
    check((await page.locator('.keyboard-task .task-prompt').innerText()) === 'D-Dur', 'nennt die Tonart');
    check(
      (await page.locator('.question .piano-key[data-state="given"]').getAttribute('data-key')) === '81' &&
        (await page.locator('.question .piano-key').first().getAttribute('data-key')) === '60',
      'Klaviatur ab c¹, die erste Taste a² blau',
    );
    const playedNotes = () => page.locator('.keyboard-task > .score svg .vf-stavenote').count();
    check((await playedNotes()) === 1, 'im System steht zuerst nur der erste Ton');
    // Richtig: g² fis² e²; dann f² statt fis² (falsch), der Rest richtig.
    for (const key of [79, 78, 76, 77, 71, 73, 74]) {
      await page.locator(`.question .piano-key[data-key="${key}"]`).click();
    }
    check((await playedNotes()) === 8, `jede Taste füllt einen Platz (${await playedNotes()} Noten)`);
    await page.locator('.question .piano-key[data-key="60"]').click();
    check((await playedNotes()) === 8, 'alle Plätze voll: eine weitere Taste kommt nicht dazu');
    await checkButton.click();
    await page.waitForSelector('.verdict');
    const keyboardColours = await eventually(page, () => {
      const html = document.querySelector('.keyboard-task > .score svg')?.outerHTML ?? '';
      return html.includes('#00d903') && html.includes('#b3261e');
    });
    check(
      keyboardColours && (await page.locator('.keyboard-task .score-solution').count()) === 1,
      'geprüft: richtige Töne grün, der falsche rot, die Melodie grün darunter',
    );
    check(
      (await page.locator('.question .piano-key[data-state="right"], .question .piano-key[data-state="wrong"]').count()) === 0,
      'die Tasten bleiben ohne Farbe',
    );
    await page.screenshot({ path: join(SHOTS, 'melodie-klaviatur.png') });

    // Quer auf dem Telefon: Tonart und Abspielknopf in einer Zeile, damit das
    // System lesbar bleibt; die Klaviatur ganz im Bild, über der Leiste.
    const melodyQuer = await browser.newPage({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
    await melodyQuer.goto(exercise('gehoerte-melodie-klaviatur-spielen', '?tonleitern=dur&max-vorzeichen=2&aufgabe=2&v=1'), {
      waitUntil: 'networkidle',
    });
    await melodyQuer.waitForSelector('.keyboard-task .score svg');
    await melodyQuer.waitForTimeout(300);
    const [quStaffBox, quPianoBox, quPromptBox, quPlayerBox, quBarBox] = await Promise.all(
      ['.keyboard-task > .score svg', '.question .piano', '.keyboard-task .task-prompt', '.question .audio-player', '.session-bar'].map(
        (selector) => melodyQuer.locator(selector).first().boundingBox(),
      ),
    );
    const middle = (box) => box.y + box.height / 2;
    check(
      Math.abs(middle(quPromptBox) - middle(quPlayerBox)) < 20 &&
        quStaffBox.height >= 60 &&
        quPianoBox.x >= 0 &&
        quPianoBox.x + quPianoBox.width <= 844 &&
        quPianoBox.y + quPianoBox.height <= quBarBox.y + 1,
      `quer: Tonart neben dem Abspielknopf, System ${Math.round(quStaffBox.height)} px hoch, Klaviatur ganz im Bild`,
    );
    await melodyQuer.screenshot({ path: join(SHOTS, 'melodie-klaviatur-quer.png') });
    await melodyQuer.close();

    // Vorzeichen setzen: das fis im untersten Zwischenraum ist richtig, aber
    // üblich steht es oben. Bernsteinfarben daneben, mit einer Zeile.
    await page.goto(exercise('vorzeichen-setzen', '?max-vorzeichen=1&art=kreuz'), { waitUntil: 'networkidle' });
    await page.waitForSelector('.notation-input .score svg');
    const keyStave = await page.locator('.score-click-area svg .vf-stave').first().boundingBox();
    await page.mouse.click(keyStave.x + keyStave.width * 0.35, keyStave.y + keyStave.height - keyStave.height / 8);
    await checkButton.click();
    await page.waitForSelector('.verdict');
    // VexFlow zeichnet nach dem Prüfen neu — darauf warten.
    const amber = await eventually(page, () => document.querySelector('.score-click-area svg')?.outerHTML.includes('#e09a00'));
    check(
      (await page.locator('.verdict-text').innerText()) === 'Richtig' &&
        (await page.locator('.input-summary.is-usual').innerText()) === 'Andere Platzierung üblich' &&
        amber,
      'Vorzeichen in anderer Oktave: Richtig, die übliche Platzierung bernsteinfarben daneben',
    );
    await page.screenshot({ path: join(SHOTS, 'vorzeichen-andere-oktave.png') });

    // Quer auf dem Telefon: Aufgabe und Werkzeugleiste in einer Zeile, das
    // System ganz über der Leiste unten.
    const phoneQuer = await browser.newPage({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
    for (const mode of ['noten-schreiben', 'intervalle-notieren', 'vorzeichen-setzen', 'tonleitern-notieren']) {
      await phoneQuer.goto(exercise(mode), { waitUntil: 'networkidle' });
      await phoneQuer.waitForSelector('.notation-input .score svg');
      await phoneQuer.waitForTimeout(200);
      const [staff, bar, prompt, toolbar] = await Promise.all(
        ['.score-click-area svg', '.session-bar', '.question-notation .task-prompt', '.notation-input .toolbar'].map((selector) =>
          phoneQuer.locator(selector).first().boundingBox(),
        ),
      );
      check(
        staff.y + staff.height <= bar.y + 1 && Math.abs(prompt.y + prompt.height / 2 - (toolbar.y + toolbar.height / 2)) < 20,
        `quer: ${mode} passt über die Leiste, Aufgabe neben der Werkzeugleiste`,
      );
    }
    await phoneQuer.close();

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

  // ---------------------------------------------------------- Mikrofon
  // Eigener Browser: Chromium liest eine WAV-Datei als Mikrofon. 196 Hz mit
  // Obertönen = g (kleines g), ähnlich obertonreich wie eine Stimme — und so
  // leise, wie ein iPhone das Mikrofon liefert. Die Prüfung des Werkzeugs
  // «Tonhöhe anzeigen» ruht, solange es zurückgestellt ist (2026-11-25).
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
    const micProblems = [];

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
    const solutionButton = singPage.locator('.sing-task .play-button');
    check(
      (await solutionButton.getAttribute('aria-label')) === 'Lösung abspielen',
      'nach dem Urteil spielt «Abspielen» die Lösung',
    );
    await solutionButton.click();
    check(
      await eventually(singPage, () => document.querySelector('.sing-task .play-button')?.getAttribute('aria-label') === 'Lösung läuft'),
      'und sie läuft',
    );

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
    //  - G-Dur, g h d: das g ist der vorgespielte Ton, mitgesungen; dann
    //    wartet die Übung auf h;
    //  - E-Dur, e gis h: das e darf man weglassen, aber das g ist nicht gis —
    //    es steht rot an seinem Platz, und die Übung wartet weiter auf gis.
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
        () => document.querySelector('.sing-status')?.textContent?.includes('Ausgangston erkannt'),
        null,
        { timeout: 12_000 },
      );
      counted = 'Ausgangston erkannt.';
    } catch {
      counted = await singPage.locator('.sing-status').innerText();
    }
    check(counted === 'Ausgangston erkannt.', `das g ist der vorgespielte Ton, mitgesungen («${counted}»)`);
    // VexFlow zeichnet nach dem Zählen neu — darauf warten.
    await eventually(singPage, () => {
      const notes = [...document.querySelectorAll('.sing-task .score svg .vf-stavenote')];
      return notes.length === 1 && notes[0].outerHTML.includes('#00d903');
    });
    const progressStaff = await staffColours();
    check(
      progressStaff.join(' ') === 'green',
      `der gesungene Ton wird im System grün, die Plätze der übrigen bleiben frei (${progressStaff.join(', ')})`,
    );
    const progressWidth = await singPage.locator('.sing-task .score svg').evaluate((svg) => svg.getAttribute('viewBox'));
    await singPage.waitForTimeout(1500);
    check((await singPage.locator('.verdict').count()) === 0, 'das g noch einmal ist kein Fehler: sie wartet auf den nächsten Ton');
    check(
      (await singPage.locator('.sing-task .score svg').evaluate((svg) => svg.getAttribute('viewBox'))) === progressWidth,
      'das System bleibt gleich breit',
    );
    await singPage.screenshot({ path: join(SHOTS, 'dreiklaenge-singen-zaehlt.png') });

    await singPage.goto(`${BASE}ueben/dreiklaenge-singen/?geschlechter=dur&vorzeichen=stammton&aufgabe=2&v=1`, {
      waitUntil: 'networkidle',
    });
    await singPage.locator('.sing-mic button').click();
    let missed = '';
    try {
      await singPage.waitForFunction(
        () => document.querySelector('.sing-status')?.textContent?.includes('daneben'),
        null,
        { timeout: 12_000 },
      );
      missed = await singPage.locator('.sing-status').innerText();
    } catch {
      missed = '';
    }
    await eventually(singPage, () =>
      [...document.querySelectorAll('.sing-task .score svg .vf-stavenote')].some((note) => note.outerHTML.includes('#b3261e')),
    );
    const chordStaff = await staffColours();
    await singPage.waitForTimeout(1500);
    check(
      missed !== '' && (await singPage.locator('.verdict').count()) === 0 && chordStaff.join(' ') === 'black red',
      `E-Dur mit g begonnen: das g rot an seinem Platz, kein Urteil, es geht weiter (${chordStaff.join(', ')}; «${missed}»)`,
    );
    await singPage.screenshot({ path: join(SHOTS, 'dreiklaenge-singen-falsch.png') });

    // Tonleitern singen mit Metronom: G-Dur aufwärts (feste Aufgabe), nach
    // dem g wird eingezählt, dann ist auf jeden Schlag ein Ton dran. Das g
    // passt nur auf den ersten und letzten — die Zeit wartet nicht, die
    // Aufgabe endet nach acht Schlägen mit «Falsch», und die ganze Leiter
    // steht grün in einem zweiten System darunter.
    console.log('\nTonleitern singen mit Metronom');
    await singPage.goto(
      `${BASE}ueben/tonleitern-singen/?tonleitern=dur&max-vorzeichen=1&metronom=100&aufgabe=5&v=1`,
      { waitUntil: 'networkidle' },
    );
    check((await singPage.locator('.sing-task .task-prompt').innerText()) === 'G-Dur aufwärts', 'nennt die Tonleiter');
    await singPage.locator('.sing-mic button').click();
    let counting = '';
    try {
      await singPage.waitForFunction(() => document.querySelector('.sing-status')?.textContent?.startsWith('Einzählen'), null, {
        timeout: 8000,
      });
      counting = await singPage.locator('.sing-status').innerText();
    } catch {
      counting = '';
    }
    check(counting !== '', `nach dem Grundton wird eingezählt («${counting}»)`);
    await singPage.waitForSelector('.verdict', { timeout: 15_000 });
    const solutionNotes = await singPage
      .locator('.sing-task .score-solution svg .vf-stavenote')
      .evaluateAll((notes) => notes.filter((note) => note.outerHTML.includes('#00d903')).length);
    check(
      (await singPage.locator('.verdict-text').innerText()) === 'Falsch' && solutionNotes === 8,
      `nach acht Schlägen: Falsch, die Leiter grün darunter (${solutionNotes} Töne)`,
    );
    await singPage.screenshot({ path: join(SHOTS, 'tonleitern-singen-metronom.png') });

    // Generierte Melodie singen: feste Aufgabe G-Dur g c h e fis g c g, mit
    // der Kadenz davor. Die ganze Melodie steht da, mit den Vorzeichen der
    // Tonart (das fis ohne eigenes ♯); der nächste Ton ist blau. Nach dem
    // gesungenen g ist es grün, das c blau.
    console.log('\nGenerierte Melodie singen');
    const melodyColours = () =>
      singPage.locator('.sing-task .score svg .vf-stavenote').evaluateAll((notes) =>
        notes.map((note) =>
          note.outerHTML.includes('#00d903')
            ? 'green'
            : note.outerHTML.includes('#b3261e')
              ? 'red'
              : note.outerHTML.includes('#1d6fa5')
                ? 'blue'
                : 'black',
        ),
      );
    await singPage.goto(`${BASE}ueben/generierte-melodie-singen/?tonleitern=dur&max-vorzeichen=1&aufgabe=s&v=2`, {
      waitUntil: 'networkidle',
    });
    check((await singPage.locator('.sing-task .task-prompt').innerText()) === 'G-Dur', 'nennt die Tonart');
    const before = await melodyColours();
    check(
      before.join(' ') === 'blue black black black black black black black',
      `alle acht Töne stehen da, der erste blau (${before.join(', ')})`,
    );
    const sharps = await singPage
      .locator('.sing-task .score svg')
      .evaluate((svg) => [...(svg.textContent ?? '')].filter((glyph) => glyph === '').length);
    check(sharps === 1, `nur das ♯ der Tonart, keins vor dem fis (${sharps})`);
    await singPage.locator('.sing-mic button').click();
    let melodyStart = '';
    try {
      await singPage.waitForFunction(
        () => document.querySelector('.sing-status')?.textContent?.includes('Anfangston erkannt'),
        null,
        { timeout: 20_000 },
      );
      melodyStart = 'Anfangston erkannt.';
    } catch {
      melodyStart = await singPage.locator('.sing-status').innerText();
    }
    check(melodyStart === 'Anfangston erkannt.', `nach der Kadenz zählt das g als Anfangston («${melodyStart}»)`);
    await eventually(singPage, () =>
      [...document.querySelectorAll('.sing-task .score svg .vf-stavenote')][0]?.outerHTML.includes('#00d903'),
    );
    const sungFirst = await melodyColours();
    check(
      sungFirst.slice(0, 3).join(' ') === 'green blue black' && (await singPage.locator('.verdict').count()) === 0,
      `das g grün, das c blau, kein Urteil (${sungFirst.join(', ')})`,
    );
    await singPage.screenshot({ path: join(SHOTS, 'melodie-singen-zaehlt.png') });

    // Mit Metronom, vier Töne g a h g, ohne etwas davor: danach Falsch, a und
    // h rot, und jeder Ton ist bewertet. Ob die beiden g grün werden, hängt
    // davon ab, ob das künstliche Mikrofon auf dem Schlag gerade klingt: sein
    // Dauerton setzt zwischendurch aus (gestrichelte Kurve).
    await singPage.goto(
      `${BASE}ueben/generierte-melodie-singen/?tonleitern=dur&max-vorzeichen=1&laenge=4&vorspiel=nichts&metronom=100&aufgabe=a&v=2`,
      { waitUntil: 'networkidle' },
    );
    await singPage.locator('.sing-mic button').click();
    await singPage.waitForSelector('.verdict', { timeout: 15_000 });
    await eventually(singPage, () =>
      [...document.querySelectorAll('.sing-task .score svg .vf-stavenote')].some((note) => note.outerHTML.includes('#b3261e')),
    );
    const timedMelody = await melodyColours();
    check(
      (await singPage.locator('.verdict-text').innerText()) === 'Falsch' &&
        timedMelody.length === 4 &&
        timedMelody[1] === 'red' &&
        timedMelody[2] === 'red' &&
        timedMelody.every((colour) => colour === 'green' || colour === 'red'),
      `im Tempo: Falsch, a und h rot, jeder Ton bewertet (${timedMelody.join(', ')})`,
    );
    await singPage.screenshot({ path: join(SHOTS, 'melodie-singen-metronom.png') });

    // ⚙: mit «chromatisch» zeigen Tonumfang und Grösstes Intervall feine
    // Intervalle; die Wahl geht mit (Oktave, Quinte).
    await singPage.goto(`${BASE}ueben/generierte-melodie-singen/`, { waitUntil: 'networkidle' });
    await singPage.locator('.session-settings').click();
    await singPage.waitForSelector('.sheet');
    const melodyField = (label) =>
      singPage
        .locator('.sheet .filter-field')
        .filter({ has: singPage.locator('.filter-label', { hasText: new RegExp(`^${label}$`) }) });
    const melodyChips = (label) => melodyField(label).locator('.filter-chip').allInnerTexts();
    const melodyChosen = async (label) => (await melodyField(label).locator('.filter-chip.is-selected').allInnerTexts()).join();
    const coarseSpan = await melodyChips('Tonumfang');
    check(
      coarseSpan.includes('Terz') && coarseSpan.includes('Gesamte Stimmlage') && !coarseSpan.includes('Tritonus'),
      `ohne chromatisch: grobe Intervalle (${coarseSpan.join(', ')})`,
    );
    await melodyField('Skala').locator('.filter-chip', { hasText: 'chromatisch' }).click();
    const fineSpan = await melodyChips('Tonumfang');
    check(
      fineSpan.includes('Tritonus') && fineSpan.includes('Gesamte Stimmlage') && !fineSpan.includes('Terz'),
      `mit chromatisch: feine Intervalle (${fineSpan.join(', ')})`,
    );
    check(
      (await melodyChosen('Tonumfang')) === 'Oktave' && (await melodyChosen('Grösstes Intervall')) === 'Quinte',
      'die Wahl geht mit: Oktave und Quinte',
    );

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
