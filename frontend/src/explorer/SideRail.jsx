// Riel izquierdo: buscar, filtrar y recorrer el índice de tablas.
import { useMemo } from 'react'
import { CATEGORIES, CATEGORY_ORDER } from '../lib/categories.js'
import { formatCompact } from '../lib/format.js'

/** Resalta el fragmento consultado dentro del texto del resultado. */
function Hi({ text, q }) {
  const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1
  if (i < 0) return text
  return (
    <>
      {text.slice(0, i)}
      <mark>{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  )
}

function SearchResults({ results, onGo }) {
  const { counts, query } = results

  if (!counts) {
    return (
      <div className="ex-results-empty">
        Busca por nombre de tabla, de columna o por lo que dice su comentario. Ejemplos:{' '}
        <code>rut</code>, <code>incendio</code>, <code>fecha</code>.
      </div>
    )
  }

  const nothing = counts.tables + counts.columns + counts.comments === 0
  if (nothing) {
    return <div className="ex-results-empty">Sin coincidencias para «{query}».</div>
  }

  return (
    <>
      {/* Caso frecuente en estos esquemas: el concepto existe, pero como columna
          repartida en muchas tablas y no como tabla propia. Se dice explícitamente. */}
      {counts.tables === 0 && counts.columns > 0 && (
        <div className="ex-results-empty" style={{ marginBottom: 8 }}>
          No existe ninguna tabla llamada «{query}»: aparece como columna en{' '}
          <b>{counts.columnTables} tablas</b>.
        </div>
      )}

      {results.tables.length > 0 && (
        <>
          <div className="ex-group-title">Tablas ({counts.tables})</div>
          {results.tables.map(({ table }) => (
            <button className="ex-res" key={table.name} onClick={() => onGo(table.name)}>
              <span className="ex-res-dot" style={{ background: `var(--ex-c-${table.category})` }} />
              <span>
                <Hi text={table.name} q={query} />
              </span>
              <span className="ex-res-sub" style={{ marginLeft: 'auto' }}>
                {table.col_count}c
              </span>
            </button>
          ))}
        </>
      )}

      {results.columns.length > 0 && (
        <>
          <div className="ex-group-title">
            Columnas ({counts.columns} en {counts.columnTables} tablas)
          </div>
          {results.columns.map(({ table, column }, i) => (
            <button className="ex-res" key={table.name + column.name + i} onClick={() => onGo(table.name)}>
              <span className="ex-res-dot" style={{ background: `var(--ex-c-${table.category})` }} />
              <span>
                {table.name}
                <span className="ex-res-sub">.</span>
                <span className="ex-res-strong">
                  <Hi text={column.name} q={query} />
                </span>
              </span>
            </button>
          ))}
        </>
      )}

      {results.comments.length > 0 && (
        <>
          <div className="ex-group-title">En descripciones ({counts.comments})</div>
          {results.comments.map(({ table }) => (
            <button className="ex-res" key={table.name} onClick={() => onGo(table.name)}>
              <span className="ex-res-dot" style={{ background: `var(--ex-c-${table.category})` }} />
              <span>{table.name}</span>
            </button>
          ))}
        </>
      )}
    </>
  )
}

export default function SideRail({
  schema,
  catCounts,
  visibleCats,
  onToggleCat,
  onAllCats,
  query,
  onQuery,
  results,
  selected,
  onGo,
  searchRef,
}) {
  const sorted = useMemo(
    () => [...schema.tables].sort((a, b) => a.name.localeCompare(b.name)),
    [schema],
  )
  const searching = query.trim().length >= 2
  const listed = sorted.filter((t) => visibleCats.has(t.category))
  const allOn = visibleCats.size === CATEGORY_ORDER.length

  return (
    <div className="ex-rail">
      <div className="ex-rail-head">
        <div className="ex-title">
          <b>{schema.meta.label}</b>
          <span>{schema.meta.engine}</span>
        </div>
        <div className="ex-search">
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Buscar tabla, columna…"
            aria-label="Buscar en el esquema"
          />
          <kbd>/</kbd>
        </div>
        {/* Breadcrumb: dónde estoy y cómo vuelvo (limpia la selección) */}
        {selected && (
          <button className="ex-crumb" onClick={() => onGo(null)} title="Volver a la vista general">
            {schema.meta.label} › <b>{selected}</b>
          </button>
        )}
      </div>

      <div className="ex-scroll">
        {searching ? (
          <div className="ex-group">
            <SearchResults results={results} onGo={onGo} />
          </div>
        ) : (
          <>
            <div className="ex-group">
              <div className="ex-group-title">
                <span>Categorías</span>
                <button className="ex-linkbtn" onClick={onAllCats}>
                  {allOn ? 'Solo relacionadas' : 'Ver todas'}
                </button>
              </div>
              <div className="ex-cats">
                {CATEGORY_ORDER.map((key) => (
                  <button
                    className="ex-cat"
                    key={key}
                    aria-pressed={visibleCats.has(key)}
                    onClick={() => onToggleCat(key)}
                    title={CATEGORIES[key].desc}
                  >
                    <span className="ex-cat-dot" style={{ background: `var(--ex-c-${key})` }} />
                    <span>{CATEGORIES[key].label}</span>
                    <span className="ex-cat-n">{catCounts[key] || 0}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="ex-group" style={{ paddingLeft: 0, paddingRight: 0 }}>
              <div className="ex-group-title" style={{ padding: '0 12px' }}>
                Tablas ({listed.length})
              </div>
              {listed.map((t) => (
                <button
                  className="ex-item"
                  key={t.name}
                  aria-current={selected === t.name}
                  onClick={() => onGo(t.name)}
                >
                  <span className="ex-res-dot" style={{ background: `var(--ex-c-${t.category})` }} />
                  <span>{t.name}</span>
                  <span className="ex-item-n">{formatCompact(t.num_rows)}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
