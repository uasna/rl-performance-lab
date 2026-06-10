# Fase 16.8 — UI compacta + playback visual

## Cambios

- Compacta el layout global para reducir espacios muertos.
- Ajusta sidebar, topbar, cards, hero y paneles de análisis.
- Deja las tabs de Game Analysis centradas y sticky debajo de la topbar.
- Cambia Partidas para abrir en modo análisis por defecto, evitando el layout partido en dos columnas gigantes.
- Agrega playback visual en el field view: play/pause, barra de progreso y movimiento conceptual de jugadores.
- Agrega filtros visuales By me / My team / All en el field view.
- Aplica la compactación a Dashboard, Partidas, Game Analysis y páginas secundarias por CSS global.

## Nota

El playback no es replay real frame-by-frame. Es una visualización animada sobre el modelo táctico actual. Para reproducción real se necesita telemetría profunda de posiciones de pelota/carro por frame.
