# Phase 28 — Pack Install Inspector + Safe Clone Fallback

Objetivo: seguir con los custom training packs sin volver a instalar archivos `.Tem` que Rocket League muestre como `0 / 0` o corruptos.

## Cambios

- Agrega botón `Inspeccionar plantilla` en Custom Training Pack Core.
- La inspección usa RocketRP.TrainingCLI para leer `.Tem` reales y detectar `shotCount > 0`.
- Escribe un reporte local en:
  `Documents/My Games/RLA/training_packs/_template_inspector/template-inspection-report.json`
- El instalador ahora trabaja como escalera segura:
  1. Busca plantilla `.Tem` jugable.
  2. Intenta decode → patch metadata segura → serialize.
  3. Relee el `.Tem` serializado con RocketRP.
  4. Si `shots > 0`, instala ese `.Tem`.
  5. Si el serializer falla o re-decode da `0`, bloquea ese archivo y usa fallback: clona una plantilla jugable validada.

## Importante

El fallback instala un pack jugable basado en la plantilla real. Todavía no reemplaza la física exacta de cada tiro porque eso requiere mapear campos internos confirmados del JSON de RocketRP.

## Flujo recomendado

1. Crear manualmente en Rocket League un training pack plantilla con 3+ tiros.
2. En la app: `Cambiar plantilla .Tem` y seleccionar la carpeta `MyTraining` donde está ese pack.
3. Tocar `Inspeccionar plantilla`.
4. Si dice `Plantilla OK`, tocar `Generar seed`.
5. Tocar `Crear .Tem seguro`.
6. Reiniciar/abrir Rocket League y revisar Training Browser → Created.
