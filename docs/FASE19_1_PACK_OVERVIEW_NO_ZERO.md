# Fase 19.1 · Pack Factory en Overview + no 0/0

Cambios:

- Custom Training Pack Factory se mueve al Overview de Habilidades.
- Offence queda como análisis de pilar, no como centro de instalación.
- El instalador deja de serializar con RocketRP mientras esa ruta pueda producir packs 0/0.
- El instalador excluye `.Tem` generados anteriormente por RLA usando manifests `RLA_*_manifest.json`.
- Se prioriza una plantilla manual real con tiros para evitar que Rocket League muestre packs 0/0.
- Los candidatos live de Stats API se guardan en el manifest del pack instalado.

Limitación honesta:

Esta fase garantiza un pack visible con tiros de una plantilla real y candidatos RLA adjuntos, pero todavía no reescribe físicamente cada tiro dentro del `.Tem` con posiciones/velocidades personalizadas. Eso requiere validar el encoder de shots de RocketRP sin generar 0/0.
