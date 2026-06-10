# Fase 16.4 — UI Analysis Screens + filtros funcionales

## Cambios

- Topbar 1v1/2v2/3v3/ALL/RANKED ahora filtra partidas visibles.
- Dashboard usa el set filtrado para recientes, curva y conteos.
- Match History / Game Analysis reciben el set filtrado.
- Skill Areas fue remaquetado con pantallas tipo Overview/Offence/Defence/Rotation/Positioning: hero chart, focus cards, curvas por métrica y campo táctico conceptual.
- No se tocaron Electron, Rattletrap, parser, vendor ni storage.

## Limitaciones

- No copia assets exactos ni logos externos.
- El campo táctico sigue siendo conceptual hasta tener posiciones frame-by-frame.
- Gráficas muestran datos existentes o estados vacíos sin inventar telemetría.
