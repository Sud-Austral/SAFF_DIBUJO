// Índice y algoritmos de grafo sobre un esquema.
// Un esquema es { meta, tables[], fks[] }; los dos datasets comparten esta forma.

export function buildIndex(schema) {
  const tableMap = new Map(schema.tables.map((t) => [t.name, t]))

  const edges = new Map() // tabla -> { out: [], in: [] }
  for (const t of schema.tables) edges.set(t.name, { out: [], in: [] })
  for (const fk of schema.fks) {
    edges.get(fk.from_table)?.out.push(fk)
    edges.get(fk.to_table)?.in.push(fk)
  }

  // Adyacencia no dirigida: para "cómo se conectan A y B" da igual el sentido de la FK.
  const neighbors = new Map()
  for (const t of schema.tables) neighbors.set(t.name, new Set())
  for (const fk of schema.fks) {
    if (fk.from_table === fk.to_table) continue
    neighbors.get(fk.from_table)?.add(fk.to_table)
    neighbors.get(fk.to_table)?.add(fk.from_table)
  }

  return { schema, tableMap, edges, neighbors }
}

/** Vecinas directas de una tabla (por FK en cualquier sentido). */
export function relatedTables(index, name) {
  return index.neighbors.get(name) || new Set()
}

/**
 * Camino más corto entre dos tablas por claves foráneas (BFS no dirigido).
 * Devuelve la lista de nodos y la lista de saltos con la FK que los une.
 */
export function shortestPath(index, from, to) {
  if (!index.tableMap.has(from) || !index.tableMap.has(to)) return null
  if (from === to) return { nodes: [from], hops: [] }

  const prev = new Map([[from, null]])
  const queue = [from]
  let found = false

  while (queue.length && !found) {
    const current = queue.shift()
    for (const next of index.neighbors.get(current) || []) {
      if (prev.has(next)) continue
      prev.set(next, current)
      if (next === to) {
        found = true
        break
      }
      queue.push(next)
    }
  }
  if (!found) return null

  const nodes = []
  for (let at = to; at !== null; at = prev.get(at)) nodes.unshift(at)

  const hops = []
  for (let i = 0; i < nodes.length - 1; i++) {
    const a = nodes[i]
    const b = nodes[i + 1]
    const fk =
      index.edges.get(a).out.find((f) => f.to_table === b) ||
      index.edges.get(b).out.find((f) => f.to_table === a)
    hops.push({ from: a, to: b, fk, forward: fk?.from_table === a })
  }
  return { nodes, hops }
}

/** Conteo de tablas por categoría, para filtros y leyendas. */
export function countByCategory(tables) {
  const counts = {}
  for (const t of tables) counts[t.category] = (counts[t.category] || 0) + 1
  return counts
}

/**
 * Cierre transitivo de dependencias: todo lo que acabaría afectado si esta tabla
 * cambia o desaparece, no solo lo que la referencia directamente.
 * "comuna" tiene 7 dependientes directas y 54 en el cierre: la diferencia es
 * justo la pregunta que el analista está haciendo.
 */
export function impactClosure(index, name) {
  const seen = new Set([name])
  const queue = [name]
  while (queue.length) {
    const current = queue.shift()
    for (const fk of index.edges.get(current)?.in || []) {
      if (seen.has(fk.from_table)) continue
      seen.add(fk.from_table)
      queue.push(fk.from_table)
    }
  }
  seen.delete(name)
  let rows = 0
  for (const t of seen) rows += index.tableMap.get(t)?.num_rows || 0
  return { tables: seen, rows }
}

/**
 * Destino canónico de cada nombre de columna, aprendido de las FK declaradas:
 * si PRED_CODIGO apunta a PREDIO.PRED_CODIGO en la mayoría de los casos, ese es
 * su destino canónico.
 */
function canonicalColumnTargets(schema) {
  const tally = new Map()
  for (const fk of schema.fks) {
    if (!tally.has(fk.from_col)) tally.set(fk.from_col, new Map())
    const targets = tally.get(fk.from_col)
    const key = `${fk.to_table}.${fk.to_col}`
    targets.set(key, (targets.get(key) || 0) + 1)
  }
  const canonical = new Map()
  for (const [col, targets] of tally) {
    let total = 0
    let best = null
    let bestCount = 0
    for (const [key, count] of targets) {
      total += count
      if (count > bestCount || (count === bestCount && best && key < best)) {
        best = key
        bestCount = count
      }
    }
    // Se exige mayoría clara: un empate no enseña ninguna convención.
    if (best && bestCount / total >= 0.6) canonical.set(col, best)
  }
  return canonical
}

/**
 * Relaciones que el modelo NO declara pero que el nombre de la columna sugiere.
 * Nunca se suman a las relaciones declaradas ni se dibujan como si lo fueran: se
 * muestran aparte y etiquetadas como probables. Es lo que explica que tablas
 * enormes como `log` (1.564 millones de filas) figuren como "sin relaciones".
 */
export function inferRelations(schema, index) {
  const canonical = canonicalColumnTargets(schema)
  const byTable = new Map()
  for (const table of schema.tables) {
    const declared = new Set(table.fk_cols)
    const found = []
    for (const column of table.columns) {
      if (declared.has(column.name)) continue
      let target = canonical.get(column.name)
      let via = 'exacta'
      if (!target) {
        // Segundo nivel: la columna TERMINA en una canónica (log_perf_id -> perf_id).
        // Aporta muy pocas aristas, pero rescata tablas enormes que de otro modo
        // aparecen como "sin relaciones": `log` tiene 1.564 millones de filas.
        let longest = ''
        for (const key of canonical.keys()) {
          if (key.length > longest.length && column.name.endsWith('_' + key)) longest = key
        }
        if (longest) {
          target = canonical.get(longest)
          via = 'sufijo'
        }
      }
      if (!target) continue
      const [toTable, toCol] = target.split('.')
      if (toTable === table.name || !index.tableMap.has(toTable)) continue
      found.push({ from_col: column.name, to_table: toTable, to_col: toCol, via })
    }
    if (found.length) byTable.set(table.name, found)
  }
  return byTable
}
