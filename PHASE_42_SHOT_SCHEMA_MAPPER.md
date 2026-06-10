# Phase 42 — Shot Schema Mapper

## Objetivo
No volver a mutar tiros a ciegas. Phase 40 confirmó que clonar byte-for-byte la plantilla funciona en Rocket League. Phase 41 confirmó que el writer no encontró una ruta segura para modificar el tiro #1. Phase 42 genera un mapa de schema para encontrar las rutas reales de pelota/carro/velocidad dentro del JSON RocketRP.

## Qué cambia
- `Crear .Tem seguro` genera `phase42-shot-schema-map.json` dentro del draft RLA.
- El reporte enumera:
  - array de shots seleccionado
  - candidatos de vectores `x/y/z`
  - candidatos numéricos relevantes
  - diferencias entre shot #1 y shot #2
  - posibles rutas de ball/car/location/velocity/rotation
- No instala geometría agresiva.
- Si no hay ruta confirmada, conserva el clon seguro para evitar packs 0/0.

## Archivo clave
Buscar el reporte más reciente en:

`Documents/My Games/RLA/training_packs/**/phase42-shot-schema-map.json`

## Validación esperada
Rocket League debe seguir mostrando el pack como `0/15`, no `0/0`.

## Siguiente fase
Phase 43 usará la ruta de mayor confianza detectada por Phase 42 y mutará solo una ruta confirmada, no el shot completo.
