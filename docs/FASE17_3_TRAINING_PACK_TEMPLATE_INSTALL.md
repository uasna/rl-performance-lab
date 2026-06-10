# Fase 17.3 — Training Pack Template Install

Esta fase corrige el puente de instalación de packs.

La app ahora separa tres cosas:

1. Draft RLA: metadata del pack generado desde tus tiros candidatos.
2. Pack plantilla real: un custom training ya existente creado por Rocket League.
3. Install visible: clona la estructura real del pack plantilla y adjunta el draft RLA.

## Limitación actual

El contenido jugable dentro de Rocket League seguirá siendo el de la plantilla hasta que exista encoder .Tem con posiciones/velocidades reales de balón y carro.

## Flujo correcto

1. Habilidades → Offence.
2. Generar pack ahora.
3. Seleccionar pack plantilla.
4. Install visible.
5. Abrir Rocket League → Training Browser → Created.

Si Rocket League no muestra el clon, cerrar Rocket League antes de instalar y volver a abrirlo.
