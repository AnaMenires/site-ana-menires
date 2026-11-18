# Site anamenires.com.br

## Google Analytics e Tag Manager (obrigatório em todas as páginas)

- O Analytics e o Google Tag Manager do site inteiro ficam em um único arquivo: `assets/js/analytics.js` (GA4 `G-YSLKBHC7CD`, GTM `GTM-NJSTGJQS`). Para trocar um ID, mude só esse arquivo.
- O GA4 é carregado direto pelo `analytics.js`. No GTM, use tags de conversão (Google Ads, Meta etc.); não crie outra tag do Google com o `G-YSLKBHC7CD`, senão as visitas contam em dobro.
- Páginas com regras de segurança próprias (as duas dashs em `projetos/dashboards/`) liberam só o GTM, o Analytics e os endereços de conversão do Google Ads. Uma tag nova de outra empresa (ex.: Meta Pixel) precisa ser liberada nas regras dessas páginas (`vercel.json` e a `meta` de CSP da dash de Google Ads).
- Toda página `.html` carrega esse arquivo com `<script src="/assets/js/analytics.js"></script>` dentro do `<head>`.
- Não cole o trecho do Google (gtag) direto nas páginas: as regras de segurança (CSP em `vercel.json`) bloqueiam script escrito dentro do HTML em algumas pastas.
- Rede de segurança: o build da Vercel roda `node scripts/inject-analytics.mjs`, que coloca a linha do Analytics em qualquer página que tenha ficado sem ela. Mesmo assim, inclua a linha ao criar uma página nova.
- Para medir um clique específico, marque o botão com `data-acao="nome-do-evento"`: o `analytics.js` envia o evento automaticamente.
