# Fase 18.5 - .Tem no vacío + Stats API monitor

Esta fase corrige dos problemas:

1. RocketRP podía generar un pack visible pero sin tiros. Ahora la app valida tamaño y re-decodifica el .Tem generado cuando puede. Si detecta 0/0, no instala.
2. Live Stats API podía quedar en OFFLINE si el WebSocket todavía no estaba abierto. Ahora el conector queda en modo espera y reintenta automáticamente mientras Rocket League está abriendo partida/freeplay.

La generación real de tiros nuevos sigue dependiendo de telemetría de shots suficiente. Esta fase conserva los tiros de la plantilla para evitar packs vacíos.
