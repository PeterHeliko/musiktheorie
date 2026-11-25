/**
 * Verzeichnis aller Übungen.
 *
 * Gegliedert wird nach Thema (siehe TOPICS); innerhalb eines Themas geht die
 * Reihenfolge vom Erkennen zum Selbermachen und dann zum Hören — bei den
 * Intervallen: in Noten benennen, notieren, auf der Klaviatur benennen und
 * spielen, hören, singen (Entscheid 2026-11-23).
 *
 * Eine neue Übung hinzuzufügen heisst: eine Generator-Datei schreiben und sie
 * hier eintragen. Oberfläche, Filterformular, Bewertung, Rückmeldung, eigene
 * Seite und Links kommen von selbst. Neue Filter brauchen zusätzlich einen
 * deutschen Namen für die Adresszeile in `src/links.ts` — ein Test erinnert
 * daran.
 */

import { expandAudioItem, tempoFor, type AudioEvent } from '../content/audio';
import { gehoerDiktat, toAudioEvents } from './gehoer-diktat';
import { gehoerIntervalle } from './gehoer-intervalle';
import { gehoerTonleitern } from './gehoer-tonleitern';
import { melodieDiktat } from './melodie-diktat';
import { melodieSingen } from './melodie-singen';
import {
  dreiklaengeBenennen,
  dreiklaengeHoeren,
  dreiklaengeKlaviaturBenennen,
  dreiklaengeKlaviaturSpielen,
  dreiklaengeNotieren,
  dreiklaengeSingen,
} from './dreiklaenge-grundstellung';
import {
  umkehrungenBenennen,
  umkehrungenHoeren,
  umkehrungenKlaviaturBenennen,
  umkehrungenKlaviaturSpielen,
  umkehrungenNotieren,
  umkehrungenSingen,
} from './dreiklaenge-umkehrungen';
import {
  septakkordeBenennen,
  septakkordeHoeren,
  septakkordeKlaviaturBenennen,
  septakkordeKlaviaturSpielen,
  septakkordeNotieren,
  septakkordeSingen,
} from './septakkorde-grundstellung';
import {
  septUmkehrungenBenennen,
  septUmkehrungenHoeren,
  septUmkehrungenKlaviaturBenennen,
  septUmkehrungenKlaviaturSpielen,
  septUmkehrungenNotieren,
  septUmkehrungenSingen,
} from './septakkorde-umkehrungen';
import { dreiklaengeStufen } from './stufen';
import { intervalleBestimmen, intervalleNotieren } from './intervalle';
import { intervalleGrobBestimmen, intervalleGrobNotieren } from './intervalle-grob';
import {
  intervalleGrobKlaviaturBenennen,
  intervalleGrobKlaviaturSpielen,
  intervalleKlaviaturBenennen,
  intervalleKlaviaturSpielen,
} from './intervalle-klaviatur';
import { intervalleSingen } from './intervalle-singen';
import { rhythmusNotenwerte, rhythmusPausen } from './rhythmus';
import { tonartenHalbtonschritte, tonartenVorzeichen, tonartenZuordnen } from './tonarten';
import { tonleiternKlaviatur, tonleiternNotieren, tonleiternSingen } from './tonleitern';
import {
  notenBenennen,
  notenKlaviaturSpielen,
  notenSchreiben,
  toeneKlaviaturBenennen,
  toeneKlaviaturSpielen,
} from './toene';
import { TOPICS, TOPIC_GROUPS, type FilterValues, type Generator, type Question, type TopicId } from './types';

/**
 * Die Filterwerte sind je Übung anders getypt. Für die Liste zählt nur der
 * gemeinsame Nenner — `generate()` ist als Methode geschrieben und damit
 * bivariant, deshalb genügt hier `FilterValues`.
 */
export const GENERATORS: Generator<FilterValues>[] = [
  toeneKlaviaturBenennen,
  toeneKlaviaturSpielen,
  notenBenennen,
  notenSchreiben,
  notenKlaviaturSpielen,
  intervalleGrobBestimmen,
  intervalleGrobNotieren,
  intervalleGrobKlaviaturBenennen,
  intervalleGrobKlaviaturSpielen,
  intervalleBestimmen,
  intervalleNotieren,
  intervalleKlaviaturBenennen,
  intervalleKlaviaturSpielen,
  gehoerIntervalle,
  intervalleSingen,
  dreiklaengeBenennen,
  dreiklaengeNotieren,
  dreiklaengeKlaviaturBenennen,
  dreiklaengeKlaviaturSpielen,
  dreiklaengeHoeren,
  dreiklaengeSingen,
  umkehrungenBenennen,
  umkehrungenNotieren,
  umkehrungenKlaviaturBenennen,
  umkehrungenKlaviaturSpielen,
  umkehrungenHoeren,
  umkehrungenSingen,
  septakkordeBenennen,
  septakkordeNotieren,
  septakkordeKlaviaturBenennen,
  septakkordeKlaviaturSpielen,
  septakkordeHoeren,
  septakkordeSingen,
  septUmkehrungenBenennen,
  septUmkehrungenNotieren,
  septUmkehrungenKlaviaturBenennen,
  septUmkehrungenKlaviaturSpielen,
  septUmkehrungenHoeren,
  septUmkehrungenSingen,
  tonartenZuordnen,
  tonartenVorzeichen,
  tonleiternNotieren,
  tonleiternKlaviatur,
  gehoerTonleitern,
  tonleiternSingen,
  melodieDiktat,
  gehoerDiktat,
  melodieSingen,
];

/**
 * Vorerst zurückgestellt (Entscheid 2026-11-25): fertig und getestet, aber
 * ohne Seite, Link und Platz auf der Themenseite. Wieder anbieten heisst:
 * zurück nach GENERATORS. Mit den beiden Rhythmusübungen fällt das ganze
 * Thema «Rhythmus» weg (`topicsWithGenerators`).
 */
export const SHELVED_GENERATORS: Generator<FilterValues>[] = [
  rhythmusNotenwerte,
  rhythmusPausen,
  tonartenHalbtonschritte,
  dreiklaengeStufen,
];

/**
 * Themen in ihrer Reihenfolge, mit ihren Übungen. Themen ohne Übung fallen
 * weg — ein neues Thema erscheint erst, wenn es dafür Generatoren gibt.
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
