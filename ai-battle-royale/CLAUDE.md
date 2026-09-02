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
   verändert nie State.** Ab T12/T13.
7. **Neue Aktion ⇒ neue Datei in `actions/defs/` + Unit-Test + Eintrag in
   `resolutionOrder`.** Ein Eintrag in `registry.ts` ist die Zusage, dass die
   Aktion funktioniert — `ActionType` kennt alle 13, implementiert sind vier.
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

Ein `KnowledgeEntry` entsteht an **genau einer** Stelle: `world/perception.ts`
(Phase 2). Ab T18 kommt eine zweite dazu — das Auflösen von
`share_information`. Sonst nirgends, auch nicht „nur kurz für einen Test".

- `resolveTrueValue` ist die einzige Funktion, die die Weltwahrheit einer Info
  liest. Sie gehört Phase 2. Wer sie anderswo aufruft, gibt einem Agenten
  Wissen, das er nicht erworben hat.
- Der Verfall der Sicherheit wird beim Lesen gerechnet (`effectiveCertainty`),
  nicht gespeichert. `entry.certainty` gilt für `entry.lastConfirmedRound`.
- Jeder Eintrag trägt `sourceEventId`. Ohne diesen Herkunftsnachweis ist
  `no-omniscience` nicht prüfbar.

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

Und: Vergleiche sind Vergleiche. Eine Erinnerung an einen anderen Ort zählt
gegen den eigenen Standort, nicht absolut.

## Golden-Hashes

`tests/golden/determinism.test.ts` nagelt drei Log-Hashes fest. Bricht einer,
ist eine Verhaltensänderung eingetreten. War sie beabsichtigt, wird der Wert neu
geschrieben **und die Commit-Nachricht benennt, welches Verhalten sich geändert
hat** (Doc 10 §E). Ein stillschweigend aktualisierter Golden-Hash macht den Test
wertlos.

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
