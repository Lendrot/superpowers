/**
 * Faehigkeiten, Instinkte, Glueck und Macht.
 *
 * Erweiterung gegenueber der Spezifikation, auf Ansage. Der Entwurf haelt sich
 * an deren Prinzipien:
 *
 * - **Eine Wahrheit.** Gespeichert wird nur die Erfahrung; der Attributwert ist
 *   eine reine Funktion davon. Kein zweiter Zaehler, der driften kann.
 * - **Alles Ganzzahlige.** Erfahrung sind Punkte, der Attributwert ist ein
 *   `Stat` (0..100). Keine Gleitkommazahlen im State.
 * - **Alles abgeleitet.** Instinkte, Glueck und Macht sind Funktionen, keine
 *   Felder. Sie koennen nicht veralten.
 *
 * Der inhaltliche Kern: alle Agenten starten mit demselben Wert. Wer stark
 * wird, ist es geworden — und weil Instinkte aus Attributen folgen, veraendert
 * sich das Verhalten eines Agenten im Lauf des Matches, ohne dass irgendwo eine
 * Persoenlichkeit umgeschrieben werden muesste.
 */

import type { Rng } from '../core/rng.js';
import { ATTRIBUTE_TRACKS } from '../core/types.js';
import type {
  Agent,
  AttributeConfig,
  Attributes,
  AttributeTrack,
  Experience,
  Instincts,
  Resources,
  Score01,
  Stat,
} from '../core/types.js';

/** Erfahrung, mit der jeder Agent das Match beginnt. */
export function startingExperience(config: Readonly<AttributeConfig>): Experience {
  return {
    intelligence: config.startExperience,
    strength: config.startExperience,
    intuition: config.startExperience,
  };
}

/** Attributwert aus Erfahrungspunkten. 10 Punkte = 1 Punkt Faehigkeit. */
export function attributeValue(points: number, config: Readonly<AttributeConfig>): Stat {
  const value = Math.floor(points / config.pointsPerLevel);
  return value < 0 ? 0 : value > 100 ? 100 : value;
}

export function attributesOf(
  agent: Readonly<Pick<Agent, 'experience'>>,
  config: Readonly<AttributeConfig>,
): Attributes {
  return {
    intelligence: attributeValue(agent.experience.intelligence, config),
    strength: attributeValue(agent.experience.strength, config),
    intuition: attributeValue(agent.experience.intuition, config),
  };
}

/**
 * Die drei Instinkte.
 *
 * - Je mehr **Intelligenz**, desto staerker der Ueberlebensinstinkt: kluge
 *   Agenten essen frueher, ruhen frueher und lassen sich seltener auf Kaempfe
 *   ein, die sie verlieren koennen.
 * - Je mehr **Kraft**, desto staerker der Machtinstinkt: starke Agenten suchen
 *   die Auseinandersetzung und streben nach Vorrang.
 * - Je mehr **Intuition**, desto mehr **Glueck** — und das ist woertlich
 *   gemeint, siehe `luckyRoll`.
 */
export function instinctsOf(attributes: Readonly<Attributes>): Instincts {
  return {
    survival: attributes.intelligence / 100,
    power: attributes.strength / 100,
    luck: attributes.intuition / 100,
  };
}

/**
 * Ein Wurf, auf den Glueck wirkt.
 *
 * Umgesetzt als "mehr Versuche, bester zaehlt": bei Glueck 0 ein Wurf, bei
 * Glueck 1 drei Wuerfe. Das ist monoton (mehr Intuition ist nie schlechter),
 * beschraenkt (nie mehr als drei Wuerfe), deterministisch und mit einem
 * Erwartungswert, der sich ausrechnen laesst — anders als ein Bonus, den man
 * auf das Ergebnis addiert und der aus einem 0..1-Wurf 1.3 machen kann.
 *
 * Der Stream wird dabei unterschiedlich weit vorgerueckt. Das ist unkritisch,
 * weil jeder Wurf seinen eigenen Stream hat (Runde und AgentId im Schluessel).
 */
export function luckyRoll(rng: Rng, luck: Score01): number {
  const draws = 1 + Math.floor(clamp01(luck) * 2);
  let best = 0;
  for (let i = 0; i < draws; i += 1) {
    const roll = rng.float();
    if (roll > best) best = roll;
  }
  return best;
}

/** Wieviele Wuerfe `luckyRoll` bei diesem Glueck macht — fuer Tests und Debug. */
export function luckyDraws(luck: Score01): number {
  return 1 + Math.floor(clamp01(luck) * 2);
}

/**
 * Macht: was ein Agent durchsetzen kann, und was andere ihm zutrauen.
 *
 * Doc 03 §3.2.2 hat `influence` als Ressource gestrichen, weil eine speicherbare
 * Einfluss-Waehrung zwei konkurrierende Wahrheiten ueber den sozialen Status
 * erzeugt. Macht ist deshalb wie dort gefordert eine **abgeleitete Kennzahl**.
 *
 * Gewichte sind **[ANNAHME]**.
 */
export function powerOf(
  agent: Readonly<Pick<Agent, 'experience' | 'resources' | 'kills' | 'alive'>>,
  config: Readonly<AttributeConfig>,
): Score01 {
  if (!agent.alive) return 0;
  const attributes = attributesOf(agent, config);

  return round3(
    0.45 * (attributes.strength / 100) +
      0.2 * (attributes.intelligence / 100) +
      0.1 * (attributes.intuition / 100) +
      0.15 * Math.min(1, wealthOf(agent.resources) / 50) +
      // Wer getoetet hat, wird gefuerchtet. Nach drei Opfern aendert ein
      // weiteres nichts mehr — sonst waere Macht nur eine Leichenzaehlung.
      0.1 * Math.min(1, agent.kills / 3),
  );
}

export function wealthOf(resources: Readonly<Resources>): number {
  return resources.food + resources.coins + 1.5 * resources.materials;
}

/**
 * Begrenzt einen Erfahrungsdelta so, dass er die Grenzen nicht verletzt.
 * Der Erzeuger des Effekts muss das tun, nicht der Mutator — sonst weicht die
 * angekuendigte von der tatsaechlichen Aenderung ab.
 */
export function clampExperienceDelta(
  current: number,
  delta: number,
  config: Readonly<AttributeConfig>,
): number {
  const next = current + delta;
  if (next < 0) return -current;
  if (next > config.maxExperience) return config.maxExperience - current;
  return delta;
}

export function emptyExperienceDelta(): Record<AttributeTrack, number> {
  return { intelligence: 0, strength: 0, intuition: 0 };
}

export function hasExperienceDelta(delta: Readonly<Record<AttributeTrack, number>>): boolean {
  return ATTRIBUTE_TRACKS.some((track) => delta[track] !== 0);
}

function clamp01(value: number): Score01 {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
