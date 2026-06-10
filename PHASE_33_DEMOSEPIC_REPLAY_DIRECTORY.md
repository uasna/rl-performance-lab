# Phase 33 — DemosEpic Replay Directory Fix

## Problema
Epic + OneDrive guarda las repeticiones de Rocket League en:

`C:\Users\hecto\OneDrive\Documents\My Games\Rocket League\TAGame\DemosEpic`

La app podía quedarse con una ruta antigua (`Demos`) guardada en config local, y por eso no mostraba replays aunque existieran en disco.

## Cambios
- `DemosEpic` ahora tiene prioridad absoluta cuando existe y contiene `.replay`.
- Si la config local apuntaba a `Demos`, la app migra automáticamente a `DemosEpic`.
- ReplayConnector agrega botones:
  - `Usar DemosEpic`
  - `Buscar todo`
- El backend puede escanear todas las rutas locales conocidas: OneDrive `DemosEpic`, Documents `DemosEpic`, OneDrive `Demos`, Documents `Demos`.
- El watcher usa la ruta activa correcta y conserva `DemosEpic` en `desktop-config.json`.

## Flujo recomendado
1. Abrir app.
2. Ir a Match History / Replay Intake.
3. Apretar `Usar DemosEpic`.
4. Apretar `Escanear` o `Buscar todo`.
5. Procesar/importar replays.
6. Activar watcher.

No toca packs, Training ni archivos `.Tem`.
