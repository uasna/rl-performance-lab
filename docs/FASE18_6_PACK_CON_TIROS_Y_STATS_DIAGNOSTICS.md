# Fase 18.6 — Pack con tiros garantizado + diagnóstico Stats API

## Cambios

- El instalador ya no instala packs 0/0.
- Si RocketRP no puede serializar un .Tem nuevo con tiros, la app usa modo seguro: instala una plantilla .Tem real con tiros para que Rocket League no muestre 0/0.
- La app busca plantillas no solo en MyTraining, también en Downloaded, Favorites y Favorities dentro de la estructura real de Rocket League.
- El destino final sigue siendo `Training/0000000000000000/MyTraining`.
- Mensajes de Stats API actualizados: Custom Training y Training Browser normalmente no abren el WebSocket. Para probar live, usar partida real, exhibición, privada u online.

## Limitación real

El modo seguro conserva tiros de una plantilla real. No recrea todavía la geometría exacta de cada fallo personal. Para eso hacen falta live shots con Location, speed, player/team y un parche de shots específico sobre el JSON de RocketRP.

