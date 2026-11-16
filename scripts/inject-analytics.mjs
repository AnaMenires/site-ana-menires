// Roda no build da Vercel (vercel.json > buildCommand).
// Garante que TODA página .html do site carregue /assets/js/analytics.js,
// inclusive páginas novas criadas no futuro. Remove o trecho antigo do
// Google Analytics escrito dentro da página, se ainda existir.
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const TAG = '<script src="/assets/js/analytics.js"></script>';
const IGNORAR = new Set(['.git', 'node_modules', '.vercel', 'scripts']);
const ANTIGO = /\s*<!-- Google tag \(gtag\.js\) -->\s*|\s*<script async src="https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=[^"]+"><\/script>\s*<script>[\s\S]*?gtag\('config'[^)]*\);\s*<\/script>/g;

function paginas(dir) {
  return readdirSync(dir).flatMap((nome) => {
    if (IGNORAR.has(nome)) return [];
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) return paginas(caminho);
    return nome.endsWith('.html') ? [caminho] : [];
  });
}

let alteradas = 0;
const todas = paginas('.');
for (const arquivo of todas) {
  const original = readFileSync(arquivo, 'utf8');
  let html = original.replace(ANTIGO, '\n');
  if (!html.includes(TAG)) {
    html = html.includes('</head>') ? html.replace('</head>', `${TAG}\n</head>`) : `${TAG}\n${html}`;
  }
  if (html !== original) { writeFileSync(arquivo, html); alteradas++; console.log('analytics:', arquivo); }
}
console.log(`analytics: ${todas.length} páginas verificadas, ${alteradas} ajustadas.`);
