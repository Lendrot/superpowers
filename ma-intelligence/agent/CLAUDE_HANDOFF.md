# Einstieg fuer die naechste Claude-Sitzung

## In dieser Reihenfolge lesen

1. `CURRENT_STATE.md` — Stand, Luecken, naechster Schritt.
2. `../CLAUDE.md` — die neun Arbeitsregeln fuer dieses Teilprojekt.
3. `../docs/decisions.md` — warum es so gebaut ist. Vor jedem Umbauvorschlag.
4. `../docs/data-schema.md` — nur wenn Datenfelder betroffen sind.
5. `../docs/review-loop.md` — wenn ein Review, ein Finding oder ein Fix ansteht.
   Dort steht auch, was echt laeuft und was Mock ist.

Das Repository muss nicht erneut analysiert werden; das Ergebnis steht in
`../docs/analysis.md`.

## Bevor etwas geaendert wird

```bash
cd ma-intelligence && pnpm install && pnpm check
```

`pnpm check` muss vor der ersten Aenderung gruen sein. Ist es das nicht, ist das
der erste Befund und nicht die Aufgabe von nebenbei.

## Wo was hingehoert

| Aufgabe | Ort |
| --- | --- |
| Neues Feld oder neue Entitaet | `src/domain/entities.ts` + Test + `docs/data-schema.md` |
| Neuer erlaubter Wert | `src/domain/vocabulary.ts` (anhaengen, nie umbenennen) |
| Regel, die das Schema nicht ausdrueckt | `src/ingest/` — nicht ins Schema pressen |
| Etwas, das Dateien liest oder schreibt | `src/store/` — niemals `domain` oder `ingest` |
| Entscheidung mit langer Wirkung | `docs/decisions.md`, Format aus der Datei |
| Regel des Review-Loops | `src/review/` + Test; Konstanten in `src/review/contract.ts` |
| Anbindung eines echten Reviewers | neuer Adapter in `src/review/providers/`, Vertrag aus `src/review/provider.ts` |

## Wenn ein AI-Review zu einem Pull Request vorliegt

1. Antwort pruefen: `pnpm review validate <antwort.json>`. Unbrauchbar heisst
   unbrauchbar — kein Herauslesen einzelner Findings aus kaputtem JSON.
2. Jedes Finding gegen Code, Tests und Architekturdokumentation halten und
   `ACCEPTED` oder `REJECTED` mit Begruendung festhalten. Kein Finding bleibt
   ohne Urteil, auch kein falsches.
3. Nur akzeptierte Findings umsetzen, Tests ergaenzen, volle Suite laufen lassen.
4. Runde in den Audit Trail schreiben und `pnpm review next <audit.json>` fragen,
   was als Naechstes zulaessig ist.
5. Bei `HUMAN_REVIEW_REQUIRED` ist Schluss. Keine vierte Runde, kein
   Zusammenfuehren, keine Umgehung.

## Fallen

- **Die Wurzel-`CLAUDE.md` gilt hier nicht.** Sie beschreibt Beitragsregeln fuer
  Pull Requests an `obra/superpowers`. Fuer dieses Verzeichnis gilt
  `ma-intelligence/CLAUDE.md`.
- **Kein Wert im Vokabular wird umbenannt.** Anhaengen ist billig, umbenennen
  macht bestehende Datensaetze ungueltig.
- **Keine IDs nachtraeglich aendern.** Eine korrigierte Firmierung aendert
  `display_name`, nicht die ID — sonst brechen alle Verweise.
- **`ai-battle-royale/` und die Wurzel bleiben unberuehrt.** Einzige Ausnahme
  ist der CI-Workflow (`docs/decisions.md` #7).
- **Tests werden nie stillgelegt, um einen Build gruen zu bekommen.** Der Loop
  erkennt es und eskaliert; unabhaengig davon ist es die Regel.
- **Kein Reviewer ist angebunden.** Nichts simulieren, keine Zugangsdaten
  erzeugen, keinen Mock als echtes Review ausgeben.

## Nach getaner Arbeit

`CURRENT_STATE.md` aktualisieren: was umgesetzt wurde, welche Dateien
betroffen sind, welche Luecken offen sind, was der naechste Schritt ist. Das ist
kein Protokoll der Sitzung, sondern der Stand danach.
