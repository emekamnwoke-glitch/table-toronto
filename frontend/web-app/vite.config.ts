import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// maplibre-gl v6's worker is an ES module that imports a sibling "shared"
// module. Bundlers only see the main entry, so serve (dev) and emit (build)
// both files side by side where the worker can resolve its import.
function maplibreWorker(): Plugin {
  const dir = 'node_modules/maplibre-gl/dist/'
  const files = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']
  return {
    name: 'maplibre-worker',
    configureServer(server) {
      server.middlewares.use('/maplibre/', (req, res, next) => {
        const name = req.url?.replace(/^\//, '').split('?')[0] ?? ''
        if (!files.includes(name)) return next()
        res.setHeader('content-type', 'text/javascript')
        res.end(readFileSync(dir + name))
      })
    },
    generateBundle() {
      for (const name of files) {
        this.emitFile({ type: 'asset', fileName: `maplibre/${name}`, source: readFileSync(dir + name) })
      }
    },
  }
}

// The api-gateway runs on :3001 (backend/api-gateway); proxying keeps the
// browser same-origin in dev, so no CORS or base-URL config is needed.
export default defineConfig({
  plugins: [react(), maplibreWorker()],
  server: { proxy: { '/api': 'http://localhost:3001' } },
})
