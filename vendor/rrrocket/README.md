# rrrocket fallback

Opcional para Fase 11.1.

Si Rattletrap falla con errores como `MissingClassName`, descargá el bundle de Windows de rrrocket y colocá aquí el ejecutable:

```txt
vendor/rrrocket/rrrocket.exe
```

La app intentará usar Rattletrap primero. Si falla, probará rrrocket. Si ambos fallan, guardará una ficha parcial `.partial.json` con el diagnóstico del parser.
