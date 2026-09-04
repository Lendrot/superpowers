# AI Battle Royale — deterministischer Kern, Wahrnehmung, Wahrheit, Sozialsystem

Stand: **Tag 1 bis Tag 4** aus `12-build-order.md` (T21 ausgenommen, siehe unten).

- **Tag 1** (T01, T02 reduziert, T03–T07, Kern von T09): Welt aus Seed, Runden
  laufen headless, Event-Log-Hash reproduzierbar.
- **Tag 2** (T08, T10, T11, T16): Agenten essen, ziehen um und scheiden aus.
  Wissen entsteht ausschließlich in Phase 2 und veraltet. Entscheidungen fallen
  nur noch auf Basis einer `AgentView`.
- **Tag 3** (T12–T15): jede Äußerung ist ein `Statement`-Objekt und läuft durch
  den Truth-Validator. Die Regel „kein Agent darf lügen" ist ab hier keine Bitte
  an ein Sprachmodell mehr, sondern eine Funktion mit einer Testtabelle.
- **Tag 4** (T17–T19; T21 fehlt noch, siehe „Was noch offen ist"): `trade` mit
  Gegenangebot, `share_information`/`request_information` mit echtem
  Wissenstransfer, ein Beziehungssystem mit acht Dimensionen. Der
  Truth-Validator prüft jetzt echte Aussagen statt nur seiner eigenen
  Testtabelle — die Hörensagen-Kette A→B→C ist beweisbar, nicht nur behauptet.
- **Erweiterung außerhalb der Spezifikation** (auf Ansage): Fähigkeiten, die
  sich entwickeln, Instinkte, die daraus folgen, Macht als Ziel, und ein
  Kampfsystem, in dem Agenten einander töten können. Siehe unten.

Kein UI, kein LLM, keine Allianzen, keine Zusagen, kein Lernsystem.

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

## Sozialsystem: Handel, Wissenstransfer, Beziehungen

**`trade` (T17).** Ein Angebot ist `{ give, want }`, je eine Ressourcenart. Das
Ziel bewertet es sofort — kein Wurf, eine Rechnung: `wert(empfangen) /
wert(hergegeben)` gegen eine Schwelle, die von Gier (Ehrgeiz, Manipulation),
Großzügigkeit (Empathie) und bestehendem Vertrauen abhängt. Liegt das Angebot
deutlich darunter: Ablehnung. In der Verhandlungszone: ein Gegenangebot, das
für das Ziel selbst gerade noch fair wäre — der ursprüngliche Anbieter bewertet
das sofort mit derselben Rechnung, ohne zweite Runde. `RESOURCE_VALUE` (Food
1,2, Materials 1,5, Coins 0,4) ist **[ANNAHME]**, aber nicht frei gegriffen:
abgeleitet aus den bereits vorhandenen Bucket-Grenzen und Startbeständen (siehe
Code-Kommentar in `trade.ts`).

**`share_information` / `request_information` (T18).** `share_information`
trägt ein **Pflicht-Statement** — die einzige Aktion, bei der das gilt.
`generate` wählt die zuletzt bestätigte Überzeugung des Senders und baut daraus
die präziseste legale Aussage (`information/disclosurePolicy.ts`); Stufe 7
prüft trotzdem nach. `request_information` behauptet selbst nichts
(`allowsStatement: false`) — die eigentliche Aussage entsteht **inline** beim
Befragten, während `resolve` läuft, und verbraucht dessen Rundenzug nicht (Doc
04 §4.1). Wie offen geantwortet wird, hängt von `honesty` ab (Doc 03 §3.2.1):
hohe Werte bevorzugen `assert_fact` mit hoher Präzision, niedrige `withhold`.
Ob überhaupt geantwortet wird, ist ein Wurf — eine Charakterfrage, kein
Kalkül, anders als bei `trade`.

Der Wissenstransfer selbst läuft **nie** über `infoRefs`/Phase 2: Der neue
`told_by`-Eintrag entsteht direkt als Effekt, mit `believedValue` aus
`impliedValue()` (der konservativsten Zahl, die die Disclosure noch erfüllt)
und `certainty × hearsayRetention` (**[ANNAHME]** 0,7). Träge die geteilte
`InfoId` stattdessen in `infoRefs`, würde Phase 2 beim nächsten Durchlauf die
**Weltwahrheit** an alle Anwesenden verteilen, nicht nur die Aussage an den
Empfänger — Hörensagen würde zu perfekter Beobachtung. Jede Weitergabe verliert
Sicherheit: A (beobachtet, 1.0) → B (`told_by`, ~0,7) → C (`told_by` von B,
~0,49) — eine Flüsterpost-Kette, geprüft in
`tests/integration/hearsayChain.test.ts`.

**Beziehungen (T19).** `Relationship` ist gerichtet (`agents[a].relationships[b]`
ist *as Sicht*, nicht `b`s) und entsteht erst bei der ersten Interaktion.
`RELATIONSHIP_DELTA_TABLE` (`world/relationships.ts`) bildet jeden
zweiseitigen Event-Typ auf zwei Deltas ab — Akteur→Ziel und Ziel→Akteur, meist
unterschiedlich. Moduliert wird nach Doc 03 §3.3, wörtlich: Empathie verstärkt
einen Anstieg von Vertrauen/Freundschaft/Respekt/Anziehung, Loyalität dämpft
einen Anstieg von Argwohn. `debt` bleibt unmoduliert — eine Tatsache, keine
Empfindung. Auch Kampf löst jetzt Beziehungsfolgen aus: Angst und
Vertrauensverlust beim Opfer, Rivalität bei beiden.

## Abnahme

```bash
pnpm install
pnpm sim --matches 1 --rounds 100 --agents 30 --seed 42 --llm off
pnpm test
```

Gemessen auf Node 22 in dieser Umgebung:

| Lauf | Ergebnis |
|---|---|
| `--rounds 100 --agents 30 --seed 42` | Log-Hash `4a1b50a480c14df8` |
| `--rounds 400 --agents 30 --seed 42` | Log-Hash `e17a76f95ba18e2a` |
| `pnpm test` | 31 Dateien, 416 Tests grün |

Die drei Golden-Hashes wurden mit Tag 4 neu geschrieben — diesmal **mit**
Verhaltensänderung, nicht nur verschobener `MatchId`: Kampf löst zusätzliche
`relationship`-Effekte aus, und drei neue Aktionstypen stehen ab Runde 1 in
jedem Kandidatensatz. Auch wenn sie beim aktuellen Policy-Gewicht so gut wie
nie gewinnen (siehe „Was noch offen ist"), verschieben mehr Kandidaten in der
Liste, wie viele Tie-Break-Würfe vor einem später stehenden Kandidaten aus
demselben RNG-Stream gezogen werden (`policyProvider.ts#decide`). Determinismus
bleibt gewahrt — derselbe Seed liefert weiterhin denselben Lauf —, nur die
genaue Zahlenfolge wandert.

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
| `tests/integration/hearsayChain.test.ts` | Hörensagen-Kette A→B→C: korrekte Attribution, `hearsay` statt `assert_fact`, Sicherheitsverlust pro Station |
| `tests/unit/relationships.test.ts` | Jeder Eintrag der Delta-Tabelle liefert etwas; Modulation, Ringpuffer, Clamping |

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
| `agents/agentView.ts` | die abgeschottete Sicht eines Agenten (Doc 05 §5.1), inkl. eigener Beziehungssicht |
| `mutation/stateMutator.ts` | die einzige Schreibstelle, inkl. Erhaltungsprüfung |
| `actions/defs/` | `rest`, `gather_resource`, `move`, `consume`, `attack`, `share_information`, `request_information`, `trade` |
| `agents/attributes.ts` | Fähigkeiten, Instinkte, Glück, Macht — alles abgeleitet |
| `world/consequence.ts` | Phase 8: Erfahrungsgewinn und -verfall, Drift der Veranlagung |
| `world/relationships.ts` | `RELATIONSHIP_DELTA_TABLE`, Persönlichkeits-Modulation, Phase-8-Anwendung |
| `information/disclosurePolicy.ts` | `statementFor`/`deriveToldEntry` — ein `KnowledgeEntry` wird ein `Statement`, eine Aussage ein neuer `KnowledgeEntry` |
| `actions/resolutionOrder.ts` | Klassenreihenfolge + Initiative (Doc 04 §4.3) |
| `decision/policyProvider.ts` | deterministische Utility-Policy auf `AgentView` (Vorstufe von T23) |
| `validation/validateAction.ts` | Validierungskette, Stufen 1, 2, 4, 5, 6, 7, 9 |
| `runner/runRound.ts` | Phasen 1, 2, 3, 4, 5, 6, 7, 8, 11; zentrale R7-Anbindung für jede Aktion mit `statement` |
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

16. **`Effect` bekommt eine `relationship`-Variante, die von Doc 03 §3.8
   abweicht.** Dort trägt der Effekt nur `delta`. Die Buchhaltungsfelder
   (`interactions`, `lastInteractionRound`, `lastEventTypes`) fehlen dort —
   folgerichtig: sie sind keine Verschiebung, sondern vom `StateMutator` selbst
   hergeleitet. `eventType` ist deshalb Pflichtangabe im Effekt, kein Teil von
   `delta`.

17. **Der Wissenstransfer von `share_information`/`request_information` läuft
   nie über `infoRefs`.** Siehe „Sozialsystem" oben — sonst würde Phase 2 die
   Weltwahrheit an alle Anwesenden verteilen statt nur die Aussage an den
   Empfänger. `no-omniscience` (`tests/simulation/noOmniscience.test.ts`) prüft
   `told_by`-Einträge deshalb anders als beobachtete: nicht über `infoRefs` und
   Anwesenheit, sondern darüber, dass ihr `sourceEventId` ein echtes
   `information_shared`-Event ist, das den Agenten als Ziel trägt, für genau
   diese Info, von genau der behaupteten Quelle.

18. **`hearsayRetention` (Doc 04 §4.1 Nr. 6: „reduzierte certainty") ist eine
   Zahl, keine Spezifikationsvorgabe.** **[ANNAHME]** 0,7, in `DEFAULT_INFO`.

19. **`agent_resource`-InfoItems werden für alle Agenten vorregistriert,**
   analog zu `stock_at_location`/`agent_attribute` seit Tag 1/2 — aber
   (noch) von keiner Wahrnehmung gespeist. Ein Agent kann heute nur über
   `agent_resource` reden, wenn er es je über `share_information`/
   `request_information` gehört hat; niemand *beobachtet* fremde Vorräte direkt.
   Bewusst offen gelassen statt einer Wahrnehmungsregel erfunden, die die Spec
   nicht vorschreibt.

20. **`request_information` trägt kein eigenes `Statement`** (`allowsStatement:
   false`), obwohl Doc 04 §4.1 in der Statement-Spalte „ja" vermerkt. Der
   Fragende behauptet nichts — nur die Antwort des Ziels ist eine
   truth-geprüfte Aussage, konstruiert und validiert direkt in `resolve`, weil
   sie nicht dem Akteur der `AgentAction`, sondern dem Ziel gehört. Die
   zentrale R7-Anbindung in `runRound.ts` (die jede Aktion mit `action.statement`
   automatisch ins Gedächtnis nimmt) deckt das nicht ab — `requestInformation.ts`
   setzt den `statement`-Effekt deshalb selbst.

21. **`ActionContext` trägt jetzt `log: EventLog`.** Eine Aktion, die einen
   `KnowledgeEntry` direkt erzeugt (nicht über Phase 2), braucht dessen
   `sourceEventId`, bevor das eigene Event überhaupt existiert.
   `eventId(round, log.nextSeq)` sagt vorher, welche Id das erste von `resolve`
   zurückgegebene Event bekommen wird — sicher, weil `resolve` und das
   nachfolgende `emit()` synchron und ohne fremden Zwischenschritt
   aufeinanderfolgen (`runRound.ts`). Keine neue epistemische Ausnahme:
   `resolve` liest ohnehin den vollen `WorldState`.

22. **`trade` verhandelt in genau einer Runde, ohne Würfel.** Doc 04 §4.1
   nennt „accept/counter/decline", ohne Umläufe zu zählen. Ein Gegenangebot,
   auf das wieder ein Gegenangebot folgen könnte, bräuchte einen Mechanismus
   für unbegrenzte Umläufe innerhalb einer einzigen Aktionsauflösung — das
   Ziel senkt stattdessen seine Forderung genau so weit, dass der Tausch aus
   der eigenen Sicht gerade noch fair ist, und der ursprüngliche Anbieter
   bewertet das sofort. Kein Wurf, weil eine Kauf-Entscheidung eine Bewertung
   ist, kein Glücksspiel — anders als Kampf (`luckyRoll`) oder die
   Antwortbereitschaft bei `request_information` (dort ist Reden-Wollen eine
   Charakterfrage).

23. **Zwei neue `RejectReason`-unabhängige `EventType`-Marker:**
   `trade_countered` ist kein eigener Ausgang, sondern begleitet immer
   `trade_accepted` oder `trade_declined` — die Verhandlung selbst hat kein
   Ergebnis, nur das, was danach kam.

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

## Beobachtungen aus dem Lauf (Seed 42, 400 Runden, 30 Agenten) — Stand Tag 2, vor Kampf

Historischer Schnappschuss direkt nach der Bewegungsreparatur: noch ohne
`attack` (kommt erst mit den Fähigkeiten, Tag 3) und beim damaligen Default
`satietyDecayPerRound: 1`. Die aktuellen Zahlen unter dem heutigen Default
stehen im nächsten Abschnitt — sie sind nicht vergleichbar, weil seitdem
Kampf eine zweite Todesursache ist.

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

Neu gemessen (Fix 5, Opus-Review): die alte Fassung dieses Abschnitts zitierte
noch `satietyDecayPerRound: 1` als Default und eine Tabelle von vor Tag 3 —
der Code-Default ist seit der Kampf-Einführung `4` (`core/config.ts`, dort
auch die Begründung), und ohne `attack` in der Messung war die Tabelle
unvollständig: Kampf ist inzwischen die zweite Todesursache neben Verhungern.
Neu gelaufen mit demselben Seed/Agentenzahl/Rundenzahl wie oben, jetzt mit
Kampf:

| `satietyDecayPerRound` | Bedarf/Runde | Überlebende von 30 | davon verhungert/erschöpft | davon getötet (Kampf) |
|---|---|---|---|---|
| 1 | 1,2 | 23 | 1 | 6 |
| **4 (Default)** | 4,8 | 18 | 6 | 6 |
| 8 | 9,6 | 21 | 7 | 2 |
| 12 | 14,4 | 19 | 11 | 0 |
| 20 | 24,0 | 17 | 13 | 0 |

Nicht mehr monoton, und das ist der eigentliche Befund: mehr Hunger ersetzt
Kampf, statt sich zu ihm zu addieren. Bei knappem Default (4) verbringen
Agenten mehr Runden mit Ernten/Essen und weniger mit Angreifen — 320 `attack`
gegenüber 822 beim alten Default 1 — bis Knappheit ab `satietyDecayPerRound:
12` Kampf faktisch verdrängt (47 bzw. 17 `attack`, kein einziger tödlicher
Ausgang mehr). Beide Todesursachen ziehen aus demselben Handlungsbudget einer
Runde.

Dem Bedarf steht ein Nahrungsnachschub von **23 pro Runde** gegenüber (fields
12, well 6, commons 3, warehouse 2). Beim aktuellen Default (4) ist das immer
noch ein knapp 5-facher Überschuss auf dem Papier — dass trotzdem 40 % nicht
überleben, zeigt, dass Verteilung (FCFS, Ortsbindung) mehr entscheidet als die
Gesamtsumme. `satietyDecayPerRound` bleibt **[ANNAHME]** und Kalibrierungsmaß
(T43); jede weitere Änderung verschiebt wieder alle Golden-Hashes.
`tests/integration/elimination.test.ts` prüft das Ausscheiden weiterhin unter
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

- **`trade`, `share_information` und `request_information` gewinnen in der
  laufenden Simulation so gut wie nie.** Das ist der ehrlichste Befund von
  Tag 4, gemessen über sechs Seeds × 400 Runden × 30 Agenten: null
  `information_shared`-, `trade_accepted`- und verwandte Events. Nicht, weil
  die Aktionen kaputt sind — `generate`/`precondition`/`resolve` sind einzeln
  vollständig getestet, die Hörensagen-Kette ist bewiesen —, sondern weil ihr
  Policy-Gewicht bewusst klein gehalten ist. Der erste Versuch, es
  großzügiger zu setzen (vergleichbar mit `share_information: honesty ×
  sociability × 1.0`), ließ `move` ein zweites Mal komplett einfrieren: 0
  Ortswechsel nach Runde 300 in einem 1200-Runden-Lauf, derselbe
  Fehlermodus wie beim ersten Einfrieren (`CLAUDE.md`, „Entscheidungsgewichte").
  Kostenlose Aktionen gewinnen bei gleicher Größenordnung immer gegen
  Aktionen mit echten Kosten (Energie bei `move`/`gather_resource`), sobald
  ein Nachbar da ist. Die aktuellen Gewichte schützen `move` — auf Kosten
  davon, dass Reden und Handeln fast nie vorkommen. Beides gleichzeitig zu
  lösen braucht mehr als eine weitere Zahl: entweder echte Kosten fürs Reden,
  oder eine Policy, die nicht rein per Argmax entscheidet (T23). Eingang für
  den Kalibrierungs-Sweep (T43) — mit den beiden gemessenen Endpunkten
  bereits dokumentiert, nicht nur vermutet.
- **`agent_resource` wird noch von keiner Wahrnehmung gespeist.** Ein Agent
  kann nur über fremde Vorräte reden, wenn er es je gehört hat — niemand
  beobachtet sie direkt. Siehe Abweichung 19.
- **Vier der acht `InfoTopic`-Werte** (`agent_alliance`, `agent_secret_goal`,
  `pledge_state`, `agent_intent_declared`) existieren als Typ, ohne System
  dahinter. Kommt mit T20/T21/T23.
- **T21 (Pledges) fehlt** — Tag 4 der Spezifikation zählt es dazu, dieser
  Durchgang hat sich auf T17–T19 beschränkt. `declare_intent` existiert als
  `StatementKind` (R8: keine Tatsachenbehauptung, kein Validierungsfehler bei
  Bruch), aber ohne `Pledge`-Typ, Fälligkeitsprüfung oder Bruch-Erkennung
  dahinter.
- **Intelligenz streut kaum** (33–37), weil Ruhen bei allen ähnlich häufig ist.
  Anders als bei Intuition ist die Quelle nicht zu selten, sondern zu
  gleichverteilt — es fehlt eine Handlung, bei der sich Agenten im Denken
  unterscheiden. Kandidat: `investigate` (T35).
- **Die Ökonomie- und Gewichtungszahlen sind Kalibrierungsmaße, keine
  Messwerte.** Sämtliche Werte in `core/config.ts`, `world/locations.ts`,
  `decision/policyProvider.ts` und jetzt auch `actions/defs/trade.ts` sind
  **[ANNAHME]** und gehören in den Sweep (T43).

## Der Truth-Validator arbeitet jetzt wirklich

Tag 3 endete mit einem ehrlichen Vorbehalt: die Regel war bewiesen, aber im
laufenden Match nicht belastet — keine implementierte Aktion trug ein
Statement. Das ist mit Tag 4 vorbei. `share_information` trägt eines
verpflichtend, `request_information`s Inline-Antwort trägt eines konstruiert.
Beide laufen durch Stufe 7 wie jede andere Aktion — `share_information` über
die zentrale Anbindung in `runRound.ts`, die Inline-Antwort, weil sie einem
anderen Agenten gehört als dem, der die `AgentAction` gestellt hat, direkt in
`requestInformation.ts` (Abweichung 20).

`falseAssertionsRejected` bleibt trotzdem nahe 0 im Normalbetrieb — aus einem
guten Grund, nicht aus Untätigkeit: Doc 08 §8.2.4 verlangt genau das. Die
erste Verteidigungslinie (`generate`/`statementFor`) soll gar nicht erst
unwahre Aussagen konstruieren; die zweite (Stufe 7) ist die Nachprüfung, kein
Regelfall. Ein Ausschlag dieser Kennzahl wäre ein Bug im Generator, nicht ein
lügender Agent — und `truthValidator.test.ts` plus die neue
`shareInformation`/`requestInformation`-Suite zeigen, dass der Generator hält.

## Nächster Schritt

Tag 5 (`12-build-order.md`): **T20, T22, T23** — Allianzen, episodisches
Gedächtnis mit Deckel, die vollständige Utility-Policy. Davor steht noch ein
Rest aus Tag 4: **T21** (Pledges), das `declare_intent` einen echten
Verratsmechanismus gibt. Erst mit T22/T23 wird auch die offene Frage oben
beantwortbar — eine Policy, die aus Erinnerung und Zielen entscheidet statt
nur aus vier Gewichten pro Runde, hat andere Mittel, Reden gegen Handeln
abzuwägen, als ein einzelner Score-Term.
