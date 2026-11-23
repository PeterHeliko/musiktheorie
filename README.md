# Musiktheorie üben

Musiktheorie im Browser üben: Intervalle, Tonarten, Dreiklänge, Rhythmus und Gehörbildung.
Jede Aufgabe wird neu gewürfelt, jede Übung hat Einstellungen für genau das, woran man
gerade arbeitet — und jede Übung, jede Aufgabe und jede Runde lässt sich als Link teilen.

Eine statische Seite auf GitHub Pages: kein Server, kein Konto, keine Anmeldung.

**https://peterheliko.github.io/musiktheorie/**

Wohin das Projekt will, steht in [`CONCEPT.md`](CONCEPT.md).

---

## Schnellstart

```bash
npm install
npm run dev              # http://localhost:5173/musiktheorie/
```

```bash
npm test                 # Theoriekern, Generatoren, Links, Tonhöhenerkennung
npm run build            # statische Seite nach dist/, eine HTML-Datei je Seite
npm run preview          # dist/ ausliefern wie GitHub Pages
npm run e2e              # gebaute Seite im Browser durchklicken
npm run verify           # alles zusammen
npm run samples          # Klaviertöne neu rendern — braucht MuseScore und ffmpeg
```

Die Klaviertöne in `public/samples/` gehören ins Repository; ohne MuseScore lässt sich die
Seite trotzdem bauen.

---

## Veröffentlichen

Jeder Push auf `main` läuft durch `.github/workflows/deploy.yml`: Tests, Build,
Browserprüfung — und nur wenn alles besteht, geht die Seite online.

Einmalig im Repository: **Settings → Pages → Source: «GitHub Actions»**.

Mit eigener Domain später: `BASE_PATH=/` und `SITE_ORIGIN=https://…` als Umgebungsvariablen
für Build und Browserprüfung in der Workflow-Datei setzen. Achtung: auf einer neuen Domain ist der gespeicherte
Fortschritt aller Besucher leer — der Umzugsplan steht in `CONCEPT.md` §7.

---

## Links

Die Adresszeile zeigt immer den ganzen Zustand einer Übung. Wer sie kopiert, teilt genau
das; der Knopf «Teilen» bietet die beiden üblichen Fälle an.

```
/ueben/intervalle-hoeren/                                  Übung mit Vorgaben
/ueben/intervalle-hoeren/?intervalle=k3,g3&richtung=ab     eigene Einstellungen, neue Aufgaben
/ueben/intervalle-hoeren/?intervalle=k3,g3&aufgabe=9ix&v=1 genau diese Aufgabe
/ueben/stufen-bestimmen/?runde=10&aufgabe=2k9f&v=1         genau diese Runde
```

Regeln, damit geteilte Links lange halten (Einzelheiten in `src/links.ts`):

- **Kennungen und Parameternamen sind öffentlich.** Übungs-IDs (`intervalle-hoeren`) und
  die deutschen Parameternamen in `PARAM_NAMES` nach dem Start nicht mehr umbenennen.
- **Neue Filter brauchen einen deutschen Namen** in `PARAM_NAMES`. Ein Test schlägt fehl,
  solange er fehlt.
- **Wer an einem Generator etwas ändert, das bei gleichem Startwert eine andere Aufgabe
  ergibt, zählt dessen `version` hoch.** Alte Aufgabenlinks sagen dann ehrlich, dass es
  ihre Aufgabe nicht mehr gibt, statt still eine andere zu zeigen.
- Kaputte oder veraltete Werte fallen still auf die Vorgabe zurück — ein alter Link
  öffnet immer eine Übung.

---

## Wie es funktioniert

```
Link / Speicher / Filterformular
        │
        ▼
   Filterwerte ─▶ Generator ─▶ Question { task, audio? } ─▶ Ansicht ─▶ scoreTask ─▶ Rückmeldung
                    (Thema × Fertigkeit)
```

- **Ein Generator je Übung** (`src/generators/`). Er würfelt aus Filterwerten und einem
  Startwert eine Aufgabe und **rechnet seine Lösung mit dem Theoriekern nach**, bevor er
  sie ausliefert. Lieber werfen als Falsches beibringen.
- **Eine neue Übung** ist eine Datei in `src/generators/` plus ein Eintrag in
  `src/generators/index.ts`. Formular, Bewertung, eigene Seite, Link und Vorschau kommen
  von selbst.
- **Eine HTML-Datei je Seite.** Vite baut eine `index.html`; `scripts/write-pages.ts`
  schreibt daraus für jede Seite in `src/pages.ts` eine Kopie mit eigenem Titel und
  Vorschau-Angaben. GitHub Pages kennt keine Umleitung auf eine einzige Seite, und Chats
  führen für die Vorschau kein JavaScript aus.
- **Seitenwechsel ohne Neuladen** (`src/router.ts`). Interne Links werden abgefangen. So
  bleiben Audiokontext und Mikrofon offen, und Safari fragt nicht bei jeder Seite neu nach
  dem Mikrofon.
- **Notensatz nur, wo er gebraucht wird.** Die Übungsansicht samt VexFlow (gut 400 kB
  komprimiert) lädt erst, wenn eine Übung offen ist. Startseite und Tonhöhe kommen mit
  rund 30 kB aus.

### Tonhöhe (Versuch)

`/werkzeuge/tonhoehe/` zeigt den gesungenen Ton, die Abweichung in Cent und eine
Tonhöhenkurve. Die Seite ist zugleich der Versuch aus Phase 0: **trägt die Erkennung auf
echten Geräten?** Unter «Technische Angaben» steht, was der Browser eingestellt hat und
wie lange die Auswertung dauert.

- Erkennung: YIN-Verfahren in `src/sing/pitch.ts`, ohne Abhängigkeiten, getestet mit
  künstlichen Signalen vom tiefen E bis c³.
- Mikrofon ohne Echo-, Rausch- und Pegelaufbereitung — alle drei verfälschen gesungene
  Töne.
- Der Ton wird nur im Browser ausgewertet; nichts wird aufgenommen oder verschickt.
- Die Browserprüfung spielt Chromium eine WAV-Datei als Mikrofon vor und erwartet das
  richtige «g».

---

## Aufbau

```
src/
  generators/      je Übung eine Datei; types.ts = Bauplan, Themen, Fertigkeiten
  links.ts         Übungszustand ↔ Adresszeile
  pages.ts         alle Seiten mit Titel und Beschreibung
  router.ts        Seitenwechsel ohne Neuladen
  sing/            Mikrofon, Tonhöhenerkennung, Tonnamen
  audio/           Klavier-Abspieler (Web Audio, Samples)
  music/           Theoriekern, Notensatz (VexFlow), Noteneingabe
  content/         Datenmodell der Aufgaben, Auswahllisten
  scoring/         Bewertung
  ui/              Seiten und Bausteine
scripts/
  write-pages.ts   eine HTML-Datei je Seite (Teil von npm run build)
  serve.mjs        dist/ ausliefern wie GitHub Pages
  e2e.mjs          Browserprüfung
  generate-samples.ts
public/samples/    Klaviertöne C2–C6
```

### Schreibweisen

- Tonnamen C D E F G A H, B ist das erniedrigte H. Im Code wissenschaftlich: `a4` = a¹ =
  440 Hz, `hes4` für B — nie `b4`.
- Schweizer Rechtschreibung: «ss», nie «ß».

### Herkunft

Der Kern (Theorie, Notensatz, Noteneingabe, Generatoren, Bewertung) stammt aus den
Nachbarprojekten `training` und `musiktheorie-scorm` und wird hier eigenständig
weitergeführt. Es gibt keinen Abgleich mehr mit den Originalen.
