// Búsqueda transversal: entra a nombres de tabla, de columna y comentarios.
// El original solo miraba el nombre de la tabla, que es justo lo que el analista no
// sabe cuando busca "dónde está el rut".
//
// Las columnas se indexan por TOKENS (partiendo por _ y por may/min), no por subcadena:
// buscar "id" por subcadena devuelve COMU_ID, SOLI_ID, PRED_ID… es decir, casi todo el
// esquema, y un filtro que enciende todo no filtra nada.

const MAX_PER_GROUP = 10

function tokenize(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((t) => t.toLowerCase())
}

function scoreText(haystack, needle) {
  const h = haystack.toLowerCase()
  if (h === needle) return 100
  if (h.startsWith(needle)) return 72
  if (h.includes(needle)) return 44
  return 0
}

function scoreTokens(tokens, needle) {
  let best = 0
  for (const token of tokens) {
    if (token === needle) best = Math.max(best, 96)
    else if (token.startsWith(needle) && needle.length >= 3) best = Math.max(best, 62)
  }
  return best
}

/** Índice de tokens de columna, calculado una vez por esquema. */
export function buildSearchIndex(schema) {
  const columnTokens = new Map()
  for (const t of schema.tables) {
    for (const c of t.columns) {
      columnTokens.set(t.name + '.' + c.name, tokenize(c.name))
    }
  }
  return { columnTokens }
}

export function searchSchema(schema, searchIndex, rawQuery) {
  const q = rawQuery.trim().toLowerCase()
  if (q.length < 2) return { query: q, tables: [], columns: [], comments: [], counts: null }

  const tables = []
  const columns = []
  const comments = []

  for (const t of schema.tables) {
    const nameScore = scoreText(t.name, q)
    if (nameScore) tables.push({ table: t, score: nameScore + Math.min(t.fk_total, 20) })
    else if ((t.comment || '').toLowerCase().includes(q)) {
      comments.push({ table: t, score: 30, snippet: t.comment })
    }

    for (const c of t.columns) {
      const tokens = searchIndex.columnTokens.get(t.name + '.' + c.name) || []
      const score = scoreTokens(tokens, q)
      if (score) columns.push({ table: t, column: c, score })
      else if (q.length >= 4 && (c.comment || '').toLowerCase().includes(q)) {
        columns.push({ table: t, column: c, score: 22, viaComment: true })
      }
    }
  }

  const byScore = (a, b) => b.score - a.score || a.table.name.localeCompare(b.table.name)
  tables.sort(byScore)
  columns.sort(byScore)
  comments.sort(byScore)

  const columnTables = new Set(columns.map((c) => c.table.name))

  return {
    query: q,
    tables: tables.slice(0, MAX_PER_GROUP),
    columns: columns.slice(0, MAX_PER_GROUP),
    comments: comments.slice(0, MAX_PER_GROUP),
    counts: {
      tables: tables.length,
      columns: columns.length,
      comments: comments.length,
      columnTables: columnTables.size,
    },
    // Tablas a resaltar en el mapa: las que coinciden por nombre o contienen la columna.
    hits: new Set([...tables.map((t) => t.table.name), ...columnTables, ...comments.map((c) => c.table.name)]),
  }
}
