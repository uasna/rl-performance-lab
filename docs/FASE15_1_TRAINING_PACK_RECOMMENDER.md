# Fase 15.1 — Training Pack Recommender

Esta fase agrega una base local curada de Custom Training interno de Rocket League y un recomendador que conecta el foco del coach con códigos concretos.

## Incluye

- `src/data/trainingPacks.ts`: packs con código, creador, dificultad, áreas, tags y objetivo.
- `src/lib/trainingPackRecommender.ts`: scoring por área débil, error activo, rango y fuente.
- `TrainingPackRecommendations`: panel con códigos, botón de copiar y búsqueda online opcional.
- Integración en Dashboard y Training Lab.
- Bloques `training_pack` del coach ahora usan el código recomendado principal.

## Reglas

- Solo Custom Training interno.
- Sin Workshop.
- Sin BakkesMod.
- Sin Steam Workshop.
- Sin mapas externos.
- La app funciona offline con la base local.
- El botón de búsqueda online abre Prejump como complemento, no como dependencia obligatoria.
