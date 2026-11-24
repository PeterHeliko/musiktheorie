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

### Kurse

Ein Kurs ist eine Liste von Übungen mit festen Einstellungen, von irgendwem zusammengestellt
und als Link geteilt (`src/courses.ts`, Entscheide in `CONCEPT.md` §7). Der Link ist der
Kurs — es gibt keine zentrale Fassung:

```
/kurs/?titel=Terzen+und+Sexten
      &1=intervalle-bestimmen~intervalle:k3,g3,k6,g6~runde:10
      &2=intervalle-notieren~intervalle:k3,g3~schluessel:bass~runde:10
```

- Jeder Schritt ist ein Übungslink in einer Zeile: «~» statt «&», «:» statt «=», immer mit
  Rundengrösse. Damit gelten die Regeln oben auch hier.
- Einstellungen, keine Aufgaben: wer den Kurs öffnet, bekommt neue Aufgaben derselben Art.
  Titel höchstens 30 Zeichen, höchstens 30 Schritte.
- **Zusammenstellen:** ⚙ → «Zu Kurs hinzufügen» in einer Übung, mit den Einstellungen im
  Blatt. Bearbeiten auf der Kursseite: Titel, Reihenfolge, Rundengrösse, Schritte entfernen.
- **Auf dem Gerät:** wer einen Kurslink öffnet, hat den Kurs danach unter «Kurse» auf der
  Startseite (`StoredCourse` in `src/settings.ts`), mit erledigten Schritten. Ein Schritt ist
  erledigt, wenn seine Runde fertig ist.
- **Ein Schritt in der Übung** trägt `&kurs=<id>&schritt=<n>` in der Adresse; die Kennung
  gilt nur auf diesem Gerät, anderswo ist es einfach die Übung. Im Kurs zeigt ⚙ keine
  Filter, ✕ führt zum Kurs, und die Auswertung bietet die nächste Übung an.
- Die Linkvorschau kann den Titel nicht zeigen (eine HTML-Datei für alle Kurse); Teilen
  schickt ihn auf dem Telefon als Text mit.

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

- **Auswahl:** Startseite = oben Themen und Werkzeuge, darunter ein eigener Kasten «Kurse»;
  ein Thema = seine Übungen (`/ueben/intervalle/`). `/ueben/` ist nur noch ein anderer Name
  für die Startseite.
- **Wortwahl:** die Oberfläche sagt nie «Runde». Eine feste Zahl Aufgaben ist eine «Übung»
  («Übung à 10», «Übung beendet»), «Neue Runde» heisst «Wiederholen». Im Link bleibt `runde=`.
  Listen nennen nur Titel, davor ein Zeichen für die Fertigkeit (Notenlinien, Klaviatur, Ohr,
  Mikrofon; `SkillIcon` in `src/ui/icons.tsx`). Was eine Übung verlangt, steht in der Übung.
- **Übung:** bildschirmfüllend, ohne Kopfzeile der Website. Leiste oben (✕ zurück zum
  Thema, Titel, die wievielte Aufgabe bzw. «7/10», ⚙), die Aufgabe, und unten eine feste
  Leiste mit Rückmeldung und Hauptknopf (Prüfen / Weiter).
- **Rückmeldung:** zeigen statt sagen. Die Lösung steht in der Aufgabe selbst — grün
  umrandeter Knopf, grün umrandete Taste, grüne Note im System —, die Leiste unten sagt dann
  nur «✓ Richtig» oder «✗ Falsch» (`showsSolution` in `src/ui/Feedback.tsx`). In Worten
  steht sie nur, wo die Aufgabe sie (noch) nicht zeigt: Auswahllisten, Diktat, Pausen.
  Bildschirmleser bekommen sie immer in Worten.
- **Klang nach dem Prüfen:** Bei Intervallen und Akkorden in Noten, beim Notieren und auf der
  Klaviatur erklingt nach dem Prüfen einmal das Gefragte, alle Töne zusammen
  (`Question.afterSound`). Vorher bleibt es still: die Antwort soll gelesen oder abgezählt
  werden, nicht gehört. Einzelne Töne klingen nicht nach. War eine geschriebene oder gespielte
  Antwort richtig, klingt sie selbst — in der Oktave und Lage, in der sie gesetzt oder gespielt
  wurde (`answeredTones` in `src/scoring/index.ts`); sonst die Lösung des Generators.
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
  `fit`. Wird die Höhe knapp (quer auf dem Telefon), nimmt sie die ganze Spalte in der Breite
  und wird niedriger statt schmaler: breite Tasten treffen sich besser.

### Noten setzen

`NotationInput.tsx`: gesetzt wird beim Loslassen, bis dahin zeigt eine blaue Vorschau, wo die
Note landet. Wo nur ein Ton zu setzen ist (Noten schreiben, Intervalle notieren), verschwindet
der gesetzte, sobald neu gezogen wird; abgebrochen (Loslassen ausserhalb), steht er wieder da.
Neben den Vorzeichen stehen drei Knöpfe mit Zeichen aus padago: alles löschen, rückgängig,
wiederholen (`EditActions` in `toolbar.tsx`; auch Strg/⌘ + Z, mit Umschalt oder Strg + Y
wiederholen). Rückgängig gilt für jede Änderung, auch fürs Löschen, und endet mit der Aufgabe.

**Vorzeichen setzen** geht gleich: ♭ und ♯ wählen die Art (wechseln ändert alle gesetzten
Zeichen mit), gesetzt wird beim Loslassen, dieselbe Stelle noch einmal nimmt ein Zeichen weg.
Nach dem Prüfen ist jedes Zeichen grün oder rot — richtig ist es, wenn es an seiner Stelle in
der Reihenfolge der richtige Stammton ist, die Oktave zählt nicht. War der Satz falsch, steht
der richtige grün daneben (`keySignaturePitches`). Stimmt der Satz, steht aber nicht ganz an
den üblichen Stellen (eine andere Oktave), bleibt es «Richtig»; die übliche Platzierung steht
dann bernsteinfarben daneben, darunter «Andere Platzierung üblich». Sind es die richtigen
Vorzeichen, nur in anderer Reihenfolge, ist es «Falsch»; der richtige Satz steht dann
bernsteinfarben daneben, darunter «Falsche Reihenfolge». Ohne Vorzeichen (C-Dur, a-Moll) lässt
sich das leere System gleich prüfen.

**Quer auf dem Telefon** (Entscheid 2026-11-24): jedes Eingabe-System passt sich dem Platz an
(`fitted` in `NotationInput.tsx`: nie grösser als gezeichnet, aber nicht unter Massstab 1, im
Klaviersystem 0,75) und steht mittig. Bei den schlanken Eingaben steht die Aufgabe links in der
Zeile der Werkzeugleiste (CSS-Raster, `.question-notation:has(.toolbar-bare)`); das Diktat
bleibt, wie es ist.

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
gesungene erscheint dort grün, und die Zeile unter der Kurve zählt mit. **Ein falscher Ton
beendet die Aufgabe nicht** (Entscheid 2026-11-24): er steht rot an seinem Platz, verlangt
bleibt derselbe Ton, und es geht weiter, bis er kommt — Tonfolgen bauen auf dem vorigen Ton
auf, nach einem Fehler ginge es sonst nur daneben weiter. Zu Ende ist es, wenn alle Töne
richtig gesungen sind; dann steht vor jedem Ton, der zuerst falsch kam, der falsche rot, und
das Urteil ist «Falsch». «Ohne Fehlerurteil» gibt es deshalb nur beim Intervall.

**Metronom** (alle Tonfolgen, Einstellung 60/80/100, aus als Vorgabe; `SingTask.tempo`):
nach dem ersten Ton zählen vier Schläge ein, dann ist auf jeden Schlag ein Ton der Folge dran,
der erste eingeschlossen. Jeder Schlag wird für sich bewertet, nach dem Median der Tonhöhe in
seiner Mitte (`beatPitch`, `judgeTimed`); die Zeit wartet nicht — ein falscher oder stummer
Schlag bleibt falsch, und der nächste ist dran. Die Kurve färbt jeden Schlag, die Zeile darunter
zählt ein und mit. Wann der erste Schlag zu hören ist, meldet der Abspieler (`onStart`, samt
Ausgabeverzögerung).

`/ueben/septakkorde-singen/` und `/ueben/septakkorde-umkehrungen-singen/` gehen genauso, mit
vier Tönen. Ein grosser Durseptakkord umfasst elf Halbtöne und passt nicht in jede Stimmlage;
er ragt dann höchstens zwei Halbtöne hinaus (`SING_REACH`), bei Dreiklängen einen.

### Septakkorde

Wie die Dreiklänge in zwei Gruppen, Grundstellung und Umkehrungen & Lagen
(`src/generators/septakkorde-*.ts`; Notenbild, Grundtöne und Singen teilen sie mit den
Dreiklängen). Entscheide 2026-11-24:

- **Fünf Arten:** Dominantseptakkord, grosser Durseptakkord, kleiner Mollseptakkord,
  halbvermindert, vermindert. Der Theoriekern prüft jede Aufgabe mit `analyseSeventh`.
- **Bezeichnung** unter ⚙: Akkordsymbole («G7», «Hm7♭5», «Cis°7», Vorgabe) oder
  ausgeschriebene Namen («Dominantseptakkord auf G») — auf den Knöpfen und in der Aufgabe.
- **Vier Töne eng:** die Lage folgt aus der Umkehrung (Grundstellung = Septlage,
  Quintsextakkord = Oktavlage, Terzquartakkord = Terzlage, Sekundakkord = Quintlage).
- **Basston abgesetzt = vierstimmig:** unten der Basston, darüber die drei übrigen Töne eng,
  jeder Ton einmal. Umkehrung und Lage sind dann frei, nur liegt der Basston nie zugleich oben.
  Notieren und Spielen bleiben frei wie bei den Dreiklängen (Verdopplungen erlaubt).
- **Vermindert** fehlt beim Hören und beim Benennen auf der Klaviatur von Umkehrungen: er teilt
  die Oktave in vier gleiche Teile, seine Umkehrungen klingen und liegen gleich.
- Im Tab heissen die Umkehrungsübungen «… (Septakkorde)» bzw. «… (Dreiklänge)» (`fullTitle`).

### Tonleitern und Tonarten

Die Tonleitern stehen in `src/music/scales.ts`, alle Übungen nehmen sie von dort
(Entscheide 2026-11-24):

- **Neun Arten:** Dur, Moll natürlich, harmonisch, melodisch und die Kirchentonarten dorisch,
  phrygisch, lydisch, mixolydisch, lokrisch (ionisch und äolisch sind Dur und Moll natürlich).
  Die Kirchentonarten sind überall zuschaltbar, aber aus.
- **Melodisch Moll abwärts ist natürlich** — im Notenbild wie im Klang. Beim Hören abwärts
  zählen deshalb beide Antworten.
- **«Höchstens n Vorzeichen»** meint die Tonart: bei Moll die der natürlichen Form, bei den
  Kirchentonarten die der Durtonart, aus der sie stammen (G-dorisch: ein ♭). Grundtöne, deren
  Leiter ein Doppelvorzeichen bräuchte, fallen weg (gis-Moll harmonisch).
- Aufgaben heissen «Es-Dur aufwärts», «c-Moll harmonisch abwärts», «D-dorisch aufwärts».

- **Tonleitern notieren:** der Grundton steht da (abwärts der obere), die übrigen sieben Töne
  werden gesetzt, jeder an seinem Platz — Vorzeichen vor den Noten, ohne Tonartvorzeichen.
  Ein Platz ist aktiv (seine Nummer unter dem System blau): gezogen wird irgendwo im System,
  gesetzt in den aktiven Platz. So lässt sich neben der Note ziehen, und der Finger verdeckt sie
  nicht. Danach rückt er zum nächsten leeren; die Nummern wählen ihn von Hand, ♭ ♮ ♯ ändern den
  Ton darin (Tastatur: ← → wechseln den Platz). Rückgängig setzt den aktiven Platz dorthin,
  wo sich etwas geändert hat; wiederholt rückt er weiter wie beim Setzen. Jeder Ton zählt einzeln. Nach dem Prüfen sind
  die eigenen Töne grün oder rot, und war nicht alles richtig, steht die ganze Leiter grün in
  einem zweiten System darunter, Ton unter Ton. Quer passt sich das System der Höhe an
  (`fit` mit `minScale`: kleiner nicht, sonst trifft man keine Linie).
- **Die Oktave am Ende ist freigestellt** (Entscheid 2026-11-24) beim Notieren (der letzte
  Platz darf leer bleiben, `PitchSlotSolution.optional`), auf der Klaviatur
  (`KeyboardTask.optional`) und beim Singen (nach dem siebten Ton wartet die Aufgabe kurz:
  zwei Sekunden, und erst wenn nicht mehr gesungen wird; im Tempo darf der achte Schlag stumm
  bleiben, `SingTask.optionalLast`). Steht sie da, muss sie stimmen.
- **Tonleitern auf Klaviatur markieren** (`KeyboardTask.scale`): der Grundton ist blau, die
  übrigen Töne bis zur Oktave werden angetippt (dazu oder weg, sie klingen); den Grundton
  tippt man nicht an. Richtig ist genau diese Menge, die Reihenfolge zählt nicht. Nach dem
  Prüfen ist jede getippte Taste grün oder rot, jede fehlende grün umrandet.
- **Tonleitern singen:** wie Dreiklänge singen, mit acht Tönen; abwärts ab dem oberen
  Grundton. Ein Ton zählt schon nach 0,5 s statt 0,8 s (`SingTask.holdMs`). Nach dem Urteil stehen die eigenen Töne an ihren Plätzen (grün, oder der falsche
  rot) und die ganze Leiter grün darunter; «Abspielen» spielt sie ohne Zusammenklang
  (`SingTask.melodic`).
- **Tonarten den Vorzeichen zuordnen:** je gefragte Tonart ein Tonnamen-Raster wie bei den
  Tönen (eine Spalte je Stammton, ♯ oben, ♭ unten), auf den Knöpfen nur der Grundton — Dur
  gross, Moll klein. «Gefragt ist» stellt Dur, Moll oder beide ein. Ist die Spalte breit
  (quer, Rechner), stehen beide Raster nebeneinander, mit kleineren Knöpfen; das Notenbild
  nimmt den übrigen Platz (`fit`).
- **Tonleitern hörend erkennen:** Tempo einstellbar (60 bis 160), Vorgabe 96.

---

## Aufbau

```
src/
  generators/      je Übung eine Datei; types.ts = Bauplan, Themen, Fertigkeiten
  links.ts         Übungszustand ↔ Adresszeile
  courses.ts       Kurse ↔ Kurslinks
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
