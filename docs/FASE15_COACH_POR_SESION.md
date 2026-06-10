# Fase 15 · Coach por sesión

Esta fase convierte los datos importados desde replays y partidas manuales en una rutina concreta para la sesión activa.

## Qué hace

- Analiza las últimas 5 a 10 partidas disponibles.
- Prioriza el foco del día con una matriz simple:
  1. Posicionamiento / rotación / movement.
  2. Boost.
  3. Defence / offence / mecánicas.
- Genera un plan de 90 minutos con bloques internos:
  - Freeplay.
  - Training interno del juego.
  - Replay review manual.
  - Casual con objetivo.
  - 1v1 con objetivo.
  - Ranked con objetivo.
  - Descanso corto.
- Define una regla para la siguiente partida.
- Define criterios de éxito medibles.
- Alimenta Training Lab con bloques generados desde la tendencia de la sesión.

## Qué evita

- No usa Workshop.
- No usa BakkesMod.
- No usa Steam Workshop.
- No usa mapas externos.
- No inventa boost ni movement fino si el parser no trae frames útiles.

## Archivos principales

```txt
src/lib/sessionCoach.ts
src/components/rocket-league/SessionCoachPanel.tsx
src/components/rocket-league/TrainingLab.tsx
src/App.tsx
```

## Siguiente fase

Fase 16: rediseño visual integral y limpieza de experiencia.
