/**
 * Feste Namensliste. Namen werden nach Index vergeben, nicht gezogen: sie sind
 * reine Anzeige und sollen den RNG-Verlauf nicht verschieben.
 * 40 Namen decken die Obergrenze aus Doc 01 §1.3 ab.
 */

const NAMES = [
  'Ada', 'Bruno', 'Clara', 'Dario', 'Elin', 'Fiete', 'Greta', 'Hakim',
  'Ilva', 'Jonas', 'Kira', 'Lasse', 'Maya', 'Nuri', 'Oda', 'Pelle',
  'Quirin', 'Rosa', 'Silas', 'Thea', 'Umut', 'Vera', 'Wanda', 'Xaver',
  'Yara', 'Zeno', 'Anouk', 'Bosse', 'Cato', 'Dilara', 'Emil', 'Freya',
  'Gero', 'Hanna', 'Ilias', 'Juno', 'Kaspar', 'Linnea', 'Mio', 'Nadja',
] as const;

export const MAX_NAMED_AGENTS = NAMES.length;

export function nameForIndex(index: number): string {
  const name = NAMES[index];
  if (name !== undefined) return name;
  // Ueber 40 Agenten hinaus (Doc 01 §1.3 laesst das nicht zu, aber Tests duerfen
  // es versuchen) bleibt der Name eindeutig und deterministisch.
  return `Agent ${index}`;
}
