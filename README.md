# RL Performance Lab · Electron + Replay Parser Intake

App personal de escritorio para Rocket League. La versión actual ya corre como app de Windows, detecta replays locales, vigila la carpeta de Rocket League y prepara la conversión real de `.replay` a `.json` con Rattletrap.

## Estado actual

- App React + Electron.
- Dashboard, partidas, entrenamiento, habilidades, errores, progreso y ajustes.
- Carpeta local de replays detectable desde Electron.
- Soporte para ruta Epic/OneDrive como `DemosEpic`.
- Botón para cambiar carpeta de replays sin tocar código.
- Watcher local de nuevos `.replay`.
- Integración preparada para `rattletrap.exe`.
- Selector manual de `rattletrap.exe`.
- Conversión `.replay` → `.json` guardada en la carpeta de datos de la app.
- Primera lectura de metadata del JSON convertido.

## Comandos

```bash
npm install
npm run electron:dev
```

Crear instalador:

```bash
npm run electron:build
```

Crear versión portable sin instalar:

```bash
npm run electron:pack
```

## Rattletrap

La app busca el parser en:

```txt
vendor/rattletrap/rattletrap.exe
```

También podés abrir la vista **Replays** y usar el botón **Seleccionar exe** para escoger `rattletrap.exe` desde cualquier carpeta.

## Carpeta de replays

La app intenta detectar automáticamente:

```txt
C:\Users\<usuario>\OneDrive\Documents\My Games\Rocket League\TAGame\DemosEpic
C:\Users\<usuario>\Documents\My Games\Rocket League\TAGame\DemosEpic
C:\Users\<usuario>\Documents\My Games\Rocket League\TAGame\Demos
```

También podés cambiarla manualmente desde la vista **Replays**.

## Siguiente fase

- Mapear el JSON de Rattletrap a una estructura interna estable.
- Extraer KPIs reales: score, goles, tiros, saves, jugadores y eventos.
- Conectar replays convertidos con Match History.
- Motor de tendencias de 5–10 partidas.
- Diagnóstico automático del peor hábito.
- Recomendación de rutina interna según error dominante.

## Fase 11.1 · Parser fallback

Se agregó pipeline robusto para replays que Rattletrap no puede decodificar por cambios recientes de Rocket League.

- Rattletrap sigue siendo el parser principal.
- Se agregaron intentos con flags alternativos.
- Se agregó soporte opcional para `rrrocket.exe`.
- Si no hay decode completo, la app guarda una ficha `.partial.json` con diagnóstico limpio en vez de bloquearse.
- El error `MissingClassName` ahora se muestra como problema legible de compatibilidad del parser.

Carpetas opcionales:

```txt
vendor/rattletrap/rattletrap.exe
vendor/rrrocket/rrrocket.exe
```

## Fase 12 · Extractor básico

La vista Replays ahora puede leer el JSON convertido y extraer metadata inicial, jugadores candidatos, marcador y eventos candidatos. Estos datos quedan visibles en la app para preparar la importación automática a Match History en la siguiente fase.


## Fase 12.1

Extractor honesto: filtra actores internos de Rocket League para evitar jugadores/eventos falsos como `Car_TA`, `Ball_TA` o `GoalVolume_TA`.


## Fase 12.2

Extractor real para JSON de Rattletrap: lee `header.body.properties.elements`, detecta PlayerStats, Goals, marcador, mapa, modo, duración y eventos de gol.

## Fase 13

Importación automática al historial: después de procesar un replay, la vista Replays puede crear una partida real en `Match History` usando los datos extraídos del JSON de Rattletrap.

- Jugadores desde `PlayerStats`.
- Marcador desde `Team0Score` / goles de jugadores.
- Eventos de gol desde `Goals`.
- Resultado según equipo detectado del jugador principal.
- Vista inmediata en Partidas y Game Analysis.
- Protección contra duplicados por `replayId` y ruta del JSON.


## Fase 14 · Diagnóstico inicial

- Motor de diagnóstico desde partidas importadas.
- Actualiza Skill Areas y Error Tracker con señales reales.
- Dashboard muestra diagnóstico inicial por sesión.
- No inventa telemetría de boost/movement hasta que exista parser de frames.


## Fase 14.1

Reconciliación automática de diagnóstico: las partidas importadas desde replay actualizan Skill Areas, Progress y Error Tracker sin tener que reimportarlas.

## Fase 15 · Coach por sesión

Se agregó un coach de sesión que usa las últimas partidas importadas o registradas para generar un foco de entrenamiento y una rutina interna de 90 minutos.

- Usa últimas 5–10 partidas como ventana de tendencia.
- Prioriza un solo foco crítico para no saturar.
- Genera bloques internos para Training Lab.
- Crea regla de ranked, pregunta de replay review y criterios de éxito.
- No usa Workshop, BakkesMod ni mapas externos.

## Fase 15.2 — Training Pack Recommender

- Base local curada de códigos de Custom Training interno.
- Recomendaciones por debilidad del coach de sesión.
- Botón para copiar código al portapapeles.
- Rutina de mañana con pack principal y alternativas.
- Búsqueda online opcional para ampliar packs desde fuentes públicas.


## Fase 13.1 — Fix de importación múltiple

- Cambiar de replay en la vista Replays limpia el análisis anterior para evitar reutilizar datos del replay previo.
- La app separa mejor los estados `detectado`, `JSON convertido` y `partida creada`.
- La protección anti-duplicados ahora usa más identidades: id interno, replayId del header, MatchGUID, ruta del JSON, ruta del replay y nombre/fecha/marcador.
- Si un replay está convertido pero todavía no fue creado como partida, el botón de crear partida vuelve a quedar disponible.
- Se agregan `replayPath`, `replayId` real y `matchGuid` al pipeline para mantener trazabilidad.


## Fase 15.2 — Rank & MMR Sync

- MMR y rango por playlist: 1v1, 2v2 y 3v3.
- Snapshot manual de rango y división.
- Historial de MMR conectado a Dashboard y Progress.
- Escaneo experimental de Launch.log desde Electron.
- Fuentes externas guardables para Tracker/Profile RL.
- Storage actual: `rl-performance-lab.store.v11`.


## Fase 17.1 — MMR OCR local

Agrega captura local de pantalla, ROI configurable y guardado de snapshots MMR por playlist desde Ajustes → MMR OCR local. El flujo actual es captura + confirmación manual, con muestras guardadas para entrenar OCR local en una fase posterior.


## Fase 18.5

Corrección de rutas y conectividad local:

- RLA packs se crean en la misma rama `Documents/OneDrive` que usa Rocket League.
- Stats API escribe `[TAGame.MatchStatsExporter_TA]`, que es la sección que abre el WebSocket local.
- RocketRP solo aparece como listo si el CLI está completo, no solo con el `.exe`.


## Fase 18.5 - .Tem no vacío + monitor Stats API

- El instalador .Tem ahora valida que RocketRP no genere packs 0/0 antes de copiar a MyTraining.
- El parche JSON de RocketRP ya no toca IDs/GUIDs/códigos internos, para preservar la geometría de tiros de la plantilla.
- Se guardan `template-decoded.rocketrp.json` y `rla-patched.rocketrp.json` en el draft para depurar si RocketRP falla.
- Stats API ahora fuerza PacketSendRate mínimo 10 si el storage tenía 0.
- El botón Conectar live ya no se apaga al primer fallo: queda en modo espera y reintenta mientras Rocket League abre el WebSocket.
