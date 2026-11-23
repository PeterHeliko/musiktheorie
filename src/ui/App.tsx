/**
 * Rahmen der Website: Kopfzeile und die Seite, die zur Adresse gehört.
 *
 * Welche Seiten es gibt und wie sie heissen, steht in `pages.ts` — dieselbe
 * Liste, aus der beim Bauen die HTML-Dateien entstehen. So stimmen Titel im
 * Tab, Vorschau im Chat und angezeigte Seite immer überein.
 */

import { useEffect, useState } from 'preact/hooks';
import { generatorById } from '../generators/index';
import type { FilterValues, Generator } from '../generators/types';
import { documentTitle, metaFor } from '../pages';
import { hrefFor, useLocation } from '../router';
import { TopicList, TopicPage } from './Overview';
import { PitchTool } from './PitchTool';

/**
 * Die Übungsansicht wird erst geladen, wenn eine Übung offen ist. Mit ihr
 * kommt der Notensatz (VexFlow samt eingebetteter Notenschrift) — rund drei
 * Viertel des ganzen Codes. Übersicht und Tonhöhe brauchen ihn nicht.
 */
const loadExercisePage = () => import('./ExercisePage');
type ExerciseModule = Awaited<ReturnType<typeof loadExercisePage>>;
let exerciseModule: ExerciseModule | null = null;

function LazyExercisePage(props: { generator: Generator<FilterValues>; search: string }) {
  const [module, setModule] = useState<ExerciseModule | null>(exerciseModule);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (module) return;
    loadExercisePage()
      .then((loaded) => {
        exerciseModule = loaded;
        setModule(loaded);
      })
      .catch(() => setFailed(true));
  }, []);
  if (failed) {
    return (
      <div class="notice notice-warning" role="alert">
        <p>Die Übung liess sich nicht laden. Bist du offline? Lade die Seite neu, um es nochmals zu versuchen.</p>
      </div>
    );
  }
  if (!module) return <p class="loading session-loading">Übung wird geladen …</p>;
  return <module.ExercisePage {...props} />;
}

export function App() {
  const { route, search } = useLocation();

  useEffect(() => {
    document.title = documentTitle(metaFor(route));
  }, [route]);

  let page;
  switch (route.page) {
    case 'start':
      page = <TopicList heading="Musiktheorie üben" />;
      break;
    case 'ueben':
      page = <TopicList heading="Übungen" />;
      break;
    case 'thema':
      page = <TopicPage topic={route.topic} />;
      break;
    case 'uebung': {
      const generator = generatorById(route.id)!;
      // Der Schlüssel wirft den ganzen Übungszustand weg, wenn die Übung oder
      // der geöffnete Link wechselt — sicherer, als jeden Teilzustand einzeln
      // zurückzusetzen. Die Seite selbst ändert die Adresse nur still
      // (replaceState), das löst hier keinen Wechsel aus.
      page = <LazyExercisePage key={`${route.id}${search}`} generator={generator} search={search} />;
      break;
    }
    case 'tonhoehe':
      page = <PitchTool />;
      break;
    case 'nicht-gefunden':
      page = <NotFound />;
      break;
  }

  // Eine laufende Übung füllt den Bildschirm allein — ohne Kopfzeile der Website.
  if (route.page === 'uebung') return page;

  return (
    <>
      <SiteHeader />
      <div class="shell">{page}</div>
    </>
  );
}

function SiteHeader() {
  return (
    <header class="site-header">
      <nav class="site-nav" aria-label="Hauptnavigation">
        <a class="site-name" href={hrefFor({ page: 'start' })}>
          Musiktheorie üben
        </a>
      </nav>
    </header>
  );
}

function NotFound() {
  return (
    <div class="start-page">
      <h1>Seite nicht gefunden</h1>
      <p class="subtitle">
        Diese Seite gibt es nicht — vielleicht wurde eine Übung umbenannt, oder im Link fehlt ein
        Stück.
      </p>
      <p>
        <a href={hrefFor({ page: 'ueben' })}>Zu allen Übungen</a>
      </p>
    </div>
  );
}
