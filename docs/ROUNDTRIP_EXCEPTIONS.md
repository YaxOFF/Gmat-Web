# Script ↔ model round-trip exceptions

Test: `backend/tests/test_script.py`.

- `test_textual_roundtrip`: `parse(serialize(parse(x))) == parse(x)` on the 162 samples in `GMAT_HOME/samples`. All of them pass.
- `test_engine_roundtrip`: `x` and `serialize(parse(x))` (both after `sanitize`) are loaded into gmatpy (`worker.snapshot`, without running) and GMAT's canonical text (`GetGeneratingString(NO_COMMENTS)`) of each object and each top-level command is compared. Empty lines, comments, the `GMAT` prefix and `NAIFId`/`NAIFIdReferenceFrame` are ignored (the engine assigns them according to creation order).

## xfail (real difference)

| Sample | Reason |
|---|---|
| `Navigation/Simulate_DSN_Range_then_Estimate_CartesianState_and_Cr.script` | Object copy `SimSatCopy = SimSat` interleaved between assignments to `SimSat`. The model groups fields by resource and the copy (which goes to `raw`) ends up after all of them, so it copies a different state (`Id`). |

## skip (cannot be compared with the engine)

Rejected by `sanitize` (12): GMAT/MATLAB/Python functions and `#Include`
(`Ex_GMATFunction_*`, `Tut_UsingGMATFunctions`, `Ex_IncludeMacro`, `NeedMatlab/*`, `Ex_PythonInterface`, `Ex_IOD`, `Navigation/Ex_CompareEphemeris`...).

The original does not load with the GMAT API (34): plugins missing from the API (SNOPT, VF13ad, CSALT/EMTG, OpenFrames, MarsGRAM), external forces or support files. Folders `NeedSNOPT/`, `NeedVF13ad/`, `OptimalControl/` and some individual ones (`Ex_Contact_Location_Station_Mask`, `Ex_DynamicDisplay_QuaternionPropagation`, `Ex_ElectricPropulsion`, `Ex_ExternalForceModel*`, `Ex_ForceModel_ExtraShadowBodies`, `Ex_MarsGRAM2005`, `SupportFiles/Ex_EphemerisCompareGeneric`, `Ex_OFI_FieldOfView`, `Ex_OFI_HiFiEarthMoon`, `Ex_OFI_RealTimeMOC`).

These 46 do pass the textual test.

## Known limits of the model

- Order is grouped by resource: whatever goes to `raw` (assignments to bodies like `Earth.*`/`SolarSystem.*`, `x = 3`, `A(1,1) = …`, copies `A = B`, repeated fields, values that are not understood) is written after all the resources.
- Inline comments become their own lines before the resource/command; blank lines are not preserved.
- A quoted string that is an identifier (`'SatId'`) is written without quotes (GMAT accepts it all the same).
