# Fase 11 · Rattletrap local

Esta fase conecta la app de escritorio con un parser local para convertir archivos `.replay` de Rocket League a `.json`.

## Estado actual

- La app detecta `.replay` desde la carpeta local configurada.
- La app puede seleccionar manualmente `rattletrap.exe`.
- La app intenta convertir el replay usando varias formas de argumentos para mejorar compatibilidad entre versiones de Rattletrap.
- Los JSON convertidos se guardan en la carpeta de datos local de la app.
- La UI muestra metadata inicial: tamaño del JSON, claves raíz y posibles nombres de jugadores si se pueden detectar.

## Dónde colocar Rattletrap

Opción recomendada:

```txt
vendor/rattletrap/rattletrap.exe
```

También se puede seleccionar desde la app en:

```txt
Replays → Seleccionar exe
```

## Cómo probar

```powershell
npm install
npm run electron:dev
```

En la app:

1. Abrir `Replays`.
2. Confirmar que detecta la carpeta `DemosEpic`.
3. Confirmar que detecta `.replay`.
4. Seleccionar `rattletrap.exe`.
5. Seleccionar un replay.
6. Pulsar `Convertir a JSON`.
7. Pulsar `Abrir carpeta JSON`.

## Próxima fase

Fase 12: mapear el JSON de Rattletrap a KPIs reales del jugador y crear una partida automática en Match History.
