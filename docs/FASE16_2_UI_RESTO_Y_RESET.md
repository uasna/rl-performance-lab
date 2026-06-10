# Fase 16.2 — UI resto + reset de datos

## Cambios

- Rediseño visual progresivo de Habilidades, Errores y Progreso.
- Mejor responsive para dashboard, análisis y páginas secundarias.
- Bump de storage a `rl-performance-lab.store.v12`.
- Reinicio intencional: no se migran datos de `v11` hacia `v12`.

## Resultado

La app arranca desde 0 en partidas, entrenamientos, rank history y progreso local, conservando únicamente la base del sistema y catálogos vacíos.

## Verificación

```bash
npm run build
npm run lint
npm run build:electron
```
