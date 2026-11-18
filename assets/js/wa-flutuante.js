/*
 * Botão flutuante do WhatsApp (páginas de /trafego).
 * No computador, o texto "Vamos conversar" aparece ao passar o cursor (CSS).
 * No celular não existe cursor: o texto aparece sozinho por alguns segundos
 * ao abrir a página e de novo ao tocar no botão.
 */
(function () {
  var wa = document.querySelector('.wa-flutuante');
  if (!wa || !window.matchMedia || !window.matchMedia('(hover: none)').matches) return;
  function mostrar(ms) {
    wa.classList.add('mostrar');
    setTimeout(function () { wa.classList.remove('mostrar'); }, ms);
  }
  setTimeout(function () { mostrar(4000); }, 2500);
  wa.addEventListener('touchstart', function () { mostrar(2500); }, { passive: true });
})();
