# Fase 18.7 — Stats API hosts + packs sin 0/0

## Cambios

- La conexión live ahora prueba varios hosts locales: 127.0.0.1, localhost e ::1.
- El botón Probar puerto usa handshake WebSocket real, no solo TCP, para no dar falsos positivos.
- El monitor live queda esperando y reintenta sin apagarse al primer fallo.
- El instalador de training packs ahora elige una plantilla .Tem con tiros confirmados por RocketRP cuando está disponible.
- Si RocketRP no confirma tiros, usa la plantilla más grande como fallback, evitando plantillas vacías 0/0.
- Se guardan archivos de debug para revisar qué plantilla se usó y cuántos tiros detectó.

## Limitación

La app todavía no recrea físicamente tiros personalizados si Stats API no entrega live telemetry. Sin BallHit/GoalScored/CrossbarHit reales solo puede instalar packs con tiros de plantilla o recomendar códigos.
