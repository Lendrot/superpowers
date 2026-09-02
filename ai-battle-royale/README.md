# AI Battle Royale — deterministischer Kern, Wahrnehmung, Wahrheit

Stand: **Tag 1 bis Tag 3** aus `12-build-order.md`.

- **Tag 1** (T01, T02 reduziert, T03–T07, Kern von T09): Welt aus Seed, Runden
  laufen headless, Event-Log-Hash reproduzierbar.
- **Tag 2** (T08, T10, T11, T16): Agenten essen, ziehen um und scheiden aus.
  Wissen entsteht ausschließlich in Phase 2 und veraltet. Entscheidungen fallen
  nur noch auf Basis einer `AgentView`.
- **Tag 3** (T12–T15): jede Äußerung ist ein `Statement`-Objekt und läuft durch
  den Truth-Validator. Die Regel „kein Agent darf lügen" ist ab hier keine Bitte
  an ein Sprachmodell mehr, sondern eine Funktion mit einer Testtabelle.
- **Erweiterung außerhalb der Spezifikation** (auf Ansage): Fähigkeiten, die
  sich entwickeln, Instinkte, die daraus folgen, Macht als Ziel, und ein
  Kampfsystem, in dem Agenten einander töten können. Siehe unten.

Kein UI, kein LLM, keine Allianzen, kein Handel, kein Lernsystem.

## Fähigkeiten, Instinkte, Macht, Gewalt

Alle Agenten starten mit **je 50** in Intelligenz, Kraft und Intuition — und
jeder weiß das (`AgentView.world.startingAttribute`). Was sie werden,
entscheidet ihr Weg:

| Fähigkeit | Wächst durch | Instinkt |
|---|---|---|
| **Intelligenz** | Ruhen (Nachdenken), neues Wissen | **Überlebensinstinkt** — isst und ruht früher, schätzt Risiken ernster ein |
| **Kraft** | Ernten (körperliche Arbeit), gewonnene Kämpfe | **Machtinstinkt** — sucht Vorrang und Auseinandersetzung |
| **Intuition** | Fehlernten, Umziehen, verlorene Kämpfe | **Glück** — wirkt auf jeden Wurf, den der Agent macht |

**Die Gewinne sind nicht gleich groß, weil die Ereignisse nicht gleich häufig
sind.** Gemessen pro Agent und Runde: 0,574 Ernten, 0,328 Ruhepausen, 0,193
Fehlernten, 0,008 Ortswechsel. Bei einem einheitlichen Gewinn von 4 lag Intuition
deshalb bei *jedem* Agenten auf dem Grundwert — sie hing an der mit Abstand
seltensten Handlung. Umziehen zählt jetzt fünfmal so viel, und Fehlernten sind
eine zweite, häufige Quelle: wer oft danebengreift, lernt zu erkennen, wo sich
das Hinsehen lohnt. Das ist bewusst eine Rückkopplung *gegen* den Erfolg — Glück
wächst dort, wo es bisher fehlte.

Gespeichert wird nicht die Fähigkeit, sondern die Erfahrung dahinter; der Wert
ist eine Funktion davon. Was nicht benutzt wird, bildet sich zurück — der
Verfall wächst mit dem Niveau, hört aber bei einer Grundkompetenz auf. Dadurch
bildet die Fähigkeit ab, **wie oft** ein Agent etwas tut: wer 80 % seiner Runden
erntet, landet bei Kraft ~80; wer sich verteilt, bei je ~33.

**Glück ist wörtlich gemeint.** `luckyRoll` würfelt bei Intuition 0 einmal, bei
100 dreimal und nimmt den besten Wurf. Monoton, beschränkt, deterministisch, mit
ausrechenbarem Erwartungswert (¾ statt ½) — anders als ein Bonus, den man auf
das Ergebnis addiert.

**Macht** ist eine abgeleitete Kennzahl, kein Bestand — genau wie Doc 03 §3.2.2
es für `influence` verlangt: 45 % Kraft, 20 % Intelligenz, 10 % Intuition, 15 %
Besitz, 10 % Getötete (gedeckelt bei drei — Macht ist keine Leichenzählung).

**Kampf.** Kraft × (0,7 + 0,6 · Wurf) auf beiden Seiten, jeweils mit eigenem
Glück; der Verteidiger zusätzlich × (1 + 0,4 · Intelligenz/100) — Klugheit
schützt, ohne Kraft zu ersetzen. Tödlich ab einem Vorsprung von 35 % **oder**
wenn der Schaden den Erschöpften umwirft; der zweite Weg ist der übliche, weil
der erste zwischen vergleichbaren Agenten fast nie eintritt. Der Sieger erbeutet
Vorräte. Ein Angriff kann nach hinten losgehen: fällt der Vergleich zugunsten
des Verteidigers aus, trägt der Angreifer den Schaden.

**Wer angreift, entscheidet die Veranlagung.** Dominanz und Ehrgeiz treiben,
Empathie und Loyalität halten zurück. Und weil beides driftet (Phase 8), fällt
der zweite Schlag leichter als der erste: wer die Hand erhebt, gewöhnt sich
daran.

**Was ein Angreifer über sein Ziel weiß, ist eine Schätzung.** Fremde Kraft wird
nur beobachtbar, wer einen Kampf gesehen hat (`agent_attribute`-Info,
Volatilität `slow`). Ohne eigene Beobachtung bleibt der Startwert — er kann sich
also irren, und das ist der Punkt.

## Abnahme

```bash
pnpm install
pnpm sim --matches 1 --rounds 100 --agents 30 --seed 42 --llm off
pnpm test
```

Gemessen auf Node 22 in dieser Umgebung:

| Lauf | Ergebnis |
|---|---|
| `--rounds 100 --agents 30 --seed 42` | Log-Hash `e15088a943e93825` |
| `--rounds 400 --agents 30 --seed 42` | Log-Hash `78d0b84f03cd5a1b` |
| `pnpm test` | 26 Dateien, 336 Tests grün |

Die drei Golden-Hashes wurden mit Tag 3 neu geschrieben. Die **Ereignisfolge ist
dabei unverändert** — nachgerechnet über das kanonische JSON aller Events ohne
ihr `matchId`-Feld, vor und nach der Änderung derselbe Wert. Verschoben hat sich
nur die `MatchId`: sie hängt am Seed **und an der Konfiguration**, und die
`MatchConfig` trägt seit Tag 3 die Bucket-Tabelle. Die Welt heißt anders, sie
verhält sich nicht anders.

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
| `tests/simulation/movement.test.ts` | Die Welt friert nicht ein — Bewegung bleibt über den ganzen Lauf möglich |
| `tests/unit/truthValidator.test.ts` | **Die Tabelle aus Doc 08 §8.3, vollständig** — der wichtigste Test des Projekts |

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
| `information/statements.ts` | `Disclosure`, Bucket-Tabelle, `entails`, Widerspruchsrechnung für R7 |
| `information/statementLog.ts` | was ein Agent zuletzt behauptet hat — das Gedächtnis hinter R7 |
| `validation/truthValidator.ts` | R1–R7 + R9 gegen den **Wissensstand**, nie gegen die Weltwahrheit |
| `agents/agentView.ts` | die abgeschottete Sicht eines Agenten (Doc 05 §5.1) |
| `mutation/stateMutator.ts` | die einzige Schreibstelle, inkl. Erhaltungsprüfung |
| `actions/defs/` | `rest`, `gather_resource`, `move`, `consume`, `attack` |
| `agents/attributes.ts` | Fähigkeiten, Instinkte, Glück, Macht — alles abgeleitet |
| `world/consequence.ts` | Phase 8: Erfahrungsgewinn und -verfall, Drift der Veranlagung |
| `actions/resolutionOrder.ts` | Klassenreihenfolge + Initiative (Doc 04 §4.3) |
| `decision/policyProvider.ts` | deterministische Utility-Policy auf `AgentView` (Vorstufe von T23) |
| `validation/validateAction.ts` | Validierungskette, Stufen 1, 2, 4, 5, 6, 7, 9 |
| `runner/runRound.ts` | Phasen 1, 2, 3, 4, 5, 6, 7, 8, 11 |
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

8. **Töten ist möglich.** Doc 01 §1.4 schließt ein Kampf- und Tötungssystem
   ausdrücklich aus („Schwerpunkt ist sozial. Ausscheiden nur über Bedürfnisse
   und Exile"). Auf Ansage aufgehoben: `attack`, `EliminationCause: 'killed'`.
   Der Rest der Architektur bleibt unangetastet — der Kampf ist eine reine
   Funktion, jeder Wurf läuft durch einen benannten Stream.

9. **Die Persönlichkeit driftet.** Doc 03 §3.2.1 nennt sie konstant. Auf Ansage
   verschiebt Phase 8 sie um höchstens ±1 pro Runde und Achse — die Deckelung
   ist aus Doc 03 §3.2.4 übernommen, wo sie für die Strategiegewichte gilt und
   mit oszillierenden Agenten begründet wird.

10. **`Disclosure` im Modus `exact` trägt einen Wert.** Doc 03 §3.4.3 schreibt
   `{ mode: 'exact' }` ohne Feld, während die `entails`-Funktion in Doc 08
   §8.2.2 R3 `disclosure.value` liest. Ohne Wert wäre „exakt" nicht prüfbar.

11. **R7 wird vor R3 ausgewertet.** Die Testtabelle in §8.3 erwartet für
   „sagte gestern `much`, Wissen unverändert, sagt heute `none`" den Grund
   `self_contradiction` — obwohl R3 denselben Fall als `false_assertion` fängt.
   §8.2.2 nummeriert die Regeln nur; eine Auswertungsreihenfolge legt §8.1 fest,
   und zwar für die *Stufen* der Kette, nicht für die Regeln darin. Der
   Selbstwiderspruch ist die genauere Diagnose: er benennt, dass zwei Aussagen
   nicht zusammenpassen, statt nur, dass eine falsch ist.

12. **Der `TruthContext` trägt zusätzlich das `infoRegistry`.** Die Signatur aus
   §8.2.3 kann R2 und R3 gar nicht ausrechnen: ohne das `InfoItem` gibt es weder
   Volatilität (also keinen Sicherheitsverfall) noch Thema (also keine
   Bucket-Grenzen).

13. **`partial_disclosure` mit `mode: 'exact'` fällt in Stufe 1, nicht in
   Stufe 7.** Doc 03 §3.4.3 nennt diese Form „stets unpräzise". Ein exakter Wert
   darin ist keine unwahre Aussage, sondern gar kein `partial_disclosure` — also
   `schema_invalid`, nicht `false_assertion`.

14. **Zwei Zeilen der Testtabelle §8.3 sind angepasst,** beides notwendig und im
   Test begründet: die Tabelle spricht von `tools`, einer Ressource, die Doc 03
   §3.2.2 in `materials` hat aufgehen lassen; und die beiden R7-Zeilen laufen
   über `coins`. Letzteres ist das Einzige, was die Zeile „Wissen hat sich auf 2
   geändert → heute `none` ✅" widerspruchsfrei macht: bei den Münzgrenzen aus
   §8.2.2 (`none: 0–5`) ist 2 tatsächlich `none`, bei einem Ortsbestand (`some`
   ab 1) wäre es `some` und die Aussage schon an R3 gescheitert.

15. **`generate` liest den `WorldState`, `decide` nur die `AgentView`.** Doc 04
   §4.0 und Doc 05 §5.1 widersprechen sich hier. Aufgelöst nach Zweck: der
   Generator muss gegen die Weltwahrheit prüfen, sonst kann er keine Legalität
   garantieren (Doc 08 §8.2.4, erste Verteidigungslinie) — und was dabei zählt,
   ist ohnehin am eigenen Ort sichtbar. Bewertet wird ausschließlich auf der
   Sicht.

## Drei Fehler, die das Messen aufgedeckt hat

Alle drei waren in Tag 1 nicht sichtbar, weil es die Aktionen noch nicht gab,
mit denen sie sich zeigen.

0. **Die Welt fror nach Runde 289 ein.** In den folgenden 1 700 Runden zog kein
   einziger Agent mehr um. Die Ursache war kein Gewicht, sondern eine
   Größenordnung: der Erkundungsterm der Policy erreichte höchstens 0,15, die
   Wegkosten mindestens 0,45 — Nachsehen konnte also *nie* gewinnen. Sobald die
   Überzeugungen über die Nachbarorte verfallen waren, war die Neugier dauerhaft
   unbezahlbar. Ausgerechnet der Wissensverfall aus T10, der Neugier auslösen
   sollte, schaltete sie ab.

   Zwei Korrekturen: Unwissen ist ein Grad (`1 - certainty`) statt eines
   Zustands (`certainty === 0`), und Erkundung ist Luxus — sie zählt nur, wenn
   Energie und Vorrat es zulassen, dafür dann stark genug, um die Wegkosten zu
   schlagen. Zusätzlich vergleicht die Erinnerung an einen anderen Ort jetzt
   gegen den eigenen Standort, statt absolut zu werten; vorher zog eine
   Erinnerung an „dort lagen 20" auch dann, wenn hier 40 lagen.

   Ergebnis über 2 000 Runden: 1 154 / 972 / 930 / 976 Ortswechsel je Viertel
   statt 179 / 0 / 0 / 0.

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
| Überlebende | 30 von 30 |
| Aktionen | 7 232 ernten, 3 276 ruhen, 892 umziehen, 600 essen |
| Reject-Rate der Validierungskette | 0 |
| Fehlernten (FCFS verloren) | 2 878 von 7 232 |
| Laufzeit | ~0,63 s |

Veraltete Überzeugungen sind kein Mangel, sondern der Beleg, dass das
Wissenssystem etwas anderes ist als eine Kopie der Weltwahrheit: Agenten glauben
Dinge, die nicht mehr stimmen. Genau darauf baut die Truthfulness-Regel auf —
ein Agent, der eine veraltete Überzeugung ausspricht, irrt sich, er lügt nicht
(Doc 03 §3.4.2). `noOmniscience.test.ts` prüft diese Eigenschaft mit.

## Die Ökonomie ist zu großzügig — gemessen, nicht vermutet

Dass jetzt alle 30 Agenten überleben, ist **kein** Zeichen von Balance. Bis zur
Reparatur der Bewegung starben Agenten nicht an Knappheit, sondern weil sie an
Orten festsaßen, an denen nie Nahrung nachwächst. Die eigentlichen Zahlen:

| `satietyDecayPerRound` | Bedarf/Runde | Überlebende von 30 |
|---|---|---|
| **1 (Default)** | 1,2 | 30 |
| 4 | 4,8 | 24 |
| 8 | 9,6 | 23 |
| 12 | 14,4 | 21 |
| 20 | 24,0 | 18 |

Dem steht ein Nahrungsnachschub von **23 pro Runde** gegenüber (fields 12,
well 6, commons 3, warehouse 2). Beim Default ist das ein 19-facher Überschuss —
Nahrung ist wertlos, und damit wären auch Handel (T17) und Allianzlager (T20)
ohne Einsatz. Der Default bleibt vorerst bei 1, weil Kalibrierung eine eigene
Aufgabe ist (T43) und jede Änderung alle Golden-Hashes verschiebt;
`tests/integration/elimination.test.ts` prüft das Ausscheiden deshalb unter
`satietyDecayPerRound: 8`.

## Beobachtungen aus dem Lauf mit Fähigkeiten und Kampf

Seed 42, 600 Runden, 30 Agenten:

| Fähigkeit | Spanne der Überlebenden | Median |
|---|---|---|
| Kraft | 51–65 | 62 |
| Intuition | 25–67 | 28 |
| Intelligenz | 33–37 | 35 |

Intuition ist damit ein **Spezialistenmerkmal**: die meisten bleiben nahe der
Grundkompetenz, einzelne entwickeln sie stark. Intelligenz streut am wenigsten,
weil Ruhen bei allen ähnlich häufig ist — das ist der nächste
Kalibrierungspunkt, kein Konstruktionsfehler.

## Was noch offen ist

- **40 % der Ernten laufen ins Leere** (2 878 von 7 232). Kein
  Validierungsfehler — die Reject-Rate ist exakt 0 —, sondern die Konkurrenz um
  denselben Bestand: der Agent sieht beim Entscheiden, wie viel da liegt und wer
  daneben steht, aber nicht, wer vor ihm aufgelöst wird. `trade` (T17) und
  `share_information` (T18) fehlen noch, also gibt es keine Möglichkeit, das
  anders als durch Weggehen aufzulösen. Eingang für den Kalibrierungs-Sweep (T43).
- **Wissen entsteht nur durch Anwesenheit.** Der zweite Pfad —
  `share_information` — kommt mit T18. Bis dahin ist die Informationsasymmetrie
  vollständig, aber statisch.
- **Nur `stock_at_location` und `event_occurred` werden je erzeugt.** Die
  übrigen fünf `InfoTopic`-Werte existieren als Typ; ihre Systeme (Allianzen,
  Pledges, Absichtserklärungen) kommen ab T20.
- **Intelligenz streut kaum** (33–37), weil Ruhen bei allen ähnlich häufig ist.
  Anders als bei Intuition ist die Quelle nicht zu selten, sondern zu
  gleichverteilt — es fehlt eine Handlung, bei der sich Agenten im Denken
  unterscheiden. Kandidat: `investigate` (T35).
- **Die Ökonomie- und Gewichtungszahlen sind Kalibrierungsmaße, keine
  Messwerte.** Sämtliche Werte in `core/config.ts`, `world/locations.ts` und
  `decision/policyProvider.ts` sind **[ANNAHME]** und gehören in den Sweep (T43).
  Beim Einbau der Fähigkeiten habe ich mehrfach zwischen Gewichten oszilliert,
  die sich gegenseitig aufhoben; der jetzige Stand ist ein funktionierender,
  kein ausbalancierter.

## Der Truth-Validator läuft — aber noch niemand redet

Das ist der ehrliche Stand nach Tag 3. Die Kette prüft Stufe 7 bei jeder Aktion,
die ein `Statement` trägt; nur trägt bis T18 keine implementierte Aktion eines,
weil `share_information` noch fehlt. `allowsStatement` ist überall `false`.

Die Stufen 6 und 7 hängen deshalb nicht ungetestet in der Kette: der Test
`validateAction.test.ts` dreht die Erlaubnis für die Dauer eines Falls um und
prüft beide Richtungen durch die echte Kette. Genau dafür ist das Flag da — die
Kette selbst kennt keine Aktionsnamen. Der Validator selbst ist unabhängig davon
vollständig getestet (Tabelle §8.3 plus Randfälle von `entails`, den
Bucket-Grenzen und der Widerspruchsrechnung).

Was das heißt: die Regel ist **bewiesen**, aber im laufenden Match noch nicht
**belastet**. Die Kennzahl `falseAssertionsRejected` aus Doc 08 §8.2.4 ist
aktuell trivial 0, weil niemand spricht. Erst mit T18 wird sie aussagekräftig.

## Nächster Schritt

Tag 4 (`12-build-order.md`): **T17, T18, T19** — `trade`, `share_information`
und `request_information`, dazu das Beziehungssystem. Damit bekommt der
Truth-Validator zum ersten Mal echte Arbeit: Wissen wandert von Agent zu Agent,
`told_by` entsteht im Spiel statt nur im Test, und die Hörensagen-Kette A→B→C
wird prüfbar.
