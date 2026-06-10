# Phase 35 — Bulk Replay Processing

## Objetivo
Evitar que el usuario tenga que procesar cada `.replay` de forma manual.

## Cambios
- Agrega botón **Procesar todo** en Replay Intake.
- Procesa secuencialmente todos los `.replay` detectados y no registrados.
- Convierte cada replay con el pipeline local existente.
- Crea la partida automáticamente cuando el extractor devuelve datos suficientes.
- Omite replays ya registradas por `replayId`, ruta, nombre o JSON path.
- Muestra barra de progreso del lote:
  - Procesadas
  - Creadas
  - Omitidas
  - Errores
  - Replay actual
- Mantiene al usuario dentro de Replay Intake durante el lote, en vez de saltar a Game Analysis después de la primera partida.
- Conserva el tab visible **Replay Intake** entre Match History y Game Analysis.

## Flujo recomendado
1. Match History → Replay Intake.
2. Usar DemosEpic.
3. Escanear.
4. Procesar todo.
5. Ir a Custom Training Pack Core.
6. Generar seed.

## Notas de seguridad
Este parche no toca packs `.Tem`, `Training`, `MyTraining`, `Favorites` ni `Downloaded`.
Solo lee `.replay`, genera JSON procesado y registra partidas en el store local de la app.
