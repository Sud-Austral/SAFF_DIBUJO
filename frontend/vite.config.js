import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// La app se publica como project site de GitHub Pages: https://sud-austral.github.io/SAFF_DIBUJO/
// Sin `base` los assets se pedirían a la raíz del dominio y la página quedaría en blanco.
export default defineConfig({
  base: '/SAFF_DIBUJO/',
  plugins: [react()],
})
