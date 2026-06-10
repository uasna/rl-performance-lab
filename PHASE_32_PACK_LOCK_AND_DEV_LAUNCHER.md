# Phase 32 — Pack Writer Lock + Dev Launcher

## Por qué existe
Rocket League mostró los `.Tem` generados como `ROOKIE 0/0`, aunque RocketRP pudiera releerlos como si tuvieran shots. Eso significa que el validador anterior detectaba arrays parecidos a shots, pero no necesariamente el schema exacto que Rocket League usa para cargar rondas jugables.

## Cambio crítico
El writer adaptativo queda bloqueado antes de instalar `.Tem` serializados por RocketRP en `MyTraining`.

Ahora, cuando intente generar tiros personalizados:

1. Decodifica plantilla.
2. Construye `rla-patched.rocketrp.json`.
3. Genera `shot-geometry-writer-report.json`.
4. Bloquea instalación del `.Tem` adaptativo.
5. No crea otro pack `0/0`.

Archivos de diagnóstico del draft:

- `adaptive-tem-install-blocked.json`
- `rla-patched.rocketrp.json`
- `shot-geometry-writer-report.json`
- `safe-writer-confirmed-fields.json`

Con esos archivos se puede mapear el schema real de RocketRP antes de desbloquear escritura de tiros reales.

## Dev launcher
Se agregan dos archivos en la raíz:

- `RL-Performance-Lab-DEV.bat`
- `BUILD-INSTALLER.bat`

Uso diario:

```powershell
cd C:\Projects\rl-performance-lab-electron-phase
.\RL-Performance-Lab-DEV.bat
```

O creá un acceso directo de escritorio:

```powershell
cd C:\Projects\rl-performance-lab-electron-phase
powershell -ExecutionPolicy Bypass -File .\scripts\create-desktop-dev-shortcut.ps1
```

Después abrís la app con doble clic sin escribir `npm run electron:dev`.

## Instalador .exe
Para crear un instalador:

```powershell
cd C:\Projects\rl-performance-lab-electron-phase
.\BUILD-INSTALLER.bat
```

El `.exe` saldrá en `release/`.

Nota: un `.exe` instalado no se actualiza automáticamente cada vez que editás VS Code. Para eso usá el launcher DEV. Auto-update real requiere un servidor/GitHub Releases y firma/versionado.
