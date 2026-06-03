import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { AppErrorBoundary } from './components/AppErrorBoundary.tsx'
import App from './App.tsx'
import { installGlobalErrorHandlers } from './utils/errorReporting.ts'
import { registerServiceWorker, scheduleVersionMetadataUpdateChecks } from './utils/pwa.ts'
import { APP_INFO } from './utils/appInfo.ts'

installGlobalErrorHandlers()
registerServiceWorker()
if (!import.meta.env.DEV) {
  scheduleVersionMetadataUpdateChecks({
    currentGitHash: APP_INFO.commit,
    baseUrl: import.meta.env.BASE_URL || '/',
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
)
