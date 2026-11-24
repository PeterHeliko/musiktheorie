/**
 * «Zu Kurs hinzufügen» im Einstellungsblatt (Entscheid 2026-11-24): die
 * Übung mit den Einstellungen, die gerade im Blatt stehen, kommt in einen
 * Kurs dieses Geräts — einen vorhandenen oder einen neuen.
 *
 * Kein eigenes Formular für Filter: wer einen Kurs baut, stellt jede Übung
 * dort ein, wo er sie auch übt.
 */

import { useState } from 'preact/hooks';
import {
  MAX_STEPS,
  MAX_TITLE,
  cleanTitle,
  courseTitle,
  decodeCourse,
  encodeCourse,
  stepKey,
  type Course,
  type CourseStep,
} from '../courses';
import { createCourse, listCourses, removeCourse, updateCourse, type StoredCourse } from '../settings';

interface Added {
  id: string;
  title: string;
  /** Inhalt vor dem Hinzufügen — null, wenn der Kurs neu ist. */
  previous: string | null;
}

export function AddToCourse({ step }: { step: CourseStep }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [added, setAdded] = useState<Added | null>(null);

  const key = stepKey(step);
  const courses = listCourses().map((stored) => ({ stored, course: decodeCourse(stored.link) }));

  const addTo = (stored: StoredCourse, course: Course) => {
    const next: Course = { ...course, steps: [...course.steps, step] };
    updateCourse(stored.id, encodeCourse(next));
    setAdded({ id: stored.id, title: courseTitle(course), previous: stored.link });
    setOpen(false);
  };

  const create = () => {
    const clean = cleanTitle(title);
    if (!clean) return;
    const stored = createCourse(encodeCourse({ title: clean, steps: [step] }));
    setAdded({ id: stored.id, title: clean, previous: null });
    setTitle('');
    setOpen(false);
  };

  const undo = () => {
    if (!added) return;
    if (added.previous === null) removeCourse(added.id);
    else updateCourse(added.id, added.previous);
    setAdded(null);
  };

  return (
    <section class="sheet-section">
      <h3>Kurs</h3>
      {added && (
        <div class="notice notice-good course-added" role="status">
          <p>Mit aktuellen Einstellungen zu «{added.title}» hinzugefügt.</p>
          <button type="button" class="link-button" onClick={undo}>
            Rückgängig
          </button>
        </div>
      )}

      {!open ? (
        <button
          type="button"
          class="link-button"
          onClick={() => {
            setOpen(true);
            setAdded(null);
          }}
        >
          Zu Kurs hinzufügen
        </button>
      ) : (
        <div class="course-chooser">
          {courses.length > 0 && (
            <>
              <div class="filter-label">In welchen Kurs?</div>
              <ul class="course-choices">
                {courses.map(({ stored, course }) => {
                  const inside = course.steps.some((entry) => stepKey(entry) === key);
                  const full = course.steps.length >= MAX_STEPS;
                  return (
                    <li key={stored.id}>
                      <button type="button" disabled={inside || full} onClick={() => addTo(stored, course)}>
                        <span>{courseTitle(course)}</span>
                        <span class="course-count">
                          {inside ? 'schon drin' : full ? 'voll' : course.steps.length}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          <form
            class="course-new"
            onSubmit={(event) => {
              event.preventDefault();
              create();
            }}
          >
            <label class="filter-label" for="course-new-title">
              Neuer Kurs
            </label>
            <div class="course-new-row">
              <input
                id="course-new-title"
                type="text"
                value={title}
                maxLength={MAX_TITLE}
                placeholder="Titel"
                autoComplete="off"
                onInput={(event) => setTitle((event.currentTarget as HTMLInputElement).value)}
              />
              <button type="submit" class="link-button" disabled={!cleanTitle(title)}>
                Anlegen
              </button>
            </div>
          </form>
          <div class="filter-actions">
            <button type="button" class="link-button" onClick={() => setOpen(false)}>
              Abbrechen
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
