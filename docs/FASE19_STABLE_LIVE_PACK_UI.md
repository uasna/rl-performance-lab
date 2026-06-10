# Fase 19 — Stable live, pack factory y UI cleanup

- Stats API Live: se mantiene conectado, resume UpdateState y oculta ruido visual.
- Pack Factory: permite generar drafts usando candidatos live aunque no existan suficientes replays.
- Instalar pack entrenable: ya no depende de que haya candidatos de replay; usa candidatos live y evita 0/0.
- Perfil: se reduce a un único badge de cuenta Rocket League/Epic.
- Game Analysis: botones Isometric / Top-down ahora cambian la vista.

Nota técnica: si Rocket League solo emite UpdateState, los candidatos no tienen geometría completa de pelota/carro. La app guarda ventanas entrenables y manifest para no perder la sesión.
