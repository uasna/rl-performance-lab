# Fase 21 — Safe Pack Writer

Objetivo: permitir instalación de `.Tem` solo si pasa una validación real. Esta fase evita volver a crear packs `ROOKIE 0/0`.

## Contrato del writer

1. Decodificar una plantilla `.Tem` real con RocketRP.
2. Modificar solo campos confirmados y seguros: nombre, descripción, tags/categoría.
3. No tocar todavía arrays de shots, IDs, GUIDs ni física.
4. Serializar JSON a `.Tem` con RocketRP.
5. Releer el `.Tem` generado con RocketRP.
6. Si `shots === 0`, bloquear y guardar debug.
7. Si `shots > 0`, copiar a `Training\\0000000000000000\\MyTraining` y guardar manifest RLA.

## Limitación intencional

Esta fase todavía conserva la geometría de tiros de la plantilla. Los candidatos live/replay quedan guardados en `pack.rla.json`, `shots.json` y el manifest para la siguiente fase: reemplazar shots usando posiciones/velocidades reales.

## Archivos de debug por draft

- `template-decoded.rocketrp.json`
- `rla-patched.rocketrp.json`
- `safe-writer-confirmed-fields.json`
- `serialize-command.json` o `serialize-errors.json`
- `template-probe-results.json`
- `installed-safe-pack-note.txt` si se instaló correctamente
