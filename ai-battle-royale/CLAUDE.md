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
   Noch nicht gebaut (T23). Bis dahin gilt: die Policy liest nur, was ein Agent
   an seinem eigenen Ort sehen könnte. Wer diese Regel dehnt, macht die spätere
   Isolation unmöglich.
5. **Die vier Aktionen, mit denen ein Agent bewusst falsche Aussagen erzeugen
   könnte, existieren nicht.** Welche das sind, steht in Doc 04 §4.2;
   `tests/unit/noLieActions.test.ts` durchsucht `src/` danach.
6. **Jede Aussage ist ein `Statement`-Objekt und wird truth-validiert; Freitext
   verändert nie State.** Ab T12/T13.
7. **Neue Aktion ⇒ neue Datei in `actions/defs/` + Unit-Test + Eintrag in
   `resolutionOrder`.** Ein Eintrag in `registry.ts` ist die Zusage, dass die
   Aktion funktioniert — `ActionType` kennt alle 13, implementiert sind zwei.
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
