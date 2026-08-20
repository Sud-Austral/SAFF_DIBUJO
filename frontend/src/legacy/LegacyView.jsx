// Vista Legacy — port 1:1 del index.html original a React.
//
// Se conserva la misma estructura de DOM, las mismas clases, el mismo layout en grilla,
// los mismos gestos y los mismos textos. Dos diferencias deliberadas, ambas internas:
//   1. Los onclick inline del original se reemplazan por handlers React (el original
//      necesitaba exponer funciones en window; aquí no hay ninguna global).
//   2. El paneo, el zoom y el arrastre de tarjetas mutan el DOM por referencia en vez de
//      pasar por estado: con 327 tarjetas montadas, re-renderizar en cada mousemove sería
//      una regresión frente al original. El resultado visual es idéntico.
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import schema from '../data/saf-schema.json'
import './legacy.css'

const CATEGORIES = {
  hub: { label: 'Hub Central', color: '#f43f5e', desc: 'Alta centralidad entrante (≥15 FK_IN)' },
  transaccional: { label: 'Transaccional', color: '#3b82f6', desc: 'Alto volumen (≥500K filas)' },
  relacional: { label: 'Relacional', color: '#10b981', desc: 'Alta conectividad total (≥15 FK total)' },
  catalogo: { label: 'Catálogo/Maestro', color: '#a78bfa', desc: 'Pocas filas, muy referenciada' },
  estructural: { label: 'Estructural', color: '#f59e0b', desc: 'Rica en atributos (≥25 columnas)' },
  operacional: { label: 'Operacional', color: '#64748b', desc: 'Tablas de proceso general' },
}

const CARD_W = 260
const CARD_GAP = 36
const COLS = 10
const ROW_H = 340
const SVG_NS = 'http://www.w3.org/2000/svg'

const TABLES = schema.tables
const FKS = schema.fks

const TABLE_MAP = Object.fromEntries(TABLES.map((t) => [t.name, t]))

const FKS_BY_TABLE = (() => {
  const map = {}
  TABLES.forEach((t) => {
    map[t.name] = { out: [], in: [] }
  })
  FKS.forEach((fk) => {
    if (map[fk.from_table]) map[fk.from_table].out.push(fk)
    if (map[fk.to_table]) map[fk.to_table].in.push(fk)
  })
  return map
})()

// Layout en grilla fija ordenado por grado — idéntico al initLayout() original.
const INITIAL_POSITIONS = (() => {
  const positions = {}
  const sorted = [...TABLES].sort((a, b) => b.fk_in + b.fk_out - (a.fk_in + a.fk_out))
  sorted.forEach((t, i) => {
    positions[t.name] = {
      x: (i % COLS) * (CARD_W + CARD_GAP) + 30,
      y: Math.floor(i / COLS) * ROW_H + 30,
    }
  })
  return positions
})()

const SIDEBAR_TABLES = [...TABLES].sort((a, b) => a.name.localeCompare(b.name))

const CAT_COUNTS = TABLES.reduce((acc, t) => {
  acc[t.category] = (acc[t.category] || 0) + 1
  return acc
}, {})

const TableCard = memo(function TableCard({ table, hidden, state }) {
  const cat = CATEGORIES[table.category] || CATEGORIES.operacional
  const pkSet = new Set(table.pks)
  const fkSet = new Set(table.fk_cols)
  const pos = INITIAL_POSITIONS[table.name]

  return (
    <div
      className={`table-card${state ? ' ' + state : ''}`}
      data-table={table.name}
      style={{ left: pos.x + 'px', top: pos.y + 'px', display: hidden ? 'none' : undefined }}
    >
      <div className="card-header">
        <div className="card-cat-stripe" style={{ background: cat.color }} />
        <div className="card-title">{table.name}</div>
        {table.fk_total > 0 && (
          <div className="card-badge" style={{ background: cat.color + '22', color: cat.color }}>
            {table.fk_total}R
          </div>
        )}
      </div>
      {table.comment && <div className="card-comment">{table.comment}</div>}
      <div className="col-list">
        {table.columns.map((c) => {
          const isPK = pkSet.has(c.name)
          const isFK = fkSet.has(c.name)
          return (
            <div className="col-row" key={c.name}>
              <span>
                <div className={`col-icon ${isPK ? 'ci-pk' : isFK ? 'ci-fk' : 'ci-none'}`}>
                  {isPK ? 'PK' : isFK ? 'FK' : ''}
                </div>
              </span>
              <span className={`col-name ${isPK ? 'is-pk' : isFK ? 'is-fk' : ''}`}>{c.name}</span>
              <span className="col-type">{c.type}</span>
            </div>
          )
        })}
      </div>
      <div className="card-footer">
        <span>{table.columns.length} cols</span>
        <span>{table.num_rows.toLocaleString()} filas</span>
      </div>
    </div>
  )
})

export default function LegacyView() {
  const [activeCats, setActiveCats] = useState(() => new Set(Object.keys(CATEGORIES)))
  const [selected, setSelected] = useState(null)
  const [showGlobalLines, setShowGlobalLines] = useState(false)
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)

  const wrapRef = useRef(null)
  const canvasRef = useRef(null)
  const svgRef = useRef(null)
  const listRef = useRef(null)

  const viewRef = useRef({ zoom: 0.5, panX: 0, panY: 0 })
  const positionsRef = useRef(structuredClone(INITIAL_POSITIONS))
  const dragRef = useRef({ table: null, offsetX: 0, offsetY: 0, moved: false })
  const panRef = useRef({ active: false, startX: 0, startY: 0 })

  // En modo foco manda la selección; si no hay selección, mandan los filtros de categoría.
  const related = useMemo(() => {
    if (!selected) return null
    const set = new Set()
    FKS_BY_TABLE[selected].out.forEach((fk) => set.add(fk.to_table))
    FKS_BY_TABLE[selected].in.forEach((fk) => set.add(fk.from_table))
    return set
  }, [selected])

  const isVisible = useCallback(
    (name) => {
      if (selected) return name === selected || related.has(name)
      return activeCats.has(TABLE_MAP[name]?.category)
    },
    [selected, related, activeCats],
  )

  const kpis = useMemo(() => {
    const names = selected
      ? [selected, ...related]
      : TABLES.filter((t) => activeCats.has(t.category)).map((t) => t.name)
    const ts = names.map((n) => TABLE_MAP[n]).filter(Boolean)
    const nameSet = new Set(names)
    return {
      tables: ts.length,
      cols: ts.reduce((a, t) => a + t.columns.length, 0),
      fks: FKS.filter((fk) => nameSet.has(fk.from_table) && nameSet.has(fk.to_table)).length,
      rows: ts.reduce((a, t) => a + t.num_rows, 0),
    }
  }, [selected, related, activeCats])

  const applyTransform = useCallback(() => {
    const { zoom, panX, panY } = viewRef.current
    const transform = `translate(${panX}px,${panY}px) scale(${zoom})`
    if (canvasRef.current) canvasRef.current.style.transform = transform
    if (svgRef.current) svgRef.current.style.transform = transform
  }, [])

  // Dibujo imperativo de las líneas, equivalente a updateLines() del original.
  const drawLines = useCallback(() => {
    const svg = svgRef.current
    if (!svg) return
    svg.textContent = ''
    if (!selected && !showGlobalLines) return

    const lines = selected
      ? [
          ...FKS_BY_TABLE[selected].out.map((fk) => ({ ...fk, type: 'out' })),
          ...FKS_BY_TABLE[selected].in.map((fk) => ({ ...fk, type: 'in' })),
        ]
      : FKS.filter((fk) => {
          const ft = TABLE_MAP[fk.from_table]
          const tt = TABLE_MAP[fk.to_table]
          return ft && tt && activeCats.has(ft.category) && activeCats.has(tt.category)
        }).map((fk) => ({ ...fk, type: 'global' }))

    const defs = document.createElementNS(SVG_NS, 'defs')
    svg.appendChild(defs)
    const positions = positionsRef.current

    lines.forEach((fk, idx) => {
      if (fk.from_table === fk.to_table) return
      if (!isVisible(fk.from_table) || !isVisible(fk.to_table)) return
      const fp = positions[fk.from_table]
      const tp = positions[fk.to_table]
      if (!fp || !tp) return

      const x1 = fp.x + CARD_W
      const y1 = fp.y + 24
      const x2 = tp.x
      const y2 = tp.y + 24
      const cx = x1 + (x2 - x1) * 0.4

      const color =
        fk.type === 'out'
          ? 'rgba(59,130,246,0.85)'
          : fk.type === 'in'
            ? 'rgba(52,211,153,0.75)'
            : 'rgba(59,130,246,0.2)'

      const marker = document.createElementNS(SVG_NS, 'marker')
      marker.setAttribute('id', `am${idx}`)
      marker.setAttribute('markerWidth', '6')
      marker.setAttribute('markerHeight', '6')
      marker.setAttribute('refX', '5')
      marker.setAttribute('refY', '3')
      marker.setAttribute('orient', 'auto')
      const arrow = document.createElementNS(SVG_NS, 'path')
      arrow.setAttribute('d', 'M0,0 L6,3 L0,6 Z')
      arrow.setAttribute('fill', color)
      marker.appendChild(arrow)
      defs.appendChild(marker)

      const path = document.createElementNS(SVG_NS, 'path')
      path.setAttribute('d', `M ${x1} ${y1} C ${cx} ${y1}, ${x1 + (x2 - x1) * 0.6} ${y2}, ${x2} ${y2}`)
      path.setAttribute(
        'class',
        `fk-line ${fk.type === 'global' ? 'global' : fk.type === 'out' ? 'active-out' : 'active-in'}`,
      )
      path.setAttribute('marker-end', `url(#am${idx})`)
      svg.appendChild(path)
    })
  }, [selected, showGlobalLines, activeCats, isVisible])

  useEffect(() => {
    drawLines()
  }, [drawLines])

  const fitToView = useCallback(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const visible = Object.entries(positionsRef.current).filter(([name]) => isVisible(name))
    if (!visible.length) return
    const xs = visible.map(([, p]) => p.x)
    const ys = visible.map(([, p]) => p.y)
    const cw = wrap.getBoundingClientRect()
    const fw = Math.max(...xs) + 280 - Math.min(...xs)
    const fh = Math.max(...ys) + 200 - Math.min(...ys)
    const zoom = Math.min(cw.width / fw, cw.height / fh) * 0.88
    viewRef.current = {
      zoom,
      panX: (cw.width - fw * zoom) / 2 - Math.min(...xs) * zoom,
      panY: (cw.height - fh * zoom) / 2 - Math.min(...ys) * zoom,
    }
    applyTransform()
  }, [isVisible, applyTransform])

  // Arranque: el original mostraba el spinner 400 ms y luego ajustaba la vista.
  // El ajuste se toma por referencia para que el temporizador no dependa de él y
  // se reinicie cada vez que cambian los filtros.
  const fitRef = useRef(fitToView)
  useEffect(() => {
    fitRef.current = fitToView
  }, [fitToView])
  useEffect(() => {
    applyTransform()
    const timer = setTimeout(() => {
      fitRef.current()
      setLoading(false)
    }, 400)
    return () => clearTimeout(timer)
  }, [applyTransform])

  const toggleCat = (cat) => {
    setActiveCats((prev) => {
      if (prev.has(cat)) {
        if (prev.size === 1) return prev
        const next = new Set(prev)
        next.delete(cat)
        return next
      }
      return new Set(prev).add(cat)
    })
  }

  const selectTable = useCallback((name) => {
    setSelected((prev) => (prev === name ? null : name))
  }, [])

  const focusTable = useCallback(
    (name) => {
      selectTable(name)
      const pos = positionsRef.current[name]
      const wrap = wrapRef.current
      if (!pos || !wrap) return
      const cw = wrap.getBoundingClientRect()
      const { zoom } = viewRef.current
      viewRef.current.panX = cw.width / 2 - (pos.x + 130) * zoom
      viewRef.current.panY = cw.height / 2 - (pos.y + 80) * zoom
      applyTransform()
    },
    [selectTable, applyTransform],
  )

  const clearSelection = () => setSelected(null)

  // Mantiene la tabla seleccionada a la vista en la lista lateral.
  useEffect(() => {
    if (!selected || !listRef.current) return
    const item = listRef.current.querySelector(`.tl-item[data-table="${CSS.escape(selected)}"]`)
    if (item) item.scrollIntoView({ block: 'nearest' })
  }, [selected])

  // --- Gestos: arrastre de tarjetas, paneo del lienzo y zoom con rueda ---
  const onCanvasMouseDown = (e) => {
    const card = e.target.closest('.table-card')
    if (card && !e.target.closest('.col-list')) {
      const name = card.dataset.table
      const cw = wrapRef.current.getBoundingClientRect()
      const { zoom, panX, panY } = viewRef.current
      dragRef.current = {
        table: name,
        offsetX: (e.clientX - cw.left - panX) / zoom - positionsRef.current[name].x,
        offsetY: (e.clientY - cw.top - panY) / zoom - positionsRef.current[name].y,
        moved: false,
      }
      e.stopPropagation()
      return
    }
    if (card) return
    panRef.current = {
      active: true,
      startX: e.clientX - viewRef.current.panX,
      startY: e.clientY - viewRef.current.panY,
    }
    wrapRef.current.style.cursor = 'grabbing'
  }

  const onCanvasClick = (e) => {
    const card = e.target.closest('.table-card')
    if (card && !dragRef.current.moved) selectTable(card.dataset.table)
  }

  useEffect(() => {
    const onMove = (e) => {
      const drag = dragRef.current
      if (drag.table) {
        const cw = wrapRef.current.getBoundingClientRect()
        const { zoom, panX, panY } = viewRef.current
        const nx = (e.clientX - cw.left - panX) / zoom - drag.offsetX
        const ny = (e.clientY - cw.top - panY) / zoom - drag.offsetY
        const pos = positionsRef.current[drag.table]
        if (Math.abs(nx - pos.x) > 2 || Math.abs(ny - pos.y) > 2) drag.moved = true
        positionsRef.current[drag.table] = { x: nx, y: ny }
        const el = canvasRef.current?.querySelector(
          `.table-card[data-table="${CSS.escape(drag.table)}"]`,
        )
        if (el) {
          el.style.left = nx + 'px'
          el.style.top = ny + 'px'
        }
        drawLines()
        return
      }
      if (!panRef.current.active) return
      viewRef.current.panX = e.clientX - panRef.current.startX
      viewRef.current.panY = e.clientY - panRef.current.startY
      applyTransform()
    }
    const onUp = () => {
      panRef.current.active = false
      if (wrapRef.current) wrapRef.current.style.cursor = ''
      setTimeout(() => {
        dragRef.current.table = null
      }, 10)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [applyTransform, drawLines])

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const onWheel = (e) => {
      e.preventDefault()
      const cw = wrap.getBoundingClientRect()
      const mx = e.clientX - cw.left
      const my = e.clientY - cw.top
      const { zoom, panX, panY } = viewRef.current
      const nz = Math.max(0.08, Math.min(2.5, zoom * (e.deltaY > 0 ? 0.9 : 1.1)))
      viewRef.current = {
        zoom: nz,
        panX: mx - (mx - panX) * (nz / zoom),
        panY: my - (my - panY) * (nz / zoom),
      }
      applyTransform()
    }
    wrap.addEventListener('wheel', onWheel, { passive: false })
    return () => wrap.removeEventListener('wheel', onWheel)
  }, [applyTransform])

  const zoomBy = (factor) => {
    const { zoom } = viewRef.current
    viewRef.current.zoom = Math.max(0.08, Math.min(2.5, zoom * factor))
    applyTransform()
  }

  const resetZoom = () => {
    viewRef.current = { zoom: 1, panX: 0, panY: 0 }
    applyTransform()
  }

  // --- Buscador ---
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return TABLES.filter(
      (t) => t.name.toLowerCase().includes(q) || (t.comment || '').toLowerCase().includes(q),
    ).slice(0, 14)
  }, [query])

  useEffect(() => {
    const onDocClick = (e) => {
      if (!e.target.closest('#search-wrap')) setSearchOpen(false)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [])

  const detail = selected ? TABLE_MAP[selected] : null
  const detailCat = detail ? CATEGORIES[detail.category] || CATEGORIES.operacional : null

  return (
    <div className="legacy-root">
      <header>
        <div className="logo">
          SAF <span>/ Modelo Relacional</span>
        </div>
        <div className="stats">
          <div className="stat">
            <b>{kpis.tables}</b> tablas
          </div>
          <div className="stat">
            <b>{kpis.cols.toLocaleString()}</b> columnas
          </div>
          <div className="stat">
            <b>{kpis.fks}</b> relaciones
          </div>
          <div className="stat">
            <b>{kpis.rows.toLocaleString()}</b> registros
          </div>
        </div>
        <div className="header-right">
          <div id="search-wrap">
            <span className="search-icon">⌕</span>
            <input
              id="search"
              type="text"
              placeholder="Buscar tabla..."
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setSearchOpen(true)
              }}
            />
            {searchOpen && matches.length > 0 && (
              <div id="search-results" style={{ display: 'block' }}>
                {matches.map((t) => (
                  <div
                    className="sr-item"
                    key={t.name}
                    onClick={() => {
                      focusTable(t.name)
                      setQuery('')
                      setSearchOpen(false)
                    }}
                  >
                    <div
                      className="sr-cat-dot"
                      style={{ background: CATEGORIES[t.category]?.color || '#666' }}
                    />
                    <div>
                      <div>{t.name}</div>
                      {t.comment && <span className="sr-comment">{t.comment}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <button
            className={`btn${showGlobalLines ? ' active' : ''}`}
            onClick={() => setShowGlobalLines((v) => !v)}
          >
            Relaciones globales
          </button>
          <button className="btn" onClick={fitToView}>
            Ajustar
          </button>
          <button className="btn" onClick={clearSelection}>
            Limpiar
          </button>
        </div>
      </header>

      <div className="workspace">
        <div id="sidebar">
          <div className="sidebar-header">
            <span>Tablas ({kpis.tables})</span>
          </div>
          <div className="cat-filters" id="cat-filters">
            {Object.entries(CATEGORIES).map(([key, cat]) => (
              <button
                className={`cat-filter-btn${activeCats.has(key) ? ' active' : ''}`}
                data-cat={key}
                key={key}
                onClick={() => toggleCat(key)}
              >
                <div className="cat-pill-dot" style={{ background: cat.color }} />
                <span>{cat.label}</span>
                <span className="cat-count">{CAT_COUNTS[key] || 0}</span>
              </button>
            ))}
          </div>
          <div id="table-list" ref={listRef}>
            {SIDEBAR_TABLES.map((t) => (
              <div
                className={`tl-item${selected === t.name ? ' selected' : ''}${
                  activeCats.has(t.category) ? '' : ' hidden-item'
                }`}
                data-table={t.name}
                key={t.name}
                onClick={() => focusTable(t.name)}
              >
                <div
                  className="tl-cat-dot"
                  style={{ background: CATEGORIES[t.category]?.color || '#666' }}
                />
                {t.name}
              </div>
            ))}
          </div>
        </div>

        <div id="canvas-wrap" ref={wrapRef} onMouseDown={onCanvasMouseDown} onClick={onCanvasClick}>
          {loading && (
            <div id="loading">
              <div className="spinner" />
              <span>Construyendo modelo...</span>
            </div>
          )}
          <div id="focus-mode-bar" style={{ display: selected ? 'block' : 'none' }}>
            Modo foco — solo tabla seleccionada y sus relaciones
          </div>
          <svg id="svg-layer" ref={svgRef} />
          <div id="canvas" ref={canvasRef}>
            {TABLES.map((t) => (
              <TableCard
                key={t.name}
                table={t}
                hidden={!isVisible(t.name)}
                state={
                  selected
                    ? t.name === selected
                      ? 'highlighted'
                      : related.has(t.name)
                        ? 'related'
                        : ''
                    : ''
                }
              />
            ))}
          </div>
          <div className="zoom-controls">
            <button className="zoom-btn" onClick={() => zoomBy(1.2)}>
              +
            </button>
            <button className="zoom-btn" onClick={() => zoomBy(1 / 1.2)}>
              −
            </button>
            <button className="zoom-btn" style={{ fontSize: '9px' }} onClick={resetZoom}>
              1:1
            </button>
          </div>
          <div className="legend">
            {Object.entries(CATEGORIES).map(([k, c]) => (
              <div className="leg-item" key={k}>
                <div className="leg-dot" style={{ background: c.color }} />
                <span>{c.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div id="detail-panel" style={{ display: detail ? 'block' : 'none' }}>
        {detail && (
          <>
            <div className="dp-header">
              <div className="dp-title" style={{ color: detailCat.color }}>
                {detail.name}
              </div>
              <button className="dp-close" onClick={clearSelection}>
                ×
              </button>
            </div>
            <div className="dp-section">
              <div className="dp-section-title">Categoría</div>
              <div>
                <div
                  className="dp-cat-badge"
                  style={{
                    background: detailCat.color + '22',
                    color: detailCat.color,
                    border: `1px solid ${detailCat.color}44`,
                  }}
                >
                  {detailCat.label} — {detailCat.desc}
                </div>
              </div>
            </div>
            <div className="dp-section">
              <div className="dp-section-title">Métricas</div>
              <div className="dp-metrics">
                <div className="dp-metric">
                  <div className="dp-metric-val">{detail.num_rows.toLocaleString()}</div>
                  <div className="dp-metric-lbl">Filas</div>
                </div>
                <div className="dp-metric">
                  <div className="dp-metric-val">{detail.col_count}</div>
                  <div className="dp-metric-lbl">Columnas</div>
                </div>
                <div className="dp-metric">
                  <div className="dp-metric-val">{detail.fk_in}</div>
                  <div className="dp-metric-lbl">Referenciada por</div>
                </div>
                <div className="dp-metric">
                  <div className="dp-metric-val">{detail.fk_out}</div>
                  <div className="dp-metric-lbl">Referencia a</div>
                </div>
              </div>
            </div>
            <div className="dp-section">
              <div className="dp-section-title">Descripción</div>
              <div className="dp-comment">{detail.comment || '(sin descripción)'}</div>
            </div>
            <div className="dp-section">
              <div className="dp-section-title">→ Referencia a</div>
              <div>
                {FKS_BY_TABLE[detail.name].out.length === 0 ? (
                  <div style={{ fontSize: '10px', color: 'var(--text3)' }}>Ninguna</div>
                ) : (
                  FKS_BY_TABLE[detail.name].out.map((fk, i) => (
                    <div className="dp-rel" key={i} onClick={() => focusTable(fk.to_table)}>
                      <span style={{ color: 'var(--pk-color)' }}>{fk.from_col}</span>
                      <span style={{ color: 'var(--text3)' }}>→</span>
                      <span
                        style={{
                          color: CATEGORIES[TABLE_MAP[fk.to_table]?.category]?.color || '#aaa',
                        }}
                      >
                        {fk.to_table}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="dp-section">
              <div className="dp-section-title">← Referenciada por</div>
              <div>
                {FKS_BY_TABLE[detail.name].in.length === 0 ? (
                  <div style={{ fontSize: '10px', color: 'var(--text3)' }}>Ninguna</div>
                ) : (
                  FKS_BY_TABLE[detail.name].in.map((fk, i) => (
                    <div className="dp-rel" key={i} onClick={() => focusTable(fk.from_table)}>
                      <span
                        style={{
                          color: CATEGORIES[TABLE_MAP[fk.from_table]?.category]?.color || '#aaa',
                        }}
                      >
                        {fk.from_table}
                      </span>
                      <span style={{ color: 'var(--text3)' }}>→</span>
                      <span style={{ color: 'var(--fk-color)' }}>{fk.from_col}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
