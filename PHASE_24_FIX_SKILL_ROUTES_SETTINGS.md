# Phase 24 — Fix Skill Routes + Clean Settings

## Qué arregla

1. Los botones del sidebar `Movement`, `Boost`, `Offence`, `Defence`, `Rotation` y `Positioning` ya no dejan la pantalla vacía.
2. Cada botón abre `SkillAreasLab` con el área correspondiente controlada desde `App.tsx`.
3. `Overview` sigue entrando al mismo laboratorio en modo overview.
4. `Settings` queda limpio: solo muestra por defecto la configuración importante de Tracker + Replay Watcher.
5. OCR, Stats API local, preferencias, export/import/reset quedan ocultos en `Avanzado / mantenimiento`.

## Archivos modificados

- `src/App.tsx`
- `src/components/rocket-league/SettingsHub.tsx`
- `src/styles.css`

## Cómo probar

```powershell
cd C:\Projects\rl-performance-lab-electron-phase
npm run electron:dev
```

Después probar:

- Sidebar > Movement
- Sidebar > Boost
- Sidebar > Offence
- Sidebar > Defence
- Sidebar > Rotation
- Sidebar > Positioning
- Sidebar > Settings

## Nota

El build completo puede seguir mostrando errores previos de `src/backend/packs/*` por los módulos `node:*` del writer `.Tem` dentro del build frontend. Este parche no toca `hooks/`, `lib/` ni `types/`.
