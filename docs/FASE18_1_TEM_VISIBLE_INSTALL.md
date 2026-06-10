# Fase 18.1 — .Tem visible install

Esta fase corrige el instalador de custom training packs.

## Qué cambia

Rocket League guarda los packs creados por el usuario dentro de:

```txt
Documents\My Games\Rocket League\TAGame\Training\<account-folder>\MyTraining\*.Tem
```

La implementación anterior creaba una carpeta hermana tipo:

```txt
Training\RLA-XXXX\MyTraining
```

Eso podía crear carpetas en Windows, pero Rocket League no lo listaba como pack creado.

Ahora la app instala el archivo `.Tem` directamente dentro de la carpeta `MyTraining` real detectada o seleccionada.

## Alcance

- Genera el draft RLA.
- Usa un `.Tem` real como plantilla binaria.
- Copia ese `.Tem` con un nombre nuevo dentro de `MyTraining`.
- Adjunta JSON de tiros y manifest al lado del pack local.

## Limitación actual

El pack visible todavía es un clon jugable de la plantilla. La sustitución de tiros internos necesita terminar el encoder binario `.Tem`, usando telemetría de Stats API: posiciones, velocidades y rotaciones.
