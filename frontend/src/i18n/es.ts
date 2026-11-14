export const es = {
  appName: 'GMAT Web',
  toolbar: {
    new: 'Nuevo', open: 'Abrir', samples: 'Ejemplos', save: 'Guardar', validate: 'Validar', run: 'Correr',
    stop: 'Detener',
  },
  left: { resources: 'Recursos', mission: 'Misión' },
  center: { editor: 'Editor', resource: 'Recurso', view3d: '3D', plots: 'Gráficas', reports: 'Reportes' },
  console: 'Consola',
  engine: {
    checking: 'Conectando con el motor…',
    ready: (version: string) => `GMAT ${version} listo`,
    error: 'Motor no disponible',
  },
  empty: 'Sin contenido todavía.',
  samples: {
    title: 'Ejemplos de GMAT',
    filter: 'Buscar ejemplo…',
    loading: 'Cargando ejemplos…',
    root: 'General',
    close: 'Cerrar',
    error: 'No se pudieron cargar los ejemplos',
  },
  run: {
    starting: (name: string) => `Corriendo ${name}…`,
    running: (s: number) => `Corriendo… ${s.toFixed(0)} s`,
    done: (s: number, files: string[]) =>
      `Corrida terminada en ${s} s.` + (files.length ? ` Archivos: ${files.join(', ')}` : ''),
    rejected: 'Script rechazado',
    failed: 'No se pudo iniciar la corrida',
    lost: 'Se perdió la conexión con la corrida',
    gotoLine: (line: number) => `Ir a la línea ${line}`,
  },
  validate: {
    starting: 'Validando el script con el motor…',
    ok: 'El motor cargó el script sin errores.',
    bad: 'El motor encontró errores en el script.',
    failed: 'No se pudo validar',
  },
  resources: {
    groups: {
      ships: 'Naves', hardware: 'Hardware', propagators: 'Propagadores', burns: 'Maniobras',
      coords: 'Sistemas de coordenadas', solvers: 'Solvers', variables: 'Variables', outputs: 'Salidas',
      other: 'Otros',
    } as Record<string, string>,
    newType: 'Tipo de recurso nuevo',
    create: 'Crear',
    rename: 'Renombrar',
    clone: 'Clonar',
    remove: 'Borrar',
    none: 'Sin recursos. Crea uno o abre un script.',
    renamePrompt: (name: string) => `Nuevo nombre para ${name}:`,
    badName: (name: string) => `"${name}" no es un nombre válido o ya existe (letra inicial, luego letras, números o _).`,
    confirmRemove: (name: string, refs: string[]) => refs.length
      ? `${name} se usa en:\n${refs.slice(0, 15).join('\n')}${refs.length > 15 ? '\n…' : ''}\n\n` +
        '¿Borrarlo igual? Esas líneas quedarán apuntando a un recurso inexistente.'
      : `¿Borrar ${name}?`,
    parseError: 'No se pudo analizar el script; se muestra el último modelo válido.',
    schemaError: 'No se pudieron leer los tipos del motor',
    serializeError: 'No se pudo actualizar el script desde el modelo',
  },
  form: {
    pick: 'Selecciona un recurso en el panel Recursos.',
    missing: (name: string) => `${name} ya no existe en el script.`,
    loading: 'Leyendo campos del motor…',
    error: (type: string) => `El motor no dio los campos de ${type}.`,
    reset: 'Volver al valor por defecto',
    help: (type: string, def: unknown, unit?: string) =>
      `Tipo GMAT: ${type}${unit ? ` · Unidades: ${unit}` : ''}${def !== null && def !== '' ? ` · Por defecto: ${def}` : ''}`,
    invalid: 'Valor inválido',
  },
}
