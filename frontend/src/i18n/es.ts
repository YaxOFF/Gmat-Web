export const es = {
  appName: 'GMAT Web',
  toolbar: {
    new: 'Nuevo', open: 'Abrir', samples: 'Ejemplos', save: 'Guardar', run: 'Correr', stop: 'Detener',
  },
  left: { resources: 'Recursos', mission: 'Misión' },
  center: { editor: 'Editor', view3d: '3D', plots: 'Gráficas', reports: 'Reportes' },
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
}
