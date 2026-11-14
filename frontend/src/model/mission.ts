// Espejo de shared/mission.schema.json (modelo que devuelve POST /api/script/parse).

/** Token sin comillas que se escribe tal cual: recurso, Obj.Param, ruta... */
export interface Ref {
  ref: string
}

export type Value = number | boolean | string | Ref | Value[]

export interface Resource {
  type: string
  name: string
  /** Nombre exacto de GMAT → valor, en orden de script. */
  fields: Record<string, Value>
  comments?: string[]
}

export interface Command {
  /** Palabra clave; 'GMAT' para asignaciones. */
  cmd: string
  label?: string
  /** Resto del comando tal cual, sin etiqueta ni ';'. */
  text: string
  args?: Record<string, unknown>
  comments?: string[]
  /** Solo en bloques (Target, Optimize, If, While, For, BeginScript). */
  children?: Command[]
  endComments?: string[]
  endText?: string
}

export interface Mission {
  resources: Resource[]
  sequence: Command[]
  /** Líneas que el parser no entiende: se preservan tal cual. */
  raw: string[]
}
