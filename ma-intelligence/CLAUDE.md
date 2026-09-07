# M&A-Intelligence — Arbeitsregeln

Diese Datei gilt fuer alles unterhalb von `ma-intelligence/`.

Zuerst lesen: `agent/CURRENT_STATE.md`. Dort steht, was fertig ist und was der
naechste Schritt ist — nicht erneut das ganze Repository analysieren.

## Die Regeln

1. **Nichts erfinden.** Fehlende Werte sind `null`, nie geschaetzt. Das gilt fuer
   Code, Tests, Dokumentation und Beispieldaten gleichermassen. Testdaten sind
   als erfunden erkennbar ("Beispiel", "Muster") und liegen nur unter `tests/`.
2. **Geruecht ist nicht Vollzug.** `rumored` und `sale_process` sind
   unbestaetigt und muessen ueberall — Datenmodell, Export, Karte — von
   bestaetigten Deals unterscheidbar bleiben.
3. **Nichts erreicht `data/intelligence/verified/` ohne die Pipeline.** Kein
   Direktschreiben, kein "nur dieses eine Mal von Hand".
4. **`src/domain/**` ist rein.** Keine Dateizugriffe, kein Netzwerk, keine
   Kenntnis von `ingest`, `store` oder `cli`. `src/ingest/**` entscheidet und
   schreibt nicht. Erzwungen in `eslint.config.js`.
5. **Zod ist die einzige Wahrheit ueber die Datenform.** Typen werden mit
   `z.infer` abgeleitet, nie parallel geschrieben.
6. **Jedes Feld ist Pflicht, Unbekanntes ist `null`, unbekannte Felder werden
   abgelehnt** (`.strict()`).
7. **Determinismus in Domain und Pipeline.** Kein `Date.now()`, kein
   `Math.random()` — Zeitpunkte werden als Parameter hereingereicht. Sonst sind
   Import und Confidence nicht reproduzierbar pruefbar.
8. **Eine Phase zu Ende bringen.** Phase 1 ist Deutschland. Keine Europa-, Asset-
   oder News-Funktionen, solange Phase 1 nicht traegt. Schemas dafuer existieren
   bereits; sie werden nicht "schon mal befuellt".
9. **Vor jedem Commit `pnpm check` gruen.** Typecheck, Lint und Tests.

## Was ausserhalb dieses Verzeichnisses liegt, wird nicht angefasst

Die Wurzel des Repositories ist ein Fork von `obra/superpowers`;
`ai-battle-royale/` ist ein unabhaengiges Projekt. Beides bleibt unberuehrt
(`docs/decisions.md` #1). Die Wurzel-`CLAUDE.md` beschreibt Beitragsregeln fuer
Pull Requests an das Upstream-Projekt und gilt hier nicht.

## Entscheidungen dokumentieren

Eine Entscheidung mit langfristiger Wirkung kommt nach `docs/decisions.md` mit
DECISION / WHY / ALTERNATIVES / TRADEOFFS / REVERSIBLE. Ist sie schwer umkehrbar
und nicht zwingend noetig, wird die einfachere Variante genommen.

## Schutz vor Overengineering

Vor jeder neuen Bibliothek, Datenbank oder Schicht: Welches konkrete Problem
loest sie, haben wir dieses Problem schon, geht es mit dem vorhandenen Stack,
was kostet die Wartung, verbessert sie Phase 1? Bei geringem Nutzen: nicht
hinzufuegen.

## Kommandos

```bash
pnpm check       # typecheck + lint + test — das Gate vor jedem Commit
pnpm test        # nur Vitest
```
