# Übergabe MMM-Photoprism2 (Stand 2026-09-22)

> Temporäre Übergabedatei für eine Claude-Session im Devcontainer. Nach dem Lesen löschen —
> sie gehört nicht ins Repo.

## Kontext

Dieses Modul ist eins von fünf im Workspace `~/MagicMirror`. Die Lagebeurteilung steht in
[`AUDIT_2026-09-21.md`](AUDIT_2026-09-21.md) (F1–F7, mit Datei:Zeile). Workspace-Ebene:
`../../MODULE-PLAN.md` (§0.3 priorisiert modulübergreifend) und `../../WORKSPACE-OVERVIEW.md`.
Der Lifecycle-Vertrag steht in `lib/mmm-shared/README.md` — `lib/mmm-shared` ist ein
Submodul, nicht hier ändern.

Als erstes Modul wurde `MMM-CalDAV-Tasks` abgearbeitet (F1–F8 behoben, Tests ergänzt). Die
Lehre daraus steht unten unter „Arbeitsweise" und ist wichtiger als sie klingt.

## Ausgangslage

`master` @ `fd7e29f`, v1.1.0. Nichts committet seit dem Audit, die Findings gelten also
unverändert. Tests am 2026-09-22 verifiziert: **11/11 grün** (`node --run test`, läuft Lint
gleich mit). `node_helper.js` 280 Zeilen, `MMM-Photoprism2.js` 323, eine fachliche
`lib/album-index.js`.

Lifecycle und die Trennung Index/Auswahl (Plan §5.3) sind sauber umgesetzt — daran nichts
ändern. Die offenen Punkte liegen woanders.

## Zu tun, in dieser Reihenfolge

**1 · F1 · Instanz-ID aus `Date.now()`** (`MMM-Photoprism2.js:1-3`, `:45`)

`createInstanceId()` liefert `photoprism_<Date.now().toString(36)>`. Der Core ruft `start()`
aller Module in einer synchronen Schleife auf — zwei Instanzen in `config.js` bekommen mit
hoher Wahrscheinlichkeit dieselbe ID und löschen sich im Helper (`node_helper.js:80-94`)
gegenseitig den Album-Index. Zusätzlich entsteht bei jedem Browser-Reload eine neue ID, der
alte Eintrag bleibt als Leiche in `instanceStates` (`:26`).

`this.identifier` ist vom Core eindeutig und über Reloads stabil; die anderen vier Module
nutzen es. Danach `docs/README.md:15-16` korrigieren — dort ist die eigene ID als
Architekturmerkmal beschrieben, das ist der Auslöser des Findings.

**2 · F3 · Album-Listing ohne Timeout** (`node_helper.js:221-226`)

`fetch()` ohne `AbortSignal.timeout`. Antwortet der Server nie, bleibt `refreshInFlight`
(`:193-203`) für immer offen, alle folgenden `NEXT_IMAGE` hängen sich daran, es kommt weder
`RESPONSE` noch `ERROR` — das Modul steht bis zum Helper-Neustart. Eine Zeile.
Richtwert 15–30 s (LibraryMonitor nimmt 30 s).

**3 · F4 · `innerHTML` mit API-Werten** (`MMM-Photoprism2.js:303`, `:310`, `:275`)

`photo.Title`, `photo.PlaceLabel` und der Fehlertext. `PlaceLabel` kommt aus
Reverse-Geocoding externer Dienste, ist also nicht nur Nutzereingabe. Drei Zeilen auf
`textContent`.

**4 · F2 · `cacheRetentionDays` entfernen** — die Entscheidung ist gefallen (Plan §7.3).
Die vollständige Abbauliste steht im Audit unter F2: `MMM-Photoprism2.js:22`,
`.gitignore:20-21`, der lokale leere Ordner `cache/`, drei Stellen in
`../../WORKSPACE-OVERVIEW.md` und vermutlich ein Eintrag im GitHub-Wiki (`wiki/` im Repo
wird per Workflow gesynct — dort mitprüfen).

**5 · F5 · Fehler verdrängt das letzte Bild** (`MMM-Photoprism2.js:273-277`) — bei gesetztem
`this.error` rendert `getDom()` nur den Fehlertext, obwohl `currentImage` noch da ist. Für
einen Bilderrahmen wäre „letztes Bild bleibt, Hinweis klein dazu" richtig; Vorbild ist
`createStaleNotice()` im LibraryMonitor.

**6 · F6 · Album-Listing auf 1000 Fotos gekappt** (`node_helper.js:210`) — der Kommentar
behauptet das Gegenteil. Entweder paginieren oder dokumentieren. Siehe offene Frage 2.

**7 · F7 · Kleinkram** — Logger wird bei jedem `log()`-Aufruf neu gebaut (`:51-67`),
`sharedContext` angelegt und nie gelesen, `FETCH_IMAGE` als tote Legacy-Action (`:75-76`),
`title: photo.Title || "Untitled"` macht den Info-Block immer sichtbar (`:171`),
`response.json()` außerhalb des `try` (`:260`) macht ein HTML-`200` zu
„Unexpected token '<'".

## Was du nicht allein entscheiden kannst

1. **Läuft das Modul irgendwo mit mehr als einer Instanz?** Entscheidet, ob F1 heute wirkt
   oder latent ist. Der Reload-Aspekt gilt unabhängig davon.
2. **Gibt es Alben mit mehr als 1000 Bildern?** Entscheidet F6: paginieren oder nur
   dokumentieren.

Frag nach, statt zu raten — beides ändert den Umfang.

## Werkzeuge im Devcontainer

- `node --run test` — 11 Tests plus Lint. `node --run lint:fix` formatiert.
- `node --run mmcheck` — MagicMirror-Kompatibilitätscheck. **Funktioniert nur in einem neu
  gebauten Devcontainer**: das Basis-Image hatte einen defekten Checker (Upstream hatte zwei
  Dateien entfernt), der Fix steckt erst in Images ab 2026-09-22.
- **Playwright MCP** — in `.mcp.json` konfiguriert (headless Chrome). Der Spiegel läuft im
  Container unter PM2 auf `http://localhost:8080`, das Modul ist also im Browser erreichbar.
  Nach einer Codeänderung `pm2 restart all`, Logs mit `pm2 logs --lines 200`. Damit lassen
  sich F1 (zwei Instanzen in `config/config.js` eintragen und die IDs im DOM vergleichen),
  F4 (`textContent` vs. `innerHTML` am gerenderten Titel) und F5 (Fehlerzustand) **real**
  prüfen statt nur im Unit-Test. Ohne erreichbaren PhotoPrism-Server siehst du den
  Fehler-/Loading-Pfad — für F3 und F5 genau der interessante.
- `config/config.js` entsteht beim Containerstart aus `config/config.template.js`, ist
  gitignored und wird in MagicMirrors Config gesymlinkt.

## Arbeitsweise

**Verifiziere die Befunde, bevor du sie fixst.** Beim CalDAV-Modul war die Diagnose des
Audits richtig im Ergebnis, aber falsch in der Ursache: der Audit nannte eine fehlende
Methode, tatsächlich wurde die Stelle nie erreicht, weil der ICS-Parser das CR von CRLF am
Komponentennamen stehen ließ und dadurch jede Eigenschaftssuche ins Leere lief. Wer nur die
genannte Methode ergänzt hätte, hätte nichts repariert. Die Zeilenangaben hier sind
belastbar, die Schlussfolgerungen prüfst du selbst nach.

Schreib Tests für das, was du änderst — die Suite ist klein und schnell, es gibt keinen Grund
es nicht zu tun. Für F1 reicht ein Test, dass zwei Instanzen verschiedene States bekommen.

## Konventionen

commitlint plus `scripts/check-commit-scope.js` prüfen die Commit-Message. `CHANGELOG.md`
nicht von Hand ändern — release-please generiert ihn aus den Commits. `wiki/` wird per
Workflow ins GitHub-Wiki gesynct. CI läuft Lint und Tests.
