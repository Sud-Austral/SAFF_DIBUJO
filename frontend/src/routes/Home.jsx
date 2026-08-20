import summary from '../data/summary.json'
import { CATEGORIES, CATEGORY_ORDER } from '../lib/categories.js'
import { formatCompact, formatInt } from '../lib/format.js'
import { navigate } from '../lib/router.js'
import './home.css'

const VIEWS = [
  {
    tab: 'saff',
    title: 'SAFF',
    badge: 'Recomendada',
    schema: summary.saf,
    text: 'El modelo del Sistema de Administración Forestal con el explorador nuevo: las tablas se agrupan por rol, la búsqueda entra hasta el nivel de columna y se puede trazar el camino de relaciones entre dos tablas cualesquiera.',
  },
  {
    tab: 'sidco',
    title: 'SIDCO',
    badge: 'Incendios',
    schema: summary.sidco,
    text: 'El mismo explorador aplicado al diccionario de datos del sistema de gestión de incendios. Incluye lo que el diccionario aporta y el modelo antiguo no tenía: tamaño en disco, índices, secuencias y comentarios de columna.',
  },
  {
    tab: 'legacy',
    title: 'Legacy',
    badge: 'Original',
    schema: summary.saf,
    text: 'La versión original del diagrama, conservada tal cual: misma grilla, mismos colores, mismos gestos. Está aquí para poder comparar y para quien ya tenía su forma de trabajar con ella.',
  },
]

const QUESTIONS = [
  {
    q: '¿De dónde sale este dato?',
    a: 'Abre la tabla y mira sus relaciones salientes: cada una dice qué columna apunta y a qué tabla y columna llega.',
  },
  {
    q: '¿Qué se rompe si toco esta tabla?',
    a: 'Las relaciones entrantes muestran lo que depende de ella, y además el total contando lo que depende de esas: comuna tiene 7 dependientes directas y 54 en cadena.',
  },
  {
    q: '¿Dónde está la columna que busco?',
    a: 'El buscador entra a nombres de columna y comentarios. Si el concepto no es una tabla sino una columna repartida por el esquema, lo dice.',
  },
  {
    q: '¿Cómo se conectan dos tablas?',
    a: 'La herramienta de ruta traza el camino más corto de claves foráneas y encuadra el mapa sobre él. Si no existe camino, también lo dice.',
  },
]

const SHORTCUTS = [
  ['/', 'ir al buscador'],
  ['f', 'encuadrar el núcleo del modelo'],
  ['F', 'ver el mapa completo'],
  ['r', 'mostrar u ocultar todas las relaciones'],
  ['Esc', 'limpiar la selección'],
  ['↑ ↓ ← →', 'moverse entre tablas del mapa'],
  ['Shift + clic', 'trazar la ruta hasta otra tabla'],
]

function ViewCard({ view }) {
  const { counts } = view.schema
  return (
    <button className="view-card" onClick={() => navigate(view.tab)}>
      <div className="view-card-top">
        <h2>{view.title}</h2>
        <span className="view-badge">{view.badge}</span>
      </div>
      <p>{view.text}</p>
      <div className="kpi-row">
        <div className="kpi">
          <b>{formatInt(counts.tables)}</b>tablas
        </div>
        <div className="kpi">
          <b>{formatInt(counts.columns)}</b>columnas
        </div>
        <div className="kpi">
          <b>{formatInt(counts.fks)}</b>relaciones
        </div>
        <div className="kpi">
          <b>{formatCompact(counts.rows)}</b>registros
        </div>
      </div>
      <span className="view-cta">Abrir {view.title} →</span>
    </button>
  )
}

export default function Home() {
  return (
    <div className="home">
      <div className="home-inner">
        <section className="hero">
          <div className="hero-kicker">Unidad de Información y Análisis · CONAF</div>
          <h1>Los modelos de datos de CONAF, en un mapa navegable</h1>
          <p>
            Esta aplicación toma el diccionario de datos de nuestros sistemas y lo convierte en algo
            que se puede recorrer: qué tablas existen, qué guarda cada una, cómo están conectadas
            entre sí y cuáles son críticas. En vez de leer un Excel de {formatInt(summary.saf.counts.columns + summary.sidco.counts.columns)}{' '}
            columnas, se mira el modelo y se pregunta.
          </p>
          <p>
            Hay dos sistemas cargados —{' '}
            <strong>SAFF</strong> ({summary.saf.engine}) y <strong>SIDCO</strong> ({summary.sidco.engine}) — y
            una tercera pestaña que conserva el diagrama original del que partió todo.
          </p>
        </section>

        <section className="section">
          <div className="section-title">Las tres vistas</div>
          <div className="view-grid">
            {VIEWS.map((v) => (
              <ViewCard key={v.tab} view={v} />
            ))}
          </div>
        </section>

        <section className="section">
          <div className="section-title">Para qué sirve</div>
          <div className="qa-grid">
            {QUESTIONS.map((item) => (
              <div className="qa" key={item.q}>
                <q>{item.q}</q>
                <span>{item.a}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="section">
          <div className="section-title">Atajos del explorador</div>
          <div className="shortcuts">
            {SHORTCUTS.map(([key, what]) => (
              <div className="shortcut" key={key}>
                <kbd>{key}</kbd>
                <span>{what}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="section">
          <div className="section-title">Cómo leer los colores</div>
          <div className="table-scroll">
            <table className="cat-table">
              <thead>
                <tr>
                  <th>Categoría</th>
                  <th>Cuándo se aplica</th>
                  <th className="num">SAFF</th>
                  <th className="num">SIDCO</th>
                </tr>
              </thead>
              <tbody>
                {CATEGORY_ORDER.map((key) => (
                  <tr key={key}>
                    <td>
                      <span className="cat-name">
                        <span className="cat-dot" style={{ background: CATEGORIES[key].color }} />
                        {CATEGORIES[key].label}
                      </span>
                    </td>
                    <td>
                      {CATEGORIES[key].desc}
                      <br />
                      <span style={{ color: 'var(--text3)' }}>{CATEGORIES[key].hint}</span>
                    </td>
                    <td className="num">{summary.saf.byCategory[key] || 0}</td>
                    <td className="num">{summary.sidco.byCategory[key] || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="section">
          <div className="section-title">De dónde salen estos datos</div>
          <div className="source-grid">
            <div className="source">
              <h3>SAFF · {summary.saf.engine}</h3>
              Extraído del diagrama original <code>index.html</code>, que ya traía el modelo completo
              embebido. {formatInt(summary.saf.documented.tables)} de{' '}
              {formatInt(summary.saf.documented.total)} tablas tienen descripción. Las tablas más
              referenciadas son{' '}
              {summary.saf.topReferenced.slice(0, 3).map((t) => t.name).join(', ')}.
            </div>
            <div className="source">
              <h3>SIDCO · {summary.sidco.engine}</h3>
              Generado desde <code>DICCIONARIO_DATOS_public_20260720_095344.xlsx</code> (20 de julio
              de 2026). {formatInt(summary.sidco.documented.tables)} de{' '}
              {formatInt(summary.sidco.documented.total)} tablas tienen descripción. La tabla más
              referenciada es <strong>{summary.sidco.topReferenced[0].name}</strong> y la más pesada
              es <strong>{summary.sidco.topRows[0].name}</strong> con{' '}
              {formatCompact(summary.sidco.topRows[0].num_rows)} de registros.
            </div>
          </div>
        </section>

        <p className="home-foot">
          Las categorías no vienen de la base de datos: se calculan a partir del número de
          relaciones, filas y columnas de cada tabla, con la misma regla para ambos sistemas. Las
          cifras de filas son estimaciones del motor, no conteos exactos.
        </p>
      </div>
    </div>
  )
}
