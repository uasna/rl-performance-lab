# Fase 16.9 — UI compacta global y playback controlado

Esta fase corrige el tamaño exagerado de las tarjetas y aplica la densidad compacta a toda la UI.

## Cambios

- Tabs de Game Analysis centradas, sticky y siempre arriba del contenido.
- Switch Match History / Game Analysis flotante para no empujar la interfaz hacia abajo.
- Playback visual funcional: el botón play anima jugadores, pelota, progreso y tiempo.
- El playback usa eventos reales del replay importado cuando existen; si no hay posiciones por frame, interpola visualmente sin inventar métricas nuevas.
- Se compactaron cards, paneles, tablas, inputs, spacing, gráficas y field views globalmente.

## Límite técnico

El video real frame-by-frame requiere telemetría profunda de posiciones de carro/pelota/boost. El JSON actual de Rattletrap usado por la app trae datos confiables de header, marcador, jugadores y eventos de gol, pero no todos los frames útiles para reproducir el partido completo.
