# Fase 12.1 — Extractor honesto

Esta fase corrige falsos positivos del extractor básico.

## Problema detectado

El JSON de Rattletrap contiene muchos actores internos del motor de Rocket League, por ejemplo `Car_TA`, `Ball_TA` y `GoalVolume_TA`. La fase anterior podía contarlos como jugadores o eventos aunque no fueran datos reales del marcador.

## Corrección

- Filtrado de actores internos.
- Jugadores solo si aparecen en contexto de player/stat/reservation.
- Eventos solo si hay contexto confiable de evento o estadística.
- Notas claras cuando un dato no se detecta.
- Se prioriza no mostrar datos inventados sobre llenar tarjetas con ruido.

## Estado

El extractor sigue siendo parcial. Para KPIs completos hace falta mapear mejor la estructura real del JSON convertido de Rattletrap o usar un parser alternativo más completo.
