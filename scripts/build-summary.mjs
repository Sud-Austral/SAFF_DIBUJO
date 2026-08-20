// Resumen liviano de ambos esquemas para la portada.
// Evita que el Home tenga que descargar los ~400 KB de los esquemas completos.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'frontend', 'src', 'data');

function summarize(file) {
  const schema = JSON.parse(readFileSync(join(DATA, file), 'utf8'));
  const byCategory = {};
  for (const t of schema.tables) byCategory[t.category] = (byCategory[t.category] || 0) + 1;

  const topReferenced = [...schema.tables]
    .sort((a, b) => b.fk_in - a.fk_in || a.name.localeCompare(b.name))
    .slice(0, 5)
    .map((t) => ({ name: t.name, fk_in: t.fk_in, category: t.category }));

  const topRows = [...schema.tables]
    .sort((a, b) => b.num_rows - a.num_rows)
    .slice(0, 5)
    .map((t) => ({ name: t.name, num_rows: t.num_rows, category: t.category }));

  const withComment = schema.tables.filter((t) => (t.comment || '').trim()).length;

  return {
    ...schema.meta,
    byCategory,
    topReferenced,
    topRows,
    documented: { tables: withComment, total: schema.tables.length },
  };
}

const summary = {
  saf: summarize('saf-schema.json'),
  sidco: summarize('sidco-schema.json'),
};

writeFileSync(join(DATA, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(
  `summary.json  SAF ${summary.saf.counts.tables} tablas · SIDCO ${summary.sidco.counts.tables} tablas`,
);
