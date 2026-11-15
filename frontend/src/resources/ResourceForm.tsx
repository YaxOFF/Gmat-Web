import { useEffect } from 'react'
import { en as es } from '../i18n/en'
import { useApp } from '../store'
import Editor from './Editors'
import s from './Resources.module.css'

export default function ResourceForm() {
  const { mission, selected, schemas, fetchSchema } = useApp()
  const r = mission.resources.find((x) => x.name === selected)
  const type = r?.type
  useEffect(() => { if (type) void fetchSchema(type) }, [type, fetchSchema])

  if (!selected) return <div className={s.muted}>{es.form.pick}</div>
  if (!r) return <div className={s.muted}>{es.form.missing(selected)}</div>
  const schema = schemas[r.type]
  if (!schema) return <div className={s.muted}>{es.form.loading}</div>
  if (schema === 'error') return <div className={s.muted}>{es.form.error(r.type)}</div>

  return (
    <div className={s.form}>
      <h2 className={s.title}>{r.name} <small>{r.type}</small></h2>
      <Editor r={r} schema={schema} />
    </div>
  )
}
