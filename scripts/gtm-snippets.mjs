// Snippets oficiais do Google Tag Manager (formato recomendado pelo Google).
// Para trocar o contêiner, mude só GTM_ID aqui e rode o build.
export const GTM_ID = 'GTM-NJSTGJQS';

// Conteúdo do <script> do <head>. NÃO altere nem um espaço sem atualizar o hash
// sha256 no vercel.json (regras de segurança das dashs), senão o GTM é bloqueado lá.
export const GTM_JS = `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${GTM_ID}');`;

export const GTM_HEAD = `<!-- Google Tag Manager -->
<script>${GTM_JS}</script>
<!-- End Google Tag Manager -->`;

export const GTM_BODY = `<!-- Google Tag Manager (noscript) -->
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${GTM_ID}"
height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
<!-- End Google Tag Manager (noscript) -->`;

// Coloca os dois snippets numa página, sem duplicar.
// <head>: logo depois do <meta charset> (o mais alto possível sem tirar o charset do começo).
// <body>: logo depois da abertura da tag.
export function instalarGTM(html) {
  if (!html.includes('<!-- Google Tag Manager -->')) {
    const charset = html.match(/<meta charset[^>]*>/i);
    if (charset) html = html.replace(charset[0], `${charset[0]}\n${GTM_HEAD}`);
    else html = html.replace(/<head[^>]*>/i, (m) => `${m}\n${GTM_HEAD}`);
  }
  if (!html.includes('<!-- Google Tag Manager (noscript) -->')) {
    html = html.replace(/<body[^>]*>/i, (m) => `${m}\n${GTM_BODY}`);
  }
  return html;
}
