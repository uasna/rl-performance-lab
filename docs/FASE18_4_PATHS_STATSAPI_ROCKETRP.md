# Fase 18.4 — Rutas, Stats API oficial y RocketRP completo

Correcciones incluidas:

- RLA training packs ahora usa la misma carpeta Documents/OneDrive donde vive Rocket League:
  `OneDrive/Documents/My Games/RLA/training_packs` cuando el juego usa OneDrive.
- Stats API ahora escribe la sección oficial que Rocket League lee:
  `[TAGame.MatchStatsExporter_TA]` con `Port` y `PacketSendRate`.
- Se mantiene `[StatsAPI]` solo por compatibilidad, pero la sección oficial es la importante.
- RocketRP ya no aparece como OK si solo existe el `.exe`; también exige `.dll` y `runtimeconfig.json`.
- El mensaje de error ahora indica copiar toda la carpeta publish/release de RocketRP, no solo el ejecutable.

Para probar Stats API:

1. Activar Stats API desde Ajustes.
2. Cerrar Rocket League por completo.
3. Abrir Rocket League.
4. Entrar a freeplay o partido.
5. Probar puerto.
6. Conectar live.

Para RocketRP:

La carpeta `vendor/rocketrp` debe tener al menos:

- `RocketRP.TrainingCLI.exe`
- `RocketRP.TrainingCLI.dll`
- `RocketRP.TrainingCLI.runtimeconfig.json`
- `RocketRP.TrainingCLI.deps.json` si existe en la publicación
- DLLs de RocketRP que vengan en la carpeta publicada

No basta con copiar solo el `.exe`.
