// Enrutado por hash. GitHub Pages devuelve 404 para rutas con History API,
// así que toda la navegación vive en el fragmento: #/saff?t=INCENDIO
import { useEffect, useState } from 'react'

export const TABS = ['home', 'legacy', 'saff', 'sidco']

export function parseHash(hash) {
  const raw = String(hash || '').replace(/^#\/?/, '')
  const [path, search] = raw.split('?')
  const tab = TABS.includes(path) ? path : 'home'
  const params = new URLSearchParams(search || '')
  return { tab, table: params.get('t') || null }
}

export function buildHash(tab, table) {
  return `#/${tab}${table ? `?t=${encodeURIComponent(table)}` : ''}`
}

export function navigate(tab, table) {
  const next = buildHash(tab, table)
  if (window.location.hash !== next) window.location.hash = next
}

/** Reemplaza la ruta sin ensuciar el historial (para selecciones dentro de una vista). */
export function replaceRoute(tab, table) {
  const next = buildHash(tab, table)
  if (window.location.hash === next) return
  window.history.replaceState(null, '', next)
}

export function useHashRoute() {
  const [route, setRoute] = useState(() => parseHash(window.location.hash))
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash))
    window.addEventListener('hashchange', onChange)
    if (!window.location.hash) window.location.replace('#/home')
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}
