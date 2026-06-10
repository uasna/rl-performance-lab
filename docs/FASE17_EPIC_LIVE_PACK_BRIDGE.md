# Fase 17 — Epic Live Hub + Training Pack Bridge

## Incluido

- Panel Live Data Hub en Ajustes.
- Preparación de DefaultStatsAPI.ini desde Electron.
- Conexión WebSocket local a `ws://127.0.0.1:49123`.
- Detección de identidad `PrimaryId` de Rocket League cuando llega `UpdateState`.
- Botón para guardar la cuenta detectada como cuenta vinculada.
- Métricas en vivo: evento, marcador, arena, tiempo, boost, speed, touches, shots, saves, goals y demos.
- Bridge de custom training packs: genera draft, shots.json, pack.rla.json y copia el paquete a `MyTraining` con Install directo.

## Límites actuales

La Stats API oficial entrega datos/eventos en vivo del partido, no MMR/rango. El MMR sigue usando snapshots manuales, Launch.log experimental u OCR futuro.

El bridge de training packs instala la carpeta/draft en Rocket League, pero el `.Tem` jugable real requiere un encoder binario y telemetría profunda de tiros: posición de pelota, posición de carro, velocidad y rotación.
