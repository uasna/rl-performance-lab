# Phase 31 — Draft Selection Fix + Replay Registration Guide

## Problema corregido
El botón **Crear .Tem seguro** podía llamar al instalador con un `draftFolder` vacío o viejo después de inspeccionar plantilla/re-escanear carpetas. Eso causaba el mensaje:

> No existe el draft seleccionado. Generá un pack primero.

Aunque ya hubieras apretado **Generar seed**.

## Cambios
- `findExistingPackDraftFolders()` ahora ordena drafts por fecha real de modificación y expone el más reciente.
- `getTrainingPackStatus()` ahora devuelve `latestDraftFolder` y `draftCount`.
- `installTrainingPackDraft()` usa fallback automático al último draft RLA válido si el path recibido está vacío/stale.
- `CustomPackFactoryPanel` conserva el draft seleccionado entre inspección, refresh y selección de plantilla.
- `Crear .Tem seguro` ya no queda bloqueado solamente porque la UI perdió el draft; el backend intenta instalar el último draft válido.
- Mensajes más claros: tener solo 1 replay no bloquea el writer si ya hay candidatos live.

## Orden recomendado
1. Releer live shots
2. Generar seed
3. Inspeccionar plantilla
4. Crear .Tem seguro
5. Abrir Rocket League y probar en Created

## Cómo registrar más partidas
- Método automático: Settings → Auto-parse replays ON, Replay Watcher ON. Después de cada partida, en Rocket League guardá replay; la app lo detecta.
- Método manual: Match History / Replay Connector → Re-escanear carpeta de replays → seleccionar replay → analizar/registrar.
- Método live: mantener Stats API local activa; los shots live sirven como candidatos aunque tengas pocas partidas registradas.
