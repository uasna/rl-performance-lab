# Fase 14.1 — Reconciliación del diagnóstico

Esta fase corrige inconsistencias después de importar partidas desde replays.

## Problemas corregidos

- Partidas importadas antes de Fase 14 no actualizaban Skill Areas automáticamente.
- Progress podía mostrar win rate semanal sin reflejar correctamente el conteo semanal.
- Error Tracker contaba los 12 patrones del catálogo como “activos”, aunque tuvieran frecuencia 0.
- El diagnóstico ahora se recalcula al abrir la app si existen partidas importadas y el estado derivado está desactualizado.

## Regla importante

Movement y Boost siguen en 0 si el JSON no trae telemetría fina de frames/boost. No se inventan esos datos.
