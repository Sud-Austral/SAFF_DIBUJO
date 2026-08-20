// Formateadores compartidos por las vistas. Locale fijo: la app es para CONAF Chile.
const LOCALE = 'es-CL'

export const formatInt = (n) => Number(n || 0).toLocaleString(LOCALE)

/**
 * Abrevia magnitudes grandes: 1.564.656.384 -> 1.564,7 M
 * No se usa un escalón para los miles de millones: "MM" significa millones en la
 * práctica contable chilena y para estas cifras se leería mal por mil.
 */
export function formatCompact(n) {
  const v = Number(n || 0)
  if (v >= 1e6) return (v / 1e6).toLocaleString(LOCALE, { maximumFractionDigits: 1 }) + ' M'
  if (v >= 1e3) return (v / 1e3).toLocaleString(LOCALE, { maximumFractionDigits: 1 }) + ' K'
  return formatInt(v)
}

export function formatBytes(bytes) {
  const v = Number(bytes || 0)
  if (!v) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(v) / Math.log(1024)))
  return (v / 1024 ** i).toLocaleString(LOCALE, { maximumFractionDigits: 1 }) + ' ' + units[i]
}
