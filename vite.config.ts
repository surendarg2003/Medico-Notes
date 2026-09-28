import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'

function offlineAssetManifest(): Plugin {
  return {
    name: 'freenotes-offline-asset-manifest',
    generateBundle(_options, bundle) {
      const assets = Object.values(bundle)
        .filter((item) => item.type === 'asset' || item.type === 'chunk')
        .map((item) => `./${item.fileName}`)
      this.emitFile({
        type: 'asset',
        fileName: 'precache-manifest.json',
        source: JSON.stringify(assets),
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), offlineAssetManifest()],
})
