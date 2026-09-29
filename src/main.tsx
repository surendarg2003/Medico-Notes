import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}service-worker.js`)
      .then(async (registration) => {
        const worker = registration.installing ?? registration.waiting
        if (worker && worker.state !== 'activated') {
          await new Promise<void>((resolve) => {
            const handleStateChange = () => {
              if (worker.state === 'activated' || worker.state === 'redundant') {
                worker.removeEventListener('statechange', handleStateChange)
                resolve()
              }
            }
            worker.addEventListener('statechange', handleStateChange)
            handleStateChange()
          })
        }
        registration.active?.postMessage({ type: 'CACHE_OFFLINE_ASSETS' })
      })
      .catch((error: unknown) => {
        console.error('Offline app caching could not be enabled.', error)
      })
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
