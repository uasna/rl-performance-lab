# Fase 18.9 — Stats API normalizer + derived shots

Corrige la lectura live cuando Rocket League sí emite UpdateState, pero la UI no poblaba arena, jugadores, marcador ni shot telemetry.

## Cambios

- Normalizador flexible para mensajes Stats API.
- Soporte para claves PascalCase, camelCase y payloads anidados.
- Derivación de tiros desde cambios en contador `Shots`, `Goals` y `Saves` en `UpdateState`.
- Eventos con resumen de arena, marcador, cantidad de jugadores y claves detectadas.
- Shot telemetry puede subir aunque no llegue `BallHit`, usando candidatos derivados.

## Limitación

Los candidatos derivados no tienen posición/velocidad exacta; para pack 100% físico aún se necesita `BallHit`, `GoalScored` o `CrossbarHit` con ubicaciones.
