# AI Battle Royale — Arbeitsregeln

Diese Datei gilt für alles unterhalb von `ai-battle-royale/`.

## Die neun Regeln (Doc 09 §9.2)

1. **Der `StateMutator` ist die einzige Stelle, die den World State verändert.**
   Aktionen sind reine Funktionen und liefern `Effect[]`. Jede andere Signatur
   nimmt `Readonly<WorldState>`. Der Mutator merkt sich den von ihm hergestellten
   Gesamtbestand und wirft, wenn er ihn beim nächsten Aufruf verändert vorfindet —
   ein Schreibzugriff an ihm vorbei fliegt spätestens im nächsten Batch auf.
2. **Kein Modul in `src/engine/**` importiert React, Next oder die DB.**
   Erzwungen per ESLint-Boundary (`eslint.config.js`), geprüft in
   `tests/unit/eslintBoundary.test.ts`.
3. **Jede Zufälligkeit geht durch einen benannten RNG-Stream — nie `Math.random()`.**
   Auch `Date.now()` ist in der Engine verboten. Ein Streamschlüssel enthält
   alles, was den Aufruf eindeutig macht: `rng.derive('gather', round, agentId)`.
4. **Agenten erhalten ausschließlich `AgentView`, nie `WorldState`.**
   Erzwungen über die Signatur von `DecisionProvider.decide`, geprüft in
   `tests/unit/agentViewIsolation.test.ts` an der Serialisierung.
   Ausnahme mit Grund: `ActionDef.generate` liest den State, weil nur er
   Legalität garantieren kann (Doc 08 §8.2.4) — bewertet wird trotzdem nur auf
   der Sicht.
5. **Die vier Aktionen, mit denen ein Agent bewusst falsche Aussagen erzeugen
   könnte, existieren nicht.** Welche das sind, steht in Doc 04 §4.2;
   `tests/unit/noLieActions.test.ts` durchsucht `src/` danach.
6. **Jede Aussage ist ein `Statement`-Objekt und wird truth-validiert; Freitext
   verändert nie State.** Umgesetzt: `validation/truthValidator.ts` hängt als
   Stufe 7 in der Kette, das Gate ist `tests/unit/truthValidator.test.ts`.
7. **Neue Aktion ⇒ neue Datei in `actions/defs/` + Unit-Test + Eintrag in
   `resolutionOrder`.** Ein Eintrag in `registry.ts` ist die Zusage, dass die
   Aktion funktioniert — `ActionType` kennt 14, implementiert sind elf.
8. **Jede Lesson braucht `supportingEpisodeIds` aus dem eigenen Speicher des
   Agenten.** Ab T24.
9. **Vor jedem Commit: `pnpm test` inklusive `determinism.test.ts` grün.**

## Was den Determinismus bricht

Alles hiervon macht Läufe unreproduzierbar und ist deshalb in `src/engine/**`
verboten:

- `Math.random()`, `Date.now()`, `new Date()`, `process.hrtime`
- Iteration über `Object.keys()` ohne `.sort()`, wenn die Reihenfolge zählt
  (`core/access.ts` bietet `agentIds`, `aliveAgents`, `locationIds`)
- `Set`/`Map`-Iteration als Grundlage einer Reihenfolgeentscheidung
- Gleitkommazahlen in `Effect`-Deltas — Ressourcen und Stats sind ganzzahlig
- `NaN` oder `Infinity` in einem Event-Payload (`canonicalJson` wirft dann)

## Wissen

Ein `KnowledgeEntry` entsteht an **zwei** Stellen, nicht mehr nur einer:
`world/perception.ts` (Phase 2, `source: 'observed'/'participated'`) und das
Auflösen von `share_information`/`request_information`
(`information/disclosurePolicy.ts#deriveToldEntry`, `source: 'told_by'`).
Sonst nirgends, auch nicht „nur kurz für einen Test".

- `resolveTrueValue` ist die einzige Funktion, die die Weltwahrheit einer Info
  liest. Sie gehört Phase 2. Wer sie anderswo aufruft, gibt einem Agenten
  Wissen, das er nicht erworben hat. `deriveToldEntry` ruft sie **nicht** auf —
  es baut den neuen Eintrag aus dem, was der Erzähler selbst glaubt, nie aus
  der Weltwahrheit. Ein Agent kann dadurch falsches Wissen weitergeben, ohne
  zu lügen (Irrtum ≠ Lüge, §8.2.1) — das ist der Punkt.
- Der Verfall der Sicherheit wird beim Lesen gerechnet (`effectiveCertainty`),
  nicht gespeichert. `entry.certainty` gilt für `entry.lastConfirmedRound`.
- Jeder Eintrag trägt `sourceEventId`. Ohne diesen Herkunftsnachweis ist
  `no-omniscience` nicht prüfbar — auch ein `told_by`-Eintrag, dessen
  `sourceEventId` auf ein `information_shared`-Event zeigt, das den Agenten
  als Ziel trägt.
- Der `told_by`-Wissenstransfer läuft **nie** über `infoRefs`. Ein Event, das
  eine geteilte `InfoId` dort einträgt, würde Phase 2 sie beim nächsten
  Durchlauf per `resolveTrueValue` an ALLE Anwesenden verteilen, nicht nur an
  den tatsächlichen Empfänger — Hörensagen würde zu perfekter Beobachtung.

## Wahrheit

Geprüft wird gegen den **Wissensstand des Agenten**, nie gegen die Weltwahrheit
(Doc 08 §8.2.1). Wer eine veraltete Überzeugung ausspricht, irrt sich; wer dem
eigenen `KnowledgeEntry` widerspricht, lügt.

- `truthValidator.ts` importiert `resolveTrueValue` **nicht** und darf es nie.
  Es kennt die Weltwahrheit nicht einmal — das ist die Regel selbst, nicht
  Nachlässigkeit.
- **R7 läuft vor R3.** Ein Selbstwiderspruch ist die genauere Diagnose als eine
  falsche Behauptung. Die Testtabelle aus §8.3 nagelt das fest.
- Ein `suggestion` wird nicht geraten, sondern durchgerechnet: jeder Vorschlag
  läuft selbst durch `check`. Ein Vorschlag, der wieder abgelehnt würde, wäre
  schlimmer als keiner.
- Neue Aktion mit `allowsStatement: true` ⇒ ihre Aussagen laufen ab dem ersten
  Tag durch Stufe 7. Der Kandidatengenerator muss die erste Verteidigungslinie
  halten (Doc 08 §8.2.4): steigt `falseAssertionsRejected` über 0, ist der
  Generator kaputt, nicht der Agent verlogen.
- Bucket-Grenzen stehen in `config.buckets`, nicht im Code. Ohne feste Grenzen
  ist „irreführende Teilwahrheit" nicht entscheidbar.

## Entscheidungsgewichte

Die Utility-Policy vergleicht Handlungen auf einer gemeinsamen Skala. Zwei
Fallen, die dort schon zweimal zugeschnappt haben:

1. **Größenordnung vor Feinabstimmung.** Ein Term, der die Gegenterme nicht
   erreichen kann, ist toter Code — nicht ein schwaches Gewicht. Der
   Erkundungsterm lag bei maximal 0,15 gegen Wegkosten von mindestens 0,45; die
   Folge war eine Welt, die nach Runde 289 stillstand. Bei jedem neuen Term:
   Maximum ausrechnen und gegen die Alternativen halten.
2. **Ertragsterme multiplizieren, nicht addieren.** Wer einen Bonus fürs bloße
   Können addiert (Energie haben, Vorrat haben), gewinnt auch dort, wo nichts zu
   holen ist. Alle Ertragsterme hängen deshalb am erwarteten Anteil.
3. **Kostenlose Aktionen dürfen bezahlte nicht verdrängen.** `share_information`,
   `request_information` und seit T20 auch `offer_alliance`/`leave_alliance`/
   `expel_member` kosten keine Energie (der Effekt-Kostenpunkt `exitPenalty`
   bei `leave_alliance` ist Energie, aber kein Aktionsgewicht), `move` und
   `gather_resource` schon. Bei vergleichbarer Größenordnung gewinnt das
   Kostenlose immer, sobald ein Nachbar da ist — Tag 4 fror `move` dadurch ein
   zweites Mal ein (0 Ortswechsel nach Runde 300, dieselbe Beobachtung wie bei
   Falle 1, ein anderer Mechanismus). Deshalb bleiben die Gewichte für
   kostenlose soziale UND strategische Aktionen bewusst unter dem, was `rest`
   ohnehin bietet — mit dem dokumentierten Nebeneffekt, dass keine von ihnen
   im laufenden Match praktisch je gewinnt (README, „Was noch offen ist"). Ein
   echter Ausweg braucht mehr als eine weitere Zahl: entweder echte Kosten
   fürs Reden/Verbünden, oder eine Policy, die nicht rein per Argmax
   entscheidet.

Und: Vergleiche sind Vergleiche. Eine Erinnerung an einen anderen Ort zählt
gegen den eigenen Standort, nicht absolut.

**T23** hat dafür einen einzigen Ort geschaffen, an dem eine Kalibrierung
ansetzen kann, ohne jede Aktion einzeln anzufassen: `decision/utility.ts`
exportiert `UTILITY_WEIGHTS`, einen benannten Gewichtsvektor über Doc 05 §5.2s
sechs Kategorien (`survival`, `wealth`, `social`, `alliance`, `information`,
`caution`), den `policyProvider.ts` auf jeden Breakdown-Wert anwendet, bevor
summiert wird (`CATEGORY_OF` ordnet jeden verwendeten Breakdown-Schlüssel
seiner Kategorie zu). Der Vektor steht auf neutral 1.0 auf jeder Achse — die
einzelnen Terme sind gegen echte Läufe kalibriert, nicht der Vektor selbst;
ihn zu verschieben ist die Aufgabe von T43, nicht dieses Commits. Zwei Terme
aus Doc 05 §5.2 fehlen dem Modul vollständig und absichtlich:
`goalAlignment(c, goals)` (kein `Goal`-Typ existiert) und `lessonBias(c,
lessons)` (kommt erst mit T24). Ein Term ohne Datenquelle wäre eine Erfindung,
keine Näherung.

## Fähigkeiten, Macht und Gewalt

Erweiterung auf Ansage, gegen die Spezifikation (Doc 01 §1.4 schließt ein
Kampfsystem aus, Doc 03 §3.2.1 nennt die Persönlichkeit konstant). Die Regeln
dieses Repos gelten trotzdem weiter:

- **Attribute werden nicht gespeichert, sondern abgeleitet.** Im State steht nur
  die Erfahrung; `agents/attributes.ts` rechnet daraus Fähigkeit, Instinkt und
  Macht. Zwei Zahlen für dieselbe Sache driften auseinander — derselbe Grund,
  aus dem `InfoItem` keinen `trueValue` trägt.
- **Alle starten gleich.** Wer stark wird, ist es geworden. Dass alle gleich
  starten, ist Weltwissen (`AgentView.world`), keine Beobachtung an einer
  Person — deshalb darf es in der Sicht stehen, ohne die Epistemik zu verletzen.
- **Verfall ist proportional zum Niveau, mit Boden.** Ohne Proportionalität
  treibt jede häufige Tätigkeit ihre Fähigkeit ins Maximum; ohne Boden fällt
  eine vernachlässigte auf null, und ein Agent ohne Intelligenz hat keinen
  Überlebensinstinkt mehr.
- **Gewalt läuft über dieselben Wege wie alles andere.** `attack` ist eine reine
  Funktion, jeder Wurf geht durch einen benannten Stream, getötet wird über den
  `eliminate`-Effekt.
- **Wer in Phase 6 fällt, handelt nicht mehr und wird nicht mehr angegriffen.**
  Der Tod steht erst nach Phase 7 im State, ist aber vorher beschlossen — die
  `EffectProjection` führt ihn mit.

## Beziehungen

`Relationship` ist gerichtet: `agent.relationships[b]` ist AGENTS Sicht auf
`b`, nicht umgekehrt, und existiert erst ab der ersten Interaktion.

- Beziehungswerte ändern sich **ausschließlich** über
  `RELATIONSHIP_DELTA_TABLE[eventType]` in `world/relationships.ts`, angewandt
  in Phase 8, moduliert durch die Persönlichkeit des Wahrnehmenden. Keine
  direkte Zuweisung irgendwo sonst im Code.
- Nur vier Dimensionen (`trust`, `friendship`, `respect`, `attraction`) sind
  „Wärme" und werden von Empathie verstärkt, wenn sie steigen. `fear` und
  `rivalry` sind numerisch positiv, aber keine Wärme, sondern Bedrohung — ein
  ängstlicher Ausschlag wird nicht dadurch kleiner, dass das Opfer mitfühlend
  ist. `suspicion`-Anstiege dämpft stattdessen Loyalität (Doc 03 §3.3,
  wörtliches Beispiel). `debt` ist eine Tatsache, keine Empfindung, und bleibt
  in jedem Fall unmoduliert.
- Die Buchhaltungsfelder (`interactions`, `lastInteractionRound`,
  `lastEventTypes`) gehören **nicht** ins `delta` eines `relationship`-Effekts
  — der `StateMutator` leitet sie selbst her. Ein Effekt, der sie im `delta`
  trüge, wäre eine Verschiebung, die sie nicht sind.

## Allianzen

`Alliance` ist bewusst auf T20s drei Aktionen reduziert (siehe Kopfkommentar
am Typ in `core/types.ts`): kein `charter`, keine `contributions`, keine
`secretPacts` — dafür gibt es noch keinen Schreiber. `cohesion` ist aus
demselben Grund keine gespeicherte Zahl, sondern eine geplante, noch nicht
geschriebene abgeleitete Funktion — wie bei den Attributen.

- **Mitgliedschaft ändert sich ausschließlich über vier `alliance`-Effekt-Ops**
  (`create`, `join`, `leave`, `expel`), angewandt in `stateMutator.ts`. Keine
  direkte Zuweisung von `agent.allianceId` oder `alliance.members` irgendwo
  sonst im Code.
- **Führungswechsel und Selbstauflösung sind vom `StateMutator` selbst
  hergeleitete Buchhaltung, nie Teil eines Effekts** — dieselbe Regel wie bei
  `Relationship`s Zählfeldern. Fällt die Zahl LEBENDER Mitglieder nach einem
  `leave`/`expel` unter zwei, löst sich die Allianz auf; verliert sie dabei
  ihren Leader, übernimmt automatisch das lebende Mitglied mit der kleinsten
  `AgentId` (`settleMembershipChange`).
- **Tod räumt keine Allianz auf.** Wer im Kampf oder an Hunger stirbt,
  verlässt seine Allianz nicht automatisch — kein `leave`/`expel`-Effekt läuft
  dafür. Eine aktive Allianz kann deshalb durchaus unter zwei lebende
  Mitglieder fallen und trotzdem als Datensatz bestehen bleiben, bis jemand
  tatsächlich geht oder ausgeschlossen wird (auch ein bereits toter). Kein
  Invariantenbruch — `assertInvariants` prüft hier nur Struktur (sortierte,
  eindeutige Mitgliederliste; ein Leader, der Mitglied ist), keine
  Lebendzahl.
- **`offer_alliance`/`leave_alliance`/`expel_member` sind Klasse 6 und prüfen
  deshalb live gegen die `EffectProjection`, nicht nur gegen den
  Rundenanfang** — dieselbe Notwendigkeit wie bei `share_information` (Fix 3):
  zwei Aktionen dieser Klasse können in derselben Runde dieselbe Allianz oder
  denselben Zielagenten treffen. `EffectProjection.allianceOf`/
  `.allianceMembers` bilden das ab. **Bekannte, dokumentierte Lücke:** ob ein
  Agent aktuell *Leader* ist, wird gegen `state.alliances[id].leaderId`
  geprüft (Rundenanfang), nicht gegen eine live nachgeführte Führung — ein
  Führungswechsel durch eine früher aufgelöste `leave_alliance` derselben
  Runde wird von einer späteren `expel_member`-Prüfung also nicht gesehen.
  Seltener Randfall, in `expelMember.ts`s Kopfkommentar benannt.

## Gedächtnis

Episodisches Gedächtnis (`EpisodicMemory`, `Agent.episodic`) entsteht
ausschließlich in Phase 9 (`memory/episodes.ts`), für genau die Events, in
deren Beobachterset ein Agent stand — dieselbe Epistemik-Schranke wie bei
Wissen (Phase 2), geprüft im selben `no-omniscience.test.ts`.

- **Phase 9 braucht anders als Phase 2 KEINE Rundenverzögerung.** Perception
  verarbeitet die Events der Vorrunde, weil sie vor der eigenen
  Bewegungsauflösung läuft. Memory läuft nach Phase 6/7 derselben Runde, wenn
  alle Ortswechsel bereits vollzogen sind — die aktuellen
  `state.agents`-Positionen sind exakt die, unter denen die Events dieser
  Runde entstanden. Wer das umkehrt (Events der Vorrunde mit aktuellen
  Positionen, oder umgekehrt), bekommt falsche Beobachtersets.
- **Nicht jeder Event-Typ erzeugt eine Episode.** Nur wer in `EPISODE_BASE`
  (`memory/episodes.ts`) steht — mundane Ereignisse (`rest`,
  `gather_resource`, `move`, ...) sind nicht "sozial genug" (Doc 03 §3.7s
  Beispiel ist "Jonas gab mir Nahrung", nicht "ich erntete"). Ein Event ohne
  Eintrag dort erzeugt für niemanden eine Episode.
- **Verfall UND Kompaktierung laufen über einen einzigen Effekt pro Agent und
  Runde** (`episode_upkeep`), immer, unabhängig davon, ob der Agent neue
  Episoden bekommen hat — dieselbe Buchhaltungsregel wie bei `Relationship`.
  Kompaktierung entfernt bei Überschreiten von `maxEpisodes` nur die
  untersten `compactionThreshold` (20 %) nach Salience, nicht alles auf
  einmal: **kein Rundenschritt garantiert sofort wieder `<= maxEpisodes`**,
  die Länge pendelt sich über mehrere Runden ein. Ein harter
  Pro-Runden-Invariant auf die Obergrenze wäre deshalb falsch;
  `assertInvariants` prüft hier nur die Form jedes Eintrags (Salience/Valenz
  in ihren Wertebereichen).
- **Kompaktieren heißt Löschen, nicht Aggregieren** — anders als Doc 03 §6.2
  wörtlich beschreibt ("aggregiere sie in die Relationship-Zähler"): das ist
  hier kein zweiter Schritt, weil die Relationship-Konsequenz bereits in Phase
  8 DERSELBEN Runde gesetzt wurde, bevor die Episode in Phase 9 überhaupt
  entsteht. Die Erkenntnis steckt schon im `Relationship`-Delta; Phase 9
  verwirft beim Kompaktieren nur noch das Detail.
- **`pledgeInvolved` in der Salience-Formel ist immer `false`** (kein `Pledge`
  existiert vor T21) und **`resourceMagnitudeNorm` fehlt komplett** (kein
  einheitlicher Betrags-Leser über alle Event-Payloads) — beide dokumentiert
  im Kopfkommentar von `memory/episodes.ts`, nicht stillschweigend auf 0
  gesetzt.

## Golden-Hashes

`tests/golden/determinism.test.ts` nagelt drei Log-Hashes fest. Bricht einer,
ist eine Verhaltensänderung eingetreten — oder die `MatchConfig` hat ein Feld
bekommen: die `MatchId` hängt am Seed **und** an der Konfiguration und steht in
jedem Event. Beides sieht am Hash gleich aus, ist es aber nicht. Nachrechnen
statt raten: die Events ohne ihr `matchId`-Feld durch `canonicalJson` schicken
und mit dem Stand davor vergleichen. Sind sie gleich, hat sich nur der Name der
Welt geändert.

In beiden Fällen wird der Wert neu geschrieben **und die Commit-Nachricht
benennt, was sich geändert hat** (Doc 10 §E) — im ersten Fall das Verhalten, im
zweiten die Identität der Welt. Ein stillschweigend aktualisierter Golden-Hash
macht den Test wertlos.

## Kommandos

```bash
pnpm test        # alle Tests inkl. Determinismus-Gate
pnpm typecheck   # tsc --noEmit
pnpm lint        # ESLint inkl. Boundary-Regel
pnpm sim --matches 1 --rounds 100 --agents 30 --seed 42 --llm off
```

## Statusdisziplin

Die Spezifikation markiert Aussagen als **[DESIGN]**, **[ANNAHME]** und
**[OFFEN]**. Diese Markierung gilt auch im Code: alle Ökonomie- und
Gewichtungszahlen sind **[ANNAHME]** und Kalibrierungsmasse (T43), nicht
gemessene Wahrheiten. Wer eine Zahl ändert, ändert eine Annahme — und den
Golden-Hash.
