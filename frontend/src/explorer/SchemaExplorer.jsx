// Explorador de esquemas. El mismo componente sirve SAFF y SIDCO: solo cambia el
// dataset que recibe, porque ambos JSON comparten forma.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CATEGORY_ORDER } from '../lib/categories.js'
import { formatCompact, formatInt } from '../lib/format.js'
import { replaceRoute } from '../lib/router.js'
import { buildIndex, countByCategory, inferRelations, shortestPath } from './graph.js'
import { computeLayout } from './layout.js'
import { buildSearchIndex, searchSchema } from './search.js'
import { exportSchemaCsv, exportViewPng } from './export.js'
import MapCanvas from './MapCanvas.jsx'
import DetailPanel from './DetailPanel.jsx'
import SideRail from './SideRail.jsx'
import Minimap from './Minimap.jsx'
import './explorer.css'

export default function SchemaExplorer({ schema, tab, initialTable }) {
  const index = useMemo(() => buildIndex(schema), [schema])
  const layout = useMemo(() => computeLayout(schema, index), [schema, index])
  const searchIndex = useMemo(() => buildSearchIndex(schema), [schema])
  const catCounts = useMemo(() => countByCategory(schema.tables), [schema])
  const inferred = useMemo(() => inferRelations(schema, index), [schema, index])

  const [selected, setSelected] = useState(initialTable || null)
  const [query, setQuery] = useState('')
  const [visibleCats, setVisibleCats] = useState(() => new Set(CATEGORY_ORDER))
  const [showAllEdges, setShowAllEdges] = useState(true) // ambiente encendido: muy tenue, da textura
  const [hover, setHover] = useState(null)
  const [pathMode, setPathMode] = useState(null) // { from } mientras se elige el destino
  const [path, setPath] = useState(null)
  const [focusToken, setFocusToken] = useState(null)
  const [status, setStatus] = useState({ zoom: 1, visible: 0, labelled: 0 })
  // Paneles colapsables: el analista decide cuánto ancho de lienzo cede al texto.
  const [railOff, setRailOff] = useState(() => localStorage.getItem('ex-rail') === 'off')
  const [panelOff, setPanelOff] = useState(() => localStorage.getItem('ex-panel') === 'off')

  useEffect(() => {
    localStorage.setItem('ex-rail', railOff ? 'off' : 'on')
  }, [railOff])

  useEffect(() => {
    localStorage.setItem('ex-panel', panelOff ? 'off' : 'on')
  }, [panelOff])

  const canvasRef = useRef(null)
  const viewRef = useRef({ zoom: 0.5, panX: 0, panY: 0 })
  const mapApiRef = useRef(null)
  const minimapRef = useRef(null)
  const searchRef = useRef(null)
  const lastViewRef = useRef(null)

  const results = useMemo(() => searchSchema(schema, searchIndex, query), [schema, searchIndex, query])
  const table = selected ? index.tableMap.get(selected) : null
  const neighbors = useMemo(() => (selected ? index.neighbors.get(selected) : null), [index, selected])
  const pathNodes = useMemo(() => (path?.nodes ? new Set(path.nodes) : null), [path])

  // KPIs vivos como el header del original: con selección miden la tabla y sus vecinas;
  // sin selección, lo visible según filtros.
  const kpis = useMemo(() => {
    const scope = selected && neighbors ? [...neighbors, selected] : null
    const list = scope
      ? schema.tables.filter((t) => scope.includes(t.name))
      : schema.tables.filter((t) => visibleCats.has(t.category))
    const nameSet = new Set(list.map((t) => t.name))
    return {
      tables: list.length,
      cols: list.reduce((a, t) => a + t.col_count, 0),
      fks: schema.fks.filter((fk) => nameSet.has(fk.from_table) && nameSet.has(fk.to_table)).length,
      rows: list.reduce((a, t) => a + t.num_rows, 0),
    }
  }, [schema, selected, neighbors, visibleCats])

  // El enlace directo (#/saff?t=TABLA) se mantiene al día sin ensuciar el historial.
  useEffect(() => {
    replaceRoute(tab, selected)
  }, [tab, selected])

  // Cambios de hash que vienen de fuera (pegar un enlace, atrás/adelante) mandan sobre
  // el estado local. Los propios no llegan aquí: replaceState no dispara hashchange.
  // Se ajusta durante el render, no en un efecto, para no encadenar un segundo pintado.
  const [routeTable, setRouteTable] = useState(initialTable)
  if (initialTable !== routeTable) {
    setRouteTable(initialTable)
    if (initialTable) {
      setSelected(initialTable)
      setFocusToken({ name: initialTable, at: initialTable })
    }
  }

  const handleSelect = useCallback(
    (name, event) => {
      if (!name) {
        if (!event?.shiftKey) setSelected(null)
        return
      }
      // Con Shift, o con el modo ruta activo, el clic define el extremo del camino.
      if (event?.shiftKey || pathMode) {
        const from = pathMode?.from || selected
        if (from && from !== name) {
          const found = shortestPath(index, from, name)
          setPath(found ? { ...found, from, to: name } : { nodes: [], hops: [], from, to: name })
          setPathMode(null)
          return
        }
        setPathMode({ from: name })
        setSelected(name)
        return
      }
      setSelected(name)
    },
    [index, pathMode, selected],
  )

  // Se define después de handleSelect porque lo reutiliza: con el modo ruta activo,
  // elegir en la lista o en la búsqueda fija el destino en vez de cambiar la selección.
  const goTo = useCallback(
    (name) => {
      setFocusToken({ name, at: performance.now() })
      if (pathMode) handleSelect(name, { shiftKey: false })
      else setSelected(name)
    },
    [handleSelect, pathMode],
  )

  const toggleCat = (key) => {
    setVisibleCats((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        if (next.size === 1) return prev
        next.delete(key)
      } else next.add(key)
      return next
    })
  }

  const toggleAllCats = () => {
    setVisibleCats((prev) =>
      prev.size === CATEGORY_ORDER.length
        ? new Set(['hub', 'transaccional', 'relacional', 'catalogo'])
        : new Set(CATEGORY_ORDER),
    )
  }

  const onViewChange = useCallback((view) => {
    lastViewRef.current = view
    minimapRef.current?.update(view)
    setStatus((prev) =>
      prev.zoom === view.zoom && prev.visible === view.visible && prev.labelled === view.labelled
        ? prev
        : { zoom: view.zoom, visible: view.visible, labelled: view.labelled },
    )
  }, [])

  // Al calcular una ruta se encuadra: si no, el camino puede quedar fuera de pantalla.
  useEffect(() => {
    if (path?.nodes?.length > 1) mapApiRef.current?.fitNodes(path.nodes)
  }, [path])

  // Atajos globales de la vista. Se ignoran mientras se escribe en un campo.
  useEffect(() => {
    const onKey = (e) => {
      const typing = ['INPUT', 'TEXTAREA'].includes(e.target.tagName)
      if (e.key === '/' && !typing) {
        e.preventDefault()
        searchRef.current?.focus()
        return
      }
      if (e.key === 'Escape') {
        if (typing) {
          e.target.blur()
          return
        }
        setSelected(null)
        setPath(null)
        setPathMode(null)
        return
      }
      if (typing) return
      if (e.key === 'f') mapApiRef.current?.fitCore()
      if (e.key === 'F') mapApiRef.current?.fitAll()
      if (e.key === 'r') setShowAllEdges((v) => !v)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const jumpTo = ({ x, y }) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const { zoom } = viewRef.current
    viewRef.current.panX = rect.width / 2 - x * zoom
    viewRef.current.panY = rect.height / 2 - y * zoom
    mapApiRef.current?.schedule()
  }

  const zoomBy = (factor) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const { zoom, panX, panY } = viewRef.current
    const next = Math.min(3.2, Math.max(0.05, zoom * factor))
    const mx = rect.width / 2
    const my = rect.height / 2
    viewRef.current = {
      zoom: next,
      panX: mx - (mx - panX) * (next / zoom),
      panY: my - (my - panY) * (next / zoom),
    }
    mapApiRef.current?.schedule()
  }

  const doExportPng = () => {
    const view = lastViewRef.current
    if (!view) return
    const edges = []
    if (path?.hops?.length) {
      for (const hop of path.hops) {
        const a = layout.positions.get(hop.from)
        const b = layout.positions.get(hop.to)
        if (a && b) edges.push({ a, b })
      }
    } else if (selected) {
      for (const fk of index.edges.get(selected).out.concat(index.edges.get(selected).in)) {
        const a = layout.positions.get(fk.from_table)
        const b = layout.positions.get(fk.to_table)
        if (a && b) edges.push({ a, b })
      }
    }
    exportViewPng({
      schema,
      index,
      layout,
      view,
      rect: view.rect,
      visibleCats,
      edges,
      title: `${schema.meta.label} — ${schema.meta.description}`,
      theme: document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark',
    })
  }

  const theme = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'
  const hoverTable = hover ? index.tableMap.get(hover.name) : null

  const shellClass = `ex${railOff ? ' rail-off' : ''}${panelOff ? ' panel-off' : ''}`
  return (
    <div className={shellClass}>
      <SideRail
        schema={schema}
        catCounts={catCounts}
        visibleCats={visibleCats}
        onToggleCat={toggleCat}
        onAllCats={toggleAllCats}
        query={query}
        onQuery={setQuery}
        results={results}
        selected={selected}
        onGo={goTo}
        searchRef={searchRef}
      />

      <div className="ex-main">
        <div className="ex-toolbar">
          <button
            className="ex-btn is-icon"
            aria-pressed={!railOff}
            aria-label={railOff ? 'Mostrar riel lateral' : 'Ocultar riel lateral'}
            title={railOff ? 'Mostrar riel lateral' : 'Ocultar riel lateral'}
            onClick={() => setRailOff((v) => !v)}
          >
            ◧
          </button>
          <button className="ex-btn" onClick={() => mapApiRef.current?.fitCore()}>
            Encuadrar núcleo
          </button>
          <button className="ex-btn" onClick={() => mapApiRef.current?.fitAll()}>
            Ver todo
          </button>
          <button
            className="ex-btn"
            aria-pressed={showAllEdges}
            onClick={() => setShowAllEdges((v) => !v)}
          >
            Todas las relaciones
          </button>
          <button
            className="ex-btn ex-btn--primary"
            aria-pressed={!!pathMode || !!path}
            onClick={() => {
              if (path || pathMode) {
                setPath(null)
                setPathMode(null)
              } else setPathMode({ from: selected || null })
            }}
          >
            {path || pathMode ? 'Salir de ruta' : 'Ruta entre tablas'}
          </button>

          <span className="ex-spacer" />
          <div className={`ex-kpis${selected ? ' is-scoped' : ''}`}>
            <span className="ex-kpi">
              <b>{formatInt(kpis.tables)}</b>tablas
            </span>
            <span className="ex-kpi">
              <b>{formatInt(kpis.cols)}</b>columnas
            </span>
            <span className="ex-kpi">
              <b>{formatInt(kpis.fks)}</b>relaciones
            </span>
            <span className="ex-kpi">
              <b>{formatCompact(kpis.rows)}</b>registros
            </span>
          </div>
          <span className="ex-stat">
            zoom {Math.round(status.zoom * 100)}% · {status.labelled} nombradas
          </span>
          <span className="ex-btngroup">
            <button className="ex-btn" onClick={doExportPng}>
              PNG
            </button>
            <button className="ex-btn" onClick={() => exportSchemaCsv(schema, index)}>
              CSV
            </button>
          </span>
          <button
            className="ex-btn is-icon"
            aria-pressed={!panelOff}
            aria-label={panelOff ? 'Mostrar panel de detalle' : 'Ocultar panel de detalle'}
            title={panelOff ? 'Mostrar panel de detalle' : 'Ocultar panel de detalle'}
            onClick={() => setPanelOff((v) => !v)}
          >
            ◨
          </button>
        </div>

        <div className="ex-stage">
          <MapCanvas
            schema={schema}
            index={index}
            layout={layout}
            selected={selected}
            neighbors={neighbors}
            pathNodes={pathNodes}
            pathEdges={path?.hops}
            hits={query.trim().length >= 2 ? results.hits : null}
            visibleCats={visibleCats}
            showAllEdges={showAllEdges}
            onSelect={handleSelect}
            onHover={setHover}
            onViewChange={onViewChange}
            focusToken={focusToken}
            canvasRef={canvasRef}
            viewRef={viewRef}
            apiRef={mapApiRef}
          />

          {pathMode && (
            <div className="ex-hint">
              {pathMode.from ? (
                <>
                  Ruta desde <b>{pathMode.from}</b> — elige la tabla de destino.
                </>
              ) : (
                <>Elige la tabla de origen de la ruta.</>
              )}
            </div>
          )}

          {path && (
            <div className={`ex-hint${path.nodes.length ? '' : ' is-warn'}`}>
              {path.nodes.length ? (
                <>
                  <b>{path.from}</b> → <b>{path.to}</b> en {path.hops.length}{' '}
                  {path.hops.length === 1 ? 'salto' : 'saltos'}:{' '}
                  {path.nodes.join(' → ')}
                </>
              ) : (
                <>
                  No hay camino de claves foráneas entre <b>{path.from}</b> y <b>{path.to}</b>: están
                  en partes desconectadas del modelo.
                </>
              )}
              <button className="ex-close" onClick={() => setPath(null)} aria-label="Cerrar ruta">
                ×
              </button>
            </div>
          )}

          {hover && hoverTable && (
            <div
              className="ex-tooltip"
              style={{
                left: Math.min(hover.x + 14, (hover.width || 900) - 340),
                top: hover.y + 16,
              }}
            >
              <b>{hoverTable.name}</b>
              {hoverTable.comment || 'Sin descripción en el diccionario.'}
              <div style={{ marginTop: 4, opacity: 0.75 }}>
                {formatInt(hoverTable.num_rows)} filas · {hoverTable.col_count} columnas ·{' '}
                {hoverTable.fk_in} dependen · {hoverTable.fk_out} referencia
              </div>
            </div>
          )}

          <div className="ex-float bottom-left">
            <button className="ex-zoombtn" onClick={() => zoomBy(1.25)} aria-label="Acercar">
              +
            </button>
            <button className="ex-zoombtn" onClick={() => zoomBy(0.8)} aria-label="Alejar">
              −
            </button>
          </div>

          <Minimap
            layout={layout}
            index={index}
            visibleCats={visibleCats}
            theme={theme}
            apiRef={minimapRef}
            onJump={jumpTo}
          />
        </div>
      </div>

      <DetailPanel
        table={table}
        index={index}
        inferred={selected ? inferred.get(selected) : null}
        onGo={goTo}
        onClose={() => setSelected(null)}
        onPathFrom={(name) => setPathMode({ from: name })}
      />
    </div>
  )
}
