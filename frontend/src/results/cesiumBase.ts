// Debe evaluarse antes que 'cesium': de aquí lee Cesium la ruta de Workers/Assets (copiados por vite.config.ts).
;(window as unknown as { CESIUM_BASE_URL: string }).CESIUM_BASE_URL = '/cesium/'
