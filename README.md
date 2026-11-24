# Übungen Musiktheorie

Musiktheorie im Browser üben: Töne und Noten, Intervalle, Tonarten, Dreiklänge, Septakkorde,
Rhythmus und Gehörbildung.
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

Jeder Push auf `main` läuft durch `.github/workflows/deploy.yml`: Tests und Build — wenn
beides besteht, geht die Seite online. Die Browserprüfung läuft dort vorerst nicht (schneller
während der Entwicklung); vor dem Push deshalb lokal `npm run verify`.

Einmalig im Repository: **Settings → Pages → Source: «GitHub Actions»**.

Mit eigener Domain später: `BASE_PATH=/` und `SITE_ORIGIN=https://…` als Umgebungsvariablen
für Build und Browserprüfung in der Workflow-Datei setzen. Achtung: auf einer neuen Domain ist der gespeicherte
Fortschritt aller Besucher leer — der Umzugsplan steht in `CONCEPT.md` §7.

---

## Links

Die Adresszeile zeigt immer den ganzen Zustand einer Übung. Wer sie kopiert, teilt genau
das; unter ⚙ → «Teilen» stehen die beiden üblichen Fälle zum Kopieren bereit.

```
/ueben/intervalle-hoeren/                                  Übung mit Vorgaben
/ueben/intervalle-hoeren/?intervalle=k3,g3&richtung=ab     eigene Einstellungen, neue Aufgaben
/ueben/intervalle-hoeren/?intervalle=k3,g3&aufgabe=9ix&v=2 genau diese Aufgabe
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

### Aufbau der Oberfläche

- **Auswahl:** Startseite = Themen, ein Thema = seine Übungen (`/ueben/intervalle/`).
  Listen nennen nur Titel, davor ein Zeichen für die Fertigkeit (Notenlinien, Klaviatur, Ohr,
  Mikrofon; `SkillIcon` in `src/ui/icons.tsx`). Was eine Übung verlangt, steht in der Übung.
- **Übung:** bildschirmfüllend, ohne Kopfzeile der Website. Leiste oben (✕ zurück zum
  Thema, Titel, die wievielte Aufgabe bzw. «7/10», ⚙), die Aufgabe, und unten eine feste
  Leiste mit Rückmeldung und Hauptknopf (Prüfen / Weiter).
- **Rückmeldung:** zeigen statt sagen. Die Lösung steht in der Aufgabe selbst — grün
  umrandeter Knopf, grün umrandete Taste, grüne Note im System —, die Leiste unten sagt dann
  nur «✓ Richtig» oder «✗ Falsch» (`showsSolution` in `src/ui/Feedback.tsx`). In Worten
  steht sie nur, wo die Aufgabe sie (noch) nicht zeigt: Auswahllisten, Diktat, Vorzeichen,
  Pausen. Bildschirmleser bekommen sie immer in Worten.
- **Klang nach dem Prüfen:** Bei Intervallen und Akkorden in Noten, beim Notieren und auf der
  Klaviatur erklingt nach dem Prüfen einmal das Gefragte, alle Töne zusammen
  (`Question.afterSound`). Vorher bleibt es still: die Antwort soll gelesen oder abgezählt
  werden, nicht gehört. Einzelne Töne klingen nicht nach.
- **Nie zweimal dieselbe Aufgabe hintereinander** (`src/generators/fresh.ts`): neu gewürfelt
  wird über den Startwert, Runden aus ihrem Startwert — Links bleiben reproduzierbar.
- **⚙ Einstellungen:** Übungsform, Filter, Zurücksetzen, Teilen. Änderungen gelten beim
  Schliessen; ohne Änderung läuft die Aufgabe weiter.

### Klaviatur

`src/ui/PianoKeyboard.tsx` zeichnet eine Klaviatur als Bild oder als Eingabe; was eine Taste
bedeutet, entscheidet die Aufgabe. Tasten sind MIDI-Nummern, ohne Schreibweise
(`src/music/piano.ts`).

- **Benennen** (`SelectTask.keyboard`): markierte Tasten, darunter die gewohnten
  Antwortknöpfe. Stumm bis zum Prüfen.
- **Spielen** (`KeyboardTask`): Antippen wählt eine Taste und lässt sie klingen, «Prüfen»
  gibt sie ab. Falsch gespielt, ist die richtige Taste grün umrandet.
- **Akkord spielen** (`KeyboardTask.chord`): jedes Antippen nimmt eine Taste dazu oder weg.
  Richtig ist jede Lage mit allen Akkordtönen, keinem anderen, und — wo verlangt — dem
  richtigen tiefsten und höchsten Ton (`src/scoring/chord.ts`). Falsch gespielt, ist eine
  richtige Lage in der Nähe grün umrandet (`chordExamples` in `src/music/piano.ts`): alle Töne
  eng, oder — wo eng nicht geht — ein Basston darunter, beim Septakkord vierstimmig.
- Markiert wird mit Füllung: vorgegebene Tasten blau, die gewählte hellblau, nach dem
  Prüfen grün oder rot wie die Antwortknöpfe. Nicht spielbare Tasten (schwarz in der
  Grobbestimmung) sehen aus wie alle anderen.
- Eine Taste klingt beim Niederdrücken, ohne Vorlauf (`player.strike`); die Töne der
  Klaviatur werden beim Öffnen der Aufgabe geladen.
- In der Übung füllt sie den Platz, den die Antworten übrig lassen, wie ein Notenbild mit
  `fit`.

### Noten setzen

`NotationInput.tsx`: gesetzt wird beim Loslassen, bis dahin zeigt eine blaue Vorschau, wo die
Note landet. Wo nur ein Ton zu setzen ist (Noten schreiben, Intervalle notieren), verschwindet
der gesetzte, sobald neu gezogen wird; abgebrochen (Loslassen ausserhalb), steht er wieder da.
Neben den Vorzeichen stehen drei Knöpfe mit Zeichen aus padago: alles löschen, rückgängig,
wiederholen (`EditActions` in `toolbar.tsx`; auch Strg/⌘ + Z, mit Umschalt oder Strg + Y
wiederholen). Rückgängig gilt für jede Änderung, auch fürs Löschen, und endet mit der Aufgabe.

### Akkorde setzen

`NotationTask` im Modus `chord` (`NotationInput.tsx`, `ChordInput`): Antippen setzt einen Ton,
dieselbe Stelle noch einmal nimmt ihn weg (mit anderem Vorzeichen: ändert ihn). Im
Klaviersystem entscheidet die Höhe, welches System gemeint ist; die Töne beider Systeme
gehören zum selben Akkord. Bewertet wird wie beim Akkord auf der Klaviatur, nur zählt hier die
Schreibweise (`src/scoring/chord.ts`). Nach dem Prüfen ist jeder Ton grün oder rot; war der
Akkord falsch, steht eine richtige Lösung grün daneben.

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

### Singen

`/ueben/intervalle-singen/`: ein Ausgangston erklingt und steht im System, dazu das
Intervall. Erst wenn der Ton verklungen ist, hört die Seite zu; die Linie zeigt, was man
singt.

- **Der erste gehaltene Ton entscheidet** (0,8 s ruhig, `src/sing/hold.ts`); kein «Prüfen».
  Mit «Ohne Fehlerurteil» erst der erste richtige: der Zielbereich steht von Anfang an in
  der Kurve, falsche Töne werden dort rot, und man singt weiter, bis man trifft.
- **Den Ausgangston darf man vorher nachsingen** — er zählt nie als Antwort.
- **Die Oktave ist egal**, die Richtung wird deshalb nicht geprüft. Bei der Oktave zählt
  der Abstand zum gespielten oder zum selbst nachgesungenen Ausgangston.
- Diese Regeln stehen nur in `src/sing/judge.ts`; Ansicht und Bewertung nutzen beide sie.
- Nach dem Urteil steht im System neben dem Ausgangston der Zielton grün, ein falscher Ton
  rot davor — in der Oktave, die dem Zielton am nächsten liegt. «Abspielen» spielt dann die
  ganze Lösung: die Töne einzeln, dann zusammen.
- **Stimmlage** (hoch/mittel/tief) ist persönlich: unter ⚙, auf dem Gerät gespeichert, nie
  im Link. Ein Aufgabenlink fragt bei allen dasselbe Intervall, in der eigenen Lage.
- **Schlüssel** ist eine gewöhnliche Einstellung, unabhängig von der Stimmlage. Der
  Ausgangston steht klingend da — tiefe Lage im Violinschlüssel also mit Hilfslinien.
- Die Browserprüfung singt mit dem künstlichen «g» einmal richtig und einmal falsch.

`/ueben/dreiklaenge-singen/` und `/ueben/umkehrungen-singen/`: der tiefste Ton des Akkords
erklingt und steht im System; gesungen wird der Dreiklang von unten nach oben, jeder Ton in
beliebiger Oktave (`judgeSequence` in `src/sing/judge.ts`). Den vorgespielten Ton darf man
mitsingen, muss aber nicht — wie beim Intervall. Einen schon richtig gesungenen Ton
noch einmal zu singen, zählt nicht — auch nicht, wenn er über ein Atemholen hinweg zweimal als
gehalten erkannt wird. Das System hat von Anfang an Platz für alle drei Töne; jeder richtig
gesungene erscheint dort grün, und die Zeile unter der Kurve zählt mit. Der erste falsche Ton
beendet die Aufgabe, ausser mit «Ohne Fehlerurteil».

`/ueben/septakkorde-singen/` und `/ueben/septakkorde-umkehrungen-singen/` gehen genauso, mit
vier Tönen. Ein grosser Durseptakkord umfasst elf Halbtöne und passt nicht in jede Stimmlage;
er ragt dann höchstens zwei Halbtöne hinaus (`SING_REACH`), bei Dreiklängen einen.

### Septakkorde

Wie die Dreiklänge in zwei Gruppen, Grundstellung und Umkehrungen & Lagen
(`src/generators/septakkorde-*.ts`; Notenbild, Grundtöne und Singen teilen sie mit den
Dreiklängen). Entscheide 2026-11-24:

- **Fünf Arten:** Dominantseptakkord, grosser Durseptakkord, kleiner Mollseptakkord,
  halbvermindert, vermindert. Der Theoriekern prüft jede Aufgabe mit `analyseSeventh`.
- **Bezeichnung** unter ⚙: ausgeschriebene Namen («Dominantseptakkord auf G») oder
  Akkordsymbole («G7», «Hm7♭5», «Cis°7») — auf den Knöpfen und in der Aufgabe.
- **Vier Töne eng:** die Lage folgt aus der Umkehrung (Grundstellung = Septlage,
  Quintsextakkord = Oktavlage, Terzquartakkord = Terzlage, Sekundakkord = Quintlage).
- **Basston abgesetzt = vierstimmig:** unten der Basston, darüber die drei übrigen Töne eng,
  jeder Ton einmal. Umkehrung und Lage sind dann frei, nur liegt der Basston nie zugleich oben.
  Notieren und Spielen bleiben frei wie bei den Dreiklängen (Verdopplungen erlaubt).
- **Vermindert** fehlt beim Hören und beim Benennen auf der Klaviatur von Umkehrungen: er teilt
  die Oktave in vier gleiche Teile, seine Umkehrungen klingen und liegen gleich.
- Im Tab heissen die Umkehrungsübungen «… (Septakkorde)» bzw. «… (Dreiklänge)» (`fullTitle`).

---

## Aufbau

```
src/
  generators/      je Übung eine Datei; types.ts = Bauplan, Themen, Fertigkeiten
  links.ts         Übungszustand ↔ Adresszeile
  pages.ts         alle Seiten mit Titel und Beschreibung
  router.ts        Seitenwechsel ohne Neuladen
  sing/            Mikrofon, Tonhöhenerkennung, gehaltene Töne, Bewertung, Stimmlage
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
