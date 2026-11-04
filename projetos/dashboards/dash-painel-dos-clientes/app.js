/* Central de Clientes — Ana Menires
 * Front estático. Usa só a chave pública (publishable) do Supabase; todo acesso a dados
 * é barrado no banco por RLS (só usuários em painel_admins leem/escrevem).
 * Rotas (hash): #/visao  #/dash/<clienteId>  #/clientes  #/sync   ?p=<período>&pl=<plataforma>
 */
(() => {
  "use strict";

  const SUPABASE_URL = "demo";
  const SUPABASE_KEY = "demo";
  const TZ = "America/Fortaleza";
  const PERIODOS = [["hoje", "Hoje"], ["ontem", "Ontem"], ["7", "7 dias"], ["30", "30 dias"], ["mes", "Este mês"]];
  const IMPOSTO_META = 0.12; // impostos cobrados pelo Meta no Brasil, somados a todo valor gasto no Meta
  const PLAT = { google: { nome: "Google Ads", curto: "Google", cor: "var(--serie-google)" }, meta: { nome: "Meta Ads", curto: "Meta", cor: "var(--serie-meta)" } };

  // link de convite (#/convite?t=...&k=invite|recovery): lê e tira do endereço antes de qualquer coisa
  const convite = (() => {
    const m = location.hash.match(/^#\/convite\?(.*)$/);
    if (!m) return null;
    const q = new URLSearchParams(m[1]);
    history.replaceState(null, "", location.pathname + "#/visao");
    const t = q.get("t") || "", k = q.get("k");
    return /^[A-Za-z0-9_-]{10,200}$/.test(t) && (k === "invite" || k === "recovery") ? { t, k } : { invalido: true };
  })();

  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: "painel-trafego-auth" },
  });

  // ---------- helpers ----------
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const el = (tag, attrs = {}, ...filhos) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") e.className = v;
      else if (k === "cor") e.style.setProperty("--c", v);
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? "" : v);
    }
    for (const f of filhos.flat()) if (f != null && f !== false) e.append(f instanceof Node ? f : document.createTextNode(String(f)));
    return e;
  };
  const NS = "http://www.w3.org/2000/svg";
  const svgEl = (tag, attrs = {}) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };

  const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const brl0 = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  const int = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
  const dec = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
  const pct = new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pct0 = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 0 });
  const fmtData = (iso) => { const [, m, d] = iso.split("-"); return `${d}/${m}`; };
  const div = (a, b) => (b ? a / b : null);
  const ou = (v, f) => (v == null || !isFinite(v) ? "—" : f.format(v));
  const brlCurto = (v) => (v >= 1000 ? "R$ " + dec.format(v / 1000) + " mil" : "R$ " + int.format(v));

  const hoje = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  function somaDias(iso, n) { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  const diasEntre = (a, b) => Math.round((new Date(b + "T12:00:00Z") - new Date(a + "T12:00:00Z")) / 864e5);
  // período personalizado: "AAAA-MM-DD_AAAA-MM-DD"
  const RE_PERSONAL = /^(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})$/;
  function personalValido(p) {
    const m = RE_PERSONAL.exec(p || "");
    if (!m || isNaN(Date.parse(m[1] + "T12:00:00Z")) || isNaN(Date.parse(m[2] + "T12:00:00Z"))) return false;
    return m[1] <= m[2] && m[2] <= hoje() && diasEntre(m[1], m[2]) <= 366;
  }
  const textoPersonal = (p) => { const [a, b] = p.split("_"); return a === b ? fmtData(a) : `${fmtData(a)} a ${fmtData(b)}`; };
  const nomePeriodoAtual = () => (PERIODOS.find(([k]) => k === estado.periodo) || [0, textoPersonal(estado.periodo)])[1];
  function intervalo(p) {
    const h = hoje();
    let ini, fim = h;
    if (RE_PERSONAL.test(p)) [ini, fim] = p.split("_");
    else if (p === "hoje") ini = h;
    else if (p === "ontem") ini = fim = somaDias(h, -1);
    else if (p === "mes") ini = h.slice(0, 8) + "01";
    else ini = somaDias(h, -(Number(p) - 1));
    const n = diasEntre(ini, fim) + 1;
    return { ini, fim, n, antIni: somaDias(ini, -n), antFim: somaDias(ini, -1) };
  }
  const textoIntervalo = (r) => (r.ini === r.fim ? fmtData(r.ini) : `${fmtData(r.ini)} a ${fmtData(r.fim)}`) +
    ` · comparado a ${r.antIni === r.antFim ? fmtData(r.antIni) : `${fmtData(r.antIni)} a ${fmtData(r.antFim)}`}`;

  // ---------- estado e rotas ----------
  const estado = { campAba: {}, filtroCamp: null, ordemAd: { k: "custo", asc: false }, rota: "visao", clienteId: "", postsCliente: "todos", mes: "", diaSel: "", postEdit: null, importar: null, visaoAba: "alertas", periodo: "7", plataforma: "", clientes: [], ordem: { k: "custo", asc: false } };
  const ROTAS = ["visao", "dash", "posts", "clientes", "sync", "equipe"];
  const ROTAS_ADMIN = ["clientes", "equipe"];
  const ehAdmin = () => estado.papel === "admin";

  function lerHash() {
    const [caminho, qs] = (location.hash.replace(/^#\/?/, "") || "visao").split("?");
    const [rota, id] = caminho.split("/");
    const q = new URLSearchParams(qs || "");
    estado.rota = ROTAS.includes(rota) && (ehAdmin() || !ROTAS_ADMIN.includes(rota)) ? rota : "visao";
    if (estado.rota === "posts") estado.postsCliente = id || estado.postsCliente || "todos";
    else estado.clienteId = id || estado.clienteId;
    const m = q.get("m"); if (/^\d{4}-\d{2}$/.test(m || "")) estado.mes = m;
    const p = q.get("p"); estado.periodo = PERIODOS.some(([k]) => k === p) || personalValido(p) ? p : "7";
    const pl = q.get("pl"); estado.plataforma = pl === "google" || pl === "meta" ? pl : "";
    estado.visaoAba = ["clientes", "ranking"].includes(q.get("v")) ? q.get("v") : "alertas";
  }
  function irPara(rota, extra = {}) {
    const s = { ...estado, rota, ...extra };
    const q = new URLSearchParams();
    if (s.periodo !== "7") q.set("p", s.periodo);
    if (rota === "dash" && s.plataforma) q.set("pl", s.plataforma);
    if (rota === "posts" && s.mes && s.mes !== hoje().slice(0, 7)) q.set("m", s.mes);
    if (rota === "visao" && s.visaoAba !== "alertas") q.set("v", s.visaoAba);
    const caminho = rota === "dash" && s.clienteId ? `dash/${s.clienteId}` : rota === "posts" ? `posts/${s.postsCliente || "todos"}` : rota;
    const novo = `#/${caminho}${q.toString() ? "?" + q : ""}`;
    if (location.hash !== novo) location.hash = novo; else render();
  }
  window.addEventListener("hashchange", () => { lerHash(); render(); fecharMenu(); });

  // ---------- auth ----------
  async function iniciar() {
    if (convite) {
      if (convite.invalido) { mostrarLogin("Link de convite inválido. Peça um novo para quem te convidou."); return; }
      await sb.auth.signOut({ scope: "local" });
      const { error } = await sb.auth.verifyOtp({ token_hash: convite.t, type: convite.k });
      if (error) { mostrarLogin("Este link expirou ou já foi usado. Peça um novo convite."); return; }
      mostrarCriarSenha();
    } else {
      const { data: { session } } = await sb.auth.getSession();
      session ? await entrar() : mostrarLogin();
    }
    sb.auth.onAuthStateChange((ev) => { if (ev === "SIGNED_OUT") mostrarLogin(); });
  }
  function mostrarLogin(msg = "") {
    $("#tela-app").hidden = true;
    $("#tela-senha").hidden = true;
    $("#tela-login").hidden = false;
    $("#login-erro").textContent = msg;
  }
  async function mostrarCriarSenha() {
    const { data: { user } } = await sb.auth.getUser();
    $("#tela-login").hidden = true; $("#tela-app").hidden = true; $("#tela-senha").hidden = false;
    $("#senha-email").textContent = user?.email || "";
    $("#senha-nova").focus();
  }
  $("#form-senha").addEventListener("submit", async (e) => {
    e.preventDefault();
    const erro = $("#senha-erro"); erro.textContent = "";
    const a = $("#senha-nova").value, b = $("#senha-conf").value;
    if (a.length < 8) { erro.textContent = "Use pelo menos 8 caracteres."; return; }
    if (a !== b) { erro.textContent = "As senhas não são iguais."; return; }
    const btn = e.submitter; btn.disabled = true;
    const { error } = await sb.auth.updateUser({ password: a });
    btn.disabled = false;
    $("#senha-nova").value = ""; $("#senha-conf").value = "";
    if (error) { erro.textContent = /different|same/i.test(error.message) ? "Escolha uma senha diferente da anterior." : "Não foi possível salvar a senha. Tente outra."; return; }
    $("#tela-senha").hidden = true;
    await entrar();
  });
  $("#form-login").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.submitter; btn.disabled = true;
    $("#login-erro").textContent = "";
    const { error } = await sb.auth.signInWithPassword({ email: $("#login-email").value.trim(), password: $("#login-senha").value });
    btn.disabled = false;
    $("#login-senha").value = "";
    if (error) {
      $("#login-erro").textContent = error.status === 429 ? "Muitas tentativas. Espere alguns minutos." : "E-mail ou senha inválidos.";
      return;
    }
    await entrar();
  });
  async function entrar() {
    const { data, error } = await sb.from("painel_admins").select("user_id,papel").maybeSingle();
    if (error || !data) { await sb.auth.signOut(); mostrarLogin("Este usuário não tem acesso ao painel."); return; }
    estado.papel = data.papel === "visualizador" ? "visualizador" : "admin";
    document.body.classList.toggle("visualizador", !ehAdmin());
    $("#tela-login").hidden = true;
    $("#tela-app").hidden = false;
    lerHash();
    await carregarClientes();
    render();
    assinarRealtime();
  }
  $("#btn-sair").addEventListener("click", () => sb.auth.signOut());

  // ---------- menu mobile ----------
  function fecharMenu() { $("#lateral").classList.remove("aberta"); $("#btn-menu").setAttribute("aria-expanded", "false"); }
  $("#btn-menu").addEventListener("click", () => {
    const aberto = $("#lateral").classList.toggle("aberta");
    $("#btn-menu").setAttribute("aria-expanded", String(aberto));
  });

  // ---------- realtime ----------
  let canal, debounce;
  function assinarRealtime() {
    if (canal) return;
    canal = sb.channel("painel-sync")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "painel_sync_log" }, () => {
        clearTimeout(debounce); debounce = setTimeout(() => { limparCaches(); render(); }, 2500);
      })
      .subscribe();
    setInterval(() => { limparCaches(); render(); }, 5 * 60 * 1000); // garantia caso o realtime caia
  }

  // ---------- dados ----------
  async function carregarClientes() {
    const { data, error } = await sb.from("painel_clientes").select("*").order("nome");
    if (error) { aviso("Não foi possível carregar os clientes."); return; }
    estado.clientes = data;
  }
  const clientesAtivos = () => estado.clientes.filter((c) => c.ativo);
  const plataformasDo = (c) => [c.google_customer_id && "google", c.meta_ad_account_id && "meta"].filter(Boolean);

  const cache = new Map(); // métricas por intervalo
  async function metricas(r) {
    const chave = r.antIni + r.fim;
    if (cache.has(chave)) return cache.get(chave);
    const linhas = [];
    for (let de = 0; ; de += 1000) {
      const { data, error } = await sb.from("painel_metricas")
        .select("cliente_id,plataforma,data,campanha_id,campanha_nome,impressoes,cliques,custo,conversoes,resultados,resultado_tipo")
        .gte("data", r.antIni).lte("data", r.fim).order("id").range(de, de + 999);
      if (error) throw error;
      for (const l of data) if (l.plataforma === "meta") l.custo = +l.custo * (1 + IMPOSTO_META);
      linhas.push(...data);
      if (data.length < 1000) break;
    }
    cache.set(chave, linhas);
    return linhas;
  }
  const totais = (ls) => ls.reduce((t, l) => {
    t.custo += +l.custo; t.impressoes += +l.impressoes; t.cliques += +l.cliques; t.conversoes += +l.conversoes; t.resultados += +(l.resultados || 0); return t;
  }, { custo: 0, impressoes: 0, cliques: 0, conversoes: 0, resultados: 0 });

  // contas (status e saldo), atualizadas a cada sincronização
  let contasCache = null, saldoGCache = null;
  const adsCache = new Map();
  function limparCaches() { cache.clear(); contasCache = null; saldoGCache = null; adsCache.clear(); }
  // saldo do Google calculado no banco (recargas cadastradas - gasto desde a 1ª recarga)
  async function saldosGoogle() {
    if (saldoGCache) return saldoGCache;
    const { data, error } = await sb.from("painel_saldo_google").select("*");
    if (error) { console.error(error); return {}; }
    return (saldoGCache = Object.fromEntries(data.map((x) => [x.cliente_id, x])));
  }
  async function contas() {
    if (contasCache) return contasCache;
    const { data, error } = await sb.from("painel_contas").select("*");
    if (error) { console.error(error); return []; }
    return (contasCache = data);
  }

  function aviso(msg) { const a = $("#aviso"); a.textContent = msg; a.hidden = !msg; }

  // ---------- render geral ----------
  let renderizando = false, pendente = false;
  async function render() {
    if (renderizando) { pendente = true; return; }
    renderizando = true;
    try {
      $$(".menu a").forEach((a) => a.classList.toggle("ativo", a.dataset.rota === estado.rota));
      $$(".pagina").forEach((p) => (p.hidden = p.dataset.pagina !== estado.rota));
      $$(".segmentado.periodo").forEach(desenharPeriodo);
      if (estado.rota === "visao") await renderVisao();
      else if (estado.rota === "dash") await renderDash();
      else if (estado.rota === "posts") await renderPosts();
      else if (estado.rota === "clientes") renderClientes();
      else if (estado.rota === "equipe") await renderEquipe();
      await renderLog();
    } catch (e) {
      console.error(e);
      aviso("Não foi possível carregar os dados. Tente de novo em instantes.");
    } finally {
      renderizando = false;
      if (pendente) { pendente = false; render(); }
    }
  }

  function desenharPeriodo(box) {
    const personal = RE_PERSONAL.test(estado.periodo);
    box.replaceChildren(...PERIODOS.map(([k, t]) => el("button", {
      role: "radio", "aria-checked": String(estado.periodo === k), class: estado.periodo === k ? "ativo" : null,
      onclick: () => irPara(estado.rota, { periodo: k }),
    }, t)), el("button", {
      role: "radio", "aria-checked": String(personal), "aria-haspopup": "dialog", class: personal ? "ativo" : null,
      onclick: (e) => abrirPersonal(e.currentTarget),
    }, personal ? "📅 " + textoPersonal(estado.periodo) : "📅 Personalizado"));
  }
  // caixinha de datas do período personalizado
  let popPer = null;
  function fecharPersonal() { if (popPer) { popPer.remove(); popPer = null; } }
  function abrirPersonal(btn) {
    if (popPer) { fecharPersonal(); return; }
    const h = hoje(), r = intervalo(estado.periodo);
    const de = el("input", { type: "date", max: h, value: r.ini, "aria-label": "Data inicial" });
    const ate = el("input", { type: "date", max: h, value: r.fim, "aria-label": "Data final" });
    const erro = el("p", { class: "erro", role: "alert" });
    const atalho = (t, ini, fim) => el("button", { type: "button", class: "btn sm", onclick: () => { de.value = ini; ate.value = fim; } }, t);
    const mesAnt = (() => { const d = new Date(h.slice(0, 8) + "01T12:00:00Z"); d.setUTCDate(0); return [d.toISOString().slice(0, 8) + "01", d.toISOString().slice(0, 10)]; })();
    popPer = el("form", { class: "pop-periodo", role: "dialog", "aria-label": "Escolher período", onsubmit: (e) => {
      e.preventDefault();
      const p = `${de.value}_${ate.value}`;
      if (!de.value || !ate.value) { erro.textContent = "Escolha as duas datas."; return; }
      if (de.value > ate.value) { erro.textContent = "A data inicial vem depois da final."; return; }
      if (!personalValido(p)) { erro.textContent = "Escolha até hoje e no máximo 1 ano."; return; }
      fecharPersonal(); irPara(estado.rota, { periodo: p });
    } },
      el("div", { class: "pop-datas" }, el("label", {}, "De", de), el("label", {}, "Até", ate)),
      el("div", { class: "pop-atalhos" }, atalho("Mês passado", ...mesAnt), atalho("Últimos 14 dias", somaDias(h, -13), h), atalho("Últimos 90 dias", somaDias(h, -89), h)),
      erro,
      el("div", { class: "linha-botoes" }, el("button", { type: "submit", class: "btn primario" }, "Aplicar"),
        el("button", { type: "button", class: "btn", onclick: fecharPersonal }, "Cancelar")));
    document.body.append(popPer);
    const rb = btn.getBoundingClientRect();
    popPer.style.top = (rb.bottom + window.scrollY + 8) + "px";
    popPer.style.left = Math.max(8, Math.min(rb.right + window.scrollX - popPer.offsetWidth, window.innerWidth - popPer.offsetWidth - 8)) + "px";
    de.focus();
  }
  document.addEventListener("click", (e) => { if (popPer && !popPer.contains(e.target) && !e.target.closest(".segmentado.periodo")) fecharPersonal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") fecharPersonal(); });
  window.addEventListener("hashchange", fecharPersonal);

  function variacao(a, b, menorMelhor = false, neutra = false) {
    if (a == null || !b) return { txt: "sem comparação", cls: "" };
    const v = (a - b) / b;
    const seta = v > 0 ? "▲" : v < 0 ? "▼" : "■";
    const cls = neutra || Math.abs(v) < 0.005 ? "" : (menorMelhor ? v < 0 : v > 0) ? "boa" : "ruim";
    return { txt: `${seta} ${pct0.format(Math.abs(v))} vs. anterior`, cls };
  }
  function statusCpa(cpa, metaCpl, cpaAnt) {
    if (metaCpl && cpa != null) {
      const ok = cpa <= metaCpl;
      return { txt: `${ok ? "✓ Dentro" : "✕ Acima"} da meta de ${brl.format(metaCpl)}`, cls: ok ? "boa" : "ruim" };
    }
    return variacao(cpa, cpaAnt, true);
  }
  const kpi = (r, v, s, destaque) => el("div", { class: "kpi" + (destaque ? " destaque" : "") },
    el("div", { class: "rotulo" }, r), el("div", { class: "valor" }, v), el("div", { class: "sub " + (s.cls || "") }, s.txt));

  function subtitulo(secao, r) {
    let p = $(".intervalo", secao);
    if (!p) { p = el("p", { class: "muted intervalo" }); $(".cabecalho > div", secao).append(p); }
    p.textContent = textoIntervalo(r) + ` · valores do Meta com +${pct0.format(IMPOSTO_META)} de impostos`;
  }

  // ---------- visão geral ----------
  async function renderVisao() {
    const secao = $('[data-pagina="visao"]');
    const aba = estado.visaoAba;
    $$("#visao-abas button").forEach((b) => { const on = b.dataset.aba === aba; b.classList.toggle("ativo", on); b.setAttribute("aria-selected", String(on)); });
    $("#visao-alertas").hidden = aba !== "alertas";
    $("#visao-clientes").hidden = aba !== "clientes";
    $("#visao-ranking").hidden = aba !== "ranking";
    $(".segmentado.periodo", secao).hidden = aba !== "clientes";
    const alertas = await calcularAlertas();
    $("#qtd-alertas").textContent = alertas.length ? String(alertas.length) : "";
    if (aba === "alertas") {
      $("#visao-titulo").textContent = alertas.length ? `${alertas.length} alerta${alertas.length === 1 ? "" : "s"}` : "Tudo em ordem";
      subtitulo(secao, intervalo("7"));
      $(".intervalo", secao).textContent = "Saldo e status atuais das contas · desempenho dos últimos 7 dias";
      desenharAlertas(alertas);
      return;
    }
    if (aba === "ranking") {
      $("#visao-titulo").textContent = "Por onde começar";
      subtitulo(secao, intervalo("7"));
      $(".intervalo", secao).textContent = "Clientes que mais precisam de atenção primeiro · custo por conversão dos últimos 7 dias completos e ritmo do orçamento";
      await renderRanking(alertas);
      return;
    }
    const r = intervalo(estado.periodo);
    subtitulo(secao, r);
    const linhas = await metricas(r);
    const ativos = clientesAtivos();
    const ids = new Set(ativos.map((c) => c.id));
    const atual = linhas.filter((l) => l.data >= r.ini && ids.has(l.cliente_id));
    const ant = linhas.filter((l) => l.data <= r.antFim && ids.has(l.cliente_id));
    const a = totais(atual), b = totais(ant);
    $("#visao-titulo").textContent = `${ativos.length} cliente${ativos.length === 1 ? "" : "s"} ativos`;
    $("#visao-kpis").replaceChildren(
      kpi("Investimento total", brl.format(a.custo), variacao(a.custo, b.custo, false, true), true),
      kpi("Conversões", dec.format(a.conversoes), variacao(a.conversoes, b.conversoes)),
      kpi("Custo por conversão médio", ou(div(a.custo, a.conversoes), brl), variacao(div(a.custo, a.conversoes), div(b.custo, b.conversoes), true)),
    );

    const dias = Array.from({ length: Math.max(r.n, 1) }, (_, i) => somaDias(r.ini, i));
    const cards = ativos.map((c) => {
      const la = atual.filter((l) => l.cliente_id === c.id), lb = ant.filter((l) => l.cliente_id === c.id);
      const t = totais(la), tb = totais(lb);
      const porDia = Object.fromEntries(dias.map((d) => [d, 0]));
      for (const l of la) if (l.data in porDia) porDia[l.data] += +l.custo;
      return { c, t, tb, serie: dias.map((d) => porDia[d]) };
    }).sort((x, y) => y.t.custo - x.t.custo || x.c.nome.localeCompare(y.c.nome, "pt-BR"));

    const box = $("#visao-cards");
    if (!cards.length) { box.replaceChildren(el("div", { class: "card vazio-msg" }, "Nenhum cliente ativo. Cadastre em Clientes.")); return; }
    box.replaceChildren(...cards.map(({ c, t, tb, serie }) => {
      const cpa = div(t.custo, t.conversoes);
      const semDados = t.custo === 0 && t.impressoes === 0;
      const st = semDados ? { txt: "Sem dados no período", cls: "" } : statusCpa(cpa, c.meta_cpl ? +c.meta_cpl : null, div(tb.custo, tb.conversoes));
      return el("button", { class: "card-cliente" + (semDados ? " vazio" : ""), "aria-label": `Abrir dashboard de ${c.nome}`,
        onclick: () => irPara("dash", { clienteId: c.id, plataforma: "" }) },
        el("div", { class: "topo" },
          el("div", {}, el("div", { class: "nome" }, c.nome),
            el("div", { class: "tags" }, plataformasDo(c).map((p) => el("span", { class: "tag", cor: PLAT[p].cor }, PLAT[p].curto)))),
          r.n > 1 && !semDados ? sparkline(serie) : null),
        el("div", { class: "numeros" },
          el("div", {}, el("div", { class: "r" }, "Investimento"), el("div", { class: "v" }, brl0.format(t.custo))),
          el("div", {}, el("div", { class: "r" }, "Conversões"), el("div", { class: "v" }, dec.format(t.conversoes))),
          el("div", {}, el("div", { class: "r" }, "Custo/conv."), el("div", { class: "v" }, ou(cpa, brl)))),
        el("div", { class: "rodape" }, el("span", { class: st.cls }, st.txt), el("span", { class: "seta", "aria-hidden": "true" }, "Ver dash →")));
    }));
  }
  // ---------- orçamento ----------
  const MESES_NOME = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const num = (v) => (v == null || v === "" ? null : +v);
  function janelaOrc(periodo) {
    const h = hoje();
    let ini, fim;
    if (periodo === "semanal") {
      const dow = (new Date(h + "T12:00:00Z").getUTCDay() + 6) % 7; // segunda = 0
      ini = somaDias(h, -dow); fim = somaDias(ini, 6);
    } else {
      ini = h.slice(0, 8) + "01";
      const d = new Date(ini + "T12:00:00Z"); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0);
      fim = d.toISOString().slice(0, 10);
    }
    return { ini, fim, h, ontem: somaDias(h, -1), total: diasEntre(ini, fim) + 1, completos: diasEntre(ini, h) };
  }
  // linhas de orçamento do cliente: uma por plataforma (se separado) ou uma total
  function linhasOrc(c, plats) {
    const g = num(c.orc_google), m = num(c.orc_meta), t = num(c.orc_total);
    if (g != null || m != null) return [["google", g], ["meta", m]].filter(([p, v]) => v != null && v > 0 && plats.includes(p)).map(([p, v]) => ({ plat: p, valor: v }));
    return t ? [{ plat: null, valor: t }] : [];
  }
  // Valor cadastrado = valor cheio (o que entra na conta). Quando a linha é só de Meta, o orçamento
  // que vale é o cheio menos 12% de impostos, comparado com o valor usado no Gerenciador (sem imposto).
  function calcOrc(linha, c, linhas, j) {
    const soMeta = linha.plat === "meta" || (!linha.plat && plataformasDo(c).join() === "meta");
    const custo = (l) => (soMeta ? +l.custo / (1 + IMPOSTO_META) : +l.custo);
    const valor = soMeta ? linha.valor * (1 - IMPOSTO_META) : linha.valor;
    const ls = linhas.filter((l) => l.cliente_id === c.id && (!linha.plat || l.plataforma === linha.plat) && l.data >= j.ini);
    const gasto = ls.reduce((s, l) => s + custo(l), 0);
    const ateOntem = ls.filter((l) => l.data <= j.ontem).reduce((s, l) => s + custo(l), 0);
    const projecao = j.completos > 0 ? (ateOntem / j.completos) * j.total : null;
    const esperado = j.completos / j.total;
    let status = "ok";
    if (gasto >= valor) status = "estourou";
    else if (projecao != null && projecao > valor * 1.1) status = "acima";
    else if (projecao != null && j.completos >= 3 && projecao < valor * 0.8) status = "abaixo";
    return { ...linha, cheio: linha.valor, valor, soMeta, gasto, projecao, esperado, pct: gasto / valor, status };
  }
  const nomePeriodo = (c, j) => c.orc_periodo === "semanal" ? `da semana (${fmtData(j.ini)} a ${fmtData(j.fim)})` : `de ${MESES_NOME[+j.ini.slice(5, 7) - 1]}`;
  const STATUS_ORC = { ok: ["No ritmo", "boa"], acima: ["Acima do ritmo", "ruim"], abaixo: ["Abaixo do ritmo", "aviso"], estourou: ["Orçamento estourado", "ruim"] };
  // gasto discreto à esquerda, orçamento (o valor que vale) em destaque no final
  function orcValores(r) {
    const total = el("b", { class: "orc-total" }, brl.format(r.valor));
    Object.assign(total.style, { fontFamily: "Poppins, sans-serif", fontSize: "20px", fontWeight: "700", color: "var(--roxo)", marginLeft: "8px" });
    const box = el("span", { class: "orc-valores" },
      el("span", { class: "muted" }, `gasto ${brl.format(r.gasto)} · ${pct0.format(r.pct)} de`), total);
    Object.assign(box.style, { display: "inline-flex", alignItems: "baseline", flexWrap: "wrap", justifyContent: "flex-end" });
    return box;
  }
  async function renderOrcamento(c, plats) {
    const box = $("#orc-card");
    const j = janelaOrc(c.orc_periodo);
    const linhas = linhasOrc(c, estado.plataforma ? [estado.plataforma] : plats);
    $("#orc-titulo").textContent = "Orçamento " + nomePeriodo(c, j);
    const cheios = linhas.map((l) => (linhas.length > 1 ? PLAT[l.plat].curto + " " : "") + brl.format(l.valor)).join(" · ");
    $("#orc-titulo").nextElementSibling.textContent = (linhas.length ? `Valor cheio: ${cheios} · ` : "") + "a linha mostra onde o gasto deveria estar hoje";
    if (!linhas.length) {
      const temAlgum = num(c.orc_total) || num(c.orc_google) || num(c.orc_meta);
      box.replaceChildren(el("p", { class: "muted" }, temAlgum ? "Sem orçamento para esta plataforma." : "Nenhum orçamento cadastrado para este cliente. ",
        !temAlgum && ehAdmin() ? el("a", { href: "#/clientes", onclick: () => setTimeout(() => editar(c), 50) }, "Cadastrar orçamento") : null));
      return;
    }
    const dados = await metricas({ antIni: somaDias(j.h, -34), fim: j.h });
    box.replaceChildren(...linhas.map((l) => {
      const r = calcOrc(l, c, dados, j);
      const [stTxt, stCls] = STATUS_ORC[r.status];
      const barra = el("div", { class: "orc-barra" }, el("span", { class: "orc-fill " + stCls }), el("i", { class: "orc-marca", title: "Onde deveria estar hoje" }));
      barra.firstChild.style.width = Math.min(100, r.pct * 100) + "%";
      barra.lastChild.style.left = Math.min(100, r.esperado * 100) + "%";
      return el("div", { class: "orc-linha" },
        el("div", { class: "orc-topo" },
          el("b", {}, r.plat ? PLAT[r.plat].nome : "Total do cliente"),
          orcValores(r)),
        barra,
        el("div", { class: "orc-rodape" },
          el("span", { class: "orc-st " + stCls }, stTxt),
          el("span", { class: "muted" }, [r.projecao != null ? `Projeção: ${brl.format(r.projecao)}` : "Projeção a partir de amanhã",
            `restam ${brl.format(Math.max(0, r.valor - r.gasto))} em ${j.total - j.completos} dia${j.total - j.completos === 1 ? "" : "s"}`].join(" · "))));
    }));
  }

  // ---------- ranking ----------
  async function renderRanking(alertas) {
    const h = hoje(), ontem = somaDias(h, -1);
    const linhas = await metricas({ antIni: somaDias(h, -34), fim: h });
    const cs = await contas(), sg = await saldosGoogle();
    const lista = clientesAtivos().map((c) => {
      const ls = linhas.filter((l) => l.cliente_id === c.id);
      const s7 = totais(ls.filter((l) => l.data >= somaDias(h, -7) && l.data <= ontem));
      const base = totais(ls.filter((l) => l.data >= somaDias(h, -35) && l.data <= somaDias(h, -8)));
      const cpa = div(s7.custo, s7.conversoes), cpaBase = div(base.custo, base.conversoes);
      const meta = c.meta_cpl ? +c.meta_cpl : null;
      const ref = meta || cpaBase;
      const cpaDesvio = cpa != null && ref ? cpa / ref - 1 : (s7.custo > 0 && s7.conversoes === 0 && ref ? 1 : null);
      // orçamento: pior linha (mais longe do ritmo)
      const j = janelaOrc(c.orc_periodo);
      let orc = null;
      for (const l of linhasOrc(c, plataformasDo(c))) {
        const r = calcOrc(l, c, linhas, j);
        const d = r.projecao != null ? r.projecao / r.valor - 1 : null;
        if (d != null && (!orc || Math.abs(d) > Math.abs(orc.d))) orc = { d, r };
      }
      // saldo: menor número de dias entre as contas pré-pagas
      const diasSaldo = [];
      const gm = (plat) => ls.filter((l) => l.plataforma === plat && l.data >= somaDias(h, -7) && l.data <= ontem).reduce((t, l) => t + +l.custo, 0) / 7;
      const contaMeta = cs.find((k) => k.cliente_id === c.id && k.plataforma === "meta");
      if (contaMeta && contaMeta.pre_pago && contaMeta.saldo != null) { const g = gm("meta"); diasSaldo.push(+contaMeta.saldo < 1 ? 0 : g > 0 ? +contaMeta.saldo / g : null); }
      if (sg[c.id] && c.google_customer_id) { const g = gm("google"); diasSaldo.push(+sg[c.id].saldo < 1 ? 0 : g > 0 ? +sg[c.id].saldo / g : null); }
      const dias = diasSaldo.filter((x) => x != null).sort((a, b) => a - b)[0] ?? null;
      const meus = alertas.filter((a) => a.c.id === c.id);
      const crit = meus.filter((a) => a.nivel === "critico").length, aten = meus.length - crit;
      const nota = crit * 100 + aten * 30 + Math.max(0, cpaDesvio ?? 0) * 100 +
        (orc && Math.abs(orc.d) > 0.1 ? Math.abs(orc.d) * 50 : 0) + (dias != null && dias < 7 ? (7 - dias) * 8 : 0);
      return { c, s7, cpa, meta, cpaBase, cpaDesvio, orc, dias, crit, aten, nota };
    }).sort((a, b) => b.nota - a.nota || b.s7.custo - a.s7.custo);

    const box = $("#visao-ranking");
    if (!lista.length) { box.replaceChildren(el("div", { class: "card vazio-msg" }, "Nenhum cliente ativo.")); return; }
    const cls = (v, lim) => (v == null ? "" : v > lim ? "ruim" : v < -lim ? "atn" : "boa");
    const clsCpa = (v) => (v == null ? "" : v > 0.1 ? "ruim" : "boa");
    box.replaceChildren(el("section", { class: "card" }, el("div", { class: "tabela-wrap" }, el("table", { class: "tabela-rank" },
      el("thead", {}, el("tr", {}, ["#", "Cliente", "Custo por conversão (7 dias)", "Ritmo do orçamento", "Saldo", "Alertas", ""].map((t) => el("th", {}, t)))),
      el("tbody", {}, lista.map((x, i) => el("tr", { class: "rank-linha", tabindex: "0", onclick: () => irPara("dash", { clienteId: x.c.id, plataforma: "", periodo: "7" }),
        onkeydown: (e) => { if (e.key === "Enter") irPara("dash", { clienteId: x.c.id, plataforma: "", periodo: "7" }); } },
        el("td", { class: "rank-pos" }, String(i + 1)),
        el("td", { class: "nome" }, x.c.nome, el("div", { class: "tags" }, plataformasDo(x.c).map((p) => el("span", { class: "tag", cor: PLAT[p].cor }, PLAT[p].curto)))),
        el("td", {}, el("b", {}, x.cpa != null ? brl.format(x.cpa) : x.s7.custo > 0 ? "sem conversão" : "—"),
          el("div", { class: "rank-sub " + clsCpa(x.cpaDesvio) }, x.cpaDesvio == null ? (x.meta ? `meta ${brl.format(x.meta)}` : "sem meta cadastrada")
            : `${x.cpaDesvio > 0 ? "▲" : "▼"} ${pct0.format(Math.abs(x.cpaDesvio))} ${x.cpaDesvio > 0 ? "acima" : "abaixo"} ${x.meta ? "da meta" : "da média"}`)),
        el("td", {}, x.orc ? [el("b", {}, `Projeção ${pct0.format(1 + x.orc.d)}`),
          el("div", { class: "rank-sub " + cls(x.orc.d, 0.1) }, Math.abs(x.orc.d) <= 0.1 ? "no ritmo" : x.orc.d > 0 ? "vai passar do orçamento" : "gastando abaixo")]
          : el("span", { class: "muted" }, linhasOrc(x.c, plataformasDo(x.c)).length ? "a partir de amanhã" : "sem orçamento")),
        el("td", {}, x.dias == null ? el("span", { class: "muted" }, "—") : el("span", { class: "rank-sub " + (x.dias < 3 ? "ruim" : x.dias < 7 ? "atn" : "boa") },
          x.dias < 1 ? "acabou" : `~${int.format(Math.floor(x.dias))} dia${Math.floor(x.dias) === 1 ? "" : "s"}`)),
        el("td", {}, x.crit ? el("span", { class: "badge" }, x.crit) : null, x.aten ? el("span", { class: "badge atencao" }, x.aten) : null,
          !x.crit && !x.aten ? el("span", { class: "rank-sub boa" }, "✓") : null),
        el("td", { class: "seta" }, "Ver dash →"))))))));
  }

  // ---------- alertas ----------
  async function calcularAlertas() {
    const h = hoje(), ontem = somaDias(h, -1);
    const linhas = await metricas({ antIni: somaDias(h, -34), fim: h });
    const cs = await contas(), sg = await saldosGoogle();
    const { data: logs } = await sb.from("painel_sync_log").select("executado_em,cliente_id,plataforma,status,mensagem")
      .order("executado_em", { ascending: false }).limit(200);
    const out = [];
    const add = (nivel, c, plat, titulo, detalhe) => out.push({ nivel, c, plat, titulo, detalhe });
    for (const c of clientesAtivos()) {
      for (const plat of plataformasDo(c)) {
        const ls = linhas.filter((l) => l.cliente_id === c.id && l.plataforma === plat);
        const soma = (de, ate) => totais(ls.filter((l) => l.data >= de && l.data <= ate));
        const s7 = soma(somaDias(h, -7), ontem), base = soma(somaDias(h, -35), somaDias(h, -8));
        const gastoDia = s7.custo / 7;
        const conta = cs.find((k) => k.cliente_id === c.id && k.plataforma === plat);
        const nomeP = PLAT[plat].curto;

        // conta e saldo
        if (conta && !conta.status_ok) add("critico", c, plat, `Conta ${nomeP} ${conta.status.toLowerCase()}`, "Os anúncios não rodam enquanto a conta estiver assim.");
        else if (conta && conta.pre_pago && conta.saldo != null) {
          const saldo = +conta.saldo;
          if (saldo < 1) add("critico", c, plat, "Saldo do Meta acabou", gastoDia > 0 ? `Gastava em média ${brl.format(gastoDia)}/dia. Adicione saldo para voltar a veicular.` : "Adicione saldo para voltar a veicular.");
          else if (gastoDia > 0 && saldo / gastoDia < 3) add("atencao", c, plat, `Saldo baixo: ${brl.format(saldo)}`,
            `Dá para cerca de ${Math.max(0, Math.floor(saldo / gastoDia))} dia(s) no ritmo atual (${brl.format(gastoDia)}/dia).`);
        } else if (conta && conta.limite_gasto) {
          const resta = +conta.limite_gasto - +conta.gasto_total;
          if (resta <= 0) add("critico", c, plat, "Limite de gastos da conta atingido", "Aumente ou remova o limite no Meta para voltar a veicular.");
          else if (gastoDia > 0 && resta / gastoDia < 3) add("atencao", c, plat, `Limite de gastos quase no fim: ${brl.format(resta)}`, "Restante do limite da conta.");
        }

        // saldo do Google pelas recargas cadastradas
        if (plat === "google" && sg[c.id]) {
          const saldo = +sg[c.id].saldo;
          if (saldo < 1) add("critico", c, plat, "Saldo do Google acabou", `Pelas recargas cadastradas o saldo zerou${gastoDia > 0 ? ` (gastava ${brl.format(gastoDia)}/dia)` : ""}. Cadastre a nova recarga quando colocar crédito.`);
          else if (gastoDia > 0 && saldo / gastoDia < 3) add("atencao", c, plat, `Saldo do Google baixo: ${brl.format(saldo)}`,
            `Dá para cerca de ${Math.max(0, Math.floor(saldo / gastoDia))} dia(s) no ritmo atual (${brl.format(gastoDia)}/dia).`);
        }

        // entrega parada
        const dHoje = soma(h, h).custo, dOntem = soma(ontem, ontem).custo, mediaAnt = soma(somaDias(h, -8), somaDias(h, -2)).custo / 7;
        if (mediaAnt >= 10 && dOntem === 0 && dHoje === 0) add("critico", c, plat, "Parou de veicular", `Sem gasto ontem nem hoje. Antes gastava ${brl.format(mediaAnt)}/dia.`);

        // custo por conversão
        const cpa7 = div(s7.custo, s7.conversoes), cpaBase = div(base.custo, base.conversoes);
        const metaCpl = c.meta_cpl ? +c.meta_cpl : null;
        if (s7.conversoes === 0 && base.conversoes >= 3 && s7.custo >= Math.max(50, (cpaBase || 0) * 2))
          add("critico", c, plat, "Gastando sem converter", `${brl.format(s7.custo)} nos últimos 7 dias e nenhuma conversão. Média antes: ${brl.format(cpaBase)} por conversão.`);
        else if (cpa7 != null && metaCpl && cpa7 > metaCpl * 1.2)
          add("atencao", c, plat, `Custo por conversão acima da meta: ${brl.format(cpa7)}`, `Meta de ${brl.format(metaCpl)} · ${dec.format(s7.conversoes)} conversões em 7 dias.`);
        else if (cpa7 != null && !metaCpl && cpaBase && base.conversoes >= 5 && s7.conversoes >= 2 && cpa7 > cpaBase * 1.4)
          add("atencao", c, plat, `Custo por conversão fora do padrão: ${brl.format(cpa7)}`,
            `${pct0.format(cpa7 / cpaBase - 1)} acima da média das 4 semanas anteriores (${brl.format(cpaBase)}).`);

        // coleta com erro
        const ult = (logs || []).find((l) => l.cliente_id === c.id && l.plataforma === plat);
        if (ult && ult.status === "erro") add("atencao", c, plat, "Erro ao puxar os dados", ult.mensagem || "Verifique o acesso à conta.");
      }
      // orçamento
      const j = janelaOrc(c.orc_periodo);
      for (const l of linhasOrc(c, plataformasDo(c))) {
        const r = calcOrc(l, c, linhas, j), per = c.orc_periodo === "semanal" ? "da semana" : "do mês";
        if (r.status === "estourou") add("critico", c, r.plat, `Orçamento ${per} estourado`, `Gastou ${brl.format(r.gasto)} de ${brl.format(r.valor)}.`);
        else if (r.status === "acima") add("atencao", c, r.plat, `Vai passar do orçamento ${per}`, `Projeção de ${brl.format(r.projecao)} para ${brl.format(r.valor)} · já gastou ${pct0.format(r.pct)}.`);
        else if (r.status === "abaixo") add("atencao", c, r.plat, `Gastando abaixo do orçamento ${per}`, `Projeção de ${brl.format(r.projecao)} para ${brl.format(r.valor)}.`);
      }
    }
    return out.sort((a, b) => (a.nivel === b.nivel ? a.c.nome.localeCompare(b.c.nome, "pt-BR") : a.nivel === "critico" ? -1 : 1));
  }
  function desenharAlertas(alertas) {
    const box = $("#visao-alertas");
    if (!alertas.length) {
      box.replaceChildren(el("div", { class: "card alerta-ok" }, el("b", {}, "✓ Nenhum alerta agora"),
        el("p", { class: "muted" }, "Saldos, contas, veiculação e custo por conversão dentro do esperado. Confira a aba Clientes para os números.")));
      return;
    }
    const grupo = (nivel, titulo) => {
      const itens = alertas.filter((a) => a.nivel === nivel);
      if (!itens.length) return null;
      return el("section", { class: "alertas-grupo" },
        el("h2", { class: "alertas-titulo " + nivel }, `${titulo} · ${itens.length}`),
        el("div", { class: "alertas-lista" }, itens.map((a) => el("button", { class: "alerta " + a.nivel,
          onclick: () => irPara("dash", { clienteId: a.c.id, plataforma: a.plat || "" }) },
          el("span", { class: "alerta-icone", "aria-hidden": "true" }, a.nivel === "critico" ? "!" : "?"),
          el("span", { class: "alerta-texto" },
            el("span", { class: "alerta-cliente" }, a.c.nome, a.plat ? el("span", { class: "tag", cor: PLAT[a.plat].cor }, PLAT[a.plat].curto) : el("span", { class: "tag" }, "Orçamento total")),
            el("b", {}, a.titulo), el("span", { class: "muted" }, a.detalhe)),
          el("span", { class: "seta", "aria-hidden": "true" }, "Ver dash →")))));
    };
    box.replaceChildren(...[grupo("critico", "Resolver agora"), grupo("atencao", "Ficar de olho")].filter(Boolean));
  }
  $("#visao-abas").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-aba]"); if (!b) return;
    irPara("visao", { visaoAba: b.dataset.aba });
  });

  function sparkline(serie) {
    const W = 84, H = 30, max = Math.max(...serie, 1);
    const x = (i) => (serie.length === 1 ? W / 2 : (i * (W - 4)) / (serie.length - 1) + 2);
    const y = (v) => H - 3 - (v / max) * (H - 6);
    const svg = svgEl("svg", { class: "spark", viewBox: `0 0 ${W} ${H}`, "aria-hidden": "true" });
    svg.append(svgEl("polyline", { points: serie.map((v, i) => `${x(i)},${y(v)}`).join(" "), fill: "none", stroke: "#5B2A86", "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }));
    return svg;
  }

  // ---------- dashboard do cliente ----------
  async function renderDash() {
    const secao = $('[data-pagina="dash"]');
    const lista = estado.clientes;
    if (!lista.length) { $("#dash-titulo").textContent = "Nenhum cliente cadastrado"; return; }
    let c = lista.find((x) => x.id === estado.clienteId);
    if (!c) { c = clientesAtivos()[0] || lista[0]; estado.clienteId = c.id; history.replaceState(null, "", `#/dash/${c.id}${location.hash.includes("?") ? "?" + location.hash.split("?")[1] : ""}`); }
    const plats = plataformasDo(c);
    if (estado.plataforma && !plats.includes(estado.plataforma)) estado.plataforma = "";

    $("#dash-titulo").textContent = c.nome;
    $("#dash-plataformas").textContent = plats.map((p) => PLAT[p].nome).join(" · ") || "Sem contas vinculadas";
    $$("#f-plataforma button").forEach((b) => {
      const v = b.dataset.v;
      b.hidden = v !== "" && !plats.includes(v);
      if (plats.length < 2 && v === "") b.hidden = true;
      const on = estado.plataforma === v || (plats.length === 1 && v === plats[0] && !estado.plataforma);
      b.classList.toggle("ativo", on); b.setAttribute("aria-checked", String(on));
    });
    $("#f-plataforma").hidden = plats.length === 0;

    const r = intervalo(estado.periodo);
    subtitulo(secao, r);
    const todas = await metricas(r);
    gastoPorCliente = {};
    for (const l of todas) if (l.data >= r.ini) gastoPorCliente[l.cliente_id] = (gastoPorCliente[l.cliente_id] || 0) + +l.custo;
    if (!$("#seletor-pop").hidden) desenharLista();
    const linhas = todas.filter((l) => l.cliente_id === c.id && (!estado.plataforma || l.plataforma === estado.plataforma));
    const atual = linhas.filter((l) => l.data >= r.ini), ant = linhas.filter((l) => l.data <= r.antFim);
    const a = totais(atual), b = totais(ant);
    const cpa = div(a.custo, a.conversoes);

    $("#dash-kpis").replaceChildren(
      kpi("Investimento", brl.format(a.custo), variacao(a.custo, b.custo, false, true), true),
      kpi("Conversões", dec.format(a.conversoes), variacao(a.conversoes, b.conversoes)),
      kpi("Custo por conversão", ou(cpa, brl), statusCpa(cpa, c.meta_cpl ? +c.meta_cpl : null, div(b.custo, b.conversoes))),
      await cardSaldo(c, estado.plataforma ? [estado.plataforma] : plats),
    );
    $("#dash-kpis2").replaceChildren(
      kpi("Cliques", int.format(a.cliques), variacao(a.cliques, b.cliques)),
      kpi("CTR", ou(div(a.cliques, a.impressoes), pct), variacao(div(a.cliques, a.impressoes), div(b.cliques, b.impressoes))),
      kpi("CPC médio", ou(div(a.custo, a.cliques), brl), variacao(div(a.custo, a.cliques), div(b.custo, b.cliques), true)),
      kpi("Impressões", int.format(a.impressoes), variacao(a.impressoes, b.impressoes)),
    );

    $("#var-sub").textContent = `vs. ${r.antIni === r.antFim ? fmtData(r.antIni) : `${fmtData(r.antIni)} a ${fmtData(r.antFim)}`}`;
    await renderOrcamento(c, plats);
    if (calCliente !== c.id) { calCliente = c.id; estado.calMes = ""; estado.filtroCamp = null; }
    calCtx = { c, plats: estado.plataforma ? [estado.plataforma] : plats, r };
    mostrarCal();
    if (estado.calAberto) await renderCalendario();
    renderVariacao(a, b);
    renderGrafico(atual, r, estado.plataforma ? [estado.plataforma] : plats, a.custo);
    renderTabela(atual, ant, estado.plataforma ? [estado.plataforma] : plats);
    relCtx = { c, r, plats: estado.plataforma ? [estado.plataforma] : plats, atual, ant };
    if (Object.values(estado.campAba).includes("anuncios")) { await carregarAnuncios(c, r); desenharTabela(); }
  }
  // ---------- calendário do cliente (resumo por dia) ----------
  let calCtx = null, calCliente = "";
  async function renderCalendario() {
    if (!calCtx) return;
    const { c, plats, r } = calCtx;
    const h = hoje();
    const mes = estado.calMes || r.fim.slice(0, 7);
    const [ano, m] = mes.split("-").map(Number);
    const ini = mes + "-01";
    const ultimo = new Date(Date.UTC(ano, m, 0, 12)).toISOString().slice(0, 10);
    $("#dc-mes").textContent = `${MESES[m - 1]} ${ano}`;
    $("#dc-prox").disabled = mes >= h.slice(0, 7);
    const linhas = ini > h ? [] : (await metricas({ antIni: ini, fim: ultimo < h ? ultimo : h }))
      .filter((l) => l.cliente_id === c.id && plats.includes(l.plataforma) && l.data >= ini && l.data <= ultimo);
    const porDia = {};
    for (const l of linhas) {
      const d = (porDia[l.data] ||= { custo: 0, conversoes: 0, cliques: 0 });
      d.custo += +l.custo; d.conversoes += +l.conversoes; d.cliques += +l.cliques;
    }
    const tot = totais(linhas);
    $("#dc-resumo").textContent = tot.custo > 0
      ? `${brl.format(tot.custo)} · ${dec.format(tot.conversoes)} conv. · ${ou(div(tot.custo, tot.conversoes), brl)} por conv.` : "Sem investimento neste mês";
    const max = Math.max(1, ...Object.values(porDia).map((d) => d.custo));
    const primeiro = new Date(Date.UTC(ano, m - 1, 1, 12));
    const inicio = somaDias(ini, -primeiro.getUTCDay());
    let dias = Array.from({ length: 42 }, (_, i) => somaDias(inicio, i));
    if (dias.slice(35).every((d) => !d.startsWith(mes))) dias = dias.slice(0, 35);
    $("#dash-cal").replaceChildren(...DOW.map((d) => el("div", { class: "dow" }, d)), ...dias.map((d) => {
      const dentro = d.startsWith(mes), futuro = d > h, v = porDia[d];
      const noPer = d >= r.ini && d <= r.fim;
      const cls = ["dia", "dc", dentro ? "" : "fora", d === h ? "hoje" : "", noPer && dentro ? "no-periodo" : "", futuro ? "futuro" : ""].filter(Boolean).join(" ");
      const cpa = v ? div(v.custo, v.conversoes) : null;
      const rot = `${Number(d.slice(8))} de ${MESES[Number(d.slice(5, 7)) - 1]}` + (v ? `: ${brl.format(v.custo)}, ${dec.format(v.conversoes)} conversões` : "");
      const cel = el("button", { class: cls, disabled: futuro || !dentro, "aria-label": rot, title: futuro || !dentro ? null : rot + (cpa != null ? `, ${brl.format(cpa)} por conversão` : "") + " · clique para ver o dia",
        onclick: () => irPara("dash", { periodo: `${d}_${d}` }) },
        el("span", { class: "n" }, el("span", {}, Number(d.slice(8)))),
        dentro && !futuro ? (v && v.custo > 0
          ? [el("span", { class: "dc-inv" }, brl0.format(v.custo), el("span", { class: "dc-rot" }, " gastos")),
            el("span", { class: "dc-conv" }, dec.format(v.conversoes), el("span", { class: "dc-rot" }, v.conversoes === 1 ? " conversão" : " conversões")),
            el("span", { class: "dc-cpa" }, cpa != null ? [brl.format(cpa), el("span", { class: "dc-rot" }, " custo/conversão")] : "sem conversão")]
          : el("span", { class: "dc-vazio" }, "—")) : null);
      if (v && dentro) cel.style.setProperty("--i", String(Math.round((v.custo / max) * 100) / 100));
      return cel;
    }));
  }
  function mudarMesCal(passo) {
    const base = estado.calMes || (calCtx ? calCtx.r.fim.slice(0, 7) : hoje().slice(0, 7));
    const [a, m] = base.split("-").map(Number);
    const novo = new Date(Date.UTC(a, m - 1 + passo, 1)).toISOString().slice(0, 7);
    if (novo > hoje().slice(0, 7)) return;
    estado.calMes = novo;
    renderCalendario().catch((e) => { console.error(e); aviso("Não foi possível carregar o calendário."); });
  }
  // o calendário só aparece quando a pessoa clica no botão
  function mostrarCal() {
    $("#card-cal").hidden = !estado.calAberto;
    $("#btn-cal").setAttribute("aria-expanded", String(!!estado.calAberto));
    $("#btn-cal").textContent = estado.calAberto ? "📆 Fechar calendário" : "📆 Calendário";
  }
  $("#btn-cal").addEventListener("click", () => {
    estado.calAberto = !estado.calAberto;
    mostrarCal();
    if (estado.calAberto) renderCalendario().catch((e) => { console.error(e); aviso("Não foi possível carregar o calendário."); });
  });
  $("#dc-ant").addEventListener("click", () => mudarMesCal(-1));
  $("#dc-prox").addEventListener("click", () => mudarMesCal(1));

  // gasto médio por dia nos últimos 7 dias completos (para estimar quantos dias o saldo dura)
  async function gastoMedioDia(clienteId, plat) {
    const h = hoje(), r = { antIni: somaDias(h, -34), fim: h };
    const ls = (await metricas(r)).filter((l) => l.cliente_id === clienteId && l.plataforma === plat && l.data >= somaDias(h, -7) && l.data < h);
    return ls.reduce((t, l) => t + +l.custo, 0) / 7;
  }
  async function cardSaldo(c, plats) {
    const cs = (await contas()).filter((k) => k.cliente_id === c.id);
    const sg = (await saldosGoogle())[c.id];
    const linhas = [];
    let ruim = false;
    if (!plats.length) return kpi("Saldo da conta", "—", { txt: "Sem contas vinculadas", cls: "" });
    const dura = (saldo, dia) => (saldo < 1 ? "✕ acabou" : dia > 0 ? (saldo / dia < 1 ? "⚠ acaba hoje" : `~${int.format(Math.floor(saldo / dia))} dia${Math.floor(saldo / dia) === 1 ? "" : "s"}`) : "");
    if (plats.includes("meta")) {
      const meta = cs.find((k) => k.plataforma === "meta");
      if (!meta) linhas.push(["meta", "—", "aguardando coleta"]);
      else if (!meta.status_ok) { linhas.push(["meta", meta.status, "⚠ conta com restrição"]); ruim = true; }
      else if (meta.pre_pago && meta.saldo != null) {
        const saldo = +meta.saldo, dia = await gastoMedioDia(c.id, "meta"), d = dura(saldo, dia);
        linhas.push(["meta", brl.format(saldo), d]); if (saldo < 1 || (dia > 0 && saldo / dia < 3)) ruim = true;
      } else if (meta.limite_gasto) {
        const resta = Math.max(0, +meta.limite_gasto - +meta.gasto_total);
        linhas.push(["meta", brl.format(resta), resta <= 0 ? "✕ limite atingido" : "restante do limite"]); if (resta <= 0) ruim = true;
      } else linhas.push(["meta", "Pós-pago", "cobrança no cartão"]);
    }
    if (plats.includes("google")) {
      const google = cs.find((k) => k.plataforma === "google");
      if (google && !google.status_ok) { linhas.push(["google", google.status, "⚠ verifique a conta"]); ruim = true; }
      else if (sg) {
        const saldo = +sg.saldo, dia = await gastoMedioDia(c.id, "google"), d = dura(saldo, dia);
        linhas.push(["google", brl.format(Math.max(0, saldo)), d]); if (saldo < 1 || (dia > 0 && saldo / dia < 3)) ruim = true;
      } else linhas.push(["google", "—", ehAdmin() ? "cadastre a recarga" : "sem recarga cadastrada"]);
    }
    const btn = plats.includes("google") && ehAdmin()
      ? el("button", { type: "button", class: "btn-recarga", onclick: (e) => abrirRecarga(e.currentTarget, c) }, "+ recarga Google") : null;
    if (linhas.length === 1) {
      const [, v, sub] = linhas[0];
      const card = kpi(`Saldo ${PLAT[linhas[0][0]].curto}`, v, { txt: sub, cls: ruim ? "ruim" : "" });
      if (btn) card.append(btn);
      return card;
    }
    return el("div", { class: "kpi saldo-duplo" }, el("div", { class: "rotulo" }, "Saldo das contas"),
      linhas.map(([p, v, sub]) => el("div", { class: "saldo-linha" }, el("span", { class: "tag", cor: PLAT[p].cor }, PLAT[p].curto),
        el("b", {}, v), el("span", { class: "sub" + (/[✕⚠]/.test(sub) ? " ruim" : "") }, sub))), btn);
  }
  // recargas do Google (só admin cadastra; o banco confere de novo)
  let popRec = null;
  function fecharRecarga() { if (popRec) { popRec.remove(); popRec = null; } }
  async function abrirRecarga(btn, c) {
    if (popRec) { fecharRecarga(); return; }
    const h = hoje();
    const valor = el("input", { type: "number", min: "0.01", max: "1000000", step: "0.01", required: true, placeholder: "500,00", "aria-label": "Valor da recarga" });
    const data = el("input", { type: "date", max: h, min: "2024-01-01", value: h, required: true, "aria-label": "Data da recarga" });
    const erro = el("p", { class: "erro", role: "alert" });
    const lista = el("div", { class: "rec-lista" }, el("p", { class: "muted" }, "Carregando…"));
    popRec = el("form", { class: "pop-periodo", role: "dialog", "aria-label": "Recarga do Google", onsubmit: async (e) => {
      e.preventDefault();
      const v = Math.round(Number(valor.value) * 100) / 100;
      if (!(v > 0 && v <= 1000000)) { erro.textContent = "Informe um valor entre R$ 0,01 e R$ 1.000.000."; return; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data.value) || data.value > h) { erro.textContent = "Escolha uma data até hoje."; return; }
      const b = e.submitter; b.disabled = true;
      const { error } = await sb.from("painel_recargas").insert({ cliente_id: c.id, valor: v, data: data.value });
      b.disabled = false;
      if (error) { console.error(error); erro.textContent = "Não foi possível salvar a recarga."; return; }
      fecharRecarga(); saldoGCache = null; render();
    } },
      el("b", {}, "Recarga do Google · " + c.nome),
      el("p", { class: "muted" }, "Coloque o valor que entrou na conta. O painel desconta o gasto do Google a partir da data da primeira recarga."),
      el("div", { class: "pop-datas" }, el("label", {}, "Valor (R$)", valor), el("label", {}, "Data", data)),
      erro,
      el("div", { class: "linha-botoes" }, el("button", { type: "submit", class: "btn primario" }, "Salvar recarga"),
        el("button", { type: "button", class: "btn", onclick: fecharRecarga }, "Fechar")),
      lista);
    document.body.append(popRec);
    const rb = btn.getBoundingClientRect();
    popRec.style.top = (rb.bottom + window.scrollY + 8) + "px";
    popRec.style.left = Math.max(8, Math.min(rb.right + window.scrollX - popRec.offsetWidth, window.innerWidth - popRec.offsetWidth - 8)) + "px";
    valor.focus();
    const { data: recs, error } = await sb.from("painel_recargas").select("id,valor,data").eq("cliente_id", c.id).order("data", { ascending: false }).limit(8);
    if (error) { lista.replaceChildren(el("p", { class: "muted" }, "Não foi possível carregar as recargas.")); return; }
    lista.replaceChildren(el("p", { class: "rec-tit" }, recs.length ? "Últimas recargas" : "Nenhuma recarga cadastrada ainda."),
      ...recs.map((r) => el("div", { class: "rec-item" }, el("span", {}, r.data.split("-").reverse().join("/")), el("b", {}, brl.format(r.valor)),
        el("button", { type: "button", class: "btn link perigo", onclick: async () => {
          if (!confirm(`Apagar a recarga de ${brl.format(r.valor)}?`)) return;
          const { error: e2 } = await sb.from("painel_recargas").delete().eq("id", r.id);
          if (e2) { erro.textContent = "Não foi possível apagar."; return; }
          fecharRecarga(); saldoGCache = null; render();
        } }, "Apagar"))));
  }
  document.addEventListener("click", (e) => { if (popRec && !popRec.contains(e.target) && !e.target.closest(".btn-recarga")) fecharRecarga(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") fecharRecarga(); });
  window.addEventListener("hashchange", fecharRecarga);

  // ---------- relatório em imagem (para mandar no WhatsApp) ----------
  let relCtx = null;
  const ROXO = "#5B2A86", LILAS = "#D9C8F5", AMBAR = "#F5B83D", GRAFITE = "#1E1B2E", OFF = "#F8F6FC", CINZA = "#6E6884", VERDE = "#1F7A4D", VERMELHO = "#B42318";
  function caixa(ctx, x, y, w, h, r, cor, borda) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    if (cor) { ctx.fillStyle = cor; ctx.fill(); }
    if (borda) { ctx.strokeStyle = borda; ctx.lineWidth = 2; ctx.stroke(); }
  }
  function texto(ctx, t, x, y, { size = 28, peso = 500, cor = GRAFITE, fonte = "Poppins", alinhar = "left", max } = {}) {
    ctx.font = `${peso} ${size}px ${fonte}, system-ui, sans-serif`; ctx.fillStyle = cor; ctx.textAlign = alinhar; ctx.textBaseline = "alphabetic";
    let s2 = String(t);
    if (max) while (ctx.measureText(s2).width > max && s2.length > 3) s2 = s2.slice(0, -2) + "…";
    ctx.fillText(s2, x, y);
  }
  function metricasRel(ls) {
    const t = totais(ls);
    return { ...t, cpa: div(t.custo, t.conversoes), ctr: div(t.cliques, t.impressoes), cpc: div(t.custo, t.cliques) };
  }
  async function gerarRelatorio() {
    if (!relCtx) return;
    const { c, r, plats, atual, ant } = relCtx;
    await document.fonts.load("700 40px Poppins").catch(() => {});
    await document.fonts.load("500 24px Poppins").catch(() => {});
    const blocos = plats.map((p) => ({ p, a: metricasRel(atual.filter((l) => l.plataforma === p)), b: metricasRel(ant.filter((l) => l.plataforma === p)) }))
      .filter((x) => x.a.custo > 0 || x.a.impressoes > 0);
    if (!blocos.length) { aviso("Sem dados no período escolhido para montar o relatório."); return; }
    const W = 1080, PAD = 60, ALT_BLOCO = 470, TOPO = 300, RODAPE = 130;
    const totalBloco = blocos.length > 1 ? 230 : 0;
    const H = TOPO + blocos.length * ALT_BLOCO + totalBloco + RODAPE;
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d");
    ctx.fillStyle = OFF; ctx.fillRect(0, 0, W, H);
    // topo
    ctx.fillStyle = ROXO; ctx.fillRect(0, 0, W, 250);
    ctx.beginPath(); ctx.arc(PAD + 44, 84, 40, 0, Math.PI * 2); ctx.strokeStyle = LILAS; ctx.lineWidth = 6; ctx.stroke();
    ctx.beginPath(); ctx.arc(PAD + 44, 84, 40, -Math.PI / 2, -Math.PI / 2 + 1.7); ctx.strokeStyle = AMBAR; ctx.stroke();
    texto(ctx, "AM", PAD + 44, 97, { size: 32, peso: 700, cor: OFF, alinhar: "center" });
    texto(ctx, "Ana Menires", PAD + 104, 78, { size: 26, peso: 600, cor: OFF });
    texto(ctx, "Tráfego · Sites · Sistemas", PAD + 104, 108, { size: 18, peso: 500, cor: LILAS, fonte: "Inter" });
    texto(ctx, "RELATÓRIO DE RESULTADOS", W - PAD, 92, { size: 18, peso: 600, cor: LILAS, alinhar: "right", fonte: "Inter" });
    texto(ctx, c.nome, PAD, 190, { size: 46, peso: 700, cor: OFF, max: W - 2 * PAD });
    const periodo = r.ini === r.fim ? fmtData(r.ini) : `${fmtData(r.ini)} a ${fmtData(r.fim)}`;
    texto(ctx, `Período: ${periodo}/${r.fim.slice(0, 4)}  ·  comparado a ${r.antIni === r.antFim ? fmtData(r.antIni) : `${fmtData(r.antIni)} a ${fmtData(r.antFim)}`}`,
      PAD, 230, { size: 20, peso: 500, cor: LILAS, fonte: "Inter" });

    const corVar = (v) => (v.cls === "boa" ? VERDE : v.cls === "ruim" ? VERMELHO : CINZA);
    const cartao = (x, y, w, h, rotulo, valor, v, grande) => {
      caixa(ctx, x, y, w, h, 18, "#FFFFFF", "#E4DAF5");
      texto(ctx, rotulo, x + 22, y + 38, { size: 18, peso: 500, cor: CINZA, fonte: "Inter", max: w - 44 });
      texto(ctx, valor, x + 22, y + (grande ? 98 : 84), { size: grande ? 44 : 32, peso: 700, cor: GRAFITE, max: w - 44 });
      if (v) texto(ctx, grande ? v.txt.replace("vs. anterior", "vs. período anterior") : v.txt, x + 22, y + h - 22, { size: 16, peso: 500, cor: corVar(v), fonte: "Inter", max: w - 44 });
    };
    let y = TOPO;
    for (const { p, a, b } of blocos) {
      const meta = p === "meta";
      ctx.fillStyle = PLAT[p].cor.includes("meta") ? AMBAR : ROXO;
      caixa(ctx, PAD, y, 14, 40, 6, meta ? AMBAR : ROXO);
      texto(ctx, PLAT[p].nome, PAD + 30, y + 32, { size: 30, peso: 700, cor: GRAFITE });
      if (meta) texto(ctx, `investimento com +${pct0.format(IMPOSTO_META)} de impostos`, W - PAD, y + 30, { size: 16, peso: 500, cor: CINZA, alinhar: "right", fonte: "Inter" });
      const y1 = y + 64, gw = (W - 2 * PAD - 2 * 20) / 3;
      cartao(PAD, y1, gw, 170, "Investimento", brl.format(a.custo), variacao(a.custo, b.custo, false, true), true);
      cartao(PAD + gw + 20, y1, gw, 170, "Conversões", dec.format(a.conversoes), variacao(a.conversoes, b.conversoes), true);
      cartao(PAD + 2 * (gw + 20), y1, gw, 170, "Custo por conversão", ou(a.cpa, brl), variacao(a.cpa, b.cpa, true), true);
      const y2 = y1 + 190, sw = (W - 2 * PAD - 3 * 16) / 4;
      cartao(PAD, y2, sw, 150, "Cliques", int.format(a.cliques), variacao(a.cliques, b.cliques));
      cartao(PAD + (sw + 16), y2, sw, 150, "CTR", ou(a.ctr, pct), variacao(a.ctr, b.ctr));
      cartao(PAD + 2 * (sw + 16), y2, sw, 150, "Custo por clique", ou(a.cpc, brl), variacao(a.cpc, b.cpc, true));
      cartao(PAD + 3 * (sw + 16), y2, sw, 150, "Impressões", int.format(a.impressoes), variacao(a.impressoes, b.impressoes));
      y += ALT_BLOCO;
    }
    if (blocos.length > 1) {
      const a = metricasRel(atual), b = metricasRel(ant);
      caixa(ctx, PAD, y, W - 2 * PAD, 200, 22, GRAFITE);
      texto(ctx, "TOTAL DAS PLATAFORMAS", PAD + 30, y + 46, { size: 18, peso: 600, cor: LILAS, fonte: "Inter" });
      const cw = (W - 2 * PAD - 60) / 3;
      [["Investimento", brl.format(a.custo), variacao(a.custo, b.custo, false, true)], ["Conversões", dec.format(a.conversoes), variacao(a.conversoes, b.conversoes)],
        ["Custo por conversão", ou(a.cpa, brl), variacao(a.cpa, b.cpa, true)]].forEach(([rot, val, v], i) => {
        const x = PAD + 30 + i * cw;
        texto(ctx, rot, x, y + 92, { size: 18, peso: 500, cor: "#CFC8E0", fonte: "Inter" });
        texto(ctx, val, x, y + 142, { size: 38, peso: 700, cor: OFF, max: cw - 20 });
        texto(ctx, v.txt.replace("vs. anterior", "vs. anterior"), x, y + 176, { size: 16, peso: 500, cor: v.cls === "boa" ? "#7FD4A6" : v.cls === "ruim" ? "#FF9C8F" : "#CFC8E0", fonte: "Inter" });
      });
      y += totalBloco;
    }
    // rodapé
    ctx.fillStyle = "#E4DAF5"; ctx.fillRect(PAD, H - RODAPE + 20, W - 2 * PAD, 2);
    texto(ctx, "Ana Menires · Gestão de tráfego pago", PAD, H - 50, { size: 20, peso: 600, cor: ROXO });
    texto(ctx, "Gerado em " + new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date()),
      W - PAD, H - 50, { size: 18, peso: 500, cor: CINZA, alinhar: "right", fonte: "Inter" });

    const blob = await new Promise((ok) => cv.toBlob(ok, "image/png"));
    if (!blob) { aviso("Não foi possível gerar a imagem."); return; }
    const nomeArq = `relatorio-${c.nome.normalize("NFD").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").toLowerCase()}-${r.ini}-a-${r.fim}.png`;
    const arquivo = new File([blob], nomeArq, { type: "image/png" });
    const url = URL.createObjectURL(blob);
    mostrarRelatorio(url, arquivo, textoRelatorio(c, periodo, blocos, atual, ant));
  }
  function textoRelatorio(c, periodo, blocos, atual, ant) {
    const seta = (v) => (v.txt.startsWith("sem") ? "" : ` (${v.txt.replace(" vs. anterior", "")})`);
    const linhas = [`📊 *Resultados – ${c.nome}*`, `Período: ${periodo}`, ""];
    for (const { p, a, b } of blocos) {
      linhas.push(`*${PLAT[p].nome}*`,
        `💰 Investimento: ${brl.format(a.custo)}${seta(variacao(a.custo, b.custo, false, true))}`,
        `✅ Conversões: ${dec.format(a.conversoes)}${seta(variacao(a.conversoes, b.conversoes))}`,
        `🎯 Custo por conversão: ${ou(a.cpa, brl)}${seta(variacao(a.cpa, b.cpa, true))}`,
        `👆 Cliques: ${int.format(a.cliques)} · CTR ${ou(a.ctr, pct)}`, "");
    }
    if (blocos.length > 1) {
      const a = metricasRel(atual);
      linhas.push(`*Total*: ${brl.format(a.custo)} investidos · ${dec.format(a.conversoes)} conversões · ${ou(a.cpa, brl)} por conversão`, "");
    }
    return linhas.join("\n").trim();
  }
  function mostrarRelatorio(url, arquivo, txt) {
    const fechar = () => { fundo.remove(); URL.revokeObjectURL(url); document.removeEventListener("keydown", esc); };
    const esc = (e) => { if (e.key === "Escape") fechar(); };
    const podeCompartilhar = !!(navigator.canShare && navigator.canShare({ files: [arquivo] }));
    const msg = el("span", { class: "muted", role: "status" });
    const fundo = el("div", { class: "modal-fundo", onclick: (e) => { if (e.target === fundo) fechar(); } },
      el("div", { class: "modal", role: "dialog", "aria-modal": "true", "aria-label": "Relatório gerado" },
        el("div", { class: "card-topo" }, el("h2", {}, "Relatório pronto"), el("button", { type: "button", class: "btn sm", onclick: fechar }, "Fechar")),
        el("div", { class: "modal-img" }, el("img", { src: url, alt: "Prévia do relatório" })),
        el("div", { class: "linha-botoes modal-botoes" },
          podeCompartilhar ? el("button", { type: "button", class: "btn primario", onclick: async () => {
            try { await navigator.share({ files: [arquivo], text: txt }); } catch (e) { if (e.name !== "AbortError") msg.textContent = "Não deu para compartilhar. Use Baixar imagem."; }
          } }, "Compartilhar (WhatsApp)") : null,
          el("a", { class: "btn" + (podeCompartilhar ? "" : " primario"), href: url, download: arquivo.name }, "Baixar imagem"),
          el("button", { type: "button", class: "btn", onclick: async (e) => {
            try { await navigator.clipboard.writeText(txt); e.target.textContent = "Texto copiado ✓"; } catch { msg.textContent = "Não foi possível copiar."; }
          } }, "Copiar texto para WhatsApp"),
          msg)));
    document.body.append(fundo);
    document.addEventListener("keydown", esc);
  }
  $("#btn-relatorio").addEventListener("click", async (e) => {
    const b = e.currentTarget; b.disabled = true; const t = b.textContent; b.textContent = "Gerando…";
    try { await gerarRelatorio(); } catch (x) { console.error(x); aviso("Não foi possível gerar o relatório."); }
    finally { b.disabled = false; b.textContent = t; }
  });

  // ---------- seletor de cliente (lista suspensa com busca) ----------
  let gastoPorCliente = {}, idxNav = -1, itensLista = [];
  const pop = $("#seletor-pop"), btnSel = $("#seletor-btn"), busca = $("#seletor-busca");
  function abrirLista() {
    pop.hidden = false; btnSel.setAttribute("aria-expanded", "true");
    busca.value = ""; desenharLista(); busca.focus();
  }
  function fecharLista(devolverFoco) {
    if (pop.hidden) return;
    pop.hidden = true; btnSel.setAttribute("aria-expanded", "false");
    if (devolverFoco) btnSel.focus();
  }
  function desenharLista() {
    const termo = busca.value.trim().toLocaleLowerCase("pt-BR").normalize("NFD").replace(/\p{Diacritic}/gu, "");
    const norm = (s) => s.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/\p{Diacritic}/gu, "");
    itensLista = estado.clientes
      .filter((x) => !termo || norm(x.nome).includes(termo))
      .sort((a, b) => (b.ativo - a.ativo) || a.nome.localeCompare(b.nome, "pt-BR"));
    const atualIdx = itensLista.findIndex((x) => x.id === estado.clienteId);
    idxNav = termo ? (itensLista.length ? 0 : -1) : atualIdx;
    $("#seletor-cab-valor").textContent = `Investimento · ${nomePeriodoAtual().toLowerCase()}`;
    const ul = $("#seletor-lista");
    if (!itensLista.length) { ul.replaceChildren(el("li", { class: "vazio" }, "Nenhum cliente encontrado.")); return; }
    ul.replaceChildren(...itensLista.map((x, i) => el("li", {
      role: "option", id: "opt-" + x.id, "aria-selected": String(x.id === estado.clienteId),
      class: [x.ativo ? "" : "inativo", i === idxNav ? "ativo-nav" : ""].join(" ").trim() || null,
      onclick: () => escolher(x),
      onmousemove: () => marcar(i),
    },
      el("span", { class: "pontos", "aria-hidden": "true" }, plataformasDo(x).map((p) => el("i", { cor: PLAT[p].cor }))),
      el("span", { class: "n" }, x.nome + (x.ativo ? "" : " (inativo)")),
      el("span", { class: "v" }, gastoPorCliente[x.id] ? brl0.format(gastoPorCliente[x.id]) : "—"))));
    marcar(idxNav, true);
  }
  function marcar(i, rolar) {
    idxNav = i;
    $$("#seletor-lista li").forEach((li, j) => li.classList.toggle("ativo-nav", j === i));
    const li = $$("#seletor-lista li")[i];
    if (li) { busca.setAttribute("aria-activedescendant", li.id); if (rolar) li.scrollIntoView({ block: "nearest" }); }
  }
  function escolher(x) { fecharLista(true); irPara("dash", { clienteId: x.id }); }
  btnSel.addEventListener("click", () => (pop.hidden ? abrirLista() : fecharLista(true)));
  busca.addEventListener("input", desenharLista);
  busca.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); marcar(Math.min(itensLista.length - 1, idxNav + 1), true); }
    else if (e.key === "ArrowUp") { e.preventDefault(); marcar(Math.max(0, idxNav - 1), true); }
    else if (e.key === "Enter") { e.preventDefault(); if (itensLista[idxNav]) escolher(itensLista[idxNav]); }
    else if (e.key === "Escape") { e.preventDefault(); fecharLista(true); }
  });
  document.addEventListener("click", (e) => { if (!pop.hidden && !$("#seletor").contains(e.target)) fecharLista(false); });
  function vizinho(passo) {
    const ordem = estado.clientes.filter((x) => x.ativo).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    if (!ordem.length) return;
    const i = ordem.findIndex((x) => x.id === estado.clienteId);
    const prox = ordem[(i + passo + ordem.length) % ordem.length];
    irPara("dash", { clienteId: prox.id });
  }
  $("#cliente-ant").addEventListener("click", () => vizinho(-1));
  $("#cliente-prox").addEventListener("click", () => vizinho(1));

  $("#f-plataforma").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    irPara("dash", { plataforma: b.dataset.v });
  });

  // ---------- gráfico (SVG próprio, 1 eixo) ----------
  function renderGrafico(atual, r, plats, total) {
    const box = $("#grafico");
    const series = plats.map((k) => ({ k, ...PLAT[k] }));
    $("#legenda").replaceChildren(...(series.length > 1 ? series.map((s) => el("span", { cor: s.cor }, s.nome)) : []));
    $("#grafico-titulo").textContent = r.n > 1 && total > 0 ? `Investimento por dia · ${brl.format(total)} no período` : "Investimento por dia";

    if (r.n < 2) { box.replaceChildren(el("div", { class: "vazio-msg" }, "Escolha 7 dias, 30 dias ou este mês para ver a evolução diária.")); return; }
    const dias = Array.from({ length: r.n }, (_, i) => somaDias(r.ini, i));
    const por = {};
    for (const s of series) por[s.k] = Object.fromEntries(dias.map((d) => [d, 0]));
    for (const l of atual) if (por[l.plataforma] && l.data in por[l.plataforma]) por[l.plataforma][l.data] += +l.custo;
    const max = Math.max(0, ...series.flatMap((s) => Object.values(por[s.k])));
    if (max === 0) { box.replaceChildren(el("div", { class: "vazio-msg" }, "Sem investimento no período.")); return; }

    const W = Math.max(box.clientWidth, 320), H = 280, m = { t: 14, r: 64, b: 30, l: 72 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const passoY = passoBonito(max / 4);
    const nTicks = Math.max(2, Math.ceil(max / passoY));
    const topo = passoY * nTicks;
    const x = (i) => m.l + (dias.length === 1 ? iw / 2 : (i * iw) / (dias.length - 1));
    const y = (v) => m.t + ih - (v / topo) * ih;
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Investimento diário por plataforma" });

    for (let i = 0; i <= nTicks; i++) {
      const v = passoY * i, yy = y(v);
      svg.append(svgEl("line", { x1: m.l, x2: W - m.r, y1: yy, y2: yy, stroke: "#EEE8F8", "stroke-width": 1 }));
      const t = svgEl("text", { x: m.l - 10, y: yy + 4, "text-anchor": "end", "font-size": 11, fill: "#6E6884", "font-family": "Inter, sans-serif" });
      t.textContent = brlCurto(v); svg.append(t);
    }
    const cada = Math.ceil(dias.length / Math.max(2, Math.min(8, Math.floor(iw / 64))));
    dias.forEach((d, i) => {
      if (i % cada && i !== dias.length - 1) return;
      const t = svgEl("text", { x: x(i), y: H - 8, "text-anchor": "middle", "font-size": 11, fill: "#6E6884", "font-family": "Inter, sans-serif" });
      t.textContent = fmtData(d); svg.append(t);
    });
    const cores = { google: "#5B2A86", meta: "#F5B83D" };
    for (const s of series) {
      const pts = dias.map((d, i) => `${x(i)},${y(por[s.k][d])}`).join(" ");
      svg.append(svgEl("polyline", { points: pts, fill: "none", stroke: cores[s.k], "stroke-width": 2.5, "stroke-linejoin": "round", "stroke-linecap": "round" }));
      if (series.length > 1) {
        const ult = por[s.k][dias[dias.length - 1]];
        const t = svgEl("text", { x: x(dias.length - 1) + 8, y: y(ult) + 4, "font-size": 11.5, "font-weight": 600, fill: "#4F4A63", "font-family": "Poppins, sans-serif" });
        t.textContent = s.curto; svg.append(t);
      }
    }
    const guia = svgEl("line", { y1: m.t, y2: m.t + ih, stroke: "#6E6884", "stroke-width": 1, "stroke-dasharray": "3 3", visibility: "hidden" });
    svg.append(guia);
    const pontos = series.map((s) => { const c = svgEl("circle", { r: 5, fill: cores[s.k], stroke: "#FFFFFF", "stroke-width": 2, visibility: "hidden" }); svg.append(c); return c; });
    const hit = svgEl("rect", { x: m.l, y: m.t, width: iw, height: ih, fill: "transparent" });
    svg.append(hit);
    const tip = $("#tooltip");
    hit.addEventListener("pointermove", (e) => {
      const rect = svg.getBoundingClientRect();
      const px = ((e.clientX - rect.left) / rect.width) * W;
      const i = Math.max(0, Math.min(dias.length - 1, Math.round(((px - m.l) / iw) * (dias.length - 1))));
      const d = dias[i];
      guia.setAttribute("x1", x(i)); guia.setAttribute("x2", x(i)); guia.setAttribute("visibility", "visible");
      series.forEach((s, j) => { pontos[j].setAttribute("cx", x(i)); pontos[j].setAttribute("cy", y(por[s.k][d])); pontos[j].setAttribute("visibility", "visible"); });
      let tot = 0;
      const linhas = [el("strong", {}, fmtData(d))];
      for (const s of series) { tot += por[s.k][d]; linhas.push(el("div", {}, `${s.nome}: ${brl.format(por[s.k][d])}`)); }
      if (series.length > 1) linhas.push(el("div", {}, `Total: ${brl.format(tot)}`));
      tip.replaceChildren(...linhas); tip.hidden = false;
      tip.style.left = Math.min(e.clientX + 14, window.innerWidth - tip.offsetWidth - 8) + "px";
      tip.style.top = (e.clientY - tip.offsetHeight - 12) + "px";
    });
    hit.addEventListener("pointerleave", () => { tip.hidden = true; guia.setAttribute("visibility", "hidden"); pontos.forEach((p) => p.setAttribute("visibility", "hidden")); });
    box.replaceChildren(svg);
  }
  function passoBonito(v) { const p = Math.pow(10, Math.floor(Math.log10(v))); for (const f of [1, 2, 5, 10]) if (f * p >= v) return f * p; return 10 * p; }
  let resizeT; window.addEventListener("resize", () => { clearTimeout(resizeT); resizeT = setTimeout(() => { if (estado.rota === "dash") render(); }, 300); });

  // ---------- o que subiu e o que desceu ----------
  function renderVariacao(a, b) {
    const met = [
      ["Investimento", a.custo, b.custo, "neutra", brl],
      ["Conversões", a.conversoes, b.conversoes, "maior", dec],
      ["Custo por conversão", div(a.custo, a.conversoes), div(b.custo, b.conversoes), "menor", brl],
      ["Cliques", a.cliques, b.cliques, "maior", int],
      ["CTR", div(a.cliques, a.impressoes), div(b.cliques, b.impressoes), "maior", pct],
      ["CPC médio", div(a.custo, a.cliques), div(b.custo, b.cliques), "menor", brl],
      ["Impressões", a.impressoes, b.impressoes, "maior", int],
    ];
    const box = $("#var-chart");
    box.replaceChildren(...met.map(([nome, at, an, sentido, f]) => {
      const v = at != null && an ? (at - an) / an : null;
      let seta = "", cls = "neutra";
      if (v != null) {
        seta = v > 0.0049 ? "▲" : v < -0.0049 ? "▼" : "■";
        cls = sentido === "neutra" || Math.abs(v) < 0.005 ? "neutra" : (sentido === "menor" ? v < 0 : v > 0) ? "boa" : "ruim";
      }
      return el("div", { class: "var-card " + cls },
        el("div", { class: "var-nome" }, nome),
        el("div", { class: "var-linha1" }, el("span", { class: "var-atual" }, ou(at, f)),
          el("span", { class: "var-pct" }, v == null ? "—" : `${seta} ${pct0.format(Math.abs(v))}`)),
        el("div", { class: "var-antes" }, "antes: " + ou(an, f)));
    }));
  }

  // ---------- tabelas de campanhas (uma por plataforma) ----------
  let ultimasCamp = [];
  function agrega(linhas) {
    const mapa = new Map();
    for (const l of linhas) {
      const k = l.plataforma + "|" + l.campanha_id;
      const c = mapa.get(k) || { k, campanha_nome: l.campanha_nome || l.campanha_id, plataforma: l.plataforma, custo: 0, impressoes: 0, cliques: 0, conversoes: 0, resultados: 0, tipos: {} };
      c.custo += +l.custo; c.impressoes += +l.impressoes; c.cliques += +l.cliques; c.conversoes += +l.conversoes; c.resultados += +(l.resultados || 0);
      if (l.resultado_tipo) c.tipos[l.resultado_tipo] = (c.tipos[l.resultado_tipo] || 0) + +(l.resultados || 0);
      if (l.campanha_nome) c.campanha_nome = l.campanha_nome;
      mapa.set(k, c);
    }
    return mapa;
  }
  function renderTabela(atual, ant, plats) {
    const antMap = agrega(ant);
    ultimasCamp = [...agrega(atual).values()].filter((c) => c.impressoes > 0 || c.custo > 0).map((c) => {
      const p = antMap.get(c.k);
      const tipo = Object.entries(c.tipos).sort((x, y) => y[1] - x[1])[0]?.[0] || "";
      return { ...c, tipo, ctr: div(c.cliques, c.impressoes), cpc: div(c.custo, c.cliques), cpa: div(c.custo, c.conversoes),
        cpr: div(c.custo, c.resultados), cpm: c.impressoes ? (c.custo / c.impressoes) * 1000 : null,
        dCusto: p && p.custo ? (c.custo - p.custo) / p.custo : null, dConv: p && p.conversoes ? (c.conversoes - p.conversoes) / p.conversoes : null,
        dRes: p && p.resultados ? (c.resultados - p.resultados) / p.resultados : null };
    });
    desenharTabela(plats);
  }
  let platsTabela = [];
  function delta(v, menorMelhor, neutra) {
    if (v == null) return null;
    const seta = v > 0.0049 ? "▲" : v < -0.0049 ? "▼" : "■";
    const cls = neutra || Math.abs(v) < 0.005 ? "" : (menorMelhor ? v < 0 : v > 0) ? "boa" : "ruim";
    return el("div", { class: "delta " + cls }, `${seta} ${pct0.format(Math.abs(v))}`);
  }
  // Google: colunas de conversão. Meta: padrão do Gerenciador de Anúncios (Resultados conforme o objetivo).
  const linkCamp = (c, plat) => el("button", { type: "button", class: "camp-link", title: "Ver os anúncios desta campanha",
    onclick: () => { estado.filtroCamp = { plat, id: c.k.split("|")[1], nome: c.campanha_nome }; trocarAbaCamp(plat, "anuncios"); } }, c.campanha_nome);
  const COLS = {
    google: [["campanha_nome", "Campanha", ""], ["custo", "Investimento", "num"], ["conversoes", "Conversões", "num"], ["cpa", "Custo/conv.", "num"],
      ["cliques", "Cliques", "num"], ["ctr", "CTR", "num sec"], ["cpc", "CPC", "num sec"], ["impressoes", "Impressões", "num sec"]],
    meta: [["campanha_nome", "Campanha", ""], ["resultados", "Resultados", "num"], ["cpr", "Custo por resultado", "num"], ["custo", "Valor usado + imposto", "num"],
      ["impressoes", "Impressões", "num sec"], ["cliques", "Cliques no link", "num sec"], ["ctr", "CTR (link)", "num sec"], ["cpc", "CPC (link)", "num sec"]],
  };
  const TIPO_RES = {
    conversoes: "Conversões", profile_visit_view: "Visitas ao perfil", reach: "Alcance", impressions: "Impressões",
    "actions:onsite_conversion.messaging_conversation_started_7d": "Conversas iniciadas", "actions:lead": "Leads",
    "actions:onsite_conversion.lead_grouped": "Leads no formulário", "actions:offsite_conversion.fb_pixel_lead": "Leads no site",
    "actions:offsite_conversion.fb_pixel_complete_registration": "Cadastros", "actions:complete_registration": "Cadastros",
    "actions:link_click": "Cliques no link", "actions:landing_page_view": "Visualizações da página", "actions:omni_purchase": "Compras",
    "actions:offsite_conversion.fb_pixel_purchase": "Compras", "actions:post_engagement": "Engajamentos", "actions:like": "Curtidas na página",
    "actions:video_thruplay_watched_actions": "ThruPlays", video_thruplay_watched_actions: "ThruPlays",
    "actions:onsite_conversion.post_save": "Salvamentos", "actions:omni_app_install": "Instalações do app",
  };
  const nomeTipo = (t) => TIPO_RES[t] || (t ? t.replace(/^actions:/, "").replace(/^(onsite|offsite)_conversion\.(fb_pixel_)?/, "").replace(/_/g, " ") : "");
  // ---------- anúncios (aba dentro de cada card de campanhas) ----------
  let ultimosAds = [], adsDe = "";
  async function carregarAnuncios(c, r) {
    const chave = c.id + r.antIni + r.fim;
    if (!adsCache.has(chave)) {
      const linhas = [];
      for (let de = 0; ; de += 1000) {
        const { data, error } = await sb.from("painel_anuncios")
          .select("plataforma,data,anuncio_id,anuncio_nome,campanha_id,conjunto_nome,impressoes,cliques,custo,conversoes,resultados,resultado_tipo")
          .eq("cliente_id", c.id).gte("data", r.antIni).lte("data", r.fim).order("id").range(de, de + 999);
        if (error) throw error;
        for (const l of data) if (l.plataforma === "meta") l.custo = +l.custo * (1 + IMPOSTO_META);
        linhas.push(...data);
        if (data.length < 1000) break;
      }
      const { data: info } = await sb.from("painel_anuncios_info").select("plataforma,anuncio_id,thumb_url,status").eq("cliente_id", c.id);
      adsCache.set(chave, { linhas, info: Object.fromEntries((info || []).map((i) => [i.plataforma + "|" + i.anuncio_id, i])) });
    }
    const { linhas, info } = adsCache.get(chave);
    const soma = (ls) => {
      const m = new Map();
      for (const l of ls) {
        const k = l.plataforma + "|" + l.anuncio_id;
        const a = m.get(k) || { k, plataforma: l.plataforma, anuncio_id: l.anuncio_id, nome: l.anuncio_nome, campanha_id: l.campanha_id, conjunto: l.conjunto_nome,
          custo: 0, impressoes: 0, cliques: 0, conversoes: 0, resultados: 0, tipos: {} };
        a.custo += +l.custo; a.impressoes += +l.impressoes; a.cliques += +l.cliques; a.conversoes += +l.conversoes; a.resultados += +l.resultados;
        if (l.resultado_tipo) a.tipos[l.resultado_tipo] = (a.tipos[l.resultado_tipo] || 0) + +l.resultados;
        if (l.anuncio_nome) a.nome = l.anuncio_nome;
        m.set(k, a);
      }
      return m;
    };
    const ant = soma(linhas.filter((l) => l.data <= r.antFim));
    const camps = Object.fromEntries(ultimasCamp.map((x) => [x.plataforma + "|" + x.k.split("|")[1], x.campanha_nome]));
    ultimosAds = [...soma(linhas.filter((l) => l.data >= r.ini)).values()].filter((a) => a.impressoes > 0 || a.custo > 0).map((a) => {
      const p = ant.get(a.k), i = info[a.k] || {};
      const ctr = div(a.cliques, a.impressoes), ctrAnt = p ? div(p.cliques, p.impressoes) : null;
      const cansando = ctr != null && ctrAnt && a.impressoes >= 1000 && p.impressoes >= 1000 && ctr < ctrAnt * 0.75;
      return { ...a, thumb: i.thumb_url || null, status: i.status || null, campanha: camps[a.plataforma + "|" + a.campanha_id] || null,
        tipo: Object.entries(a.tipos).sort((x, y) => y[1] - x[1])[0]?.[0] || "", ctr, cpc: div(a.custo, a.cliques), cpa: div(a.custo, a.conversoes), cpr: div(a.custo, a.resultados),
        dCtr: ctr != null && ctrAnt ? (ctr - ctrAnt) / ctrAnt : null, dCusto: p && p.custo ? (a.custo - p.custo) / p.custo : null,
        dRes: p && p.resultados ? (a.resultados - p.resultados) / p.resultados : null, cansando };
    });
    adsDe = chave;
  }
  const COLS_AD = {
    google: [["nome", "Anúncio", ""], ["custo", "Investimento", "num"], ["conversoes", "Conversões", "num"], ["cpa", "Custo/conv.", "num"],
      ["cliques", "Cliques", "num sec"], ["ctr", "CTR", "num sec"], ["impressoes", "Impressões", "num sec"]],
    meta: [["nome", "Anúncio", ""], ["resultados", "Resultados", "num"], ["cpr", "Custo por resultado", "num"], ["custo", "Valor usado + imposto", "num"],
      ["ctr", "CTR (link)", "num sec"], ["cpc", "CPC (link)", "num sec"], ["impressoes", "Impressões", "num sec"]],
  };
  function celulaAnuncio(a) {
    const thumb = a.thumb ? el("img", { class: "ad-thumb", src: a.thumb, alt: "", loading: "lazy", referrerpolicy: "no-referrer" }) : el("span", { class: "ad-thumb vazio", "aria-hidden": "true" }, a.plataforma === "google" ? "G" : "▦");
    if (a.thumb) thumb.addEventListener("error", () => thumb.replaceWith(el("span", { class: "ad-thumb vazio", "aria-hidden": "true" }, "▦")), { once: true });
    return el("div", { class: "ad-cel" }, thumb, el("div", { class: "ad-txt" },
      el("b", {}, a.nome || "Anúncio " + a.anuncio_id),
      el("span", { class: "muted" }, [a.conjunto, a.campanha].filter(Boolean).join(" · ")),
      el("span", { class: "ad-tags" }, a.status ? el("span", { class: "ad-st" + (a.status === "Ativo" ? " ok" : "") }, a.status) : null,
        a.cansando ? el("span", { class: "ad-cansado", title: "CTR caiu mais de 25% em relação ao período anterior" }, "⚠ Cansando") : null)));
  }
  function tabelaAnuncios(plat) {
    const { k, asc } = estado.ordemAd;
    let rows = ultimosAds.filter((a) => a.plataforma === plat);
    const filtro = estado.filtroCamp && estado.filtroCamp.plat === plat ? estado.filtroCamp : null;
    if (filtro) rows = rows.filter((a) => a.campanha_id === filtro.id);
    rows.sort((a, b) => { const va = a[k], vb = b[k]; if (va == null) return 1; if (vb == null) return -1;
      const r = typeof va === "string" ? va.localeCompare(vb, "pt-BR") : va - vb; return asc ? r : -r; });
    const cols = COLS_AD[plat];
    const cansados = rows.filter((a) => a.cansando).length;
    return [
      el("div", { class: "ad-info" },
        filtro ? el("span", { class: "chip" }, "Campanha: " + filtro.nome, el("button", { type: "button", "aria-label": "Tirar filtro", onclick: () => { estado.filtroCamp = null; desenharTabela(); } }, "✕")) : null,
        el("span", { class: "muted" }, rows.length ? `${rows.length} anúncio${rows.length > 1 ? "s" : ""}` + (cansados ? ` · ${cansados} cansando` : "") : "")),
      el("div", { class: "tabela-wrap" }, el("table", { class: "tabela-camp tabela-ad", "data-tab": "ad" },
        el("thead", {}, el("tr", {}, cols.map(([ck, t, cls]) => el("th", { "data-k": ck,
          class: [cls, ck === k ? "ord" : "", ck === k && asc ? "asc" : ""].filter(Boolean).join(" ") || null,
          "aria-sort": ck === k ? (asc ? "ascending" : "descending") : null }, t)))),
        el("tbody", {}, rows.length ? rows.map((a) => plat === "meta" ? el("tr", {},
          el("td", { class: "nome-camp" }, celulaAnuncio(a)),
          el("td", { class: "num" }, a.resultados ? dec.format(a.resultados) : "—", a.tipo ? el("div", { class: "tipo-res" }, nomeTipo(a.tipo)) : null, delta(a.dRes)),
          el("td", { class: "num" }, ou(a.cpr, brl)),
          el("td", { class: "num" }, brl.format(a.custo), delta(a.dCusto, false, true)),
          el("td", { class: "num sec" }, ou(a.ctr, pct), delta(a.dCtr)),
          el("td", { class: "num sec" }, ou(a.cpc, brl)),
          el("td", { class: "num sec" }, int.format(a.impressoes))) : el("tr", {},
          el("td", { class: "nome-camp" }, celulaAnuncio(a)),
          el("td", { class: "num" }, brl.format(a.custo), delta(a.dCusto, false, true)),
          el("td", { class: "num" }, dec.format(a.conversoes)),
          el("td", { class: "num" }, ou(a.cpa, brl)),
          el("td", { class: "num sec" }, int.format(a.cliques)),
          el("td", { class: "num sec" }, ou(a.ctr, pct), delta(a.dCtr)),
          el("td", { class: "num sec" }, int.format(a.impressoes))))
          : [el("tr", {}, el("td", { colspan: cols.length, class: "muted" }, adsDe ? "Nenhum anúncio com dados neste período. Os anúncios começam a ser coletados a partir de hoje (últimos 60 dias na primeira coleta)." : "Carregando anúncios…"))])))];
  }
  async function trocarAbaCamp(plat, aba) {
    estado.campAba[plat] = aba;
    if (aba === "anuncios" && relCtx) {
      desenharTabela();
      try { await carregarAnuncios(relCtx.c, relCtx.r); } catch (e) { console.error(e); aviso("Não foi possível carregar os anúncios."); }
    }
    desenharTabela();
  }

  function desenharTabela(plats) {
    if (plats) platsTabela = plats;
    const { k, asc } = estado.ordem;
    const ordenar = (lista) => [...lista].sort((a, b) => {
      const va = a[k], vb = b[k];
      if (va == null) return 1; if (vb == null) return -1;
      const r = typeof va === "string" ? va.localeCompare(vb, "pt-BR") : va - vb;
      return asc ? r : -r;
    });
    $("#camp-cards").replaceChildren(...platsTabela.map((plat) => {
      const rows = ordenar(ultimasCamp.filter((c) => c.plataforma === plat));
      const tot = totais(rows);
      const cols = COLS[plat];
      const abaAd = estado.campAba[plat] === "anuncios";
      const abas = el("div", { class: "abas abas-camp", role: "tablist" },
        el("button", { role: "tab", class: abaAd ? null : "ativo", "aria-selected": String(!abaAd), onclick: () => trocarAbaCamp(plat, "campanhas") }, "Campanhas"),
        el("button", { role: "tab", class: abaAd ? "ativo" : null, "aria-selected": String(abaAd), onclick: () => trocarAbaCamp(plat, "anuncios") }, "Anúncios"));
      return el("section", { class: "card", "data-plat": plat },
        el("div", { class: "card-topo" },
          el("h2", {}, el("span", { class: "tag tag-titulo", cor: PLAT[plat].cor }, PLAT[plat].nome), abaAd ? " Anúncios com dados no período" : " Campanhas com dados no período"),
          el("span", { class: "muted" }, abaAd ? "a miniatura vem do Meta · ⚠ Cansando = CTR caiu mais de 25%"
            : rows.length ? `${rows.length} campanha${rows.length > 1 ? "s" : ""} · ${brl.format(tot.custo)}` : "")),
        abas,
        ...(abaAd ? tabelaAnuncios(plat) : [el("div", { class: "tabela-wrap" }, el("table", { class: "tabela-camp" },
          el("thead", {}, el("tr", {}, cols.map(([ck, t, cls]) => el("th", {
            "data-k": ck, class: [cls, ck === k ? "ord" : "", ck === k && asc ? "asc" : ""].filter(Boolean).join(" ") || null,
            "aria-sort": ck === k ? (asc ? "ascending" : "descending") : null,
          }, t)))),
          el("tbody", {}, rows.length ? rows.map((c) => plat === "meta" ? el("tr", {},
            el("td", { class: "nome-camp" }, linkCamp(c, plat)),
            el("td", { class: "num" }, c.resultados ? dec.format(c.resultados) : "—",
              c.tipo ? el("div", { class: "tipo-res" }, nomeTipo(c.tipo)) : null, delta(c.dRes)),
            el("td", { class: "num" }, ou(c.cpr, brl)),
            el("td", { class: "num" }, brl.format(c.custo), delta(c.dCusto, false, true)),
            el("td", { class: "num sec" }, int.format(c.impressoes)),
            el("td", { class: "num sec" }, int.format(c.cliques)),
            el("td", { class: "num sec" }, ou(c.ctr, pct)),
            el("td", { class: "num sec" }, ou(c.cpc, brl))) : el("tr", {},
            el("td", { class: "nome-camp" }, linkCamp(c, plat)),
            el("td", { class: "num" }, brl.format(c.custo), delta(c.dCusto, false, true)),
            el("td", { class: "num" }, dec.format(c.conversoes), delta(c.dConv)),
            el("td", { class: "num" }, ou(c.cpa, brl)),
            el("td", { class: "num" }, int.format(c.cliques)),
            el("td", { class: "num sec" }, ou(c.ctr, pct)),
            el("td", { class: "num sec" }, ou(c.cpc, brl)),
            el("td", { class: "num sec" }, int.format(c.impressoes))))
            : [el("tr", {}, el("td", { colspan: cols.length, class: "muted" }, "Nenhuma campanha com dados neste período."))])))]));
    }));
  }
  $("#camp-cards").addEventListener("click", (e) => {
    const th = e.target.closest("th[data-k]"); if (!th) return;
    const chaveOrd = th.closest("table[data-tab=ad]") ? "ordemAd" : "ordem";
    estado[chaveOrd] = { k: th.dataset.k, asc: estado[chaveOrd].k === th.dataset.k ? !estado[chaveOrd].asc : false };
    desenharTabela();
  });

  // ---------- programação de posts ----------
  const FORMATOS = ["Reels", "Carrossel", "Post", "Stories"];
  const STATUS = [["ideia", "Ideia"], ["roteiro", "Com roteiro"], ["agendado", "Agendado"], ["publicado", "Publicado"]];
  const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const DOW = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const nomeStatus = (k) => (STATUS.find(([s]) => s === k) || STATUS[0])[1];
  const iniciais = (n) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
  let postsCache = null;

  async function carregarPosts() {
    const { data, error } = await sb.from("painel_posts").select("*").order("data", { ascending: true, nullsFirst: false }).order("criado_em");
    if (error) throw error;
    postsCache = data;
  }

  async function renderPosts() {
    const comPosts = estado.clientes.filter((c) => c.tem_posts);
    $("#posts-vazio").hidden = comPosts.length > 0;
    $("#posts-conteudo").hidden = comPosts.length === 0;
    const sel = $("#posts-cliente");
    sel.closest("label").hidden = comPosts.length === 0;
    if (!comPosts.length) return;
    if (estado.postsCliente !== "todos" && !comPosts.some((c) => c.id === estado.postsCliente)) estado.postsCliente = "todos";
    sel.replaceChildren(el("option", { value: "todos" }, `Todos (${comPosts.length})`), ...comPosts.map((c) => el("option", { value: c.id }, c.nome)));
    sel.value = estado.postsCliente;

    if (!postsCache) await carregarPosts();
    const ids = new Set(estado.postsCliente === "todos" ? comPosts.map((c) => c.id) : [estado.postsCliente]);
    const nomes = Object.fromEntries(estado.clientes.map((c) => [c.id, c.nome]));
    const posts = postsCache.filter((p) => ids.has(p.cliente_id));
    const todos = estado.postsCliente === "todos";

    const mes = estado.mes || hoje().slice(0, 7);
    const [ano, m] = mes.split("-").map(Number);
    $("#mes-titulo").textContent = `${MESES[m - 1]} ${ano}`;
    const doMes = posts.filter((p) => p.data && p.data.startsWith(mes));
    $("#posts-resumo").replaceChildren(
      el("span", { class: "pill" }, el("b", {}, doMes.length), `post${doMes.length === 1 ? "" : "s"} em ${MESES[m - 1]}`),
      ...STATUS.map(([k, t]) => el("span", { class: "pill" }, el("b", {}, doMes.filter((p) => p.status === k).length), t.toLowerCase())));
    $("#legenda-fmt").replaceChildren(...FORMATOS.map((f) => el("span", { class: "fmt-" + f }, f)));

    // grade do mês (começa no domingo)
    const primeiro = new Date(Date.UTC(ano, m - 1, 1, 12));
    const inicio = somaDias(primeiro.toISOString().slice(0, 10), -primeiro.getUTCDay());
    let dias = Array.from({ length: 42 }, (_, i) => somaDias(inicio, i));
    if (dias.slice(35).every((d) => !d.startsWith(mes))) dias = dias.slice(0, 35);
    const h = hoje();
    const porDia = {};
    for (const p of posts) if (p.data) (porDia[p.data] ||= []).push(p);
    $("#cal").replaceChildren(...DOW.map((d) => el("div", { class: "dow" }, d)), ...dias.map((d) => {
      const evs = porDia[d] || [];
      const cls = ["dia", d.startsWith(mes) ? "" : "fora", d === h ? "hoje" : "", d === estado.diaSel ? "sel" : ""].filter(Boolean).join(" ");
      return el("button", { class: cls, "aria-label": `${Number(d.slice(8))} de ${MESES[Number(d.slice(5, 7)) - 1]}, ${evs.length} post(s)`,
        onclick: () => { estado.diaSel = d; estado.postEdit = null; estado.importar = null; renderPosts(); } },
        el("span", { class: "n" }, el("span", {}, Number(d.slice(8)))),
        evs.slice(0, 3).map((p) => el("span", { class: `ev fmt-${p.formato}${p.status === "publicado" ? " pub" : ""}`, title: `${p.titulo} · ${p.formato} · ${nomeStatus(p.status)}` },
          todos ? el("span", { class: "cl" }, iniciais(nomes[p.cliente_id] || "")) : null, el("em", {}, p.titulo))),
        evs.length > 3 ? el("span", { class: "mais" }, `+${evs.length - 3}`) : null);
    }));

    // lateral: dia selecionado ou editor
    const painel = $("#painel-dia");
    if (estado.importar && ehAdmin()) painel.replaceChildren(...formImportar(comPosts));
    else if (estado.postEdit) painel.replaceChildren(...formPost(estado.postEdit, comPosts));
    else if (estado.diaSel) {
      const evs = porDia[estado.diaSel] || [];
      const [, mm, dd] = estado.diaSel.split("-");
      painel.replaceChildren(
        el("div", { class: "card-topo" }, el("h2", {}, `${Number(dd)} de ${MESES[Number(mm) - 1]}`),
          ehAdmin() ? el("button", { class: "btn sm primario", onclick: () => novoPost(estado.diaSel) }, "+ Novo post") : null),
        el("div", { class: "lista-posts" }, evs.length ? evs.map((p) => linhaPost(p, todos, nomes)) : el("p", { class: "muted" }, "Nada programado neste dia.")));
    } else {
      painel.replaceChildren(el("div", { class: "card-topo" }, el("h2", {}, "Escolha um dia"),
        ehAdmin() ? el("button", { class: "btn sm primario", onclick: () => novoPost("") }, "+ Novo post") : null),
        el("p", { class: "muted" }, ehAdmin() ? "Clique num dia do calendário para ver e programar posts." : "Clique num dia do calendário para ver os posts."));
    }
    const semData = posts.filter((p) => !p.data && p.status !== "publicado");
    $("#qtd-semdata").textContent = semData.length ? String(semData.length) : "";
    $("#lista-semdata").replaceChildren(...(semData.length ? semData.map((p) => linhaPost(p, todos, nomes)) : [el("p", { class: "muted" }, "Nenhum post sem data.")]));
  }

  function linhaPost(p, todos, nomes) {
    return el("button", { class: "row-post fmt-" + p.formato, onclick: () => { estado.postEdit = p.id; estado.importar = null; renderPosts(); } },
      el("span", { class: "bolinha", "aria-hidden": "true" }),
      el("span", { class: "t" }, el("b", {}, p.titulo), el("span", {}, [todos ? nomes[p.cliente_id] : null, p.formato].filter(Boolean).join(" · "))),
      el("span", { class: "st st-" + p.status }, nomeStatus(p.status)));
  }
  function novoPost(data) { estado.importar = null; estado.postEdit = { novo: true, data }; renderPosts(); setTimeout(() => $("#p-titulo")?.focus(), 0); }

  function verPost(p, comPosts) {
    const nome = (comPosts.find((c) => c.id === p.cliente_id) || {}).nome || "";
    return [el("div", { class: "card-topo" }, el("h2", {}, p.titulo)),
      el("p", { class: "muted" }, [nome, p.formato, nomeStatus(p.status), p.data ? p.data.split("-").reverse().join("/") : "sem data"].filter(Boolean).join(" · ")),
      p.legenda ? el("div", { class: "legenda-ver" }, p.legenda) : el("p", { class: "muted" }, "Sem legenda ou roteiro."),
      el("div", { class: "linha-botoes" }, el("button", { type: "button", class: "btn", onclick: () => { estado.postEdit = null; renderPosts(); } }, "Fechar"))];
  }
  function formPost(ref, comPosts) {
    if (!ehAdmin()) { const p = postsCache.find((x) => x.id === ref); if (!p) { estado.postEdit = null; return []; } return verPost(p, comPosts); }
    const p = ref.novo ? { titulo: "", formato: "Reels", status: "ideia", data: ref.data || "", legenda: "",
      cliente_id: estado.postsCliente !== "todos" ? estado.postsCliente : comPosts[0].id } : postsCache.find((x) => x.id === ref);
    if (!p) { estado.postEdit = null; return [el("p", { class: "muted" }, "Post não encontrado.")]; }
    const opt = (v, t, atual) => el("option", { value: v, selected: v === atual }, t);
    const erro = el("p", { class: "erro", role: "alert" });
    const form = el("form", { class: "form-post", onsubmit: async (e) => {
      e.preventDefault();
      const titulo = $("#p-titulo").value.trim();
      if (!titulo) { erro.textContent = "Dê um título ao post."; return; }
      const reg = { cliente_id: $("#p-cliente").value, titulo: titulo.slice(0, 140), formato: $("#p-formato").value,
        status: $("#p-status").value, data: $("#p-data").value || null, legenda: $("#p-legenda").value.slice(0, 5000) || null };
      if (!FORMATOS.includes(reg.formato) || !STATUS.some(([k]) => k === reg.status)) return;
      const btn = e.submitter; btn.disabled = true;
      const { error } = ref.novo ? await sb.from("painel_posts").insert(reg) : await sb.from("painel_posts").update(reg).eq("id", ref);
      btn.disabled = false;
      if (error) { erro.textContent = "Não foi possível salvar."; console.error(error); return; }
      if (reg.data) { estado.diaSel = reg.data; if (!reg.data.startsWith(estado.mes || hoje().slice(0, 7))) estado.mes = reg.data.slice(0, 7); }
      estado.postEdit = null; postsCache = null; renderPosts();
    } },
      el("div", { class: "card-topo" }, el("h2", {}, ref.novo ? "Novo post" : "Editar post")),
      el("label", {}, "Cliente", el("select", { id: "p-cliente" }, comPosts.map((c) => opt(c.id, c.nome, p.cliente_id)))),
      el("label", {}, "Título", el("input", { id: "p-titulo", maxlength: 140, required: true, value: p.titulo })),
      el("div", { class: "duas" },
        el("label", {}, "Formato", el("select", { id: "p-formato" }, FORMATOS.map((f) => opt(f, f, p.formato)))),
        el("label", {}, "Status", el("select", { id: "p-status" }, STATUS.map(([k, t]) => opt(k, t, p.status))))),
      el("label", {}, "Data", el("input", { id: "p-data", type: "date", value: p.data || "" })),
      el("label", {}, "Legenda / roteiro", (() => { const t = el("textarea", { id: "p-legenda", maxlength: 5000, rows: 5 }); t.value = p.legenda || ""; return t; })()),
      el("div", { class: "linha-botoes" },
        el("button", { type: "submit", class: "btn primario" }, "Salvar"),
        el("button", { type: "button", class: "btn", onclick: () => { estado.postEdit = null; renderPosts(); } }, "Cancelar"),
        el("span", { class: "sp" }),
        ref.novo ? null : el("button", { type: "button", class: "btn link perigo", onclick: async () => {
          if (!confirm("Excluir este post?")) return;
          const { error } = await sb.from("painel_posts").delete().eq("id", ref);
          if (error) { erro.textContent = "Não foi possível excluir."; return; }
          estado.postEdit = null; postsCache = null; renderPosts();
        } }, "Excluir")),
      erro);
    return [form];
  }

  // ---------- importar da Central de Conteúdo ----------
  const CENTRAL_URL = "https://claude.ai/artifact/Kmaztzsm5wyNbUj9FceXgx";
  const LIMITE_IMPORT = 200;
  const dataValida = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || "") && !isNaN(Date.parse(d + "T12:00:00Z"));

  function textoRoteiro(i) {
    const r = i.roteiro && typeof i.roteiro === "object" ? i.roteiro : null;
    const blocos = [];
    const gancho = (r && r.gancho) || i.gancho;
    if (gancho) blocos.push("GANCHO\n" + gancho);
    if (i.pilar) blocos.push("PILAR\n" + i.pilar);
    if (r && Array.isArray(r.partes) && r.partes.length)
      blocos.push("ROTEIRO\n" + r.partes.map((x) => [x.parte, x.texto, x.tela ? "[" + x.tela + "]" : ""].filter(Boolean).join("\n")).join("\n\n"));
    if (r && r.cta) blocos.push("CTA\n" + r.cta);
    if (r && r.legenda) blocos.push("LEGENDA\n" + r.legenda);
    return blocos.join("\n\n").slice(0, 5000);
  }

  // Aceita o JSON do botão "Copiar para o painel" da Central ou texto livre (uma ideia por linha).
  function lerImportacao(txt) {
    txt = (txt || "").trim();
    if (!txt) return [];
    let brutos = null;
    if (/^[\[{]/.test(txt)) {
      try { const j = JSON.parse(txt); brutos = Array.isArray(j) ? j : Array.isArray(j.itens) ? j.itens : null; } catch { brutos = null; }
    }
    if (!brutos) {
      brutos = txt.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
        l = l.replace(/^([-*•]|\d+[.)])\s+/, "");
        const o = {};
        const d = l.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s*[-–—:|]?\s*/);
        if (d) {
          const ano = d[3] ? (d[3].length === 2 ? "20" + d[3] : d[3]) : hoje().slice(0, 4);
          o.data = `${ano}-${d[2].padStart(2, "0")}-${d[1].padStart(2, "0")}`;
          l = l.slice(d[0].length);
        }
        const f = l.match(/^\[?(reels?|carrossel|post|stories)\]?\s*[-–—:|]\s*/i) || l.match(/^\[(reels?|carrossel|post|stories)\]\s*/i);
        if (f) { o.formato = f[1]; l = l.slice(f[0].length); }
        o.titulo = l;
        return o;
      });
    }
    const normFmt = (f) => { f = String(f || "").toLowerCase(); return FORMATOS.find((x) => x.toLowerCase() === f || (f === "reel" && x === "Reels")) || "Reels"; };
    return brutos.filter((i) => i && typeof i === "object" && String(i.titulo || "").trim()).slice(0, LIMITE_IMPORT).map((i) => {
      const temRot = i.roteiro && typeof i.roteiro === "object";
      let status = STATUS.some(([k]) => k === i.status) ? i.status : "ideia";
      if (status === "ideia" && temRot) status = "roteiro";
      return { titulo: String(i.titulo).trim().slice(0, 140), formato: normFmt(i.formato), status,
        data: dataValida(i.data) ? i.data : null, legenda: textoRoteiro(i) || null, temRot };
    });
  }

  function abrirImportar() {
    estado.postEdit = null;
    estado.importar = { texto: "", clienteId: estado.postsCliente !== "todos" ? estado.postsCliente : "", itens: null, marcados: null };
    renderPosts();
    setTimeout(() => { $("#painel-dia").scrollIntoView({ behavior: "smooth", block: "start" }); $("#imp-texto")?.focus({ preventScroll: true }); }, 0);
  }

  function formImportar(comPosts) {
    const st = estado.importar;
    if (!st.clienteId || !comPosts.some((c) => c.id === st.clienteId)) st.clienteId = comPosts[0].id;
    const erro = el("p", { class: "erro", role: "alert" });
    const fechar = () => { estado.importar = null; renderPosts(); };
    const existentes = new Set(postsCache.filter((p) => p.cliente_id === st.clienteId).map((p) => p.titulo.trim().toLowerCase()));
    const topo = el("div", { class: "card-topo" }, el("h2", {}, "Importar da Central"));

    if (!st.itens) {
      const ta = el("textarea", { id: "imp-texto", rows: 9, maxlength: 400000,
        placeholder: "Cole aqui o que copiou na Central de Conteúdo.\n\nTambém aceita uma ideia por linha, por exemplo:\n12/11 - Reels: 3 erros no anúncio\nCarrossel: Como escolher o público" });
      ta.value = st.texto;
      ta.addEventListener("input", () => { st.texto = ta.value; });
      return [topo,
        el("ol", { class: "passos-imp" },
          el("li", {}, "Na ", el("a", { href: CENTRAL_URL, target: "_blank", rel: "noopener noreferrer" }, "Central de Conteúdo"), ", gere as ideias e os roteiros."),
          el("li", {}, "Em Ideias, filtre o que quer trazer e toque em “Copiar para o painel”."),
          el("li", {}, "Cole abaixo e escolha o cliente.")),
        el("form", { class: "form-post", onsubmit: (e) => {
          e.preventDefault();
          st.clienteId = $("#imp-cliente").value;
          const itens = lerImportacao(st.texto);
          if (!itens.length) { erro.textContent = "Não encontrei ideias no texto colado."; return; }
          const exist = new Set(postsCache.filter((p) => p.cliente_id === st.clienteId).map((p) => p.titulo.trim().toLowerCase()));
          st.itens = itens;
          st.marcados = itens.map((i) => !exist.has(i.titulo.toLowerCase()));
          renderPosts();
        } },
          el("label", {}, "Cliente", el("select", { id: "imp-cliente", onchange: (e) => { st.clienteId = e.target.value; } },
            comPosts.map((c) => el("option", { value: c.id, selected: c.id === st.clienteId }, c.nome)))),
          el("label", {}, "Conteúdo copiado", ta),
          el("div", { class: "linha-botoes" },
            el("button", { type: "submit", class: "btn primario" }, "Revisar"),
            el("button", { type: "button", class: "btn", onclick: fechar }, "Cancelar")),
          erro)];
    }

    const nome = (comPosts.find((c) => c.id === st.clienteId) || {}).nome || "";
    const qtd = () => st.marcados.filter(Boolean).length;
    const btnSalvar = el("button", { type: "button", class: "btn primario" });
    const atualizaBtn = () => { const n = qtd(); btnSalvar.textContent = `Importar ${n} post${n === 1 ? "" : "s"}`; btnSalvar.disabled = n === 0; };
    atualizaBtn();
    btnSalvar.addEventListener("click", async () => {
      const regs = st.itens.filter((_, k) => st.marcados[k]).map((i) => ({ cliente_id: st.clienteId, titulo: i.titulo, formato: i.formato, status: i.status, data: i.data, legenda: i.legenda }));
      if (!regs.length) return;
      btnSalvar.disabled = true; btnSalvar.textContent = "Importando…";
      const { error } = await sb.from("painel_posts").insert(regs);
      if (error) { console.error(error); erro.textContent = "Não foi possível importar. Tente de novo."; atualizaBtn(); return; }
      const primeiraData = regs.map((r) => r.data).filter(Boolean).sort()[0];
      estado.importar = null; postsCache = null;
      estado.postsCliente = st.clienteId;
      if (primeiraData) { estado.mes = primeiraData.slice(0, 7); estado.diaSel = primeiraData; }
      irPara("posts", { postsCliente: st.clienteId, mes: estado.mes || hoje().slice(0, 7) });
    });
    return [topo,
      el("p", { class: "muted" }, `${st.itens.length} ideia${st.itens.length === 1 ? "" : "s"} encontrada${st.itens.length === 1 ? "" : "s"} para `, el("b", {}, nome), ". Desmarque o que não quiser trazer."),
      el("div", { class: "lista-imp" }, st.itens.map((i, k) => {
        const cb = el("input", { type: "checkbox", checked: st.marcados[k] });
        cb.addEventListener("change", () => { st.marcados[k] = cb.checked; atualizaBtn(); });
        const dup = existentes.has(i.titulo.toLowerCase());
        return el("label", { class: "item-imp fmt-" + i.formato }, cb,
          el("span", { class: "t" }, el("b", {}, i.titulo),
            el("span", {}, [i.formato, i.data ? i.data.split("-").reverse().join("/") : "sem data", i.temRot ? "com roteiro" : i.legenda ? "com gancho" : null, dup ? "já existe" : null].filter(Boolean).join(" · "))),
          el("span", { class: "st st-" + i.status }, nomeStatus(i.status)));
      })),
      el("div", { class: "linha-botoes" }, btnSalvar,
        el("button", { type: "button", class: "btn", onclick: () => { st.itens = null; renderPosts(); } }, "Voltar"),
        el("span", { class: "sp" }),
        el("button", { type: "button", class: "btn link", onclick: fechar }, "Cancelar")),
      erro];
  }
  $("#btn-importar").addEventListener("click", abrirImportar);

  $("#posts-cliente").addEventListener("change", (e) => { estado.diaSel = ""; estado.postEdit = null; irPara("posts", { postsCliente: e.target.value }); });
  function mudarMes(passo) {
    const [a, m] = (estado.mes || hoje().slice(0, 7)).split("-").map(Number);
    const d = new Date(Date.UTC(a, m - 1 + passo, 1));
    estado.diaSel = ""; estado.postEdit = null;
    irPara("posts", { mes: d.toISOString().slice(0, 7) });
  }
  $("#mes-ant").addEventListener("click", () => mudarMes(-1));
  $("#mes-prox").addEventListener("click", () => mudarMes(1));
  $("#mes-hoje").addEventListener("click", () => { estado.diaSel = hoje(); estado.postEdit = null; irPara("posts", { mes: hoje().slice(0, 7) }); });

  // ---------- sincronizações + aviso ----------
  const quando = (ts) => new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(ts));
  async function renderLog() {
    const { data: todos } = await sb.from("painel_sync_log").select("executado_em,cliente_id,plataforma,status,linhas,mensagem")
      .order("executado_em", { ascending: false }).limit(80);
    const nomes = Object.fromEntries(estado.clientes.map((c) => [c.id, c.nome]));
    const porId = Object.fromEntries(estado.clientes.map((c) => [c.id, c]));
    const ok = (todos || []).find((l) => l.status === "ok" && l.linhas > 0);
    $("#status-sync").textContent = ok ? `Atualizado em ${quando(ok.executado_em)}` : "Aguardando a primeira coleta";

    // aviso só para o resultado MAIS RECENTE de cada cliente+plataforma ainda configurada
    const visto = new Set(), erros = [], houveColeta = {};
    for (const l of todos || []) {
      if (!l.cliente_id) {
        if (l.status === "erro" && !houveColeta[l.plataforma] && !visto.has("geral" + l.plataforma)) erros.push(l);
        visto.add("geral" + l.plataforma);
        continue;
      }
      const c = porId[l.cliente_id];
      const ativa = c && c.ativo && (l.plataforma === "google" ? c.google_customer_id : c.meta_ad_account_id);
      const k = l.cliente_id + l.plataforma;
      houveColeta[l.plataforma] = true;
      if (visto.has(k)) continue;
      visto.add(k);
      if (ativa && l.status === "erro") erros.push(l);
    }
    aviso(erros.length
      ? "⚠ Erro na última coleta" + (nomes[erros[0].cliente_id] ? ` (${nomes[erros[0].cliente_id]} · ${PLAT[erros[0].plataforma]?.curto || ""})` : "") +
        ": " + (erros[0].mensagem || "verifique as credenciais") + (erros.length > 1 ? ` — e mais ${erros.length - 1}` : "")
      : "");

    if (estado.rota !== "sync") return;
    const vistos = new Set();
    const lista = (todos || []).filter((l) => { const k = (l.cliente_id || "geral") + (l.plataforma || ""); if (vistos.has(k)) return false; vistos.add(k); return true; });
    $("#log").replaceChildren(...(lista.length ? lista.map((l) => el("tr", {},
      el("td", {}, quando(l.executado_em)),
      el("td", {}, el("span", { class: l.status === "ok" ? "st-ok" : "st-erro" }, l.status === "ok" ? "✓ OK" : "✕ Erro")),
      el("td", {}, nomes[l.cliente_id] || (l.cliente_id ? "Cliente removido" : "Geral")),
      el("td", {}, l.plataforma ? PLAT[l.plataforma].curto : "—"),
      el("td", { class: "detalhe" }, l.mensagem || (l.linhas != null ? `${int.format(l.linhas)} linhas atualizadas` : ""))))
      : [el("tr", {}, el("td", { colspan: 5, class: "muted" }, "Nenhuma coleta registrada ainda."))]));
  }
  $("#btn-atualizar").addEventListener("click", async (e) => {
    const b = e.currentTarget; b.disabled = true; b.textContent = "Atualizando…";
    try {
      const { error } = await sb.functions.invoke("sync-ads", { body: {} });
      if (error) {
        let msg = "Não foi possível atualizar agora.";
        try { const j = await error.context.json(); if (j?.erro) msg = j.erro; } catch {}
        aviso(msg);
      }
      limparCaches();
      await render();
    } finally { b.disabled = false; b.textContent = "↻ Atualizar agora"; }
  });

  // ---------- equipe (convites) ----------
  async function chamarEquipe(body) {
    const { data, error } = await sb.functions.invoke("equipe", { body });
    if (error) {
      let msg = "Não foi possível concluir. Tente de novo.";
      try { const j = await error.context.json(); if (j?.erro) msg = j.erro; } catch {}
      throw new Error(msg);
    }
    return data;
  }
  const NOME_PAPEL = { admin: "Admin", visualizador: "Visualizador" };
  function mostrarLink(email, link) {
    const box = $("#convite-resultado");
    const inp = el("input", { readonly: true, value: link, "aria-label": "Link de convite" });
    const msg = `Oi! Você foi convidado(a) para a Central de Clientes da Ana Menires. Abra o link para criar sua senha: ${link}`;
    box.replaceChildren(
      el("p", {}, el("b", {}, "Convite pronto para " + email), el("br"), el("span", { class: "muted" }, "O link vale por pouco tempo (em geral 1 hora). Se expirar, gere outro na lista abaixo.")),
      inp,
      el("div", { class: "linha-botoes" },
        el("button", { type: "button", class: "btn primario", onclick: async (e) => {
          try { await navigator.clipboard.writeText(link); e.target.textContent = "Copiado ✓"; } catch { inp.select(); }
        } }, "Copiar link"),
        el("a", { class: "btn", href: "https://wa.me/?text=" + encodeURIComponent(msg), target: "_blank", rel: "noopener noreferrer" }, "Enviar no WhatsApp")));
    box.hidden = false;
  }
  async function renderEquipe() {
    const tb = $("#lista-equipe");
    let equipe;
    try { equipe = (await chamarEquipe({ acao: "listar" })).equipe; }
    catch (e) { tb.replaceChildren(el("tr", {}, el("td", { colspan: 4, class: "muted" }, e.message))); return; }
    $("#qtd-equipe").textContent = `${equipe.length} pessoa${equipe.length === 1 ? "" : "s"}`;
    const erro = $("#equipe-erro");
    tb.replaceChildren(...equipe.map((m) => el("tr", {},
      el("td", { class: "nome" }, m.email, m.eu ? el("span", { class: "muted" }, " (você)") : null),
      el("td", {}, m.eu ? NOME_PAPEL[m.papel] : el("select", { "aria-label": "Papel de " + m.email, onchange: async (e) => {
        erro.textContent = "";
        try { await chamarEquipe({ acao: "papel", user_id: m.user_id, papel: e.target.value }); } catch (x) { erro.textContent = x.message; renderEquipe(); }
      } }, ["admin", "visualizador"].map((p) => el("option", { value: p, selected: p === m.papel }, NOME_PAPEL[p])))),
      el("td", {}, m.pendente ? el("span", { class: "st st-roteiro" }, "Convite pendente") : el("span", { class: "muted" }, "Último acesso " + quando(m.ultimo_acesso))),
      el("td", { class: "acoes" }, m.eu ? null : [
        el("button", { class: "btn link", onclick: async () => {
          erro.textContent = "";
          try { const r = await chamarEquipe({ acao: "novo_link", user_id: m.user_id }); mostrarLink(r.email, r.link); $("#convite-resultado").scrollIntoView({ behavior: "smooth", block: "center" }); }
          catch (x) { erro.textContent = x.message; }
        } }, m.pendente ? "Novo link" : "Link de nova senha"),
        el("button", { class: "btn link perigo", onclick: async () => {
          if (!confirm(`Tirar o acesso de ${m.email} ao painel?`)) return;
          erro.textContent = "";
          try { await chamarEquipe({ acao: "remover", user_id: m.user_id }); renderEquipe(); } catch (x) { erro.textContent = x.message; }
        } }, "Remover")]))));
  }
  $("#form-convite").addEventListener("submit", async (e) => {
    e.preventDefault();
    const erro = $("#convite-erro"); erro.textContent = "";
    const email = $("#cv-email").value.trim(), papel = $("#cv-papel").value;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { erro.textContent = "Informe um e-mail válido."; return; }
    const btn = e.submitter; btn.disabled = true; btn.textContent = "Gerando…";
    try {
      const r = await chamarEquipe({ acao: "convidar", email, papel });
      mostrarLink(r.email, r.link);
      if (r.ja_era_da_equipe) erro.textContent = "Essa pessoa já fazia parte da equipe; o papel não mudou (troque na lista, se precisar).";
      $("#cv-email").value = "";
      renderEquipe();
    } catch (x) { erro.textContent = x.message; }
    finally { btn.disabled = false; btn.textContent = "Gerar convite"; }
  });

  // ---------- clientes ----------
  function renderClientes() {
    const tb = $("#lista-clientes");
    $("#qtd-clientes").textContent = `${estado.clientes.length} no total`;
    if (!estado.clientes.length) { tb.replaceChildren(el("tr", {}, el("td", { colspan: 8, class: "muted" }, "Nenhum cliente ainda. Adicione o primeiro ao lado."))); return; }
    tb.replaceChildren(...estado.clientes.map((c) => el("tr", {},
      el("td", { class: "nome" }, c.nome),
      el("td", {}, c.google_customer_id ? c.google_customer_id.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3") : "—"),
      el("td", {}, c.meta_ad_account_id ? "act_" + c.meta_ad_account_id : "—"),
      el("td", { class: "num" }, c.meta_cpl ? brl.format(c.meta_cpl) : "—"),
      el("td", { class: "orc-col" }, textoOrc(c)),
      el("td", {}, c.tem_posts ? "Sim" : "—"),
      el("td", {}, c.ativo ? "Ativo" : "Inativo"),
      el("td", { class: "acoes" },
        el("button", { class: "btn link", onclick: () => editar(c), "aria-label": `Editar ${c.nome}` }, "Editar"),
        el("button", { class: "btn link perigo", onclick: () => excluir(c), "aria-label": `Excluir ${c.nome}` }, "Excluir")))));
  }
  function textoOrc(c) {
    const g = num(c.orc_google), m = num(c.orc_meta), t = num(c.orc_total), per = c.orc_periodo === "semanal" ? "/sem" : "/mês";
    if (g != null || m != null) return [g != null ? "Google " + brl0.format(g) : null, m != null ? "Meta " + brl0.format(m) : null].filter(Boolean).join(" · ") + " " + per;
    return t ? brl0.format(t) + " " + per : "—";
  }
  function mostrarSplit() {
    const sep = $("#c-orc-split").checked;
    $("#c-orc-plats").hidden = !sep;
    $("#c-orc-total").closest("label").hidden = sep;
  }
  $("#c-orc-split").addEventListener("change", mostrarSplit);
  function limparForm() {
    $("#form-cliente").reset(); $("#c-id").value = ""; $("#c-ativo").checked = true; $("#c-posts").checked = false; mostrarSplit();
    $("#form-cliente-titulo").textContent = "Adicionar cliente"; $("#c-erro").textContent = "";
  }
  function editar(c) {
    $("#c-id").value = c.id; $("#c-nome").value = c.nome;
    $("#c-google").value = c.google_customer_id || ""; $("#c-meta").value = c.meta_ad_account_id || "";
    $("#c-cpl").value = c.meta_cpl ?? ""; $("#c-ativo").checked = c.ativo; $("#c-posts").checked = !!c.tem_posts;
    $("#c-orc-periodo").value = c.orc_periodo === "semanal" ? "semanal" : "mensal";
    $("#c-orc-total").value = c.orc_total ?? ""; $("#c-orc-google").value = c.orc_google ?? ""; $("#c-orc-meta").value = c.orc_meta ?? "";
    $("#c-orc-split").checked = c.orc_google != null || c.orc_meta != null; mostrarSplit();
    $("#form-cliente-titulo").textContent = "Editar " + c.nome; $("#c-erro").textContent = "";
    $("#c-nome").focus();
  }
  async function excluir(c) {
    if (!confirm(`Excluir ${c.nome}? Os dados coletados desse cliente também serão apagados.`)) return;
    const { error } = await sb.from("painel_clientes").delete().eq("id", c.id);
    if (error) { $("#c-erro").textContent = "Não foi possível excluir."; return; }
    await carregarClientes(); cache.clear(); render();
  }
  $("#c-cancelar").addEventListener("click", limparForm);
  $("#form-cliente").addEventListener("submit", async (e) => {
    e.preventDefault();
    const erro = $("#c-erro"); erro.textContent = "";
    const nome = $("#c-nome").value.trim();
    const google = $("#c-google").value.replace(/\D/g, "");
    const meta = $("#c-meta").value.trim().replace(/^act_/i, "").replace(/\D/g, "");
    const cplTxt = $("#c-cpl").value;
    if (!nome) return (erro.textContent = "Informe o nome.");
    if (google && google.length !== 10) return (erro.textContent = "O ID do Google Ads tem 10 dígitos (ex.: 123-456-7890).");
    if (meta && (meta.length < 5 || meta.length > 20)) return (erro.textContent = "ID da conta Meta inválido.");
    const temPosts = $("#c-posts").checked;
    const valor = (id) => { const v = $(id).value; return v === "" ? null : Math.max(0, Math.round(Number(v) * 100) / 100); };
    const sep = $("#c-orc-split").checked;
    const reg = { nome, google_customer_id: google || null, meta_ad_account_id: meta || null,
      meta_cpl: cplTxt === "" ? null : Math.max(0, Number(cplTxt)), ativo: $("#c-ativo").checked, tem_posts: temPosts,
      orc_periodo: $("#c-orc-periodo").value === "semanal" ? "semanal" : "mensal",
      orc_total: sep ? null : valor("#c-orc-total"), orc_google: sep ? valor("#c-orc-google") : null, orc_meta: sep ? valor("#c-orc-meta") : null };
    const id = $("#c-id").value;
    const { error } = id ? await sb.from("painel_clientes").update(reg).eq("id", id) : await sb.from("painel_clientes").insert(reg);
    if (error) { erro.textContent = "Não foi possível salvar."; console.error(error); return; }
    limparForm(); await carregarClientes(); render();
  });

  iniciar();
})();
