# Phase 27 — Code Optimization Pass

Objetivo: reducir duplicación y peso de mantenimiento sin cambiar la funcionalidad visible.

## Cambios

- Extrae los SVG/playbacks tácticos duplicados a `src/components/rocket-league/TacticalPlayback.tsx`.
- `SkillAreasLab.tsx` usa `ConceptTacticalPitch` para Movement/Boost/Offence/Defence/Positioning.
- `GameAnalysisPanel.tsx` usa `ReplayFieldView` para el replay isométrico/top-down.
- Mantiene play/pause, scrubber, loop, vista isometric/top-down y filtros By me/My team/All.
- `tsconfig.app.json` excluye `src/backend/**` del typecheck frontend para evitar que el build de React intente compilar código Node del writer `.Tem`.
- No toca `hooks/`, `lib/` ni `types/`.

## Resultado aproximado

- `SkillAreasLab.tsx`: baja de ~529 líneas a ~372.
- `GameAnalysisPanel.tsx`: baja de ~522 líneas a ~359.
- El playback queda centralizado en un solo archivo reutilizable.
- El build frontend deja de arrastrar `src/backend/packs/*`.

## Cómo probar

```powershell
cd C:\Projects\rl-performance-lab-electron-phase
npm run electron:dev
```

Probar:

1. Movement/Boost/Offence/Defence/Positioning: play/pause y top-down/isometric.
2. Rotation: playback automático, scrubber y loop.
3. Match History/Game Analysis: replay, top-down/isometric y filtros.
4. Dashboard, Settings y ReplayConnector deben abrir igual que antes.
