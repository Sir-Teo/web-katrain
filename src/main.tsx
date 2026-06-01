import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { AppErrorBoundary } from './components/AppErrorBoundary.tsx'
import App from './App.tsx'
import { installGlobalErrorHandlers } from './utils/errorReporting.ts'
import { registerServiceWorker } from './utils/pwa.ts'

installGlobalErrorHandlers()
registerServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
)
