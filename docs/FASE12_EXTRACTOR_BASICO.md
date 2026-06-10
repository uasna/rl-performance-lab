# Fase 12 · Extractor básico de JSON

Esta fase toma el JSON producido por Rattletrap o rrrocket y ejecuta una primera extracción local segura.

## Extrae

- Metadata del replay.
- Claves raíz del JSON.
- Mapa, playlist/modo y duración si existen en el JSON.
- Jugadores candidatos.
- Marcador Blue vs Orange si está disponible o si puede inferirse desde jugadores.
- Eventos candidatos: goal, save, shot, assist, demo, miss, kickoff y touch.

## Importante

El extractor es defensivo porque los formatos de JSON de replays pueden variar entre Rattletrap, rrrocket/boxcars y parches de Rocket League. Esta fase no pretende ser el motor competitivo final. Su objetivo es confirmar qué estructura real está entregando el parser y preparar la Fase 13.

## Siguiente fase

Fase 13 convertirá la extracción en partidas reales dentro del historial:

- Match History.
- Game Analysis.
- Dashboard.
- Progress.
- Error Tracker.
