# AI Battle Royale — deterministischer Kern

Schritt 1 aus `12-build-order.md`, Tag 1: **T01, T02 (reduziert), T03–T07** plus
den Kern von T09 (CLI). Eine Welt entsteht aus einem Seed, 100 Runden laufen
headless durch mit nur `rest` und `gather_resource`, und der Event-Log-Hash ist
reproduzierbar.

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
| `--rounds 100 --agents 30 --seed 42` | Log-Hash `81c32a17c816f6b4`, 3 202 Events, ~145 ms |
| `--rounds 400 --agents 30 --seed 42` | Log-Hash `2b7b1d6c002d2e7b`, 12 802 Events, ~371 ms |
| `pnpm test` | 12 Dateien, 147 Tests grün, ~5 s |

Der Zielwert aus Doc 01 §1.5.7 (400 Runden × 30 Agenten headless unter 5 s) wird
mit ~0,4 s eingehalten — bei zwei Aktionen und ohne Wahrnehmung, Memory und
Lernen. Die Zahl wird mit jeder weiteren Phase neu zu messen sein.

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
| `world/upkeep.ts` | Phase 1: Regeneration, Sättigungsverfall, Streak-Zähler |
| `world/scoring.ts` | Phase 11: Score, Leaderboard, Endbedingung |
| `mutation/stateMutator.ts` | die einzige Schreibstelle, inkl. Erhaltungsprüfung |
| `actions/defs/rest.ts`, `gatherResource.ts` | die zwei implementierten Aktionen |
| `actions/resolutionOrder.ts` | Klassenreihenfolge + Initiative (Doc 04 §4.3) |
| `decision/policyProvider.ts` | deterministische Utility-Policy (Vorstufe von T23) |
| `validation/validateAction.ts` | Validierungskette, Stufen 1, 2, 4, 5, 9 |
| `runner/runRound.ts` | Phasen 1, 3, 4, 5, 6, 7, 11 |
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
   daneben. Ab T23 erzwingt die `AgentView`-Signatur die Grenze; bis dahin ist es
   eine Regel im Review.

## Was auffällt und noch nicht gelöst ist

- **47 % der Ernten laufen ins Leere** (4 038 von 8 615 über 400 Runden). Das ist
  kein Validierungsfehler — die Reject-Rate der Kette ist exakt 0 —, sondern
  echte Knappheit: 30 Agenten stehen fest auf 6 Orten, deren Regeneration
  zusammen ~36 Einheiten pro Runde beträgt, und können weder ausweichen (`move`,
  T16) noch tauschen (`trade`, T17). Die Zahl gehört beobachtet, sobald diese
  Aktionen existieren, und ist ein Eingang für den Kalibrierungs-Sweep (T43).
- **Nahrung hat keine Senke.** `consume` (T16) fehlt, also wächst der Vorrat
  einzelner Agenten über ein langes Match auf mehrere hundert Einheiten. Erwartet
  und ab T08/T16 erledigt.
- **Niemand scheidet aus.** Verhungern und Erschöpfung sind T08. Die Zähler
  (`hungerStreak`, `exhaustionStreak`) laufen bereits mit.
- **Die Ökonomiezahlen sind ungemessen.** Sämtliche Werte in `core/config.ts`,
  `world/locations.ts` und `decision/policyProvider.ts` sind **[ANNAHME]**.

## Nächster Schritt

Tag 2 (`12-build-order.md`): **T08, T10, T11, T16** — Bedürfnisse und
Ausscheiden, InfoRegistry und `KnowledgeEntry` mit `certainty`-Verfall,
Perception als einzige Wissensquelle, dazu `move` und `consume`.
Gate: `no-omniscience.test.ts` und `agent-view-isolation.test.ts` grün.
