import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // '.localhost' libera qualquer subdomínio (<slug>.localhost) em dev — sem
  // isso o Vite recusa o Host header e a loja por subdomínio nunca carrega
  // localmente. Ver src/lib/subdomain.ts.
  server: {
    allowedHosts: ['.localhost'],
  },
})
