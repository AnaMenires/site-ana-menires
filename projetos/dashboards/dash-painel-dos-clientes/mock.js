/* Central de Clientes · versão demonstrativa
 * Substitui o Supabase por um banco em memória com dados FICTÍCIOS.
 * Nenhum cliente, conta ou número desta página é real. Tudo volta ao padrão ao recarregar.
 */
(() => {
  "use strict";
  const TZ = "America/Fortaleza";
  const IMPOSTO_META = 0.12;

  // ---------- utilidades ----------
  let seed = 20261104;
  const rnd = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const entre = (a, b) => a + rnd() * (b - a);
  const arred = (x, c = 2) => Math.round(x * 10 ** c) / 10 ** c;
  const inteiro = (x) => Math.max(0, Math.round(x + (rnd() - 0.5)));
  const hoje = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const somaDias = (iso, n) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const fracaoDia = () => {
    const p = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
    const h = +p.find((x) => x.type === "hour").value, m = +p.find((x) => x.type === "minute").value;
    return Math.max(0.05, (h * 60 + m) / 1440);
  };
  let seq = 1;
  const id = () => seq++;
  const uuid = (n) => "00000000-0000-4000-8000-" + String(n).padStart(12, "0");

  // ---------- clientes fictícios ----------
  const CLIENTES = [
    { n: 1, nome: "Clínica Sorriso Pleno", g: true, m: true, cpl: 38, per: "mensal", tot: 6000, og: 3500, om: 2500, posts: true, ritmo: 1.0, cpaF: 0.85, mtipo: "msg" },
    { n: 2, nome: "Academia Movimento", g: false, m: true, cpl: 14, per: "mensal", tot: 2500, og: null, om: null, posts: true, ritmo: 1.0, cpaF: 1.35, mtipo: "msg" },
    { n: 3, nome: "Imobiliária Horizonte", g: true, m: true, cpl: 55, per: "mensal", tot: 8000, og: 5000, om: 3000, posts: false, ritmo: 1.0, cpaF: 0.95, mtipo: "lead" },
    { n: 4, nome: "Pet Shop Patinhas", g: true, m: false, cpl: 18, per: "semanal", tot: 700, og: null, om: null, posts: false, ritmo: 0.95, cpaF: 0.9, mtipo: "msg" },
    { n: 5, nome: "Escola de Idiomas Fluent", g: true, m: true, cpl: 42, per: "mensal", tot: 5000, og: null, om: null, posts: true, ritmo: 0.95, cpaF: 0.8, mtipo: "lead" },
    { n: 6, nome: "Casa & Decor Móveis", g: false, m: true, cpl: 25, per: "mensal", tot: 3000, og: null, om: null, posts: false, ritmo: 0.93, cpaF: 0.95, mtipo: "msg" },
    { n: 7, nome: "Restaurante Sabor da Serra", g: true, m: true, cpl: 20, per: "mensal", tot: 2000, og: null, om: null, posts: false, ritmo: 0.92, cpaF: 0.9, mtipo: "msg", parou: "meta" },
    { n: 8, nome: "Ótica Visão Clara", g: true, m: true, cpl: 30, per: "mensal", tot: 3500, og: null, om: null, posts: true, ritmo: 0.93, cpaF: 0.9, mtipo: "msg", semConv: "google" },
    { n: 9, nome: "Estúdio Bela Pele", g: false, m: true, cpl: 16, per: "mensal", tot: 1800, og: null, om: null, posts: true, ritmo: 0.97, cpaF: 0.85, mtipo: "msg" },
    { n: 10, nome: "Prado Advocacia", g: true, m: false, cpl: 70, per: "mensal", tot: 4000, og: null, om: null, posts: false, ritmo: 0.92, cpaF: 0.9, mtipo: "lead" },
    { n: 11, nome: "Construtora Alicerce", g: true, m: true, cpl: 85, per: "mensal", tot: 9000, og: 5500, om: 3500, posts: false, ritmo: 0.6, cpaF: 0.88, mtipo: "lead" },
    { n: 12, nome: "Padaria Trigo Dourado", g: false, m: true, cpl: 9, per: "semanal", tot: 350, og: null, om: null, posts: true, ritmo: 1.7, cpaF: 0.8, mtipo: "msg" },
    { n: 13, nome: "Clínica Veterinária Amigo Fiel", g: true, m: true, cpl: 28, per: "mensal", tot: 4200, og: 2400, om: 1800, posts: false, ritmo: 1.3, cpaF: 0.95, mtipo: "msg" },
    { n: 14, nome: "Auto Center Roda Viva", g: true, m: false, cpl: null, per: "mensal", tot: 2200, og: null, om: null, posts: false, ritmo: 0.92, cpaF: 0.85, mtipo: "msg", cpaPico: "google" },
    { n: 15, nome: "Moda Aurora", g: false, m: true, cpl: 12, per: "mensal", tot: 2800, og: null, om: null, posts: true, ritmo: 0.93, cpaF: 0.9, mtipo: "msg" },
    { n: 16, nome: "Colégio Novo Saber", g: true, m: true, cpl: 48, per: "mensal", tot: 6000, og: 3500, om: 2500, posts: true, ritmo: 0.93, cpaF: 0.92, mtipo: "lead" },
  ];
  const db = { painel_clientes: [], painel_metricas: [], painel_anuncios: [], painel_anuncios_info: [], painel_contas: [], painel_saldo_google: [],
    painel_recargas: [], painel_sync_log: [], painel_posts: [], painel_admins: [{ user_id: "demo", papel: "admin" }] };

  for (const c of CLIENTES) db.painel_clientes.push({
    id: uuid(c.n), nome: c.nome,
    google_customer_id: c.g ? `000-000-${String(1000 + c.n).slice(-4)}` : null,
    meta_ad_account_id: c.m ? `10000000000${c.n}` : null,
    meta_cpl: c.cpl, orc_periodo: c.per, orc_total: c.tot, orc_google: c.og, orc_meta: c.om,
    tem_posts: c.posts, ativo: !c.inativo, criado_em: new Date(Date.now() - 864e5 * 200).toISOString(),
  });

  // ---------- campanhas e anúncios ----------
  const CAMP = {
    google: [
      { nome: "Pesquisa | Marca", peso: 0.25, cpc: [0.9, 1.6], ctr: 0.14, conv: 1.2 },
      { nome: "Pesquisa | Serviços", peso: 0.5, cpc: [2.2, 3.6], ctr: 0.07, conv: 1.0 },
      { nome: "Performance Max | Geral", peso: 0.25, cpc: [0.6, 1.1], ctr: 0.018, conv: 0.85 },
    ],
    meta: [
      { nome: "Conversão | Público frio", peso: 0.55, cpm: [16, 26], ctr: 0.011, conv: 1.0 },
      { nome: "Remarketing | Quentes", peso: 0.3, cpm: [24, 38], ctr: 0.019, conv: 0.75 },
      { nome: "Alcance | Reconhecimento", peso: 0.15, cpm: [7, 11], ctr: 0.006, conv: 0, tipo: "reach" },
    ],
  };
  const ADS = {
    google: ["Anúncio responsivo · Benefícios", "Anúncio responsivo · Oferta", "Anúncio responsivo · Prova social"],
    meta: ["Vídeo · Depoimento de cliente", "Carrossel · Antes e depois", "Imagem · Oferta do mês"],
  };
  const TIPO_META = { msg: "actions:onsite_conversion.messaging_conversation_started_7d", lead: "actions:lead" };

  const H = hoje(), DIAS = 120, frac = fracaoDia();
  let campId = 1000, adId = 50000;
  for (const c of CLIENTES) {
    const cli = uuid(c.n);
    const plats = [c.g && "google", c.m && "meta"].filter(Boolean);
    const diaPlat = {};
    if (c.og || c.om) { if (c.g) diaPlat.google = c.og / 30; if (c.m) diaPlat.meta = c.om / 30; }
    else { const base = c.per === "semanal" ? c.tot / 7 : c.tot / 30; plats.forEach((p) => (diaPlat[p] = base / plats.length)); }
    for (const p of plats) {
      for (const cp of CAMP[p]) {
        const cid = String(++campId), ads = ADS[p].map((nome, i) => ({ id: String(++adId), nome, peso: [0.45, 0.35, 0.2][i], fad: entre(0.85, 1.2) }));
        for (const a of ads) db.painel_anuncios_info.push({ cliente_id: cli, plataforma: p, anuncio_id: a.id, thumb_url: null, status: rnd() < 0.85 ? "Ativo" : "Pausado" });
        const cpcBase = cp.cpc ? entre(...cp.cpc) : null, cpmBase = cp.cpm ? entre(...cp.cpm) : null;
        for (let k = DIAS; k >= 0; k--) {
          const d = somaDias(H, -k);
          if (c.inativo && k < 20) continue;
          const dow = new Date(d + "T12:00:00Z").getUTCDay();
          const semana = dow === 0 ? 0.75 : dow === 6 ? 0.85 : 1.05;
          const tendencia = 0.88 + (DIAS - k) / DIAS * 0.1; // leve crescimento ao longo do período
          const parcial = k === 0 ? frac : 1;
          const parado = c.parou === p && k <= 1;
          const custoReal = parado ? 0 : diaPlat[p] * cp.peso * c.ritmo * semana * tendencia * entre(0.78, 1.22) * parcial;
          let imp, cli2;
          if (p === "google") { cli2 = custoReal / (cpcBase * entre(0.9, 1.1)); imp = cli2 / (cp.ctr * entre(0.85, 1.15)); }
          else { imp = custoReal / (cpmBase * entre(0.9, 1.12)) * 1000; cli2 = imp * cp.ctr * entre(0.85, 1.15); }
          const cpa = (c.cpl || 30) * c.cpaF * entre(0.75, 1.3) * (p === "meta" ? 0.72 : 1) * (c.cpaPico === p && k <= 7 ? 1.9 : 1);
          const conv = cp.conv && !(c.semConv === p && k >= 1 && k <= 7) ? inteiro(custoReal / cpa * cp.conv) : 0;
          const custo = p === "meta" ? custoReal / (1 + IMPOSTO_META) : custoReal;
          const tipo = p === "google" ? "conversoes" : (cp.tipo || TIPO_META[c.mtipo]);
          const resultados = cp.tipo === "reach" ? Math.round(imp * entre(0.55, 0.7)) : conv;
          const linha = { cliente_id: cli, plataforma: p, data: d, campanha_id: cid, campanha_nome: cp.nome,
            impressoes: Math.round(imp), cliques: Math.round(cli2), custo: arred(custo), conversoes: conv, resultados, resultado_tipo: tipo };
          db.painel_metricas.push({ id: id(), ...linha });
          // anúncios: divide a campanha entre os criativos; o terceiro "cansa" nas últimas semanas
          let restoConv = conv;
          ads.forEach((a, i) => {
            const cansa = i === 2 && k < 14 ? 0.6 : 1;
            const w = a.peso * a.fad * cansa;
            const cv = i === ads.length - 1 ? restoConv : Math.min(restoConv, Math.round(conv * w));
            restoConv -= cv;
            db.painel_anuncios.push({ id: id(), cliente_id: cli, plataforma: p, data: d, anuncio_id: a.id, anuncio_nome: a.nome, campanha_id: cid,
              conjunto_nome: p === "meta" ? "Conjunto · " + cp.nome.split("|")[1].trim() : cp.nome.split("|")[1]?.trim() || "Grupo 1",
              impressoes: Math.round(linha.impressoes * w), cliques: Math.round(linha.cliques * w), custo: arred(linha.custo * w),
              conversoes: cv, resultados: cp.tipo === "reach" ? Math.round(resultados * w) : cv, resultado_tipo: tipo });
          });
        }
      }
    }
    // contas e saldos
    if (c.g) {
      const suspensa = c.n === 5;
      db.painel_contas.push({ cliente_id: cli, plataforma: "google", status_ok: !suspensa, status: suspensa ? "Suspensa" : "Ativa", pre_pago: false, saldo: null, limite_gasto: null, gasto_total: null });
      const saldo = { 1: 1450, 3: 2300, 4: 95, 5: 3100, 7: 400, 8: 1200, 10: 2600, 11: 4100, 13: 1750, 14: 900, 16: 2800 }[c.n] ?? null;
      db.painel_saldo_google.push({ cliente_id: cli, saldo });
      db.painel_recargas.push({ id: id(), cliente_id: cli, valor: 3000, data: somaDias(H, -40) }, { id: id(), cliente_id: cli, valor: 2000, data: somaDias(H, -12) });
    }
    if (c.m) {
      const conf = { 1: { pre_pago: true, saldo: 820 }, 2: { pre_pago: true, saldo: 140 }, 3: { pre_pago: false, limite_gasto: 40000, gasto_total: 39780 },
        5: { pre_pago: false }, 6: { pre_pago: true, saldo: 610 }, 7: { pre_pago: false }, 8: { pre_pago: true, saldo: 940 },
        9: { pre_pago: true, saldo: 0 }, 11: { pre_pago: false }, 12: { pre_pago: true, saldo: 310 }, 13: { pre_pago: false }, 15: { pre_pago: true, saldo: 1100 },
        16: { pre_pago: false } }[c.n] || { pre_pago: false };
      const pendente = c.n === 15;
      db.painel_contas.push({ cliente_id: cli, plataforma: "meta", status_ok: !pendente, status: pendente ? "Pagamento pendente" : "Ativa", saldo: null, limite_gasto: null, gasto_total: null, ...conf });
    }
  }

  // ---------- log de sincronização ----------
  const agora = Date.now();
  for (let t = 96; t >= 0; t--) {
    const quando = new Date(agora - t * 30 * 60e3 - 4 * 60e3).toISOString();
    for (const c of CLIENTES) {
      if (c.inativo) continue;
      for (const p of [c.g && "google", c.m && "meta"].filter(Boolean))
        { const erro = c.n === 10 && p === "google" && t <= 3;
          db.painel_sync_log.push({ id: id(), executado_em: quando, cliente_id: uuid(c.n), plataforma: p, status: erro ? "erro" : "ok", linhas: erro ? null : Math.round(entre(6, 40)),
            mensagem: erro ? "Google Ads: o acesso à conta expirou. Reconecte a conta para voltar a coletar." : null }); }
    }
  }

  // ---------- programação de posts ----------
  const PAUTAS = {
    1: [["Reels", "3 sinais de que é hora de ir ao dentista"], ["Carrossel", "Clareamento: mitos e verdades"], ["Post", "Conheça nossa equipe"], ["Stories", "Enquete: qual sua maior dúvida?"],
      ["Reels", "Bastidores de um atendimento"], ["Carrossel", "Passo a passo da limpeza"], ["Post", "Depoimento de paciente"], ["Reels", "Lente de contato dental em 30s"]],
    2: [["Reels", "Treino de 15 minutos para quem não tem tempo"], ["Carrossel", "5 erros comuns na musculação"], ["Stories", "Desafio da semana"], ["Post", "Horários de fim de ano"],
      ["Reels", "Antes e depois de aluno"], ["Carrossel", "O que comer antes do treino"], ["Reels", "Tour pela academia"]],
    5: [["Carrossel", "10 expressões para viagem"], ["Reels", "Erros de pronúncia mais comuns"], ["Post", "Turmas abertas de janeiro"], ["Stories", "Quiz de vocabulário"],
      ["Reels", "Aula experimental: como funciona"], ["Carrossel", "Inglês para entrevista de emprego"], ["Post", "Depoimento de aluno"]],
  };
  const mesIni = H.slice(0, 8) + "01";
  for (const [n, lista] of Object.entries(PAUTAS)) {
    lista.forEach(([formato, titulo], i) => {
      const semData = i === lista.length - 1;
      const data = semData ? null : somaDias(mesIni, Math.min(27, 2 + i * 4 + (n % 3)));
      const passado = data && data < H;
      const status = passado ? "publicado" : !data ? "ideia" : i % 3 === 0 ? "agendado" : i % 3 === 1 ? "roteiro" : "ideia";
      db.painel_posts.push({ id: uuid(9000 + n * 20 + i), cliente_id: uuid(+n), data, titulo, formato, status,
        legenda: status === "ideia" ? "" : `${titulo}.\n\nTexto de exemplo da legenda, com a chamada para agendar pelo WhatsApp.`,
        criado_em: new Date(agora - (30 - i) * 864e5).toISOString() });
    });
  }

  // ---------- equipe (fictícia) ----------
  const equipe = [
    { user_id: "demo", email: "voce@exemplo.com", papel: "admin", eu: true, ultimo_acesso: new Date().toISOString() },
    { user_id: "u2", email: "gestor@exemplo.com", papel: "admin", ultimo_acesso: new Date(agora - 3 * 3600e3).toISOString() },
    { user_id: "u3", email: "analista@exemplo.com", papel: "visualizador", ultimo_acesso: new Date(agora - 26 * 3600e3).toISOString() },
    { user_id: "u4", email: "cliente@exemplo.com", papel: "visualizador", pendente: true },
  ];
  const linkDemo = "Demonstração: nenhum convite real é enviado";

  // ---------- consultas (imita o cliente do Supabase) ----------
  const clone = (o) => ({ ...o });
  class Consulta {
    constructor(t) { this.t = t; this.op = "select"; this.cols = "*"; this.f = []; this.o = []; this.r = null; this.lim = null; this.um = false; this.payload = null; }
    select(c) { if (this.op === "select") this.cols = c || "*"; return this; }
    eq(k, v) { this.f.push((x) => x[k] === v); return this; }
    neq(k, v) { this.f.push((x) => x[k] !== v); return this; }
    gte(k, v) { this.f.push((x) => x[k] != null && x[k] >= v); return this; }
    lte(k, v) { this.f.push((x) => x[k] != null && x[k] <= v); return this; }
    gt(k, v) { this.f.push((x) => x[k] != null && x[k] > v); return this; }
    lt(k, v) { this.f.push((x) => x[k] != null && x[k] < v); return this; }
    in(k, vs) { this.f.push((x) => vs.includes(x[k])); return this; }
    order(k, o = {}) { this.o.push([k, o.ascending !== false, o.nullsFirst === true]); return this; }
    range(a, b) { this.r = [a, b]; return this; }
    limit(n) { this.lim = n; return this; }
    maybeSingle() { this.um = true; return this; }
    single() { this.um = true; return this; }
    insert(x) { this.op = "insert"; this.payload = x; return this; }
    update(x) { this.op = "update"; this.payload = x; return this; }
    upsert(x) { this.op = "insert"; this.payload = x; return this; }
    delete() { this.op = "delete"; return this; }
    executar() {
      const tab = db[this.t] || (db[this.t] = []);
      const passa = (x) => this.f.every((fn) => fn(x));
      if (this.op === "insert") {
        for (const x of [].concat(this.payload)) tab.push({ id: typeof tab[0]?.id === "string" ? uuid(900000 + id()) : id(), criado_em: new Date().toISOString(), ...x });
        return { data: null, error: null };
      }
      if (this.op === "update") { tab.filter(passa).forEach((x) => Object.assign(x, this.payload)); return { data: null, error: null }; }
      if (this.op === "delete") { for (let i = tab.length - 1; i >= 0; i--) if (passa(tab[i])) tab.splice(i, 1); return { data: null, error: null }; }
      let ls = tab.filter(passa);
      if (this.o.length) ls = ls.slice().sort((a, b) => {
        for (const [k, asc, nf] of this.o) {
          const va = a[k], vb = b[k];
          if (va == null && vb == null) continue;
          if (va == null) return nf ? -1 : 1;
          if (vb == null) return nf ? 1 : -1;
          if (va < vb) return asc ? -1 : 1;
          if (va > vb) return asc ? 1 : -1;
        }
        return 0;
      });
      if (this.r) ls = ls.slice(this.r[0], this.r[1] + 1);
      if (this.lim != null) ls = ls.slice(0, this.lim);
      const cols = this.cols === "*" ? null : this.cols.split(",").map((s) => s.trim());
      const dados = ls.map((x) => (cols ? Object.fromEntries(cols.map((k) => [k, x[k] ?? null])) : clone(x)));
      return { data: this.um ? dados[0] || null : dados, error: null };
    }
    then(ok, falha) { return new Promise((r) => setTimeout(r, 60)).then(() => this.executar()).then(ok, falha); }
  }

  const cliente = {
    from: (t) => new Consulta(t),
    auth: {
      getSession: async () => ({ data: { session: { user: { id: "demo", email: "voce@exemplo.com" } } } }),
      getUser: async () => ({ data: { user: { id: "demo", email: "voce@exemplo.com" } } }),
      signInWithPassword: async () => ({ error: null }),
      verifyOtp: async () => ({ error: null }),
      updateUser: async () => ({ error: null }),
      signOut: async () => { location.href = "/projetos/dashboards"; return { error: null }; },
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
    channel: () => { const c = { on: () => c, subscribe: () => c }; return c; },
    functions: {
      invoke: async (nome, { body } = {}) => {
        await new Promise((r) => setTimeout(r, 700));
        if (nome === "sync-ads") {
          const quando = new Date().toISOString();
          for (const c of db.painel_clientes.filter((x) => x.ativo))
            for (const p of [c.google_customer_id && "google", c.meta_ad_account_id && "meta"].filter(Boolean))
            { const erro = c.id === uuid(10) && p === "google";
              db.painel_sync_log.push({ id: id(), executado_em: quando, cliente_id: c.id, plataforma: p, status: erro ? "erro" : "ok", linhas: erro ? null : Math.round(entre(6, 40)),
                mensagem: erro ? "Google Ads: o acesso à conta expirou. Reconecte a conta para voltar a coletar." : null }); }
          return { data: { ok: true }, error: null };
        }
        if (nome === "equipe") {
          const a = body?.acao;
          if (a === "listar") return { data: { equipe: equipe.map(clone) }, error: null };
          if (a === "convidar") {
            const ja = equipe.some((m) => m.email === body.email);
            if (!ja) equipe.push({ user_id: "u" + id(), email: body.email, papel: body.papel, pendente: true });
            return { data: { email: body.email, link: linkDemo, ja_era_da_equipe: ja }, error: null };
          }
          const m = equipe.find((x) => x.user_id === body?.user_id);
          if (a === "novo_link") return { data: { email: m?.email || "", link: linkDemo }, error: null };
          if (a === "papel" && m) m.papel = body.papel;
          if (a === "remover" && m) equipe.splice(equipe.indexOf(m), 1);
          return { data: { ok: true }, error: null };
        }
        return { data: null, error: null };
      },
    },
  };

  window.supabase = { createClient: () => cliente };
})();
