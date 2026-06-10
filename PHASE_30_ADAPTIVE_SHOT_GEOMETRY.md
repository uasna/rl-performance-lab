# Phase 30 — Adaptive Shot Geometry Writer

Objetivo: que el .Tem generado deje de ser un clon visual de la plantilla y empiece a convertir candidatos de RL Performance Lab en tiros jugables.

## Qué hace

- Usa los candidatos de live shots / replays guardados en `pack.rla.json` y `shots.json`.
- Conserva seguridad de Phase 29: backup antes de instalar, instalación solo en `Training\\0000000000000000\\MyTraining`, rollback RLA, no toca `Downloaded`, `Favorites` ni packs manuales sin manifest.
- Decodifica una plantilla real .Tem con RocketRP.
- Localiza heurísticamente el array de shots dentro del JSON de RocketRP.
- Clona los shots de la plantilla y parchea posiciones/velocidades/rotación cuando encuentra campos vectoriales `X/Y/Z` o `x/y/z`.
- Vuelve a serializar con RocketRP.
- Relee el .Tem final y solo instala si `shots > 0`.
- Si el schema no es parcheable o falla la serialización, cae a fallback seguro y no instala un .Tem corrupto.

## Importante

Con una plantilla manual de 3 shots, la app parchea hasta 3 shots. Si querés packs de 15 shots personalizados, creá dentro de Rocket League una plantilla manual con 15 tiros dummy y seleccioná esa plantilla.

La precisión depende de la telemetría disponible:

- Live Stats API con `ImpactLocation`, `BallLocation`, `postHitSpeed` y `playerTeamNum` produce tiros más parecidos.
- Replays sin frame telemetry profunda usan estimaciones por evento, rating y timestamp.

## Archivos de debug

Cada intento genera en la carpeta del draft:

- `shot-geometry-writer-report.json`
- `rla-patched.rocketrp.json`
- `safe-writer-confirmed-fields.json`
- `installed-safe-pack-note.txt` si se instala
- `blocked-*.Tem` si RocketRP serializa algo que no pasa validación

## Flujo recomendado

1. En Rocket League, mantener tu pack manual `SPEEDFLIP UASNA` como plantilla segura.
2. Capturar live shots con Stats API o importar replays.
3. En RL Performance Lab: `Releer live shots`.
4. `Generar seed`.
5. `Inspeccionar plantilla`.
6. `Crear .Tem seguro`.
7. Verificar en Rocket League → Training → Created.
8. Si algo falla, usar `Rollback último RLA`.
