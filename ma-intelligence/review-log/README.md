# review-log

Der Audit Trail des Review-Loops: pro Pull Request eine JSON-Datei mit allen
Runden, dazu die daraus erzeugte Markdown-Fassung.

```
review-log/
  examples/         Beispieldateien fuer Format und Kommandos
  pr-<nummer>.json  Audit Trail eines PR  (Datenmodell: src/review/rounds.ts)
  pr-<nummer>.md    daraus erzeugt:  pnpm review audit pr-<nummer>.json --out pr-<nummer>.md
```

Der Trail haelt **beides** fest: angenommene und abgelehnte Findings, jeweils mit
Begruendung, dazu Testergebnis und verbleibende Risiken. Ein Finding, das
irgendwo verschwindet, waere der Weg, auf dem ein Review wirkungslos wird.

Die Dateien unter `examples/` stammen aus einem Mock-Reviewer. Sie zeigen das
Format und sind keine echten Befunde.
