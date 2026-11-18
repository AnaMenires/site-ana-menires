/*
 * Google Analytics e Google Tag Manager de todo o site anamenires.com.br.
 * Este é o ÚNICO lugar com os IDs: para trocar, mude só aqui.
 *   ID      = Google Analytics 4 (visitas e eventos data-acao)
 *   GTM_ID  = contêiner do Google Tag Manager (conversões e outras tags)
 * Atenção: o GA4 já é carregado aqui. Não crie no GTM outra tag de
 * "configuração do Google" com o mesmo G-YSLKBHC7CD, senão as visitas contam em dobro.
 * Cada página carrega este arquivo com:
 *   <script src="/assets/js/analytics.js"></script>
 * O script de build (scripts/inject-analytics.mjs) coloca essa linha
 * automaticamente em qualquer página HTML nova que esquecer dela.
 */
(function () {
  var ID = 'G-YSLKBHC7CD';
  var GTM_ID = 'GTM-NJSTGJQS';

  // Google Tag Manager
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
  var gtm = document.createElement('script');
  gtm.async = true;
  gtm.src = 'https://www.googletagmanager.com/gtm.js?id=' + GTM_ID;
  document.head.appendChild(gtm);

  var tag = document.createElement('script');
  tag.async = true;
  tag.src = 'https://www.googletagmanager.com/gtag/js?id=' + ID;
  document.head.appendChild(tag);

  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', ID);

  // Cliques em botões marcados com data-acao (ex.: kit da palestra: copiar checklist,
  // baixar modelo) viram eventos no Analytics. Downloads de PDF são medidos pelo
  // próprio Google Analytics (medição otimizada de downloads de arquivos).
  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('[data-acao]');
    if (!el) return;
    window.gtag('event', el.getAttribute('data-acao'), {
      page_path: location.pathname,
      item_index: el.getAttribute('data-i') || undefined
    });
  });
})();
