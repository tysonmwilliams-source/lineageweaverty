import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

// Theme CSS is loaded dynamically by ThemeContext for non-default themes.
//
// theme-base.css carries the scales but no colours, so the default theme is
// bundled statically alongside it: without that, the first paint has no
// surface or text colour at all and the app flashes white before the injected
// <link> lands. ThemeContext knows this one is already present.
import './styles/themes/theme-base.css'
import './styles/themes/theme-royal-parchment.css'

// Shared keyframes, loaded before any component stylesheet.
import './styles/animations.css'

// The manuscript ornament layer (decision B1). Everything in it is opt-in via a
// class, so it changes nothing until a surface asks for it — which is what keeps
// the dense data screens free of ornament.
import './styles/manuscript.css'

import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
