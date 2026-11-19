# Site anamenires.com.br

## Google Tag Manager e Google Analytics (obrigatório em todas as páginas)

- Google Tag Manager `GTM-NJSTGJQS`, no formato oficial do Google, em TODA página `.html`:
  - snippet `<script>` logo depois do `<meta charset>` no `<head>`;
  - snippet `<noscript>` logo depois da abertura do `<body>`.
- Os dois snippets ficam definidos em `scripts/gtm-snippets.mjs`. O build da Vercel (`node scripts/inject-analytics.mjs`) coloca os dois em qualquer página que esteja sem eles, sem duplicar. Ao criar uma página nova, rode `node scripts/inject-analytics.mjs --so-paginas` para gravar os snippets nos arquivos.
- Não instale o GTM de outro jeito (nem no `analytics.js`): seria duplicado.
- O script do `<head>` do GTM é liberado nas regras de segurança das dashs pelo hash `sha256` no `vercel.json`. Se mudar qualquer caractere do snippet em `gtm-snippets.mjs`, recalcule o hash e atualize o `vercel.json`, senão o GTM é bloqueado nessas páginas.
- O Analytics (GA4 `G-YSLKBHC7CD`) fica em `assets/js/analytics.js`, carregado por toda página com `<script src="/assets/js/analytics.js"></script>` no `<head>` (o build também coloca essa linha se faltar). Para trocar o ID, mude só esse arquivo.
- Como o GA4 já é carregado pelo `analytics.js`, não crie no GTM outra tag do Google com o `G-YSLKBHC7CD`, senão as visitas contam em dobro. No GTM, use tags de conversão e eventos.
- Páginas com regras de segurança próprias (as duas dashs em `projetos/dashboards/`) liberam só o GTM, o Analytics e os endereços de conversão do Google Ads. Uma tag nova de outra empresa (ex.: Meta Pixel) precisa ser liberada nas regras dessas páginas (`vercel.json` e a `meta` de CSP da dash de Google Ads).
- Não cole o trecho do Google Analytics (gtag) direto nas páginas.
- Para medir um clique específico, marque o botão com `data-acao="nome-do-evento"`: o `analytics.js` envia o evento automaticamente.
