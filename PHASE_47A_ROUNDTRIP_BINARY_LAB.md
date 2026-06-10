# Phase 47A — Roundtrip + Binary Writer Lab

Este parche agrega un laboratorio seguro para responder una pregunta clave:

> ¿RocketRP Serialize rompe el `.Tem` incluso sin modificar el JSON?

## Seguridad

- No instala `.Tem` en `MyTraining`.
- No borra packs manuales.
- No toca `Downloaded`, `Favorites` ni toda la carpeta `Training`.
- Solo escribe debug/reportes en:

```txt
%USERPROFILE%\OneDrive\Documents\My Games\RLA\training_packs\_phase47_lab
```

## Archivos modificados por el patcher

- `electron/main.cjs`
- `electron/preload.cjs`
- `src/lib/electronBridge.ts`
- `src/components/rocket-league/CustomPackFactoryPanel.tsx`

El script crea backups `.bak47a` antes de tocar cada archivo.

## Uso

```powershell
cd C:\Projects\rl-performance-lab-electron-phase
powershell -ExecutionPolicy Bypass -File .\tools\apply-phase47a-roundtrip-lab.ps1
npx tsc --noEmit
.\BUILD-INSTALLER.bat
```

En la app:

```txt
Custom Training Pack Core → Phase 47A Lab
```

Luego abrir:

```txt
%USERPROFILE%\OneDrive\Documents\My Games\RLA\training_packs\_phase47_lab\phase47-roundtrip-binary-lab-report.json
```

## Campos importantes del reporte

- `hypothesisVerdict.conclusion`
- `hypothesisVerdict.roundtripSizeChange`
- `roundtripResults[*].verdict`
- `roundtripResults[*].sameHash`
- `roundtripResults[*].byteDiffCount`
- `manualDiff.sizeDelta`
- `manualDiff.jsonDiff.ballArchetypeFieldChanges`

## Interpretación

- `ROUNDTRIP_CLEAN`: RocketRP serialize funciona sin cambios; el problema es el patch JSON.
- `ROCKETRP_SERIALIZE_CORRUPTS_TEM`: RocketRP serialize rompe el `.Tem`; hace falta binary writer o Template Bank.
- `PARTIAL_CORRUPTION`: RocketRP preserva archetypes pero cambia binario/tamaño/hash; investigar header/CRC y usar Template Bank como fallback.
