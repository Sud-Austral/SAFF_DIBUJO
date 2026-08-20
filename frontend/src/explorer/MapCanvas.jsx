// Lienzo del mapa de tablas.
//
// Tres decisiones que sostienen todo lo demás:
//
// 1. Los nodos NO se escalan con el zoom. El zoom mueve las posiciones; el chip mide
//    siempre lo mismo en pantalla. Así no hay bandas de zoom donde el texto sea de
//    3 px y el mapa no sirva para nada.
// 2. Qué nodo muestra su nombre y cuál se reduce a un punto se decide por COLISIÓN en
//    espacio de pantalla, por orden de importancia, no por umbrales de zoom fijos.
//    El resultado: siempre la máxima cantidad de nombres que caben sin pisarse.
// 3. El paneo y el zoom viven en una referencia y se escriben dentro de un rAF. React
//    no re-renderiza en cada muesca de rueda: con 327 nodos eso sería inusable.
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { NODE_H, NODE_W } from './layout.js'

const MIN_ZOOM_FACTOR = 0.85 // el suelo del zoom es relativo al encuadre, no una constante
const MAX_ZOOM = 3.2
const LABEL_PAD_X = 12
const LABEL_PAD_Y = 8
const CHIP_H = 28
const HUB_H = 34
// Desplazamientos de rótulo, en múltiplos de la altura del chip, en orden de preferencia.
const NUDGES = [0, -1, 1, -2, 2, -3, 3]

/** Ancho aproximado del chip: la fuente es monoespaciada, así que se puede estimar. */
function chipWidth(name, isHub) {
  const charW = isHub ? 8.2 : 7.3
  return Math.min(214, 34 + name.length * charW)
}

export default function MapCanvas({
  schema,
  index,
  layout,
  selected,
  neighbors,
  pathNodes,
  pathEdges,
  hits,
  visibleCats,
  showAllEdges,
  onSelect,
  onHover,
  onViewChange,
  focusToken,
  canvasRef,
  viewRef,
  apiRef,
}) {
  const wrapRef = canvasRef
  const nodesLayerRef = useRef(null)
  const edgeGroupRef = useRef(null)
  const zoneLayerRef = useRef(null)
  const elementsRef = useRef(new Map())
  const frameRef = useRef(0)
  const stateRef = useRef({})
  const focusedRef = useRef(null)

  // El estado que necesita el pintado imperativo se copia a una referencia dentro de un
  // efecto de layout: así el bucle de rAF lo lee sin depender del ciclo de React, y sin
  // escribir en una referencia durante el render.
  useLayoutEffect(() => {
    stateRef.current = { selected, neighbors, pathNodes, hits, visibleCats, layout, index }
  }, [selected, neighbors, pathNodes, hits, visibleCats, layout, index])

  // ---- Construcción única de los nodos del DOM ----
  useLayoutEffect(() => {
    const layer = nodesLayerRef.current
    if (!layer) return
    layer.textContent = ''
    const elements = new Map()

    for (const table of schema.tables) {
      const pos = layout.positions.get(table.name)
      if (!pos) continue
      const el = document.createElement('div')
      el.className = 'ex-node'
      el.dataset.table = table.name
      el.tabIndex = -1
      el.style.setProperty('--ex-cat', `var(--ex-c-${table.category})`)

      const label = document.createElement('span')
      label.className = 'ex-node-label'
      label.textContent = table.name

      const meta = document.createElement('span')
      meta.className = 'ex-node-meta'
      meta.textContent = table.fk_total > 0 ? `${table.fk_total}↔` : `${table.col_count}c`

      el.append(label, meta)
      layer.appendChild(el)
      elements.set(table.name, el)
    }

    elementsRef.current = elements
    return () => {
      elements.clear()
    }
  }, [schema, layout])

  // ---- Rótulos de zona (mundo → pantalla, tamaño constante) ----
  useLayoutEffect(() => {
    const layer = zoneLayerRef.current
    if (!layer) return
    layer.textContent = ''
    for (const zone of layout.zones) {
      const el = document.createElement('div')
      el.className = 'ex-zone'
      el.dataset.zone = zone.id
      el.innerHTML = `<b></b><span></span>`
      el.querySelector('b').textContent = zone.label
      el.querySelector('span').textContent = zone.hint
      layer.appendChild(el)
    }
  }, [layout])

  // ---- Pintado ----
  const paint = useCallback(() => {
    const wrap = wrapRef.current
    const layer = nodesLayerRef.current
    if (!wrap || !layer) return

    const { zoom, panX, panY } = viewRef.current
    const rect = wrap.getBoundingClientRect()
    const s = stateRef.current
    const elements = elementsRef.current

    if (edgeGroupRef.current) {
      edgeGroupRef.current.setAttribute('transform', `translate(${panX},${panY}) scale(${zoom})`)
    }

    // Orden de importancia: primero lo que el usuario está mirando (selección, ruta,
    // vecinos, resultados de búsqueda) y después el orden estructural por conectividad.
    // Quien va primero se queda con el hueco cuando dos etiquetas chocan.
    const priority = []
    if (s.selected) priority.push(s.selected)
    if (s.pathNodes) for (const n of s.pathNodes) priority.push(n)
    if (s.neighbors) for (const n of s.neighbors) priority.push(n)
    if (s.hits) for (const n of s.hits) priority.push(n)
    const order = priority.length
      ? [...new Set(priority), ...s.layout.renderOrder]
      : s.layout.renderOrder
    const done = new Set()
    const occupied = []
    let visibleCount = 0
    let labelled = 0

    const collides = (x, y, w, h) => {
      for (const box of occupied) {
        if (x < box.x + box.w && x + w > box.x && y < box.y + box.h && y + h > box.y) return true
      }
      return false
    }

    for (const name of order) {
      if (done.has(name)) continue
      done.add(name)
      const el = elements.get(name)
      if (!el) continue
      const table = s.index.tableMap.get(name)
      const pos = s.layout.positions.get(name)

      if (!s.visibleCats.has(table.category)) {
        el.style.display = 'none'
        continue
      }

      // El punto del layout es la esquina de una caja teórica; se usa su centro.
      const wx = pos.x + NODE_W / 2
      const wy = pos.y + NODE_H / 2
      const sx = wx * zoom + panX
      const sy = wy * zoom + panY

      if (sx < -240 || sy < -120 || sx > rect.width + 240 || sy > rect.height + 120) {
        el.style.display = 'none'
        continue
      }
      visibleCount++

      const isSelected = name === s.selected
      const isNeighbor = s.neighbors?.has(name)
      const isPath = s.pathNodes?.has(name)
      const isHit = s.hits?.has(name)
      const isHub = !!pos.isHub
      const pinned = isSelected || isPath
      const preferred = pinned || isNeighbor || isHit || isHub

      const h = isHub ? HUB_H : CHIP_H
      const w = chipWidth(name, isHub)
      const boxX = sx - w / 2
      const boxY = sy - h / 2
      const bw = w + LABEL_PAD_X * 2
      const bh = h + LABEL_PAD_Y * 2

      // Si la posición natural choca, se prueba a desplazar la etiqueta en vertical
      // —como los rótulos de un mapa— antes de renunciar a ella. Sin esto, dos hubs
      // cercanos a poco zoom se pisan y ninguno de los dos se lee.
      let placedY = null
      const step = h + 10
      for (const dy of preferred ? NUDGES : NUDGES.slice(0, 3)) {
        const candidateY = boxY + dy * step
        if (!collides(boxX - LABEL_PAD_X, candidateY - LABEL_PAD_Y, bw, bh)) {
          placedY = candidateY
          break
        }
      }
      // La tabla seleccionada y las de la ruta muestran su nombre aunque no haya hueco
      // limpio: son exactamente lo que se está mirando.
      if (placedY === null && pinned) placedY = boxY

      const asChip = placedY !== null
      if (asChip) {
        occupied.push({ x: boxX - LABEL_PAD_X, y: placedY - LABEL_PAD_Y, w: bw, h: bh })
        labelled++
      }

      const dim = 5.5
      el.style.display = ''
      el.style.transform = `translate3d(${(asChip ? boxX : sx - dim).toFixed(1)}px, ${(asChip ? placedY : sy - dim).toFixed(1)}px, 0)`

      // Se reconstruye la clase completa: es una sola escritura y evita estados pegados.
      let cls = 'ex-node'
      if (!asChip) cls += ' is-dot'
      if (isHub) cls += ' is-hub'
      if (isSelected) cls += ' is-selected'
      else if (isNeighbor) cls += ' is-neighbor'
      else if (isPath) cls += ' is-path'
      else if (isHit) cls += ' is-hit'
      else if (s.selected || s.pathNodes?.size || s.hits?.size) cls += ' is-muted'
      if (el.className !== cls) el.className = cls
    }

    // Rótulos de zona: posición del mundo, tamaño constante.
    const zoneLayer = zoneLayerRef.current
    if (zoneLayer) {
      for (const el of Array.from(zoneLayer.children)) {
        const zone = s.layout.zones.find((z) => z.id === el.dataset.zone)
        if (!zone) continue
        const zx = zone.centerX * zoom + panX
        const zy = (zone.y - 74) * zoom + panY
        el.style.transform = `translate(-50%, 0) translate3d(${zx.toFixed(0)}px, ${zy.toFixed(0)}px, 0)`
        el.style.display = zy < -60 || zy > rect.height + 40 ? 'none' : ''
      }
    }

    onViewChange?.({ zoom, panX, panY, visible: visibleCount, labelled, rect })
  }, [wrapRef, viewRef, onViewChange])

  const schedule = useCallback(() => {
    if (frameRef.current) return
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0
      paint()
    })
  }, [paint])

  // Repinta cuando cambia cualquier estado visual (no cuando cambia la vista: eso va por rAF).
  useEffect(() => {
    schedule()
  }, [schedule, selected, neighbors, pathNodes, hits, visibleCats, showAllEdges])

  const clampZoom = useCallback(
    (z) => {
      const rect = wrapRef.current?.getBoundingClientRect()
      if (!rect) return z
      const fit = Math.min(rect.width / layout.width, rect.height / layout.height)
      return Math.max(fit * MIN_ZOOM_FACTOR, Math.min(MAX_ZOOM, z))
    },
    [layout, wrapRef],
  )

  /** Encuadra un rectángulo del mundo dentro del lienzo real (no de la ventana). */
  const fitBox = useCallback(
    (box, margin = 0.88) => {
      const wrap = wrapRef.current
      if (!wrap) return
      const rect = wrap.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      const zoom = clampZoom(Math.min(rect.width / box.w, rect.height / box.h) * margin)
      viewRef.current = {
        zoom,
        panX: rect.width / 2 - (box.x + box.w / 2) * zoom,
        panY: rect.height / 2 - (box.y + box.h / 2) * zoom,
      }
      schedule()
    },
    [clampZoom, schedule, viewRef, wrapRef],
  )

  const centerOn = useCallback(
    (name, targetZoom) => {
      const wrap = wrapRef.current
      const pos = layout.positions.get(name)
      if (!wrap || !pos) return
      const rect = wrap.getBoundingClientRect()
      const zoom = clampZoom(targetZoom ?? Math.max(viewRef.current.zoom, 0.9))
      viewRef.current = {
        zoom,
        panX: rect.width / 2 - (pos.x + NODE_W / 2) * zoom,
        panY: rect.height / 2 - (pos.y + NODE_H / 2) * zoom,
      }
      schedule()
    },
    [clampZoom, layout, schedule, viewRef, wrapRef],
  )

  /** Encuadra el conjunto de tablas indicado (ruta, vecindad). */
  const fitNodes = useCallback(
    (names) => {
      const list = [...names].map((n) => layout.positions.get(n)).filter(Boolean)
      if (!list.length) return
      const x0 = Math.min(...list.map((p) => p.x))
      const y0 = Math.min(...list.map((p) => p.y))
      const x1 = Math.max(...list.map((p) => p.x + NODE_W))
      const y1 = Math.max(...list.map((p) => p.y + NODE_H))
      fitBox({ x: x0 - 160, y: y0 - 120, w: x1 - x0 + 320, h: y1 - y0 + 240 }, 0.9)
    },
    [fitBox, layout],
  )

  // Se expone lo justo para que el contenedor pueda encuadrar y centrar.
  useEffect(() => {
    if (!apiRef) return
    apiRef.current = {
      fitBox,
      fitNodes,
      centerOn,
      fitAll: () => fitBox({ x: 0, y: 0, w: layout.width, h: layout.height }),
      fitCore: () => fitBox(layout.coreBox),
      schedule,
    }
  }, [apiRef, fitBox, fitNodes, centerOn, layout, schedule])

  // Encuadre inicial: el núcleo, no el mundo entero. Encuadrar todo deja el zoom por
  // debajo de lo legible porque las zonas de tablas sueltas estiran el lienzo.
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    let fitted = false
    const run = () => {
      const rect = wrap.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      fitBox(layout.coreBox)
      fitted = true
    }
    run()
    // El primer encuadre depende de que el lienzo ya tenga tamaño; si al montar aún
    // no lo tiene, el observador lo resuelve en cuanto el layout se asienta.
    const observer = new ResizeObserver(() => (fitted ? schedule() : run()))
    observer.observe(wrap)
    return () => observer.disconnect()
  }, [layout, fitBox, schedule, wrapRef])

  // Petición externa de foco (búsqueda, lista lateral, enlace directo).
  useEffect(() => {
    if (focusToken?.name) centerOn(focusToken.name, focusToken.zoom)
  }, [focusToken, centerOn])

  // ---- Gestos ----
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return

    let panning = false
    let startX = 0
    let startY = 0
    let moved = false

    const onPointerDown = (e) => {
      if (e.button !== 0) return
      const node = e.target.closest('.ex-node')
      if (node) return
      panning = true
      moved = false
      startX = e.clientX - viewRef.current.panX
      startY = e.clientY - viewRef.current.panY
      wrap.classList.add('is-panning')
      wrap.setPointerCapture?.(e.pointerId)
    }

    const onPointerMove = (e) => {
      if (!panning) return
      viewRef.current.panX = e.clientX - startX
      viewRef.current.panY = e.clientY - startY
      moved = true
      schedule()
    }

    const onPointerUp = () => {
      panning = false
      wrap.classList.remove('is-panning')
    }

    const onWheel = (e) => {
      e.preventDefault()
      const rect = wrap.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      const { zoom, panX, panY } = viewRef.current
      const next = clampZoom(zoom * (e.deltaY > 0 ? 0.88 : 1.14))
      viewRef.current = {
        zoom: next,
        panX: mx - (mx - panX) * (next / zoom),
        panY: my - (my - panY) * (next / zoom),
      }
      schedule()
    }

    const onClick = (e) => {
      const node = e.target.closest('.ex-node')
      if (moved) return
      if (node) onSelect(node.dataset.table, e)
      else onSelect(null, e)
    }

    const onMove = (e) => {
      const node = e.target.closest('.ex-node')
      if (!node) {
        onHover(null)
        return
      }
      const rect = wrap.getBoundingClientRect()
      onHover({
        name: node.dataset.table,
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        width: rect.width,
      })
    }

    wrap.addEventListener('pointerdown', onPointerDown)
    wrap.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    wrap.addEventListener('wheel', onWheel, { passive: false })
    wrap.addEventListener('click', onClick)
    wrap.addEventListener('mousemove', onMove)
    wrap.addEventListener('mouseleave', () => onHover(null))

    return () => {
      wrap.removeEventListener('pointerdown', onPointerDown)
      wrap.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      wrap.removeEventListener('wheel', onWheel)
      wrap.removeEventListener('click', onClick)
      wrap.removeEventListener('mousemove', onMove)
    }
  }, [clampZoom, onHover, onSelect, schedule, viewRef, wrapRef])

  // ---- Teclado: una sola parada de tabulación para todo el lienzo (roving tabindex).
  // Dentro, las flechas mueven el foco al vecino más cercano en esa dirección.
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return

    const moveFocus = (dx, dy) => {
      const elements = elementsRef.current
      const from = focusedRef.current || selected || layout.hubs[0]
      const origin = layout.positions.get(from)
      if (!origin) return
      let best = null
      let bestScore = Infinity
      for (const [name, el] of elements) {
        if (name === from || el.style.display === 'none') continue
        const p = layout.positions.get(name)
        const vx = p.x - origin.x
        const vy = p.y - origin.y
        const along = vx * dx + vy * dy
        if (along <= 0) continue
        const off = Math.abs(vx * dy - vy * dx)
        const score = along + off * 2.5
        if (score < bestScore) {
          bestScore = score
          best = name
        }
      }
      if (best) {
        focusedRef.current = best
        centerOn(best)
        elementsRef.current.get(best)?.focus({ preventScroll: true })
      }
    }

    const onKeyDown = (e) => {
      const keys = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] }
      if (keys[e.key]) {
        e.preventDefault()
        moveFocus(...keys[e.key])
        return
      }
      if (e.key === 'Enter' || e.key === ' ') {
        if (focusedRef.current) {
          e.preventDefault()
          onSelect(focusedRef.current, e)
        }
      }
    }

    wrap.addEventListener('keydown', onKeyDown)
    return () => wrap.removeEventListener('keydown', onKeyDown)
  }, [centerOn, layout, onSelect, selected, wrapRef])

  const edges = []
  if (pathEdges?.length) {
    pathEdges.forEach((hop, i) => {
      const a = layout.positions.get(hop.from)
      const b = layout.positions.get(hop.to)
      if (a && b) edges.push({ key: `p${i}`, cls: 'is-path', a, b })
    })
  }
  if (selected) {
    for (const fk of index.edges.get(selected)?.out || []) {
      const a = layout.positions.get(fk.from_table)
      const b = layout.positions.get(fk.to_table)
      if (a && b && fk.from_table !== fk.to_table) edges.push({ key: `o${fk.from_col}${fk.to_table}`, cls: 'is-out', a, b })
    }
    for (const fk of index.edges.get(selected)?.in || []) {
      const a = layout.positions.get(fk.from_table)
      const b = layout.positions.get(fk.to_table)
      if (a && b && fk.from_table !== fk.to_table) edges.push({ key: `i${fk.from_table}${fk.from_col}`, cls: 'is-in', a, b })
    }
  } else if (showAllEdges) {
    schema.fks.forEach((fk, i) => {
      if (fk.from_table === fk.to_table) return
      const a = layout.positions.get(fk.from_table)
      const b = layout.positions.get(fk.to_table)
      const ta = index.tableMap.get(fk.from_table)
      const tb = index.tableMap.get(fk.to_table)
      if (!a || !b || !visibleCats.has(ta.category) || !visibleCats.has(tb.category)) return
      edges.push({ key: `a${i}`, cls: 'is-ambient', a, b })
    })
  }

  return (
    <div className="ex-canvas" ref={wrapRef} tabIndex={0} role="application" aria-label="Mapa de tablas">
      <svg className="ex-edges">
        <g ref={edgeGroupRef}>
          {edges.map((e) => {
            const x1 = e.a.x + NODE_W / 2
            const y1 = e.a.y + NODE_H / 2
            const x2 = e.b.x + NODE_W / 2
            const y2 = e.b.y + NODE_H / 2
            const mx = (x1 + x2) / 2 - (y2 - y1) * 0.09
            const my = (y1 + y2) / 2 + (x2 - x1) * 0.09
            return <path key={e.key} className={`ex-edge ${e.cls}`} d={`M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`} />
          })}
        </g>
      </svg>
      <div className="ex-nodes" ref={nodesLayerRef} />
      <div className="ex-nodes" ref={zoneLayerRef} />
    </div>
  )
}
