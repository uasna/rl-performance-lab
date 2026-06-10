# Fase 20 · Pack Core seguro

Esta fase detiene la instalación insegura de `.Tem` para evitar packs vacíos, `ROOKIE 0/0` y duplicados.

## Flujo actual

1. La app captura candidatos desde Stats API y replays.
2. El Overview/Skill Areas calcula una debilidad principal.
3. El panel de Custom Training Pack Core genera un `training-pack-seed.json` con candidatos priorizados.
4. La instalación `.Tem` queda bloqueada hasta que exista un writer validado.

## Condición de instalación futura

Para copiar un `.Tem` a `MyTraining`, el writer debe:

1. Decodificar plantilla `.Tem` con RocketRP.
2. Parchear solamente los objetos de shots confirmados.
3. Serializar a `.Tem`.
4. Releer el `.Tem` generado con RocketRP.
5. Confirmar `shots > 0`.
6. Confirmar que no es clon de una plantilla vieja ni pack `ROOKIE 0/0`.
7. Instalar en `Training\\0000000000000000\\MyTraining`.

## Limpieza

El botón `Limpiar packs RLA` mueve a backup los `.Tem` que la app reconoce mediante manifests `RLA_*_manifest.json` y los drafts `rla-pack-*`. No borra packs manuales sin manifest.
