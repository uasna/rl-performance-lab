# Fase 13.1 · Fix de importación múltiple

Esta fase corrige el problema donde la app podía mostrar “Partida ya registrada” al cambiar a otro replay, aunque ese segundo replay todavía no estuviera en Match History.

## Cambios

- La selección de un nuevo replay limpia el análisis anterior.
- El análisis visible solo se usa si pertenece al replay actualmente seleccionado.
- El match automático ahora usa una identidad estable basada en `MatchGUID`, `Id` del replay, ruta del replay o fallback del archivo.
- Se guarda `replayPath` dentro del match importado.
- El anti-duplicados compara:
  - `id` interno;
  - `replayId`;
  - `replayJsonPath`;
  - `replayPath`;
  - tags `match:` y `replay:`;
  - fallback por nombre de archivo + fecha + marcador + mapa.

## Resultado esperado

Cada replay distinto puede convertirse y crear una partida distinta en el historial. Reprocesar el mismo replay actualiza/reemplaza su partida, pero no crea duplicados.
