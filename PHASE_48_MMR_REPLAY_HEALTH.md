# Phase 48 — MMR Manual + Capture + Replay Classification Health

## Cambios

- Dashboard y TopBar ahora muestran el rank/MMR del modo seleccionado (1v1/2v2/3v3) usando `playlistRanks`.
- Guardar MMR manual en Rank Sync u OCR actualiza el modo correcto y se refleja al cambiar el filtro del dashboard.
- Captura OCR oculta brevemente la ventana de RLA para capturar Rocket League detrás, no la app.
- Replays importados clasifican `matchType` con heurística: Ranked / Casual / Private / Replay Review.
- Metadata `Online` se marca como Casual con baja confianza porque el replay no trae señal ranked explícita.

## Seguridad

- No toca packs .Tem.
- No toca Phase 46/47A guards.
- No instala nada en MyTraining.
- Solo modifica UI/mapper/captura OCR.
