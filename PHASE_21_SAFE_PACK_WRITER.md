# Fase 21 — Safe Pack Writer

Este parche agrega un writer seguro para `.Tem` de Rocket League usando `RocketRP.TrainingCLI`.

## Qué garantiza

El pack **no se instala** si falla cualquiera de estas etapas:

1. Decode de la plantilla `.Tem`.
2. Validación de shots en JSON original.
3. Patch limitado a rutas permitidas.
4. Serialize a `.Tem` en staging.
5. Validación de tamaño mínimo del `.Tem` generado.
6. Re-decode del `.Tem` generado.
7. Validación `shots > 0` después del re-decode.
8. Validación de preservación de cantidad de shots.

## Archivos

```txt
src/backend/packs/rocketRpTrainingAdapter.ts
src/backend/packs/jsonPatchGuard.ts
src/backend/packs/safePackValidator.ts
src/backend/packs/safePackWriter.ts
scripts/phase21-roundtrip.ts
```

## Prueba recomendada: roundtrip puro

Primero probá sin modificar ningún campo:

```powershell
npx tsx scripts/phase21-roundtrip.ts `
  --rocketrp "C:\Tools\RocketRP\RocketRP.TrainingCLI.exe" `
  --template "C:\Users\TU_USUARIO\Documents\My Games\Rocket League\TAGame\Training\TEMPLATE\MyTraining.Tem" `
  --install-dir "C:\Users\TU_USUARIO\Documents\My Games\Rocket League\TAGame\Training\RLA_SAFE_TEST" `
  --output "SAFE_ROUNDTRIP_TEST.Tem"
```

Si esto da OK y Rocket League abre el pack, entonces el pipeline base funciona.
Si Rocket League muestra `0 / 0` o `Invalid or corrupted file`, el problema está antes de tocar shots: versión de RocketRP, argumentos, carpeta de salida, estructura del `.Tem` o compatibilidad del formato.

## Siguiente paso después del roundtrip

Cuando el roundtrip puro pase, recién ahí agregamos patches confirmados:

```ts
await safeWriteTrainingPack({
  trainingCliPath,
  templateTemPath,
  stagingRootDir,
  installDir,
  allowedPatchPathPrefixes: [
    "/Properties/Title",
    "/Properties/Description"
  ],
  patch: (json) => {
    // Cambiar solo campos confirmados aquí.
    return json;
  }
});
```

No usar rutas inventadas. Primero se inspecciona el JSON decodificado y se confirma el path real.
