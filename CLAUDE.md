# CLAUDE.md — SAFF_DIBUJO

## ¿Qué es este proyecto?
Este repositorio forma parte de la Unidad de Información y Análisis (UIA) de CONAF.

---

## Comandos de Referencia Rápida
- **Desarrollo:** `cd frontend && npm run dev`
- **Compilar:** `cd frontend && npm run build` (regenera los datos y compila)
- **Regenerar datos:** `cd frontend && npm run data`
- **Lint:** `cd frontend && npm run lint` (oxlint, no ESLint)

## Tecnología y Stack
- **Frontend:** React 19 + Vite en `frontend/`. Sin librerías de grafos, de UI ni de
  virtualización: el canvas, el layout y el minimapa están escritos a mano con DOM/SVG/CSS.
  **No agregar dependencias npm sin discutirlo.**
- **Datos:** JSON generados por los scripts de `scripts/` a partir de `index.html` y del
  Excel de `INSUMO/`. Nunca se editan a mano.
- **Legacy:** `index.html` en la raíz es el diagrama original. Se conserva como fuente de
  datos y como referencia visual del port en la pestaña Legacy; no se rediseña.

## Guía de Estilo y Convenciones
- **Idioma del código:** Inglés para infraestructura, nombres de variables y funciones. Español para comentarios de negocio e interfaz de usuario.
- **Frontend JavaScript/TypeScript:** Estilo `camelCase` para variables y funciones, `PascalCase` para componentes React y tipos. Cumplir con ESLint/Prettier.
- **Trazabilidad:** Cada cambio debe rastrearse directamente a un requerimiento o corrección solicitada.


## Directrices de Desarrollo (Claude Code)

### 1. Pensar antes de Codificar
- **No asumas:** Si hay ambigüedad o múltiples interpretaciones, pregunta antes de codificar.
- **Simplifica:** Elige el camino más simple y limpio. Evita la sobreingeniería y abstracciones innecesarias.

### 2. Cambios Quirúrgicos
- Modifica únicamente las líneas necesarias para cumplir el objetivo.
- No realices refactorizaciones no solicitadas en código adyacente.
- Respeta estrictamente el formato y estilo del archivo existente.

### 3. Ejecución Orientada a Objetivos
- Define el criterio de éxito para cada cambio.
- Comprueba que tus modificaciones no introduzcan errores de compilación o de linting.
