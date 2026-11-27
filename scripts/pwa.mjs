// Prepara a versão web para ser instalada na tela inicial (iPhone/Android):
// grava o manifesto e insere no index.html o ícone e as marcas de "app".
// Uso: node scripts/pwa.mjs <pasta-dist> <endereço-base, ex.: /Estoque ou vazio>
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dist = process.argv[2] ?? 'dist';
const base = (process.argv[3] ?? '').replace(/\/$/, '');
const app = JSON.parse(readFileSync('app.json', 'utf8')).expo;
const nome = app.web?.name ?? app.name;
const curto = app.web?.shortName ?? app.name;
const cor = '#333333';

const manifesto = {
  name: nome,
  short_name: curto,
  start_url: `${base}/`,
  scope: `${base}/`,
  display: 'standalone',
  orientation: 'portrait',
  lang: 'pt-BR',
  background_color: '#ffffff',
  theme_color: cor,
  icons: [
    { src: `${base}/icones/icone-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: `${base}/icones/icone-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: `${base}/icones/icone-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
};
writeFileSync(join(dist, 'manifest.webmanifest'), JSON.stringify(manifesto, null, 2));

const marcas = `
<link rel="manifest" href="${base}/manifest.webmanifest">
<link rel="apple-touch-icon" href="${base}/icones/apple-touch-icon.png">
<meta name="theme-color" content="${cor}">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="${curto}">
<meta name="apple-mobile-web-app-status-bar-style" content="default">`;

for (const f of ['index.html', '404.html']) {
  const p = join(dist, f);
  if (!existsSync(p)) continue;
  let h = readFileSync(p, 'utf8');
  if (h.includes('rel="manifest"')) continue;
  h = h.replace('</head>', `${marcas}\n</head>`);
  writeFileSync(p, h);
}
console.log(`PWA: manifesto e ícones configurados (${nome}, base "${base}")`);
