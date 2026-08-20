# SAFF_DIBUJO — Explorador de modelos de datos (UIA CONAF)

Aplicación web que convierte los diccionarios de datos de los sistemas de CONAF en un
mapa navegable: qué tablas existen, qué guarda cada una, cómo se relacionan y cuáles son
críticas.

## Vistas

| Pestaña | Qué es |
|---|---|
| **Inicio** | Explica la aplicación, las cifras de cada modelo y cómo leer las categorías. |
| **Legacy** | Port fiel del diagrama original `index.html`, conservado sin rediseñar. |
| **SAFF** | Explorador nuevo sobre el modelo Oracle del Sistema de Administración Forestal. |
| **SIDCO** | El mismo explorador sobre el diccionario PostgreSQL de gestión de incendios. |

El diagrama original también queda publicado tal cual en `/legacy-original.html`.

## Desarrollo

```bash
cd frontend
npm ci
npm run data     # regenera los JSON desde index.html y desde el Excel de INSUMO
npm run dev
```

`npm run build` ejecuta `npm run data` antes de compilar, así lo publicado nunca queda
desalineado con las fuentes.

## Datos

Los esquemas no se editan a mano: se generan con los scripts de `scripts/`.

| Script | Origen | Salida |
|---|---|---|
| `extract-saf-schema.mjs` | `index.html` (literal `SCHEMA` embebido) | `frontend/src/data/saf-schema.json` |
| `build-sidco-schema.mjs` | `INSUMO/DICCIONARIO_DATOS_public_20260720_095344.xlsx` | `frontend/src/data/sidco-schema.json` |
| `build-summary.mjs` | ambos JSON | `frontend/src/data/summary.json` |

`scripts/lib/xlsx-lite.mjs` lee el Excel sin dependencias externas (un `.xlsx` es un ZIP
con XML dentro). `scripts/classify.mjs` contiene la regla de categorización, obtenida por
ingeniería inversa del diagrama original y verificada contra sus 327 tablas.

Ambos scripts fallan con código distinto de cero si los datos no cuadran, de modo que un
Excel corrupto o un `index.html` alterado rompen el build en vez de publicar datos malos.

## Publicación

`.github/workflows/deploy.yml` compila y publica en GitHub Pages en cada push a `main`.

> Requiere configurar una sola vez en el repositorio:
> **Settings → Pages → Build and deployment → Source: GitHub Actions**.

La app se sirve bajo `/SAFF_DIBUJO/` (project site), configurado en `frontend/vite.config.js`.
