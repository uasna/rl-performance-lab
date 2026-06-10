# Fase 14 · Motor de diagnóstico inicial

Esta fase conecta las partidas importadas desde replay con el diagnóstico competitivo de la app.

## Incluye

- Diagnóstico por partida desde stats reales de `PlayerStats`.
- Scores iniciales por área cuando hay señal confiable:
  - Offence
  - Defence
  - Rotation
  - Positioning
- Actualización automática de `Skill Areas` al registrar/importar partida.
- Actualización automática de `Error Tracker` cuando se detecta un patrón real.
- Progreso diario generado desde partidas importadas.
- Panel de diagnóstico inicial en Dashboard.
- Evita inventar datos de movement/boost si el parser no entregó telemetría de frames.

## Reglas iniciales

- Derrota con muchos goles concedidos: Defence / Bad challenge.
- Muchos tiros sin gol: Offence / Missed open net.
- Derrota con goles en contra y sin saves: Positioning / Poor shadow defence.
- Victoria con arco en cero: no fuerza error, se usa como replay positivo.

## Próxima fase

Fase 15: Coach por sesión y rutina recomendada dinámica con base en las últimas 5-10 partidas.
