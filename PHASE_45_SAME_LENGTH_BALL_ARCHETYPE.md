# PHASE 45 — Same-Length Ball Archetype Mutation

Objetivo: probar una mutación conservadora del primer tiro sin cambiar la longitud del string `SerializedArchetypes[0]`.

## Cambio clave

Phase 44 confirmó que la pelota vive en:

```txt
Objects[0].Rounds[0].SerializedArchetypes[0]
```

pero cambiar valores con longitud diferente hizo que Rocket League mostrara `0/0`.

Phase 45 modifica solo campos con tokens del mismo largo:

- `StartLocationY`
- `StartLocationZ`
- `VelocityStartSpeed`
- `VelocityStartRotationY`

`StartLocationX` queda bloqueado porque el template usa `0.0000` y una coordenada negativa no entra sin cambiar la longitud.

## Seguridad

- Solo toca el tiro #1.
- No toca los otros 14 tiros.
- No toca carro/cámara.
- No toca contadores globales.
- Si no puede mutar, instala clon exacto.
- Mantiene rollback.

## Reporte

Genera:

```txt
phase45-same-length-archetype-report.json
rla-phase45-same-length.rocketrp.json
installed-phase45-same-length-note.txt
```

## Validación manual

Rocket League debe mostrar el pack como `0/15`. Si vuelve a salir `0/0`, usar Rollback último RLA.
