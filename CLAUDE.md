# CLAUDE.md — SAFF_DIBUJO

## ¿Qué es este proyecto?
Este repositorio forma parte de la Unidad de Información y Análisis (UIA) de CONAF.

---

## Comandos de Referencia Rápida
- **Visualizar en local:** Abrir archivos HTML en el navegador o usar un servidor estático local como `npx serve` o la extensión Live Server de VS Code.

## Tecnología y Stack
- **Frontend:** HTML5 estático, Javascript (librerías de gráficos/grafos nativas como Cytoscape.js si aplica)

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
