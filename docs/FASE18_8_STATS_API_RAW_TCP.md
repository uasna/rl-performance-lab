# Fase 18.8 — Stats API raw TCP root fix

Raíz encontrada: la app estaba intentando consumir la Stats API desde el renderer con `new WebSocket(...)` y además el botón de prueba hacía handshake WebSocket. En esta instalación Rocket League expone el feed como socket local TCP que emite JSON, por eso el handshake WebSocket se cerraba aunque el `.ini` estuviera bien.

Cambios:
- Nuevo cliente TCP en Electron main process usando `net.createConnection`.
- Parser de stream JSON con extracción por llaves balanceadas.
- IPC `stats-api:message` y `stats-api:status` hacia React.
- Live Data Hub ya no usa WebSocket del navegador.
- `Probar puerto` ahora valida TCP local en vez de WebSocket.
- Mantiene captura de `UpdateState`, `BallHit`, `GoalScored` y `CrossbarHit` para alimentar live shots.

Prueba:
1. Activar Stats API.
2. Cerrar Rocket League completo.
3. Abrir Rocket League.
4. Entrar a Exhibition/Private/Online.
5. Conectar live.
6. Ver `Msgs` subir y `Shot telemetry` al tocar/tirar la pelota.
