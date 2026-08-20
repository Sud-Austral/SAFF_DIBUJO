// Construye el esquema SIDCO a partir del diccionario de datos en Excel,
// con la misma forma que saf-schema.json para que ambas vistas compartan componente.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { openWorkbook } from './lib/xlsx-lite.mjs';
import { classify } from './classify.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(ROOT, 'INSUMO', 'DICCIONARIO_DATOS_public_20260720_095344.xlsx');
const TARGET = join(ROOT, 'frontend', 'src', 'data', 'sidco-schema.json');

const num = (v) => {
  const n = Number(String(v ?? '').trim());
  return Number.isFinite(n) ? n : 0;
};
// Los comentarios del Excel traen CRLF; se normalizan para que el salto de línea
// se renderice igual en cualquier plataforma.
const text = (v) => String(v ?? '').replace(/\r\n?/g, '\n').trim();

const wb = openWorkbook(SOURCE);
const sheet = (name) => wb.rows(name);

// --- Tablas -----------------------------------------------------------------
const tableRows = sheet('01_Tablas');
const tables = new Map();
for (const r of tableRows) {
  const name = text(r.TABLA);
  if (!name) continue;
  tables.set(name, {
    name,
    num_rows: num(r.FILAS_ESTIMADAS),
    comment: text(r.COMENTARIO),
    pks: [],
    fk_cols: [],
    columns: [],
    kind: text(r.TIPO),
    size: text(r.TAMANO),
    size_bytes: num(r.TAMANO_BYTES),
    stale_stats: num(r.SIN_ESTADISTICAS) === 1,
    indexes: [],
    sequences: [],
  });
}

// La hoja 03 repite comentarios de tabla; se usa como respaldo si 01 vino vacía.
for (const r of sheet('03_Comentarios_Tablas')) {
  const t = tables.get(text(r.TABLA));
  if (t && !t.comment) t.comment = text(r.COMENTARIO);
}

// --- Columnas ---------------------------------------------------------------
const columnComments = new Map();
for (const r of sheet('04_Comentarios_Cols')) {
  columnComments.set(`${text(r.TABLE_NAME)}.${text(r.COLUMN_NAME)}`, text(r.COMMENTS));
}

const columnRows = sheet('02_Columnas')
  .filter((r) => text(r.TABLE_NAME) && text(r.COLUMN_NAME))
  .sort((a, b) => num(a.ORDINAL_POSITION) - num(b.ORDINAL_POSITION));

let orphanColumns = 0;
for (const r of columnRows) {
  const tableName = text(r.TABLE_NAME);
  const t = tables.get(tableName);
  if (!t) { orphanColumns++; continue; }
  const name = text(r.COLUMN_NAME);
  const column = {
    name,
    type: text(r.DATA_TYPE),
    nullable: text(r.NULLABLE).toUpperCase() !== 'N',
  };
  const comment = columnComments.get(`${tableName}.${name}`) || text(r.COMMENTS);
  if (comment) column.comment = comment;
  const def = text(r.COLUMN_DEFAULT);
  if (def) column.default = def;
  if (text(r.IS_IDENTITY).toUpperCase() === 'YES') column.identity = true;
  t.columns.push(column);
}

// --- Claves primarias -------------------------------------------------------
for (const r of sheet('05_Primary_Keys').sort((a, b) => num(a.POSITION) - num(b.POSITION))) {
  const t = tables.get(text(r.TABLE_NAME));
  if (t) t.pks.push(text(r.COLUMN_NAME));
}

// --- Claves foráneas --------------------------------------------------------
const fks = [];
let orphanFks = 0;
for (const r of sheet('06_Foreign_Keys')) {
  const from_table = text(r.TABLE_NAME);
  const to_table = text(r.REFERENCED_TABLE);
  if (!tables.has(from_table) || !tables.has(to_table)) { orphanFks++; continue; }
  const from_col = text(r.COLUMN_NAME);
  fks.push({
    from_table,
    from_col,
    to_table,
    to_col: text(r.REFERENCED_COLUMN),
    name: text(r.CONSTRAINT_NAME),
    on_delete: text(r.ON_DELETE),
    on_update: text(r.ON_UPDATE),
  });
  const t = tables.get(from_table);
  if (!t.fk_cols.includes(from_col)) t.fk_cols.push(from_col);
}

// --- Índices y secuencias (metadatos extra que el diccionario aporta) --------
const indexBuckets = new Map();
for (const r of sheet('09_Indices')) {
  const tableName = text(r.TABLE_NAME);
  const key = `${tableName}\u0000${text(r.INDEX_NAME)}`;
  if (!indexBuckets.has(key)) {
    indexBuckets.set(key, {
      name: text(r.INDEX_NAME),
      table: tableName,
      method: text(r.INDEX_METHOD),
      unique: num(r.IS_UNIQUE) === 1,
      primary: num(r.IS_PRIMARY) === 1,
      partial: num(r.IS_PARTIAL) === 1,
      columns: [],
    });
  }
  indexBuckets.get(key).columns.push(text(r.COLUMN_EXPRESSION));
}
for (const idx of indexBuckets.values()) {
  const t = tables.get(idx.table);
  if (!t) continue;
  const { table: _table, ...rest } = idx;
  t.indexes.push(rest);
}

for (const r of sheet('11_Secuencias')) {
  const t = tables.get(text(r.TABLA_DUENO));
  if (!t) continue;
  t.sequences.push({
    name: text(r.SEQUENCE_NAME),
    column: text(r.COLUMNA_DUENO),
    type: text(r.DATA_TYPE),
    increment: num(r.INCREMENT_BY),
  });
}

// --- Métricas derivadas y categoría -----------------------------------------
for (const t of tables.values()) {
  t.fk_out = fks.filter((f) => f.from_table === t.name).length;
  t.fk_in = fks.filter((f) => f.to_table === t.name).length;
  t.fk_total = t.fk_in + t.fk_out;
  t.col_count = t.columns.length;
  t.category = classify(t);
}

const list = [...tables.values()];
const columnCount = list.reduce((a, t) => a + t.columns.length, 0);
const rowCount = list.reduce((a, t) => a + t.num_rows, 0);

const output = {
  meta: {
    id: 'sidco',
    label: 'SIDCO',
    engine: 'PostgreSQL',
    description: 'Diccionario de datos del esquema public — gestión de incendios forestales.',
    source: 'INSUMO/DICCIONARIO_DATOS_public_20260720_095344.xlsx',
    counts: { tables: list.length, columns: columnCount, fks: fks.length, rows: rowCount },
  },
  tables: list,
  fks,
};

writeFileSync(TARGET, JSON.stringify(output));

// --- Comprobaciones ---------------------------------------------------------
const problems = [];
if (list.length !== 94) problems.push(`tablas: ${list.length} != 94`);
if (columnCount !== 1390) problems.push(`columnas: ${columnCount} != 1390`);
if (fks.length !== 116) problems.push(`FK: ${fks.length} != 116`);
if (orphanColumns) problems.push(`${orphanColumns} columnas sin tabla`);
if (orphanFks) problems.push(`${orphanFks} FK apuntando a tablas inexistentes`);
const noPk = list.filter((t) => t.pks.length === 0).map((t) => t.name);
const log = tables.get('log');
if (!log || log.num_rows !== 1564656384) problems.push('la tabla log no tiene las filas esperadas');
if (log && log.category !== 'transaccional') problems.push(`log quedó como ${log?.category}`);

if (problems.length) {
  console.error('FALLÓ:', problems.join(' | '));
  process.exit(1);
}

const byCat = {};
for (const t of list) byCat[t.category] = (byCat[t.category] || 0) + 1;
console.log(`sidco-schema.json  ${list.length} tablas · ${columnCount} columnas · ${fks.length} FK · ${rowCount.toLocaleString('es-CL')} filas`);
console.log('  categorías:', JSON.stringify(byCat));
console.log(`  sin PK: ${noPk.length}${noPk.length ? ' (' + noPk.slice(0, 5).join(', ') + (noPk.length > 5 ? '…' : '') + ')' : ''}`);
