# Site anamenires.com.br

## Google Analytics (obrigatório em todas as páginas)

- O Analytics do site inteiro fica em um único arquivo: `assets/js/analytics.js` (ID `G-YSLKBHC7CD`). Para trocar o ID, mude só esse arquivo.
- Toda página `.html` carrega esse arquivo com `<script src="/assets/js/analytics.js"></script>` dentro do `<head>`.
- Não cole o trecho do Google (gtag) direto nas páginas: as regras de segurança (CSP em `vercel.json`) bloqueiam script escrito dentro do HTML em algumas pastas.
- Rede de segurança: o build da Vercel roda `node scripts/inject-analytics.mjs`, que coloca a linha do Analytics em qualquer página que tenha ficado sem ela. Mesmo assim, inclua a linha ao criar uma página nova.
- Para medir um clique específico, marque o botão com `data-acao="nome-do-evento"`: o `analytics.js` envia o evento automaticamente.
