<!-- generado por backend/app/batch.py: no editar la tabla a mano -->
# Compatibilidad de samples

Samples de `GMAT_HOME/samples` y sus subcarpetas (GMAT R2026a) corridos por el camino de la web (`sanitize` + `runner` + ReportFile ocultos). Timeout 300 s.

Regenerar (desde `backend/`, con `GMAT_HOME`): `python -m app.batch` (opciones `--jobs`, `--timeout`).

## Resumen

- **Todos:** ok: 118 · rechazado: 12 · error: 0 · timeout: 0 · falta archivo: 4 · plugin: 28 · total: 162
- `raíz`: ok: 77 · rechazado: 8 · error: 0 · timeout: 0 · falta archivo: 0 · plugin: 3 · total: 88
- `Navigation`: ok: 19 · rechazado: 1 · error: 0 · timeout: 0 · falta archivo: 3 · plugin: 0 · total: 23
- `NeedMatlab`: ok: 0 · rechazado: 2 · error: 0 · timeout: 0 · falta archivo: 0 · plugin: 0 · total: 2
- `NeedOpenFramesInterface`: ok: 21 · rechazado: 0 · error: 0 · timeout: 0 · falta archivo: 1 · plugin: 0 · total: 22
- `NeedSNOPT`: ok: 0 · rechazado: 0 · error: 0 · timeout: 0 · falta archivo: 0 · plugin: 3 · total: 3
- `NeedVF13ad`: ok: 0 · rechazado: 0 · error: 0 · timeout: 0 · falta archivo: 0 · plugin: 13 · total: 13
- `OptimalControl`: ok: 0 · rechazado: 0 · error: 0 · timeout: 0 · falta archivo: 0 · plugin: 9 · total: 9
- `SupportFiles`: ok: 1 · rechazado: 1 · error: 0 · timeout: 0 · falta archivo: 0 · plugin: 0 · total: 2

Estados: `ok` terminó sin error; `rechazado` lo para `sanitize` (regla de seguridad, no se corre); `error` el motor no lo cargó o falló; `timeout` pasó el límite; `falta archivo` el motor no encontró un archivo de entrada; `plugin` usa un plugin que el startup file activo deja comentado (no se corre; los plugins activos, como estimación, eventos o formaciones, sí se corren). Solver: estado final de cada solver según los eventos `solver` (`converged`, `failed`, `initial`; `×N` = veces que corrió).

## Límites conocidos (no son bugs del port)

- `rechazado`: `GmatFunction`, `Python.*` e `#Include` están prohibidos en el servidor (`engine/sanitize.py`).
- Rutas de entrada relativas: GMAT las busca en la carpeta del script (`GmatFileUtil::FindFile`), que en la web es la corrida; `sanitize` pasa a absoluta la que existe desde `GMAT_HOME/samples` (`'../samples/SupportFiles/...'`). Una ruta relativa a otra carpeta no se encuentra.
- Samples de subcarpetas con rutas relativas a su propia carpeta (`../SupportFiles/...`, `../../data/...`, `.\OFI_Earth.earth`): `sanitize` las resuelve desde `GMAT_HOME/samples`, no desde la subcarpeta, y salen `falta archivo` (4 en R2026a).
- `TrackingFileSet.FileName`: con un `Simulator` en el script es salida y va a la corrida; sin él es entrada (`.gmd` que lee el estimador) y no se reescribe. Un script que simula y además lee otro `.gmd` existente no lo encuentra.
- `plugin`: librerías con su línea `PLUGIN` comentada en el startup file que usa el worker (en R2026a: MarsGRAM, ExternalForceModel, VF13ad, SNOPT, CSALT, entre otras). Activarlas es decisión de despliegue, no del port.
- Optimize con Yukon y Target (Hohmann, Mars B-plane) dan los mismos valores finales que GMAT escritorio: `tests/test_desktop.py` (`pytest -m slow`). VF13ad y fmincon no están en esta instalación.

## Tabla

| Sample | Estado | Tiempo (s) | Solver | Motivo |
|---|---|---|---|---|
| Ex_AnalyticMassProperties.script | ok | 0.9 |  |  |
| Ex_Attitude_Inertial.script | ok | 1.7 |  |  |
| Ex_Attitude_ModifiedRodriguesParameters.script | ok | 1.7 |  |  |
| Ex_Attitude_NadirPointing.script | ok | 1.8 |  |  |
| Ex_Attitude_Spinner.script | ok | 1.8 |  |  |
| Ex_Attitude_VNB.script | ok | 2.0 |  |  |
| Ex_Basic3DModel.script | ok | 4.2 |  |  |
| Ex_CCSDSAEMAttitude.script | ok | 0.9 |  |  |
| Ex_CommandEcho_GEOTransfer.script | ok | 1.9 | DC: converged ×3 |  |
| Ex_ConstellationScript.script | ok | 3.2 |  |  |
| Ex_Contact_Location_Station_Mask.script | ok | 5.2 |  |  |
| Ex_ControlFlow.script | ok | 1.3 |  |  |
| Ex_CSSISpaceWeatherFile.script | ok | 1.3 |  |  |
| Ex_CustomSegmentColors.script | ok | 1.1 | DC: converged |  |
| Ex_DoubleLunarSwingby.script | ok | 1.3 | DC1: converged ×2 |  |
| Ex_DynamicDisplay_QuaternionPropagation.script | rechazado |  |  | 'Python.time' no está permitido en el servidor (línea 315) |
| Ex_EclipseLocation.script | ok | 2.3 |  |  |
| Ex_ElectricPropulsion.script | ok | 1.1 |  |  |
| Ex_EOPFileLocationFromScript.script | ok | 1.1 |  |  |
| Ex_ExternalForceModel.script | plugin |  |  | libExternalForceModel (desactivado en el startup file) |
| Ex_ExternalForceModel_NoAPI.script | plugin |  |  | libExternalForceModel (desactivado en el startup file) |
| Ex_FileInterface.script | ok | 1.1 |  |  |
| Ex_FiniteBurn.script | ok | 1.1 |  |  |
| Ex_FiniteBurnParameters.script | ok | 1.1 |  |  |
| Ex_ForceModel_ExtraShadowBodies.script | ok | 1.1 |  |  |
| Ex_ForceModels.script | ok | 3.3 |  |  |
| Ex_GEOTransfer.script | ok | 1.8 | DC: converged ×3 |  |
| Ex_GivenEpochGoToTheMoon.script | ok | 2.2 | DC1: converged ×2 |  |
| Ex_GMATFunction_Math.script | rechazado |  |  | 'GmatFunction' no está permitido en el servidor (línea 11) |
| Ex_GMATFunction_TargetInsideFunction.script | rechazado |  |  | 'GmatFunction' no está permitido en el servidor (línea 163) |
| Ex_GMATFunction_UsingGlobalObjects.script | rechazado |  |  | 'GmatFunction' no está permitido en el servidor (línea 353) |
| Ex_HighFidelitySRP.script | ok | 1.1 |  |  |
| Ex_HohmannTransfer.script | ok | 1.1 | DC: converged |  |
| Ex_ImprovedTargeterAlgorithms.script | ok | 1.1 | aDC: converged |  |
| Ex_IncludeMacro.script | rechazado |  |  | '#Include' no está permitido en el servidor (línea 12) |
| Ex_Integrators.script | ok | 1.1 |  |  |
| Ex_IntrusionLocator_Mercury_Sun_Transit.script | ok | 1.1 |  |  |
| Ex_IOD.script | rechazado |  |  | 'Python.IODFunctions' no está permitido en el servidor (línea 47) |
| Ex_L2Design.script | ok | 1.1 | DC: converged ×4 |  |
| Ex_LCROSSTrajectory.script | ok | 29.0 |  |  |
| Ex_LEOStationKeeping.script | ok | 21.2 | DC: converged ×2 |  |
| Ex_LibrationPointStationKeeping_ESM.script | ok | 2.1 | DefaultDC: converged ×7 |  |
| Ex_LunarOrbitStationKeeping.script | ok | 26.3 | DefaultDC: converged ×3 |  |
| Ex_LunarTransfer.script | ok | 2.9 | DC1: converged ×2 |  |
| Ex_MarsBPlane.script | ok | 4.0 | DC: converged ×2 |  |
| Ex_MarsExponentialAtmosphere.script | ok | 3.1 |  |  |
| Ex_MarsGRAM2005.script | plugin |  |  | libMarsGRAM (desactivado en el startup file) |
| Ex_MarsOrbit.script | ok | 1.3 |  |  |
| Ex_MathInScript.script | ok | 1.5 |  |  |
| Ex_MMSSingleLunarSwingby.script | ok | 1.3 | DC1: converged ×2 |  |
| Ex_MultibodySphericalHarmonicGravity.script | ok | 16.5 |  |  |
| Ex_NadirPointingAttitude.script | ok | 1.3 |  |  |
| Ex_NewFunctions_GetEphemStates.script | ok | 1.1 |  |  |
| Ex_NewMathFunctions.script | ok | 1.1 |  |  |
| Ex_NewOrbitStateReps.script | ok | 1.1 |  |  |
| Ex_NewStringFunctions.script | ok | 1.1 |  |  |
| Ex_OEMPropagation.script | ok | 1.5 |  |  |
| Ex_PlanetographicRegion.script | ok | 1.3 |  |  |
| Ex_PrecessingSpinnerAttitude.script | ok | 1.1 |  |  |
| Ex_Propagate_Covariance.script | ok | 1.9 |  |  |
| Ex_Propagate_ThrustHistoryFile.script | ok | 1.3 |  |  |
| Ex_PythonInterface.script | rechazado |  |  | 'Python.ArrayFunctions' no está permitido en el servidor (línea 42) |
| Ex_SafetyEllipse.script | ok | 4.0 |  |  |
| Ex_SchattenFile_NominalCycle_Mean.script | ok | 1.9 |  |  |
| Ex_SolverConvergenceParameters.script | ok | 1.3 | aDC: converged |  |
| Ex_SPICECoordinateAxes.script | ok | 1.3 |  |  |
| Ex_SPICEOrbitAndAttitudePropagation.script | ok | 2.8 |  |  |
| Ex_StationContactLocator.script | ok | 2.2 |  |  |
| Ex_STKEphemOutput.script | ok | 1.1 |  |  |
| Ex_STKEphemPropagation.script | ok | 1.3 |  |  |
| Ex_TargetFiniteBurn_CenterPeriapsisDuration.script | ok | 1.3 | DC1: converged |  |
| Ex_TargetFiniteBurn_CenterPeriapsisTA.script | ok | 1.6 | DC1: converged |  |
| Ex_TargetStatusWindow.script | ok | 2.0 | DC: converged ×3 |  |
| Ex_ThrusterWithMultipleTanks.script | ok | 1.1 |  |  |
| Ex_TLE_Propagation.script | ok | 1.1 |  |  |
| Ex_WriteCommand.script | ok | 1.0 |  |  |
| Ex_Yukon_AlgebraicOptimization.script | ok | 1.2 | Yukon1: converged |  |
| Ex_Yukon_MarsLaunchWindowAnalysis.script | ok | 25.3 | Yukon1: converged ×20 |  |
| Navigation/Ex_CompareEphemeris.script | rechazado |  |  | '#Include' no está permitido en el servidor (línea 57) |
| Navigation/Ex_Estimate_AngleData.script | ok | 11.5 |  |  |
| Navigation/Ex_Estimate_BRTSTracking.script | ok | 22.8 |  |  |
| Navigation/Ex_Estimate_NPlateSRP_AreaCoefficient.script | ok | 61.4 |  |  |
| Navigation/Ex_Estimate_RangeRangeRate.script | ok | 54.1 |  |  |
| Navigation/Ex_Estimate_RangeSkin.script | ok | 6.4 |  |  |
| Navigation/Ex_Estimate_SPADDragScaleFactor.script | ok | 207.5 |  |  |
| Navigation/Ex_Estimate_SPADSRPScaleFactor.script | ok | 41.0 |  |  |
| Navigation/Ex_Estimate_TDRSAndUser.script | ok | 197.2 |  |  |
| Navigation/Ex_Estimate_TDRSOneWayReturnDoppler.script | ok | 82.5 |  |  |
| Navigation/Ex_Estimate_TDRSUserTracking.script | ok | 156.6 |  |  |
| Navigation/Ex_Estimate_ThrustAngles.script | falta archivo | 1.1 |  | Interface Exception Thrown: Failed to open the thrust history file ../SupportFiles/Thrust_Est.thf; is the file in the search path? |
| Navigation/Ex_Estimate_ThrustScaleFactor.script | falta archivo | 1.1 |  | Interface Exception Thrown: Failed to open the thrust history file ../SupportFiles/Thrust_Est.thf; is the file in the search path? |
| Navigation/Ex_Estimate_With_Initial_OrbitErrorCovariance.script | ok | 8.0 |  |  |
| Navigation/Ex_FilterSmoother_GpsPosVec.script | ok | 6.3 | EKF: sin cierre, FPS: sin cierre |  |
| Navigation/Ex_MultiSpacecraft_Simultaneous_BatchEstimation.script | ok | 44.5 |  |  |
| Navigation/Ex_OEM_EphemerisCompare.script | falta archivo | 1.3 |  | GmatBase Exception Thrown: Error: CCSDS ephemeris file "../../data/vehicle/ephem/ccsds/DemoLEO-1.oem" does not exist. |
| Navigation/Ex_Second_Level_Data_Editing.script | ok | 6.0 |  |  |
| Navigation/Ex_SGP4ToHighFidelity.script | ok | 2.3 |  |  |
| Navigation/Ex_Simulate_And_Estimate_OEMPropagator.script | ok | 29.2 |  |  |
| Navigation/Ex_Simulate_and_Process_GpsPosVec_data.script | ok | 3.1 |  |  |
| Navigation/Ex_Simulate_and_Process_Range_and_RangeRate_data.script | ok | 24.0 |  |  |
| Navigation/Simulate_DSN_Range_then_Estimate_CartesianState_and_Cr.script | ok | 26.4 |  |  |
| NeedMatlab/Ex_CallMatlabFunctions.script | rechazado |  |  | 'MatlabFunction' no está permitido en el servidor (línea 31) |
| NeedMatlab/Ex_MatlabEnv.script | rechazado |  |  | 'MatlabFunction' no está permitido en el servidor (línea 9) |
| NeedOpenFramesInterface/Ex_OFI_Attitude_Inertial.script | ok | 2.1 |  |  |
| NeedOpenFramesInterface/Ex_OFI_Attitude_NadirPointing.script | ok | 2.1 |  |  |
| NeedOpenFramesInterface/Ex_OFI_ConstellationScript.script | ok | 3.6 |  |  |
| NeedOpenFramesInterface/Ex_OFI_CustomSegmentColors.script | ok | 1.3 | DC: converged |  |
| NeedOpenFramesInterface/Ex_OFI_DoubleLunarSwingby.script | ok | 1.5 | DC1: converged ×2 |  |
| NeedOpenFramesInterface/Ex_OFI_ElectricPropulsion.script | ok | 1.3 |  |  |
| NeedOpenFramesInterface/Ex_OFI_FieldOfView.script | ok | 2.4 |  |  |
| NeedOpenFramesInterface/Ex_OFI_FiniteBurn.script | ok | 1.3 |  |  |
| NeedOpenFramesInterface/Ex_OFI_GEOTransfer.script | ok | 2.2 | DC: converged ×3 |  |
| NeedOpenFramesInterface/Ex_OFI_GivenEpochGoToTheMoon.script | ok | 3.7 | DC1: converged ×2 |  |
| NeedOpenFramesInterface/Ex_OFI_HiFiEarthMoon.script | falta archivo | 1.1 |  | SolarSystem exception: Cannot open input '.\OFI_Earth.earth' 3d model file in line: |
| NeedOpenFramesInterface/Ex_OFI_HohmannTransfer.script | ok | 1.3 | DC: converged |  |
| NeedOpenFramesInterface/Ex_OFI_LCROSSTrajectory.script | ok | 32.9 |  |  |
| NeedOpenFramesInterface/Ex_OFI_LibrationPointStationKeeping_ESM.script | ok | 2.4 | DefaultDC: converged ×7 |  |
| NeedOpenFramesInterface/Ex_OFI_LunarTransfer.script | ok | 3.5 | DC1: converged ×2 |  |
| NeedOpenFramesInterface/Ex_OFI_MarsOrbit.script | ok | 1.5 |  |  |
| NeedOpenFramesInterface/Ex_OFI_MMSSingleLunarSwingby.script | ok | 1.3 | DC1: converged ×2 |  |
| NeedOpenFramesInterface/Ex_OFI_RealTimeMOC.script | ok | 9.9 |  |  |
| NeedOpenFramesInterface/Ex_OFI_SafetyEllipse.script | ok | 4.2 |  |  |
| NeedOpenFramesInterface/Ex_OFI_SPICEOrbitAndAttitudePropagation.script | ok | 2.7 |  |  |
| NeedOpenFramesInterface/Ex_OFI_VR_2017SolarEclipse.script | ok | 1.1 |  |  |
| NeedOpenFramesInterface/Ex_OFI_Yukon_MarsLaunchWindowAnalysis.script | ok | 27.4 | Yukon1: converged ×20 |  |
| NeedSNOPT/Ex_AlgebraicOptimization.script | plugin |  |  | libSNOptimizer (desactivado en el startup file) |
| NeedSNOPT/Ex_MinFuelLunarTransfer.script | plugin |  |  | libSNOptimizer (desactivado en el startup file) |
| NeedSNOPT/Ex_OptFiniteBurn.script | plugin |  |  | libSNOptimizer (desactivado en el startup file) |
| NeedVF13ad/Ex_AlgebraicOptimization.script | plugin |  |  | libVF13Optimizer (desactivado en el startup file) |
| NeedVF13ad/Ex_LunarCubeSatWithElectricPropulsion.script | plugin |  |  | libVF13Optimizer (desactivado en el startup file) |
| NeedVF13ad/Ex_MarsLaunchWindowAnalysis.script | plugin |  |  | libVF13Optimizer (desactivado en el startup file) |
| NeedVF13ad/Ex_MarsPatchConic.script | plugin |  |  | libVF13Optimizer (desactivado en el startup file) |
| NeedVF13ad/Ex_MinFuelLunarTransfer.script | plugin |  |  | libVF13Optimizer (desactivado en el startup file) |
| NeedVF13ad/Ex_MonitoredLunarTransfer.script | plugin |  |  | libVF13Optimizer (desactivado en el startup file) |
| NeedVF13ad/Ex_OptimalLCROSSTrajectory.script | plugin |  |  | libVF13Optimizer (desactivado en el startup file) |
| NeedVF13ad/Ex_OptimalLunarApsidesRotation_2Burn.script | plugin |  |  | libVF13Optimizer (desactivado en el startup file) |
| NeedVF13ad/Tut_MultipleShootingTutorial_Step1.script | plugin |  |  | libVF13Optimizer (desactivado en el startup file) |
| NeedVF13ad/Tut_MultipleShootingTutorial_Step2.script | plugin |  |  | libVF13Optimizer (desactivado en el startup file) |
| NeedVF13ad/Tut_MultipleShootingTutorial_Step3.script | plugin |  |  | libVF13Optimizer (desactivado en el startup file) |
| NeedVF13ad/Tut_MultipleShootingTutorial_Step4.script | plugin |  |  | libVF13Optimizer (desactivado en el startup file) |
| NeedVF13ad/Tut_MultipleShootingTutorial_Step5.script | plugin |  |  | libVF13Optimizer (desactivado en el startup file) |
| OptimalControl/Ex_CelestialBodyRendezvous_Mars.script | plugin |  |  | libCsaltInterface (desactivado en el startup file) |
| OptimalControl/Ex_EarthToMarsSOI_C3Eq0_CSALTTutorial.script | plugin |  |  | libCsaltInterface (desactivado en el startup file) |
| OptimalControl/Ex_EMTGSpacecraft_SCOpt_BusPowerType0.script | plugin |  |  | libCsaltInterface (desactivado en el startup file) |
| OptimalControl/Ex_EMTGSpacecraft_SCOpt_PowerSupplyCurve1.script | plugin |  |  | libCsaltInterface (desactivado en el startup file) |
| OptimalControl/Ex_EMTGSpacecraft_SCOpt_ThrustType1.script | plugin |  |  | libCsaltInterface (desactivado en el startup file) |
| OptimalControl/Ex_IntegratedFlyby_MarsFlyby.script | plugin |  |  | libCsaltInterface (desactivado en el startup file) |
| OptimalControl/Ex_OCPropTest_GEO_4x4.script | plugin |  |  | libCsaltInterface (desactivado en el startup file) |
| OptimalControl/Ex_PCLaunch_ConstrainedC3AndDLA_EarthLaunch_EarthOrigin.script | plugin |  |  | libCsaltInterface (desactivado en el startup file) |
| OptimalControl/Ex_Phase_Type_ImplicitRKOrder6.script | plugin |  |  | libCsaltInterface (desactivado en el startup file) |
| SupportFiles/Ex_EphemerisCompareGeneric.script | rechazado |  |  | 'GmatFunction' no está permitido en el servidor (línea 70) |
| SupportFiles/Ex_IncludeFile.script | ok | 1.1 |  |  |
| Tut_ElectricPropulsionModelling.script | ok | 3.0 |  |  |
| Tut_Inter_Spacecraft_Tracking.script | ok | 10.0 |  |  |
| Tut_Mars_B_Plane_Targeting.script | ok | 3.5 | DefaultDC: converged ×2 |  |
| Tut_Orbit_Estimation_using_DSN_Range_and_Doppler_Data.script | ok | 59.2 |  |  |
| Tut_SimpleOrbitTransfer.script | ok | 1.3 | DC1: converged |  |
| Tut_Simulate_DSN_Range_and_Doppler_Data.script | ok | 1.3 |  |  |
| Tut_Simulate_DSN_Range_and_Doppler_Data_3_weeks.script | ok | 41.9 |  |  |
| Tut_SimulatingAnOrbit.script | ok | 1.1 |  |  |
| Tut_Target_Finite_Burn_to_Raise_Apogee.script | ok | 1.4 | DC1: converged |  |
| Tut_UsingGMATFunctions.script | rechazado |  |  | 'GmatFunction' no está permitido en el servidor (línea 343) |
