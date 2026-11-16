/*
 * Google Analytics de todo o site anamenires.com.br.
 * Este é o ÚNICO lugar com o ID de medição: para trocar o ID, mude só aqui.
 * Cada página carrega este arquivo com:
 *   <script src="/assets/js/analytics.js"></script>
 * O script de build (scripts/inject-analytics.mjs) coloca essa linha
 * automaticamente em qualquer página HTML nova que esquecer dela.
 */
(function () {
  var ID = 'G-YSLKBHC7CD';

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
