# Fase 18.10 — Live clean + training candidates

Esta fase corrige dos problemas observados al conectar Stats API:

- La lista visual se llenaba con `UpdateState` y hacía ruido.
- Rocket League sí enviaba datos live, pero no siempre enviaba eventos `BallHit`; por eso el contador de `Shot telemetry` podía quedarse en 0 aunque hubiera boost, touches, marcador y arena.

## Cambios

- `UpdateState` ya no se muestra como tarjeta repetida.
- Solo se muestran eventos significativos: BallHit, GoalScored, CrossbarHit, StatfeedEvent o candidatos creados.
- Si `Shots`, `Goals` o `Saves` suben, se guarda un candidato de entrenamiento.
- Si no llegan tiros explícitos, se crea una ventana de entrenamiento cada 4 touches nuevos como fallback de baja confianza.
- El texto de Shot telemetry ahora aclara que puede guardar tiros, goles o ventanas de toque.

## Importante

Los candidatos de touch no tienen física exacta. Sirven para que el generador tenga material cuando Stats API no emite `BallHit`. Para recreación precisa de tiros se sigue necesitando `BallHit`/GoalScored con ubicación y velocidad.
