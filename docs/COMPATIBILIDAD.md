<!-- generado por backend/app/batch.py: no editar la tabla a mano -->
# Compatibilidad de samples

Samples raíz de `GMAT_HOME/samples` (GMAT R2026a) corridos por el camino de la web (`sanitize` + `runner` + ReportFile ocultos). Timeout 300 s.

Regenerar (desde `backend/`, con `GMAT_HOME`): `python -m app.batch` (opciones `--jobs`, `--timeout`).

## Resumen

ok: 74 · rechazado: 8 · error: 1 · timeout: 0 · falta archivo: 2 · plugin: 3 · total: 88

Estados: `ok` terminó sin error; `rechazado` lo para `sanitize` (regla de seguridad, no se corre); `error` el motor no lo cargó o falló; `timeout` pasó el límite; `falta archivo` el motor no encontró un archivo de entrada; `plugin` usa un plugin que el startup file activo deja comentado (no se corre; los plugins activos, como estimación, eventos o formaciones, sí se corren). Solver: estado final de cada solver según los eventos `solver` (`converged`, `failed`, `initial`; `×N` = veces que corrió).

## Límites conocidos (no son bugs del port)

- `rechazado`: `GmatFunction`, `Python.*` e `#Include` están prohibidos en el servidor (`engine/sanitize.py`).
- Rutas de entrada relativas: GMAT las busca primero en la carpeta del script (`GmatFileUtil::FindFile`). En la web el script vive en la carpeta de la corrida, así que `'../samples/SupportFiles/...'` no se encuentra; en escritorio sí, porque el sample se abre desde `samples/`.
- `TrackingFileSet.FileName` es salida del Simulator y entrada del BatchEstimator: `sanitize` lo reescribe a la carpeta de la corrida, así que un estimador que lee un `.gmd` existente no lo encuentra (Tut_Orbit_Estimation...). Dejarlo sin reescribir permitiría escribir fuera de la corrida.
- `plugin`: librerías con su línea `PLUGIN` comentada en el startup file que usa el worker (en R2026a: MarsGRAM, ExternalForceModel, VF13ad, SNOPT, CSALT, entre otras). Activarlas es decisión de despliegue, no del port.
- Optimize con Yukon y Target (Hohmann, Mars B-plane) dan los mismos valores finales que GMAT escritorio: `tests/test_desktop.py` (`pytest -m slow`). VF13ad y fmincon no están en esta instalación.

## Tabla

| Sample | Estado | Tiempo (s) | Solver | Motivo |
|---|---|---|---|---|
| Ex_AnalyticMassProperties.script | ok | 0.8 |  |  |
| Ex_Attitude_Inertial.script | ok | 1.6 |  |  |
| Ex_Attitude_ModifiedRodriguesParameters.script | ok | 1.7 |  |  |
| Ex_Attitude_NadirPointing.script | ok | 1.5 |  |  |
| Ex_Attitude_Spinner.script | ok | 1.6 |  |  |
| Ex_Attitude_VNB.script | ok | 1.8 |  |  |
| Ex_Basic3DModel.script | ok | 4.0 |  |  |
| Ex_CCSDSAEMAttitude.script | ok | 1.0 |  |  |
| Ex_CommandEcho_GEOTransfer.script | ok | 1.8 | DC: converged ×3 |  |
| Ex_ConstellationScript.script | ok | 2.9 |  |  |
| Ex_Contact_Location_Station_Mask.script | falta archivo | 1.0 |  | Asset exception: Error: '../samples/SupportFiles/Ex_Contact_Location_Station_Mask.txt' set to GSFC.ElevationMaskFileName parameter does not exist. |
| Ex_ControlFlow.script | ok | 1.2 |  |  |
| Ex_CSSISpaceWeatherFile.script | ok | 1.3 |  |  |
| Ex_CustomSegmentColors.script | ok | 1.1 | DC: converged |  |
| Ex_DoubleLunarSwingby.script | ok | 1.2 | DC1: converged ×2 |  |
| Ex_DynamicDisplay_QuaternionPropagation.script | rechazado |  |  | 'Python.time' no está permitido en el servidor (línea 315) |
| Ex_EclipseLocation.script | ok | 2.1 |  |  |
| Ex_ElectricPropulsion.script | ok | 1.0 |  |  |
| Ex_EOPFileLocationFromScript.script | ok | 1.0 |  |  |
| Ex_ExternalForceModel.script | plugin |  |  | libExternalForceModel (desactivado en el startup file) |
| Ex_ExternalForceModel_NoAPI.script | plugin |  |  | libExternalForceModel (desactivado en el startup file) |
| Ex_FileInterface.script | ok | 1.0 |  |  |
| Ex_FiniteBurn.script | ok | 1.0 |  |  |
| Ex_FiniteBurnParameters.script | ok | 1.0 |  |  |
| Ex_ForceModel_ExtraShadowBodies.script | ok | 1.0 |  |  |
| Ex_ForceModels.script | ok | 3.3 |  |  |
| Ex_GEOTransfer.script | ok | 1.8 | DC: converged ×3 |  |
| Ex_GivenEpochGoToTheMoon.script | ok | 2.1 | DC1: converged ×2 |  |
| Ex_GMATFunction_Math.script | rechazado |  |  | 'GmatFunction' no está permitido en el servidor (línea 11) |
| Ex_GMATFunction_TargetInsideFunction.script | rechazado |  |  | 'GmatFunction' no está permitido en el servidor (línea 163) |
| Ex_GMATFunction_UsingGlobalObjects.script | rechazado |  |  | 'GmatFunction' no está permitido en el servidor (línea 353) |
| Ex_HighFidelitySRP.script | ok | 1.0 |  |  |
| Ex_HohmannTransfer.script | ok | 1.1 | DC: converged |  |
| Ex_ImprovedTargeterAlgorithms.script | ok | 1.0 | aDC: converged |  |
| Ex_IncludeMacro.script | rechazado |  |  | '#Include' no está permitido en el servidor (línea 12) |
| Ex_Integrators.script | ok | 1.0 |  |  |
| Ex_IntrusionLocator_Mercury_Sun_Transit.script | ok | 1.0 |  |  |
| Ex_IOD.script | rechazado |  |  | 'Python.IODFunctions' no está permitido en el servidor (línea 47) |
| Ex_L2Design.script | ok | 1.0 | DC: converged ×4 |  |
| Ex_LCROSSTrajectory.script | ok | 24.9 |  |  |
| Ex_LEOStationKeeping.script | ok | 19.9 | DC: converged ×2 |  |
| Ex_LibrationPointStationKeeping_ESM.script | ok | 1.8 | DefaultDC: converged ×7 |  |
| Ex_LunarOrbitStationKeeping.script | ok | 24.2 | DefaultDC: converged ×3 |  |
| Ex_LunarTransfer.script | ok | 2.8 | DC1: converged ×2 |  |
| Ex_MarsBPlane.script | ok | 3.9 | DC: converged ×2 |  |
| Ex_MarsExponentialAtmosphere.script | ok | 2.9 |  |  |
| Ex_MarsGRAM2005.script | plugin |  |  | libMarsGRAM (desactivado en el startup file) |
| Ex_MarsOrbit.script | ok | 1.3 |  |  |
| Ex_MathInScript.script | ok | 1.2 |  |  |
| Ex_MMSSingleLunarSwingby.script | ok | 1.0 | DC1: converged ×2 |  |
| Ex_MultibodySphericalHarmonicGravity.script | ok | 14.4 |  |  |
| Ex_NadirPointingAttitude.script | ok | 1.0 |  |  |
| Ex_NewFunctions_GetEphemStates.script | ok | 0.9 |  |  |
| Ex_NewMathFunctions.script | ok | 1.0 |  |  |
| Ex_NewOrbitStateReps.script | ok | 1.0 |  |  |
| Ex_NewStringFunctions.script | ok | 0.8 |  |  |
| Ex_OEMPropagation.script | ok | 1.2 |  |  |
| Ex_PlanetographicRegion.script | ok | 1.2 |  |  |
| Ex_PrecessingSpinnerAttitude.script | ok | 1.0 |  |  |
| Ex_Propagate_Covariance.script | ok | 1.8 |  |  |
| Ex_Propagate_ThrustHistoryFile.script | falta archivo | 1.1 |  | Interface Exception Thrown: Failed to open the thrust history file ../samples/SupportFiles/Thrust_Sim.thf; is the file in the search path? |
| Ex_PythonInterface.script | rechazado |  |  | 'Python.ArrayFunctions' no está permitido en el servidor (línea 42) |
| Ex_SafetyEllipse.script | ok | 3.3 |  |  |
| Ex_SchattenFile_NominalCycle_Mean.script | ok | 1.8 |  |  |
| Ex_SolverConvergenceParameters.script | ok | 1.0 | aDC: converged |  |
| Ex_SPICECoordinateAxes.script | ok | 1.0 |  |  |
| Ex_SPICEOrbitAndAttitudePropagation.script | ok | 2.3 |  |  |
| Ex_StationContactLocator.script | ok | 1.6 |  |  |
| Ex_STKEphemOutput.script | ok | 1.0 |  |  |
| Ex_STKEphemPropagation.script | ok | 1.2 |  |  |
| Ex_TargetFiniteBurn_CenterPeriapsisDuration.script | ok | 1.2 | DC1: converged |  |
| Ex_TargetFiniteBurn_CenterPeriapsisTA.script | ok | 1.2 | DC1: converged |  |
| Ex_TargetStatusWindow.script | ok | 1.9 | DC: converged ×3 |  |
| Ex_ThrusterWithMultipleTanks.script | ok | 1.0 |  |  |
| Ex_TLE_Propagation.script | ok | 1.0 |  |  |
| Ex_WriteCommand.script | ok | 1.1 |  |  |
| Ex_Yukon_AlgebraicOptimization.script | ok | 0.8 | Yukon1: converged |  |
| Ex_Yukon_MarsLaunchWindowAnalysis.script | ok | 21.3 | Yukon1: converged ×20 |  |
| Tut_ElectricPropulsionModelling.script | ok | 2.6 |  |  |
| Tut_Inter_Spacecraft_Tracking.script | ok | 8.1 |  |  |
| Tut_Mars_B_Plane_Targeting.script | ok | 2.8 | DefaultDC: converged ×2 |  |
| Tut_Orbit_Estimation_using_DSN_Range_and_Doppler_Data.script | error | 0.9 |  | Measurement Exception Thrown: GMATInternal Data File C:/Users/Yaxon/AppData/Local/Temp/gmat-web-runs/run-ml4_oz7f/Simulate DSN Range and Doppler Data 3 weeks.gm |
| Tut_SimpleOrbitTransfer.script | ok | 1.1 | DC1: converged |  |
| Tut_Simulate_DSN_Range_and_Doppler_Data.script | ok | 1.1 |  |  |
| Tut_Simulate_DSN_Range_and_Doppler_Data_3_weeks.script | ok | 37.4 |  |  |
| Tut_SimulatingAnOrbit.script | ok | 1.1 |  |  |
| Tut_Target_Finite_Burn_to_Raise_Apogee.script | ok | 1.1 | DC1: converged |  |
| Tut_UsingGMATFunctions.script | rechazado |  |  | 'GmatFunction' no está permitido en el servidor (línea 343) |
