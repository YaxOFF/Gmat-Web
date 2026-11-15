// Monaco sin los lenguajes que trae de serie: solo el núcleo + el lenguaje GMAT.
import 'monaco-editor/features/register.all'
import * as monaco from 'monaco-editor/editor'
import EditorWorker from 'monaco-editor/editor/editor.worker?worker'

self.MonacoEnvironment = { getWorker: () => new EditorWorker() }

// Comandos de src/base/command de GMAT y tipos de recurso más usados.
const keywords = [
  'GMAT', 'Create', 'Global', 'BeginMissionSequence', 'BeginScript', 'EndScript', 'Achieve', 'BeginFiniteBurn',
  'EndFiniteBurn', 'ClearPlot', 'Else', 'ElseIf', 'EndFor', 'EndIf', 'EndOptimize', 'EndTarget', 'EndWhile',
  'FindEvents', 'For', 'If', 'Maneuver', 'MarkPoint', 'Minimize', 'NonlinearConstraint', 'Optimize', 'PenDown',
  'PenUp', 'Propagate', 'Report', 'RunSimulator', 'RunEstimator', 'Stop', 'Target', 'Toggle',
  'UpdateDynamicData', 'Vary', 'While', 'Write', 'BeginFunction', 'EndFunction',
]
const types = [
  'Spacecraft', 'Formation', 'ForceModel', 'Propagator', 'ImpulsiveBurn', 'FiniteBurn', 'ChemicalTank',
  'ChemicalThruster', 'ElectricTank', 'ElectricThruster', 'SolarPowerSystem', 'NuclearPowerSystem',
  'CoordinateSystem', 'LibrationPoint', 'Barycenter', 'GroundStation', 'DifferentialCorrector', 'Yukon',
  'FminconOptimizer', 'SNOPT', 'VF13ad', 'Variable', 'Array', 'String', 'ReportFile', 'XYPlot', 'OrbitView',
  'GroundTrackPlot', 'EphemerisFile', 'DynamicDataDisplay', 'ContactLocator', 'EclipseLocator',
  'IntrusionLocator', 'PlanetographicRegion', 'FileInterface', 'ThrustHistoryFile', 'ThrustSegment',
  'Antenna', 'Transmitter', 'Receiver', 'Transponder', 'ErrorModel', 'TrackingFileSet', 'Simulator',
  'BatchEstimator', 'ExtendedKalmanFilter', 'ProcessNoiseModel', 'Imager', 'ConicalFOV', 'CustomFOV',
  'RectangularFOV', 'OpenFramesInterface', 'OpenFramesView', 'OpenFramesVector', 'SolarSystem',
]
const constants = ['true', 'false', 'On', 'Off']

monaco.languages.register({ id: 'gmat', extensions: ['.script', '.gmf'] })
monaco.languages.setLanguageConfiguration('gmat', {
  comments: { lineComment: '%' },
  brackets: [['{', '}'], ['[', ']'], ['(', ')']],
  autoClosingPairs: [{ open: '{', close: '}' }, { open: '[', close: ']' }, { open: '(', close: ')' },
    { open: "'", close: "'" }],
})
monaco.languages.setMonarchTokensProvider('gmat', {
  keywords, types, constants,
  tokenizer: {
    root: [
      [/%.*$/, 'comment'],
      [/'[^']*'/, 'string'],
      [/\d+(\.\d+)?([eE][-+]?\d+)?/, 'number'],
      [/[A-Za-z_]\w*/, {
        cases: { '@keywords': 'keyword', '@types': 'type', '@constants': 'constant', '@default': 'identifier' },
      }],
    ],
  },
})

export { monaco }
export const editorRef: { current: monaco.editor.IStandaloneCodeEditor | null } = { current: null }

export function revealLine(line: number) {
  const ed = editorRef.current
  if (!ed) return
  ed.revealLineInCenter(line)
  ed.setSelection(new monaco.Selection(line, 1, line, ed.getModel()?.getLineMaxColumn(line) ?? 1))
  ed.focus()
}

/** Deshacer/rehacer del documento: el historial es el de Monaco, que también recibe los cambios de formularios. */
export const history = (what: 'undo' | 'redo') => editorRef.current?.trigger('app', what, null)
