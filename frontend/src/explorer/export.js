// Exportaciones del explorador. Sin dependencias: el CSV se arma a mano y el PNG se
// obtiene dibujando un SVG del encuadre actual sobre un <canvas>.

function download(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Se libera en el siguiente tick: revocar de inmediato cancela la descarga en Firefox.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const csvCell = (value) => {
  const text = value == null ? '' : String(value)
  return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** Columnas de una tabla, con sus claves y relaciones, en CSV para Excel en español. */
export function exportTableCsv(table, edges) {
  const pks = new Set(table.pks)
  const outByCol = new Map()
  for (const fk of edges.out) outByCol.set(fk.from_col, `${fk.to_table}.${fk.to_col}`)

  const header = ['COLUMNA', 'TIPO', 'NULO', 'CLAVE', 'REFERENCIA', 'DEFECTO', 'COMENTARIO']
  const rows = table.columns.map((c) => [
    c.name,
    c.type,
    c.nullable ? 'SI' : 'NO',
    pks.has(c.name) ? 'PK' : outByCol.has(c.name) ? 'FK' : '',
    outByCol.get(c.name) || '',
    c.default || '',
    (c.comment || '').replace(/\n/g, ' '),
  ])

  // Separador ; y BOM: es lo que Excel en configuración regional chilena espera.
  const csv = '﻿' + [header, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n')
  download(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${table.name}_columnas.csv`)
}

/** Todo el diccionario del esquema (una fila por columna). */
export function exportSchemaCsv(schema, index) {
  const header = [
    'TABLA', 'CATEGORIA', 'FILAS', 'COMENTARIO_TABLA',
    'COLUMNA', 'TIPO', 'NULO', 'CLAVE', 'REFERENCIA', 'COMENTARIO_COLUMNA',
  ]
  const rows = []
  for (const table of schema.tables) {
    const pks = new Set(table.pks)
    const outByCol = new Map()
    for (const fk of index.edges.get(table.name).out) outByCol.set(fk.from_col, `${fk.to_table}.${fk.to_col}`)
    for (const c of table.columns) {
      rows.push([
        table.name,
        table.category,
        table.num_rows,
        (table.comment || '').replace(/\n/g, ' '),
        c.name,
        c.type,
        c.nullable ? 'SI' : 'NO',
        pks.has(c.name) ? 'PK' : outByCol.has(c.name) ? 'FK' : '',
        outByCol.get(c.name) || '',
        (c.comment || '').replace(/\n/g, ' '),
      ])
    }
  }
  const csv = '﻿' + [header, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n')
  download(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${schema.meta.id}_diccionario.csv`)
}

const escapeXml = (s) =>
  String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c])

/**
 * PNG del encuadre actual. Se reconstruye la vista como SVG y se rasteriza en un
 * <canvas>; así la imagen sale nítida y no hace falta ninguna librería.
 */
export function exportViewPng({ schema, index, layout, view, rect, visibleCats, edges, title, theme }) {
  const scale = 2
  const W = Math.round(rect.width)
  const H = Math.round(rect.height)
  const { zoom, panX, panY } = view

  const palette =
    theme === 'light'
      ? { bg: '#ffffff', text: '#0f172a', sub: '#5b6879', chip: '#ffffff', line: '#b9c4d3' }
      : { bg: '#0b0e14', text: '#e6edf7', sub: '#8593a8', chip: '#161b24', line: '#313a4a' }
  const catColors =
    theme === 'light'
      ? { hub: '#be123c', transaccional: '#1d4ed8', relacional: '#047857', catalogo: '#6d28d9', estructural: '#a16207', operacional: '#475569' }
      : { hub: '#fb7185', transaccional: '#60a5fa', relacional: '#34d399', catalogo: '#c4b5fd', estructural: '#fbbf24', operacional: '#94a3b8' }

  const parts = []
  parts.push(`<rect width="${W}" height="${H}" fill="${palette.bg}"/>`)

  for (const e of edges) {
    const x1 = (e.a.x + 92) * zoom + panX
    const y1 = (e.a.y + 22) * zoom + panY
    const x2 = (e.b.x + 92) * zoom + panX
    const y2 = (e.b.y + 22) * zoom + panY
    parts.push(
      `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${palette.line}" stroke-width="1.4"/>`,
    )
  }

  for (const name of layout.renderOrder) {
    const table = index.tableMap.get(name)
    if (!visibleCats.has(table.category)) continue
    const pos = layout.positions.get(name)
    const sx = (pos.x + 92) * zoom + panX
    const sy = (pos.y + 22) * zoom + panY
    if (sx < -220 || sy < -60 || sx > W + 220 || sy > H + 60) continue

    const color = catColors[table.category]
    const w = Math.min(214, 34 + name.length * 7.3)
    const h = pos.isHub ? 34 : 28
    const x = sx - w / 2
    const y = sy - h / 2
    parts.push(
      `<g><rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h}" rx="7" fill="${palette.chip}" stroke="${color}" stroke-width="1.5"/>` +
        `<rect x="${(x + 7).toFixed(1)}" y="${(y + h / 2 - 7).toFixed(1)}" width="4" height="14" rx="2" fill="${color}"/>` +
        `<text x="${(x + 18).toFixed(1)}" y="${(y + h / 2 + 4).toFixed(1)}" fill="${palette.text}" font-family="monospace" font-size="${pos.isHub ? 13.5 : 12}" font-weight="${pos.isHub ? 700 : 400}">${escapeXml(name)}</text></g>`,
    )
  }

  parts.push(
    `<text x="16" y="${H - 14}" fill="${palette.sub}" font-family="sans-serif" font-size="12">${escapeXml(title)} · ${schema.tables.length} tablas · ${schema.fks.length} relaciones</text>`,
  )

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${parts.join('')}</svg>`
  const image = new Image()
  image.onload = () => {
    const canvas = document.createElement('canvas')
    canvas.width = W * scale
    canvas.height = H * scale
    const ctx = canvas.getContext('2d')
    ctx.scale(scale, scale)
    ctx.drawImage(image, 0, 0)
    canvas.toBlob((blob) => {
      if (blob) download(blob, `${schema.meta.id}_mapa.png`)
    }, 'image/png')
  }
  image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
}
