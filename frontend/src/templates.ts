// Plantillas de misión: scripts GMAT listos para correr, con unos pocos datos que pide el asistente.
// Solo arman texto; todo cálculo orbital lo hace GMAT al correr. Títulos y etiquetas: es.templates.
// Los scripts van en ASCII (GMAT rechaza cualquier otro carácter, también en comentarios).

export type Param = { key: string; def: number | string; min?: number; max?: number; step?: number; date?: boolean }
export type Values = Record<string, number | string>
export type Template = { id: 'luna' | 'leo' | 'hohmann' | 'track'; file: string; params: Param[]; build: (p: Values) => string }

// Radio ecuatorial terrestre de GMAT (km): altitud -> semieje mayor de una orbita circular.
const R_EARTH = 6378.1363
const sma = (alt: number | string) => (R_EARTH + Number(alt)).toFixed(4)
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "2026-03-20" (input date) -> "20 Mar 2026 00:00:00.000" (UTCGregorian de GMAT). */
export const gregorian = (iso: number | string) => {
  const [y, m, d] = String(iso).split('-')
  return `${d} ${MONTHS[Number(m) - 1]} ${y} 00:00:00.000`
}

const ALT: Param = { key: 'alt', def: 500, min: 200, max: 2000, step: 10 }
const INC: Param = { key: 'inc', def: 51.6, min: 0, max: 180, step: 0.1 }

const luna = (p: Values) => `%  Viaje a la Luna: de una orbita baja terrestre (185 km) a una orbita lunar.
%  1) Apuntado grueso: una sonda de prueba busca como girar la orbita de salida (RAAN, AOP)
%     para que su apogeo mire a la Luna.
%  2) Apuntado fino: la nave ajusta RAAN, AOP y el impulso TLI para pasar a ${p.rp} km del centro de la Luna.
%  3) Insercion (LOI): frena en el periselenio para quedar en orbita lunar casi circular.
%  Al terminar: pestana Solver (convergencia), Resultados (distancias) y 3D con Centro = Luna.

Create Spacecraft Nave;
Nave.DateFormat       = UTCGregorian;
Nave.Epoch            = '${gregorian(p.date)}';
Nave.CoordinateSystem = EarthMJ2000Eq;
Nave.DisplayStateType = Keplerian;
Nave.SMA              = 6563;
Nave.ECC              = 0.001;
Nave.INC              = ${p.inc};
Nave.RAAN             = 0;
Nave.AOP              = 0;
Nave.TA               = 0;
Nave.DryMass          = 850;

%  Sonda de prueba: copia de la nave que hace el apuntado grueso; la nave real no se mueve hasta el fino.
Create Spacecraft Sonda;

Create ForceModel FuerzasTierra;
FuerzasTierra.CentralBody = Earth;
FuerzasTierra.PointMasses = {Earth, Sun, Luna};
FuerzasTierra.Drag        = None;
FuerzasTierra.SRP         = Off;

Create ForceModel FuerzasLuna;
FuerzasLuna.CentralBody = Luna;
FuerzasLuna.PointMasses = {Luna, Earth, Sun};
FuerzasLuna.Drag        = None;
FuerzasLuna.SRP         = Off;

%  Solo la Tierra: para el apuntado grueso, sin riesgo de chocar con la Luna.
Create ForceModel SoloTierra;
SoloTierra.CentralBody = Earth;
SoloTierra.PointMasses = {Earth};
SoloTierra.Drag        = None;
SoloTierra.SRP         = Off;

Create Propagator PropTierra;
PropTierra.FM       = FuerzasTierra;
PropTierra.Type     = RungeKutta89;
PropTierra.Accuracy = 1e-11;
PropTierra.MaxStep  = 86400;

Create Propagator PropLuna;
PropLuna.FM       = FuerzasLuna;
PropLuna.Type     = RungeKutta89;
PropLuna.Accuracy = 1e-11;
PropLuna.MaxStep  = 3600;

Create Propagator PropSimple;
PropSimple.FM       = SoloTierra;
PropSimple.Type     = RungeKutta89;
PropSimple.Accuracy = 1e-11;
PropSimple.MaxStep  = 2700;

%  TLI: impulso de inyeccion translunar. LOI: frenado de insercion en orbita lunar.
Create ImpulsiveBurn TLI;
TLI.CoordinateSystem = Local;
TLI.Origin           = Earth;
TLI.Axes             = VNB;
TLI.Element1         = 3.14;

Create ImpulsiveBurn LOI;
LOI.CoordinateSystem = Local;
LOI.Origin           = Luna;
LOI.Axes             = VNB;
LOI.Element1         = -0.5;

%  Marco que gira con la Luna: el eje X apunta de la Tierra a la Luna.
Create CoordinateSystem TierraLunaRot;
TierraLunaRot.Origin    = Earth;
TierraLunaRot.Axes      = ObjectReferenced;
TierraLunaRot.XAxis     = R;
TierraLunaRot.ZAxis     = N;
TierraLunaRot.Primary   = Earth;
TierraLunaRot.Secondary = Luna;

Create CoordinateSystem LunaInercial;
LunaInercial.Origin = Luna;
LunaInercial.Axes   = BodyInertial;

Create DifferentialCorrector DC;
DC.MaximumIterations = 150;

Create Variable RAAN AOP;

Create XYPlot Distancias;
Distancias.XVariable  = Nave.ElapsedDays;
Distancias.YVariables = {Nave.Earth.RMAG, Nave.Luna.RMAG};

Create ReportFile Resumen;
Resumen.Filename  = 'viaje_luna.txt';
Resumen.Precision = 10;

BeginMissionSequence;
'Copiar la nave a la sonda' Sonda = Nave;
Target 'Apuntado grueso' DC {SolveMode = Solve, ExitMode = SaveAndContinue};
   Vary 'Variar RAAN' DC(Sonda.RAAN = 45, {Perturbation = 0.00001, MaxStep = 5});
   Vary 'Variar AOP' DC(Sonda.AOP = 2.5, {Perturbation = 0.00001, MaxStep = 5});
   Maneuver 'Aplicar TLI' TLI(Sonda);
   'Guardar RAAN' RAAN = Sonda.RAAN;
   'Guardar AOP' AOP = Sonda.AOP;
   Propagate 'Hasta el apogeo' PropSimple(Sonda) {Sonda.Earth.Apoapsis, Sonda.ElapsedDays = 4.5};
   Achieve 'Apogeo hacia la Luna (RA)' DC(Sonda.TierraLunaRot.RA = 0, {Tolerance = 1});
   Achieve 'Apogeo hacia la Luna (DEC)' DC(Sonda.TierraLunaRot.DEC = 0, {Tolerance = 1});
EndTarget;
Target 'Apuntado fino e insercion' DC {SolveMode = Solve, ExitMode = DiscardAndContinue};
   Vary 'Variar RAAN' DC(Nave.RAAN = RAAN, {Perturbation = 0.000001, MaxStep = 2});
   Vary 'Variar AOP' DC(Nave.AOP = AOP, {Perturbation = 0.000001, MaxStep = 2});
   Vary 'Variar TLI' DC(TLI.Element1 = TLI.Element1, {Perturbation = 0.0000001, MaxStep = 0.01});
   Maneuver 'Aplicar TLI' TLI(Nave);
   Propagate 'Viaje a la Luna' PropTierra(Nave) {Nave.Luna.Periapsis, Nave.ElapsedDays = 6, Nave.Luna.RMAG = 1000};
   Achieve 'Radio de periselenio' DC(Nave.Luna.RMAG = ${p.rp}, {Tolerance = 0.1});
   Achieve 'Angulo del vector B' DC(Nave.LunaInercial.BVectorAngle = 75, {Tolerance = 0.1});
   Vary 'Variar LOI' DC(LOI.Element1 = -0.6, {Perturbation = 0.00001, MaxStep = 0.3});
   Maneuver 'Aplicar LOI' LOI(Nave);
   Achieve 'Orbita lunar casi circular' DC(Nave.Luna.ECC = 0.01, {Tolerance = 0.001});
EndTarget;
Propagate 'En orbita lunar' PropLuna(Nave) {Nave.ElapsedDays = ${p.days}};
Report Resumen Nave.ElapsedDays Nave.Luna.SMA Nave.Luna.ECC Nave.Luna.RMAG TLI.Element1 LOI.Element1;
`

const leo = (p: Values) => `%  Orbita LEO circular a ${p.alt} km con arrastre atmosferico y gravedad 4x4.
%  Propaga ${p.days} dia(s); la grafica Altitud muestra como el arrastre baja la orbita.
%  SMA = radio ecuatorial terrestre (${R_EARTH} km) + altitud.

Create Spacecraft Sat;
Sat.DateFormat       = UTCGregorian;
Sat.Epoch            = '01 Jan 2025 12:00:00.000';
Sat.CoordinateSystem = EarthMJ2000Eq;
Sat.DisplayStateType = Keplerian;
Sat.SMA              = ${sma(p.alt)};
Sat.ECC              = 0.0005;
Sat.INC              = ${p.inc};
Sat.RAAN             = 30;
Sat.AOP              = 0;
Sat.TA               = 0;
Sat.DryMass          = 500;
Sat.Cd               = 2.2;
Sat.DragArea         = 10;

Create ForceModel FM;
FM.CentralBody                      = Earth;
FM.PrimaryBodies                    = {Earth};
FM.GravityField.Earth.Degree        = 4;
FM.GravityField.Earth.Order         = 4;
FM.GravityField.Earth.PotentialFile = 'JGM2.cof';
FM.Drag.AtmosphereModel             = JacchiaRoberts;
FM.Drag.HistoricWeatherSource       = 'ConstantFluxAndGeoMag';
FM.Drag.PredictedWeatherSource      = 'ConstantFluxAndGeoMag';
FM.Drag.F107                        = 150;
FM.Drag.F107A                       = 150;
FM.Drag.MagneticIndex               = 3;

Create Propagator Prop;
Prop.FM              = FM;
Prop.Type            = RungeKutta89;
Prop.InitialStepSize = 60;
Prop.Accuracy        = 1e-11;
Prop.MaxStep         = 300;

Create XYPlot Altitud;
Altitud.XVariable  = Sat.ElapsedDays;
Altitud.YVariables = {Sat.Earth.Altitude};

Create ReportFile Resumen;
Resumen.Filename  = 'orbita_leo.txt';
Resumen.Precision = 10;

BeginMissionSequence;
Report Resumen Sat.ElapsedDays Sat.SMA Sat.ECC Sat.Earth.Altitude;
Propagate 'Propagar' Prop(Sat) {Sat.ElapsedDays = ${p.days}};
Report Resumen Sat.ElapsedDays Sat.SMA Sat.ECC Sat.Earth.Altitude;
`

const hohmann = (p: Values) => `%  Transferencia de Hohmann de una orbita circular a ${p.alt} km hasta GEO (radio 42164.17 km).
%  Un Target calcula los dos impulsos: TOI (sale de la orbita baja) y GOI (circulariza en GEO).
%  SMA = radio ecuatorial terrestre (${R_EARTH} km) + altitud. Mira la pestana Solver al terminar.

Create Spacecraft Sat;
Sat.DateFormat       = UTCGregorian;
Sat.Epoch            = '01 Jan 2025 12:00:00.000';
Sat.CoordinateSystem = EarthMJ2000Eq;
Sat.DisplayStateType = Keplerian;
Sat.SMA              = ${sma(p.alt)};
Sat.ECC              = 0;
Sat.INC              = 0;
Sat.RAAN             = 0;
Sat.AOP              = 0;
Sat.TA               = 0;
Sat.DryMass          = 1000;

Create ForceModel FM;
FM.CentralBody = Earth;
FM.PointMasses = {Earth};
FM.Drag        = None;
FM.SRP         = Off;

Create Propagator Prop;
Prop.FM       = FM;
Prop.Type     = RungeKutta89;
Prop.Accuracy = 1e-11;
Prop.MaxStep  = 600;

Create ImpulsiveBurn TOI;
TOI.CoordinateSystem = Local;
TOI.Origin           = Earth;
TOI.Axes             = VNB;

Create ImpulsiveBurn GOI;
GOI.CoordinateSystem = Local;
GOI.Origin           = Earth;
GOI.Axes             = VNB;

Create DifferentialCorrector DC;

Create XYPlot Radio;
Radio.XVariable  = Sat.ElapsedDays;
Radio.YVariables = {Sat.Earth.RMAG};

Create ReportFile Resumen;
Resumen.Filename  = 'hohmann_geo.txt';
Resumen.Precision = 10;

BeginMissionSequence;
Propagate 'Orbita inicial' Prop(Sat) {Sat.ElapsedSecs = 3000};
Target 'Transferencia de Hohmann' DC {SolveMode = Solve, ExitMode = SaveAndContinue};
   Vary 'Variar TOI' DC(TOI.Element1 = 2.4, {Perturbation = 0.0001, MaxStep = 0.2});
   Maneuver 'Aplicar TOI' TOI(Sat);
   Propagate 'Hasta el apogeo' Prop(Sat) {Sat.Apoapsis};
   Achieve 'Radio GEO' DC(Sat.Earth.RMAG = 42164.17, {Tolerance = 0.1});
   Vary 'Variar GOI' DC(GOI.Element1 = 1.4, {Perturbation = 0.0001, MaxStep = 0.2});
   Maneuver 'Aplicar GOI' GOI(Sat);
   Achieve 'Orbita circular' DC(Sat.ECC = 0, {Tolerance = 0.0001});
EndTarget;
Propagate 'Un dia en GEO' Prop(Sat) {Sat.ElapsedDays = 1};
Report Resumen Sat.ElapsedDays Sat.SMA Sat.ECC Sat.Earth.RMAG TOI.Element1 GOI.Element1;
`

const track = (p: Values) => `%  Traza en tierra de un satelite a ${p.alt} km e inclinacion ${p.inc} grados durante ${p.days} dia(s).
%  Al terminar: Resultados > Traza en tierra. El reporte lleva latitud y longitud de cada paso.
%  SMA = radio ecuatorial terrestre (${R_EARTH} km) + altitud.

Create Spacecraft Sat;
Sat.DateFormat       = UTCGregorian;
Sat.Epoch            = '01 Jan 2025 12:00:00.000';
Sat.CoordinateSystem = EarthMJ2000Eq;
Sat.DisplayStateType = Keplerian;
Sat.SMA              = ${sma(p.alt)};
Sat.ECC              = 0.0005;
Sat.INC              = ${p.inc};
Sat.RAAN             = 0;
Sat.AOP              = 0;
Sat.TA               = 0;

Create ForceModel FM;
FM.CentralBody                      = Earth;
FM.PrimaryBodies                    = {Earth};
FM.GravityField.Earth.Degree        = 4;
FM.GravityField.Earth.Order         = 4;
FM.GravityField.Earth.PotentialFile = 'JGM2.cof';
FM.Drag                             = None;
FM.SRP                              = Off;

Create Propagator Prop;
Prop.FM       = FM;
Prop.Type     = RungeKutta89;
Prop.Accuracy = 1e-11;
Prop.MaxStep  = 60;

Create ReportFile Traza;
Traza.Filename  = 'traza.txt';
Traza.Precision = 8;
Traza.Add       = {Sat.ElapsedSecs, Sat.Earth.Latitude, Sat.Earth.Longitude, Sat.Earth.Altitude};

BeginMissionSequence;
Propagate 'Propagar' Prop(Sat) {Sat.ElapsedDays = ${p.days}};
`

export const TEMPLATES: Template[] = [
  {
    id: 'luna', file: 'viaje_luna.script', build: luna,
    params: [
      { key: 'date', def: '2026-03-20', date: true },
      { key: 'rp', def: 5000, min: 2000, max: 20000, step: 100 },
      { key: 'days', def: 3, min: 0.5, max: 15, step: 0.5 },
      // inclinacion minima 28.7: por debajo la orbita no alcanza la declinacion de la Luna y el apuntado no converge
      { key: 'inc', def: 28.7, min: 28.7, max: 60, step: 0.1 },
    ],
  },
  // desde 300 km: mas abajo el arrastre hace reentrar al satelite en pocos dias y GMAT corta la corrida
  { id: 'leo', file: 'orbita_leo.script', build: leo, params: [{ ...ALT, min: 300 }, INC, { key: 'days', def: 1, min: 0.1, max: 30, step: 0.1 }] },
  { id: 'hohmann', file: 'hohmann_geo.script', build: hohmann, params: [ALT] },
  { id: 'track', file: 'traza_en_tierra.script', build: track, params: [ALT, INC, { key: 'days', def: 1, min: 0.1, max: 7, step: 0.1 }] },
]

/** Valores del asistente fuera de rango o vacios (claves de los que fallan). */
export const invalid = (t: Template, p: Values) => t.params.filter((q) => q.date
  ? !/^\d{4}-\d{2}-\d{2}$/.test(String(p[q.key]))
  : !(String(p[q.key]).trim() !== '' && Number(p[q.key]) >= q.min! && Number(p[q.key]) <= q.max!)).map((q) => q.key)
