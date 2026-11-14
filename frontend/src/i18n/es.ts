export const es = {
  appName: 'GMAT Web',
  toolbar: { new: 'Nuevo', open: 'Abrir', save: 'Guardar', run: 'Correr' },
  left: { resources: 'Recursos', mission: 'Misión' },
  center: { editor: 'Editor', view3d: '3D', plots: 'Gráficas', reports: 'Reportes' },
  console: 'Consola',
  engine: {
    checking: 'Conectando con el motor…',
    ready: (version: string) => `GMAT ${version} listo`,
    error: 'Motor no disponible',
  },
  empty: 'Sin contenido todavía.',
}
