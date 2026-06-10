# Phase 41 — One-Shot Minimal Mutation

## Objetivo

Phase 40 confirmó que copiar byte-for-byte una plantilla `.Tem` manual produce un pack jugable en Rocket League (`0/15`), por lo que la ruta, selector e instalación ya están bien.

Phase 41 cambia solo un tiro:

1. Decodifica la plantilla `.Tem` con RocketRP.
2. Detecta el array de shots.
3. Modifica únicamente el slot 1.
4. Solo cambia el primer vector claro de posición de pelota y, si lo encuentra, el primer vector claro de posición de carro.
5. No reemplaza el array completo.
6. No toca contadores globales.
7. Serializa con RocketRP.
8. Relee con RocketRP y exige shots > 0.
9. Instala solo si pasa esa validación.
10. Si falla, cae al clon exacto jugable.

## Archivos de diagnóstico

En el draft RLA se guardan:

- `phase41-one-shot-plan.json`
- `phase41-one-shot-report.json`
- `rla-phase41-one-shot.rocketrp.json`
- `installed-phase41-one-shot-note.txt`

## Validación manual

Abrir Rocket League > Training > Custom > Created. El pack nuevo debe mostrarse con shots, idealmente `0/15`.

Si aparece `0/0`, usar **Rollback último RLA** y revisar `phase41-one-shot-report.json`.
