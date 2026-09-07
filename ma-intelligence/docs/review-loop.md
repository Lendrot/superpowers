# Review-Loop

Der kontrollierte Ablauf

```
Claude Code → Pull Request → CI → externer AI-Reviewer → strukturierte Findings
           → Pruefung durch den Fix-Agenten → Fix → CI → naechste Runde
           → nach spaetestens 3 Runden: Mensch
```

Diese Datei beschreibt, was davon **wirklich laeuft**, was **simuliert** ist und
was **noch nicht angebunden** ist. Die Unterscheidung ist der Zweck des
Dokuments — eine simulierte Integration darf nie wie eine echte aussehen.

## Statusuebersicht

| Baustein | Status | Wo |
| --- | --- | --- |
| CI-Gate fuer Pull Requests (Install, Typecheck, Lint, Tests) | **IMPLEMENTED** | `.github/workflows/ma-intelligence-ci.yml` |
| Findings-Format inkl. Validierung | **IMPLEMENTED** | `src/review/findings.ts` |
| Review Contract (Ein- und Ausgabe) | **IMPLEMENTED** | `src/review/request.ts` |
| Fix Contract (Urteile, Vollstaendigkeitspruefung) | **IMPLEMENTED** | `src/review/verdicts.ts` |
| Loop-Schutz (`MAX_REVIEW_ROUNDS = 3`) und Eskalation | **IMPLEMENTED** | `src/review/loop.ts` |
| Audit Trail (Datenmodell + Markdown) | **IMPLEMENTED** | `src/review/rounds.ts`, `src/review/audit.ts` |
| Provider-Schnittstelle, anbieterneutral | **IMPLEMENTED** | `src/review/provider.ts` |
| Kommandozeile (`validate`, `next`, `audit`) | **IMPLEMENTED** | `src/cli/review.ts` |
| Mock-Reviewer | **MOCKED** — antwortet aus einer Liste, kein Modell | `src/review/mock-provider.ts` |
| GPT als Reviewer | **NOT YET CONNECTED** — kein Adapter, keine Zugangsdaten | — |
| Claude als Reviewer | **NOT YET CONNECTED** | — |
| Automatischer Anstoss des Loops aus GitHub heraus | **NOT YET CONNECTED** — der Loop wird von Hand bzw. aus einer Session gefahren | — |
| Datenvalidierung als CI-Schritt | **NOT YET CONNECTED** — es gibt noch keinen Store, der zu pruefende Daten haelt | — |

**Kein Reviewer ist angebunden.** Es existieren keine Zugangsdaten, und es
wurden keine erzeugt. Jedes Review, das heute entsteht, traegt
`provider_status: "mock"` und wird im Audit als solches ausgewiesen.

## Sicherheitsregeln, die im Code stehen

Nicht als Vorsatz, sondern als Mechanik:

| Regel | Umsetzung |
| --- | --- |
| Nie direkt auf `main` | Der Loop kennt keine Aktion, die schreibt oder zusammenfuehrt. Sein bester Ausgang heisst `READY_FOR_HUMAN_MERGE`. |
| Nie automatisch mergen | ebenda; `tests/unit/review-loop.test.ts` prueft, dass kein Zustand ein Merge ergibt. |
| Tests nicht abschalten | `detectTestWeakening` bricht ab, wenn uebersprungene Tests steigen oder die Testzahl sinkt. |
| Hoechstens 3 Runden | `MAX_REVIEW_ROUNDS`, danach `HUMAN_REVIEW_REQUIRED`. |
| Findings nicht blind umsetzen | Jedes Finding braucht ein Urteil mit Begruendung; fehlende Urteile eskalieren. |
| Abgelehnte Findings verschwinden nicht | Sie stehen mit Begruendung im Audit Trail. |
| Reviewer braucht keine Schreibrechte | Der Provider-Vertrag kennt nur `review(request) → Text`. Der CI-Workflow laeuft mit `permissions: contents: read`. |
| Keine Secrets im Repository | Ein nicht angebundener Provider wirft mit der Liste dessen, was fehlt — er erzeugt nichts. |

## Ablauf einer Runde

1. **Review anfordern.** `requestReview(provider, request, now)` liefert einen
   Audit-Eintrag. Ein Provider ohne Anbindung wirft und stoppt den Vorgang; eine
   unbrauchbare Antwort wird protokolliert und einmal wiederholt.
2. **Findings pruefen.** `decideNextAction` liefert `APPLY_FIXES` mit zwei
   Listen: umsetzbar und `needs_human_triage` (Confidence unter 0,5).
3. **Urteilen.** Fuer jedes Finding `ACCEPTED` oder `REJECTED`, jeweils mit
   Begruendung. Angenommen ohne Codeaenderung und abgelehnt mit Codeaenderung
   sind beides Schemafehler.
4. **Testen.** Vollstaendige Suite, Ergebnis in den Fix-Datensatz. Tests werden
   repariert, nicht stillgelegt.
5. **Naechste Handlung erfragen.** Wieder `decideNextAction`. Irgendwann kommt
   `HUMAN_REVIEW_REQUIRED` oder `READY_FOR_HUMAN_MERGE`.

## Eskalationsgruende

| Grund | Bedeutung |
| --- | --- |
| `max_review_rounds_reached` | Drei Runden sind durch. |
| `reviewer_response_unusable` | Der Reviewer hat zweimal nichts Verwertbares geliefert. |
| `high_severity_finding_rejected` | Ein CRITICAL- oder HIGH-Finding wurde abgelehnt. Das bestaetigt ein Mensch. |
| `test_weakening` | Eine Fix-Runde hat Tests uebersprungen oder entfernt. |
| `verdicts_incomplete` | Ein Finding hat kein, ein doppeltes oder ein erfundenes Urteil. |

## Kommandos

```bash
pnpm review validate <antwort.json>              # Reviewer-Antwort pruefen (Exit 1 bei ungueltig)
pnpm review next <audit.json> --ci passing       # naechste zulaessige Handlung (Exit 2 bei HUMAN_REVIEW_REQUIRED)
pnpm review audit <audit.json> --ci passing      # Audit als Markdown
```

Beispieldateien: `review-log/examples/`.

## Was fuer eine echte GPT-Anbindung fehlt

1. Ein Adapter `src/review/providers/openai.ts`, der `ReviewProvider`
   implementiert: Anfrage plus `REVIEWER_INSTRUCTIONS` an das Modell, Antwort
   als Text zurueck, `status: 'connected'`.
2. Ein Zugangsschluessel als GitHub-Secret bzw. Umgebungsvariable. Er wird nicht
   im Repository abgelegt und nicht von hier aus erzeugt.
3. Eine Entscheidung, wo der Loop laeuft: in einer Claude-Code-Sitzung (heute
   moeglich) oder als GitHub-Action (dann braucht der Workflow ein Secret und
   eine Begruendung, warum ein externer Dienst den Diff sehen darf).
4. Ein Wiederholungs- und Zeitlimit fuer den Netzaufruf — der Loop behandelt
   einen Fehler bereits als "unbrauchbare Antwort", aber der Adapter sollte
   nicht unbegrenzt warten.

Bis das entschieden ist, bleibt der Mock der einzige Reviewer, und jeder Report
sagt das dazu.
