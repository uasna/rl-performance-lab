# Phase 40 — Strict Clone-First Writer

## Motivo
RocketRP podía releer el `.Tem` serializado con `shots > 0`, pero Rocket League lo mostraba como `0/0`. Eso significa que la validación de RocketRP no basta para instalar geometría parcheada.

## Cambio principal
`Crear .Tem seguro` ya no instala geometría modificada por RocketRP. Ahora:

1. Selecciona una plantilla `.Tem` real con shots.
2. Valida que RocketRP la pueda leer con `shotCount > 0`.
3. Copia el `.Tem` byte-for-byte a un archivo RLA nuevo.
4. Escribe manifest RLA y snapshot de rollback.
5. Guarda `candidate-shot-plan.json` con los fallos seleccionados, pero NO toca los tiros instalados todavía.

## Archivos de debug generados en el draft
- `phase40-strict-clone-report.json`
- `candidate-shot-plan.json`
- `safe-writer-start.json`

## Resultado esperado
El pack RLA generado debe aparecer en Rocket League con tiros reales, no `0/0`. Puede verse como una copia de la plantilla, porque Phase 40 prioriza confirmar que la instalación sea jugable antes de modificar geometría.

## Próximo paso después de confirmar
Cuando el clon exacto aparezca con shots en Rocket League, Phase 41 debe generar un archivo experimental modificando solo 1 tiro. Si ese funciona, se escala a 2 y luego a 15.
