# Phase 22A — RL Analyser UI/UX Redesign

Aplicar copiando el contenido de este ZIP encima de `C:\Projects\rl-performance-lab-electron-phase`.

## Cambios incluidos

- Sidebar estilo RL Analyser: Dashboard, Match History y Analysis con Overview / Movement / Boost / Offence / Defence / Rotation / Positioning.
- TopBar con pills globales 1v1 / 2v2 / 3v3 / ALL / Ranked.
- Dashboard reestructurado en 3 zonas: izquierda rank/snapshot, centro MMR/heatmap/pillars, derecha recent games.
- Donut Win Rate en SVG puro.
- Recent games compactos con estado `Save the replay to analyse this game` si no hay replay conectado.
- Overview/Habilidades conectado al sidebar: cada item abre su pilar directamente.
- Game Analysis reordenado: tabla de jugadores arriba, best performers por pilar, timeline después.
- Movement tab con ranking, tabla granular y heatmaps Blue/Orange.
- Vistas de pilares con Custom Training Pack, View Shot expandible, Open Folder / Install to Game conectados al bridge existente.
- Rotation mantiene replay isométrico con controles.

## Comandos locales

```powershell
cd C:\Projects\rl-performance-lab-electron-phase
npm install
npm run electron:dev
```
