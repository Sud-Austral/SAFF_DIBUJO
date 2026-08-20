// Categorías de tablas: etiqueta, color y el umbral REAL con que se calculan.
// Espejo de scripts/classify.mjs, que es donde vive la regla de clasificación.
export const CATEGORIES = {
  hub: {
    label: 'Hub Central',
    color: 'var(--c-hub)',
    desc: 'Muy referenciada por otras tablas (≥15 FK entrantes)',
    hint: 'El corazón del modelo: tocarla afecta a medio sistema.',
  },
  transaccional: {
    label: 'Transaccional',
    color: 'var(--c-transaccional)',
    desc: 'Alto volumen de registros (≥500.000 filas)',
    hint: 'Donde se acumula la operación diaria.',
  },
  relacional: {
    label: 'Relacional',
    color: 'var(--c-relacional)',
    desc: 'Alta conectividad total (≥8 FK entre entrantes y salientes)',
    hint: 'Conecta piezas del modelo entre sí.',
  },
  catalogo: {
    label: 'Catálogo/Maestro',
    color: 'var(--c-catalogo)',
    desc: 'Pocas filas (<5.000) y muy referenciada (≥5 FK entrantes)',
    hint: 'Listas de referencia: comunas, especies, tipos.',
  },
  estructural: {
    label: 'Estructural',
    color: 'var(--c-estructural)',
    desc: 'Rica en atributos (≥15 columnas)',
    hint: 'Guarda muchos datos por registro.',
  },
  operacional: {
    label: 'Operacional',
    color: 'var(--c-operacional)',
    desc: 'Tablas de proceso general',
    hint: 'El resto del modelo: apoyo y detalle.',
  },
}

export const CATEGORY_ORDER = [
  'hub',
  'transaccional',
  'relacional',
  'catalogo',
  'estructural',
  'operacional',
]

export const catColor = (key) => CATEGORIES[key]?.color || 'var(--c-operacional)'
export const catLabel = (key) => CATEGORIES[key]?.label || key
