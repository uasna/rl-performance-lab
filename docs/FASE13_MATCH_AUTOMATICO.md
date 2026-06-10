# Fase 13 · Crear partida automática desde replay

Esta fase conecta el extractor real de Rattletrap con el modelo interno de la app.

## Implementado

- Convierte `ReplayAnalysisPreview` en `RocketLeagueMatch`.
- Crea partidas en el historial desde la vista Replays.
- Evita duplicados usando `replayId`, `replayJsonPath` e `id` estable.
- Detecta jugador principal usando coincidencia con perfil, plataforma Epic o mejor jugador Blue.
- Calcula resultado según equipo detectado.
- Mapea jugadores a Blue/Orange.
- Mapea goles del header a eventos `goal_for` / `goal_against`.
- Pasa la partida generada a Dashboard, Match History y Game Analysis.

## Límites actuales

- MMR queda igual porque el replay no trae MMR confiable.
- Boost, velocidad y posicionamiento profundo siguen en 0 hasta extraer frames/network data.
- El tipo exacto Ranked/Casual no se puede confirmar solo con `MatchType: Online`; se registra como `Replay Review`.

## Siguiente fase sugerida

Fase 14: motor de diagnóstico inicial desde partidas importadas.
