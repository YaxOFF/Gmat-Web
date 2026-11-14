<!-- generado por backend/app/batch.py: no editar la tabla a mano -->
# Compatibilidad de samples

Samples raíz de `GMAT_HOME/samples` (GMAT R2026a) corridos por el camino de la web (`sanitize` + `runner` + ReportFile ocultos). Timeout 300 s.

Regenerar (desde `backend/`, con `GMAT_HOME`): `python -m app.batch` (opciones `--jobs`, `--timeout`).

## Resumen

ok: 77 · rechazado: 8 · error: 0 · timeout: 0 · falta archivo: 0 · plugin: 3 · total: 88

Estados: `ok` terminó sin error; `rechazado` lo para `sanitize` (regla de seguridad, no se corre); `error` el motor no lo cargó o falló; `timeout` pasó el límite; `falta archivo` el motor no encontró un archivo de entrada; `plugin` usa un plugin que el startup file activo deja comentado (no se corre; los plugins activos, como estimación, eventos o formaciones, sí se corren). Solver: estado final de cada solver según los eventos `solver` (`converged`, `failed`, `initial`; `×N` = veces que corrió).

## Límites conocidos (no son bugs del port)

- `rechazado`: `GmatFunction`, `Python.*` e `#Include` están prohibidos en el servidor (`engine/sanitize.py`).
- Rutas de entrada relativas: GMAT las busca en la carpeta del script (`GmatFileUtil::FindFile`), que en la web es la corrida; `sanitize` pasa a absoluta la que existe desde `GMAT_HOME/samples` (`'../samples/SupportFiles/...'`). Una ruta relativa a otra carpeta no se encuentra.
- `TrackingFileSet.FileName`: con un `Simulator` en el script es salida y va a la corrida; sin él es entrada (`.gmd` que lee el estimador) y no se reescribe. Un script que simula y además lee otro `.gmd` existente no lo encuentra.
- `plugin`: librerías con su línea `PLUGIN` comentada en el startup file que usa el worker (en R2026a: MarsGRAM, ExternalForceModel, VF13ad, SNOPT, CSALT, entre otras). Activarlas es decisión de despliegue, no del port.
- Optimize con Yukon y Target (Hohmann, Mars B-plane) dan los mismos valores finales que GMAT escritorio: `tests/test_desktop.py` (`pytest -m slow`). VF13ad y fmincon no están en esta instalación.

## Tabla

| Sample | Estado | Tiempo (s) | Solver | Motivo |
|---|---|---|---|---|
| Ex_AnalyticMassProperties.script | ok | 0.9 |  |  |
| Ex_Attitude_Inertial.script | ok | 1.8 |  |  |
| Ex_Attitude_ModifiedRodriguesParameters.script | ok | 1.7 |  |  |
| Ex_Attitude_NadirPointing.script | ok | 1.7 |  |  |
| Ex_Attitude_Spinner.script | ok | 1.5 |  |  |
| Ex_Attitude_VNB.script | ok | 1.9 |  |  |
| Ex_Basic3DModel.script | ok | 3.8 |  |  |
| Ex_CCSDSAEMAttitude.script | ok | 1.1 |  |  |
| Ex_CommandEcho_GEOTransfer.script | ok | 1.7 | DC: converged ×3 |  |
| Ex_ConstellationScript.script | ok | 2.8 |  |  |
| Ex_Contact_Location_Station_Mask.script | ok | 4.9 |  |  |
| Ex_ControlFlow.script | ok | 1.1 |  |  |
| Ex_CSSISpaceWeatherFile.script | ok | 1.1 |  |  |
| Ex_CustomSegmentColors.script | ok | 1.1 | DC: converged |  |
| Ex_DoubleLunarSwingby.script | ok | 1.4 | DC1: converged ×2 |  |
| Ex_DynamicDisplay_QuaternionPropagation.script | rechazado |  |  | 'Python.time' no está permitido en el servidor (línea 315) |
| Ex_EclipseLocation.script | ok | 2.1 |  |  |
| Ex_ElectricPropulsion.script | ok | 1.1 |  |  |
| Ex_EOPFileLocationFromScript.script | ok | 1.1 |  |  |
| Ex_ExternalForceModel.script | plugin |  |  | libExternalForceModel (desactivado en el startup file) |
| Ex_ExternalForceModel_NoAPI.script | plugin |  |  | libExternalForceModel (desactivado en el startup file) |
| Ex_FileInterface.script | ok | 1.1 |  |  |
| Ex_FiniteBurn.script | ok | 1.1 |  |  |
| Ex_FiniteBurnParameters.script | ok | 1.1 |  |  |
| Ex_ForceModel_ExtraShadowBodies.script | ok | 1.1 |  |  |
| Ex_ForceModels.script | ok | 3.3 |  |  |
| Ex_GEOTransfer.script | ok | 1.7 | DC: converged ×3 |  |
| Ex_GivenEpochGoToTheMoon.script | ok | 2.3 | DC1: converged ×2 |  |
| Ex_GMATFunction_Math.script | rechazado |  |  | 'GmatFunction' no está permitido en el servidor (línea 11) |
| Ex_GMATFunction_TargetInsideFunction.script | rechazado |  |  | 'GmatFunction' no está permitido en el servidor (línea 163) |
| Ex_GMATFunction_UsingGlobalObjects.script | rechazado |  |  | 'GmatFunction' no está permitido en el servidor (línea 353) |
| Ex_HighFidelitySRP.script | ok | 1.1 |  |  |
| Ex_HohmannTransfer.script | ok | 1.1 | DC: converged |  |
| Ex_ImprovedTargeterAlgorithms.script | ok | 1.2 | aDC: converged |  |
| Ex_IncludeMacro.script | rechazado |  |  | '#Include' no está permitido en el servidor (línea 12) |
| Ex_Integrators.script | ok | 1.1 |  |  |
| Ex_IntrusionLocator_Mercury_Sun_Transit.script | ok | 1.2 |  |  |
| Ex_IOD.script | rechazado |  |  | 'Python.IODFunctions' no está permitido en el servidor (línea 47) |
| Ex_L2Design.script | ok | 1.1 | DC: converged ×4 |  |
| Ex_LCROSSTrajectory.script | ok | 23.6 |  |  |
| Ex_LEOStationKeeping.script | ok | 18.5 | DC: converged ×2 |  |
| Ex_LibrationPointStationKeeping_ESM.script | ok | 1.9 | DefaultDC: converged ×7 |  |
| Ex_LunarOrbitStationKeeping.script | ok | 22.9 | DefaultDC: converged ×3 |  |
| Ex_LunarTransfer.script | ok | 2.7 | DC1: converged ×2 |  |
| Ex_MarsBPlane.script | ok | 3.6 | DC: converged ×2 |  |
| Ex_MarsExponentialAtmosphere.script | ok | 2.7 |  |  |
| Ex_MarsGRAM2005.script | plugin |  |  | libMarsGRAM (desactivado en el startup file) |
| Ex_MarsOrbit.script | ok | 1.3 |  |  |
| Ex_MathInScript.script | ok | 1.3 |  |  |
| Ex_MMSSingleLunarSwingby.script | ok | 1.1 | DC1: converged ×2 |  |
| Ex_MultibodySphericalHarmonicGravity.script | ok | 13.9 |  |  |
| Ex_NadirPointingAttitude.script | ok | 1.1 |  |  |
| Ex_NewFunctions_GetEphemStates.script | ok | 1.1 |  |  |
| Ex_NewMathFunctions.script | ok | 0.9 |  |  |
| Ex_NewOrbitStateReps.script | ok | 0.9 |  |  |
| Ex_NewStringFunctions.script | ok | 1.1 |  |  |
| Ex_OEMPropagation.script | ok | 1.3 |  |  |
| Ex_PlanetographicRegion.script | ok | 1.3 |  |  |
| Ex_PrecessingSpinnerAttitude.script | ok | 1.1 |  |  |
| Ex_Propagate_Covariance.script | ok | 1.9 |  |  |
| Ex_Propagate_ThrustHistoryFile.script | ok | 1.1 |  |  |
| Ex_PythonInterface.script | rechazado |  |  | 'Python.ArrayFunctions' no está permitido en el servidor (línea 42) |
| Ex_SafetyEllipse.script | ok | 3.6 |  |  |
| Ex_SchattenFile_NominalCycle_Mean.script | ok | 1.7 |  |  |
| Ex_SolverConvergenceParameters.script | ok | 1.1 | aDC: converged |  |
| Ex_SPICECoordinateAxes.script | ok | 1.2 |  |  |
| Ex_SPICEOrbitAndAttitudePropagation.script | ok | 2.4 |  |  |
| Ex_StationContactLocator.script | ok | 2.0 |  |  |
| Ex_STKEphemOutput.script | ok | 1.2 |  |  |
| Ex_STKEphemPropagation.script | ok | 1.3 |  |  |
| Ex_TargetFiniteBurn_CenterPeriapsisDuration.script | ok | 1.1 | DC1: converged |  |
| Ex_TargetFiniteBurn_CenterPeriapsisTA.script | ok | 1.3 | DC1: converged |  |
| Ex_TargetStatusWindow.script | ok | 1.7 | DC: converged ×3 |  |
| Ex_ThrusterWithMultipleTanks.script | ok | 1.1 |  |  |
| Ex_TLE_Propagation.script | ok | 1.2 |  |  |
| Ex_WriteCommand.script | ok | 0.9 |  |  |
| Ex_Yukon_AlgebraicOptimization.script | ok | 0.9 | Yukon1: converged |  |
| Ex_Yukon_MarsLaunchWindowAnalysis.script | ok | 21.1 | Yukon1: converged ×20 |  |
| Tut_ElectricPropulsionModelling.script | ok | 2.7 |  |  |
| Tut_Inter_Spacecraft_Tracking.script | ok | 7.7 |  |  |
| Tut_Mars_B_Plane_Targeting.script | ok | 2.6 | DefaultDC: converged ×2 |  |
| Tut_Orbit_Estimation_using_DSN_Range_and_Doppler_Data.script | ok | 50.2 |  |  |
| Tut_SimpleOrbitTransfer.script | ok | 1.1 | DC1: converged |  |
| Tut_Simulate_DSN_Range_and_Doppler_Data.script | ok | 1.1 |  |  |
| Tut_Simulate_DSN_Range_and_Doppler_Data_3_weeks.script | ok | 35.5 |  |  |
| Tut_SimulatingAnOrbit.script | ok | 1.1 |  |  |
| Tut_Target_Finite_Burn_to_Raise_Apogee.script | ok | 1.1 | DC1: converged |  |
| Tut_UsingGMATFunctions.script | rechazado |  |  | 'GmatFunction' no está permitido en el servidor (línea 343) |
