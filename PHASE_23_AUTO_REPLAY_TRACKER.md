# Phase 23 — Auto Replay + Tracker Network Pipeline

Este parche implementa el flujo automático de RL Performance Lab:

1. Al abrir la app, AppShell dispara la automatización de arranque.
2. Si hay Epic username + TRN API Key + Auto-sync activado, sincroniza Tracker Network en background.
3. Si Auto-parse está activo o el watcher quedó activo antes, se re-activa el watcher al abrir.
4. Cuando Electron emite `listenReplayFileDetected`, la app:
   - analiza el `.replay` con el parser local (`analyzeReplayPreview`, Rattletrap/rrrocket según disponibilidad),
   - crea la partida con `buildMatchFromReplayAnalysis`,
   - registra la partida con `actions.registerMatch`,
   - sincroniza Tracker Network,
   - guarda ranks usando `actions.updatePlaylistRank`, que ya agrega snapshots a `rankHistory`,
   - muestra toast: `Partida registrada · MMR actualizado: XXXX`.

## Configuración una sola vez

Ir a Ajustes → Automatización total:

- Epic username
- TRN API Key
- Toggle Auto-sync activado
- Toggle Auto-parsear replays nuevos
- Botón Conectar cuenta

## Archivos tocados

- `src/App.tsx`
- `src/components/layout/AppShell.tsx`
- `src/components/rocket-league/ReplayConnector.tsx`
- `src/components/rocket-league/SettingsHub.tsx`
- `src/components/rocket-league/trackerNetworkAutoSync.ts` nuevo

## No tocado

No se modificaron carpetas `hooks/`, `lib/` ni `types/` existentes.
