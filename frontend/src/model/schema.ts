// Respuestas de GET /api/schema (lista de tipos creables) y GET /api/schema/{type}.

export interface FieldSchema {
  /** Nombre exacto de GMAT. */
  name: string
  /** Tipo de parámetro de GMAT: Real, Integer, Boolean, String, Enumeration, Object, ObjectArray, Rvector... */
  type: string
  readOnly: boolean
  /** Valor de un objeto recién creado; null en campos de solo lectura. */
  default: number | boolean | string | null
  enum?: string[]
  unit?: string
  /** Gmat::ObjectType numérico de la referencia (campos Object/ObjectArray). */
  refType?: number
  /** Solo Spacecraft: representación (DisplayStateType) a la que pertenece el elemento de estado. */
  stateType?: string
}

export interface TypeSchema {
  type: string
  fields: FieldSchema[]
}

/** Elemento de GET /api/schema: tipo creable, categoría del motor y Gmat::ObjectType. */
export interface TypeInfo {
  type: string
  /** SPACECRAFT, HARDWARE, ODE_MODEL, PROP_SETUP, BURN, COORDINATE_SYSTEM, SOLVER, SUBSCRIBER, PARAMETER... */
  category: string
  objectType: number
}
