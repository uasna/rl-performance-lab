# Phase 36 — Bulk Create Matches UI

Este parche aclara el flujo de Replay Intake para evitar la confusión entre `Procesar todo` y `Crear partida`.

## Cambios

- El botón masivo ahora dice `Procesar todo + crear partidas`.
- Se agrega un botón explícito `Crear partidas para todo` que usa el mismo flujo seguro.
- El feedback del lote ahora indica que está procesando replays y registrando partidas en Match History.
- Se agrega una nota visible explicando que el flujo masivo convierte `.replay`, genera JSON y registra partida cuando hay datos suficientes.

## Uso

1. Match History → Replay Intake.
2. Usar DemosEpic.
3. Escanear.
4. Procesar todo + crear partidas **o** Crear partidas para todo.
5. Revisar Match History.

## Seguridad

No toca archivos de Training ni packs `.Tem`. Solo lee replays y registra partidas locales.
