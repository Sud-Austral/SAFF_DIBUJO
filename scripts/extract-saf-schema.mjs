// Extrae el literal SCHEMA embebido en index.html y lo vuelca como JSON.
// El original guarda todo el dataset en una sola línea de ~247 KB dentro del <script>.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { classify } from './classify.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(ROOT, 'index.html');
const TARGET = join(ROOT, 'frontend', 'src', 'data', 'saf-schema.json');

const html = readFileSync(SOURCE, 'utf8');
const line = html.split(/\r?\n/).find((l) => /^\s*const SCHEMA\s*=/.test(l));
if (!line) throw new Error('No se encontró la declaración `const SCHEMA =` en index.html');

const literal = line.replace(/^\s*const SCHEMA\s*=\s*/, '').replace(/;\s*$/, '');
const schema = JSON.parse(literal);

// La categoría ya viene calculada en el origen: se comprueba que la regla compartida
// la reproduzca antes de usarla para clasificar otros esquemas.
const mismatches = schema.tables.filter((t) => classify(t) !== t.category);
if (mismatches.length > 0) {
  console.error(mismatches.slice(0, 10).map((t) => `${t.name}: ${t.category} != ${classify(t)}`));
  throw new Error(`La regla de categorización no reproduce el origen (${mismatches.length} discrepancias)`);
}

const columns = schema.tables.reduce((a, t) => a + t.columns.length, 0);
const rows = schema.tables.reduce((a, t) => a + t.num_rows, 0);

const output = {
  meta: {
    id: 'saf',
    label: 'SAF',
    engine: 'Oracle',
    description: 'Sistema de Administración Forestal — modelo relacional heredado.',
    source: 'index.html',
    counts: { tables: schema.tables.length, columns, fks: schema.fks.length, rows },
  },
  tables: schema.tables,
  fks: schema.fks,
};

writeFileSync(TARGET, JSON.stringify(output));

// Comprobación de ida y vuelta: lo escrito debe ser idéntico al literal de origen.
const roundTrip = JSON.parse(readFileSync(TARGET, 'utf8'));
const same = JSON.stringify({ tables: roundTrip.tables, fks: roundTrip.fks }) === JSON.stringify(schema);
if (!same) throw new Error('El JSON escrito no coincide con el literal original');

// El diagrama original se publica tal cual junto a la app, para poder contrastarlo
// con el port y para quien tuviera el enlace antiguo guardado.
const LEGACY_COPY = join(ROOT, 'frontend', 'public', 'legacy-original.html');
mkdirSync(dirname(LEGACY_COPY), { recursive: true });
copyFileSync(SOURCE, LEGACY_COPY);

console.log(`saf-schema.json  ${schema.tables.length} tablas · ${columns} columnas · ${schema.fks.length} FK · ${rows.toLocaleString('es-CL')} filas · categorías OK`);
