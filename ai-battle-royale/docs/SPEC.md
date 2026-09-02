# AI BATTLE ROYALE — Technische Spezifikation v1

**Status:** Spezifikation. Kein Code implementiert, nichts ausgeführt, nichts gemessen.
Aussagen sind markiert als **[DESIGN]** (Entwurfsentscheidung), **[ANNAHME]** (unbelegt,
muss gemessen werden), **[OFFEN]** (bewusst offen). Es gibt in diesen Dokumenten keine
FACT-Aussagen über Laufzeitverhalten, weil nichts davon gemessen wurde.

## Dokumente
| # | Datei | Inhalt |
|---|---|---|
| 01 | `01-product-spec.md` | Scope v1, ausdrückliches Nicht-Scope, Erfolgskriterien |
| 02 | `02-architecture.md` | Komponenten, 11-Phasen-Rundenfluss, Stack, Persistenz |
| 03 | `03-data-model.md` | Alle Entities und Felder |
| 04 | `04-action-system.md` | 13 Aktionen, Vorbedingungen, gestrichene Aktionen |
| 05 | `05-decision-pipeline.md` | Von WorldState zu einer validierten Aktion |
| 06 | `06-memory-learning.md` | Drei Speicher, Pattern-Miner, Reflection, zwei Lernmodi |
| 07 | `07-llm-boundaries.md` | Trennlinie deterministisch / LLM, Budget |
| 08 | `08-validation-and-truthfulness.md` | **Validierungskette + Truth-Validator R1–R10** |
| 09 | `09-folder-structure.md` | Repo-Struktur, ESLint-Boundary, `CLAUDE.md`-Regeln |
| 10 | `10-test-strategy.md` | Unit / Integration / Simulation / Long-Run / Golden |
| 11 | `11-backlog.md` | 51 Aufgaben, P0/P1/P2 |
| 12 | `12-build-order.md` | 7-Tage-Reihenfolge nach Abhängigkeiten |
| 13 | `13-critical-review.md` | Selbstkritik, Streichungen, Restrisiken |
| 14 | `14-json-schemas.md` | 7 Structured-Output-Schemas |

---

## 1. FINALE ARCHITEKTUR (Kurzfassung)

```
WORLD STATE (einzige Wahrheit, in-memory)
   │
   ├─ 1 UPKEEP ────────────── deterministisch
   ├─ 2 PERCEPTION ────────── einzige Stelle, an der Wissen entsteht
   ├─ 3 ACTION CANDIDATES ─── nur Legales, bereits wissensgefiltert
   ├─ 4 AGENT DECISION ────── Utility-Policy (Standard) │ LLM (nur bei hohem Einsatz, Budget-gedeckelt)
   ├─ 5 VALIDATION ────────── Schema → Preconditions → TRUTH-VALIDATOR → Effect-Sanity
   ├─ 6 RESOLUTION ────────── Aktion → Effect[] + Events (Reaktionen inline)
   ├─ 7 STATE UPDATE ──────── StateMutator: EINZIGE Schreibstelle + Invariantenprüfung
   ├─ 8 CONSEQUENCE ───────── Beziehungsdeltas (Tabelle), Pledge-Auflösung
   ├─ 9 MEMORY UPDATE ─────── Episoden nur für Wahrnehmende, Salience, Compaction
   ├─10 LEARNING/REFLECTION ─ Pattern-Miner deterministisch; LLM selten und gedeckelt
   └─11 SCORING ───────────── Ausscheiden, Leaderboards, Endbedingung → NEXT ROUND
```

**Die fünf Regeln, die alles zusammenhalten:**
1. Nur der `StateMutator` schreibt. Aktionen sind reine Funktionen, die `Effect[]` liefern.
2. Agenten sehen nur `AgentView` — nie den WorldState, nie Fremdwissen, nie die Weltwahrheit.
3. Wissen entsteht ausschließlich in Phase 2 und beim Auflösen von `share_information`.
4. Das LLM **wählt** aus legalen Kandidaten und **konstruiert** nichts. Freitext verändert nie State.
5. Jede Aussage ist ein typisiertes `Statement`, das gegen das *Wissen des Agenten*
   geprüft wird — nicht gegen die Weltwahrheit.

**Die Truthfulness-Regel technisch:** Regel 5 macht "kein Agent darf lügen" zu einer
Funktion mit Unit-Tests statt zu einer Prompt-Bitte. Ein Agent mit veralteter Überzeugung
darf sie aussprechen (Irrtum ≠ Lüge). Verrat bleibt vollständig erhalten — über
**Pledges** (gebrochene Zusagen sind keine Falschaussagen), über **Informationsentzug**,
über **Austritt und Ausschluss**.

---

## 2. FINALER MVP-SCOPE

**Drin:** 20–40 Agenten · 6 Orte · 3 Ressourcen (`food`, `coins`, `materials`) ·
2 Bedürfnisse · 13 Aktionen · typisierte Statements mit 10 Truth-Regeln ·
Wissenssystem mit Unsicherheit und Veralten · Pledges · Allianzen mit Lager und
Geheimabsprachen · 8 Beziehungsdimensionen · Episodisches Gedächtnis mit Deckel ·
Lernsystem mit Pattern-Minern und Laplace-Confidence · Fresh Match + optional Persistent
Agents · Observer + God Mode · UI (Dashboard, Profil, Graph, Feed, Leaderboards,
Controls) · **Debug Mode** · Headless-CLI mit 100-Match-Statistik · Seeds mit
Golden-Hash-Test.

**Draußen:** Lügen in jeder Form · Player Mode · Kampf/Schaden · Sabotage · Karte mit
Koordinaten · Freitext als State-Quelle · Embeddings/RAG · Marktpreise · Auth/Deployment ·
mehr als 1 Aktion pro Runde · mehr als 1 Allianz pro Agent.

**Kalibrierungsziele [ANNAHME]:** Determinismus 100 %, Reject-Rate < 2 %,
falsche Behauptungen = 0, kein Archetyp > 40 % der Siege, mittlere Allianzdauer 15–120
Runden, 400 Runden × 30 Agenten headless < 5 s.

---

## 3. PRIORISIERTER BACKLOG (Kurzfassung, Details in Doc 11)

**P0 (31 Aufgaben, ≈66 Punkte):** Repo → Typen → RNG → EventLog → Weltinit →
StateMutator → Rundenskelett → Bedürfnisse → CLI → Information → Perception →
Statements → **Truth-Validator** → Validierungskette → Aktionen (`move`,`consume`,
`trade`,`share/request_information`) → Beziehungen → Allianzen → Pledges → Memory →
Decision-Policy → Learning → Invarianten-Suite → Long-Run-Harness → Persistence →
MatchRunner + API → Dashboard → Profil → **Debug Mode**.

**P1 (13):** LLM-Gateway + Eskalation + Reflection, `help`/`investigate`/`confront`,
God Mode, Social Graph, Leaderboards, Verbalizer-Templates, Persistent Agents,
A/B-Lernwirkung, R7/R8/R10, Kalibrierungs-Sweep, Replay.

**P2 (7):** Sabotage, Player Mode, LLM-Verbalizer, Secret-Pact-UI, Timeline-Scrubber,
Chronik-Export, Tuning-UI.

---

## 4. WAS CLAUDE CODE ALS ALLERERSTES IMPLEMENTIEREN SOLL

> **T01 + T03 + T04 + T05 + T06 + T07 als ein zusammenhängender erster Schritt:
> der deterministische Kern.**

Konkret, in dieser Reihenfolge:

1. **Repo-Setup** (T01): Next.js 15 + TypeScript strict + Vitest + ESLint-Boundary-Regel
   für `src/engine/**` + `CLAUDE.md` mit den 9 Regeln aus Doc 09 §9.2.
2. **`src/engine/core/rng.ts`** (T03): seeded PRNG mit **benannten Streams**
   (`rng('gather', round, agentId)`), plus Test: gleicher Seed → gleiche Folge, und ein
   neuer Stream verschiebt bestehende Folgen nicht.
3. **`src/engine/core/types.ts` + Zod-Schemas** (T02, reduziert): zunächst nur
   `WorldState`, `Agent`, `Location`, `WorldEvent`, `Effect`. Der Rest folgt.
4. **`eventLog.ts`** (T04) mit stabilem Log-Hash.
5. **`initWorld.ts`** (T05): 6 Orte, N Agenten mit gezogener Persönlichkeit, alles aus dem Seed.
6. **`stateMutator.ts` + `invariants.ts`** (T06): die einzige Schreibstelle.
7. **`runRound.ts`** (T07) mit nur zwei Aktionen — `rest` und `gather_resource` — und den
   Phasen 1,3,4,5,6,7,11.
8. **`tests/golden/determinism.test.ts`**: Seed 42, 100 Runden, Event-Log-Hash festnageln.

**Abnahmekriterium des ersten Schritts:**
```bash
pnpm sim --matches 1 --rounds 100 --agents 30 --seed 42 --llm off
# läuft durch, gibt einen Log-Hash aus
pnpm test
# determinism.test.ts grün — fünf Läufe, identischer Hash
```

**Warum genau das zuerst:** Ohne reproduzierbaren Kern ist jeder spätere Fehler — und in
einer Simulation mit 40 Agenten über 400 Runden gibt es viele — nicht auffindbar. Der
Determinismus-Test ist das Fundament, auf dem Truth-Validator, Lernsystem und
Kalibrierung überhaupt erst untersuchbar werden. Erst danach folgen Wahrnehmung (Tag 2)
und die Wahrheitsprüfung (Tag 3).

**Ausdrücklich noch nicht bauen:** UI, LLM-Gateway, Allianzen, Handel, Lernsystem.
# 01 — PRODUCT SPEC (Version 1)

> **Status-Kennzeichnung:** Dieses Dokument ist eine Spezifikation. Kein Code ist
> implementiert, nichts ist ausgeführt oder gemessen worden. Aussagen sind markiert als
> **[DESIGN]** (bewusste Entwurfsentscheidung), **[ANNAHME]** (unbelegte Annahme, die im
> Betrieb validiert werden muss) oder **[OFFEN]** (bewusst noch nicht entschieden).

---

## 1.1 Produkt in einem Satz

Eine browserbasierte, deterministisch reproduzierbare Simulation, in der 20–40 autonome
Agenten in einer geschlossenen Welt über hunderte Runden um Ressourcen, Bündnisse und
Einfluss konkurrieren — **ohne dass ein Agent jemals bewusst lügen darf**.

Der interessante Konflikt entsteht nicht aus Gewalt und nicht aus Täuschung, sondern aus
**Informationskontrolle**: wer weiß was, wer erzählt was, wem, wann, und wie vollständig.

## 1.2 Kernthese des Designs

**[DESIGN]** Die Truthfulness-Regel ist keine Einschränkung, sondern der zentrale
Spielmechanismus. Wenn Lügen unmöglich ist, wird jede Aussage zu einem harten Signal —
und damit werden *Schweigen*, *Teiloffenlegung*, *Timing* und *Adressatenwahl* zu den
eigentlichen strategischen Hebeln. Vertrauen wird berechenbar, Verrat verschiebt sich von
"falsche Aussage" zu "gebrochene Zusage" und "verschwiegene Information".

**[DESIGN]** Diese Regel ist nur durchsetzbar, wenn Aussagen **strukturierte Objekte**
sind und nicht Freitext. Deshalb: das LLM erzeugt niemals eine Behauptung als Text.
Es wählt einen typisierten `Statement`-Datensatz, der gegen den Wissensstand des Agenten
maschinell geprüft wird. Freitext entsteht erst danach, aus dem geprüften Objekt
(Verbalizer), und fließt **nie** wieder in den State zurück. Details: `08-validation-and-truthfulness.md`.

---

## 1.3 Was Version 1 kann (In Scope)

### Simulation
- 20–40 Agenten, 1 Aktion pro Agent pro Runde plus erzwungene Reaktionen (Antwort auf
  Angebote), 100–500 Runden pro Match.
- 6 benannte Orte als Graph (keine Koordinaten, keine Pfadfindung). Ort bestimmt, wer
  ein Ereignis beobachtet → natürliche Informationsasymmetrie.
- 3 Ressourcen: `food`, `coins`, `materials`. Zwei Bedürfnisse: `satiety`, `energy`.
- Ausscheiden durch Verhungern/Erschöpfung oder durch kollektiven Ausschluss (Exile).
- Allianzen mit eigenem State, gemeinsamem Lager, Zusagen (Pledges) und Austritt/Verrat.
- Beziehungen als 8 numerische Dimensionen pro gerichtetem Paar, nur ereignisgetrieben.
- Wissenssystem: jeder Agent hat eigene, potenziell veraltete oder falsche Überzeugungen.
- Zusagen (`Pledge`) als First-Class-Objekt — erfüllt/gebrochen ist objektiv messbar und
  ersetzt "Lüge" als Verratsmechanik.
- Lernsystem mit gedeckelter, weitgehend deterministischer Lesson-Bildung.
- Seeds: identischer Seed + `llmMode: off` ⇒ bitgleicher Event-Log-Hash. **[DESIGN]**

### Betriebsmodi
- **Observer Mode** — Simulation läuft automatisch, Nutzer schaut zu.
- **God Mode** — Nutzer löst kuratierte Events aus (Dürre, Fund, erzwungene Enthüllung,
  Ressourcen-Injektion, Agent entfernen).

### UI
Dashboard, Character Profile, Social Graph, Event Feed, Leaderboards, Controls,
und ein getrennter **Debug Mode** mit vollständiger Entscheidungs-Nachvollziehbarkeit.

### Headless
CLI, die N Matches ohne UI und ohne LLM fährt und einen Statistik-Report ausgibt.

### Lernmodi
- **Fresh Match** (Default): keine strategischen Erfahrungen aus früheren Matches.
- **Persistent Agents** (optional, abschaltbar): nur `strategic`-Lessons überleben ein
  Match; Beziehungs- und Episodenwissen niemals.

---

## 1.4 Was Version 1 ausdrücklich NICHT enthält (Out of Scope)

| Nicht enthalten | Begründung |
|---|---|
| **Lügen, Fabrikation, erfundene Beweise** | Global verboten (Truthfulness Rule). Aktionen `lie`, `fabricate_information`, `invent_evidence`, `knowingly_spread_false_rumor` existieren nicht im Code. |
| Player Mode | Interface wird vorbereitet (`DecisionProvider`), Implementierung nach v1. |
| Kampf-, Schadens- oder Tötungssystem | Schwerpunkt ist sozial. Ausscheiden nur über Bedürfnisse und Exile. |
| Karte mit Koordinaten, Bewegung in Echtzeit, Pathfinding | Ortsgraph reicht für Informationsasymmetrie. |
| Mehrspieler, Accounts, Auth, Deployment, Cloud-DB | Lokales Single-User-Projekt. |
| Vektor-Embeddings / RAG für Memory | Salience + Tag-Index reicht bei ≤60 Episoden/Agent und ist deterministisch. |
| Freie Sprachausgabe als State-Quelle | Verbalizer ist reines Display. |
| Fortpflanzung, Vererbung, Genetik, Alter | Scope-Killer ohne Nutzen für die Kernthese. |
| Mehr als 1 Aktion pro Agent pro Runde | Verdoppelt Resolution-Komplexität ohne neue Dynamik. |
| Live-Multiagent-Chat / Dialogbäume | Ein Statement pro sozialer Aktion, keine mehrstufigen Gesprächsverläufe. |
| Ökonomie mit Preisbildung/Markt | Handel ist bilateral, Preise sind Verhandlungsparameter. |
| Reinforcement Learning, Gewichtstraining | Lernen = strukturierte Lessons, kein Gradientenverfahren. |

---

## 1.5 Erfolgskriterien für v1

**[DESIGN]** V1 gilt als erfolgreich, wenn folgende Aussagen im Long-Run-Test messbar
zutreffen. (Die Zielwerte sind **[ANNAHME]** und dürfen nach der ersten Messung
angepasst werden — sie sind Kalibrierungsziele, keine Vorhersagen.)

1. **Determinismus:** 100 Läufe mit gleichem Seed, `llmMode: off` ⇒ identischer Log-Hash.
2. **Keine State-Verletzung:** In 100 × 400 Runden null negative Ressourcen, null
   Aktionen ohne Vorbedingung, null Statements ohne Wissensdeckung.
3. **Kein Wissensleck:** Kein Agent referenziert je eine `info_id`, die nicht in seinem
   `AgentKnowledge` steht (automatischer Invariant-Test, nicht nur Review).
4. **Beschränktes Memory:** Speicher pro Agent bleibt über 400 Runden konstant gedeckelt
   (≤60 Episoden, ≤30 Lessons) — messbar, nicht "sollte".
5. **Nicht-triviale Dynamik:** Zielkorridor **[ANNAHME]** — Gewinnverteilung nicht von
   einem einzigen Persönlichkeitsarchetyp dominiert (kein Archetyp >40 % der Siege);
   mittlere Allianzdauer zwischen 15 und 120 Runden; ≥1 gebrochene Zusage pro 50 Runden
   pro Match.
6. **Lernwirkung:** Agenten mit aktiviertem Lernsystem schneiden im A/B gegen Agenten mit
   eingefrorenen Lessons statistisch besser ab. Falls nicht → das Lernsystem ist
   Dekoration und muss überarbeitet werden. Dieser Test ist P1 und bewusst
   falsifizierbar formuliert.
7. **Performance:** 1 Match × 400 Runden × 30 Agenten headless ohne LLM in < 5 s.
   **[ANNAHME]** — Zielwert, muss gemessen werden.
# 02 — SYSTEM ARCHITECTURE

> Kennzeichnung wie in `01-product-spec.md`. Alles hier ist **[DESIGN]**, sofern nicht anders markiert.

## 2.1 Leitprinzipien

1. **Ein Schreiber.** Nur der `StateMutator` verändert den World State, und zwar
   ausschließlich durch Anwenden validierter `Effect`-Objekte. Kein anderer Modul-Teil
   hat Schreibzugriff (erzwungen über `Readonly<WorldState>` in allen anderen Signaturen).
2. **Engine kennt weder React noch Next.** `src/engine/**` importiert nichts aus
   `next`, `react`, `fs`-Abhängigkeiten der UI. Erzwungen per ESLint-Boundary-Regel.
3. **In-Memory ist der Laufzeit-State, SQLite ist Log + Snapshot.** Die Runde rechnet auf
   Plain Objects; persistiert wird ein Append-only-Event-Log plus Snapshot alle N Runden.
   Grund: 100 × 400 Runden sind mit einer DB-Roundtrip-pro-Mutation-Architektur nicht
   erreichbar, und Determinismus ist ohne DB-Zwischenschicht leichter zu garantieren.
4. **LLM ist ein austauschbarer Vorschlaggeber, kein Entscheider.** Jeder LLM-Output
   durchläuft Schema-Parse → Validator → ggf. 1 Repair → sonst deterministischer Fallback.
   Ein Ausfall des LLM darf die Simulation nie anhalten.
5. **Alles, was nichtdeterministisch wäre, geht durch einen benannten RNG-Stream.**

---

## 2.2 Komponenten

```
┌─────────────────────────── UI (Next.js / React) ───────────────────────────┐
│ Dashboard │ Character │ Social Graph │ Event Feed │ Leaderboards │ Debug   │
└───────────────────────────────┬────────────────────────────────────────────┘
                                │ HTTP (Route Handlers), read-only + Commands
┌───────────────────────────────▼────────────────────────────────────────────┐
│ MatchRunner  (Prozess-Singleton pro Match, hält WorldState im Speicher)     │
│  Commands: init(seed,config) · step(1|n) · pause · reset · godEvent(e)      │
└───────────────────────────────┬────────────────────────────────────────────┘
                                │
┌───────────────────────────────▼────────────────────────────────────────────┐
│ SIMULATION ENGINE  (framework-frei, synchron außer LLM-Phase)               │
│                                                                            │
│  WorldState ──► Phase 1 UPKEEP        deterministisch                       │
│             ──► Phase 2 PERCEPTION    wer sieht/erfährt was → Knowledge      │
│             ──► Phase 3 CANDIDATES    ActionGenerator: legale Aktionen       │
│             ──► Phase 4 DECISION      Policy (det.) │ LLM (eskaliert)        │
│             ──► Phase 5 VALIDATION    Precondition + Truth + Schema          │
│             ──► Phase 6 RESOLUTION    Aktion → Effect[] (+ Reaktionen)       │
│             ──► Phase 7 MUTATION      StateMutator wendet Effects an         │
│             ──► Phase 8 CONSEQUENCE   Relationship-Deltas, Pledge-Prüfung    │
│             ──► Phase 9 MEMORY        Episoden schreiben, prunen             │
│             ──► Phase 10 REFLECTION   nur alle K Runden, gedeckelt           │
│             ──► Phase 11 SCORING      Leaderboards, Ausscheiden, Endcheck    │
│                                                                            │
│  Querschnitt: RNG-Streams · EventLog · DebugTrace · Config · Metrics        │
└──────────────┬───────────────────────────────────────┬─────────────────────┘
               │                                       │
     ┌─────────▼──────────┐                  ┌─────────▼─────────────────────┐
     │ LLM Gateway        │                  │ Persistence (better-sqlite3)  │
     │ budget · cache ·   │                  │ event_log · snapshots ·       │
     │ schema · retry ·   │                  │ matches · llm_calls ·         │
     │ mock/off/live      │                  │ persistent_agent_lessons      │
     └────────────────────┘                  └───────────────────────────────┘
```

## 2.3 Datenfluss einer Runde (verbindliche Reihenfolge)

**[DESIGN]** Die Phasenreihenfolge ist Teil des Determinismus-Vertrags und darf nicht
umsortiert werden.

| # | Phase | Deterministisch? | Kurzbeschreibung |
|---|---|---|---|
| 1 | Upkeep | ja | `satiety -= f(...)`, `energy` regeneriert, Cooldowns ticken, Allianz-Lager-Upkeep, Marktdrift, God-Events der Runde einspeisen. |
| 2 | Perception | ja | Für jedes Event aus Runde N−1 und jeden Weltzustand am Ort: bestimme Beobachterset → schreibe/aktualisiere `AgentKnowledge`. **Einziger** Ort, an dem Wissen entsteht. |
| 3 | Candidates | ja | `ActionGenerator` erzeugt pro Agent die Liste legaler Aktionen inkl. legaler `Statement`-Varianten (bereits wissensgefiltert). |
| 4 | Decision | teils | Utility-Policy bewertet Kandidaten. `stakes_score` entscheidet über Eskalation ans LLM (Budget-gedeckelt). Ergebnis: genau 1 `AgentAction` pro Agent. |
| 5 | Validation | ja | Schema → Preconditions → Truth-Validator → Ressourcen-Reservierung. REJECT ⇒ Repair oder Fallback `rest`. |
| 6 | Resolution | ja | Aktionen in fester Prioritätsordnung auflösen; Zielagenten erzeugen inline eine Reaktion (Policy oder LLM). Ergebnis: `Effect[]` + `WorldEvent[]`. |
| 7 | Mutation | ja | `StateMutator.apply(effects)` — die einzige Schreibstelle. Invarianten-Check danach. |
| 8 | Consequence | ja | Beziehungsdeltas aus Event-Typ-Tabelle, Pledge-Fälligkeit prüfen (erfüllt/gebrochen), Reputation neu berechnen. |
| 9 | Memory | ja | Episoden aus Events schreiben (nur für Wahrnehmende), Salience berechnen, Decay, Prune/Compaction. |
| 10 | Reflection | teils | Alle `reflectionInterval` Runden, gestaffelt über Agenten. Pattern-Miner deterministisch; optional 1 LLM-Call für freie Lessons. |
| 11 | Scoring | ja | Ausscheiden prüfen, Scores/Leaderboards, Abbruchbedingung. |

**Kritische Regel:** Wissen entsteht **nur** in Phase 2 (Perception) und in Phase 6, wenn
ein `share_information`-Effekt aufgelöst wird. An keiner anderen Stelle darf ein
`AgentKnowledge`-Eintrag entstehen. Das ist der Hebel gegen "Agenten mit unzulässigem Wissen".

## 2.4 Nebenläufigkeit

**[DESIGN]** Die Runde ist logisch sequenziell. Der einzige asynchrone Punkt ist Phase 4/6
(LLM). Dort werden alle eskalierten Anfragen der Runde **gesammelt, sortiert nach
`(stakes_score desc, agent_id asc)` und als ein Batch parallel** ausgeführt; die Ergebnisse
werden anschließend in `agent_id`-Reihenfolge angewendet. So bleibt die Anwendung der
Ergebnisse reihenfolgestabil, obwohl die Netzwerkaufrufe parallel laufen.

## 2.5 Persistenz-Schema (SQLite, minimal)

```sql
matches(id, seed, config_json, started_at, ended_at, status, mode)
snapshots(match_id, round, state_json, state_hash)          -- alle 25 Runden + Ende
event_log(match_id, round, seq, type, actor_id, target_id, payload_json, visibility_json)
llm_calls(match_id, round, agent_id, purpose, prompt_hash, tokens_in, tokens_out,
          latency_ms, raw_json, accepted, reject_reason)     -- nur für Debug/Analyse
decision_traces(match_id, round, agent_id, trace_json)       -- Debug Mode, optional abschaltbar
persistent_lessons(agent_archetype_id, lesson_key, statement, confidence,
                   evidence_count, contradictory_count, last_updated)  -- nur Persistent-Modus
sim_runs(id, batch_label, seed, stats_json)                  -- Long-Run-Auswertung
```

**[DESIGN]** `decision_traces` und `llm_calls` sind volumenkritisch. Beide sind per Config
abschaltbar (`persistence.traces: false`) und in Long-Run-Batches standardmäßig **aus**.

## 2.6 Technologie-Entscheidung

| Baustein | Wahl | Begründung |
|---|---|---|
| App | **Next.js 15 (App Router) + TypeScript strict** | Wie gewünscht; ein Prozess, eine `pnpm dev`. |
| UI | React + Tailwind + shadcn/ui | Schnell, keine Design-Zeit im 1-Wochen-Scope. |
| Graph | `@xyflow/react` oder `d3-force` | Social Graph bei ≤40 Knoten unkritisch. |
| DB | **better-sqlite3** (synchron) | Synchron = keine Async-Verunreinigung der Engine; schnell genug für Append-Log. |
| Schemas | **Zod** als Single Source of Truth, JSON Schema daraus generiert | Ein Typ für Laufzeitvalidierung, TS-Typen und LLM-Structured-Output. |
| Tests | Vitest | Schnell, TS-nativ. |
| CLI | `tsx src/cli/sim.ts` | Kein Build-Schritt für Headless-Läufe nötig. |
| LLM | Ein Provider hinter `LlmGateway`-Interface, Structured Outputs / Tool-Schema | Austauschbar; `off`/`mock`/`live`. |

**Bewusst NICHT gewählt:** ORM (Drizzle/Prisma) — die Engine spricht ohnehin nicht mit der
DB, der Rest sind ~8 Tabellen mit rohem SQL. Kein Zustandsmanagement-Framework — der
Client pollt/streamt den Snapshot. Kein Worker/Queue, kein Redis, keine Microservices.

**[OFFEN]** Ob der `MatchRunner` bei sehr langen Läufen in einen Node-Worker-Thread
ausgelagert werden muss, entscheidet erst die Messung. Für v1: gleicher Prozess,
`step`-Calls sind kurz.
# 03 — DATA MODEL

> Notation: TypeScript-nahe Pseudotypen. Alle Zahlenbereiche sind verbindlich und werden
> im Invarianten-Check geprüft. Alles **[DESIGN]**.

## 3.0 Grundtypen

```ts
type AgentId = `agent_${string}`;      // stabil, sortierbar → Tie-Breaks
type AllianceId = `alliance_${string}`;
type InfoId = `info_${string}`;
type LocationId = 'commons'|'warehouse'|'fields'|'workshop'|'outskirts'|'well';
type Round = number;                   // 1-basiert
type Score01 = number;                 // 0..1
type Stat = number;                    // 0..100, Integer
```

---

## 3.1 WorldState (die einzige Wahrheit)

```ts
interface WorldState {
  matchId: string;
  seed: number;
  round: Round;
  config: MatchConfig;
  rngState: RngStateBundle;            // MUSS Teil des Snapshots sein, sonst kein Resume
  agents: Record<AgentId, Agent>;
  alliances: Record<AllianceId, Alliance>;
  locations: Record<LocationId, Location>;
  infoRegistry: Record<InfoId, InfoItem>;   // objektive Wahrheit; Agenten sehen das NIE
  pledges: Record<string, Pledge>;
  pendingOffers: Offer[];              // in derselben Runde aufgelöst; nie Runden-übergreifend
  eventSeq: number;
  status: 'running'|'finished';
  endReason?: 'round_limit'|'survivor_threshold'|'manual';
}
```

**Invarianten (in `assertInvariants(state)` nach jeder Mutation, in Tests immer aktiv):**
- Kein Ressourcenwert < 0, kein `Stat` außerhalb 0..100.
- Summe aller `coins` (Agenten + Allianzlager) ist konstant, außer bei explizit als
  `mint`/`burn` markierten Effekten (God Mode, Scoring). Analog für `food`/`materials`
  mit explizit deklarierten Quellen (`gather`) und Senken (`consume`, `spoilage`).
- Jede in einem Event referenzierte `InfoId` existiert im `infoRegistry`.
- Jeder Allianz-Member existiert und ist `alive`; jede `memberOf` ist konsistent bidirektional.
- Kein Agent ist Mitglied von >1 Allianz (v1-Vereinfachung).

---

## 3.2 Agent

```ts
interface Agent {
  id: AgentId;
  name: string;
  alive: boolean;
  eliminatedRound?: Round;
  eliminationCause?: 'starvation'|'exhaustion'|'exile';
  location: LocationId;

  personality: Personality;            // konstant über das Match
  needs: Needs;                        // volatil
  resources: Resources;
  status: StatusFlags;

  relationships: Record<AgentId, Relationship>;  // gerichtet, sparse
  knowledge: Record<InfoId, KnowledgeEntry>;     // was DIESER Agent glaubt
  episodic: EpisodicMemory[];                    // max config.memory.maxEpisodes
  lessons: Record<string, Lesson>;               // key → Lesson, max config.learning.maxLessons

  goals: Goals;
  strategy: Strategy;
  allianceId: AllianceId | null;
  cooldowns: Record<ActionType, Round>;          // frühestmögliche nächste Runde
  reputation: Reputation;                        // abgeleitet, jede Runde neu berechnet
}
```

### 3.2.1 Personality (0–100, konstant)

```ts
interface Personality {
  ambition; loyalty; honesty; empathy; riskTaking;
  intelligence; sociability; manipulation; dominance;   // alle Stat (0..100)
}
```

**[DESIGN] Wichtige Umdeutung durch die Truthfulness-Regel:**
- `honesty` steuert **nicht mehr** ob gelogen wird (Lügen ist unmöglich), sondern die
  **Offenlegungsneigung**: hohe `honesty` → bevorzugt `assert_fact` mit hoher
  Präzision, geringe Neigung zu `refuse_to_answer`; niedrige `honesty` → bevorzugt
  `partial_disclosure`, `withhold`, `redirect`.
- `manipulation` steuert **Informationsökonomie**: Neigung, Wissen als Handelsware
  einzusetzen, selektiv an einzelne Adressaten zu geben, und Timing (Information
  zurückhalten, bis sie teurer ist).

Diese Umdeutung ist der Grund, warum die Persönlichkeitsachsen trotz Lügenverbot
vollständig erhalten bleiben können.

### 3.2.2 Needs / Resources / Status

```ts
interface Needs   { satiety: Stat; energy: Stat; }        // 0 => Ausscheidegefahr
interface Resources { food: number; coins: number; materials: number; }   // Integer ≥ 0
interface StatusFlags {
  hungerStreak: number;      // Runden mit satiety === 0
  exhaustionStreak: number;
  exiledFrom: AllianceId[];  // für Consequence-Logik
}
```

**[DESIGN] Ressourcen-Reduktion (bewusste Streichung):**
`tools` gestrichen → aufgegangen in `materials` (Materials sind gleichzeitig Werkzeug-
Substrat und Baumaterial). `information` gestrichen → Information ist kein Bestandsgut,
sondern `KnowledgeEntry`; sie wird über `share_information` gegen `coins` gehandelt.
`influence` gestrichen als Ressource → ist eine **abgeleitete Kennzahl** (`Reputation`),
weil eine speicherbare Einfluss-Währung sonst zwei konkurrierende Wahrheiten über den
sozialen Status erzeugt.

### 3.2.3 Goals

```ts
interface Goals {
  shortTerm: ShortTermGoal[];   // max 3, engine-generiert aus Needs/Lage, jede Runde geprüft
  longTerm: LongTermGoal;       // 1, bei Match-Start aus Persönlichkeit gezogen
  secret: SecretGoal;           // 1, nur dem Agenten selbst bekannt
}
interface ShortTermGoal { key: string; target: number; deadline?: Round; urgency: Score01; }
interface LongTermGoal  { key: 'accumulate_wealth'|'lead_alliance'|'survive_alone'
                             |'be_trusted_by_most'|'control_information'; progress: Score01; }
interface SecretGoal    { key: 'outlast_rival'|'own_warehouse_stock'|'dissolve_an_alliance'
                             |'be_owed_by_five'|'never_break_a_pledge';
                          params: Record<string, unknown>; revealedTo: AgentId[]; }
```

**[DESIGN]** Ziele stammen aus geschlossenen Enums, nicht aus LLM-Freitext — sonst sind
sie weder scorebar noch testbar.

### 3.2.4 Strategy

```ts
interface Strategy {
  // Gewichte der Utility-Funktion; werden durch Reflection angepasst (gedeckelt)
  weights: Record<'survival'|'wealth'|'social'|'alliance'|'information'|'caution', number>; // Σ=1
  disclosurePolicy: 'open'|'measured'|'guarded';   // beeinflusst Statement-Wahl
  alliancePreference: 'none'|'small'|'large';
  version: number;                                  // erhöht sich bei jeder Anpassung
  lastChangedRound: Round;
}
```

**[DESIGN]** Reflection darf `weights` pro Anpassung um max. ±0.10 pro Achse verschieben
(danach renormalisiert) und höchstens alle `reflectionInterval` Runden. Ohne diese
Deckelung entsteht "unkontrolliertes Lernen" mit oszillierenden Agenten.

---

## 3.3 Relationship (gerichtet: A → B)

```ts
interface Relationship {
  trust: Stat; friendship: Stat; respect: Stat; fear: Stat;
  suspicion: Stat; rivalry: Stat; attraction: Stat;
  debt: number;                     // >0: B schuldet A ; <0: A schuldet B (in coins-Äquivalent)
  interactions: number;
  lastInteractionRound: Round;
  lastEventTypes: EventType[];      // Ringpuffer, max 5 — für UI und Erklärbarkeit
}
```

**Regel:** Beziehungswerte ändern sich **ausschließlich** über
`RELATIONSHIP_DELTA_TABLE[eventType]`, moduliert durch die Persönlichkeit des
Wahrnehmenden (z. B. `empathy` verstärkt positive Deltas, `suspicion`-Anstieg skaliert mit
`1 - loyalty`). Keine LLM-freigegebene direkte Beziehungssetzung. Ein LLM darf ein
`RelationshipChange`-Objekt *vorschlagen*, dieses wird aber gegen die Tabelle geclamped
(max ±`config.relationships.maxLlmDelta`, Default 5).

---

## 3.4 Informationssystem (Kern der Asymmetrie und der Truthfulness-Regel)

### 3.4.1 InfoItem — objektive Wahrheit im Registry

```ts
interface InfoItem {
  id: InfoId;
  topic: InfoTopic;
  subject: { kind: 'agent'|'location'|'alliance'|'world'; ref: string };
  valueType: 'quantity'|'boolean'|'categorical'|'event_ref';
  trueValue: number | boolean | string;   // Weltwahrheit — kein Agent liest das je direkt
  createdRound: Round;
  volatility: 'static'|'slow'|'fast';     // steuert, wie schnell Wissen veraltet
}

type InfoTopic =
  | 'stock_at_location'      // wie viel Food/Materials an Ort X liegen
  | 'agent_resource'         // wie viel Y Agent Z besitzt
  | 'agent_alliance'         // in welcher Allianz Z ist
  | 'agent_secret_goal'      // Z's geheimes Ziel
  | 'pledge_state'           // ob Zusage P erfüllt/gebrochen wurde
  | 'event_occurred'         // Ereignis E ist passiert
  | 'agent_intent_declared'; // Z hat öffentlich Absicht I erklärt
```

### 3.4.2 KnowledgeEntry — was ein Agent *glaubt*

```ts
interface KnowledgeEntry {
  infoId: InfoId;
  believedValue: number | boolean | string;      // kann von trueValue abweichen!
  certainty: Score01;                            // 0..1
  source: 'observed'|'participated'|'told_by'|'inferred';
  sourceAgent?: AgentId;                         // Pflicht bei 'told_by'
  acquiredRound: Round;
  lastConfirmedRound: Round;
  sharedWith: AgentId[];                         // wem habe ich das schon gegeben
  isSecret: boolean;                             // vom Besitzer als nicht-teilbar markiert
}
```

**[DESIGN] Vier getrennte Ebenen — verbindlich:**
1. `InfoItem.trueValue` — was tatsächlich gilt.
2. `KnowledgeEntry` — was Agent A glaubt (kann veraltet/verzerrt sein).
3. `certainty` — wie sicher A sich ist.
4. `Statement` — was A davon nach außen sagt.

Ein Agent, dessen `believedValue` falsch ist, **lügt nicht**, wenn er ihn behauptet.
Der Truth-Validator prüft ausschließlich gegen Ebene 2 + 3, nie gegen Ebene 1.
Das ist die technische Auflösung des Abschnitts "Memory und fehlerhafte Überzeugungen".

**Veralten:** Bei `volatility: 'fast'` sinkt `certainty` pro Runde um
`config.info.decayFast` (Default 0.05), bei `'slow'` um 0.01, bei `'static'` gar nicht.
Unterschreitet `certainty` die Assert-Schwelle, darf der Agent es nur noch als
`belief`/`hearsay` äußern — automatisch, ohne dass irgendetwas "entscheiden" muss.

### 3.4.3 Statement — jede sprachliche Äußerung, typisiert

```ts
type Statement =
  | { kind: 'assert_fact'; infoId: InfoId; disclosure: Disclosure }
  | { kind: 'assert_absence'; infoId: InfoId }             // "dort gibt es keine Tools"
  | { kind: 'belief'; infoId: InfoId; hedge: 'i_think'|'not_sure'; disclosure: Disclosure }
  | { kind: 'hearsay'; infoId: InfoId; sourceAgent: AgentId; disclosure: Disclosure }
  | { kind: 'partial_disclosure'; infoId: InfoId; disclosure: Disclosure }  // stets unpräzise
  | { kind: 'refuse_to_answer'; topic: InfoTopic }
  | { kind: 'withhold'; topic: InfoTopic }                 // schweigen, ohne es zu benennen
  | { kind: 'redirect_conversation'; toTopic: InfoTopic }
  | { kind: 'express_uncertainty'; topic: InfoTopic }
  | { kind: 'declare_intent'; intent: IntentKey; pledgeId?: string }
  | { kind: 'none' };

type Disclosure =
  | { mode: 'exact' }                                   // "20 Food"
  | { mode: 'bound'; op: '>='|'<='; value: number }     // "mindestens 10"
  | { mode: 'qualitative'; bucket: 'none'|'some'|'much' }  // "etwas Food"
  | { mode: 'existence_only' };                         // "dort ist etwas Nützliches"
```

**[DESIGN]** Das ist der wichtigste Typ des ganzen Projekts. Weil `Statement` ein
geschlossener, maschinell prüfbarer Datentyp ist, ist "kein Agent darf lügen" eine
**Validierungsregel mit Unit-Tests**, keine Prompt-Bitte an ein LLM. Siehe `08`.

---

## 3.5 Pledge — Zusagen ersetzen die Lüge als Verratsmechanik

```ts
interface Pledge {
  id: string;
  from: AgentId; to: AgentId | AllianceId;
  kind: 'deliver_resource'|'support_in_vote'|'not_share_info'|'join_action'|'stay_in_alliance';
  params: Record<string, number|string>;
  dueRound: Round;
  state: 'open'|'kept'|'broken'|'void';
  publiclyKnown: boolean;
  witnesses: AgentId[];
}
```

**[DESIGN]** Ein Agent, der `declare_intent` + Pledge macht und ihn bricht, hat **nicht
gelogen** (eine Absichtserklärung ist keine Tatsachenbehauptung), aber messbaren Verrat
begangen. Damit bleibt Verrat vollständig erhalten, ohne die Truthfulness-Regel zu
verletzen. Pledge-Bruch ist objektiv, beobachtbar und erzeugt harte Beziehungs-Deltas.

---

## 3.6 Alliance

```ts
interface Alliance {
  id: AllianceId;
  name: string;
  founderId: AgentId;
  members: AgentId[];                 // max config.alliance.maxSize
  leaderId: AgentId;
  sharedStock: Resources;
  contributions: Record<AgentId, number>;   // kumulierter Beitragswert → Fairness-Metrik
  charter: { contributionPerRound: number; exitPenalty: number; secrecy: boolean };
  secretPacts: SecretPact[];          // Untergruppen-Absprachen, nur Beteiligten bekannt
  createdRound: Round;
  dissolvedRound?: Round;
  cohesion: Score01;                  // abgeleitet: mittleres Trust der Mitglieder untereinander
}
interface SecretPact { id: string; participants: AgentId[]; kind: 'oust_member'|'skim_stock'|'exit_together'; targetId?: AgentId; createdRound: Round; }
```

---

## 3.7 Memory

```ts
interface EpisodicMemory {
  id: string; round: Round; eventId: string; eventType: EventType;
  participants: AgentId[];
  role: 'actor'|'target'|'witness'|'told';
  valence: number;          // -1..1 aus Sicht des Besitzers
  salience: Score01;        // Wichtigkeit, decayt pro Runde
  summaryKey: string;       // kanonischer Schlüssel, KEIN Freitext (für Aggregation)
  detail?: string;          // optionaler Anzeigetext, nie entscheidungsrelevant
}
```

`RelationshipMemory` wird **nicht** als eigene Liste geführt, sondern ist die
`Relationship`-Struktur plus die nach `participants` indizierten Episoden. Grund:
Vermeidung eines dritten, driftenden Speichers derselben Information.

```ts
interface Lesson {
  key: string;                   // aus geschlossener Taxonomie ODER 'free:<slug>'
  scope: 'about_agent'|'about_world'|'about_strategy';
  subjectRef?: AgentId | string;
  statement: string;             // menschenlesbar, aus Template oder LLM
  confidence: Score01;           // = (e+1)/(e+c+2), Laplace
  evidenceCount: number;         // gedeckelt auf config.learning.evidenceCap (20)
  contradictoryEvidence: number; // ebenso gedeckelt
  supportingEpisodeIds: string[];// max 5, dient dem Epistemik-Nachweis
  firstLearnedRound: Round;
  lastUpdated: Round;
  persistAcrossMatches: boolean; // nur für scope==='about_strategy' erlaubt
}
```

---

## 3.8 WorldEvent & Effect

```ts
interface WorldEvent {
  id: string; matchId: string; round: Round; seq: number;
  type: EventType;
  actorId?: AgentId; targetId?: AgentId; allianceId?: AllianceId;
  locationId: LocationId;
  payload: Record<string, unknown>;      // typisiert pro EventType
  visibility: Visibility;
  infoRefs: InfoId[];                    // welche Infos dieses Event erzeugt/berührt
}
type Visibility =
  | { scope: 'public' }                              // alle erfahren es
  | { scope: 'location'; locationId: LocationId }    // alle Anwesenden
  | { scope: 'participants' }                        // nur actor+target
  | { scope: 'alliance'; allianceId: AllianceId }
  | { scope: 'private'; agentIds: AgentId[] };

type Effect =
  | { t:'resource'; agentId:AgentId; delta:Partial<Resources> }
  | { t:'need'; agentId:AgentId; delta:Partial<Needs> }
  | { t:'relationship'; from:AgentId; to:AgentId; delta:Partial<Relationship> }
  | { t:'knowledge'; agentId:AgentId; entry:KnowledgeEntry }
  | { t:'alliance'; op:'create'|'join'|'leave'|'expel'|'dissolve'|'stock'|'leader'; ... }
  | { t:'pledge'; op:'create'|'resolve'; ... }
  | { t:'move'; agentId:AgentId; to:LocationId }
  | { t:'status'; agentId:AgentId; ... }
  | { t:'eliminate'; agentId:AgentId; cause:EliminationCause };
```

**Regel:** `Effect` ist das einzige, was der `StateMutator` akzeptiert. Aktionen geben
Effects zurück, sie mutieren nichts. Das macht Aktionen rein funktional und trivial testbar.

---

## 3.9 Location

```ts
interface Location {
  id: LocationId; name: string;
  neighbors: LocationId[];
  stock: Resources;                  // was hier liegt/geerntet werden kann
  regenPerRound: Partial<Resources>;
  capacity: Resources;
  occupants: AgentId[];              // abgeleitet, jede Runde neu
  isPublic: boolean;                 // an öffentlichen Orten sind mehr Events sichtbar
}
```

Vorschlag v1: `commons` (öffentlich, Treffpunkt), `fields` (food-Regen), `warehouse`
(Lager, materials, knapp), `workshop` (materials→Nutzen), `well` (satiety/energy),
`outskirts` (privat, wenig Sicht → Ort für geheime Absprachen).

---

## 3.10 MatchConfig (alles, was kalibriert werden muss, an einem Ort)

```ts
interface MatchConfig {
  agentCount: number;                 // 20..40
  maxRounds: number;                  // 100..500
  survivorThreshold: number;          // Abbruch bei ≤ n Überlebenden
  seed: number;
  llmMode: 'off'|'mock'|'live';
  llm: { maxCallsPerRound: number;     // Default 6
         maxCallsPerAgentPerMatch: number; // Default 12
         reflectionInterval: number;   // Default 25
         stakesThreshold: number };    // Default 0.65
  memory: { maxEpisodes: number;       // 60
            salienceDecay: number;     // 0.03/Runde
            compactionThreshold: number };
  learning: { enabled: boolean; maxLessons: number; freeLessonSlots: number;
              evidenceCap: number; persistAcrossMatches: boolean;
              maxWeightDeltaPerReflection: number };  // 0.10
  info: { assertCertaintyThreshold: number;  // 0.80
          decayFast: number; decaySlow: number };
  relationships: { maxLlmDelta: number };
  economy: { foodPerRound: number; gatherBase: number; spoilage: number };
  persistence: { traces: boolean; llmCalls: boolean; snapshotEvery: number };
}
```
# 04 — ACTION SYSTEM

## 4.0 Vertrag einer Aktion

```ts
interface ActionDef<P = Record<string, unknown>> {
  type: ActionType;
  tier: 'routine' | 'social' | 'strategic';       // steuert LLM-Eskalation
  cost: { energy: number; round: 1 };
  cooldown: number;                                // Runden
  requiresTarget: boolean;
  allowsStatement: boolean;
  generate(agent, state): ActionCandidate<P>[];    // nur LEGALE Kandidaten, wissensgefiltert
  precondition(action, state): Ok | Reject;        // harte Prüfung, auch für LLM-Vorschläge
  resolve(action, state, rng): { effects: Effect[]; events: WorldEvent[] };
}
```

**Regeln:**
- `generate` darf nur Kandidaten erzeugen, die der Agent aus **seinem** Wissen heraus
  überhaupt formulieren könnte (z. B. `trade` nur mit Agenten, die er kennt und die am
  selben Ort sind).
- `resolve` ist **rein**: es liest den State und gibt Effects zurück, mutiert nie.
- Jede Zufälligkeit in `resolve` geht durch den übergebenen `rng`-Stream.

---

## 4.1 Action Library v1 (13 Aktionen — final)

| # | Action | Tier | Ziel | Statement | Vorbedingungen (Auszug) | Effekt (Kurz) |
|---|---|---|---|---|---|---|
| 1 | `gather_resource` | routine | – | nein | `energy ≥ 10`; Ort hat `stock > 0` | +Ressource nach `gatherBase × f(location, energy, rng)`, −energy; erzeugt/aktualisiert `stock_at_location`-Info für Anwesende |
| 2 | `rest` | routine | – | nein | immer legal (Fallback-Aktion) | +energy, kleiner satiety-Verlust |
| 3 | `move` | routine | – | nein | Ziel ist Nachbar; `energy ≥ 5` | Ortswechsel; verändert wer was beobachtet |
| 4 | `consume` | routine | – | nein | `food ≥ 1` | −food, +satiety |
| 5 | `trade` | social | Agent | ja | Ziel am selben Ort, `alive`, kein Cooldown, Angebot deckungsfähig | Angebot → Zielagent reagiert inline (accept/counter/decline); bei accept: Ressourcentausch + `debt`-Anpassung |
| 6 | `share_information` | social | Agent | **ja (Pflicht)** | Agent hat `KnowledgeEntry` zum Thema; Ziel am selben Ort | Statement wird truth-validiert; bei accept entsteht beim Ziel ein `KnowledgeEntry` mit `source:'told_by'` und reduzierter `certainty` |
| 7 | `request_information` | social | Agent | ja | Ziel am selben Ort | Ziel antwortet mit einem legalen `Statement` (inkl. `refuse_to_answer`) |
| 8 | `offer_alliance` | strategic | Agent/Allianz | ja | nicht in Allianz ODER Leader mit freiem Platz | Ziel entscheidet inline; bei accept: Allianz entsteht/wächst |
| 9 | `leave_alliance` | strategic | – | ja | in Allianz | Austritt, `exitPenalty`, harte Trust-Deltas bei Ex-Mitgliedern |
| 10 | `expel_member` | strategic | Agent | ja | Leader; Ziel ist Mitglied | Ausschluss + Exile-Zählung |
| 11 | `help` | social | Agent | optional | eigene Ressourcen reichen | Transfer ohne Gegenleistung; erzeugt `debt` beim Ziel, starke Trust/Friendship-Deltas |
| 12 | `investigate` | social | Agent/Ort | nein | am Ort bzw. Ziel am selben Ort; Cooldown 3 | Prüft eine bestehende Überzeugung: `certainty` steigt bei Bestätigung, `believedValue` wird korrigiert bei Widerlegung |
| 13 | `confront` | social | Agent | **ja (Pflicht)** | Agent besitzt Wissen über gebrochene Zusage/Regelbruch des Ziels | öffentliche Konfrontation am Ort; Reputationseffekte für **beide**; wenn der Vorwurf faktisch nicht gedeckt ist ⇒ Aktion wird vom Validator abgelehnt |

### Ergänzende Nicht-Aktionen (Reaktionen, kein eigener Zug)
`respond_trade`, `respond_alliance`, `respond_information_request` — werden **inline** in
Phase 6 vom Zielagenten erzeugt und verbrauchen dessen Rundenzug nicht.

### Pledges
Kein eigener Aktionstyp. Ein `declare_intent`-Statement an `trade`, `offer_alliance` oder
`help` kann optional einen `Pledge` erzeugen. Das hält die Library klein.

---

## 4.2 Bewusst gestrichene Aktionen

| Gestrichen | Grund |
|---|---|
| `lie`, `fabricate_information`, `invent_evidence`, `knowingly_spread_false_rumor` | **Global verboten.** Existieren nicht im `ActionType`-Enum. Ein Unit-Test prüft, dass keiner dieser Strings im Code vorkommt. |
| `sabotage` | **[DESIGN] Gestrichen für v1.** Begründung: Sabotage ist verdeckte Schadenszufügung; sie braucht ein Verdachts-/Aufdeckungssystem, damit sie sozial interessant wird, und das ist im 1-Wochen-Scope nicht sauber testbar. Verrat läuft in v1 über Pledge-Bruch, Austritt, Ausschluss und Informationsentzug — das reicht für die Kernthese. **Kandidat für v1.1** (siehe Backlog P2). |
| `negotiate` als eigene Aktion | Verhandlung ist ein Parameter von `trade` (`counter`-Reaktion), keine eigene Aktion. Sonst zwei überlappende Codepfade. |
| `join_alliance` als eigene Aktion | Beitritt ist die Reaktion auf `offer_alliance`. Ein Agent kann nicht einseitig beitreten. |
| `rumor_spread` | Deckungsgleich mit `share_information` + `hearsay`-Statement. |

---

## 4.3 Auflösungsreihenfolge (deterministisch)

Innerhalb einer Runde werden Aktionen in dieser festen Klassenreihenfolge aufgelöst,
innerhalb einer Klasse nach `(initiative desc, agentId asc)`:

1. `move` (Ortszuweisung muss vor allem Ortsabhängigen stehen)
2. `rest`, `consume`
3. `gather_resource`
4. `trade`, `help`
5. `share_information`, `request_information`, `investigate`
6. `offer_alliance`, `leave_alliance`, `expel_member`
7. `confront`

`initiative` = deterministische Funktion aus `(personality.dominance, energy, rngStream('initiative', round))`.

**[DESIGN]** Konflikte um dieselbe knappe Ressource (zwei Agenten ernten denselben
`stock`) werden nach dieser Reihenfolge first-come-first-served aufgelöst — nicht anteilig.
Das erzeugt Knappheitsdruck und ist deterministisch.
# 05 — AGENT DECISION PIPELINE

Wie aus einem Weltzustand genau eine validierte Aktion pro Agent wird.

---

## 5.1 Schritt für Schritt

### Schritt 0 — AgentView bauen (Isolation)
```ts
buildAgentView(state, agentId): AgentView
```
Erzeugt eine **abgeschottete Sicht**: eigener Agent vollständig, andere Agenten nur mit
öffentlich sichtbaren Feldern (Ort, Allianzzugehörigkeit falls bekannt, Reputation),
plus die eigenen `KnowledgeEntry`s. `AgentView` enthält **keinen** Zugriff auf
`infoRegistry.trueValue`, fremde `knowledge`, fremde `secret goals` oder fremde Memories.

**[DESIGN]** Das ist die strukturelle Absicherung gegen "Agenten mit unzulässigem Wissen":
die Policy und der LLM-Prompt bekommen ausschließlich `AgentView` übergeben; die
Funktionssignaturen lassen den vollen `WorldState` gar nicht durch. Ein Unit-Test prüft,
dass `AgentView` keinen Pfad zu Fremdwissen enthält (Serialisierungs-Diff-Test).

### Schritt 1 — Kandidatengenerierung
Jede `ActionDef.generate(view)` liefert legale Kandidaten. Ergebnis: typischerweise
20–80 Kandidaten. Bereits hier sind alle Statements wissensgefiltert (es kann kein
Kandidat entstehen, der eine unbekannte `infoId` referenziert).

### Schritt 2 — Deterministisches Utility-Scoring
```
score(c) =  w.survival    · needUrgency(c)
          + w.wealth      · resourceGain(c)
          + w.social      · relationalGain(c)
          + w.alliance    · allianceGain(c)
          + w.information · informationGain(c)
          − w.caution     · riskEstimate(c)
          + goalAlignment(c, goals)
          + lessonBias(c, lessons)          // ← hier wirkt Gelerntes
          + personalityBias(c, personality)
          + ε · rngStream('choice', agentId, round)   // winziger Tie-Break
```
`lessonBias` ist der einzige Kanal, über den Lernen das Verhalten beeinflusst — bewusst
eine einzige, messbare Stelle. Beispiel: Lesson `breaks_pledges(agent_12)` mit
`confidence 0.8` senkt den Score jedes Kandidaten mit `target=agent_12` in den Klassen
`trade`/`offer_alliance` um `k · confidence`.

### Schritt 3 — Eskalationsentscheidung
```ts
stakes = f(bestScoreGap, actionTier, involvedResourceShare,
           allianceImpact, pledgeInvolved, targetRelationshipVolatility, secretGoalRelevance)
```
Eskaliert wird, wenn **alle** zutreffen:
1. `stakes ≥ config.llm.stakesThreshold`
2. Rundenbudget nicht ausgeschöpft (`llm.maxCallsPerRound`)
3. Agentenbudget nicht ausgeschöpft (`llm.maxCallsPerAgentPerMatch`)
4. `llmMode !== 'off'`

Sonst: **Top-Kandidat der Policy wird genommen.** Der Normalfall ist deterministisch.

### Schritt 4 — LLM-Entscheidung (nur bei Eskalation)
Der Prompt enthält: `AgentView`-Kurzform, Persönlichkeitsprofil, aktuelle Ziele, die
5 relevantesten Lessons, die 8 salientesten Episoden, die Beziehung zum Ziel — und die
**Top-8-Kandidatenliste als Enum**. Das LLM wählt einen Index und liefert Parameter,
`reasoning_summary`, `confidence`. Es darf **keine** freie Aktion erfinden; das Schema
lässt nur `candidate_index: 0..7` zu.

**[DESIGN]** Das ist die stärkste Vereinfachung der Architektur: das LLM *wählt und
begründet*, es *konstruiert* nicht. Dadurch ist jede LLM-Ausgabe per Konstruktion legal,
und der Validator muss nur noch Randfälle abfangen (veralteter State zwischen Generierung
und Anwendung).

### Schritt 5 — Validation
Siehe `08-validation-and-truthfulness.md`. Reihenfolge: Schema → Precondition →
Truth-Validator → Ressourcen-Reservierung. Bei REJECT: 1 Repair-Versuch mit
Fehlerbeschreibung, danach nächstbester Policy-Kandidat, danach `rest`. Jeder REJECT wird
im `DecisionTrace` und in `metrics.rejects[reason]` gezählt.

### Schritt 6 — Resolution & Reaktion
`resolve()` liefert Effects + Events. Wenn ein Ziel reagieren muss, durchläuft dessen
Reaktion **dieselbe Pipeline in Kurzform** (Kandidaten = {accept, counter, decline} bzw.
legale Statements), inklusive Truth-Validierung der Antwort.

### Schritt 7 — Mutation, Konsequenz, Memory
`StateMutator.apply` → `assertInvariants` → Beziehungsdeltas → Pledge-Prüfung →
Episoden schreiben (nur bei Wahrnehmenden).

---

## 5.2 DecisionTrace (Grundlage des Debug Mode)

Für jede Entscheidung wird — sofern `persistence.traces` an ist — festgehalten:

```ts
interface DecisionTrace {
  round; agentId;
  viewHash: string;                       // Hash des AgentView → Reproduzierbarkeit
  candidates: { action; score; scoreBreakdown: Record<string, number> }[];  // Top 10
  lessonsApplied: { key; confidence; effectOnScore: number }[];
  escalated: boolean; stakes: number; escalationReason?: string;
  llm?: { promptHash; rawResponse; parsed; latencyMs; tokensIn; tokensOut };
  validation: { checks: { name; passed; detail? }[]; finalVerdict: 'accept'|'repair'|'fallback' };
  chosen: AgentAction;
  effects: Effect[];
  stateDiff: JsonPatch[];                 // exakt, was sich geändert hat
}
```

**[DESIGN]** `scoreBreakdown` und `lessonsApplied` sind der eigentliche Wert des Debug
Modes: sie beantworten "warum hat der Agent das getan?" auch dann, wenn gar kein LLM
beteiligt war — was in der Mehrzahl der Fälle so sein wird.

---

## 5.3 DecisionProvider — Vorbereitung für Player Mode

```ts
interface DecisionProvider {
  decide(view: AgentView, candidates: ActionCandidate[], ctx): Promise<AgentAction>;
}
```
Implementierungen: `PolicyProvider` (deterministisch), `LlmProvider`, `ScriptedProvider`
(Tests), später `HumanProvider` (Player Mode). Die Engine kennt nur das Interface.
Damit ist Player Mode ein reines UI-Thema und kein Engine-Umbau.
# 06 — MEMORY + LEARNING SYSTEM

## 6.1 Drei Speicher, klar getrennt

| Speicher | Inhalt | Wächst? | Obergrenze |
|---|---|---|---|
| **Episodic** | konkrete erlebte Ereignisse ("Jonas gab mir an Tag 14 Nahrung") | ja, mit Pruning | `maxEpisodes` = 60 |
| **Relationship** | aggregierte Erfahrung mit einer Person | nein (feste Struktur) | 1 Objekt pro bekanntem Agenten |
| **Strategic Lessons** | generalisierte Erkenntnisse | ja, mit Deckel | `maxLessons` = 30, davon `freeLessonSlots` = 5 |

**[DESIGN]** Relationship-Memory ist bewusst **keine Ereignisliste**, sondern die
aggregierte `Relationship`-Struktur plus ein Index auf die Episoden. Sonst existiert
dieselbe Information dreimal und driftet auseinander.

---

## 6.2 Episodenerzeugung — die Epistemik-Schranke

Eine Episode entsteht **ausschließlich** in Phase 9, und nur für Agenten, die in
`resolveObservers(event.visibility, state)` enthalten sind.

```ts
function writeEpisodes(event, state) {
  for (const observerId of resolveObservers(event.visibility, state)) {
    // role = actor | target | witness | told
    push(agent.episodic, makeEpisode(event, role, valence, salience));
  }
}
```

Es gibt **keinen zweiten Pfad**, über den eine Episode entsteht. Ein Test
(`no-omniscience.test.ts`) fährt 200 Runden und prüft für jede Episode jedes Agenten,
dass der Agent im Observer-Set des referenzierten Events war. Das ist die technische
Antwort auf "Ein Agent darf keine Erkenntnisse aus Ereignissen gewinnen, die er nicht
erlebt oder erfahren hat".

### Salience
```
salience = clamp01( base[eventType]
                  + 0.30 · |valence|
                  + 0.20 · (role === 'actor' || role === 'target' ? 1 : 0)
                  + 0.20 · resourceMagnitudeNorm
                  + 0.15 · (pledgeInvolved ? 1 : 0)
                  + 0.15 · (allianceInvolved ? 1 : 0) )
```
Pro Runde: `salience *= (1 - salienceDecay)`. Episoden, die eine Lesson stützen
(`supportingEpisodeIds`), sind **pinned** und decayen nicht unter 0.35.

### Pruning & Compaction (verhindert Memory Explosion)
Bei `episodic.length > maxEpisodes`:
1. Sortiere aufsteigend nach `salience`.
2. Nimm die untersten 20 %.
3. **Compaction statt Löschen:** aggregiere sie nach `(summaryKey, participants)` in die
   `Relationship`-Zähler bzw. in `Lesson.evidenceCount` — die *Erkenntnis* bleibt, das
   *Detail* verschwindet.
4. Entferne sie aus der Liste.

**[ANNAHME]** 60 Episoden × 40 Agenten ≈ 2 400 Objekte pro Match. Das ist unkritisch —
muss aber im Long-Run-Test tatsächlich gemessen werden (Test `memory-bounds.test.ts`
prüft die Obergrenze über 400 Runden hart).

---

## 6.3 Lernen: zwei Erzeugungspfade

### Pfad A — Pattern Miner (deterministisch, Standardfall)

Eine geschlossene Taxonomie von Lesson-Keys, jeweils mit einem Detektor, der über die
eigenen Episoden läuft. **Kein LLM.** Beispiele:

| Lesson-Key | Detektor (über eigene Episoden) |
|---|---|
| `keeps_pledges(X)` | Anteil `pledge_kept` an allen beobachteten Pledge-Auflösungen von X |
| `breaks_pledges(X)` | Gegenstück |
| `trades_fairly(X)` | Verhältnis erhaltener/gegebener Werte in eigenen Trades mit X |
| `shares_information(X)` | Häufigkeit von `share_information` durch X an mich |
| `withholds_from_me(X)` | Häufigkeit von `refuse_to_answer`/`withhold` durch X mir gegenüber |
| `X_left_alliance` | beobachtete Austritte von X |
| `food_scarce_early` | Runde, ab der eigene `satiety` erstmals kritisch wurde, über Matches |
| `large_alliances_unstable_for_me` | mittlere Lebensdauer der Allianzen, in denen ich war, nach Größe |
| `trading_at_commons_works` | Erfolgsquote eigener Trades nach Ort |
| `strategy_v{n}_underperformed` | Score-Delta seit letzter Strategieänderung |

Jeder Detektor liefert `(evidenceCount, contradictoryCount)`. Daraus:

```
confidence = (evidence + 1) / (evidence + contradictory + 2)      // Laplace
```

**[DESIGN]** Warum Laplace statt freiem LLM-Confidence-Wert: monoton, beschränkt,
selbstkorrigierend, deterministisch, trivial testbar, und **neue Gegenbeweise korrigieren
alte Erkenntnisse automatisch** — genau die geforderte Eigenschaft. `evidenceCount` und
`contradictoryCount` sind bei `evidenceCap` = 20 gedeckelt, damit ein Agent nach 200
Bestätigungen nicht mehr unkorrigierbar wird (gleitendes Fenster).

### Pfad B — LLM Reflection (selten, gedeckelt)

Alle `reflectionInterval` (Default 25) Runden, gestaffelt (Agent reflektiert in Runde
`r` wenn `r % interval === hash(agentId) % interval`), und nur wenn der Agent ≥3 neue
Episoden mit `salience > 0.6` hat. Input: nur eigene Episoden + eigene Lessons.
Output (Schema `reflection_result`): Anpassung der `strategy.weights` (max ±0.10 pro
Achse) plus max. 2 freie Lessons für die 5 `freeLessonSlots`.

Freie Lessons unterliegen denselben Regeln: sie brauchen `supportingEpisodeIds`, und der
Validator lehnt sie ab, wenn eine referenzierte Episode nicht im Speicher des Agenten
liegt. Ist ein Slot voll, verdrängt eine neue Lesson die mit der niedrigsten
`confidence × recency`.

**[DESIGN]** Warum Pfad A dominiert: Reflection per LLM für 40 Agenten × 400 Runden wäre
selbst bei Intervall 25 rund 640 Calls pro Match — das ist die größte Kostenfalle des
gesamten Entwurfs. Mit Staffelung + Salience-Gate + Deckel landen wir bei geschätzt
**[ANNAHME]** 150–250 Calls pro Match, und `llmMode: 'off'` liefert über Pfad A trotzdem
vollständiges Lernverhalten. Genau deshalb sind Long-Run-Tests überhaupt möglich.

---

## 6.4 Zwei Lernmodi

### Fresh Match (Default)
Beim Start: `episodic = []`, `lessons = {}`, `relationships = {}`,
`strategy = archetypeDefault(personality)`. Nichts wird übernommen.

### Persistent Agents (optional, `learning.persistAcrossMatches: true`)
Am Matchende werden **nur** Lessons mit `scope === 'about_strategy'` und
`confidence ≥ 0.7` in `persistent_lessons` geschrieben, gebunden an eine stabile
`agent_archetype_id` (nicht an die Match-`AgentId`).

**Niemals persistiert:** `about_agent`-Lessons, Beziehungen, Episoden, Wissen, Ressourcen.
Begründung: Personenwissen aus einem anderen Match ist per Definition Wissen über
Ereignisse, die dieser Agent in diesem Match nicht erlebt hat — das verletzt die
Epistemik-Regel.

Beim Laden: `evidenceCount` wird auf `min(evidenceCount, 5)` gedämpft ("verblasste
Erfahrung"), damit Altwissen im neuen Match widerlegbar bleibt.

**[DESIGN]** Für die Wirksamkeitsmessung ist Persistent Agents der A/B-Hebel:
100 Matches mit persistenten vs. 100 mit frischen Agenten, gleiche Seeds, Vergleich der
Überlebens- und Score-Verteilung. Ergibt sich kein Unterschied, ist das Lernsystem
nachweislich wirkungslos — das ist der Test aus `01 §1.5 Punkt 6`.
# 07 — LLM BOUNDARIES

## 7.1 Harte Trennlinie

| Immer deterministisch (nie LLM) | LLM erlaubt (Vorschlag, nie Ausführung) |
|---|---|
| Hunger, Energie, Verbrauch, Regeneration | Auswahl unter bereits legalen Kandidaten bei hohem Einsatz |
| Ressourcensuche, Erträge, Spoilage | Verhandlungsparameter innerhalb erlaubter Grenzen (Preis in `[min,max]`) |
| Alle Zahlenänderungen, alle Effects | Reaktion auf Allianzangebot / Austritt / Ausschluss |
| Cooldowns, Initiative, Auflösungsreihenfolge | Konfrontationsentscheidung |
| Beziehungsdeltas (Tabelle) | Wahl des `Statement`-Typs und der `Disclosure`-Stufe |
| Wer was wahrnimmt (Visibility) | Reflection: Strategiegewichte + freie Lessons |
| Wissenserzeugung, `certainty`-Decay | `reasoning_summary` (reiner Anzeigetext) |
| Truth-Validierung | Verbalizer: Text aus geprüftem Statement erzeugen |
| Pattern-Miner-Lessons, `confidence`-Berechnung | – |
| Scoring, Ausscheiden, Endebedingung | – |
| Ziel-Generierung (aus Enums) | – |

## 7.2 Was das LLM strukturell **nicht kann**

1. Es sieht nur `AgentView` — kein Fremdwissen, keine Weltwahrheit.
2. Es wählt aus einer **vorgefilterten Kandidatenliste** (`candidate_index: 0..7`), es
   konstruiert keine Aktion. Illegale Aktionen sind nicht ausdrückbar.
3. Es kann keine Zahl direkt setzen; Parameter werden gegen `[min,max]` geclamped.
4. Es kann keinen Freitext produzieren, der irgendetwas verändert. `reasoning_summary`
   und `detail` sind reine Anzeigefelder und werden nirgends geparst.
5. Es kann keine Behauptung formulieren — nur einen `Statement`-Typ mit `infoId` wählen,
   der anschließend truth-validiert wird.

## 7.3 Budget & Kostenkontrolle

```
maxCallsPerRound        = 6      // hart, unabhängig von der Agentenzahl
maxCallsPerAgentPerMatch= 12
reflectionInterval      = 25     // gestaffelt über Agenten
```

Ablauf pro Runde: alle Eskalationswünsche sammeln → nach `stakes` sortieren → Top-6
ausführen → Rest fällt auf die deterministische Policy zurück (und wird als
`metrics.escalationDropped` gezählt, damit man sieht, ob das Budget zu klein ist).

**Grobe Größenordnung [ANNAHME], muss gemessen werden:** ~6 Decision-Calls/Runde × 400
Runden = 2 400 Calls plus ~200 Reflection-Calls pro Match. Für ein Demo-Match mit
`maxRounds: 100` sind das ~800 Calls. Long-Run-Batches laufen grundsätzlich mit
`llmMode: 'off'` — dort ist die Zahl exakt 0.

## 7.4 LlmGateway-Vertrag

```ts
interface LlmGateway {
  call<T>(req: { purpose: 'decision'|'reaction'|'reflection'|'verbalize';
                 schema: ZodSchema<T>; prompt: string;
                 agentId: AgentId; round: Round; }): Promise<LlmResult<T>>;
}
```
- **Modi:** `off` (wirft nie, gibt sofort `{ok:false, reason:'disabled'}`), `mock`
  (deterministische Fake-Antworten aus dem RNG — für reproduzierbare Tests des
  LLM-Pfads), `live`.
- **Cache:** Key = `hash(purpose + promptHash)`. Identische Situationen kosten nichts.
- **Timeout** (Default 8 s) und **1 Retry** bei Schema-Fehler mit angehängter
  Fehlermeldung. Danach: deterministischer Fallback. **Die Simulation blockiert nie.**
- **Protokoll:** jeder Call landet in `llm_calls` (abschaltbar) und im `DecisionTrace`.

**[DESIGN]** Der `mock`-Modus ist nicht optional. Ohne ihn ist der LLM-Codepfad selbst
(Prompt-Bau, Parsing, Repair, Fallback) nicht deterministisch testbar, und genau dort
entstehen erfahrungsgemäß die nicht reproduzierbaren Fehler.
# 08 — VALIDATION SYSTEM & TRUTHFULNESS RULE

Das wichtigste Dokument des Projekts. Hier wird die Regel "kein Agent darf lügen" von
einer Absicht in eine **prüfbare Funktion** übersetzt.

---

## 8.1 Validierungskette vor jedem State Change

Jede Aktion durchläuft in dieser Reihenfolge. Erster Fehler bricht ab.

| # | Check | Prüft | Bei Fehlschlag |
|---|---|---|---|
| 1 | **Schema** | Zod-Parse der `AgentAction` | REJECT `schema_invalid` |
| 2 | **Identity** | actor existiert, `alive`, ist am Zug, kein Doppelzug | REJECT `actor_invalid` |
| 3 | **Target** | Ziel existiert, `alive`, erreichbar (gleicher Ort), nicht self (außer erlaubt) | REJECT `target_invalid` |
| 4 | **Precondition** | `ActionDef.precondition` (Cooldown, Energie, Mitgliedschaft, Leaderrechte) | REJECT `precondition_failed` |
| 5 | **Resource** | Agent besitzt, was er anbietet/ausgibt; Allianzlager deckt Entnahme | REJECT `insufficient_resources` |
| 6 | **Knowledge** | jede referenzierte `infoId` ist im `knowledge` des Actors | REJECT `unknown_reference` |
| 7 | **TRUTH** | § 8.2 — vollständige Prüfung des `Statement` | REJECT `false_assertion` \| `unsupported_certainty` \| `unattributed_hearsay` |
| 8 | **Parameter clamp** | numerische Parameter in `[min,max]` | Clamp (kein Reject) |
| 9 | **Effect sanity** | resultierende Effects verletzen keine Invariante (Simulation der Anwendung) | REJECT `effect_invalid` |

Nach der Mutation: `assertInvariants(state)` — in Tests und im Dev-Modus immer, in
Long-Run-Batches per Config alle N Runden (Performance).

**Reject-Handling:** 1× Repair (bei LLM-Herkunft mit Fehlertext), sonst nächstbester
Policy-Kandidat, sonst `rest`. Jeder Reject wird gezählt. **Eine Reject-Rate > 2 % ist ein
Bug, kein Betriebszustand** — der Kandidatengenerator hätte den Fall nicht anbieten dürfen.

---

## 8.2 Der Truth-Validator

### 8.2.1 Grundsatz

> Geprüft wird gegen den **Wissensstand des Agenten**, nicht gegen die Weltwahrheit.

Ein Agent mit veralteter oder falscher Überzeugung darf diese aussprechen — das ist ein
Irrtum, keine Lüge. Ein Agent, der etwas behauptet, das seinem *eigenen* `KnowledgeEntry`
widerspricht, lügt — und wird abgelehnt.

### 8.2.2 Regeln (vollständig, implementierbar)

Sei `k = agent.knowledge[infoId]`, `θ = config.info.assertCertaintyThreshold` (0.80).

**R1 — Wissensdeckung.** Jede `infoId` in einem `Statement` muss in `agent.knowledge`
existieren. Sonst `unknown_reference`.

**R2 — Assert braucht Sicherheit.** `kind: 'assert_fact'` erfordert
`k.certainty ≥ θ` **und** `k.source ∈ {'observed','participated'}`.
Sonst `unsupported_certainty` → der Agent muss auf `belief` oder `hearsay` ausweichen.
*Umsetzung der Regel "Unsicherheit muss kenntlich gemacht werden."*

**R3 — Entailment.** Die Behauptung muss `k.believedValue` **enthalten**. Formal: die
Menge der Werte, die die Aussage zulässt, muss `k.believedValue` beinhalten.

```ts
function entails(disclosure: Disclosure, believed: number): boolean {
  switch (disclosure.mode) {
    case 'exact':          return disclosure.value === believed;
    case 'bound':          return disclosure.op === '>=' ? believed >= disclosure.value
                                                         : believed <= disclosure.value;
    case 'qualitative':    return bucketOf(believed) === disclosure.bucket;
    case 'existence_only': return believed > 0;
  }
}
```
Damit ist "Ich habe Geld" bei 100 Coins **erlaubt** (`existence_only`, 100 > 0), und
"Ich habe fast kein Geld" **abgelehnt** (`qualitative: 'none'`, aber `bucketOf(100) = 'much'`).
Exakt der geforderte Fall aus der Regel.

**[DESIGN] Buckets sind global definiert und pro `InfoTopic` kalibriert**, z. B. für
`agent_resource:coins`: `none: 0–5`, `some: 6–49`, `much: ≥50`. Ohne feste Buckets ist
"irreführende Teilwahrheit" nicht entscheidbar. Die Bucket-Tabelle ist Teil der Config
und wird in Tests festgenagelt.

**R4 — Keine Behauptung aus Unwissenheit (Negation).**
`assert_absence(infoId)` ist nur zulässig, wenn `k` existiert **und**
`k.believedValue` Abwesenheit bedeutet (`0` / `false`) **und** `k.certainty ≥ θ`.
Ein Agent, der über Tools am Warehouse nichts weiß, darf **nicht** sagen "dort gibt es
keine Tools" — er muss `express_uncertainty` oder `refuse_to_answer` nutzen.
*Das ist der Kern des Warehouse-Beispiels aus der Regel.*

**R5 — Hearsay muss attribuiert sein.** `kind: 'hearsay'` erfordert
`k.source === 'told_by'` **und** `k.sourceAgent === statement.sourceAgent`.
Ein per Hörensagen erlangtes Wissen darf **nie** als `assert_fact` geäußert werden
(folgt bereits aus R2, wird aber separat getestet).
*Umsetzung des Gerüchte-Abschnitts: "Jonas hat mir erzählt, dass…" erlaubt,
"Maya versteckt Nahrung" nicht.*

**R6 — Inferiertes Wissen ist nie Fakt.** `k.source === 'inferred'` erlaubt maximal
`belief`. Keine Ausnahme.

**R7 — Konsistenz mit früheren eigenen Aussagen.** Ein Agent darf zu derselben `infoId`
nicht zwei einander ausschließende Behauptungen machen, ohne dass sich sein
`believedValue` dazwischen geändert hat. Geprüft über `statementLog[agentId][infoId]`
(letzte Aussage + `believedValue` zum Zeitpunkt). Bei Widerspruch ohne Wissensänderung:
REJECT `self_contradiction`.
**[DESIGN]** Ohne R7 könnte ein Agent durch geschickte Bucket-Wahl gegenüber zwei
Personen zwei unvereinbare Bilder zeichnen, ohne je formal falsch zu sein. R7 schließt
diese Lücke. Hat sich das Wissen tatsächlich geändert, ist die neue Aussage erlaubt —
und ein Zuhörer, der beides gehört hat, bekommt eine `suspicion`-Erhöhung, was
spielmechanisch erwünscht ist.

**R8 — Zusagen sind keine Tatsachenbehauptungen.** `declare_intent` unterliegt R1–R7
nicht; eine Absichtserklärung ist wahr oder falsch erst im Nachhinein. Ein gebrochener
Pledge ist Verrat, keine Lüge. Er erzeugt `pledge_broken`-Events und harte
Beziehungsdeltas — aber keinen Validierungsfehler.

**R9 — Verweigerung ist immer legal.** `refuse_to_answer`, `withhold`,
`redirect_conversation`, `express_uncertainty` sind ausnahmslos zulässig, unabhängig vom
Wissensstand. Sie kosten nichts außer sozialen Konsequenzen (`suspicion +`, `trust −`
beim Fragenden, moduliert durch dessen Persönlichkeit).

**R10 — Geheimhaltungs-Pledge.** Wer einen `not_share_info`-Pledge hat, kann die
betreffende Info dennoch teilen — der Validator lässt es zu, weil es keine Lüge ist. Es
erzeugt aber `pledge_broken`. Verrat bleibt möglich; Lüge nicht.

### 8.2.3 Signatur

```ts
function validateStatement(
  statement: Statement,
  actor: Readonly<Agent>,
  ctx: { round: Round; config: MatchConfig; statementLog: StatementLog }
): { ok: true } | { ok: false; reason: TruthRejectReason; detail: string; suggestion?: Statement };
```

`suggestion` liefert die nächstschwächere legale Variante (z. B. `assert_fact` →
`belief` → `express_uncertainty`). Damit kann die Pipeline ohne zweiten LLM-Call reparieren.

### 8.2.4 Zwei Verteidigungslinien

1. **Generativ:** Der Kandidatengenerator erzeugt **nur** Statements, die R1–R7 bereits
   erfüllen. Im Normalbetrieb kann also gar keine unwahre Aussage entstehen.
2. **Validierend:** Der Truth-Validator prüft trotzdem jede Aussage erneut, weil sich der
   State zwischen Generierung und Anwendung geändert haben kann und weil das LLM
   Parameter beisteuert.

**[DESIGN]** Diese Redundanz ist beabsichtigt: Linie 1 macht das System schnell und
LLM-freundlich, Linie 2 macht die Regel beweisbar. Der Long-Run-Test zählt
`falseAssertionsRejected` — der Zielwert ist **0 im Normalbetrieb**, und jeder Ausschlag
zeigt einen Generator-Bug.

### 8.2.5 Verbalizer (Text kommt zuletzt)

```
Statement (geprüft)  ──►  Verbalizer  ──►  string   (nur Anzeige)
```
Deterministische Templates als Default (`llmMode: 'off'` bleibt voll funktionsfähig),
optional ein LLM-Verbalizer für flüssigere Sprache. Der LLM-Verbalizer bekommt **nur das
geprüfte Statement**, nicht den Agentenzustand, und sein Output wird **nirgends geparst
oder gespeichert außer als Anzeigetext**. Damit kann er die Truthfulness-Regel technisch
nicht verletzen.

**[OFFEN]** Ein LLM-Verbalizer kann formulierungsbedingt Nuancen hinzufügen, die im
Statement nicht stehen ("nur ein bisschen" statt "etwas"). Für v1: Templates als Default,
LLM-Verbalizer nur im Demo-Modus, mit dem Hinweis im Debug-Panel, dass die geprüfte
Wahrheit das Statement-Objekt ist, nicht der Satz.

---

## 8.3 Testtabelle (direkt implementierbar als `truth-validator.test.ts`)

| Wissen des Agenten | Statement | Erwartung |
|---|---|---|
| Warehouse: food=20, tools=5 (observed, cert 0.95) | `assert_fact(food, existence_only)` | ✅ accept |
| dito | `assert_fact(food, qualitative:'much')` | ✅ accept |
| dito | `refuse_to_answer(stock_at_location)` | ✅ accept |
| dito | `assert_absence(tools)` | ❌ `false_assertion` |
| dito | `assert_fact(food, exact 5)` | ❌ `false_assertion` |
| keine Kenntnis über tools | `assert_absence(tools)` | ❌ `unknown_reference` |
| coins=100 (eigene, cert 1.0) | `assert_fact(coins, existence_only)` | ✅ accept |
| coins=100 | `assert_fact(coins, qualitative:'none')` | ❌ `false_assertion` |
| coins=100 | `refuse_to_answer(agent_resource)` | ✅ accept |
| food-Info von Jonas (told_by, cert 0.5) | `assert_fact(...)` | ❌ `unsupported_certainty` |
| dito | `hearsay(..., sourceAgent: jonas)` | ✅ accept |
| dito | `hearsay(..., sourceAgent: maya)` | ❌ `unattributed_hearsay` |
| dito | `belief(..., hedge:'not_sure')` | ✅ accept |
| believedValue veraltet (Welt: 0, geglaubt: 20, cert 0.85, observed) | `assert_fact(food, qualitative:'much')` | ✅ accept — **Irrtum, keine Lüge** |
| inferred, cert 0.9 | `assert_fact(...)` | ❌ `unsupported_certainty` (R6) |
| sagte gestern `qualitative:'much'`, Wissen unverändert | heute `qualitative:'none'` | ❌ `self_contradiction` |
| sagte gestern `much`, Wissen hat sich auf 2 geändert | heute `none` | ✅ accept |

---

## 8.4 Weitere Invarianten-Tests (State-Konsistenz)

- `assertInvariants`: Ressourcen ≥ 0, Stats in 0..100, Coin-Erhaltung, Allianz-Konsistenz.
- `no-omniscience.test.ts`: jede Episode/Knowledge eines Agenten ist auf ein Event
  zurückführbar, in dessen Observer-Set er war.
- `agent-view-isolation.test.ts`: serialisierte `AgentView` enthält keinen fremden
  `secretGoal`, kein fremdes `knowledge`, keinen `trueValue`.
- `determinism.test.ts`: gleicher Seed, `llmMode:'off'` → identischer Event-Log-Hash über
  400 Runden, 5 Wiederholungen.
- `no-lie-actions.test.ts`: Quelltext enthält keine der verbotenen Aktionsnamen.
# 09 — FOLDER STRUCTURE

**[DESIGN]** Ein einziges Next.js-Repo, kein Monorepo, keine Workspaces. Die Engine ist
durch ein *Verzeichnis* und eine *ESLint-Boundary-Regel* isoliert, nicht durch ein
Package — das spart im 1-Wochen-Scope Build- und Tooling-Zeit bei gleicher Trennschärfe.

```
ai-battle-royale/
├─ src/
│  ├─ engine/                      # ⛔ importiert NIE react/next/db
│  │  ├─ core/
│  │  │  ├─ types.ts               # alle Entities (Doc 03)
│  │  │  ├─ config.ts              # MatchConfig + Defaults + Buckets
│  │  │  ├─ rng.ts                 # seeded PRNG, benannte Streams
│  │  │  ├─ ids.ts                 # deterministische ID-Vergabe
│  │  │  ├─ invariants.ts          # assertInvariants
│  │  │  └─ eventLog.ts            # Append + Hash
│  │  ├─ world/
│  │  │  ├─ initWorld.ts           # Weltgenerierung aus Seed
│  │  │  ├─ locations.ts
│  │  │  ├─ upkeep.ts              # Phase 1
│  │  │  ├─ perception.ts          # Phase 2 — EINZIGE Wissensquelle
│  │  │  └─ scoring.ts             # Phase 11, Leaderboards, Ausscheiden
│  │  ├─ agents/
│  │  │  ├─ createAgent.ts         # Persönlichkeit, Ziele, Archetypen
│  │  │  ├─ agentView.ts           # Isolation (Doc 05 §5.1)
│  │  │  ├─ needs.ts
│  │  │  └─ reputation.ts
│  │  ├─ actions/
│  │  │  ├─ registry.ts            # ActionType-Enum + Lookup
│  │  │  ├─ defs/                  # eine Datei pro Aktion (13)
│  │  │  └─ resolutionOrder.ts
│  │  ├─ information/
│  │  │  ├─ infoRegistry.ts
│  │  │  ├─ knowledge.ts           # KnowledgeEntry, certainty-Decay
│  │  │  ├─ statements.ts          # Statement-Typen, Disclosure, Buckets
│  │  │  ├─ statementLog.ts        # für R7 (self_contradiction)
│  │  │  └─ verbalizer.ts          # Statement → Anzeigetext (Templates)
│  │  ├─ social/
│  │  │  ├─ relationships.ts       # RELATIONSHIP_DELTA_TABLE
│  │  │  ├─ alliances.ts
│  │  │  └─ pledges.ts
│  │  ├─ decision/
│  │  │  ├─ candidates.ts          # Phase 3
│  │  │  ├─ utility.ts             # Scoring inkl. lessonBias
│  │  │  ├─ stakes.ts              # Eskalationskriterium
│  │  │  ├─ provider.ts            # DecisionProvider-Interface
│  │  │  ├─ policyProvider.ts
│  │  │  └─ llmProvider.ts
│  │  ├─ validation/
│  │  │  ├─ validateAction.ts      # Kette 1–9 (Doc 08 §8.1)
│  │  │  ├─ truthValidator.ts      # R1–R10  ← Kernstück
│  │  │  └─ rejectReasons.ts
│  │  ├─ memory/
│  │  │  ├─ episodic.ts
│  │  │  ├─ salience.ts
│  │  │  └─ compaction.ts
│  │  ├─ learning/
│  │  │  ├─ lessons.ts             # Lesson-Typ, Laplace-Confidence
│  │  │  ├─ miners/                # ein Detektor pro Lesson-Key
│  │  │  ├─ reflection.ts          # Phase 10
│  │  │  └─ persistence.ts         # Persistent-Agents-Modus
│  │  ├─ llm/
│  │  │  ├─ gateway.ts             # off | mock | live
│  │  │  ├─ prompts/
│  │  │  └─ schemas.ts             # Zod → JSON Schema
│  │  ├─ mutation/
│  │  │  ├─ effects.ts             # Effect-Typen
│  │  │  └─ stateMutator.ts        # ⚠ EINZIGE Schreibstelle
│  │  ├─ runner/
│  │  │  ├─ runRound.ts            # Phasen 1–11
│  │  │  ├─ runMatch.ts
│  │  │  └─ godEvents.ts
│  │  └─ index.ts                  # öffentliche Engine-API
│  ├─ persistence/                 # better-sqlite3, nur außerhalb der Engine
│  │  ├─ db.ts  schema.sql  repositories/
│  ├─ server/
│  │  ├─ matchRunner.ts            # Singleton, hält WorldState
│  │  └─ serialize.ts              # WorldState → UI-DTOs
│  ├─ app/                         # Next.js App Router
│  │  ├─ page.tsx                  # Dashboard
│  │  ├─ agent/[id]/page.tsx
│  │  ├─ graph/page.tsx
│  │  ├─ debug/page.tsx
│  │  └─ api/{match,step,god,state,trace}/route.ts
│  ├─ components/                  # UI
│  ├─ cli/
│  │  ├─ sim.ts                    # headless N Matches
│  │  ├─ stats.ts                  # Auswertung → Report
│  │  └─ replay.ts                 # Event-Log erneut abspielen
│  └─ analysis/                    # Metriken für Long-Run-Reports
├─ tests/
│  ├─ unit/  integration/  simulation/  golden/
│  └─ fixtures/
├─ docs/                           # diese Dokumente
├─ schemas/                        # generierte JSON Schemas
├─ data/                           # SQLite-Dateien (gitignored)
├─ vitest.config.ts  eslint.config.js  package.json  tsconfig.json
└─ CLAUDE.md                       # Arbeitsregeln für Claude Code
```

## 9.1 ESLint-Boundary (nicht optional)

```js
// engine darf nichts aus ui/persistence/next/react importieren
{ files: ['src/engine/**'],
  rules: { 'no-restricted-imports': ['error', { patterns:
    ['next/*','react','react-*','@/app/*','@/components/*','@/persistence/*','@/server/*'] }] } }
```

## 9.2 CLAUDE.md — Regeln, die im Repo stehen müssen

1. Der `StateMutator` ist die einzige Stelle, die den World State verändert.
2. Kein Modul in `src/engine/**` importiert React, Next oder die DB.
3. Jede Zufälligkeit geht durch einen benannten RNG-Stream — nie `Math.random()`.
4. Agenten erhalten ausschließlich `AgentView`, nie `WorldState`.
5. Aktionen `lie`, `fabricate_information`, `invent_evidence`,
   `knowingly_spread_false_rumor` dürfen nicht existieren.
6. Jede Aussage ist ein `Statement`-Objekt und wird truth-validiert; Freitext verändert nie State.
7. Neue Aktion ⇒ neue Datei in `actions/defs/` + Unit-Test + Eintrag in `resolutionOrder`.
8. Jede Lesson braucht `supportingEpisodeIds` aus dem eigenen Speicher des Agenten.
9. Vor jedem Commit: `pnpm test` inkl. `determinism.test.ts` grün.
# 10 — TEST STRATEGY

## 10.1 Vier Ebenen

### A) Unit Tests (schnell, das Rückgrat)
| Zielmodul | Was geprüft wird |
|---|---|
| `truthValidator` | **Die Tabelle aus Doc 08 §8.3, vollständig.** Wichtigster Test des Projekts. |
| `entails` / Buckets | Grenzfälle jeder Disclosure-Stufe |
| `rng` | gleicher Seed → gleiche Folge; Stream-Unabhängigkeit (neuer Stream verschiebt alte nicht) |
| `validateAction` | jede der 9 Ketten-Stufen einzeln, positiv und negativ |
| `actions/defs/*` | pro Aktion: `generate` liefert nur Legales, `precondition` lehnt korrekt ab, `resolve` ist rein (State unverändert) und liefert erwartete Effects |
| `stateMutator` | jeder Effect-Typ; Invarianten nach Anwendung |
| `salience` / `compaction` | Deckel wird eingehalten, gepinnte Episoden überleben |
| `lessons` | Laplace-Confidence monoton; `evidenceCap` greift; Gegenbeweis senkt Confidence |
| `perception` | Visibility-Matrix: wer sieht was an welchem Ort |
| `agentView` | Isolation (Serialisierungs-Diff) |
| `relationships` | Delta-Tabelle, Clamping bei LLM-Vorschlägen |

### B) Integration Tests (eine Runde / wenige Runden, gescriptete Agenten)
- Vollständige Runde mit `ScriptedProvider`: erwartete Effects, Events, Episoden.
- Handel: Angebot → Gegenangebot → Annahme; Ressourcen- und `debt`-Bilanz stimmt.
- Allianz-Lebenszyklus: Gründung → Beitritt → Beitrag → Austritt → Auflösung.
- Pledge: erstellen → Fälligkeit → `kept` bzw. `broken` → Beziehungsdeltas.
- Informationsfluss: A beobachtet → A teilt mit B → B kennt es mit `told_by`,
  geringerer `certainty` → B darf es **nur** als `hearsay` weitergeben.
- Fehlerpfad: LLM liefert ungültiges JSON → Repair → Fallback → Simulation läuft weiter.

### C) Simulation Tests (1 Match, 200–400 Runden, `llmMode:'off'`)
Invarianten über den gesamten Lauf, nach **jeder** Runde geprüft:
1. Keine negative Ressource, keine Stat außerhalb 0..100.
2. Coin-Erhaltung (außer deklarierten Quellen/Senken).
3. Kein Wissensleck (`no-omniscience`).
4. Memory-Obergrenzen eingehalten.
5. Reject-Rate < 2 %; `falseAssertionsRejected === 0`.
6. Simulation endet (kein Deadlock, kein Endlos-Cooldown).
7. Kein Agent bleibt >20 Runden ohne jede Interaktion (Aktivitäts-Sanity).

### D) Long-Run Tests (100 Matches × 300–500 Runden, headless, ohne LLM)
```bash
pnpm sim --matches 100 --rounds 400 --agents 30 --seed-base 1000 --llm off --report out/report.json
```
Ausgewertete Kennzahlen:
- Gewinnverteilung nach Persönlichkeitsarchetyp
- mittlere/mediane Allianzdauer, Allianzgröße über Zeit
- Häufigkeit je Aktionstyp; häufigste Handelspaare
- Ressourcenverlauf (Median, Gini-Koeffizient)
- Anzahl gebrochener Pledges, Austritte, Ausschlüsse (= Verratsmaß)
- Lernwirkung: mittlere Lesson-Anzahl, Confidence-Verteilung, Strategieänderungen/Match
- Performance: ms/Runde, Peak-Heap
- Fehler: Reject-Gründe, Exceptions, Invariantenbrüche

### E) Golden / Determinismus
`tests/golden/`: Seed → erwarteter Event-Log-Hash nach 100 und 400 Runden.
Bricht der Hash unbeabsichtigt, ist eine Verhaltensänderung eingetreten. Bei
beabsichtigter Änderung wird das Golden bewusst neu geschrieben (Commit-Nachricht muss
das benennen).

## 10.2 A/B-Harness für Lernwirkung (P1)
```bash
pnpm sim --ab learning --matches 100 --rounds 400
```
Arm A: `learning.enabled = true`. Arm B: Lessons eingefroren. Gleiche Seeds, gleiche
Startbedingungen. Ausgabe: Differenz in Überlebensrate und Endscore mit
Konfidenzintervall. **[DESIGN]** Ohne diesen Test bleibt unbelegt, ob das Lernsystem
etwas bewirkt — und genau das ist die Behauptung, die das Projekt trägt.

## 10.3 Was NICHT getestet wird
Keine LLM-Output-Qualitätstests (nicht deterministisch bewertbar), keine
UI-Snapshot-Tests (UI ändert sich zu schnell), keine E2E-Browser-Tests in v1.
Der LLM-*Codepfad* wird über `llmMode: 'mock'` getestet, der LLM-*Inhalt* nicht.
# 11 — IMPLEMENTATION BACKLOG

Jede Aufgabe ist so geschnitten, dass sie einzeln implementierbar und **einzeln testbar**
ist. Aufwand in Punkten (1 ≈ eine kurze Session, 3 ≈ ein halber Tag). **[ANNAHME]** —
Schätzungen, keine Messwerte.

## P0 — ohne das gibt es keine Simulation

| ID | Aufgabe | Aufwand | Abhängig von | Fertig, wenn |
|---|---|---|---|---|
| T01 | Repo-Setup: Next.js + TS strict + Vitest + ESLint-Boundary + `CLAUDE.md` | 1 | – | `pnpm dev` und `pnpm test` laufen; Boundary-Regel schlägt bei Testimport an |
| T02 | `core/types.ts` + Zod-Schemas für alle Entities aus Doc 03 | 3 | T01 | Typen kompilieren, JSON-Schemas werden generiert |
| T03 | `rng.ts`: seeded PRNG mit benannten Streams | 1 | T01 | Determinismus- und Stream-Unabhängigkeitstest grün |
| T04 | `eventLog.ts` + `WorldEvent` + Log-Hash | 1 | T02 | Append + stabiler Hash getestet |
| T05 | `initWorld.ts`: Welt + Orte + N Agenten aus Seed | 2 | T02,T03 | gleicher Seed → identische Startwelt |
| T06 | `stateMutator.ts` + `effects.ts` + `invariants.ts` | 2 | T02 | jeder Effect-Typ getestet; Invariantenbruch wirft |
| T07 | `runRound.ts`-Skelett mit Phasen 1,3,4,5,6,7,11 und nur `rest`+`gather` | 3 | T04,T05,T06 | 100 Runden laufen; Golden-Hash-Test grün |
| T08 | `upkeep.ts`: Hunger, Energie, Verbrauch, Ausscheiden | 2 | T07 | Agent verhungert reproduzierbar in erwarteter Runde |
| T09 | CLI `sim.ts`: 1 Match headless, JSON-Report | 1 | T07 | `pnpm sim --matches 1` läuft |
| T10 | `information/`: InfoRegistry, KnowledgeEntry, certainty-Decay | 3 | T02 | Decay-Test; Wissen entsteht nur über die vorgesehene API |
| T11 | `perception.ts` + Visibility-Auflösung | 3 | T10,T07 | Visibility-Matrix-Test für alle 5 Scopes |
| T12 | `statements.ts`: Statement-Typen, Disclosure, Bucket-Tabelle, `entails` | 2 | T10 | `entails`-Unit-Tests grün |
| T13 | **`truthValidator.ts` R1–R7 + R9** | 3 | T12 | **Tabelle aus Doc 08 §8.3 vollständig grün** |
| T14 | `validateAction.ts`: Kette 1–9 + Reject-Gründe + Fallback | 2 | T13,T06 | jede Stufe positiv/negativ getestet |
| T15 | `actions/registry.ts` + `resolutionOrder.ts` | 1 | T07 | Reihenfolge deterministisch |
| T16 | Aktionen: `move`, `consume` | 1 | T15 | Unit-Tests |
| T17 | Aktion `trade` + Reaktion `respond_trade` (accept/counter/decline) | 3 | T15,T14 | Bilanz- und Verhandlungstest |
| T18 | Aktionen `share_information`, `request_information` + Wissenstransfer | 3 | T13,T11 | Hearsay-Kette A→B→C korrekt |
| T19 | `relationships.ts` + Delta-Tabelle + Consequence-Phase | 2 | T07 | Deltas pro Event-Typ getestet |
| T20 | `alliances.ts` + `offer_alliance`, `leave_alliance`, `expel_member` | 3 | T17,T19 | Lebenszyklus-Integrationstest |
| T21 | `pledges.ts` + `declare_intent` + Fälligkeitsprüfung | 2 | T20 | kept/broken-Test |
| T22 | `memory/`: Episoden, Salience, Decay, Pruning, Compaction | 3 | T11,T19 | Obergrenze über 400 Runden gehalten |
| T23 | `decision/utility.ts` + `policyProvider.ts` + `candidates.ts` | 3 | T15,T22 | Policy trifft plausible Entscheidungen; `scoreBreakdown` vorhanden |
| T24 | `learning/`: Lesson-Typ, Laplace, 6 Pattern-Miner, `lessonBias` | 3 | T22,T23 | Confidence-Tests; Lernen wirkt messbar auf Scores |
| T25 | Simulations-Invarianten-Suite (Doc 10 §C) | 2 | T23 | 400 Runden ohne Verletzung |
| T26 | Long-Run-Harness + `stats.ts` + Report | 2 | T25,T09 | 100×400 läuft, Report enthält alle Kennzahlen aus Doc 10 §D |
| T27 | Persistence: SQLite-Schema, Event-Log, Snapshots, Resume | 2 | T04 | Resume aus Snapshot erzeugt identischen Folgezustand |
| T28 | `matchRunner.ts` + API-Routen (`init/step/state/reset`) | 2 | T27 | UI kann steppen |
| T29 | UI Dashboard + Event Feed + Controls | 3 | T28 | Runden sichtbar steuerbar |
| T30 | UI Character Profile (inkl. Lessons, Wissen, Ziele) | 2 | T28 | alle Agentendaten sichtbar |
| T31 | **Debug Mode**: DecisionTrace-Erfassung + Trace-Ansicht | 3 | T23,T28 | "Warum hat Agent X das getan?" ist für jede Runde beantwortbar |

**P0-Summe ≈ 66 Punkte.**

## P1 — wichtig, macht die Simulation gut

| ID | Aufgabe | Aufwand |
|---|---|---|
| T32 | `llm/gateway.ts` mit `off`/`mock`/`live`, Budget, Cache, Retry | 3 |
| T33 | `llmProvider.ts` + `stakes.ts` + Decision-Prompt (Kandidatenauswahl) | 3 |
| T34 | `reflection.ts` mit LLM (Strategiegewichte + freie Lessons) | 3 |
| T35 | Aktionen `help`, `investigate`, `confront` | 3 |
| T36 | God Mode: 5 kuratierte Events + UI-Panel | 2 |
| T37 | Social Graph (Kraft-Layout, Kantenfilter nach Beziehungsdimension) | 2 |
| T38 | Leaderboards (influence/wealth/alliances/reputation) | 1 |
| T39 | `verbalizer.ts` Templates für alle Statement-Typen | 2 |
| T40 | Persistent-Agents-Modus + `persistent_lessons` + Dämpfung | 2 |
| T41 | A/B-Harness Lernwirkung (Doc 10 §10.2) | 2 |
| T42 | Truth-Validator R8 + R10 (Pledge-Abgrenzung), R7 `statementLog` | 2 |
| T43 | Kalibrierungs-Sweep: Ökonomie-Parameter so einstellen, dass Erfolgskriterien §1.5.5 erreicht werden | 3 |
| T44 | `replay.ts`: Event-Log erneut abspielen und visualisieren | 2 |

## P2 — optional, erst wenn P0+P1 stehen

| ID | Aufgabe |
|---|---|
| T45 | `sabotage` + Verdachts-/Aufdeckungssystem |
| T46 | Player Mode (`HumanProvider` + UI) |
| T47 | LLM-Verbalizer für flüssigere Sprache (mit Debug-Hinweis) |
| T48 | Secret Pacts innerhalb von Allianzen als eigene UI |
| T49 | Zeitrafferansicht / Timeline-Scrubber |
| T50 | Export eines Matches als lesbare Chronik (Markdown) |
| T51 | Parameter-Tuning-UI (Config live editierbar) |
# 12 — 7-DAY BUILD ORDER

Geordnet nach **technischen Abhängigkeiten**, nicht nach Stunden. Jeder "Tag" ist ein
abgeschlossener Zustand, in dem etwas nachweisbar funktioniert. Wenn ein Tag länger
dauert, verschiebt sich alles — die Reihenfolge bleibt.

---

### Tag 1 — Deterministischer Kern
**T01, T02, T03, T04, T05, T06, T07, T09**

Ergebnis: Eine Welt entsteht aus einem Seed, 100 Runden laufen headless durch mit nur
`rest` und `gather`, der Event-Log-Hash ist reproduzierbar.

> **Gate:** `determinism.test.ts` grün. Ohne dieses Gate wird Tag 2 nicht begonnen —
> alles Spätere wird sonst unmöglich zu debuggen.

### Tag 2 — Bedürfnisse, Information, Wahrnehmung
**T08, T10, T11, T16**

Ergebnis: Agenten verhungern, bewegen sich, essen. Wissen entsteht ausschließlich über
Perception; `certainty` verfällt. Der Visibility-Test läuft.

> **Gate:** `no-omniscience.test.ts` und `agent-view-isolation.test.ts` grün.

### Tag 3 — Wahrheit
**T12, T13, T14, T15**

Ergebnis: Statements existieren als Typ, der Truth-Validator ist vollständig und die
Testtabelle aus Doc 08 §8.3 ist grün. Die Validierungskette hängt vor jeder Mutation.

> **Gate:** Die Truthfulness-Regel ist ab hier bewiesen, nicht behauptet. Dies ist der
> inhaltliche Kern des Projekts und bekommt bewusst einen eigenen Tag.

### Tag 4 — Sozialsystem
**T17, T18, T19, T21**

Ergebnis: Handel funktioniert inklusive Gegenangebot. Informationen werden geteilt und
korrekt als Hörensagen weitergereicht. Beziehungen verändern sich ereignisgetrieben.
Zusagen werden erfüllt oder gebrochen.

### Tag 5 — Allianzen, Gedächtnis, Entscheidung
**T20, T22, T23**

Ergebnis: Erste vollständige Simulation mit echtem Verhalten. Agenten bilden Allianzen,
erinnern sich, entscheiden per Utility-Policy — **ohne jeden LLM-Call**.

> **Gate:** 400 Runden ohne Invariantenbruch, Memory-Obergrenze gehalten.

### Tag 6 — Lernen, Long-Run, Persistenz
**T24, T25, T26, T27**

Ergebnis: Lessons entstehen aus Mustern, beeinflussen Entscheidungen messbar.
`pnpm sim --matches 100 --rounds 400` liefert einen Statistik-Report. Matches werden
gespeichert und sind fortsetzbar.

> **Gate:** Der Report zeigt die Kennzahlen aus Doc 10 §D. **Hier wird zum ersten Mal
> sichtbar, ob die Simulation interessant ist.** Falls nicht: Tag 7 wird zum
> Kalibrierungstag (T43) und die UI schrumpft auf Dashboard + Debug.

### Tag 7 — Sichtbarkeit
**T28, T29, T30, T31**, danach nach Zeit: **T32, T33, T36, T37, T38**

Ergebnis: Web-UI mit Dashboard, Event Feed, Character Profile, Controls und — vor allem —
**Debug Mode**. Danach, wenn Zeit bleibt: LLM-Gateway und Eskalation, God Mode, Graph.

---

## 12.1 Reihenfolge-Begründung (wichtigste Punkte)

**Warum das LLM erst am Ende kommt.** Die Simulation muss ohne LLM vollständig
funktionieren — sonst sind Long-Run-Tests unbezahlbar, Determinismus unerreichbar und
jeder Fehler nicht reproduzierbar. Das LLM ist eine *Veredelung* der Entscheidungsqualität,
kein Fundament. Wird es zuerst gebaut, entsteht ein System, dessen Verhalten man nicht
mehr erklären kann.

**Warum die UI erst am Ende kommt.** Die UI ist reine Projektion des States. Jede Stunde
UI vor Tag 6 ist eine Stunde, die an Verhalten fehlt — und die UI muss doppelt gebaut
werden, wenn sich das Datenmodell noch bewegt. Ausnahme: der Debug Mode ist **kein**
optionales UI-Feature, sondern das Werkzeug, mit dem die letzten Tage überhaupt
debuggbar sind — deshalb ist er in Tag 7 gleichrangig mit dem Dashboard.

**Warum die Wahrheit einen eigenen Tag bekommt.** Der Truth-Validator sitzt zwischen
jeder Entscheidung und jeder Mutation. Wird er nachträglich eingezogen, muss jede bereits
gebaute soziale Aktion angefasst werden.

**Realistische Erwartung [ANNAHME]:** In einer Woche entsteht mit hoher Wahrscheinlichkeit
Tag 1–6 solide plus eine funktionale, nicht schöne UI. Der LLM-Pfad (T32–T34) ist der
wahrscheinlichste Kandidat für Woche 2. Das ist kein Scheitern: die Simulation ist
mit `llmMode: 'off'` vollständig spielbar — das ist genau der Grund für diese Architektur.
# 13 — KRITISCHE PRÜFUNG DER EIGENEN ARCHITEKTUR

Selbstprüfung entlang der von dir vorgegebenen Risikoliste. Jeder Punkt: gefundenes
Problem → getroffene Gegenmaßnahme → **Restrisiko, das bleibt**.

---

### 1. Unnötige Komplexität
**Gefunden:** Der ursprüngliche Umfang enthielt 5 Ressourcen, 13+ Aktionen inkl.
`negotiate` und `sabotage`, eine separate Relationship-Memory-Liste, `join_alliance` als
eigene Aktion, und Ziele als Freitext.

**Gestrichen:**
- `tools` → in `materials` aufgegangen; `information` und `influence` sind keine Ressourcen.
- `sabotage` → v1.1 (braucht ein Aufdeckungssystem, um sozial zu funktionieren).
- `negotiate` → Parameter von `trade`.
- `join_alliance` → Reaktion, keine Aktion.
- Relationship-Memory als dritter Speicher → Aggregat + Episodenindex.
- Freitext-Ziele → geschlossene Enums.
- Monorepo/Workspaces → ein Repo mit ESLint-Boundary.
- Vektor-Embeddings für Memory → Salience + Tags.

**Restrisiko:** Der `Statement`/`Disclosure`-Typ ist ein zusätzliches Konzept, das in
einem Standard-Simulationsentwurf nicht vorkäme. Er ist der Preis für die
Truthfulness-Regel und nicht reduzierbar — aber er ist Aufwand, der ehrlich benannt sein muss.

---

### 2. Zu viele LLM-Aufrufe
**Gefunden:** Der naive Entwurf (jeder Agent entscheidet per LLM) ergibt bei 30 Agenten ×
400 Runden **12 000 Calls pro Match** — und macht 100 Matches unmöglich.

**Gegenmaßnahme:** Deterministische Utility-Policy als Standard; LLM nur bei
`stakes ≥ 0.65`; harte Deckel `maxCallsPerRound = 6` und `maxCallsPerAgentPerMatch = 12`;
Reflection gestaffelt mit Salience-Gate; Prompt-Cache; `llmMode: 'off'` für alle
Long-Run-Tests (dann exakt 0 Calls).

**Restrisiko:** Die Zahlen 6 / 0.65 / 25 sind **[ANNAHME]**, nicht gemessen. Ist die
Eskalationsschwelle zu hoch, wirkt das LLM nie und die Agenten sind reine
Utility-Maschinen; ist sie zu niedrig, ist das Budget in 3 Runden verbraucht. `T43`
(Kalibrierungs-Sweep) und die Metrik `escalationDropped` existieren genau deswegen.

---

### 3. Fehlende State-Konsistenz
**Gegenmaßnahme:** Genau eine Schreibstelle (`StateMutator`), Aktionen sind rein und
liefern nur `Effect[]`, `assertInvariants` nach jeder Mutation, `Readonly<WorldState>` in
allen anderen Signaturen, RNG-State im Snapshot enthalten.

**Restrisiko:** TypeScripts `Readonly` ist nur zur Compile-Zeit wirksam. Ein
versehentliches `structuredClone`-Vergessen kann trotzdem mutieren. Gegenmittel:
`Object.freeze` im Dev-Modus (Config-Flag `strictFreeze`), abgeschaltet in Long-Runs.

---

### 4. Agenten mit unzulässigem Wissen
**Gefunden:** Der häufigste Fehler in solchen Systemen — irgendwo wird der volle State in
einen Prompt oder eine Scoring-Funktion gereicht.

**Gegenmaßnahme:** `AgentView` als einziger Zugang; Wissen entsteht nur in Phase 2 und
beim Auflösen von `share_information`; `no-omniscience.test.ts` prüft jede Episode gegen
das Observer-Set; `agent-view-isolation.test.ts` prüft die Serialisierung.

**Restrisiko:** Die Utility-Funktion könnte versehentlich globale Aggregate benutzen
("mittlerer Wohlstand aller"), die ein Agent nicht kennen kann. Das fängt kein
automatischer Test. **Mitigation:** `utility.ts` darf ausschließlich `AgentView` als
Parameter haben — per Signatur erzwungen, im Review geprüft.

---

### 5. Memory Explosion
**Gegenmaßnahme:** harte Deckel (60 Episoden / 30 Lessons), Salience-Decay,
Compaction statt Löschen, `evidenceCap` 20. Test prüft die Grenze über 400 Runden.

**Restrisiko:** `Relationship` ist pro *Paar* — bei 40 Agenten sind das bis zu 1 560
gerichtete Objekte pro Match. Unkritisch, aber es wächst quadratisch mit der Agentenzahl.
Bei >60 Agenten müsste man Beziehungen zu nie begegneten Agenten lazy anlegen (tut der
Entwurf bereits: `relationships` ist sparse).

---

### 6. Unkontrolliertes Lernen
**Gefunden:** Freie LLM-Reflection erzeugt beliebig viele, beliebig formulierte,
nicht vergleichbare und nicht widerlegbare "Erkenntnisse" — und Strategiegewichte, die
zwischen Extremen oszillieren.

**Gegenmaßnahme:** Geschlossene Lesson-Taxonomie mit deterministischen Minern als
Hauptpfad; nur 5 freie Slots; Laplace-Confidence statt LLM-Zahl; `evidenceCap` als
gleitendes Fenster, damit Gegenbeweise immer wirken; Strategiegewichte max ±0.10 pro
Reflection und nur alle 25 Runden; jede Lesson braucht `supportingEpisodeIds` aus dem
eigenen Speicher.

**Restrisiko:** Ob das Lernen *überhaupt etwas bewirkt*, ist unbewiesen. Deshalb ist
`T41` (A/B-Harness) im Backlog und Erfolgskriterium §1.5.6 bewusst falsifizierbar
formuliert. Es ist möglich, dass die Messung zeigt: das Lernsystem ist Dekoration. Das
wäre ein Befund, kein Fehler — aber er muss gemessen und nicht angenommen werden.

---

### 7. Nicht reproduzierbare Fehler
**Gegenmaßnahme:** benannte RNG-Streams (ein neuer Aufruf verschiebt keine bestehende
Folge), `Math.random()` per Lint verboten, RNG-State im Snapshot, Event-Log-Hash als
Golden Test, `llmMode: 'mock'` für den LLM-Codepfad, `replay.ts`.

**Restrisiko:** Mit `llmMode: 'live'` ist Determinismus **prinzipiell unerreichbar**.
Das ist akzeptiert und explizit dokumentiert: Reproduzierbarkeit gilt für `off` und
`mock`. Zusätzlich wird jeder Live-Call mit Prompt-Hash und Rohantwort geloggt, sodass
ein Lauf zumindest *nachvollziehbar* bleibt, auch wenn er nicht wiederholbar ist.

---

### 8. Schwer testbare Architektur
**Gegenmaßnahme:** Engine ohne Framework-Abhängigkeit; Aktionen als reine Funktionen;
`DecisionProvider`-Interface mit `ScriptedProvider` für Tests; UI ist reine Projektion;
CLI existiert ab Tag 1, nicht als Nachgedanke.

**Restrisiko:** Die Phasenfunktion `runRound` ist naturgemäß groß und koordiniert 11
Phasen. Sie bleibt der am schwersten isoliert testbare Teil. **Mitigation:** jede Phase
ist eine eigene exportierte, einzeln testbare Funktion; `runRound` ist nur deren
Verkettung und wird über Golden-Tests abgesichert.

---

### 9. Features, die den 1-Wochen-Scope gefährden
| Risiko | Entscheidung |
|---|---|
| Player Mode | **Gestrichen** für v1; nur Interface vorbereitet |
| Sabotage + Verdachtssystem | **Verschoben** auf P2 |
| LLM-Verbalizer | **Verschoben** auf P2; Templates sind Default |
| Social Graph mit Animationen | P1, minimal |
| Schöne UI | Ausdrücklich nicht Ziel; funktional reicht |
| Persistent Agents | P1, hinter Flag, Default aus |
| Multi-Allianz-Mitgliedschaft | Gestrichen (max 1 Allianz pro Agent) |
| Mehrere Aktionen pro Runde | Gestrichen |

**Größtes verbleibendes Scope-Risiko:** Tag 6 (Kalibrierung). Eine Simulation, die läuft,
ist nicht dasselbe wie eine Simulation, die interessant ist. Die Wahrscheinlichkeit, dass
die Ökonomie beim ersten Versuch einen guten Korridor trifft, ist gering — und Kalibrierung
ist Messen-Ändern-Messen, also Zeit, die im Plan nur einmal (T43) vorgesehen ist.
Ehrliche Erwartung **[ANNAHME]**: Woche 1 liefert ein korrektes, erklärbares System;
ein *gut ausbalanciertes* System braucht wahrscheinlich eine zweite Woche.

---

### 10. Prüfung der Truthfulness-Regel auf Schlupflöcher

| Schlupfloch | Geschlossen durch |
|---|---|
| Behauptung aus Unwissenheit ("dort gibt es keine Tools") | **R4** — `assert_absence` braucht positives Wissen über Abwesenheit |
| Irreführende Teilwahrheit ("fast kein Geld" bei 100 Coins) | **R3** + feste Bucket-Tabelle |
| Gerücht als Fakt weitergeben | **R2 + R5** — `told_by` erreicht die Assert-Schwelle nie |
| Zwei Personen unterschiedliche Bilder zeichnen | **R7** — Selbstwiderspruchsprüfung über `statementLog` |
| Vermutung als Wissen ausgeben | **R6** — `inferred` erlaubt nur `belief` |
| LLM formuliert Freitext-Behauptung | LLM erzeugt keinen Text, nur Statement-Auswahl; Verbalizer läuft nach der Prüfung und ist Display-only |
| Wahrheit durch Zusagenbruch umgehen | Bewusst **erlaubt** — R8: das ist Verrat, nicht Lüge, und wird als solcher gemessen |
| Veraltetes Wissen behaupten | Bewusst **erlaubt** — Irrtum, keine Lüge (Ebenentrennung Doc 03 §3.4.2) |

**Verbleibende ehrliche Lücke:** Ein Agent kann durch **Auswahl der Adressaten und des
Zeitpunkts** ein verzerrtes Gesamtbild erzeugen, ohne je einen falschen Satz zu sagen.
Das ist kein Fehler des Systems — das ist genau das strategische Verhalten, das die Regel
erzeugen soll.
# 14 — STRUCTURED OUTPUT SCHEMAS

Alle LLM-Ausgaben sind gegen diese Schemas validiert. Quelle der Wahrheit sind
Zod-Definitionen in `src/engine/llm/schemas.ts`; JSON Schema wird daraus generiert
(`zod-to-json-schema`) und für Structured Outputs verwendet.
`additionalProperties: false` gilt überall.

---

## 1. Agent Action (LLM-Ausgabe bei Entscheidung)

```json
{
  "$id": "agent_action",
  "type": "object",
  "required": ["actor_id", "candidate_index", "reasoning_summary", "confidence"],
  "additionalProperties": false,
  "properties": {
    "actor_id":        { "type": "string", "pattern": "^agent_[a-z0-9_]+$" },
    "candidate_index": { "type": "integer", "minimum": 0, "maximum": 7,
                         "description": "Index in der vorgelegten Kandidatenliste. Es kann KEINE eigene Aktion erfunden werden." },
    "parameters": {
      "type": "object", "additionalProperties": false,
      "properties": {
        "offer":   { "$ref": "#/$defs/resource_bundle" },
        "request": { "$ref": "#/$defs/resource_bundle" },
        "pledge":  { "type": ["object","null"],
                     "properties": { "kind": {"enum":["deliver_resource","support_in_vote","not_share_info","join_action","stay_in_alliance"]},
                                     "due_in_rounds": {"type":"integer","minimum":1,"maximum":20} } }
      }
    },
    "statement":         { "$ref": "statement" },
    "reasoning_summary": { "type": "string", "maxLength": 280,
                           "description": "NUR Anzeige. Wird nie geparst, nie gespeichert als Fakt." },
    "confidence":        { "type": "number", "minimum": 0, "maximum": 1 }
  },
  "$defs": {
    "resource_bundle": { "type": "object", "additionalProperties": false,
      "properties": { "food":{"type":"integer","minimum":0}, "coins":{"type":"integer","minimum":0},
                      "materials":{"type":"integer","minimum":0} } }
  }
}
```
**Beispiel (entspricht deinem Muster):**
```json
{ "actor_id":"agent_07","candidate_index":3,
  "parameters":{"offer":{"food":4},"request":{"coins":12}},
  "statement":{"kind":"partial_disclosure","info_id":"info_stock_warehouse_food",
               "disclosure":{"mode":"existence_only"}},
  "reasoning_summary":"Braucht Coins, vertraut agent_18 mäßig, gibt Ortsinfo nur angedeutet preis.",
  "confidence":0.71 }
```

---

## 2. Statement (das sicherheitskritische Schema)

```json
{
  "$id": "statement",
  "type": "object",
  "required": ["kind"],
  "additionalProperties": false,
  "properties": {
    "kind": { "enum": ["assert_fact","assert_absence","belief","hearsay","partial_disclosure",
                       "refuse_to_answer","withhold","redirect_conversation",
                       "express_uncertainty","declare_intent","none"] },
    "info_id":      { "type": "string", "pattern": "^info_[a-z0-9_]+$" },
    "topic":        { "enum": ["stock_at_location","agent_resource","agent_alliance",
                               "agent_secret_goal","pledge_state","event_occurred",
                               "agent_intent_declared"] },
    "source_agent": { "type": "string", "pattern": "^agent_[a-z0-9_]+$" },
    "hedge":        { "enum": ["i_think","not_sure"] },
    "intent":       { "enum": ["will_deliver","will_support","will_stay","will_not_share","will_meet"] },
    "disclosure": {
      "type": "object", "required": ["mode"], "additionalProperties": false,
      "properties": {
        "mode":  { "enum": ["exact","bound","qualitative","existence_only"] },
        "op":    { "enum": [">=","<="] },
        "value": { "type": "number" },
        "bucket":{ "enum": ["none","some","much"] }
      }
    }
  },
  "allOf": [
    { "if": { "properties": { "kind": { "const": "hearsay" } } },
      "then": { "required": ["info_id","source_agent"] } },
    { "if": { "properties": { "kind": { "const": "belief" } } },
      "then": { "required": ["info_id","hedge"] } },
    { "if": { "properties": { "kind": { "enum": ["assert_fact","assert_absence","partial_disclosure"] } } },
      "then": { "required": ["info_id"] } },
    { "if": { "properties": { "kind": { "enum": ["refuse_to_answer","withhold","express_uncertainty"] } } },
      "then": { "required": ["topic"] } }
  ]
}
```
> **Hinweis:** Das Schema erzwingt nur die *Form*. Ob die Aussage mit dem Wissen des
> Agenten vereinbar ist, entscheidet der Truth-Validator (Doc 08 §8.2) — das ist
> Semantik und in JSON Schema nicht ausdrückbar.

---

## 3. Reflection Result

```json
{
  "$id": "reflection_result",
  "type": "object",
  "required": ["agent_id", "weight_adjustments", "new_lessons", "lesson_updates"],
  "additionalProperties": false,
  "properties": {
    "agent_id": { "type": "string" },
    "weight_adjustments": {
      "type": "object", "additionalProperties": false,
      "description": "Delta pro Achse, wird auf ±0.10 geclamped und danach renormalisiert.",
      "properties": {
        "survival":   {"type":"number","minimum":-0.1,"maximum":0.1},
        "wealth":     {"type":"number","minimum":-0.1,"maximum":0.1},
        "social":     {"type":"number","minimum":-0.1,"maximum":0.1},
        "alliance":   {"type":"number","minimum":-0.1,"maximum":0.1},
        "information":{"type":"number","minimum":-0.1,"maximum":0.1},
        "caution":    {"type":"number","minimum":-0.1,"maximum":0.1}
      }
    },
    "disclosure_policy": { "enum": ["open","measured","guarded"] },
    "new_lessons": {
      "type": "array", "maxItems": 2,
      "items": { "$ref": "learned_lesson" }
    },
    "lesson_updates": {
      "type": "array", "maxItems": 5,
      "items": { "type":"object","required":["key","verdict"],"additionalProperties": false,
        "properties": { "key":{"type":"string"},
                        "verdict":{"enum":["confirmed","contradicted"]},
                        "episode_id":{"type":"string"} } }
    },
    "summary": { "type":"string","maxLength":300 }
  }
}
```

---

## 4. Memory (Episodic)

```json
{
  "$id": "episodic_memory",
  "type": "object",
  "required": ["id","round","event_id","event_type","role","valence","salience","summary_key"],
  "additionalProperties": false,
  "properties": {
    "id":          { "type":"string" },
    "round":       { "type":"integer","minimum":1 },
    "event_id":    { "type":"string" },
    "event_type":  { "type":"string" },
    "participants":{ "type":"array","items":{"type":"string"},"maxItems":8 },
    "role":        { "enum":["actor","target","witness","told"] },
    "valence":     { "type":"number","minimum":-1,"maximum":1 },
    "salience":    { "type":"number","minimum":0,"maximum":1 },
    "summary_key": { "type":"string","description":"kanonischer Schlüssel für Aggregation, kein Freitext" },
    "detail":      { "type":"string","maxLength":200,"description":"nur Anzeige" }
  }
}
```

---

## 5. Learned Lesson

```json
{
  "$id": "learned_lesson",
  "type": "object",
  "required": ["key","scope","statement","confidence","evidence_count",
               "contradictory_evidence","supporting_episode_ids","last_updated"],
  "additionalProperties": false,
  "properties": {
    "key":    { "type":"string",
                "description":"aus geschlossener Taxonomie, z.B. keeps_pledges(agent_12), oder free:<slug>" },
    "scope":  { "enum":["about_agent","about_world","about_strategy"] },
    "subject_ref": { "type":"string" },
    "statement":   { "type":"string","maxLength":160 },
    "confidence":  { "type":"number","minimum":0,"maximum":1,
                     "description":"deterministisch berechnet: (e+1)/(e+c+2). LLM-Wert wird verworfen." },
    "evidence_count":         { "type":"integer","minimum":0,"maximum":20 },
    "contradictory_evidence": { "type":"integer","minimum":0,"maximum":20 },
    "supporting_episode_ids": { "type":"array","items":{"type":"string"},
                                "minItems":1,"maxItems":5,
                                "description":"PFLICHT. Müssen im eigenen Speicher des Agenten liegen, sonst REJECT." },
    "first_learned_round": { "type":"integer" },
    "last_updated":        { "type":"integer" },
    "persist_across_matches": { "type":"boolean",
                                "description":"nur bei scope=about_strategy zulässig" }
  }
}
```

---

## 6. Relationship Change

```json
{
  "$id": "relationship_change",
  "type": "object",
  "required": ["from","to","cause_event_id","deltas"],
  "additionalProperties": false,
  "properties": {
    "from": { "type":"string" }, "to": { "type":"string" },
    "cause_event_id": { "type":"string","description":"PFLICHT: keine Änderung ohne Ereignis." },
    "deltas": {
      "type":"object","additionalProperties": false,
      "properties": {
        "trust":     {"type":"number","minimum":-25,"maximum":25},
        "friendship":{"type":"number","minimum":-25,"maximum":25},
        "respect":   {"type":"number","minimum":-25,"maximum":25},
        "fear":      {"type":"number","minimum":-25,"maximum":25},
        "suspicion": {"type":"number","minimum":-25,"maximum":25},
        "rivalry":   {"type":"number","minimum":-25,"maximum":25},
        "attraction":{"type":"number","minimum":-25,"maximum":25},
        "debt":      {"type":"number"}
      }
    },
    "source": { "enum":["table","llm"],
                "description":"llm-Vorschläge werden zusätzlich auf ±config.relationships.maxLlmDelta geclamped" }
  }
}
```

---

## 7. World Event

```json
{
  "$id": "world_event",
  "type": "object",
  "required": ["id","round","seq","type","location_id","visibility"],
  "additionalProperties": false,
  "properties": {
    "id":    { "type":"string" },
    "round": { "type":"integer","minimum":1 },
    "seq":   { "type":"integer","minimum":0 },
    "type":  { "enum":["gathered","consumed","rested","moved","trade_proposed","trade_accepted",
                       "trade_declined","information_shared","information_requested",
                       "information_refused","investigated","alliance_offered","alliance_formed",
                       "alliance_joined","alliance_left","member_expelled","alliance_dissolved",
                       "pledge_created","pledge_kept","pledge_broken","helped","confronted",
                       "agent_eliminated","god_event"] },
    "actor_id":  { "type":"string" },
    "target_id": { "type":"string" },
    "alliance_id": { "type":"string" },
    "location_id": { "enum":["commons","warehouse","fields","workshop","outskirts","well"] },
    "payload":   { "type":"object" },
    "info_refs": { "type":"array","items":{"type":"string"} },
    "visibility": {
      "type":"object","required":["scope"],"additionalProperties": false,
      "properties": {
        "scope": { "enum":["public","location","participants","alliance","private"] },
        "location_id": { "type":"string" },
        "alliance_id": { "type":"string" },
        "agent_ids":   { "type":"array","items":{"type":"string"} }
      }
    }
  }
}
```

**World Events werden nie vom LLM erzeugt** — sie entstehen ausschließlich aus
`ActionDef.resolve`. Das Schema dient der Persistenz, dem Replay und der Analyse.
