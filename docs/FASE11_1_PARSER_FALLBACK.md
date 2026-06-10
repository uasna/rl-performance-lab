# Fase 11.1 · Parser fallback

Esta fase corrige el bloqueo provocado por replays nuevos que Rattletrap no puede decodificar completamente.

## Flujo

1. Detectar `.replay`.
2. Intentar Rattletrap completo.
3. Intentar variantes de Rattletrap con `--fast` y `--skip-crc`.
4. Si existe `rrrocket.exe`, intentar rrrocket como parser alternativo.
5. Si todos fallan, guardar una ficha parcial `.partial.json` con:
   - archivo original;
   - tamaño y fecha;
   - parser usado;
   - errores limpios;
   - causa probable;
   - siguiente acción.

## Por qué existe esta fase

Algunos replays recientes pueden fallar con errores como:

```txt
MissingClassName "TAGame.Default__ViralItemActor_TA"
```

Eso significa que el replay contiene una clase interna que Rattletrap aún no reconoce.

## rrrocket opcional

Descargar el bundle Windows/MSVC de rrrocket y colocar el ejecutable aquí:

```txt
vendor/rrrocket/rrrocket.exe
```

También se puede seleccionar manualmente desde la vista Replays.
