import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Cloudflare Pages serviert an der Wurzel; GitHub Pages unter dem Repo-Pfad
// /Zettelkasten/ (Repo-Name, nicht der Produktname — darum hier unverändert).
// Der Workflow setzt VITE_BASE, lokale Builds sind damit Cloudflare-tauglich.
const base = process.env.VITE_BASE || '/'

export default defineConfig({
  base,
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'Hirnfutter',
        lang: 'de',
        short_name: 'Hirnfutter',
        description: 'Karteikarten üben — Fach für Fach',
        theme_color: '#c49a3a',
        background_color: '#f7f3ee',
        display: 'standalone',
        orientation: 'portrait',
        scope: base,
        start_url: base,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Die Schriften (Nunito, Bitter) liefert die App selbst mit: kein Abruf bei Google,
        // und sie sind auch ohne Internet da. Die frühere Kartensammlung gibt es nicht mehr.
      },
    }),
  ],
  build: {
    target: 'esnext',
  },
})
