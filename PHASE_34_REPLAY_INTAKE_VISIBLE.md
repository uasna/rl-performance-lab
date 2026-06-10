# Phase 34 — Replay Intake visible inside Match History

## Problema
El parche de DemosEpic agregó `Usar DemosEpic`, `Buscar todo` y `Escanear` dentro de `ReplayConnector`, pero la UI principal dejaba ese panel escondido detrás de la vista interna `replays`.

En la práctica, al entrar a `Match History`, solo se veían los tabs `Match History` y `Game Analysis`, así que no había forma obvia de llegar a los controles de importación.

## Cambio
`src/App.tsx` ahora agrega un tercer tab dentro de Match History:

- Match History
- Replay Intake
- Game Analysis

Al abrir `Replay Intake` se renderiza directamente `ReplayConnector`, con los botones:

- Escanear
- Usar DemosEpic
- Buscar todo
- Activar watcher
- Procesar replay
- Crear partida

## Flujo nuevo
1. Abrir `Match History`.
2. Tocar `Replay Intake`.
3. Tocar `Usar DemosEpic`.
4. Tocar `Escanear` o `Buscar todo`.
5. Procesar replay.
6. Crear partida.

## Archivos tocados
- `src/App.tsx`

No toca `hooks/`, `lib/` ni `types/`.
