# Fase 12.2 — Mapeo real del JSON de Rattletrap

Esta fase deja de buscar datos por coincidencias genéricas y lee directamente la estructura real del JSON generado por Rattletrap.

## Estructura soportada

El extractor ahora lee:

```txt
header.body.properties.elements
```

Desde ahí extrae:

- `PlayerStats`
- `Goals`
- `Team0Score`
- `Team1Score` cuando exista
- `TeamSize`
- `MapName`
- `MatchType`
- `ReplayName`
- `Date`
- `TotalSecondsPlayed`
- `RecordFPS`

## Resultado esperado con el JSON de prueba

Para el replay `D570A36611F16205C2049AA5025A91F2` debe detectar:

- Mapa: `Underwater_P`
- Modo: `Online · 2v2`
- Duración: ~176 segundos
- Marcador: Blue 4 - Orange 0
- Jugadores: 4
- Goles: 4
- Tiros: 9
- Saves: 4
- Asistencias: 2
- Eventos: 4 goles

## Limitación actual

Todavía no se extrae telemetría fina de frames porque este JSON compacto tiene `content.body.frames` vacío. El siguiente paso es crear partidas automáticas desde estos datos de header y, después, estudiar un JSON completo/parcial más rico si el parser lo permite.
