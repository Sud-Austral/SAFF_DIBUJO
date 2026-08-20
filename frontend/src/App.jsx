import { Suspense, lazy } from 'react'
import { TABS, navigate, useHashRoute } from './lib/router.js'
import { useTheme } from './lib/useTheme.js'
import Home from './routes/Home.jsx'

// Las vistas pesadas se cargan bajo demanda: cada esquema son cientos de KB de datos
// y no tiene sentido descargarlos para leer la portada.
const LegacyView = lazy(() => import('./legacy/LegacyView.jsx'))
const SafExplorer = lazy(() => import('./explorer/SafExplorer.jsx'))
const SidcoExplorer = lazy(() => import('./explorer/SidcoExplorer.jsx'))

const TAB_LABELS = {
  home: 'Inicio',
  legacy: 'Legacy',
  saff: 'SAFF',
  sidco: 'SIDCO',
}

function Loading({ label }) {
  return (
    <div className="route-loading">
      <div className="route-spinner" />
      <span>Cargando {label}…</span>
    </div>
  )
}

export default function App() {
  const { tab, table } = useHashRoute()
  const { theme, toggle } = useTheme()

  return (
    <div className="app-shell">
      <a className="skip-link" href="#contenido">
        Saltar al contenido
      </a>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">CONAF</span>
          <span className="brand-sub">UIA · Modelos de datos</span>
        </div>

        <nav className="tabs" aria-label="Vistas">
          {TABS.map((t) => (
            <button
              key={t}
              className="tab"
              aria-current={t === tab ? 'page' : undefined}
              onClick={() => navigate(t)}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </nav>

        <div className="topbar-right">
          {/* La vista Legacy reproduce el original, que solo existía en oscuro:
              ofrecer el toggle ahí sería prometer algo que no debe cambiar. */}
          {tab !== 'legacy' && (
            <button
              className="icon-btn"
              onClick={toggle}
              title={theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
            >
              {theme === 'dark' ? '☾' : '☀'} {theme === 'dark' ? 'Oscuro' : 'Claro'}
            </button>
          )}
        </div>
      </header>

      <main className="app-main" id="contenido">
        {tab === 'home' && <Home />}
        {tab === 'legacy' && (
          <Suspense fallback={<Loading label="el modelo original" />}>
            <LegacyView />
          </Suspense>
        )}
        {tab === 'saff' && (
          <Suspense fallback={<Loading label="SAFF" />}>
            <SafExplorer table={table} />
          </Suspense>
        )}
        {tab === 'sidco' && (
          <Suspense fallback={<Loading label="SIDCO" />}>
            <SidcoExplorer table={table} />
          </Suspense>
        )}
      </main>
    </div>
  )
}
