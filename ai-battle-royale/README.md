# AI Battle Royale — deterministischer Kern + Wahrnehmung

Stand: **Tag 1 und Tag 2** aus `12-build-order.md`.

- **Tag 1** (T01, T02 reduziert, T03–T07, Kern von T09): Welt aus Seed, Runden
  laufen headless, Event-Log-Hash reproduzierbar.
- **Tag 2** (T08, T10, T11, T16): Agenten essen, ziehen um und scheiden aus.
  Wissen entsteht ausschließlich in Phase 2 und veraltet. Entscheidungen fallen
  nur noch auf Basis einer `AgentView`.

Kein UI, kein LLM, keine Allianzen, kein Handel, kein Lernsystem.

## Abnahme

```bash
pnpm install
pnpm sim --matches 1 --rounds 100 --agents 30 --seed 42 --llm off
pnpm test
```

Gemessen auf Node 22 in dieser Umgebung:

| Lauf | Ergebnis |
|---|---|
| `--rounds 100 --agents 30 --seed 42` | Log-Hash `a2df957087c04137`, 3 202 Events, ~220 ms |
| `--rounds 400 --agents 30 --seed 42` | Log-Hash `45c6a5bf3317d008`, ~0,57 s |
| `pnpm test` | 17 Dateien, 217 Tests grün, ~8 s |

Der Zielwert aus Doc 01 §1.5.7 (400 Runden × 30 Agenten headless unter 5 s) wird
mit ~0,6 s eingehalten — ohne Memory, Lernen und Sozialsystem. Die Zahl ist mit
jeder weiteren Phase neu zu messen.

### Gates

| Gate | Was es beweist |
|---|---|
| `tests/golden/determinism.test.ts` | Gleicher Seed ⇒ gleicher Log-Hash, fünf Läufe, drei festgenagelte Werte |
| `tests/simulation/noOmniscience.test.ts` | Jeder Wissenseintrag stammt aus einem Ereignis, das der Agent wahrnehmen konnte |
| `tests/unit/agentViewIsolation.test.ts` | Die `AgentView` enthält kein Fremdwissen — geprüft an der Serialisierung |
| `tests/unit/eslintBoundary.test.ts` | Die Engine kann React, Next, DB und `Math.random` nicht importieren |
| `tests/unit/noLieActions.test.ts` | Die vier verbotenen Aktionen existieren im Quelltext nicht |

Der `no-omniscience`-Test prüft **nicht** gegen die Perception-Funktion — das
wäre ein Vergleich mit sich selbst. Er rekonstruiert die Aufenthaltsorte
unabhängig aus dem Event-Log (Startpositionen plus `agent_moved`-Events) und
prüft jeden Wissenseintrag gegen diese Rekonstruktion.

## Was gebaut ist

| Datei | Aufgabe |
|---|---|
| `core/rng.ts` | seeded PRNG mit benannten Streams; ein neuer Stream verschiebt bestehende Folgen nicht |
| `core/hash.ts` | kanonisches JSON + stabiler Rolling-Hash, ohne Abhängigkeiten |
| `core/eventLog.ts` | Append-only-Log mit fortlaufendem Log-Hash |
| `core/types.ts` | `WorldState`, `Agent`, `Location`, `WorldEvent`, `Effect`, `MatchConfig` |
| `core/schemas.ts` | Zod für Stufe 1 der Validierungskette |
| `core/invariants.ts` | `assertInvariants` + Gesamtbestandsrechnung |
| `world/initWorld.ts` | 6 Orte, N Agenten mit gezogener Persönlichkeit, alles aus dem Seed |
| `world/upkeep.ts` | Phase 1: Regeneration, Sättigungsverfall, Streaks, Ausscheiden |
| `world/perception.ts` | Phase 2: Beobachterset für alle 5 Scopes, einzige Wissensquelle |
| `world/scoring.ts` | Phase 11: Score, Leaderboard, Endbedingung |
| `information/infoRegistry.ts` | InfoItem-Identität, `resolveTrueValue` |
| `information/knowledge.ts` | `KnowledgeEntry`, Verfall der Sicherheit, Assert-Schwelle |
| `agents/agentView.ts` | die abgeschottete Sicht eines Agenten (Doc 05 §5.1) |
| `mutation/stateMutator.ts` | die einzige Schreibstelle, inkl. Erhaltungsprüfung |
| `actions/defs/` | `rest`, `gather_resource`, `move`, `consume` |
| `actions/resolutionOrder.ts` | Klassenreihenfolge + Initiative (Doc 04 §4.3) |
| `decision/policyProvider.ts` | deterministische Utility-Policy auf `AgentView` (Vorstufe von T23) |
| `validation/validateAction.ts` | Validierungskette, Stufen 1, 2, 4, 5, 9 |
| `runner/runRound.ts` | Phasen 1, 2, 3, 4, 5, 6, 7, 11 |
| `cli/sim.ts` | headless, JSON-Report |

## Bewusste Abweichungen von der Spezifikation

Jede davon ist eine Entscheidung, keine Auslassung.

1. **Kein Next.js.** T01 verlangt ein Next-Setup mit lauffähigem `pnpm dev`.
   Schritt 1 hat kein UI, und die UI ist Tag 7. Ein Next-Gerüst hätte jetzt eine
   ~300 MB grosse Abhängigkeit und ein `tsconfig` mit DOM-Typen gebracht, damit
   eine Platzhalterseite lädt. Die Engine ist per Doc 02 §2.1 ohnehin
   framework-frei; die Boundary-Regel steht und ist getestet. Next kommt mit dem
   ersten Bildschirm, der etwas anzeigt.

2. **`eventSeq` steht nicht im `WorldState`** (Doc 03 §3.1), sondern im
   `EventLog`. Ein Zähler im State, den jemand ausserhalb des `StateMutator`
   hochzählt, wäre ein direkter Bruch von Regel 1. Beim Resume wird er aus der
   Länge des Logs rekonstruiert.

3. **Zwei zusätzliche Effect-Typen** gegenüber Doc 03 §3.8: `location_stock`
   (ohne die Ortsseite wäre eine Ernte eine Quelle aus dem Nichts und die
   Erhaltungsregel nicht prüfbar) und `round_advance` / `match_end` (auch
   Rundenzähler und Match-Status sind World State).

4. **Ein leergelaufener Ernteversuch kostet Energie.** Nicht aus der Spec — Doc
   04 §4.3 regelt nur, dass Konflikte first-come-first-served ausgehen. Ohne
   Kosten ist der Versuch gratis wiederholbar; gemessen waren das 8 625
   Fehlversuche auf 11 477 Ernten in 400 Runden, ein Leerlauf, der das Log
   dominiert.

5. **Die Policy kennt die Zahl der Anwesenden am eigenen Ort.** Das ist Wissen,
   das ein Agent hat, ohne dass es ein Wahrnehmungssystem braucht — er steht
   daneben. Seit Tag 2 erzwingt die `AgentView`-Signatur die Grenze.

6. **`InfoItem` trägt keinen `trueValue`** (Doc 03 §3.4.1). Das wäre eine zweite
   Kopie derselben Wahrheit — der Bestand steht bereits in `Location.stock` —
   die bei jeder Mutation mitgepflegt werden müsste und auseinanderläuft. Genau
   die Begründung, mit der Doc 06 §6.1 den dritten Speicher gestrichen hat.
   Stattdessen löst `resolveTrueValue` den Wert bei Bedarf aus dem `WorldState`
   auf. Nebeneffekt: „kein Agent liest je `trueValue`" ist kein Vorsatz mehr,
   sondern eine Funktion, die im Entscheidungspfad nicht aufrufbar ist.

7. **Der Verfall der Sicherheit ist eine Rechnung beim Lesen, kein Effekt pro
   Runde.** 30 Agenten × 20 Einträge × 400 Runden wären 240 000 Effekte, die
   nichts tun außer eine Zahl zu verkleinern. Gespeichert wird die Sicherheit
   zum Zeitpunkt der letzten Bestätigung; was heute gilt, rechnet
   `effectiveCertainty`.

8. **`generate` liest den `WorldState`, `decide` nur die `AgentView`.** Doc 04
   §4.0 und Doc 05 §5.1 widersprechen sich hier. Aufgelöst nach Zweck: der
   Generator muss gegen die Weltwahrheit prüfen, sonst kann er keine Legalität
   garantieren (Doc 08 §8.2.4, erste Verteidigungslinie) — und was dabei zählt,
   ist ohnehin am eigenen Ort sichtbar. Bewertet wird ausschließlich auf der
   Sicht.

## Zwei Fehler, die das Messen aufgedeckt hat

Beide waren in Tag 1 nicht sichtbar, weil es die Aktionen noch nicht gab, mit
denen sie sich zeigen.

1. **`move` wurde in 400 Runden kein einziges Mal gewählt.** Ursache war nicht
   das Gewicht des Ortswechsels, sondern die Bewertung des Erntens: sie addierte
   einen Term für vorhandene Energie, also gewann Ernten auch dort, wo nichts
   mehr lag. Jetzt sind alle Ertragsterme mit dem erwarteten Anteil
   multipliziert — wo nichts zu holen ist, ist der Wert null, und Weggehen wird
   vergleichbar. Nebeneffekt: die Fehlerntenquote fiel von 47 % auf 41 %.

2. **Zehn von 30 Agenten verhungerten an Orten, an denen sie nicht verhungern
   mussten.** `workshop` und `outskirts` haben Nahrungskapazität 0 — dort kann
   nie etwas nachwachsen. Wer dort startete, blieb sitzen, weil die Policy nur
   nach Ertragsaussicht verglich und Verhungern nicht als eigenen Grund zum
   Gehen kannte. Mit einem Überlebensterm (kein Essen hier, kein Vorrat, fallende
   Sättigung) sank das auf 4 Ausgeschiedene.

## Beobachtungen aus dem Lauf (Seed 42, 400 Runden, 30 Agenten)

| Größe | Wert |
|---|---|
| Überlebende | 26 von 30 |
| Aktionen | 6 696 ernten, 3 707 ruhen, 574 essen, 179 umziehen |
| Reject-Rate der Validierungskette | 0 |
| Fehlernten (FCFS verloren) | 2 719 von 6 696 |
| Wissenseinträge je Agent | ⌀ 6 |
| Überzeugungen über andere Orte | 21 |
| veraltete Überzeugungen am Matchende | 59 |

Die 59 veralteten Überzeugungen sind kein Mangel, sondern der Beleg, dass das
Wissenssystem etwas anderes ist als eine Kopie der Weltwahrheit: Agenten glauben
Dinge, die nicht mehr stimmen. Genau darauf baut die Truthfulness-Regel auf —
ein Agent, der eine veraltete Überzeugung ausspricht, irrt sich, er lügt nicht
(Doc 03 §3.4.2). Der Determinismus-Test prüft diese Eigenschaft mit.

## Was noch offen ist

- **41 % der Ernten laufen ins Leere.** Kein Validierungsfehler — die Reject-Rate
  ist exakt 0 —, sondern echte Knappheit: 30 Agenten auf 6 Orten mit zusammen
  ~36 Einheiten Regeneration pro Runde. `trade` (T17) und
  `share_information` (T18) fehlen noch, also gibt es keine Möglichkeit,
  Knappheit anders als durch Weggehen aufzulösen. Eingang für den
  Kalibrierungs-Sweep (T43).
- **Wissen entsteht nur durch Anwesenheit.** Der zweite Pfad —
  `share_information` — kommt mit T18. Bis dahin ist die Informationsasymmetrie
  vollständig, aber statisch.
- **Nur `stock_at_location` und `event_occurred` werden je erzeugt.** Die
  übrigen fünf `InfoTopic`-Werte existieren als Typ; ihre Systeme (Allianzen,
  Pledges, Absichtserklärungen) kommen ab T20.
- **Die Ökonomiezahlen sind ungemessen.** Sämtliche Werte in `core/config.ts`,
  `world/locations.ts` und `decision/policyProvider.ts` sind **[ANNAHME]**.

## Nächster Schritt

Tag 3 (`12-build-order.md`): **T12, T13, T14, T15** — `Statement`-Typen mit
`Disclosure` und Bucket-Tabelle, der **Truth-Validator R1–R7 + R9**, die
vollständige Validierungskette und das Aktionsregister mit
`resolutionOrder`.

Gate: die Testtabelle aus Doc 08 §8.3 vollständig grün. Ab da ist die
Truthfulness-Regel bewiesen statt behauptet — und die Vorarbeit dafür steht
bereits: `KnowledgeEntry` trennt Glauben, Sicherheit und Quelle, und
`canAssertAsFact` setzt R2 und R6 schon um.
