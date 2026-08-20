// Tema claro/oscuro persistido. El valor se aplica en <html data-theme> y el
// index.html lo lee antes del primer pintado para evitar el parpadeo.
import { useCallback, useEffect, useState } from 'react'

const KEY = 'saff-theme'

function readStored() {
  try {
    const saved = localStorage.getItem(KEY)
    return saved === 'light' || saved === 'dark' ? saved : 'dark'
  } catch {
    return 'dark'
  }
}

export function useTheme() {
  const [theme, setTheme] = useState(readStored)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try {
      localStorage.setItem(KEY, theme)
    } catch {
      /* localStorage bloqueado: el tema solo dura la sesión */
    }
  }, [theme])

  const toggle = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), [])
  return { theme, toggle }
}
