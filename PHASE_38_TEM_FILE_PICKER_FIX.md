# Phase 38 — .Tem File Picker Fix

Corrige el selector de plantilla de Custom Training Pack Core.

## Problema
El botón `Cambiar plantilla .Tem` abría un selector de carpetas (`openDirectory`).
En Windows eso muestra la carpeta `MyTraining` vacía porque no permite seleccionar archivos `.Tem`, y al pegar una ruta de archivo aparecía: `El nombre de carpeta no es válido`.

## Cambio
- El selector ahora acepta archivo `.Tem` y carpeta `MyTraining`.
- Si seleccionás un `.Tem` exacto, la app guarda ese archivo como `selectedTemPath`.
- La inspección prioriza ese `.Tem` exacto sobre otros packs de la misma carpeta.
- La instalación segura también usa primero ese `.Tem` exacto.
- Sigue permitiendo seleccionar una carpeta completa si hace falta.

## Flujo esperado
1. Cerrar Rocket League.
2. Custom Training Pack Core → Cambiar plantilla .Tem.
3. Seleccionar el archivo `.Tem` más reciente o pegar la ruta completa.
4. Inspeccionar plantilla.
5. Debe reportar `15 shots detectados` para la plantilla RLA TEMPLATE 15.
