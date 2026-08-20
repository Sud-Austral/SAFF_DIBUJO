// Disposición espacial del mapa de tablas.
//
// El original ponía las 327 tablas en una grilla de 10 columnas ordenada por número de
// relaciones: la posición no significaba nada. Aquí la posición SÍ significa algo:
//
//   - El grafo de claves foráneas no es una sola pieza. En SAFF hay 74 componentes
//     (la mayor con 249 tablas y 71 tablas totalmente aisladas) y en SIDCO 27
//     (la mayor con 68 y 26 aisladas). Mezclarlas en una sola nube es mentir sobre la
//     estructura, así que cada grupo tiene su propia zona.
//   - Dentro del núcleo, las tablas más referenciadas (hubs) reparten el círculo en
//     sectores y el resto orbita alrededor del hub del que está más cerca. La distancia
//     al centro es la distancia real en saltos de FK.
//
// Todo es determinista: mismas entradas, mismas posiciones en cada recarga.

export const NODE_W = 184
export const NODE_H = 44

// Comparador por punto de código, NO localeCompare: su resultado depende de los datos
// de locale del navegador. Sobre SAF los dos criterios difieren en 90 de 327 nombres,
// y como el orden decide qué nodo ocupa cada hueco, el mapa saldría distinto según el
// equipo. La posición de una tabla no puede depender de eso.
const byName = (a, b) => (a < b ? -1 : a > b ? 1 : 0)

const SLOT_ARC = NODE_W + 34 // arco mínimo que ocupa un nodo dentro de un anillo
const RING_GAP = 150 // separación entre anillos de distancia
const SUB_RING_GAP = 78 // separación cuando un anillo no cabe de una vez
const HUB_RADIUS = 330 // radio donde se sientan los hubs
const MIN_SWEEP = 0.34 // ningún sector puede ser tan estrecho que no quepa un nodo
const ZONE_GAP = 210
const BAND_MAX_W = 2400

/** Componentes conexas del grafo no dirigido de FK. */
function connectedComponents(names, neighbors) {
  const seen = new Set()
  const components = []
  for (const name of names) {
    if (seen.has(name)) continue
    const queue = [name]
    seen.add(name)
    const members = []
    while (queue.length) {
      const current = queue.shift()
      members.push(current)
      for (const next of neighbors.get(current) || []) {
        if (seen.has(next)) continue
        seen.add(next)
        queue.push(next)
      }
    }
    components.push(members)
  }
  return components.sort((a, b) => b.length - a.length || byName(a[0], b[0]))
}

/** Reparte nodos sobre un arco, abriendo sub-anillos hacia afuera si no caben. */
function placeOnArc(list, { baseRadius, midAngle, sweep, positions, meta }) {
  let placed = 0
  let sub = 0
  while (placed < list.length) {
    const radius = baseRadius + sub * SUB_RING_GAP
    const capacity = Math.max(1, Math.floor((radius * sweep) / SLOT_ARC))
    const chunk = list.slice(placed, placed + capacity)
    chunk.forEach((name, i) => {
      const t = chunk.length === 1 ? 0.5 : (i + 0.5) / chunk.length
      const angle = midAngle - sweep / 2 + t * sweep
      // La caja se centra en el punto del anillo; si se anclara por la esquina,
      // los nodos del lado izquierdo invadirían el anillo interior.
      positions.set(name, {
        x: radius * Math.cos(angle) - NODE_W / 2,
        y: radius * Math.sin(angle) - NODE_H / 2,
        ...meta,
      })
    })
    placed += capacity
    sub++
  }
  return sub
}

function layoutCore(members, index, positions) {
  const byDegree = [...members].sort(
    (a, b) =>
      index.tableMap.get(b).fk_in - index.tableMap.get(a).fk_in ||
      index.tableMap.get(b).fk_total - index.tableMap.get(a).fk_total ||
      byName(a, b),
  )

  // Cuántos hubs reparten el círculo: pocos para modelos chicos, más para grandes.
  const hubCount = Math.max(3, Math.min(8, Math.round(Math.sqrt(members.length) / 1.5)))
  const hubs = byDegree.slice(0, hubCount)

  // BFS multi-origen: cada tabla queda asignada al hub más cercano, con su distancia.
  const owner = new Map()
  const dist = new Map()
  const queue = []
  hubs.forEach((hub, i) => {
    owner.set(hub, i)
    dist.set(hub, 0)
    queue.push(hub)
  })
  while (queue.length) {
    const current = queue.shift()
    for (const next of index.neighbors.get(current) || []) {
      if (owner.has(next)) continue
      owner.set(next, owner.get(current))
      dist.set(next, dist.get(current) + 1)
      queue.push(next)
    }
  }

  // El sector de cada hub es proporcional a cuántas tablas orbitan en él, con un mínimo
  // para que un hub con pocos satélites siga siendo legible. Se renormaliza a 2π para
  // que ese mínimo no haga que unos sectores invadan a otros.
  const owned = hubs.map(() => 0)
  for (const name of members) {
    const o = owner.get(name)
    if (o !== undefined) owned[o]++
  }
  const total = owned.reduce((a, b) => a + b, 0) || 1
  const raw = owned.map((n) => Math.max((n / total) * Math.PI * 2, MIN_SWEEP))
  const rawTotal = raw.reduce((a, b) => a + b, 0)
  const sweeps = raw.map((s) => (s / rawTotal) * Math.PI * 2)

  let angle = -Math.PI / 2 // se empieza arriba para que el hub principal quede visible
  let maxRadius = HUB_RADIUS

  hubs.forEach((hub, i) => {
    const sweep = sweeps[i]
    const mid = angle + sweep / 2

    positions.set(hub, {
      x: HUB_RADIUS * Math.cos(mid) - NODE_W / 2,
      y: HUB_RADIUS * Math.sin(mid) - NODE_H / 2,
      zone: 'core',
      ring: 0,
      hub: i,
      isHub: true,
    })

    const byRing = new Map()
    for (const name of members) {
      if (owner.get(name) !== i || name === hub) continue
      const d = dist.get(name) ?? 1
      if (!byRing.has(d)) byRing.set(d, [])
      byRing.get(d).push(name)
    }

    for (const [d, list] of [...byRing.entries()].sort((a, b) => a[0] - b[0])) {
      list.sort(
        (a, b) =>
          index.tableMap.get(b).fk_total - index.tableMap.get(a).fk_total || byName(a, b),
      )
      const baseRadius = HUB_RADIUS + d * RING_GAP
      const subRings = placeOnArc(list, {
        baseRadius,
        midAngle: mid,
        sweep,
        positions,
        meta: { zone: 'core', ring: d, hub: i },
      })
      maxRadius = Math.max(maxRadius, baseRadius + (subRings - 1) * SUB_RING_GAP)
    }

    angle += sweep
  })

  return { hubs, radius: maxRadius }
}

/** Componentes pequeñas: cada una como un bloque compacto, en una banda centrada. */
function layoutClusters(components, index, positions, startY) {
  const blocks = components.map((members) => {
    const sorted = [...members].sort(
      (a, b) =>
        index.tableMap.get(b).fk_total - index.tableMap.get(a).fk_total || byName(a, b),
    )
    const cols = Math.min(3, sorted.length)
    return {
      sorted,
      cols,
      w: cols * (NODE_W + 26),
      h: Math.ceil(sorted.length / cols) * (NODE_H + 26),
    }
  })

  // Se reparten en filas y cada fila se centra respecto al eje del núcleo.
  const rows = []
  let row = []
  let rowW = 0
  for (const block of blocks) {
    if (rowW + block.w > BAND_MAX_W && row.length) {
      rows.push({ blocks: row, width: rowW })
      row = []
      rowW = 0
    }
    row.push(block)
    rowW += block.w + 46
  }
  if (row.length) rows.push({ blocks: row, width: rowW })

  let y = startY
  const boxes = []
  for (const r of rows) {
    let x = -(r.width - 46) / 2
    let rowH = 0
    for (const block of r.blocks) {
      block.sorted.forEach((name, i) => {
        positions.set(name, {
          x: x + (i % block.cols) * (NODE_W + 26),
          y: y + Math.floor(i / block.cols) * (NODE_H + 26),
          zone: 'cluster',
          ring: 0,
        })
      })
      boxes.push({ x: x - 16, y: y - 16, w: block.w, h: block.h, size: block.sorted.length })
      x += block.w + 46
      rowH = Math.max(rowH, block.h)
    }
    y += rowH + 56
  }

  return { height: y - startY, boxes }
}

/** Tablas sin ninguna relación: rejilla alfabética centrada, fuera del grafo. */
function layoutIsolated(names, positions, startY) {
  const sorted = [...names].sort(byName)
  const cols = Math.max(1, Math.min(10, Math.ceil(Math.sqrt(sorted.length * 2.2))))
  const width = cols * (NODE_W + 22)
  const left = -(width - 22) / 2
  sorted.forEach((name, i) => {
    positions.set(name, {
      x: left + (i % cols) * (NODE_W + 22),
      y: startY + Math.floor(i / cols) * (NODE_H + 20),
      zone: 'isolated',
      ring: 0,
    })
  })
  return { height: Math.ceil(sorted.length / cols) * (NODE_H + 20), width }
}

/**
 * Red de seguridad: separa cualquier par que aún se solape.
 * El orden de recorrido es alfabético, así que el resultado es reproducible.
 */
function relax(positions) {
  const entries = [...positions.entries()].sort((a, b) => byName(a[0], b[0]))
  const CELL_W = NODE_W + 8
  const CELL_H = NODE_H + 8

  for (let pass = 0; pass < 90; pass++) {
    const grid = new Map()
    for (const [name, p] of entries) {
      const gx = Math.floor(p.x / CELL_W)
      const gy = Math.floor(p.y / CELL_H)
      for (let dx = 0; dx <= 1; dx++) {
        for (let dy = 0; dy <= 1; dy++) {
          const key = `${gx + dx},${gy + dy}`
          if (!grid.has(key)) grid.set(key, [])
          grid.get(key).push(name)
        }
      }
    }

    let moved = 0
    const checked = new Set()
    for (const bucket of grid.values()) {
      for (let i = 0; i < bucket.length; i++) {
        for (let j = i + 1; j < bucket.length; j++) {
          const a = bucket[i]
          const b = bucket[j]
          const pairKey = a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`
          if (checked.has(pairKey)) continue
          checked.add(pairKey)

          const pa = positions.get(a)
          const pb = positions.get(b)
          if (pa.zone !== pb.zone) continue
          const dx = pb.x - pa.x
          const dy = pb.y - pa.y
          const overlapX = NODE_W + 10 - Math.abs(dx)
          const overlapY = NODE_H + 8 - Math.abs(dy)
          if (overlapX <= 0 || overlapY <= 0) continue

          // Se empuja por el eje de menor penetración: mueve menos y deforma menos.
          if (overlapX / (NODE_W + 10) < overlapY / (NODE_H + 8)) {
            const push = (overlapX / 2) * (dx >= 0 ? 1 : -1)
            pa.x -= push
            pb.x += push
          } else {
            const push = (overlapY / 2) * (dy >= 0 ? 1 : -1)
            pa.y -= push
            pb.y += push
          }
          moved++
        }
      }
    }
    if (!moved) break
  }
}

export function computeLayout(schema, index) {
  const names = schema.tables.map((t) => t.name)
  const components = connectedComponents(names, index.neighbors)

  const core = components.find((c) => c.length > 2) || []
  const clusters = components.filter((c) => c !== core && c.length > 1)
  const isolated = components.filter((c) => c.length === 1).map((c) => c[0])

  const positions = new Map()
  const zones = []

  const coreInfo = core.length ? layoutCore(core, index, positions) : { hubs: [], radius: 0 }
  relax(positions)

  // Las zonas cuelgan bajo el núcleo, centradas en el mismo eje.
  let coreBottom = 0
  for (const p of positions.values()) coreBottom = Math.max(coreBottom, p.y + NODE_H)
  let cursorY = coreBottom + ZONE_GAP

  if (clusters.length) {
    const res = layoutClusters(clusters, index, positions, cursorY)
    zones.push({
      id: 'clusters',
      label: `${clusters.length} ${clusters.length === 1 ? 'grupo aparte' : 'grupos aparte'}`,
      hint: 'Tablas relacionadas entre sí, pero no con el núcleo del modelo',
      y: cursorY,
      height: res.height,
      boxes: res.boxes,
    })
    cursorY += res.height + ZONE_GAP
  }

  if (isolated.length) {
    const res = layoutIsolated(isolated, positions, cursorY)
    zones.push({
      id: 'isolated',
      label: `${isolated.length} tablas sin relaciones`,
      hint: 'No declaran claves foráneas: no se conectan con ninguna otra tabla',
      y: cursorY,
      height: res.height,
      width: res.width,
    })
    cursorY += res.height
  }

  // Se normaliza a coordenadas positivas para simplificar encuadre y minimapa.
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of positions.values()) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x + NODE_W)
    maxY = Math.max(maxY, p.y + NODE_H)
  }
  const pad = 140
  const shiftX = pad - minX
  const shiftY = pad - minY
  for (const p of positions.values()) {
    p.x += shiftX
    p.y += shiftY
  }
  for (const zone of zones) {
    zone.y += shiftY
    zone.centerX = shiftX
    if (zone.boxes) {
      for (const box of zone.boxes) {
        box.x += shiftX
        box.y += shiftY
      }
    }
  }

  // Caja del núcleo: es el encuadre inicial. Encuadrar el mundo entero deja el zoom por
  // debajo de lo legible, porque las zonas de tablas sueltas estiran mucho el lienzo.
  let coreBox = null
  for (const p of positions.values()) {
    if (p.zone !== 'core') continue
    coreBox = coreBox || { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }
    coreBox.x0 = Math.min(coreBox.x0, p.x)
    coreBox.y0 = Math.min(coreBox.y0, p.y)
    coreBox.x1 = Math.max(coreBox.x1, p.x + NODE_W)
    coreBox.y1 = Math.max(coreBox.y1, p.y + NODE_H)
  }
  const box = coreBox
    ? { x: coreBox.x0 - 60, y: coreBox.y0 - 60, w: coreBox.x1 - coreBox.x0 + 120, h: coreBox.y1 - coreBox.y0 + 120 }
    : { x: 0, y: 0, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 }

  // Orden de pintado: quien tiene prioridad para quedarse con su etiqueta cuando dos
  // chips chocan en pantalla. Hubs primero, luego conectividad y volumen.
  const renderOrder = schema.tables
    .map((t) => t)
    .sort(
      (a, b) =>
        Number(!!positions.get(b.name)?.isHub) - Number(!!positions.get(a.name)?.isHub) ||
        b.fk_total - a.fk_total ||
        b.num_rows - a.num_rows ||
        byName(a.name, b.name),
    )
    .map((t) => t.name)

  return {
    positions,
    hubs: coreInfo.hubs,
    zones,
    renderOrder,
    coreBox: box,
    coreCenter: { x: shiftX, y: shiftY },
    coreRadius: coreInfo.radius,
    width: maxX - minX + pad * 2,
    height: maxY - minY + pad * 2,
  }
}
