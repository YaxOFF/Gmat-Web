import { useEffect, useRef } from 'react'
import { useApp } from '../store'
import { editorRef, monaco } from './gmat'

const dark = window.matchMedia('(prefers-color-scheme: dark)')

export default function ScriptEditor() {
  const host = useRef<HTMLDivElement>(null)
  const rev = useApp((st) => st.doc.rev)
  const logs = useApp((st) => st.logs)
  const issues = useApp((st) => st.issues)
  const loaded = useRef(useApp.getState().doc.load)

  useEffect(() => {
    const ed = monaco.editor.create(host.current!, {
      value: useApp.getState().doc.text,
      language: 'gmat',
      theme: dark.matches ? 'vs-dark' : 'vs',
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 13,
    })
    editorRef.current = ed
    const sub = ed.onDidChangeModelContent(() => {
      monaco.editor.setModelMarkers(ed.getModel()!, 'gmat', [])  // los errores eran del texto anterior
      useApp.getState().editText(ed.getValue())
    })
    const onScheme = () => monaco.editor.setTheme(dark.matches ? 'vs-dark' : 'vs')
    dark.addEventListener('change', onScheme)
    return () => {
      sub.dispose()
      dark.removeEventListener('change', onScheme)
      editorRef.current = null
      ed.dispose()
    }
  }, [])

  // Texto cambiado desde fuera. Otro documento (Nuevo, Abrir, Ejemplo, Plantilla): se reemplaza y el historial
  // empieza de cero. Cambio de formulario o árbol: entra como una edición más, así Deshacer también lo revierte.
  useEffect(() => {
    const ed = editorRef.current
    const { text, load } = useApp.getState().doc
    if (!ed || ed.getValue() === text) return  // los marcadores se limpian vía onDidChangeModelContent
    if (load !== loaded.current) {
      loaded.current = load
      return ed.setValue(text)
    }
    ed.pushUndoStop()
    ed.executeEdits('model', [{ range: ed.getModel()!.getFullModelRange(), text }])
    ed.pushUndoStop()
  }, [rev])

  // Errores/avisos con línea (validar o correr) como marcadores en el margen.
  useEffect(() => {
    const model = editorRef.current?.getModel()
    if (!model) return
    // los avisos de la validación (mensaje en claro) tapan la línea citada del log en esa misma línea
    const byLine = new Map<number, { level: string; text: string }>()
    for (const l of [...logs, ...issues]) if (l.line && l.line <= model.getLineCount()) byLine.set(l.line, l)
    monaco.editor.setModelMarkers(model, 'gmat', [...byLine].map(([line, l]) => ({
      severity: l.level === 'warning' ? monaco.MarkerSeverity.Warning : monaco.MarkerSeverity.Error,
      message: l.text, startLineNumber: line, endLineNumber: line,
      startColumn: 1, endColumn: model.getLineMaxColumn(line),
    })))
  }, [logs, issues])

  return <div ref={host} style={{ flex: 1, minHeight: 0 }} />
}
