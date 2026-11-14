import react from '@vitejs/plugin-react'
import { cpSync, existsSync } from 'node:fs'
import { defineConfig } from 'vite'

// Cesium carga Workers/Assets en tiempo de ejecución desde CESIUM_BASE_URL (/cesium/): se copian a public/
// (servido en dev y copiado a dist en build). Borrar public/cesium al actualizar el paquete cesium.
const root = new URL('.', import.meta.url)
for (const dir of ['Assets', 'Workers', 'ThirdParty', 'Widgets']) {
  const dst = new URL(`public/cesium/${dir}`, root)
  if (!existsSync(dst)) cpSync(new URL(`node_modules/cesium/Build/Cesium/${dir}`, root), dst, { recursive: true })
}

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: 'http://127.0.0.1:8000', ws: true },
      '/ws': { target: 'ws://127.0.0.1:8000', ws: true },
    },
  },
})
