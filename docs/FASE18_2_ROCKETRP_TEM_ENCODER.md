# Fase 18.2 — RocketRP .Tem encoder bridge

Esta fase corrige dos problemas:

1. La app ya no clona/copia tu .Tem existente como pack visible, porque eso duplica el mismo pack en Rocket League.
2. La app prepara un flujo real usando `RocketRP.TrainingCLI.exe` para convertir una plantilla .Tem a JSON, parchear metadata local y serializar un .Tem nuevo.

## Rutas correctas

- Root real de training: `Documents\My Games\Rocket League\TAGame\Training`
- Cuenta local: `Training\0000000000000000`
- Packs creados: `Training\0000000000000000\MyTraining`

Para instalar/generar .Tem, seleccioná siempre la carpeta `MyTraining` que contiene tu `.Tem` real.

## Stats API

`DefaultStatsAPI.ini` sí es el archivo correcto. La API solo emite eventos cuando Rocket League está abierto y en gameplay/freeplay/partido; no emite datos en el menú ni en Training Browser. Cambios al ini requieren reiniciar Rocket League.
