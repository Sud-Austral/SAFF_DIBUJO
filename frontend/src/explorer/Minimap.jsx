// Minimapa: dónde estoy dentro de un lienzo que no cabe en pantalla.
// El fondo (los nodos) se dibuja una vez; el rectángulo de la vista se repinta
// en cada movimiento sobre una capa aparte, para no redibujar 327 puntos por frame.
import { useEffect, useRef } from 'react'
import { CATEGORIES, CATEGORY_ORDER } from '../lib/categories.js'
import { NODE_H, NODE_W } from './layout.js'

const WIDTH = 196
const MAX_HEIGHT = 150

export default function Minimap({ layout, index, visibleCats, theme, apiRef, onJump }) {
  const baseRef = useRef(null)
  const overlayRef = useRef(null)
  const scaleRef = useRef(1)

  useEffect(() => {
    const canvas = baseRef.current
    if (!canvas) return
    const scale = Math.min(WIDTH / layout.width, MAX_HEIGHT / layout.height)
    scaleRef.current = scale
    const w = Math.round(layout.width * scale)
    const h = Math.round(layout.height * scale)
    const dpr = window.devicePixelRatio || 1

    for (const c of [canvas, overlayRef.current]) {
      c.width = w * dpr
      c.height = h * dpr
      c.style.width = w + 'px'
      c.style.height = h + 'px'
    }

    const ctx = canvas.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)

    const colors =
      theme === 'light'
        ? { hub: '#be123c', transaccional: '#1d4ed8', relacional: '#047857', catalogo: '#6d28d9', estructural: '#a16207', operacional: '#8895a8' }
        : { hub: '#fb7185', transaccional: '#60a5fa', relacional: '#34d399', catalogo: '#c4b5fd', estructural: '#fbbf24', operacional: '#5b6879' }

    for (const [name, p] of layout.positions) {
      const table = index.tableMap.get(name)
      if (!visibleCats.has(table.category)) continue
      ctx.fillStyle = colors[table.category]
      const x = (p.x + NODE_W / 2) * scale
      const y = (p.y + NODE_H / 2) * scale
      const r = p.isHub ? 3 : table.fk_total > 3 ? 1.9 : 1.3
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
    }
  }, [layout, index, visibleCats, theme])

  useEffect(() => {
    if (!apiRef) return
    apiRef.current = {
      update(view) {
        const canvas = overlayRef.current
        if (!canvas || !view?.rect) return
        const scale = scaleRef.current
        const dpr = window.devicePixelRatio || 1
        const ctx = canvas.getContext('2d')
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        ctx.clearRect(0, 0, canvas.width, canvas.height)

        const x = (-view.panX / view.zoom) * scale
        const y = (-view.panY / view.zoom) * scale
        const w = (view.rect.width / view.zoom) * scale
        const h = (view.rect.height / view.zoom) * scale

        ctx.strokeStyle = theme === 'light' ? '#1d4ed8' : '#60a5fa'
        ctx.lineWidth = 1.5
        ctx.strokeRect(x, y, w, h)
        ctx.fillStyle = theme === 'light' ? 'rgba(29,78,216,0.08)' : 'rgba(96,165,250,0.1)'
        ctx.fillRect(x, y, w, h)
      },
    }
  }, [apiRef, theme])

  const jump = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    onJump({
      x: (e.clientX - rect.left) / scaleRef.current,
      y: (e.clientY - rect.top) / scaleRef.current,
    })
  }

  return (
    <div className="ex-minimap">
      <div style={{ position: 'relative' }} onClick={jump}>
        <canvas ref={baseRef} />
        <canvas ref={overlayRef} style={{ position: 'absolute', inset: 0 }} />
      </div>
      <div className="ex-legend">
        {CATEGORY_ORDER.map((key) => (
          <span key={key}>
            <i style={{ background: `var(--ex-c-${key})` }} />
            {CATEGORIES[key].label}
          </span>
        ))}
      </div>
    </div>
  )
}
