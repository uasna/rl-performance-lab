# Fase 17.1 — MMR OCR local

Esta fase agrega un flujo ToS-friendly para registrar MMR sin scraping, APIs privadas ni tráfico interceptado.

## Qué incluye

- Panel **MMR OCR local** en Ajustes.
- Captura local de pantalla con Electron.
- ROI configurable sobre la zona donde aparece el MMR.
- Confirmación manual del MMR leído.
- Guardado de snapshot por playlist: 1v1, 2v2 o 3v3.
- Actualización de Dashboard y Progress mediante `playlistRanks` y `rankHistory`.
- Carpeta local de muestras para entrenar un OCR ligero futuro.

## Estado real

La Stats API oficial se usa para datos en vivo y para saber cuándo la app debe estar abierta mientras se juega. El MMR no viene por Stats API; por eso este flujo usa captura local de pantalla y confirmación, dejando el dataset listo para sustituir la confirmación por modelos OCR locales entrenados.

## Rutas

Las capturas y muestras quedan en el `userData` de Electron, dentro de `mmr-ocr`.
