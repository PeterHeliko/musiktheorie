# Concept — Übungen Musiktheorie

Draft for discussion · revision 3 · 2026-11-23

A free, German-language site for music-theory exercises in the browser, hosted on GitHub
Pages with no server. Goal: what musicca.com does well, plus writing, singing, and a
shareable link for every exercise.

---

## 0. Decisions so far

| Topic                 | Decision                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| Spelling              | Swiss: «ss», never «ß» («gross», «übermässig»)                                                    |
| Depth                 | Basics, up to triads and Stufen. Deeper topics are listed under «Später» and not planned yet.      |
| `training`            | Retired and left as it is. Its core is copied into this repo once; no drift check.                 |
| Hosting               | `peterheliko.github.io/musiktheorie/` (repo `PeterHeliko/musiktheorie`) for now, own domain later (migration plan in §7) |
| Einstufungstest       | No dedicated course                                                                               |
| Learners              | **No control features.** No teacher dashboards, result codes or monitoring of any kind.            |
| Sharing               | **Every possible exercise state is a link** (§7)                                                   |
| Singing               | **Included.** The site listens and judges sung pitch: notes, intervals, chords, melodies (§6)      |
| Site framework        | **B**: Vite + Preact single-page app, plus one generated HTML file per route (§9)                 |
| Visual style          | As simple as possible, "zero nonsense". The current plain look stays. Design changes only after the user has chosen between options. |
| Choosing exercises    | Topics → exercises (`/ueben/<thema>/`) now. A topic may split its list under subheadings (Intervalle: Grobbestimmung, Feinbestimmung). When the Lernpfad exists, the start page leads with it, with the topics underneath. Lists show full titles only. |
| Exercise view         | Full-screen session without site chrome: slim top bar (✕, title, task count or «7/10» in a round, ⚙), the task, and a **fixed bottom bar** with the verdict and the main button. Round mode, filters and sharing live in a settings sheet behind ⚙; the exercise starts immediately with the last settings. |
| Sound after checking  | Intervals and triads where hearing isn't the exercise (in Noten, notieren, Klaviatur): after checking, the asked interval/chord sounds once, all tones together. Silent before, so the answer is read or counted, not heard. Not for single notes. (2026-11-24) |
| No repeats            | Never the same question twice in a row, in any exercise; re-drawn via the seed, so task and round links stay reproducible (2026-11-24) |
| Feedback              | **Show, don't say.** The task shows the solution itself: outlined answer button, outlined key, green note in the staff (beside a wrong one). The bottom bar then says only «✓ Richtig» / «✗ Falsch». Words only where the task can't show it yet; screen readers always get words. |

---

## 1. Starting point

### What musicca does

Exercise areas: Töne, Rhythmus, Intervalle, Akkorde, Tonleitern, Tonarten (plus Instrumente
and Genres quizzes).

Its strength is its **shape**. Every topic is a sequence of small steps ("Sekunde und Terz" →
"Quarte und Quinte" → "Zusammenfassung" → …), and each step comes in up to three skills:

| Skill            | What you do                       |
| ---------------- | --------------------------------- |
| **Klavier**      | find it on a keyboard                                                              |
| **Noten**        | read it from the staff, and in later levels write it                               |
| **Gehörbildung** | hear it; for pitch this goes up to short melodies of 3–5 notes                     |

Example of how one step moves from reading to writing (Intervalle → "Sekunde und Terz" →
Noten): "Read minor and major seconds" → "…with accidentals" → "Write minor and major seconds
with accidentals" → the same for thirds.

Rhythm uses *Imitation*, *Lesen* and *Gehörbildung*. *Gehörbildung* is rhythm dictation:
listen, then write it down. Each skill of a step is a fixed series of levels with a progress
counter (`0/6`).

Around that: instruments, tools (Metronom, Stimmgerät, Akkord-/Tonleiterfinder,
Quintenzirkel …), a dictionary, and an account-based school/leaderboard section.

**Copy from musicca:** the small steps, the skill grid, the move from reading to writing
within a step, visible progress per step, the keyboard as an answer surface, and the tools as
a reason to come back.

**Where musicca falls short**, checked against its catalog and level descriptions:

- **No singing.** No exercise listens to the learner. Its ear-training page recommends
  singing along, but only as a practice tip.
- **Fixed levels.** Each level has a fixed scope. I found no way to set up your own
  combination, such as "only minor sixths, bass clef, up to two accidentals".
- **Account** needed to save results and track progress.

Not verified: musicca's exercise pages themselves didn't load for me. How answers are entered
in detail, and whether tasks within a level are random, is unchecked.

### What we already have

`training` is **the engine**:

- 13 generated exercises with filters
- notation input in six modes
- piano samples (C2–C6)
- seeded randomness
- generators that check their own answers
- filter-efficacy tests and Playwright e2e

It is static, 2.3 MB in total, of which 820 KB is a single JavaScript file. Its theory core
comes from `musiktheorie-scorm`.

What's missing is musicca's *shape* (guided path, keyboard, tapping, tools), singing, and a
bit of breadth.

---

## 2. Positioning

> **Musiktheorie üben auf Deutsch: unbegrenzt viele Aufgaben, frei einstellbar, mit Singen,
> jede Übung als Link, ohne Konto.**

1. **Unbegrenzt.** Every exercise is generated. No step runs out, and nobody can memorize the answers.
2. **Lesen, Schreiben, Spielen, Hören, Singen.** Every topic in every skill that fits it.
3. **Deutsche Fachsprache.** H/B, C-Dur/a-Moll, Sextakkord/Quartsextakkord, Lagen, Stufen.
4. **Erklärt, nicht nur bewertet.** A wrong answer says *why* ("c–ges: eine Quinte, aber 6
   statt 7 Halbtöne → vermindert"; "zu tief, −35 Cent").
5. **Jede Übung ist ein Link.** The address bar always shows the current exercise. Copying
   it is sharing it.
6. **Kein Konto, keine Werbung, kein Tracking, offline.** Progress stays in the browser.
   Microphone audio never leaves the device.

---

## 3. Core model: Thema × Fertigkeit

Everything hangs off one grid. Rows are topics, columns are skills:

| Fertigkeit    | What the learner does                                     | Input              |
| ------------- | --------------------------------------------------------- | ------------------ |
| **Erkennen**  | a score is shown → name it                                | answer buttons     |
| **Notieren**  | a name is given → write it on the staff                   | notation input     |
| **Klaviatur** | find it on the keys, or name the keys                     | on-screen keyboard |
| **Hören**     | audio plays → name it or write it down                    | buttons / notation |
| **Singen**    | a reference sounds or a score is shown → sing it          | microphone         |
| **Klopfen**   | rhythm only: tap what you see or hear                     | space bar / touch  |

**Each cell is one generator with filters.** That is `training`'s existing contract. Singing
adds one new task kind (§6); the pattern stays the same.

```
 Lernpfad      ── fixed preset ────┐
 Freies Üben   ── own filters ─────┼─▶ Generator ─▶ Question ─▶ view ─▶ scoring ─▶ feedback
 Shared link   ── filters (+seed) ─┘                                            └▶ statistics
```

- **Lernpfad** (musicca's shape): Kurs → Abschnitt → Stufe. A *Stufe* is a generator plus a
  fixed filter preset plus a pass criterion (e.g. "10 tasks, at most 1 mistake"). It's pure
  data, no code, and it has its own link. Nothing is locked: there's a suggested order and
  checkmarks.
- **Freies Üben** (`training`'s shape): any generator, your own filters, endless or in
  rounds.
- **Shared link**: whatever someone was practising, exactly reproducible (§7).

---

## 4. Exercise catalog

✓ exists in `training` · ★ not offered by musicca (singing). Rows under «Später» are not
planned yet.

### Töne

The first topic: before counting intervals, you need to know the notes.

| Übung                                                                   | Fertigkeit |     |
| ----------------------------------------------------------------------- | ---------- | --- |
| Töne auf Klaviatur benennen                                             | Klaviatur  | ✓   |
| Töne auf Klaviatur spielen                                              | Klaviatur  | ✓   |
| Noten benennen (Violin- und Bassschlüssel, im System / mit Hilfslinien) | Erkennen   | ✓   |
| Noten schreiben (Name gegeben → setzen)                                 | Notieren   | ✓   |
| Oktavbezeichnungen (grosse, kleine, ein-/zweigestrichene Oktave)        | Erkennen   |     |
| Tonhöhen vergleichen (höher / tiefer / gleich)                          | Hören      |     |
| Ton nachsingen                                                          | Singen     | ★   |

Only the name counts, never the octave: «fis», not «fis¹». Playing or writing accepts the note
in any octave the keyboard (c to h¹, as for Intervalle) or the staff allows. Octave names get
their own exercise. Names are lowercase. Answers are one grid: a column per letter, ♯ names
above, ♭ names below; without accidentals only c–h. On the keyboard a black key has two names
and both are right; ces, fes, eis and his don't appear there (those keys are h, e, f, c). In
the score the spelling is the question: fes is fes. The default is ♭ ♯ with black keys; no
double accidentals. Naming keys is silent, as for Intervalle.

*Später:* Alt- und Tenorschlüssel, Doppelvorzeichen, enharmonische Verwechslung.

### Rhythmus

| Übung                                     | Fertigkeit |     |
| ----------------------------------------- | ---------- | --- |
| Notenwerte und Pausenzeichen zuordnen     | Erkennen   | ✓   |
| Fehlende Pausen ergänzen                  | Notieren   | ✓   |
| Rhythmus klopfen: vom Blatt und nachklopfen | Klopfen    |     |
| Rhythmusdiktat                            | Hören      | ✓   |

*Später:* Taktart bestimmen, Taktstriche setzen, Triolen, Synkopen, 6/8.

### Intervalle

Split into **Grobbestimmung** (size only: Prime … Oktave, no accidentals at all) and
**Feinbestimmung** (the full name: klein/gross/rein …). The topic page shows them as two
groups, in this order. Both groups use the same exercise titles; the tab and link preview
add the group, e.g. «Intervalle notieren (Grobbestimmung)».

| Übung                              | Fertigkeit | Gruppe |       |
| ---------------------------------- | ---------- | ------ | ----- |
| Intervalle in Noten benennen       | Erkennen   | grob   | ✓     |
| Intervalle notieren                | Notieren   | grob   | ✓     |
| Intervalle auf Klaviatur benennen  | Klaviatur  | grob   | ✓     |
| Intervalle auf Klaviatur spielen   | Klaviatur  | grob   | ✓     |
| Intervalle in Noten benennen       | Erkennen   | fein   | ✓     |
| Intervalle notieren                | Notieren   | fein   | ✓     |
| Intervalle auf Klaviatur benennen  | Klaviatur  | fein   | ✓     |
| Intervalle auf Klaviatur spielen   | Klaviatur  | fein   | ✓     |
| Intervalle hörend erkennen         | Hören      | fein   | ✓     |
| Intervalle singen                  | Singen     | fein   | ✓ ★   |

On the keyboard (two octaves, c to h¹, no labels): Grobbestimmung uses white keys only, since a
black key has no size (c–dis is a Sekunde, c–es a Terz). Feinbestimmung counts semitones;
with no spelling, ü4 and v5 are both «Tritonus», as on the answer grid. *Benennen* is silent until
checked, so it trains counting, not hearing. *Spielen*: a tapped key sounds and is selected; «Prüfen»
submits it. Marks are fills: given keys blue, the tapped key light blue.

*Später:* über die Oktave hinaus, Komplementärintervalle.

### Dreiklänge

Before Tonleitern & Tonarten: a triad needs only intervals, not keys. Two groups, shown in
this order on the topic page.

**Grundstellung:** three tones close above the root, on one staff or on the keyboard.
Qualities Dur, moll, vermindert, übermässig; sus4 can be switched on. Naming asks only the
quality, one tap answers.

| Übung                               | Fertigkeit |     |
| ----------------------------------- | ---------- | --- |
| Dreiklänge in Noten benennen        | Erkennen   | ✓   |
| Dreiklänge notieren                 | Notieren   | ✓   |
| Dreiklänge auf Klaviatur benennen   | Klaviatur  | ✓   |
| Dreiklänge auf Klaviatur spielen    | Klaviatur  | ✓   |
| Dreiklänge hörend erkennen          | Hören      | ✓   |
| Dreiklänge singen                   | Singen     | ✓ ★ |

**Umkehrungen & Lagen:** the settings ask the Umkehrung (lowest tone: Grundstellung,
Sextakkord, Quartsextakkord), the Lage (highest tone: Oktavlage, Terzlage, Quintlage), or
both.

| Übung                                         | Fertigkeit |     |
| --------------------------------------------- | ---------- | --- |
| Umkehrungen & Lagen in Noten benennen         | Erkennen   | ✓   |
| Umkehrungen & Lagen notieren                  | Notieren   | ✓   |
| Umkehrungen & Lagen auf Klaviatur benennen    | Klaviatur  | ✓   |
| Umkehrungen & Lagen auf Klaviatur spielen     | Klaviatur  | ✓   |
| Umkehrungen & Lagen hörend erkennen           | Hören      | ✓   |
| Umkehrungen & Lagen singen                    | Singen     | ✓ ★ |

Rules (decided 2026-11-24):

- **One staff = three tones close.** The Lage then follows from the Umkehrung
  (Grundstellung = Quintlage, Sextakkord = Oktavlage, Quartsextakkord = Terzlage). A setting
  adds a separate bass tone: a second staff in bass clef, a fourth key, a bass voice. Only
  then do Umkehrung and Lage vary independently.
- **Writing and playing are free.** Any spacing, doublings allowed, on one staff or across
  both. Right means: the lowest tone is the asked chord member (Umkehrung), the highest is the
  asked one (Lage), all three tones are there, and no other. In notation the spelling counts
  (fis, not ges); on the keyboard only the key.
- **Singing:** the chord's lowest tone sounds; sing all three tones from the bottom up, each
  held as in Intervalle singen, any octave, order counts.
- **Übermässig** is left out where only sound or keys count (hearing and keyboard naming of
  Umkehrungen & Lagen): its inversions sound and lie alike.
- No double accidentals anywhere; roots that would need one are skipped.

*Später:* Septakkorde (Dominantseptakkord first), Akkordsymbole, Hauptfunktionen T S D,
Kadenzen hören.

### Tonleitern & Tonarten

| Übung                                 | Fertigkeit |     |
| ------------------------------------- | ---------- | --- |
| Vorzeichen setzen                     | Notieren   | ✓   |
| Tonart den Vorzeichen zuordnen        | Erkennen   | ✓   |
| Halbtonschritte markieren             | Erkennen   | ✓   |
| Stufen bestimmen                      | Erkennen   | ✓   |
| Tonleiter notieren                    | Notieren   |     |
| Tonleiter auf der Klaviatur           | Klaviatur  |     |
| Tonleitern hören (Dur, Moll ×3)       | Hören      | ✓   |
| Tonleitern singen (Dur, Moll)         | Singen     | ★   |
| Paralleltonart, Quintenzirkel         | Erkennen   |     |

Stufen bestimmen moved here from Dreiklänge (2026-11-24): Stufen need the keys.

*Später:* Pentatonik, Blues, Kirchentonarten.

### Melodie

| Übung                       | Fertigkeit |       |
| --------------------------- | ---------- | ----- |
| Melodiediktat               | Hören      | ✓     |
| Melodie nachsingen          | Singen     | ★     |
| Melodie vom Blatt singen    | Singen     | ★     |

*Später:* Fehler finden (hear a melody, click the wrong note in the score).

**Dropped:** Generalbass, two-part dictation, and musicca's Instrumente/Genres quizzes. The
quizzes need licensed recordings and images, and they aren't music theory.

**Scale:** 13 existing generators plus about 18 new ones for the core.

---

## 5. Site structure

```
/                                 Start: topics (later: «Weiter, wo du warst» + Lernpfad first)
/lernen/                          Lernpfad: Kurse
/lernen/intervalle/               a Kurs: Abschnitte and Stufen with checkmarks
/lernen/intervalle/terzen/        one Stufe (its own link)
/ueben/                           the topics
/ueben/intervalle/                one topic: its exercises, full titles only
/ueben/intervalle-singen/         one exercise; filters and task in the query string (§7)
/wissen/intervalle/               short explanation with playable examples + «Jetzt üben»
/werkzeuge/klavier/  /metronom/  /quintenzirkel/  /tonhoehe/   (live pitch display)
/lexikon/                         Fachbegriffe A–Z
/fortschritt/                     statistics, export/import
/einstellungen/                   Stimmlage, Kammerton, Toleranz-Vorgabe
```

Every route is a real URL with its own title. URLs are ASCII (`hoeren`, not `hören`).

---

## 6. Singen

### What it does

The site plays a reference (or shows a score), the learner sings, and the browser listens
and judges the pitch.

| Übung                      | What happens                                                                |
| -------------------------- | --------------------------------------------------------------------------- |
| Ton nachsingen             | a tone sounds; sing it back                                                 |
| Intervalle singen          | a Grundton sounds; sing the named interval, up or down                      |
| Dreiklänge singen          | a Grundton sounds; sing the chord tones one after another                   |
| Tonleitern singen          | Dur, Moll                                                                   |
| Melodie nachsingen         | hear a short melody, sing it back                                           |
| Melodie vom Blatt singen   | score shown, starting tone given, sing it                                   |
| *Werkzeug:* Tonhöhe        | live display of the sung pitch; doubles as a tuner                          |

### How singing is judged

**Pipeline**

```
microphone ─▶ pitch detector ─▶ smoothing ─▶ note segments ─▶ comparison ─▶ feedback
```

- The pitch detector produces a frequency and a clarity value about every 20 ms.
- Smoothing takes the median over recent frames and discards unclear ones.
- A note segment is a pitch held stable for at least ~150 ms.
- Comparison checks each segment against the target notes.

**Notenweise** (default). The exercise waits for each target note. A note counts once it is
held within tolerance for ~0.8 s. Rhythm is not judged. This is forgiving, and right for
single notes, intervals, chords and scales.

**Im Tempo** (melodies, later). After a count-in, the learner sings along to a click. Each
note is judged by how much of its duration is within tolerance.

**Filters**, so part of the shared link:

- Tolerance: ±50 Cent (nearest semitone), ±30, ±15.
- Octave: octave-agnostic by default, so a man singing a notated melody an octave lower is
  correct.
- Reference: *absolute* (against the piano, A = 440 Hz) or *relativ* (intervals measured
  between the learner's own sung notes). Relativ forgives a singer who drifts but sings the
  right intervals.

**Feedback.** The sung pitch is drawn as a line over the target notes, and each note gets a
verdict such as «zu tief, −35 Cent».

**Stimmlage.** On first use, the learner either picks *hoch / mittel / tief* or sings their
lowest and highest comfortable note. Reference tones are placed in that range. This is a
**personal setting**: it is never part of a link, so whoever opens a shared link sings in
their own range.

### Technical

- **Microphone.** `getUserMedia` with `echoCancellation`, `noiseSuppression` and
  `autoGainControl` turned off, because all three distort pitch. As a result, reference and
  singing must not overlap through speakers, so the flow is "play, then listen". With
  headphones, a drone or accompaniment during singing becomes possible later.
- **Detector.** McLeod pitch method via `pitchy` (small, MIT licence), or our own YIN
  (~100 lines), behind our own interface so it can be swapped. Start with an `AnalyserNode`;
  move to an `AudioWorklet` only if "im Tempo" needs tighter timing. Voice fundamentals run
  from ~80 Hz to ~1000 Hz, which a 2048-sample window covers.
- **Fits the existing design.** A new task kind `sing` holds the target notes and the mode.
  The answer is the list of detected note segments, and scoring gets a `sing` branch.
  Detection (signal → pitch track) and evaluation (pitch track → verdict) are separate and
  can be tested separately.
- **Privacy.** Audio is analysed in the browser and never recorded, stored or sent. The page
  says so before asking for microphone access.

### Testing

- **Detector:** synthetic signals (sine, sawtooth, vibrato, noise) plus a handful of recorded
  voice clips from different voices, stored as WAV fixtures.
- **Evaluation:** pure functions, tested with synthetic pitch tracks.
- **e2e:** Chromium can take a WAV file as its microphone
  (`--use-file-for-fake-audio-capture`), so a recorded sung minor third runs through the real
  page.

### Risks

- **iOS Safari.** While the microphone is open, iOS can lower playback volume or change the
  audio route. Test on real iPhones early.
- **iOS input level** (confirmed in the Phase 0 test). With voice processing off, the
  microphone signal arrives very quietly. Never judge singing against a fixed level; compare
  it to the room noise (`NoiseGate`), and keep pitch detection level-independent.
- **Safari permission prompts.** Safari asks for microphone permission again after every
  full page load. This is one reason the site should change pages without reloading (§9).
- **Noisy rooms and detector octave errors.** Mitigated by the clarity threshold and
  octave-agnostic judging.
- → **Spike in Phase 0:** a throwaway page with a live pitch display, tried on several voices
  and devices, including an iPhone, before the design is locked.

---

## 7. Sharing, progress — without a server

### Every exercise state is a link

| Link                     | Opens                                       | Example                                                    |
| ------------------------ | ------------------------------------------- | ---------------------------------------------------------- |
| Übung                    | the exercise with default settings          | `/ueben/intervalle-singen/`                                |
| Übung + Einstellungen    | same settings, fresh random tasks           | `/ueben/intervalle-singen/?intervalle=k3,g3&richtung=ab`   |
| + Aufgabe                | exactly this task                           | `…&aufgabe=8f3k2`                                          |
| + Runde                  | exactly this set of tasks                   | `…&runde=10&aufgabe=8f3k2`                                 |
| Lernpfad-Stufe           | that step                                   | `/lernen/intervalle/terzen/`                               |

Rules:

- **The address bar is the source of truth.** Every filter change updates it with
  `history.replaceState`, so what you see is always shareable. `localStorage` only fills in
  your last settings when you open an exercise without parameters.
- **Readable German parameter names.** Only values that differ from the defaults are
  written, so links stay short.
- **Old links keep working.**
  - Unknown parameters are ignored, and unknown values fall back to defaults.
  - Exercise ids and parameter names are a public interface after launch; renaming one needs
    an alias.
  - A task is reproduced from its seed, which only holds while the generator is unchanged.
    Links therefore carry a short generator version. If it doesn't match, the page says the
    task no longer exists and offers a new one with the same settings.
- **Personal settings never travel in a link**: Stimmlage, Kammerton, Toleranz-Vorgabe.
- **«Teilen» button.** It opens the native share sheet on phones (Web Share API) and copies
  the link elsewhere.
- **Test.** For every generator, settings → URL → settings round-trips, and a task link
  reproduces the identical task.

### Progress

- Stored in `localStorage` with a versioned schema, as `training` does: per exercise,
  attempts and correct answers; per Lernpfad step, done and best result.
- **Export/Import**, as a file or a link. This is the only backup there is, and the way to
  move to another device.
- *Später:* **Schwächen üben.** Each question reports what it tested (`iv:k6`, `clef:bass`),
  and generators weight towards what you get wrong.

### `localStorage` on GitHub Pages

- All Pages sites of one account share the origin `peterheliko.github.io`, and therefore
  share `localStorage`. → Namespace every key.
- **Moving to the own domain** creates a new origin, where saved progress is empty. The plan:
  1. Export as a link exists from day one.
  2. At the move, the github.io version keeps running for a transition period with a notice
     «Wir sind umgezogen — Fortschritt mitnehmen».
  3. That notice forwards the progress to the new domain in the URL fragment, which is never
     sent to any server.
  4. Afterwards, the github.io version is switched off.

---

## 8. Interaction

- **Answer buttons** (✓). Add keyboard shortcuts: digits for options, letters C D E F G A H
  for note names, Enter for Prüfen/Weiter.
- **Notation input** (✓). Needs a mobile pass: larger hit areas and a layout that works on
  narrow screens. Today it is desktop-first.
- **Klaviatur** (✓ as display and input, `ui/PianoKeyboard.tsx`). One component used three ways:
  - display: show a chord or scale
  - input: click the keys
  - tool: play freely

  Configurable range, labels on/off, and coloured keys for feedback.
- **Klopfen.** Space bar or a touch area. Taps are scored by onset timing with a tolerance,
  and feedback shows your taps on a timeline against the target.
- **Audio.** Keep `training`'s per-semitone piano samples (1.5 MB) and load them lazily, so a
  text page doesn't download them. Synthesize the metronome click.
- *Später:* MIDI keyboard via Web MIDI, as progressive enhancement.

---

## 9. Technical architecture

### GitHub Pages constraints

- Static files only. No server-side redirects and no SPA fallback, only a custom `404.html`.
- HTTPS, which microphone access, Web MIDI and service workers all require.
- Served under `/musiktheorie/` until the own domain, so every path must respect the base.
- Soft limits are 1 GB per site and 100 GB/month of traffic; at a few MB this doesn't matter.

### Site framework — decided: B

Whatever a learner does *inside* an exercise is the same in every option: it's `training`'s
Preact code. The options differ at the edges: what a shared link looks like and shows in a
chat, what loads, how pages change, and how explanation pages are written.

- **A — Single page, as in `training`.** One `index.html`; everything lives behind `#/…`.
- **B — Single page plus one HTML file per route.** The same app, but a build step writes
  `/ueben/intervalle-singen/index.html` and so on, each with its own title and description.
  Any of these files starts the app, which then changes pages without reloading.
- **C — Astro.** A static-site framework. Each route is its own page, written in Markdown or
  as a component, and exercises are embedded as interactive Preact parts ("islands").

|                                     | A — as today                                                                 | B — + one HTML per route                                    | C — Astro                                                                   |
| ----------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------- |
| Shared link                         | `…/musiktheorie/#/ueben/intervalle-singen?…`                                  | `…/musiktheorie/ueben/intervalle-singen/?…`                 | same as B                                                                   |
| Preview when pasted into a chat     | **identical for every link**: previews don't run JS and ignore `#…`           | exercise title + description                                | same as B                                                                   |
| Search engines                      | the whole site counts as one page                                            | one entry per page                                          | one entry per page, text right in the HTML                                  |
| JavaScript on a text-only page      | all 820 KB (423 KB compressed)                                               | split: notation code loads only where needed                | none, unless the page has an interactive part                               |
| Changing pages                      | no reload; the microphone stays open                                         | no reload; the microphone stays open                        | full reload (Safari asks for the microphone again), unless Astro's client router is enabled, which brings its own rules for scripts |
| Writing explanation pages           | as Preact components                                                         | as Preact components                                        | Markdown with embedded score, audio and keyboard                            |
| Moving over from `training`         | nothing to do                                                                | a router plus a ~100-line build script                      | rebuild the shell and navigation; exercise components move unchanged       |
| New tooling                         | none                                                                         | none                                                        | Astro                                                                       |

**Decision: B.** The reasons:

- **Sharing is central.** That rules out A: every link pasted into a chat would show the
  same preview.
- **Depth stays modest**, so there will be fewer explanation pages. That shrinks Astro's main
  advantage, writing lots of content.
- **Singing benefits from never reloading**: the microphone stays open and Safari doesn't
  prompt again.
- **B is the smallest step from `training`.**

If the explanation and Lexikon pages grow large later, moving to Astro stays possible: the
exercise components carry over, and only the shell is rebuilt.

Consequences of B:

- Assets need an absolute base (`/musiktheorie/`) instead of `training`'s `./`, because
  pages sit at different depths. It's one build variable, set to `/` when the own domain comes.
- Unknown paths get a custom `404.html` with a link back.
- The text of the explanation pages can be rendered into their HTML at build time later
  (`preact-render-to-string`) if search ranking turns out to need it.

### Code layout

```
src/
  core/          copied from training: music/, scoring/, audio/, generators/, notation-input/
  sing/          microphone, pitch detector, segmentation, evaluation
  components/    Klaviatur, Notenbild, Hörbeispiel, Tonhöhenkurve, Metronom …
  pages/         one module per route type: Start, Kurs, Stufe, Übung, Wissen, Werkzeug …
  content/       Lernpfad data, Wissen texts, Lexikon entries, UI strings
  routes.ts      list of all routes; the build script writes one HTML file per entry
public/samples/  piano samples (generated with MuseScore, committed)
```

### Quality net

Carried over from `training`:

- Every generator checks its own answer and throws rather than pose a wrong task.
- 200 tasks per generator, with the sample solution scored as fully correct.
- Filter efficacy: every enabled value appears, every disabled value never does.

New:

- **Links:** the round-trip and reproduction tests (§7).
- **Lernpfad presets:** every preset generates 200 tasks, and its pass criterion is
  reachable.
- **Singing:** detector and evaluation tests; e2e with a fake microphone (§6).
- **e2e against the built site under the `/musiktheorie/` base path.** This catches absolute-path
  bugs, the classic GitHub Pages failure.
- **Link checker** over the built site, and an **axe** accessibility check on key pages.

### Offline, deploy, accessibility

- **Offline:** a service worker precaches the app and the samples, so the site works offline
  and can be installed on a phone.
- **Deploy:** GitHub Actions deploys to Pages (`actions/deploy-pages`) on every push to
  `main`.
- **Accessibility:** everything operable by keyboard; feedback never by colour alone; respect
  `prefers-reduced-motion` and dark mode.

### Loose end

`training`'s README notes that the `hes4` fix in `NotationInput.tsx` belongs back in
`musiktheorie-scorm`. It is still open there.

---

## 10. Language & conventions

- German only. Still, keep all UI strings in one module from day one: cheap now, expensive
  later. No i18n framework.
- Swiss spelling: «ss», never «ß».
- Note names C D E F G A H, with B for the lowered H. Internally `hes4`, never `b4` for B.
- Key names: C-Dur, a-Moll. Interval names written out ("kleine Septime").
- Address learners with "du".
- Kammerton A = 440 Hz by default, adjustable in the settings.

---

## 11. Roadmap

### Phase 0 — Fundament

- Repo `PeterHeliko/musiktheorie`; `training`'s core copied in; the app with a router and
  one HTML file per route.
- The 13 existing exercises live under `/ueben/`.
- **Links for all exercise states, plus the «Teilen» button.** Cheap now, painful to add
  once links are out in the wild.
- GitHub Actions deploy; e2e under the base path.
- **Singing spike:** live pitch display, tested on several voices and devices, iPhone
  included.
- **Done when** `training`'s exercises run on `github.io`, every exercise state is a link,
  and we know whether pitch detection holds up on phones.
- **Status 2026-11-23:** deployed to `peterheliko.github.io/musiktheorie/`.
  - The microphone works on iOS, but the input level is very low: without voice processing,
    iOS delivers the raw signal some 20–30 dB quieter than desktop browsers.
  - Fixed by deciding "tone or room" relative to the learned room noise instead of a fixed
    level (`src/sing/level.ts`), and by adding a level meter.
  - Open: retest on the iPhone.

### Phase 1 — musicca's shape (first public release)

- Klaviatur component (display + input).
- Noten benennen, Noten schreiben and the Töne keyboard exercises (done 2026-11-24);
  Oktavbezeichnungen.
- Klaviatur exercises for notes, intervals and triads.
- Tonleiter notieren, Dreiklang notieren.
- Keyboard shortcuts; mobile pass on the notation input.
- Lernpfad with the first three Kurse: Töne, Intervalle, Tonarten & Tonleitern.
- Fortschritt, export/import, offline.
- **Done when** a beginner can go from the first note to naming intervals on a phone.

### Phase 2 — Singen

- Stimmlage, Ton nachsingen, Tonhöhe tool.
- Intervalle, Dreiklänge and Tonleitern singen (notenweise).
- Melodie nachsingen, Melodie vom Blatt singen (notenweise).
- Singing steps added to the Lernpfad.

### Phase 3 — Wissen & Werkzeuge

- Short Wissen page per Thema with playable examples; feedback links into it.
- Werkzeuge: Klavier, Metronom, Quintenzirkel. Lexikon.
- Rhythmus klopfen, Tonhöhen vergleichen, Paralleltonart/Quintenzirkel exercise.

### Später

Schwächen üben, singing «im Tempo», alto/tenor clef, seventh chords, chord symbols, T S D
and Kadenzen, Pentatonik/Kirchentonarten, Fehler finden, MIDI input.

### Out of scope

- Accounts and leaderboards.
- Any feature that lets someone monitor or grade learners.
- Anything server-side, ads.
- Recording or storing audio.
- Instrumente/Genres quizzes.

---

## 12. Open questions

None right now. Next step: Phase 0.
