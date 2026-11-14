import { useEffect, useRef } from 'react'
import { useApp } from '../store'
import { editorRef, monaco } from './gmat'

const dark = window.matchMedia('(prefers-color-scheme: dark)')

export default function ScriptEditor() {
  const host = useRef<HTMLDivElement>(null)
  const rev = useApp((st) => st.doc.rev)
  const logs = useApp((st) => st.logs)

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

  // Texto cargado desde fuera (Nuevo, Abrir, Ejemplo): reemplaza el del editor.
  useEffect(() => {
    const ed = editorRef.current
    const { text } = useApp.getState().doc
    if (ed && ed.getValue() !== text) ed.setValue(text)  // limpia marcadores vía onDidChangeModelContent
  }, [rev])

  // Errores/avisos con línea (validar o correr) como marcadores en el margen.
  useEffect(() => {
    const model = editorRef.current?.getModel()
    if (!model) return
    monaco.editor.setModelMarkers(model, 'gmat', logs
      .filter((l) => l.line && l.line <= model.getLineCount())
      .map((l) => ({
        severity: l.level === 'warning' ? monaco.MarkerSeverity.Warning : monaco.MarkerSeverity.Error,
        message: l.text, startLineNumber: l.line!, endLineNumber: l.line!,
        startColumn: 1, endColumn: model.getLineMaxColumn(l.line!),
      })))
  }, [logs])

  return <div ref={host} style={{ flex: 1, minHeight: 0 }} />
}
