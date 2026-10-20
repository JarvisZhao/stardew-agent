import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@xterm/xterm/css/xterm.css'
import './styles.css'
import { GRASS } from '../../shared/sprites'
import { App } from './App'
import { spriteUrl } from './sprite'

document.documentElement.style.setProperty('--grass-tile', `url(${spriteUrl('grass', GRASS)})`)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
