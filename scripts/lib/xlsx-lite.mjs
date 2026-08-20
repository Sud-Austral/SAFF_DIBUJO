// Lector XLSX sin dependencias externas.
// Un .xlsx es un ZIP con XML adentro: aquí se parsea el central directory del ZIP,
// se descomprime cada entrada con zlib y se leen las filas de cada hoja a mano.
import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

const SIG_EOCD = 0x06054b50;

/** Descomprime un .xlsx en un mapa { rutaInterna: Buffer }. */
function unzip(filePath) {
  const buf = readFileSync(filePath);

  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== SIG_EOCD) eocd--;
  if (eocd < 0) throw new Error(`ZIP inválido (no se encontró EOCD): ${filePath}`);

  const entryCount = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const entries = {};

  for (let i = 0; i < entryCount; i++) {
    const method = buf.readUInt16LE(off + 10);
    const compressedSize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const localHeader = buf.readUInt32LE(off + 42);
    const name = buf.toString('utf8', off + 46, off + 46 + nameLen);

    // El header local repite el nombre y los extras con longitudes propias.
    const lNameLen = buf.readUInt16LE(localHeader + 26);
    const lExtraLen = buf.readUInt16LE(localHeader + 28);
    const dataStart = localHeader + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(dataStart, dataStart + compressedSize);

    if (method === 0) entries[name] = raw;
    else if (method === 8) entries[name] = inflateRawSync(raw);
    else throw new Error(`Método de compresión no soportado (${method}) en ${name}`);

    off += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/** Decodifica entidades XML, incluidas las numéricas (&#13;) que escribe openpyxl. */
function decodeEntities(text) {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, code) => {
    if (code[0] === '#') {
      const cp = code[1] === 'x' || code[1] === 'X'
        ? parseInt(code.slice(2), 16)
        : parseInt(code.slice(1), 10);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : match;
    }
    return NAMED_ENTITIES[code] ?? match;
  });
}

/** Lee sharedStrings.xml (puede no existir si el generador escribió strings inline). */
function readSharedStrings(entries) {
  const xml = entries['xl/sharedStrings.xml'];
  if (!xml) return [];
  return [...xml.toString('utf8').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((si) =>
    decodeEntities([...si[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(''))
  );
}

/** Convierte una referencia de celda (AB12) en su letra de columna (AB). */
function columnOf(ref) {
  return ref.replace(/\d+$/, '');
}

/**
 * Abre un .xlsx y devuelve { sheetNames, rows(nombreHoja) }.
 * rows() entrega objetos { CABECERA: valor } usando la primera fila como cabecera.
 */
export function openWorkbook(filePath) {
  const entries = unzip(filePath);
  const sharedStrings = readSharedStrings(entries);

  const workbookXml = entries['xl/workbook.xml'].toString('utf8');
  // El orden de <sheet> en workbook.xml corresponde a sheet1.xml, sheet2.xml, ...
  const sheetNames = [...workbookXml.matchAll(/<sheet[^>]*name="([^"]*)"/g)].map((m) =>
    decodeEntities(m[1])
  );

  function rawRows(sheetName) {
    const index = sheetNames.indexOf(sheetName);
    if (index === -1) throw new Error(`Hoja no encontrada: ${sheetName}`);
    const xml = entries[`xl/worksheets/sheet${index + 1}.xml`];
    if (!xml) throw new Error(`XML de hoja ausente para: ${sheetName}`);

    const text = xml.toString('utf8');
    const out = [];
    for (const rowMatch of text.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells = {};
      for (const cell of rowMatch[1].matchAll(/<c r="([A-Z]+\d+)"([^>]*)>([\s\S]*?)<\/c>/g)) {
        const type = /t="([^"]+)"/.exec(cell[2])?.[1];
        let value;
        if (type === 'inlineStr') {
          value = [...cell[3].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('');
        } else {
          value = /<v>([\s\S]*?)<\/v>/.exec(cell[3])?.[1] ?? '';
          if (type === 's') value = sharedStrings[Number(value)] ?? '';
        }
        cells[columnOf(cell[1])] = typeof value === 'string' ? decodeEntities(value) : value;
      }
      out.push(cells);
    }
    return out;
  }

  /** Filas de datos como objetos indexados por el texto de la cabecera. */
  function rows(sheetName) {
    const raw = rawRows(sheetName);
    if (raw.length === 0) return [];
    const header = raw[0];
    return raw.slice(1).map((cells) => {
      const record = {};
      for (const [col, title] of Object.entries(header)) {
        record[title] = cells[col] ?? '';
      }
      return record;
    });
  }

  return { sheetNames, rows };
}
