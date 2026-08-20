// Regla de categorización de tablas.
//
// No es una invención: se obtuvo por ingeniería inversa del campo `category` que ya
// venía calculado en el SCHEMA de index.html y reproduce sus 327 tablas sin ninguna
// discrepancia. Los textos descriptivos que el HTML original mostraba en la leyenda
// citaban umbrales distintos a los reales; aquí manda el comportamiento observado y
// las descripciones se corrigieron para que coincidan con el código.

export const CATEGORIES = {
  hub: {
    label: 'Hub Central',
    color: '#f43f5e',
    desc: 'Muy referenciada por otras tablas (≥15 FK entrantes)',
  },
  transaccional: {
    label: 'Transaccional',
    color: '#3b82f6',
    desc: 'Alto volumen de registros (≥500.000 filas)',
  },
  relacional: {
    label: 'Relacional',
    color: '#10b981',
    desc: 'Alta conectividad total (≥8 FK entre entrantes y salientes)',
  },
  catalogo: {
    label: 'Catálogo/Maestro',
    color: '#a78bfa',
    desc: 'Pocas filas (<5.000) y muy referenciada (≥5 FK entrantes)',
  },
  estructural: {
    label: 'Estructural',
    color: '#f59e0b',
    desc: 'Rica en atributos (≥15 columnas)',
  },
  operacional: {
    label: 'Operacional',
    color: '#64748b',
    desc: 'Tablas de proceso general',
  },
};

/** Orden de categorías tal como se muestran en leyendas y filtros. */
export const CATEGORY_ORDER = [
  'hub',
  'transaccional',
  'relacional',
  'catalogo',
  'estructural',
  'operacional',
];

/**
 * Clasifica una tabla. El orden de las comprobaciones es significativo:
 * el volumen gana sobre la centralidad, y el catálogo sobre el hub.
 */
export function classify({ num_rows, fk_in, fk_total, col_count }) {
  if (num_rows >= 500_000) return 'transaccional';
  if (num_rows < 5_000 && fk_in >= 5) return 'catalogo';
  if (fk_in >= 15) return 'hub';
  if (fk_total >= 8) return 'relacional';
  if (col_count >= 15) return 'estructural';
  return 'operacional';
}
