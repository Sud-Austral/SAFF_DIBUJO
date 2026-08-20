// Ficha de la tabla seleccionada: la documentación de la tabla, no solo su dibujo.
import { useMemo, useState } from 'react'
import { CATEGORIES } from '../lib/categories.js'
import { formatBytes, formatCompact, formatInt } from '../lib/format.js'
import { impactClosure } from './graph.js'
import { exportTableCsv } from './export.js'

function Columns({ table, edges }) {
  const [filter, setFilter] = useState('')
  const pks = useMemo(() => new Set(table.pks), [table])
  const fkTargets = useMemo(() => {
    const map = new Map()
    for (const fk of edges.out) map.set(fk.from_col, `${fk.to_table}.${fk.to_col}`)
    return map
  }, [edges])

  const q = filter.trim().toLowerCase()
  const shown = q
    ? table.columns.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.type.toLowerCase().includes(q) ||
          (c.comment || '').toLowerCase().includes(q),
      )
    : table.columns

  return (
    <>
      <input
        className="ex-colfilter"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder={`Filtrar ${table.columns.length} columnas…`}
        aria-label="Filtrar columnas"
      />
      {shown.length === 0 && <div className="ex-none">Ninguna columna coincide.</div>}
      {shown.map((c) => {
        const isPK = pks.has(c.name)
        const target = fkTargets.get(c.name)
        return (
          <div key={c.name}>
            <div className="ex-col">
              <span className={`ex-key ${isPK ? 'pk' : target ? 'fk' : 'none'}`}>
                {isPK ? 'PK' : target ? 'FK' : ''}
              </span>
              <span className={`ex-col-name ${isPK ? 'is-pk' : target ? 'is-fk' : ''}`}>{c.name}</span>
              <span className="ex-col-type">
                {c.type}
                {c.nullable ? '' : ' · NOT NULL'}
              </span>
            </div>
            {(c.comment || target) && (
              <div className="ex-col-comment">
                {target && <span>→ {target}</span>}
                {target && c.comment ? ' · ' : ''}
                {c.comment}
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}

function Relations({ table, edges, index, inferred, onGo }) {
  // El impacto real no son las dependientes directas: es todo lo que cuelga de ellas.
  const impact = useMemo(() => impactClosure(index, table.name), [index, table])

  return (
    <>
      <div className="ex-sub">De dónde viene el dato — referencia a ({edges.out.length})</div>
      {edges.out.length === 0 ? (
        <div className="ex-none">Esta tabla no apunta a ninguna otra.</div>
      ) : (
        edges.out.map((fk, i) => (
          <button className="ex-rel" key={i} onClick={() => onGo(fk.to_table)}>
            <span style={{ color: 'var(--ex-pk)' }}>{fk.from_col}</span>
            <span className="ex-arrow">→</span>
            <span style={{ color: `var(--ex-c-${index.tableMap.get(fk.to_table)?.category})` }}>
              {fk.to_table}.{fk.to_col}
            </span>
          </button>
        ))
      )}

      <div className="ex-sub">Qué se rompe si la tocas — referenciada por ({edges.in.length})</div>
      {edges.in.length === 0 ? (
        <div className="ex-none">Ninguna tabla depende de esta.</div>
      ) : (
        <>
          {impact.tables.size > edges.in.length && (
            <div className="ex-note">
              Directas: <b>{edges.in.length}</b>. Contando lo que depende de ellas:{' '}
              <b>{impact.tables.size} tablas</b> y {formatInt(impact.rows)} filas.
            </div>
          )}
          {edges.in.map((fk, i) => (
            <button className="ex-rel" key={i} onClick={() => onGo(fk.from_table)}>
              <span style={{ color: `var(--ex-c-${index.tableMap.get(fk.from_table)?.category})` }}>
                {fk.from_table}.{fk.from_col}
              </span>
              <span className="ex-arrow">→</span>
              <span style={{ color: 'var(--ex-fk)' }}>{fk.to_col}</span>
              {fk.on_delete && fk.on_delete !== 'NO ACTION' && (
                <span className="ex-col-type" style={{ marginLeft: 'auto' }}>
                  ON DELETE {fk.on_delete}
                </span>
              )}
            </button>
          ))}
        </>
      )}

      {/* Estas NO están en la base de datos: se deducen del nombre de la columna.
          Se muestran aparte y nunca se cuentan como relaciones declaradas. */}
      {inferred?.length > 0 && (
        <>
          <div className="ex-sub">Probables, no declaradas ({inferred.length})</div>
          <div className="ex-note">
            El modelo no declara estas claves foráneas; el nombre de la columna sigue la
            convención del resto del esquema. Verificar antes de usarlas.
          </div>
          {inferred.map((rel, i) => (
            <button className="ex-rel" key={i} onClick={() => onGo(rel.to_table)}>
              <span style={{ color: 'var(--ex-text3)' }}>{rel.from_col}</span>
              <span className="ex-arrow">⇢</span>
              <span style={{ color: `var(--ex-c-${index.tableMap.get(rel.to_table)?.category})` }}>
                {rel.to_table}.{rel.to_col}
              </span>
            </button>
          ))}
        </>
      )}
    </>
  )
}

function Metadata({ table }) {
  const rows = [
    ['Categoría', CATEGORIES[table.category]?.label],
    ['Filas estimadas', formatInt(table.num_rows)],
    ['Columnas', formatInt(table.col_count)],
    ['Clave primaria', table.pks.length ? table.pks.join(', ') : 'sin clave primaria'],
    table.kind ? ['Tipo de objeto', table.kind] : null,
    table.size ? ['Tamaño en disco', `${table.size} (${formatBytes(table.size_bytes)})`] : null,
    table.stale_stats ? ['Estadísticas', 'sin estadísticas actualizadas'] : null,
  ].filter(Boolean)

  return (
    <>
      {rows.map(([k, v]) => (
        <div className="ex-meta-row" key={k}>
          <span>{k}</span>
          <b>{v}</b>
        </div>
      ))}

      {table.indexes?.length > 0 && (
        <>
          <div className="ex-sub">Índices ({table.indexes.length})</div>
          {table.indexes.map((idx) => (
            <div className="ex-col" key={idx.name}>
              <span className={`ex-key ${idx.primary ? 'pk' : idx.unique ? 'fk' : 'none'}`}>
                {idx.primary ? 'PK' : idx.unique ? 'UQ' : ''}
              </span>
              <span className="ex-col-name">{idx.columns.join(', ')}</span>
              <span className="ex-col-type">{idx.method}</span>
            </div>
          ))}
        </>
      )}

      {table.sequences?.length > 0 && (
        <>
          <div className="ex-sub">Secuencias ({table.sequences.length})</div>
          {table.sequences.map((seq) => (
            <div className="ex-col" key={seq.name}>
              <span className="ex-key none" />
              <span className="ex-col-name">{seq.column}</span>
              <span className="ex-col-type">{seq.name}</span>
            </div>
          ))}
        </>
      )}
    </>
  )
}

export default function DetailPanel({ table, index, inferred, onGo, onClose, onPathFrom }) {
  const [tab, setTab] = useState('columnas')

  if (!table) {
    return (
      <aside className="ex-panel">
        <div className="ex-empty">
          <h3>Ninguna tabla seleccionada</h3>
          <p>Elige una tabla en el mapa o en la lista para ver su ficha completa.</p>
          <ul>
            <li>
              <b>Buscar</b> entra a nombres de tabla, de columna y comentarios.
            </li>
            <li>
              <b>Ruta</b> traza el camino de claves foráneas entre dos tablas.
            </li>
            <li>Las tablas más grandes del mapa son las más referenciadas.</li>
          </ul>
        </div>
      </aside>
    )
  }

  const edges = index.edges.get(table.name) || { in: [], out: [] }
  const cat = CATEGORIES[table.category]

  return (
    <aside className="ex-panel">
      <div className="ex-panel-head">
        <div className="ex-panel-title">
          <h2 style={{ color: `var(--ex-c-${table.category})` }}>{table.name}</h2>
          <button className="ex-close" onClick={onClose} aria-label="Cerrar ficha">
            ×
          </button>
        </div>
        <span
          className="ex-badge"
          style={{
            background: `color-mix(in srgb, var(--ex-c-${table.category}) 16%, transparent)`,
            color: `var(--ex-c-${table.category})`,
          }}
        >
          {cat?.label}
        </span>
        <div className="ex-metrics">
          <div className="ex-metric">
            <b>{formatCompact(table.num_rows)}</b>
            <span>filas</span>
          </div>
          <div className="ex-metric">
            <b>{table.col_count}</b>
            <span>columnas</span>
          </div>
          <div className="ex-metric">
            <b>{table.fk_in}</b>
            <span>dependen</span>
          </div>
          <div className="ex-metric">
            <b>{table.fk_out}</b>
            <span>referencia</span>
          </div>
        </div>
        <div className="ex-tabs" role="tablist">
          {['columnas', 'relaciones', 'metadatos'].map((t) => (
            <button
              key={t}
              role="tab"
              className="ex-tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
            >
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
          <button
            className="ex-tab"
            style={{ marginLeft: 'auto' }}
            title={`Trazar la ruta de claves foráneas desde ${table.name} hasta otra tabla`}
            onClick={() => onPathFrom(table.name)}
          >
            Ruta →
          </button>
        </div>
      </div>

      <div className="ex-panel-body">
        <div className={`ex-desc${table.comment ? '' : ' is-empty'}`}>
          {table.comment || 'Esta tabla no tiene descripción en el diccionario de datos.'}
        </div>

        {tab === 'columnas' && <Columns table={table} edges={edges} />}
        {tab === 'relaciones' && (
          <Relations table={table} edges={edges} index={index} inferred={inferred} onGo={onGo} />
        )}
        {tab === 'metadatos' && <Metadata table={table} />}

        {tab === 'columnas' && (
          <button
            className="ex-btn"
            style={{ marginTop: 14 }}
            onClick={() => exportTableCsv(table, edges)}
          >
            Exportar columnas (CSV)
          </button>
        )}
      </div>
    </aside>
  )
}
