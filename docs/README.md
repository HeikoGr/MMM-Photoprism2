# MMM-Photoprism2 Documentation

Der Einstieg fuer Installation, Konfiguration und Nutzung liegt in [../README.md](../README.md). Dieses Verzeichnis enthaelt Zusatzdokumentation fuer Entwicklung und Infrastruktur.

## Inhalte

- [DEVCONTAINER.md](DEVCONTAINER.md): Devcontainer-Setup, Lifecycle und vorinstallierte Tools

## Architekturhinweise

- Das Frontend erzeugt pro Modulinstanz eine eigene `instanceId`.
- Der `node_helper` fuehrt Konfiguration, Tokens und Bildlisten getrennt pro Instanz.
- `suspend()` und `resume()` stoppen bzw. starten nur den Frontend-Timer; Bilddaten bleiben im Browser-Cache erhalten.