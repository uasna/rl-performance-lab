# Phase 29 — Training Safe Mode + Rollback

Objetivo: proteger los packs manuales del usuario y evitar que RL Performance Lab vuelva a dejar Rocket League sin abrir por un `.Tem` generado.

## Cambios principales

- La app solo instala en `Training\\0000000000000000\\MyTraining`.
- La app bloquea destinos peligrosos como `Downloaded`, `Favorites` o `Favorities`.
- Antes de instalar cualquier `.Tem`, crea un snapshot de seguridad de `MyTraining` en el `userData` de Electron.
- Cada `.Tem` instalado por la app queda registrado en `last-install-record.json`.
- Nuevo botón: **Rollback último RLA**.
- Nuevo botón: **Abrir backups safety**.
- El rollback elimina solo el último `.Tem`/manifest generado por la app. No toca packs manuales.
- `Limpiar packs RLA` sigue limitado a packs con manifest RLA/drafts RLA.

## Regla de oro

La app no debe mover ni borrar `Training` completo, ni tocar `Downloaded`, `Favorites`, `Favorities`, ni packs manuales sin manifest.

## Uso recomendado

1. Restaurar tu pack manual bueno desde backup si hace falta.
2. Abrir Rocket League y confirmar que Custom Training abre.
3. En RL Performance Lab, usar `Generar seed`.
4. Usar `Inspeccionar plantilla`.
5. Usar `Crear .Tem seguro` solo si RocketRP y plantilla están OK.
6. Si Rocket League no abre después, abrir RL Performance Lab y usar `Rollback último RLA`.

## Carpeta de backups

Los backups quedan en:

```txt
%APPDATA%/RL Performance Lab/training-pack-safety
```

También se puede abrir desde el botón **Abrir backups safety**.
