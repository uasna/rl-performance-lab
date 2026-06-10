# Fase 15.2 — Rank & MMR Sync

Esta fase agrega control de MMR y rango por playlist.

## Implementado

- `playlistRanks` en el store local para 1v1, 2v2 y 3v3.
- Panel `RankSyncPanel` conectado a Dashboard, Progress y Settings.
- Entrada manual de snapshot: rango, división, MMR, games to next rank, progreso, victorias, derrotas y racha.
- Historial `rankHistory` actualizado automáticamente al guardar snapshot.
- Modo principal del perfil actualiza la tarjeta principal del Dashboard.
- Botón experimental para escanear `Launch.log` desde Electron.
- Configuración para guardar URLs de Tracker Network o perfil Rocket League y abrirlas rápido.

## Limitación actual

La lectura automática online del MMR no se fuerza todavía para evitar depender de scraping frágil. El flujo estable es: consultar fuente externa, guardar snapshot y alimentar la app localmente.

## Futuro

- Conector online con endpoint estable si se define fuente confiable.
- Watcher continuo de `Launch.log`.
- Comparación automática antes/después de cada ranked.
- Alertas cuando falta poco para subir o bajar división.
