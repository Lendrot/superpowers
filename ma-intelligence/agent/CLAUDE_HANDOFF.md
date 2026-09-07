# Einstieg fuer die naechste Claude-Sitzung

## In dieser Reihenfolge lesen

1. `CURRENT_STATE.md` — Stand, Luecken, naechster Schritt.
2. `../CLAUDE.md` — die neun Arbeitsregeln fuer dieses Teilprojekt.
3. `../docs/decisions.md` — warum es so gebaut ist. Vor jedem Umbauvorschlag.
4. `../docs/data-schema.md` — nur wenn Datenfelder betroffen sind.

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

## Fallen

- **Die Wurzel-`CLAUDE.md` gilt hier nicht.** Sie beschreibt Beitragsregeln fuer
  Pull Requests an `obra/superpowers`. Fuer dieses Verzeichnis gilt
  `ma-intelligence/CLAUDE.md`.
- **Kein Wert im Vokabular wird umbenannt.** Anhaengen ist billig, umbenennen
  macht bestehende Datensaetze ungueltig.
- **Keine IDs nachtraeglich aendern.** Eine korrigierte Firmierung aendert
  `display_name`, nicht die ID — sonst brechen alle Verweise.
- **`ai-battle-royale/` und die Wurzel bleiben unberuehrt.**

## Nach getaner Arbeit

`CURRENT_STATE.md` aktualisieren: was umgesetzt wurde, welche Dateien
betroffen sind, welche Luecken offen sind, was der naechste Schritt ist. Das ist
kein Protokoll der Sitzung, sondern der Stand danach.
