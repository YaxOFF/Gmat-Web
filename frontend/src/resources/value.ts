import type { Value } from '../model/mission'

/** Valor del modelo como texto de formulario. */
export const show = (v: Value | null | undefined): string =>
  v === null || v === undefined ? ''
    : Array.isArray(v) ? v.map(show).join(Array.isArray(v[0]) ? '; ' : ', ')
      : typeof v === 'object' ? v.ref : String(v)
