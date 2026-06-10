# Fase 16.6 — UI compacta, Epic hub y custom pack factory

Incluye:

- UI más compacta para cockpit.
- Panel de vinculación Epic preparado en Ajustes.
- Factory de custom training packs en Offence.
- Cuotas: 10 manuales/semana, 3 automáticos/semana, 1 automático por cada 10 replays procesados.
- Rutas locales preparadas:
  - `Documents\My Games\RLA\training_packs`
  - `Documents\My Games\Rocket League\TAGame\Training[code]\MyTraining\`
- Bridge Electron para crear draft, abrir carpeta e instalar draft.

Nota técnica: el módulo genera drafts con tiros candidatos. El archivo `.Tem` jugable requiere telemetría frame-by-frame de posición/velocidad de pelota y carro para recreación física exacta.
