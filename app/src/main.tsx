import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { Recover } from './ui/Recover'
import { initTheme } from './state/theme'
import { initCloud } from './state/cloud'

initTheme()
initCloud()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Recover>
      <App />
    </Recover>
  </StrictMode>,
)
