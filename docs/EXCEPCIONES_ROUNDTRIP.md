# Excepciones del round-trip script ↔ modelo

Prueba: `backend/tests/test_script.py`.

- `test_textual_roundtrip`: `parse(serialize(parse(x))) == parse(x)` en los 162 samples de `GMAT_HOME/samples`. Pasan todos.
- `test_engine_roundtrip`: `x` y `serialize(parse(x))` (ambos tras `sanitize`) se cargan en gmatpy (`worker.snapshot`, sin correr) y se compara el texto canónico de GMAT (`GetGeneratingString(NO_COMMENTS)`) de cada objeto y de cada comando de nivel superior. Se ignoran líneas vacías, comentarios, el prefijo `GMAT` y `NAIFId`/`NAIFIdReferenceFrame` (los asigna el motor según el orden de creación).

## xfail (diferencia real)

| Sample | Motivo |
|---|---|
| `Navigation/Simulate_DSN_Range_then_Estimate_CartesianState_and_Cr.script` | Copia de objeto `SimSatCopy = SimSat` intercalada entre asignaciones de `SimSat`. El modelo agrupa los campos por recurso y la copia (que va a `raw`) queda después de todos, así que copia un estado distinto (`Id`). |

## skip (no se puede comparar con el motor)

Rechazados por `sanitize` (12): funciones GMAT/MATLAB/Python e `#Include`
(`Ex_GMATFunction_*`, `Tut_UsingGMATFunctions`, `Ex_IncludeMacro`, `NeedMatlab/*`, `Ex_PythonInterface`, `Ex_IOD`, `Navigation/Ex_CompareEphemeris`...).

El original no carga con la API de GMAT (34): plugins ausentes en la API (SNOPT, VF13ad, CSALT/EMTG, OpenFrames, MarsGRAM), fuerzas externas o archivos de soporte. Carpetas `NeedSNOPT/`, `NeedVF13ad/`, `OptimalControl/` y algunos sueltos (`Ex_Contact_Location_Station_Mask`, `Ex_DynamicDisplay_QuaternionPropagation`, `Ex_ElectricPropulsion`, `Ex_ExternalForceModel*`, `Ex_ForceModel_ExtraShadowBodies`, `Ex_MarsGRAM2005`, `SupportFiles/Ex_EphemerisCompareGeneric`, `Ex_OFI_FieldOfView`, `Ex_OFI_HiFiEarthMoon`, `Ex_OFI_RealTimeMOC`).

Estos 46 sí pasan la prueba textual.

## Límites conocidos del modelo

- El orden se agrupa por recurso: lo que va a `raw` (asignaciones a cuerpos como `Earth.*`/`SolarSystem.*`, `x = 3`, `A(1,1) = …`, copias `A = B`, campos repetidos, valores que no se entienden) se escribe después de todos los recursos.
- Los comentarios en línea pasan a ser líneas propias antes del recurso/comando; las líneas en blanco no se conservan.
- Un string entre comillas que es un identificador (`'SatId'`) se escribe sin comillas (GMAT lo acepta igual).
