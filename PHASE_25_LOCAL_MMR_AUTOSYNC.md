# Phase 25 — Local MMR Auto-Sync, no TRN API

Este parche elimina la dependencia visible de `TRN API Key` y deja el flujo automático basado en fuentes locales.

## Flujo nuevo

Al abrir la app:

1. Si hay Epic username y `Auto-sync MMR local` está ON, la app intenta guardar un snapshot local usando el último MMR confirmado.
2. Si `Auto-parse replays` estaba ON o el watcher estaba activo, se reactiva automáticamente.

Cuando `ReplayConnector` detecta un `.replay` nuevo:

1. Lo analiza con Rattletrap/rrrocket mediante `analyzeReplayPreview`.
2. Crea la partida en historial con `registerMatch`.
3. Actualiza `rankHistory` con el último snapshot local confirmado cuando existe.
4. Muestra toast: `Partida registrada · MMR local: XXXX`.

## Ajustes simplificados

La pantalla principal de Ajustes ahora solo pide:

- Epic username
- Toggle `Auto-sync MMR local`
- Toggle `Auto-parse replays`
- Botón `Sincronizar MMR local ahora`
- Botón `Guardar automatización`

El MMR se confirma desde `Avanzado / mantenimiento → MMR OCR local`.

## Importante

- No usa `https://api.tracker.gg/...`.
- No pide `TRN-Api-Key`.
- No modifica `hooks/`, `lib/` ni `types/`.
- Se mantiene el archivo interno `trackerNetworkAutoSync.ts` como capa de compatibilidad para no romper imports previos, pero ya no hace llamadas de red.
