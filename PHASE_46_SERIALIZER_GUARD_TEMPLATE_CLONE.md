# Phase 46 — Serializer Guard + Valid Template Strategy

## Motivo
Las pruebas de Phase 44/45 confirmaron que RocketRP puede deserializar `.Tem` y mostrar el schema, pero cuando se vuelve a serializar un JSON modificado el archivo final cambia de tamaño/layout y Rocket League lo muestra como `0/0`.

## Cambio principal
`Crear .Tem seguro` ya no instala ningún `.Tem` mutado por RocketRP Serialize.

Ahora el flujo hace:

1. Selecciona una plantilla `.Tem` jugable con shots > 0.
2. Genera y guarda el plan de candidatos live/replay.
3. Decodifica solo para diagnóstico si RocketRP está disponible.
4. Guarda reportes de preview, schema y campos que se intentarían mutar.
5. Instala únicamente un clon byte-for-byte de la plantilla válida.

## Reportes nuevos
En el draft RLA se escriben:

- `phase46-serializer-guard-report.json`
- `phase46-mutation-preview-only.json`
- `candidate-shot-plan.json`
- `rla-phase46-preview-not-installed.rocketrp.json`

## Seguridad
- No toca packs manuales.
- No borra `Downloaded`, `Favorites` ni backups.
- Usa rollback/snapshot igual que las phases anteriores.
- Evita volver a crear packs `0/0` por serialización insegura.

## Limitación actual
El pack instalado puede verse igual que la plantilla dummy, porque el objetivo de esta phase es estabilidad: no instalar geometría modificada hasta tener un writer binario real o una estrategia de plantillas manuales por familias.

## Validación esperada
En Rocket League, el pack generado debe aparecer como `0/N` y no como `0/0`.
