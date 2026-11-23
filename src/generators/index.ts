/**
 * Verzeichnis aller Übungen.
 *
 * Gegliedert wird nach Thema (siehe TOPICS); innerhalb eines Themas geht die
 * Reihenfolge vom Erkennen zum Selbermachen und dann zum Hören.
 *
 * Eine neue Übung hinzuzufügen heisst: eine Generator-Datei schreiben und sie
 * hier eintragen. Oberfläche, Filterformular, Bewertung, Rückmeldung, eigene
 * Seite und Links kommen von selbst. Neue Filter brauchen zusätzlich einen
 * deutschen Namen für die Adresszeile in `src/links.ts` — ein Test erinnert
 * daran.
 */

import { expandAudioItem, tempoFor, type AudioEvent } from '../content/audio';
import { gehoerDiktat, toAudioEvents } from './gehoer-diktat';
import { gehoerDreiklaenge } from './gehoer-dreiklaenge';
import { gehoerIntervalle } from './gehoer-intervalle';
import { gehoerTonleitern } from './gehoer-tonleitern';
import { dreiklaengeBestimmen, dreiklaengeStufen } from './dreiklaenge';
import { intervalleBestimmen, intervalleNotieren } from './intervalle';
import { intervalleGrobBestimmen, intervalleGrobNotieren } from './intervalle-grob';
import { intervalleSingen } from './intervalle-singen';
import { rhythmusNotenwerte, rhythmusPausen } from './rhythmus';
import { tonartenHalbtonschritte, tonartenVorzeichen, tonartenZuordnen } from './tonarten';
import { TOPICS, TOPIC_GROUPS, type FilterValues, type Generator, type Question, type TopicId } from './types';

/**
 * Die Filterwerte sind je Übung anders getypt. Für die Liste zählt nur der
 * gemeinsame Nenner — `generate()` ist als Methode geschrieben und damit
 * bivariant, deshalb genügt hier `FilterValues`.
 */
export const GENERATORS: Generator<FilterValues>[] = [
  rhythmusNotenwerte,
  rhythmusPausen,
  intervalleGrobBestimmen,
  intervalleGrobNotieren,
  intervalleBestimmen,
  intervalleNotieren,
  gehoerIntervalle,
  intervalleSingen,
  tonartenZuordnen,
  tonartenVorzeichen,
  tonartenHalbtonschritte,
  gehoerTonleitern,
  dreiklaengeBestimmen,
  dreiklaengeStufen,
  gehoerDreiklaenge,
  gehoerDiktat,
];

/**
 * Themen in ihrer Reihenfolge, mit ihren Übungen. Themen ohne Übung fallen
 * weg — «Notenlesen» etwa erscheint erst, wenn es dafür Generatoren gibt.
 */
export function topicsWithGenerators(): {
  id: TopicId;
  title: string;
  generators: Generator<FilterValues>[];
}[] {
  return TOPICS.map((topic) => ({
    id: topic.id,
    title: topic.title,
    generators: GENERATORS.filter((generator) => generator.topic === topic.id),
  })).filter((topic) => topic.generators.length > 0);
}

/**
 * Die Übungen eines Themas, wie die Themenseite sie zeigt: nach Gruppen
 * (TOPIC_GROUPS), oder als eine Liste ohne Zwischentitel, wenn das Thema
 * keine Gruppen hat. Leere Gruppen fallen weg.
 */
export function topicSections(topic: TopicId): {
  title: string | null;
  generators: Generator<FilterValues>[];
}[] {
  const generators = GENERATORS.filter((generator) => generator.topic === topic);
  const groups = TOPIC_GROUPS[topic];
  if (!groups) return generators.length > 0 ? [{ title: null, generators }] : [];
  return groups
    .map((group) => ({
      title: group.title,
      generators: generators.filter((generator) => generator.group === group.id),
    }))
    .filter((section) => section.generators.length > 0);
}

export function generatorById(id: string): Generator<FilterValues> | undefined {
  return GENERATORS.find((g) => g.id === id);
}

/**
 * Klangereignisse einer Aufgabe — das, was der Abspieler braucht.
 * Beim Diktat liefert der Generator die Melodie separat mit, weil das
 * Hörbeispiel sie nicht aus sich selbst herleiten kann.
 */
export function eventsFor(question: Question): AudioEvent[] | null {
  if (!question.audio) return null;
  return expandAudioItem(question.audio, question.melody);
}

export function tempoOf(question: Question): number {
  return question.audio ? tempoFor(question.audio) : 84;
}

export { toAudioEvents };
