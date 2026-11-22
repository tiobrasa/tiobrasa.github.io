/* Sistema da loja Tio Brasa — Brazuka Web
   Tudo fica salvo no próprio aparelho (localStorage).
   Valores em dinheiro são guardados em CENTAVOS (números inteiros) para não dar erro de arredondamento. */
'use strict';

const CONFIG = {
  nomeLoja: 'Tio Brasa',
  chave: 'bispetinho-sistema-v1',
  diasLembreteCopia: 7
};

const FORMAS = { dinheiro: 'Dinheiro', pix: 'Pix', cartao: 'Cartão', dividido: 'Dividido' };
const FORMAS_BASE = ['dinheiro', 'pix', 'cartao'];
const ICONE_FORMA = { dinheiro: '💵', pix: '📱', cartao: '💳' };
/* Quanto de uma venda entrou em cada forma (venda dividida conta cada parte na sua forma) */
function textoForma(v) {
  if (v.forma !== 'dividido' || !v.partes) return FORMAS[v.forma] || v.forma;
  return Object.keys(v.partes).map((f) => FORMAS[f] + ' ' + fmt(v.partes[f])).join(' + ');
}
function partesDaVenda(v) {
  if (v.forma === 'dividido' && v.partes) return v.partes;
  return { [v.forma]: v.total };
}
const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const ORDEM_SEMANA = [1, 2, 3, 4, 5, 6, 0]; // começa na segunda

/* ---------- Utilidades ---------- */
const $ = (sel) => document.querySelector(sel);
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const fmt = (c) => brl.format((c || 0) / 100);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* Converte o que a pessoa digitou ("20", "20,50", "R$ 1.250,00") para centavos. Vazio → null, inválido → NaN. */
function paraCentavos(txt) {
  let s = String(txt == null ? '' : txt).replace(/R\$|\s/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  if (!/^\d*\.?\d*$/.test(s) || s === '.') return NaN;
  const n = Number(s);
  if (!isFinite(n) || n < 0) return NaN;
  return Math.round(n * 100);
}
const centavosParaCampo = (c) => (c == null ? '' : (c / 100).toFixed(2).replace('.', ','));
const valorOk = (c) => c != null && !Number.isNaN(c);

const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const soDigitos = (s) => String(s || '').replace(/\D/g, '');

function mascaraCPF(v) {
  const d = soDigitos(v).slice(0, 11);
  return d.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
}
function mascaraTelefone(v) {
  const d = soDigitos(v).slice(0, 11);
  if (d.length <= 2) return d.length ? '(' + d : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/* Datas: "chave do dia" = AAAA-MM-DD no horário local */
function chaveDia(data) {
  const d = new Date(data);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const hojeChave = () => chaveDia(new Date());
function dataDeChave(k) { const [a, m, d] = k.split('-').map(Number); return new Date(a, m - 1, d, 12); }
const hora = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const dataCurta = (iso) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
const nomeDia = (k) => dataDeChave(k).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }).replace('.', '');

let toastTimer;
function toast(msg, tipo) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast mostrar' + (tipo === 'erro' ? ' erro' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = 'toast'; }, 4000);
}

/* Barrinhas: começam vazias e "crescem" até o tamanho certo */
function barra(pct, cor) {
  const p = Math.max(0, Math.min(100, pct || 0));
  return `<div class="barra${cor ? ' ' + cor : ''}" role="presentation"><span data-largura="${p.toFixed(1)}"></span></div>`;
}
function animarBarras(raiz) {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    (raiz || document).querySelectorAll('.barra span[data-largura]').forEach((s) => { s.style.width = s.dataset.largura + '%'; });
  }));
}
const pctDe = (v, total) => (total > 0 ? (v / total) * 100 : 0);
const pctTexto = (v, total) => (total > 0 ? Math.round((v / total) * 100) + '%' : '');

/* Pergunta de confirmação dentro da própria página (funciona em qualquer lugar,
   inclusive onde as caixinhas do navegador são bloqueadas). Resolve true/false. */
function perguntar(texto, opcoes) {
  return abrirPergunta(texto, Object.assign({ campo: false }, opcoes)).then((r) => r !== null);
}
/* Pede um texto (ex.: novo nome). Resolve o texto ou null se cancelar. */
function pedirTexto(texto, valor) {
  return abrirPergunta(texto, { campo: true, valor: valor || '', sim: 'Salvar' });
}
function abrirPergunta(texto, { campo, valor, sim }) {
  const dlg = $('#dlg-pergunta');
  const [titulo, ...resto] = String(texto).split('\n\n');
  $('#pergunta-texto').textContent = titulo;
  $('#pergunta-detalhe').textContent = resto.join(' ');
  $('#pergunta-detalhe').hidden = !resto.length;
  const input = $('#pergunta-campo');
  input.hidden = !campo;
  input.value = valor || '';
  $('#pergunta-sim').textContent = sim || 'Sim';
  if (finalizarPergunta) finalizarPergunta(null); // fecha uma pergunta anterior que ficou aberta
  return new Promise((resolve) => {
    let feito = false;
    // responde direto pelos botões (não depende do aviso de "fechou" do navegador, que às vezes não chega)
    const terminar = (valor) => {
      if (feito) return;
      feito = true;
      if (finalizarPergunta === terminar) finalizarPergunta = null;
      $('#form-pergunta').onsubmit = null;
      dlg.oncancel = null;
      if (dlg.open) dlg.close();
      resolve(valor);
    };
    finalizarPergunta = terminar;
    $('#form-pergunta').onsubmit = (e) => {
      e.preventDefault();
      terminar(campo ? input.value : true);
    };
    dlg.oncancel = () => terminar(null); // tecla Esc
    dlg.addEventListener('close', () => terminar(null), { once: true });
    dlg.showModal();
    (campo ? input : $('#pergunta-sim')).focus();
  });
}
let finalizarPergunta = null;
function fecharDialogo(dl) {
  if (dl && dl.id === 'dlg-pergunta' && finalizarPergunta) finalizarPergunta(null);
  else if (dl) dl.close();
}

/* Redesenha uma parte da tela sem tirar o cursor do campo em que a pessoa estava */
function redesenharMantendoFoco(fn) {
  const ae = document.activeElement;
  const chave = ae && ae.dataset ? ae.dataset.foco : null;
  fn();
  if (chave) {
    const el = document.querySelector(`[data-foco="${chave}"]`);
    if (el) el.focus();
  }
}

/* ---------- Dados ---------- */
function funcionamentoVazio() {
  return { configurado: false, desde: null, dias: DIAS_SEMANA.map(() => ({ abre: false, inicio: '', fim: '' })) };
}

function estadoInicial() {
  return {
    versao: 2,
    // Item de EXEMPLO: o Gabriel troca pelo cardápio real dele.
    // Com a nuvem ligada, começa vazio (o cardápio vem da nuvem). Sem nuvem, mostra um EXEMPLO para trocar.
    cardapio: window.NUVEM_CONFIG ? [] : [{ id: uid(), nome: 'Espetinho de carne', preco: 1200, custo: null, exemplo: true }],
    clientes: [],
    vendas: [],
    gastos: [],
    tiposGasto: [],
    perdas: [],
    funcionamento: funcionamentoVazio(),
    ultimaCopia: null
  };
}

function dadosValidos(d) {
  return d && typeof d === 'object' &&
    Array.isArray(d.cardapio) && Array.isArray(d.clientes) &&
    Array.isArray(d.vendas) && Array.isArray(d.gastos);
}

/* Completa dados antigos com o que falta (versões anteriores do sistema) */
function normalizar(d) {
  const n = Object.assign(estadoInicial(), d);
  if (!Array.isArray(n.tiposGasto)) n.tiposGasto = [];
  if (!Array.isArray(n.perdas)) n.perdas = [];
  if (!n.funcionamento || !Array.isArray(n.funcionamento.dias) || n.funcionamento.dias.length !== 7) {
    n.funcionamento = funcionamentoVazio();
  }
  n.gastos.forEach((g) => {
    if (!g.tipoId) {
      const nome = (g.tipoNome || g.descricao || 'Outros').trim();
      let t = n.tiposGasto.find((x) => semAcento(x.nome) === semAcento(nome));
      if (!t) { t = { id: uid(), nome }; n.tiposGasto.push(t); }
      g.tipoId = t.id;
      g.tipoNome = t.nome;
      if (g.obs == null) g.obs = '';
      delete g.descricao;
    }
  });
  n.versao = 2;
  return n;
}

let armazenamentoOk = true;
function carregar() {
  try {
    localStorage.setItem('__teste', '1');
    localStorage.removeItem('__teste');
  } catch (e) { armazenamentoOk = false; }
  try {
    const txt = localStorage.getItem(CONFIG.chave);
    if (txt) {
      const d = JSON.parse(txt);
      if (dadosValidos(d)) return normalizar(d);
    }
  } catch (e) { /* dados corrompidos ou bloqueados: começa do zero */ }
  return estadoInicial();
}

function salvarLocal() {
  try {
    localStorage.setItem(CONFIG.chave, JSON.stringify(dados));
    return true;
  } catch (e) {
    toast('Atenção: não consegui salvar neste aparelho!', 'erro');
    return false;
  }
}

/* Salva no aparelho e, se a nuvem estiver ligada, manda para ela também */
function salvar() {
  const ok = salvarLocal();
  if (window.Nuvem && window.Nuvem.ativa) window.Nuvem.enviar(dados);
  return ok;
}

let dados = carregar();

/* ---------- Ponte com a nuvem (assets/nuvem.js) ---------- */
let renderPendente = false;
let renderTimer = null;
function agendarRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(() => {
    // não redesenha enquanto a pessoa digita num campo da lista ou com uma janela aberta
    const ae = document.activeElement;
    if (document.querySelector('dialog[open]') || (ae && ae.matches && ae.matches('[data-item-campo], [data-qtd]'))) {
      renderPendente = true;
      return;
    }
    renderPendente = false;
    redesenharMantendoFoco(renderAbaAtual);
  }, 80);
}
document.addEventListener('focusout', () => { if (renderPendente) agendarRender(); });
document.addEventListener('close', () => { if (renderPendente) agendarRender(); }, true);

window.App = {
  obterDados: () => dados,
  aplicarDaNuvem(nome, valor) {
    if (nome === 'config') {
      if (valor && valor.funcionamento) dados.funcionamento = valor.funcionamento;
    } else if (nome === 'cardapio') {
      dados.cardapio = valor.slice()
        .sort((a, b) => (a.ordem || 0) - (b.ordem || 0))
        .map((it) => { const c = Object.assign({}, it); delete c.ordem; return c; });
    } else if (COLECOES_APP.includes(nome)) {
      dados[nome] = valor.slice();
    }
    salvarLocal();
    agendarRender();
  },
  statusNuvem(texto, tipo) {
    const el = $('#status-nuvem');
    if (!el) return;
    el.hidden = false;
    el.textContent = texto;
    el.className = 'status-nuvem ' + (tipo || '');
    el.title = texto;
  },
  nuvemLigada(sim) {
    document.querySelectorAll('.so-nuvem').forEach((e) => { e.hidden = !sim; });
    document.querySelectorAll('.so-local').forEach((e) => { e.hidden = !!sim; });
  }
};
const COLECOES_APP = ['clientes', 'vendas', 'gastos', 'tiposGasto', 'perdas'];

/* ---------- Abas ---------- */
const ABAS = ['caixa', 'gastos', 'contas', 'cardapio', 'clientes'];
let abaAtual = 'caixa';
function abrirAba(nome, direcao) {
  if (!ABAS.includes(nome)) nome = 'caixa';
  abaAtual = nome;
  ABAS.forEach((a) => {
    const sec = $('#aba-' + a);
    sec.hidden = a !== nome;
    sec.classList.remove('vem-direita', 'vem-esquerda');
  });
  // ao arrastar o dedo, a tela nova entra pelo lado certo
  if (direcao) $('#aba-' + nome).classList.add(direcao > 0 ? 'vem-direita' : 'vem-esquerda');
  document.querySelectorAll('.aba-btn').forEach((b) => {
    if (b.dataset.aba === nome) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  try { localStorage.setItem(CONFIG.chave + '-aba', nome); } catch (e) {}
  renderAbaAtual();
  window.scrollTo({ top: 0, behavior: 'instant' });
}
function renderAbaAtual() {
  ({ caixa: renderCaixa, gastos: renderGastos, contas: renderContas, cardapio: renderCardapio, clientes: renderClientes })[abaAtual]();
}

/* ---------- Períodos ---------- */
function intervaloPeriodo(p) {
  const agora = new Date();
  const ini = (a, m, d) => new Date(a, m, d, 0, 0, 0, 0);
  const A = agora.getFullYear(), M = agora.getMonth(), D = agora.getDate();
  switch (p) {
    case 'hoje': return [ini(A, M, D), ini(A, M, D + 1)];
    case 'ontem': return [ini(A, M, D - 1), ini(A, M, D)];
    case 'semana': return [ini(A, M, D - 6), ini(A, M, D + 1)];
    case 'mes': return [ini(A, M, 1), ini(A, M + 1, 1)];
    case 'mespassado': return [ini(A, M - 1, 1), ini(A, M, 1)];
    default: return [new Date(0), new Date(8640000000000000)];
  }
}
const noPeriodo = (data, [a, b]) => { const d = new Date(data); return d >= a && d < b; };
// gastos e perdas guardam só o dia (AAAA-MM-DD); usa meio-dia para não errar por fuso
const diaNoPeriodo = (k, faixa) => noPeriodo(dataDeChave(k), faixa);
const valorPerda = (p) => (p.custo == null ? 0 : p.custo * p.qtd);

/* ---------- Gasto que dura vários dias (carvão, gás…) ----------
   O valor é dividido pelos dias de uso (dias que a loja abre ou que teve venda),
   do dia da compra até o dia que acabou. Enquanto está em uso: se já tem histórico
   ("costuma durar 5 dias"), cada dia conta valor ÷ 5; sem histórico, divide pelos dias até hoje. */
const nomeGasto = (g) => g.tipoNome || 'Gasto';
const chaveNome = (n) => semAcento(String(n || '').trim());
const diaAntes = (k) => { const d = dataDeChave(k); d.setDate(d.getDate() - 1); return chaveDia(d); };
let diasComVenda = null; // cache por desenho de tela
function diasDeUso(ini, fim) {
  if (!diasComVenda) diasComVenda = new Set(dados.vendas.map((v) => chaveDia(v.data)));
  const f = dados.funcionamento;
  const lista = [];
  const ult = dataDeChave(fim);
  for (const d = dataDeChave(ini); d <= ult; d.setDate(d.getDate() + 1)) {
    const k = chaveDia(d);
    if (!f.configurado || f.dias[d.getDay()].abre || diasComVenda.has(k)) lista.push(k);
  }
  return lista.length ? lista : [ini];
}
function duracaoMedia(nome, exceto) {
  const fechados = dados.gastos.filter((g) => g.dura && g.acabou && g.id !== exceto && chaveNome(nomeGasto(g)) === chaveNome(nome));
  if (!fechados.length) return 0;
  return Math.round(fechados.reduce((s, g) => s + diasDeUso(g.dia, g.acabou).length, 0) / fechados.length);
}
function infoUso(g) {
  const hoje = hojeChave();
  const dias = diasDeUso(g.dia, g.acabou || (hoje > g.dia ? hoje : g.dia));
  const media = g.acabou ? 0 : duracaoMedia(nomeGasto(g), g.id);
  const divisor = g.acabou ? dias.length : Math.max(dias.length, media || dias.length);
  return { dias, media, divisor, porDia: Math.round(g.valor / divisor) };
}
/* Quanto do gasto entra em cada dia: [[dia, centavos], …] */
function parcelasGasto(g) {
  if (!g.dura) return [[g.dia, g.valor]];
  const { dias, divisor } = infoUso(g);
  const base = Math.floor(g.valor / divisor);
  let resto = g.valor - base * divisor;
  return dias.map((k) => { let v = base; if (resto > 0) { v++; resto--; } return [k, v]; });
}

/* Junta tudo que aconteceu em cada dia do período */
function movimentoPorDia(faixa) {
  const mapa = new Map();
  const dia = (k) => {
    if (!mapa.has(k)) mapa.set(k, { entradas: 0, nVendas: 0, qtd: 0, custo: 0, semCusto: 0, gastos: 0, perdas: 0 });
    return mapa.get(k);
  };
  dados.vendas.forEach((v) => {
    if (!noPeriodo(v.data, faixa)) return;
    const r = dia(chaveDia(v.data));
    r.entradas += v.total;
    r.nVendas += 1;
    v.itens.forEach((it) => {
      r.qtd += it.qtd;
      if (it.custo == null) r.semCusto += it.qtd;
      else r.custo += it.custo * it.qtd;
    });
  });
  dados.gastos.forEach((g) => parcelasGasto(g).forEach(([k, v]) => { if (diaNoPeriodo(k, faixa)) dia(k).gastos += v; }));
  dados.perdas.forEach((p) => { if (diaNoPeriodo(p.dia, faixa)) dia(p.dia).perdas += valorPerda(p); });
  mapa.forEach((r) => { r.resultado = r.entradas - r.custo - r.gastos - r.perdas; });
  return mapa;
}

function horarioDoDia(wd) {
  const d = dados.funcionamento.dias[wd];
  if (!d || !d.abre) return '';
  if (d.inicio && d.fim) return `${d.inicio} às ${d.fim}`;
  if (d.inicio) return `a partir das ${d.inicio}`;
  return '';
}

/* Lista os dias para o "dia a dia": dias que a loja abre + qualquer dia que teve movimento */
function listarDias(faixa) {
  const mov = movimentoPorDia(faixa);
  const chaves = new Set(mov.keys());
  const f = dados.funcionamento;
  if (f.configurado && f.dias.some((d) => d.abre)) {
    // começa no dia mais antigo entre: quando configurou e o primeiro registro
    const todas = [f.desde || hojeChave()]
      .concat(dados.vendas.map((v) => chaveDia(v.data)), dados.gastos.map((g) => g.dia), dados.perdas.map((p) => p.dia))
      .sort();
    const ref = dataDeChave(todas[0]);
    ref.setHours(0, 0, 0, 0);
    const amanha = new Date(); amanha.setHours(0, 0, 0, 0); amanha.setDate(amanha.getDate() + 1);
    const inicio = new Date(Math.max(faixa[0], ref));
    const fim = new Date(Math.min(faixa[1], amanha));
    for (const d = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate()); d < fim; d.setDate(d.getDate() + 1)) {
      if (f.dias[d.getDay()].abre) chaves.add(chaveDia(d));
    }
  }
  const vazio = { entradas: 0, nVendas: 0, qtd: 0, custo: 0, semCusto: 0, gastos: 0, perdas: 0, resultado: 0 };
  return [...chaves].sort().reverse().map((k) => {
    const wd = dataDeChave(k).getDay();
    return Object.assign({ chave: k, aberto: f.configurado ? f.dias[wd].abre : true, horario: horarioDoDia(wd) }, vazio, mov.get(k));
  });
}

function tagResultado(v) {
  if (v > 0) return `<span class="tag tag-lucro">Lucro</span>`;
  if (v < 0) return `<span class="tag tag-prejuizo">Prejuízo</span>`;
  return `<span class="tag tag-zero">Zerado</span>`;
}
const classeValor = (v) => (v > 0 ? 'lucro-pos' : v < 0 ? 'lucro-neg' : '');

/* ================= CAIXA ================= */
const pedido = new Map();   // id do item → quantidade
let formaPagamento = 'dinheiro';

function totalPedido() {
  let t = 0;
  pedido.forEach((qtd, id) => {
    const it = dados.cardapio.find((i) => i.id === id);
    if (it) t += it.preco * qtd;
  });
  return t;
}

function renderCaixa() {
  renderHoje();
  renderItens();
  renderPedido();
  renderSelectCliente();
}

function renderHoje() {
  const hoje = movimentoPorDia(intervaloPeriodo('hoje')).get(hojeChave()) || { entradas: 0, nVendas: 0, qtd: 0 };
  $('#hoje-resumo').innerHTML = `
    <span class="pilula">Hoje: ${fmt(hoje.entradas)}</span>
    <span class="pilula">${plural(hoje.nVendas, 'venda', 'vendas')} · ${plural(hoje.qtd, 'espetinho', 'espetinhos')}</span>`;
  const f = dados.funcionamento;
  const wd = new Date().getDay();
  let txt = '';
  if (f.configurado) {
    txt = f.dias[wd].abre
      ? `Hoje (${DIAS_SEMANA[wd].toLowerCase()}) é dia de abrir${horarioDoDia(wd) ? ': ' + horarioDoDia(wd) : ''}.`
      : `Hoje (${DIAS_SEMANA[wd].toLowerCase()}) está marcado como fechado. Se vender, conta do mesmo jeito.`;
  }
  $('#hoje-status').textContent = txt;
  $('#hoje-status').hidden = !txt;
}

function renderItens() {
  const grade = $('#itens-grade');
  if (!dados.cardapio.length) {
    grade.innerHTML = '<p class="vazio">Nenhum espetinho cadastrado. <button type="button" class="btn btn-secundario btn-pequeno" data-ir="cardapio">Cadastrar no Cardápio</button></p>';
    return;
  }
  grade.innerHTML = dados.cardapio.map((it) => {
    const q = pedido.get(it.id) || 0;
    return `<button type="button" class="item${q ? ' no-pedido' : ''}" data-add="${it.id}" aria-pressed="${q ? 'true' : 'false'}"
        aria-label="${esc(it.nome)}, ${fmt(it.preco)}${q ? ', ' + q + ' no pedido. Toque para tirar' : ''}">
        <span class="item-nome">${esc(it.nome)}</span>
        <span class="item-preco">${fmt(it.preco)}</span>
        ${it.exemplo ? '<span class="selo-exemplo">EXEMPLO</span>' : ''}
        ${q ? `<span class="item-qtd" aria-hidden="true">${q}</span>` : ''}
      </button>`;
  }).join('');
}

function renderPedido() {
  pedido.forEach((_, id) => { if (!dados.cardapio.some((i) => i.id === id)) pedido.delete(id); });
  const linhas = [];
  pedido.forEach((qtd, id) => {
    const it = dados.cardapio.find((i) => i.id === id);
    linhas.push(`<li class="pedido-linha">
      <span class="pedido-nome">${esc(it.nome)}</span>
      <span class="qtd-ctrl">
        <button type="button" data-menos="${id}" aria-label="Tirar um ${esc(it.nome)}">−</button>
        <input class="qtd-input" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="3" autocomplete="off"
          value="${qtd}" data-qtd="${id}" data-foco="qtd-${id}" aria-label="Quantidade de ${esc(it.nome)} (toque para digitar)">
        <button type="button" data-mais="${id}" aria-label="Pôr mais um ${esc(it.nome)}">+</button>
      </span>
      <span class="pedido-sub" data-sub="${id}">${qtd} × ${fmt(it.preco)} = <strong>${fmt(it.preco * qtd)}</strong></span>
    </li>`);
  });
  $('#pedido-lista').innerHTML = linhas.join('');
  $('#pedido-vazio').hidden = pedido.size > 0;
  $('#pedido-total').textContent = fmt(totalPedido());
  renderTroco();
}

/* Quantidade digitada no teclado (campo entre o − e o +) */
function digitarQuantidade(input) {
  const id = input.dataset.qtd;
  const it = dados.cardapio.find((i) => i.id === id);
  input.value = input.value.replace(/\D/g, '').slice(0, 3);
  const n = parseInt(input.value, 10);
  if (!it || !n) return; // vazio ou zero: decide quando sair do campo
  pedido.set(id, n);
  // atualiza só os números, sem redesenhar o campo (para não fechar o teclado)
  const sub = document.querySelector(`[data-sub="${id}"]`);
  if (sub) sub.innerHTML = `${n} × ${fmt(it.preco)} = <strong>${fmt(it.preco * n)}</strong>`;
  $('#pedido-total').textContent = fmt(totalPedido());
  renderItens();
  renderTroco();
}
function terminarQuantidade(input) {
  const id = input.dataset.qtd;
  const n = parseInt(input.value, 10);
  if (n) { input.value = String(n); return; } // números já atualizados enquanto digitava
  // vazio ou zero: tira do pedido
  pedido.delete(id);
  renderItens();
  renderPedido();
  toast('Espetinho tirado do pedido.');
}

/* Pagamento dividido: lê quanto vai em cada forma (dinheiro, Pix, cartão) */
function lerPartes() {
  const partes = {};
  let invalido = false;
  let soma = 0;
  FORMAS_BASE.forEach((f) => {
    const v = paraCentavos($('#parte-' + f).value);
    if (Number.isNaN(v)) invalido = true;
    else if (v) { partes[f] = v; soma += v; }
  });
  return { partes, soma, invalido };
}

function calcularDividido(total) {
  const { partes, soma, invalido } = lerPartes();
  if (invalido) return { ok: false, invalido: true };
  if (!soma) return { ok: false, vazioDividido: true };
  if (soma < total) return { ok: false, falta: total - soma };
  if (soma > total) return { ok: false, passou: soma - total };
  if (Object.keys(partes).length < 2) return { ok: false, umaSo: true };
  // troco só da parte em dinheiro (opcional)
  const emDinheiro = partes.dinheiro || 0;
  const deu = paraCentavos($('#dividido-deu').value);
  if (Number.isNaN(deu)) return { ok: false, invalido: true };
  if (deu === null || !emDinheiro) return { ok: true, partes, pago: total, troco: 0 };
  if (deu < emDinheiro) return { ok: false, faltaDinheiro: emDinheiro - deu };
  return { ok: true, partes, pago: total - emDinheiro + deu, troco: deu - emDinheiro };
}

/* Preenche uma forma com o que falta para fechar o total */
function preencherResto(forma) {
  const total = totalPedido();
  let outros = 0;
  FORMAS_BASE.forEach((f) => {
    if (f === forma) return;
    const v = paraCentavos($('#parte-' + f).value);
    if (v && !Number.isNaN(v)) outros += v;
  });
  $('#parte-' + forma).value = centavosParaCampo(Math.max(0, total - outros));
  renderTroco();
}

/* Calcula o troco. */
function calcularTroco() {
  const total = totalPedido();
  if (formaPagamento === 'dividido') return calcularDividido(total);
  if (formaPagamento !== 'dinheiro') return { ok: true, pago: total, troco: 0 };
  const pago = paraCentavos($('#pago').value);
  if (pago === null) return { ok: true, pago: total, troco: 0, vazio: true };
  if (Number.isNaN(pago)) return { ok: false, invalido: true };
  if (pago < total) return { ok: false, pago, falta: total - pago };
  return { ok: true, pago, troco: pago - total };
}

function renderTroco() {
  const total = totalPedido();
  const box = $('#troco');
  $('#bloco-dinheiro').hidden = formaPagamento !== 'dinheiro';
  $('#bloco-dividido').hidden = formaPagamento !== 'dividido';
  document.querySelectorAll('.atalho').forEach((b) => {
    const v = b.dataset.valor;
    b.classList.toggle('insuficiente', v !== 'exato' && Number(v) < total);
  });
  const r = calcularTroco();
  if (formaPagamento === 'dividido') {
    const st = $('#dividido-status');
    const { partes } = lerPartes();
    $('#dividido-deu-box').hidden = !partes.dinheiro;
    if (total === 0) { st.className = 'troco'; st.innerHTML = ''; }
    else if (r.invalido) { st.className = 'troco falta'; st.innerHTML = '<span>Valor não entendido. Use só números, ex.: 10 ou 10,50</span>'; }
    else if (r.vazioDividido) { st.className = 'troco neutro'; st.innerHTML = `<span>Coloque quanto vai em cada forma. Toque em <strong>Resto</strong> para completar sozinho.</span>`; }
    else if (r.falta) { st.className = 'troco falta'; st.innerHTML = `<span>Falta dividir</span><strong>${fmt(r.falta)}</strong>`; }
    else if (r.passou) { st.className = 'troco falta'; st.innerHTML = `<span>Passou do total</span><strong>${fmt(r.passou)}</strong>`; }
    else if (r.umaSo) { st.className = 'troco neutro'; st.innerHTML = '<span>Está tudo numa forma só. Divida entre duas ou escolha a forma lá em cima.</span>'; }
    else if (r.faltaDinheiro) { st.className = 'troco falta'; st.innerHTML = `<span>Faltou em dinheiro</span><strong>${fmt(r.faltaDinheiro)}</strong>`; }
    else { st.className = 'troco ok'; st.innerHTML = r.troco ? `<span>Fechou! Troco</span><strong>${fmt(r.troco)}</strong>` : `<span>Fechou certinho</span><strong>✓</strong>`; }
    box.className = 'troco'; box.innerHTML = '';
  } else if (formaPagamento !== 'dinheiro' || total === 0) {
    box.className = 'troco'; box.innerHTML = '';
  } else if (r.invalido) {
    box.className = 'troco falta'; box.innerHTML = '<span>Valor digitado não entendido. Use só números, ex.: 20 ou 20,50</span>';
  } else if (r.vazio) {
    box.className = 'troco neutro'; box.innerHTML = '<span>Digite quanto o cliente deu para ver o troco. Se deixar vazio, conta como valor exato.</span>';
  } else if (!r.ok) {
    box.className = 'troco falta'; box.innerHTML = `<span>Falta</span><strong>${fmt(r.falta)}</strong>`;
  } else {
    box.className = 'troco ok'; box.innerHTML = `<span>Troco</span><strong>${fmt(r.troco)}</strong>`;
  }
  $('#btn-confirmar').disabled = total === 0 || !r.ok;
}

function renderSelectCliente() {
  const sel = $('#venda-cliente');
  const atual = sel.value;
  const ordenados = [...dados.clientes].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  sel.innerHTML = '<option value="">Sem cliente (venda no balcão)</option>' +
    ordenados.map((c) => `<option value="${c.id}">${esc(c.nome)}${c.telefone ? ' · ' + esc(c.telefone) : ''}</option>`).join('');
  sel.value = dados.clientes.some((c) => c.id === atual) ? atual : '';
  renderInfoCliente();
}

function renderInfoCliente() {
  const box = $('#venda-cliente-info');
  const c = dados.clientes.find((x) => x.id === $('#venda-cliente').value);
  if (!c) { box.hidden = true; box.innerHTML = ''; return; }
  box.hidden = false;
  box.innerHTML = `
    ${c.telefone ? `<p><a class="tel" href="tel:${soDigitos(c.telefone)}">${esc(c.telefone)}</a></p>` : ''}
    ${c.endereco ? `<p>${esc(c.endereco)}</p>` : '<p class="falta-info">Sem endereço cadastrado</p>'}
    ${c.referencia ? `<p class="mini">Ref.: ${esc(c.referencia)}</p>` : ''}
    ${c.obs ? `<p class="mini">${esc(c.obs)}</p>` : ''}`;
}

function confirmarVenda() {
  const total = totalPedido();
  const r = calcularTroco();
  if (!total || !r.ok) return;
  const cli = dados.clientes.find((c) => c.id === $('#venda-cliente').value);
  const itens = [];
  pedido.forEach((qtd, id) => {
    const it = dados.cardapio.find((i) => i.id === id);
    itens.push({ itemId: it.id, nome: it.nome, preco: it.preco, custo: it.custo, qtd });
  });
  dados.vendas.push({
    id: uid(), data: new Date().toISOString(), itens, total,
    forma: formaPagamento, pago: r.pago, troco: r.troco,
    partes: formaPagamento === 'dividido' ? r.partes : null,
    clienteId: cli ? cli.id : null, clienteNome: cli ? cli.nome : null
  });
  salvar();
  const msg = r.troco > 0
    ? `Venda salva · troco ${fmt(r.troco)}`
    : formaPagamento === 'dividido'
      ? `Venda salva · ${fmt(total)} dividido`
      : `Venda salva · ${fmt(total)} no ${FORMAS[formaPagamento]}`;
  limparPedido();
  renderHoje();
  toast(msg);
}

function limparPedido() {
  pedido.clear();
  $('#pago').value = '';
  FORMAS_BASE.forEach((f) => { $('#parte-' + f).value = ''; });
  $('#dividido-deu').value = '';
  $('#venda-cliente').value = '';
  $('.cliente-entrega').open = false;
  setForma('dinheiro');
  renderItens();
  renderPedido();
  renderInfoCliente();
}

function setForma(f) {
  formaPagamento = f;
  document.querySelectorAll('.seg').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.forma === f)));
  renderTroco();
}

/* ================= GASTOS ================= */
function renderGastos() {
  diasComVenda = null;
  renderSugestoesGasto();
  renderSelectPerda();
  renderListaGastos();
}

/* Sugestões do que já foi anotado antes (o mais recente primeiro). Nada é fixo. */
function nomesUsados() {
  const vistos = new Map();
  dados.gastos.slice().sort((a, b) => (b.dia + (b.criadoEm || '')).localeCompare(a.dia + (a.criadoEm || '')))
    .forEach((g) => { const k = chaveNome(nomeGasto(g)); if (!vistos.has(k)) vistos.set(k, g); });
  return vistos;
}
function renderSugestoesGasto() {
  $('#gasto-sugestoes').innerHTML = [...nomesUsados().values()].slice(0, 30)
    .map((g) => `<option value="${esc(nomeGasto(g))}"></option>`).join('');
}
function aoDigitarNomeGasto() {
  const g = nomesUsados().get(chaveNome($('#gasto-nome').value));
  if (g) $('#gasto-dura').checked = !!g.dura; // se da última vez durou vários dias, já marca
}

function lancarGasto(e) {
  e.preventDefault();
  const erro = $('#gasto-erro');
  let nome = $('#gasto-nome').value.trim().replace(/\s+/g, ' ');
  const valor = paraCentavos($('#gasto-valor').value);
  const dia = $('#gasto-data').value || hojeChave();
  const dura = $('#gasto-dura').checked;
  if (!nome) { erro.textContent = 'Escreva o que foi (ex.: carvão).'; $('#gasto-nome').focus(); return; }
  if (!valorOk(valor) || valor <= 0) { erro.textContent = 'Coloque o valor do gasto (ex.: 35,90).'; $('#gasto-valor').focus(); return; }
  erro.textContent = '';
  const igual = nomesUsados().get(chaveNome(nome));
  nome = igual ? nomeGasto(igual) : nome.charAt(0).toUpperCase() + nome.slice(1);

  // comprou de novo algo que ainda estava "em uso": o anterior acabou no dia antes desta compra
  let fechou = 0;
  if (dura) {
    dados.gastos.forEach((g) => {
      if (g.dura && !g.acabou && chaveNome(nomeGasto(g)) === chaveNome(nome) && g.dia <= dia) {
        const dias = g.dia < dia ? diasDeUso(g.dia, diaAntes(dia)) : [g.dia];
        g.acabou = dias[dias.length - 1];
        fechou++;
      }
    });
  }
  dados.gastos.push({ id: uid(), tipoNome: nome, obs: $('#gasto-obs').value.trim(), valor, dia, dura, acabou: null, criadoEm: new Date().toISOString() });
  salvar();
  $('#gasto-nome').value = '';
  $('#gasto-valor').value = '';
  $('#gasto-obs').value = '';
  $('#gasto-dura').checked = false;
  renderGastos();
  toast(fechou ? `${nome} novo anotado. O anterior foi marcado como acabado.` : `Gasto de ${fmt(valor)} com ${nome} anotado.`);
}

async function marcarAcabou(id) {
  const g = dados.gastos.find((x) => x.id === id);
  if (!g) return;
  const hoje = hojeChave();
  if (!(await perguntar(`${nomeGasto(g)} acabou hoje?\n\nO valor de ${fmt(g.valor)} fica dividido pelos dias que ele foi usado.`))) return;
  g.acabou = hoje < g.dia ? g.dia : hoje;
  salvar();
  renderAbaAtual();
  const n = diasDeUso(g.dia, g.acabou).length;
  toast(`Durou ${plural(n, 'dia', 'dias')}: ${fmt(Math.round(g.valor / n))} por dia.`);
}

function desfazerAcabou(id) {
  const g = dados.gastos.find((x) => x.id === id);
  if (!g) return;
  g.acabou = null;
  salvar();
  renderAbaAtual();
  toast(`${nomeGasto(g)} voltou para "em uso".`);
}

function renderSelectPerda() {
  const sel = $('#perda-item');
  const atual = sel.value;
  if (!dados.cardapio.length) {
    sel.innerHTML = '<option value="">Cadastre espetinhos no Cardápio primeiro</option>';
  } else {
    sel.innerHTML = dados.cardapio.map((it) => `<option value="${it.id}">${esc(it.nome)}${it.custo != null ? ' (custo ' + fmt(it.custo) + ')' : ' (sem custo)'}</option>`).join('');
    if (dados.cardapio.some((i) => i.id === atual)) sel.value = atual;
  }
  atualizarValorPerda();
}

function atualizarValorPerda() {
  const it = dados.cardapio.find((i) => i.id === $('#perda-item').value);
  const qtd = Math.max(0, parseInt($('#perda-qtd').value, 10) || 0);
  const el = $('#perda-valor');
  if (!it || !qtd) { el.innerHTML = ''; return; }
  el.innerHTML = it.custo == null
    ? '<span class="falta-info">Esse espetinho está sem custo. A perda vai contar como R$ 0. Coloque o custo no Cardápio.</span>'
    : `Perda de <strong class="lucro-neg">${fmt(it.custo * qtd)}</strong> (${qtd} × ${fmt(it.custo)}).`;
}

function registrarPerda(e) {
  e.preventDefault();
  const erro = $('#perda-erro');
  const it = dados.cardapio.find((i) => i.id === $('#perda-item').value);
  const qtd = parseInt($('#perda-qtd').value, 10);
  const dia = $('#perda-data').value || hojeChave();
  if (!it) { erro.textContent = 'Escolha o espetinho.'; return; }
  if (!qtd || qtd < 1) { erro.textContent = 'Coloque a quantidade (1 ou mais).'; $('#perda-qtd').focus(); return; }
  erro.textContent = '';
  dados.perdas.push({ id: uid(), dia, itemId: it.id, nome: it.nome, custo: it.custo, qtd, obs: $('#perda-obs').value.trim(), criadoEm: new Date().toISOString() });
  salvar();
  $('#perda-qtd').value = '1';
  $('#perda-obs').value = '';
  renderGastos();
  toast(`Perda de ${qtd} ${it.nome} registrada.`);
}

/* Gastos separados: um bloco para cada coisa (carvão, gás…), cada um com seus lançamentos */
const gruposAbertos = new Set();
const dataBR = (k) => dataDeChave(k).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }).replace('.', '');

function textoUso(g) {
  const u = infoUso(g);
  if (g.acabou) return `durou ${plural(u.dias.length, 'dia', 'dias')} · ${fmt(u.porDia)} por dia`;
  return `em uso, ${u.dias.length}º dia${u.media ? ` (costuma durar ${u.media})` : ''} · ${fmt(u.porDia)} por dia`;
}

function renderListaGastos() {
  const faixa = intervaloPeriodo($('#periodo-gastos').value);
  const perdas = dados.perdas.filter((p) => diaNoPeriodo(p.dia, faixa));

  const grupos = new Map();
  dados.gastos.forEach((g) => {
    // quanto deste gasto conta no período (gasto de vários dias entra só a parte dos dias do período)
    const conta = parcelasGasto(g).reduce((s, [k, v]) => s + (diaNoPeriodo(k, faixa) ? v : 0), 0);
    if (!conta && !diaNoPeriodo(g.dia, faixa)) return;
    const k = 'nome-' + chaveNome(nomeGasto(g));
    if (!grupos.has(k)) grupos.set(k, { chave: k, nome: nomeGasto(g), total: 0, itens: [] });
    const gr = grupos.get(k);
    gr.total += conta;
    const extra = g.dura
      ? `<p class="mini">${textoUso(g)}</p><div class="botoes-linha">${g.acabou
        ? `<button type="button" class="btn btn-leve btn-pequeno" data-desfazer-acabou="${g.id}">Ainda não acabou</button>`
        : `<button type="button" class="btn btn-secundario btn-pequeno" data-acabou="${g.id}">Acabou</button>`}</div>`
      : '';
    gr.itens.push({ dia: g.dia, criado: g.criadoEm || '', valor: g.valor, texto: g.obs || '', extra, excluir: `data-excluir-gasto="${g.id}"` });
  });
  if (perdas.length) {
    const gr = { chave: 'perdas', nome: 'Espetinhos perdidos', total: 0, itens: [] };
    perdas.forEach((p) => {
      gr.total += valorPerda(p);
      gr.itens.push({ dia: p.dia, criado: p.criadoEm || '', valor: valorPerda(p), texto: `${p.qtd}× ${p.nome}${p.obs ? ' · ' + p.obs : ''}${p.custo == null ? ' (sem custo)' : ''}`, extra: '', excluir: `data-excluir-perda="${p.id}"` });
    });
    grupos.set(gr.chave, gr);
  }

  // em uso agora (sempre aparece, para tocar em "Acabou" sem procurar)
  const emUso = dados.gastos.filter((g) => g.dura && !g.acabou);
  const blocoUso = emUso.length ? `<div class="em-uso"><p class="passo">Em uso agora</p><ul>${emUso.map((g) => `<li>
      <div class="info"><p><strong>${esc(nomeGasto(g))}</strong> · ${fmt(g.valor)}</p><p class="mini">${textoUso(g)}</p></div>
      <button type="button" class="btn btn-secundario btn-pequeno" data-acabou="${g.id}">Acabou</button>
    </li>`).join('')}</ul></div>` : '';

  const lista = [...grupos.values()].sort((a, b) => b.total - a.total);
  const total = lista.reduce((s, g) => s + g.total, 0);
  const box = $('#gastos-grupos');
  if (!lista.length) {
    box.innerHTML = blocoUso + '<p class="vazio">Nada anotado nesse período.</p>';
    return;
  }
  box.innerHTML = blocoUso + lista.map((gr) => {
    gr.itens.sort((a, b) => (b.dia + b.criado).localeCompare(a.dia + a.criado));
    return `<details class="grupo-gasto" data-grupo="${esc(gr.chave)}" ${gruposAbertos.has(gr.chave) ? 'open' : ''}>
      <summary>
        <span class="gg-linha"><span class="gg-nome">${esc(gr.nome)}</span><span class="gg-valor">${fmt(gr.total)}</span></span>
        ${barra(pctDe(gr.total, total), 'vermelha')}
        <span class="gg-info"><span>${plural(gr.itens.length, 'compra', 'compras')}</span><span>${pctTexto(gr.total, total)} do total</span></span>
      </summary>
      <ul>${gr.itens.map((i) => `<li>
        <div class="info"><p><strong>${dataBR(i.dia)}</strong>${i.texto ? ' · ' + esc(i.texto) : ''}</p>${i.extra}</div>
        <div class="lado"><span class="valor-saida">${fmt(i.valor)}</span>
          <button type="button" class="btn btn-perigo btn-pequeno" ${i.excluir} aria-label="Excluir este gasto">Excluir</button></div>
      </li>`).join('')}</ul>
    </details>`;
  }).join('') + `<div class="soma-total"><span>Somando tudo</span><strong>${fmt(total)}</strong></div>` +
    (dados.gastos.some((g) => g.dura) ? '<p class="dica">Gastos de vários dias entram aqui só com a parte dos dias deste período.</p>' : '');
  animarBarras(box);
}

async function excluirGasto(id) {
  const g = dados.gastos.find((x) => x.id === id);
  if (!g || !(await perguntar(`Excluir o gasto "${g.tipoNome}" de ${fmt(g.valor)}?`))) return;
  dados.gastos = dados.gastos.filter((x) => x.id !== id);
  salvar();
  renderAbaAtual();
  toast('Gasto excluído.');
}

async function excluirPerda(id) {
  const p = dados.perdas.find((x) => x.id === id);
  if (!p || !(await perguntar(`Excluir a perda de ${p.qtd}× ${p.nome}?`))) return;
  dados.perdas = dados.perdas.filter((x) => x.id !== id);
  salvar();
  renderAbaAtual();
  toast('Perda excluída.');
}

/* ================= CONTAS ================= */
function renderContas() {
  diasComVenda = null;
  const periodo = $('#periodo').value;
  const faixa = intervaloPeriodo(periodo);
  const mov = movimentoPorDia(faixa);

  const tot = { entradas: 0, nVendas: 0, qtd: 0, custo: 0, semCusto: 0, gastos: 0, perdas: 0 };
  mov.forEach((r) => Object.keys(tot).forEach((k) => { tot[k] += r[k]; }));
  const resultado = tot.entradas - tot.custo - tot.gastos - tot.perdas;

  const saiu = tot.custo + tot.gastos + tot.perdas;
  $('#resumo').innerHTML = `
    <div class="bloco-num entrou"><span>Entrou</span><strong>${fmt(tot.entradas)}</strong><small>${plural(tot.nVendas, 'venda', 'vendas')} · ${plural(tot.qtd, 'espetinho', 'espetinhos')}</small></div>
    <div class="bloco-num saiu"><span>Saiu</span><strong>${fmt(saiu)}</strong><small>custos, gastos e perdas</small></div>
    <div class="bloco-num destaque${resultado < 0 ? ' negativo' : ''}"><span>${resultado < 0 ? 'Prejuízo' : 'Lucro'}</span><strong>${fmt(Math.abs(resultado))}</strong><small>entrou menos saiu</small></div>`;

  renderParaOnde(faixa, tot);
  renderDias(faixa);
  renderPorForma(faixa);
  renderEspetinhosContas(faixa);
  renderVendas(faixa, periodo);
  renderFuncionamento();
  renderAvisoCopia();

  const avisoF = $('#aviso-funcionamento');
  avisoF.hidden = dados.funcionamento.configurado;
  avisoF.innerHTML = '<span>Falta marcar os dias que a loja abre.</span> <button type="button" class="btn-link" data-rolar="form-funcionamento">Marcar</button>';
}

function renderDias(faixa) {
  const dias = listarDias(faixa);
  const box = $('#dias');
  if (!dias.length) {
    box.innerHTML = '<p class="vazio">Nenhum dia com movimento nesse período.</p>';
    return;
  }
  const hoje = hojeChave();
  const statusDia = (d) => (!d.aberto ? '<span class="tag tag-fechado">Dia fechado</span>' : d.horario ? esc(d.horario) : '');
  const saidas = (d) => d.custo + d.gastos + d.perdas;

  const tabela = `<div class="tabela-wrap tabela-dias"><table>
    <thead><tr><th scope="col">Dia</th><th scope="col">Horário</th><th scope="col">Vendas</th><th scope="col">Entrou</th><th scope="col">Custos e gastos</th><th scope="col">Resultado</th></tr></thead>
    <tbody>${dias.map((d) => `<tr class="${d.chave === hoje ? 'dia-hoje' : ''}">
      <td><strong>${nomeDia(d.chave)}</strong></td>
      <td>${statusDia(d)}</td>
      <td>${d.nVendas}</td>
      <td>${fmt(d.entradas)}</td>
      <td>${fmt(saidas(d))}</td>
      <td>${tagResultado(d.resultado)} <span class="${classeValor(d.resultado)}">${fmt(Math.abs(d.resultado))}</span></td>
    </tr>`).join('')}</tbody></table></div>`;

  const lista = `<ul class="dias-mobile">${dias.map((d) => `<li>
      <div class="linha1"><strong>${nomeDia(d.chave)}${d.chave === hoje ? ' · hoje' : ''}</strong>
        <span>${tagResultado(d.resultado)} <span class="${classeValor(d.resultado)}">${fmt(Math.abs(d.resultado))}</span></span></div>
      <div class="linha2"><span>${statusDia(d) || plural(d.nVendas, 'venda', 'vendas')}</span>
        <span>Entrou ${fmt(d.entradas)} · Saiu ${fmt(saidas(d))}</span></div>
    </li>`).join('')}</ul>`;

  // resumo dos dias (não conta hoje se ainda não teve movimento)
  const contados = dias.filter((d) => d.chave !== hoje || d.nVendas || d.gastos || d.perdas);
  const comLucro = contados.filter((d) => d.resultado > 0).length;
  const comPrejuizo = contados.filter((d) => d.resultado < 0).length;
  const totalEntr = contados.reduce((s, d) => s + d.entradas, 0);
  const melhor = contados.reduce((m, d) => (!m || d.entradas > m.entradas ? d : m), null);
  const rodape = contados.length ? `<div class="rodape-tabela">
      <span>Dias contados: <strong>${contados.length}</strong></span>
      <span>Média por dia: <strong>${fmt(Math.round(totalEntr / contados.length))}</strong></span>
      <span>Dias com lucro: <strong class="lucro-pos">${comLucro}</strong></span>
      <span>Dias com prejuízo: <strong class="lucro-neg">${comPrejuizo}</strong></span>
      ${melhor && melhor.entradas ? `<span>Melhor dia: <strong>${nomeDia(melhor.chave)} (${fmt(melhor.entradas)})</strong></span>` : ''}
    </div>` : '';

  box.innerHTML = tabela + lista + rodape;
}

function renderPorForma(faixa) {
  const porForma = { dinheiro: 0, pix: 0, cartao: 0 };
  let divididas = 0;
  dados.vendas.forEach((v) => {
    if (!noPeriodo(v.data, faixa)) return;
    if (v.forma === 'dividido') divididas++;
    const p = partesDaVenda(v);
    Object.keys(p).forEach((f) => { porForma[f] = (porForma[f] || 0) + p[f]; });
  });
  const total = porForma.dinheiro + porForma.pix + porForma.cartao;
  const box = $('#por-forma');
  box.innerHTML = `<ul class="para-onde">${FORMAS_BASE.map((f) => `<li>
      <div class="po-linha"><span class="po-nome">${FORMAS[f]}</span><span class="po-valor">${fmt(porForma[f])}<small>${pctTexto(porForma[f], total)}</small></span></div>
      ${barra(pctDe(porForma[f], total), 'verde')}
    </li>`).join('')}</ul>
    ${divididas ? `<p class="dica">Inclui ${plural(divididas, 'venda dividida', 'vendas divididas')}: cada parte entrou na sua forma.</p>` : ''}`;
  animarBarras(box);
}

/* Cada saída separada: custo dos espetinhos, cada tipo de gasto e as perdas. Soma no final. */
function renderParaOnde(faixa, tot) {
  const porTipo = new Map();
  dados.gastos.forEach((g) => {
    const v = parcelasGasto(g).reduce((s, [k, x]) => s + (diaNoPeriodo(k, faixa) ? x : 0), 0);
    if (!v) return;
    const chave = chaveNome(nomeGasto(g));
    const r = porTipo.get(chave) || { nome: nomeGasto(g), valor: 0, vezes: 0, dura: false };
    r.valor += v; r.vezes += 1; r.dura = r.dura || !!g.dura;
    porTipo.set(chave, r);
  });
  const linhas = [];
  if (tot.custo || tot.qtd) {
    linhas.push({ nome: 'Custo dos espetinhos', sub: tot.semCusto ? `<span class="falta-info">${tot.semCusto} vendidos sem custo cadastrado</span>` : plural(tot.qtd, 'espetinho', 'espetinhos'), valor: tot.custo });
  }
  [...porTipo.entries()].sort((a, b) => b[1].valor - a[1].valor)
    .forEach(([, r]) => linhas.push({ nome: esc(r.nome), sub: r.dura ? 'dividido pelos dias de uso' : plural(r.vezes, 'vez', 'vezes'), valor: r.valor }));
  if (tot.perdas) linhas.push({ nome: 'Perdas', sub: 'estragou ou caiu', valor: tot.perdas });

  const total = tot.custo + tot.gastos + tot.perdas;
  const box = $('#para-onde');
  if (!linhas.length) {
    box.innerHTML = '<p class="vazio">Nenhum gasto nesse período. Anote os gastos na aba <button type="button" class="btn btn-secundario btn-pequeno" data-ir="gastos">Gastos</button></p>';
    return;
  }
  box.innerHTML = `<ul class="para-onde">${linhas.map((l) => `<li>
      <div class="po-linha"><span class="po-nome">${l.nome}<small>${l.sub}</small></span><span class="po-valor">${fmt(l.valor)}<small>${pctTexto(l.valor, total)}</small></span></div>
      ${barra(pctDe(l.valor, total), 'vermelha')}
    </li>`).join('')}</ul>
    <div class="soma-total"><span>Somando tudo que saiu</span><strong>${fmt(total)}</strong></div>`;
  animarBarras(box);
}

function renderEspetinhosContas(faixa) {
  const vendidos = new Map();
  dados.vendas.forEach((v) => {
    if (!noPeriodo(v.data, faixa)) return;
    v.itens.forEach((it) => {
      const k = it.itemId || it.nome;
      const r = vendidos.get(k) || { nome: it.nome, qtd: 0, lucro: 0, semCusto: false };
      r.qtd += it.qtd;
      if (it.custo == null) r.semCusto = true; else r.lucro += (it.preco - it.custo) * it.qtd;
      vendidos.set(k, r);
    });
  });

  const linhas = dados.cardapio.map((it) => {
    const v = vendidos.get(it.id);
    vendidos.delete(it.id);
    const lucroUn = it.custo == null ? null : it.preco - it.custo;
    return `<tr>
      <td>${esc(it.nome)}${it.exemplo ? ' <span class="selo-exemplo">EXEMPLO</span>' : ''}</td>
      <td>${fmt(it.preco)}</td>
      <td><label class="sr-only" for="custo-c-${it.id}">Custo de ${esc(it.nome)}</label>
        <input id="custo-c-${it.id}" class="input-tabela" type="text" inputmode="decimal" placeholder="0,00"
          value="${centavosParaCampo(it.custo)}" data-item-campo="custo" data-id="${it.id}" data-foco="c-custo-${it.id}"></td>
      <td>${lucroUn == null ? '<span class="falta-info">falta custo</span>' : `<span class="${classeValor(lucroUn)}">${fmt(lucroUn)}</span>`}</td>
      <td>${v ? v.qtd : 0}</td>
      <td>${!v ? fmt(0) : v.semCusto ? '<span class="falta-info" title="Vendido quando estava sem custo">?</span>' : `<span class="${classeValor(v.lucro)}">${fmt(v.lucro)}</span>`}</td>
    </tr>`;
  });
  // vendidos que já saíram do cardápio
  vendidos.forEach((v) => linhas.push(`<tr><td>${esc(v.nome)} <span class="mini">(fora do cardápio)</span></td><td>—</td><td>—</td><td>—</td><td>${v.qtd}</td>
    <td>${v.semCusto ? '<span class="falta-info">?</span>' : `<span class="${classeValor(v.lucro)}">${fmt(v.lucro)}</span>`}</td></tr>`));

  $('#espetinhos-contas').innerHTML = linhas.length
    ? `<div class="tabela-wrap"><table>
        <thead><tr><th scope="col">Espetinho</th><th scope="col">Preço</th><th scope="col">Custo (R$)</th><th scope="col">Lucro por um</th><th scope="col">Vendidos</th><th scope="col">Lucro no período</th></tr></thead>
        <tbody>${linhas.join('')}</tbody></table></div>
        <p class="dica">"?" = vendido quando ainda estava sem custo cadastrado. O preço muda na aba Cardápio.</p>`
    : '<p class="vazio">Nenhum espetinho no cardápio.</p>';
}

function renderVendas(faixa, periodo) {
  const vendas = dados.vendas.filter((v) => noPeriodo(v.data, faixa));
  const mostrarData = periodo !== 'hoje' && periodo !== 'ontem';
  $('#vendas-lista').innerHTML = vendas.length
    ? [...vendas].sort((a, b) => b.data.localeCompare(a.data)).map((v) => `<li>
        <div class="info">
          <p><strong>${mostrarData ? dataCurta(v.data) + ' ' : ''}${hora(v.data)}</strong> · ${textoForma(v)}${v.clienteNome ? ' · ' + esc(v.clienteNome) : ''}</p>
          <p class="mini">${v.itens.map((i) => `${i.qtd}× ${esc(i.nome)}`).join(', ')}</p>
          ${v.troco > 0 ? `<p class="mini">Pagou ${fmt(v.pago)} · troco ${fmt(v.troco)}</p>` : ''}
        </div>
        <div class="lado"><span class="valor-entrada">${fmt(v.total)}</span>
          <button type="button" class="btn btn-perigo btn-pequeno" data-desfazer="${v.id}">Desfazer</button></div>
      </li>`).join('')
    : '<li class="vazio">Nenhuma venda nesse período.</li>';
}

async function desfazerVenda(id) {
  const v = dados.vendas.find((x) => x.id === id);
  if (!v || !(await perguntar(`Desfazer a venda de ${fmt(v.total)} das ${hora(v.data)}?\n\nEla vai sair das contas.`))) return;
  dados.vendas = dados.vendas.filter((x) => x.id !== id);
  salvar();
  renderContas();
  toast('Venda desfeita.');
}

/* ---------- Dias e horário de funcionamento ---------- */
function renderFuncionamento() {
  const f = dados.funcionamento;
  $('#func-dias').innerHTML = ORDEM_SEMANA.map((wd) => {
    const d = f.dias[wd];
    return `<div class="func-linha">
      <label class="abre"><input type="checkbox" data-func-abre="${wd}" ${d.abre ? 'checked' : ''}> ${DIAS_SEMANA[wd]}</label>
      <div class="func-horas">
        <label class="sr-only" for="func-ini-${wd}">Abre às (${DIAS_SEMANA[wd]})</label>
        <input type="time" id="func-ini-${wd}" value="${esc(d.inicio)}" ${d.abre ? '' : 'disabled'}>
        <span>às</span>
        <label class="sr-only" for="func-fim-${wd}">Fecha às (${DIAS_SEMANA[wd]})</label>
        <input type="time" id="func-fim-${wd}" value="${esc(d.fim)}" ${d.abre ? '' : 'disabled'}>
      </div>
    </div>`;
  }).join('');
}

function salvarFuncionamento(e) {
  e.preventDefault();
  const f = dados.funcionamento;
  for (let wd = 0; wd < 7; wd++) {
    const abre = $(`[data-func-abre="${wd}"]`).checked;
    f.dias[wd] = { abre, inicio: $(`#func-ini-${wd}`).value, fim: $(`#func-fim-${wd}`).value };
  }
  f.configurado = true;
  if (!f.desde) f.desde = hojeChave();
  salvar();
  renderContas();
  const n = f.dias.filter((d) => d.abre).length;
  toast(n ? `Salvo: a loja abre ${plural(n, 'dia', 'dias')} por semana.` : 'Salvo: nenhum dia marcado.');
}

/* ---------- Cópia de segurança ---------- */
function renderAvisoCopia() {
  const el = $('#ultima-copia');
  const aviso = $('#aviso-copia');
  el.textContent = dados.ultimaCopia
    ? 'Última cópia baixada em ' + new Date(dados.ultimaCopia).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) + '.'
    : 'Nenhuma cópia baixada ainda neste aparelho.';
  const temDados = dados.vendas.length || dados.clientes.length || dados.gastos.length;
  const dias = dados.ultimaCopia ? (Date.now() - new Date(dados.ultimaCopia)) / 864e5 : Infinity;
  if (temDados && dias >= CONFIG.diasLembreteCopia) {
    aviso.hidden = false;
    aviso.innerHTML = `${dados.ultimaCopia ? `Faz ${Math.floor(dias)} dias que você não baixa uma cópia.` : 'Você ainda não baixou nenhuma cópia dos dados.'}
      Lá embaixo tem o botão <strong>Baixar cópia de segurança</strong>.`;
  } else {
    aviso.hidden = true;
  }
}

async function baixarCopia() {
  const nome = `tio-brasa-copia-${hojeChave()}.json`;
  const conteudo = JSON.stringify(dados, null, 2);
  // Dentro da página do Claude o download passa pelo próprio Claude (ele pede para confirmar)
  const claudeDl = window.claude && window.claude.use ? await window.claude.use('downloads').catch(() => null) : null;
  if (claudeDl) {
    try {
      await claudeDl.save({ filename: nome, data: conteudo });
      dados.ultimaCopia = new Date().toISOString();
      salvar();
      renderAvisoCopia();
      toast('Cópia salva. Guarde o arquivo num lugar seguro.');
    } catch (e) {
      if (e && e.code === 'declined') toast('Cópia cancelada.');
      else toast('Não deu para baixar a cópia aqui.', 'erro');
    }
    return;
  }
  dados.ultimaCopia = new Date().toISOString();
  salvar();
  const blob = new Blob([conteudo], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  renderAvisoCopia();
  toast('Cópia baixada. Guarde o arquivo num lugar seguro.');
}

function restaurarCopia(file) {
  if (!file) return;
  const leitor = new FileReader();
  leitor.onload = async () => {
    let d;
    try { d = JSON.parse(leitor.result); } catch (e) { d = null; }
    if (!dadosValidos(d)) { toast('Esse arquivo não é uma cópia válida do sistema.', 'erro'); return; }
    const resumo = `${d.vendas.length} vendas, ${d.clientes.length} clientes, ${d.cardapio.length} espetinhos e ${d.gastos.length} gastos`;
    if (!(await perguntar(`Restaurar esta cópia (${resumo})?\n\nATENÇÃO: os dados que estão agora neste aparelho serão SUBSTITUÍDOS pelos da cópia.`))) return;
    dados = normalizar(d);
    salvar();
    pedido.clear();
    renderAbaAtual();
    toast('Cópia restaurada.');
  };
  leitor.onerror = () => toast('Não consegui ler o arquivo.', 'erro');
  leitor.readAsText(file);
}

/* ================= CARDÁPIO ================= */
function textoLucro(preco, custo) {
  if (custo == null) return '<span class="falta-info">Coloque o custo para ver o lucro</span>';
  const l = preco - custo;
  return `Lucro por espetinho: <span class="${l >= 0 ? 'lucro-pos' : 'lucro-neg'}">${fmt(l)}</span>`;
}

function renderCardapio() {
  const ul = $('#cardapio-lista');
  if (!dados.cardapio.length) {
    ul.innerHTML = '<li class="vazio">Nenhum espetinho ainda. Toque em <strong>+ Novo espetinho</strong>.</li>';
    return;
  }
  ul.innerHTML = dados.cardapio.map((it, i) => `<li class="${it.exemplo ? 'exemplo' : ''}">
      ${it.exemplo ? '<span class="selo-exemplo">EXEMPLO · troque pelo seu</span>' : ''}
      <div class="campos-item">
        <div class="campo campo-nome">
          <label for="nome-${it.id}">Nome</label>
          <input id="nome-${it.id}" type="text" maxlength="60" value="${esc(it.nome)}" data-item-campo="nome" data-id="${it.id}" data-foco="nome-${it.id}">
        </div>
        <div class="campo">
          <label for="preco-${it.id}">Preço de venda (R$)</label>
          <input id="preco-${it.id}" type="text" inputmode="decimal" value="${centavosParaCampo(it.preco)}" data-item-campo="preco" data-id="${it.id}" data-foco="preco-${it.id}">
        </div>
        <div class="campo">
          <label for="custo-${it.id}">Custo para fazer (R$)</label>
          <input id="custo-${it.id}" type="text" inputmode="decimal" placeholder="0,00" value="${centavosParaCampo(it.custo)}" data-item-campo="custo" data-id="${it.id}" data-foco="custo-${it.id}">
        </div>
      </div>
      <p class="lucro-txt">${textoLucro(it.preco, it.custo)}</p>
      <div class="acoes">
        <button type="button" class="btn btn-leve btn-pequeno" data-subir="${it.id}" ${i === 0 ? 'disabled' : ''} aria-label="Mover ${esc(it.nome)} para cima">↑ Subir</button>
        <button type="button" class="btn btn-leve btn-pequeno" data-descer="${it.id}" ${i === dados.cardapio.length - 1 ? 'disabled' : ''} aria-label="Mover ${esc(it.nome)} para baixo">↓ Descer</button>
        <button type="button" class="btn btn-perigo btn-pequeno" data-excluir-item="${it.id}">Excluir</button>
      </div>
    </li>`).join('');
}

/* Salva quando a pessoa muda nome, preço ou custo direto no campo (Cardápio ou Contas) */
function alterarCampoItem(input) {
  const it = dados.cardapio.find((x) => x.id === input.dataset.id);
  if (!it) return;
  const campo = input.dataset.itemCampo;
  if (campo === 'nome') {
    const nome = input.value.trim();
    if (!nome) { input.value = it.nome; toast('O nome não pode ficar vazio.', 'erro'); return; }
    it.nome = nome;
  } else if (campo === 'preco') {
    const v = paraCentavos(input.value);
    if (!valorOk(v) || v <= 0) { input.value = centavosParaCampo(it.preco); toast('Preço não entendido. Use números, ex.: 12 ou 12,50', 'erro'); return; }
    it.preco = v;
  } else if (campo === 'custo') {
    const v = paraCentavos(input.value);
    if (Number.isNaN(v)) { input.value = centavosParaCampo(it.custo); toast('Custo não entendido. Use números, ex.: 6,50', 'erro'); return; }
    it.custo = v;
  }
  it.exemplo = false;
  salvar();
  redesenharMantendoFoco(renderAbaAtual);
  toast('Salvo ✓');
}

function abrirFormItem() {
  $('#item-nome').value = '';
  $('#item-preco').value = '';
  $('#item-custo').value = '';
  $('#item-erro').textContent = '';
  atualizarLucroForm();
  $('#dlg-item').showModal();
  $('#item-nome').focus();
}

function atualizarLucroForm() {
  const p = paraCentavos($('#item-preco').value);
  const c = paraCentavos($('#item-custo').value);
  const el = $('#item-lucro');
  if (!valorOk(p) || Number.isNaN(c)) { el.innerHTML = ''; return; }
  el.innerHTML = textoLucro(p, c);
}

function salvarItem(e) {
  e.preventDefault();
  const nome = $('#item-nome').value.trim();
  const preco = paraCentavos($('#item-preco').value);
  const custo = paraCentavos($('#item-custo').value);
  const erro = $('#item-erro');
  if (!nome) { erro.textContent = 'Coloque o nome do espetinho.'; $('#item-nome').focus(); return; }
  if (!valorOk(preco) || preco <= 0) { erro.textContent = 'Coloque o preço de venda (ex.: 12 ou 12,50).'; $('#item-preco').focus(); return; }
  if (Number.isNaN(custo)) { erro.textContent = 'O custo não foi entendido. Use só números (ex.: 6,50) ou deixe vazio.'; $('#item-custo').focus(); return; }
  dados.cardapio.push({ id: uid(), nome, preco, custo, exemplo: false });
  salvar();
  $('#dlg-item').close();
  renderCardapio();
  toast('Espetinho adicionado.');
}

async function excluirItem(id) {
  const it = dados.cardapio.find((x) => x.id === id);
  if (!it || !(await perguntar(`Tirar "${it.nome}" do cardápio?\n\nAs vendas que já foram feitas continuam nas contas.`))) return;
  dados.cardapio = dados.cardapio.filter((x) => x.id !== id);
  pedido.delete(id);
  salvar();
  renderCardapio();
  toast('Espetinho retirado do cardápio.');
}

function moverItem(id, dir) {
  const i = dados.cardapio.findIndex((x) => x.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= dados.cardapio.length) return;
  [dados.cardapio[i], dados.cardapio[j]] = [dados.cardapio[j], dados.cardapio[i]];
  salvar();
  renderCardapio();
}

/* ================= CLIENTES ================= */
let clienteEditando = null;

function renderClientes() {
  const termo = semAcento($('#busca-cliente').value.trim());
  const termoDig = soDigitos(termo);
  const lista = [...dados.clientes]
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    .filter((c) => {
      if (!termo) return true;
      const texto = semAcento([c.nome, c.endereco, c.referencia, c.obs, c.telefone].join(' '));
      if (texto.includes(termo)) return true;
      return termoDig.length >= 3 && (soDigitos(c.telefone).includes(termoDig) || soDigitos(c.cpf).includes(termoDig));
    });
  const ul = $('#clientes-lista');
  if (!dados.clientes.length) { ul.innerHTML = '<li class="vazio">Nenhum cliente cadastrado ainda. Toque em <strong>+ Novo cliente</strong>.</li>'; return; }
  if (!lista.length) { ul.innerHTML = '<li class="vazio">Nenhum cliente encontrado nessa busca.</li>'; return; }
  ul.innerHTML = lista.map((c) => `<li>
      <h3>${esc(c.nome)}</h3>
      ${c.telefone ? `<p><a class="tel" href="tel:${soDigitos(c.telefone)}">${esc(c.telefone)}</a></p>` : ''}
      ${c.endereco ? `<p>${esc(c.endereco)}</p>` : ''}
      ${c.referencia ? `<p><span class="rotulo-linha">Referência:</span> ${esc(c.referencia)}</p>` : ''}
      ${c.obs ? `<p><span class="rotulo-linha">Obs.:</span> ${esc(c.obs)}</p>` : ''}
      <div class="acoes">
        <button type="button" class="btn btn-primario btn-pequeno" data-vender="${c.id}">Vender</button>
        <button type="button" class="btn btn-leve btn-pequeno" data-editar-cli="${c.id}">Editar</button>
        <button type="button" class="btn btn-perigo btn-pequeno" data-excluir-cli="${c.id}">Excluir</button>
      </div>
    </li>`).join('');
}

function abrirFormCliente(id) {
  clienteEditando = id || null;
  const c = dados.clientes.find((x) => x.id === id) || {};
  $('#dlg-cliente-titulo').textContent = id ? 'Editar cliente' : 'Novo cliente';
  $('#cli-nome').value = c.nome || '';
  $('#cli-telefone').value = c.telefone || '';
  $('#cli-endereco').value = c.endereco || '';
  $('#cli-referencia').value = c.referencia || '';
  $('#cli-obs').value = c.obs || '';
  $('#cli-cpf').value = c.cpf || '';
  $('#cli-erro').textContent = '';
  $('#dlg-cliente').showModal();
  $('#cli-nome').focus();
}

function salvarCliente(e) {
  e.preventDefault();
  const nome = $('#cli-nome').value.trim();
  const cpf = $('#cli-cpf').value.trim();
  const tel = $('#cli-telefone').value.trim();
  if (!nome) { $('#cli-erro').textContent = 'Coloque o nome do cliente.'; $('#cli-nome').focus(); return; }
  if (cpf && soDigitos(cpf).length !== 11) { $('#cli-erro').textContent = 'O CPF precisa ter 11 números (ou deixe vazio).'; $('#cli-cpf').focus(); return; }
  if (tel && soDigitos(tel).length < 10) { $('#cli-erro').textContent = 'O telefone precisa do DDD + número (ou deixe vazio).'; $('#cli-telefone').focus(); return; }
  const campos = {
    nome, cpf, telefone: tel,
    endereco: $('#cli-endereco').value.trim(),
    referencia: $('#cli-referencia').value.trim(),
    obs: $('#cli-obs').value.trim()
  };
  if (clienteEditando) Object.assign(dados.clientes.find((c) => c.id === clienteEditando), campos);
  else dados.clientes.push(Object.assign({ id: uid(), criadoEm: new Date().toISOString() }, campos));
  salvar();
  $('#dlg-cliente').close();
  renderClientes();
  toast(clienteEditando ? 'Cliente atualizado.' : 'Cliente cadastrado.');
}

async function excluirCliente(id) {
  const c = dados.clientes.find((x) => x.id === id);
  if (!c || !(await perguntar(`Excluir o cadastro de "${c.nome}"?\n\nAs vendas antigas continuam nas contas, só com o nome dele.`))) return;
  dados.clientes = dados.clientes.filter((x) => x.id !== id);
  salvar();
  renderClientes();
  toast('Cliente excluído.');
}

/* ================= EVENTOS ================= */
let diaAtual = hojeChave();

function atualizarData() {
  $('#topo-data').textContent = new Date().toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
}

/* Quando vira o dia com o sistema aberto, atualiza tudo sozinho */
function verificarVirada() {
  const agora = hojeChave();
  if (agora === diaAtual) return;
  ['#gasto-data', '#perda-data'].forEach((s) => { if (!$(s).value || $(s).value === diaAtual) $(s).value = agora; });
  diaAtual = agora;
  atualizarData();
  if (!document.querySelector('dialog[open]')) renderAbaAtual();
}

function iniciar() {
  document.title = CONFIG.nomeLoja + ' · Caixa';
  $('#nome-loja').textContent = CONFIG.nomeLoja;
  atualizarData();
  $('#aviso-armazenamento').hidden = armazenamentoOk;
  $('#gasto-data').value = hojeChave();
  $('#perda-data').value = hojeChave();
  salvar(); // grava a versão atualizada dos dados

  document.querySelectorAll('.aba-btn').forEach((b) => b.addEventListener('click', () => abrirAba(b.dataset.aba)));

  // Cliques em botões (delegação)
  document.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    const d = t.dataset;
    if (d.ir) abrirAba(d.ir);
    else if (d.add) {
      // Toque no espetinho: marca (1 no pedido) ou desmarca (tira do pedido).
      // A quantidade muda só no + e − do pedido.
      const id = d.add;
      if (pedido.has(id)) pedido.delete(id); else pedido.set(id, 1);
      renderItens(); renderPedido();
      const badge = document.querySelector(`[data-add="${id}"] .item-qtd`);
      if (badge) badge.classList.add('pop');
    }
    else if (d.mais) {
      pedido.set(d.mais, (pedido.get(d.mais) || 0) + 1);
      renderItens(); renderPedido();
    }
    else if (d.menos) {
      const q = (pedido.get(d.menos) || 0) - 1;
      if (q > 0) pedido.set(d.menos, q); else pedido.delete(d.menos);
      renderItens(); renderPedido();
    }
    else if (d.vender) { abrirAba('caixa'); $('#venda-cliente').value = d.vender; $('.cliente-entrega').open = true; renderInfoCliente(); toast('Cliente escolhido. Agora toque nos espetinhos.'); }
    else if (d.editarCli) abrirFormCliente(d.editarCli);
    else if (d.excluirCli) excluirCliente(d.excluirCli);
    else if (d.excluirItem) excluirItem(d.excluirItem);
    else if (d.subir) moverItem(d.subir, -1);
    else if (d.descer) moverItem(d.descer, 1);
    else if (d.acabou) marcarAcabou(d.acabou);
    else if (d.desfazerAcabou) desfazerAcabou(d.desfazerAcabou);
    else if (d.excluirGasto) excluirGasto(d.excluirGasto);
    else if (d.excluirPerda) excluirPerda(d.excluirPerda);
    else if (d.desfazer) desfazerVenda(d.desfazer);
    else if (d.rolar) { const el = document.getElementById(d.rolar); const det = el.closest('details'); if (det) det.open = true; el.scrollIntoView({ behavior: 'smooth', block: 'center' }); const c = el.querySelector('input'); if (c) c.focus({ preventScroll: true }); }
    else if ('fechar' in d) fecharDialogo(t.closest('dialog'));
  });

  // Campos editáveis direto na lista (nome, preço, custo)
  document.addEventListener('change', (e) => {
    if (e.target.matches('[data-item-campo]')) alterarCampoItem(e.target);
    if (e.target.matches('[data-func-abre]')) {
      const wd = e.target.dataset.funcAbre;
      $(`#func-ini-${wd}`).disabled = !e.target.checked;
      $(`#func-fim-${wd}`).disabled = !e.target.checked;
    }
  });
  // Enter num campo da lista salva e sai do campo
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('[data-item-campo], [data-qtd]')) { e.preventDefault(); e.target.blur(); }
  });

  // Quantidade digitada no pedido
  document.addEventListener('input', (e) => { if (e.target.matches('[data-qtd]')) digitarQuantidade(e.target); });
  // ao tocar no número, ele fica todo selecionado: o que digitar substitui (não junta com o número antigo)
  document.addEventListener('focusin', (e) => { if (e.target.matches('[data-qtd]')) setTimeout(() => e.target.select(), 0); });
  document.addEventListener('pointerup', (e) => { if (e.target.matches('[data-qtd]')) { e.preventDefault(); e.target.select(); } });
  document.addEventListener('focusout', (e) => { if (e.target.matches('[data-qtd]')) terminarQuantidade(e.target); });

  // Celular: arrastar o dedo para o lado troca de tela.
  // A tela acompanha o dedo; ao soltar, ela é "jogada" para o lado e a próxima entra deslizando.
  let arr = null;
  const main = $('#conteudo');
  const limparArraste = (sec) => { sec.style.transition = ''; sec.style.transform = ''; sec.style.opacity = ''; sec.style.animation = ''; };
  main.addEventListener('touchstart', (e) => {
    // não arrasta se o dedo começou numa tabela que rola de lado, num campo ou numa fileira de botões
    if (e.touches.length !== 1 || document.querySelector('dialog[open]') ||
        e.target.closest('.tabela-wrap, input, select, textarea, .chips, .atalhos, .segmentos, .qtd-ctrl')) { arr = null; return; }
    arr = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now(), modo: null, sec: null, dx: 0 };
  }, { passive: true });
  main.addEventListener('touchmove', (e) => {
    if (!arr) return;
    const dx = e.touches[0].clientX - arr.x;
    const dy = e.touches[0].clientY - arr.y;
    if (!arr.modo) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      arr.modo = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'lado' : 'rolar';
      if (arr.modo === 'lado') {
        arr.sec = $('#aba-' + abaAtual);
        arr.sec.classList.remove('vem-direita', 'vem-esquerda');
        arr.sec.style.animation = 'none';
        arr.sec.style.transition = 'none';
      }
    }
    if (arr.modo !== 'lado') return;
    e.preventDefault();
    const i = ABAS.indexOf(abaAtual);
    const temProxima = dx < 0 ? i < ABAS.length - 1 : i > 0;
    const desloc = temProxima ? dx : dx * 0.25; // nas pontas, a tela "resiste"
    arr.dx = dx;
    arr.sec.style.transform = `translateX(${desloc}px)`;
    arr.sec.style.opacity = String(1 - Math.min(Math.abs(desloc) / window.innerWidth, 1) * 0.6);
  }, { passive: false });
  const soltar = () => {
    if (!arr || arr.modo !== 'lado') { arr = null; return; }
    const { sec, dx, t } = arr;
    arr = null;
    const i = ABAS.indexOf(abaAtual);
    const prox = dx < 0 ? i + 1 : i - 1;
    const velocidade = Math.abs(dx) / Math.max(1, Date.now() - t);
    const passou = Math.abs(dx) > window.innerWidth * 0.28 || (Math.abs(dx) > 40 && velocidade > 0.45);
    if (passou && prox >= 0 && prox < ABAS.length) {
      sec.style.transition = 'transform .2s ease-in, opacity .2s ease-in';
      sec.style.transform = `translateX(${dx < 0 ? -100 : 100}%)`;
      sec.style.opacity = '0';
      setTimeout(() => { limparArraste(sec); abrirAba(ABAS[prox], dx < 0 ? 1 : -1); }, 190);
    } else {
      sec.style.transition = 'transform .3s cubic-bezier(.22,.8,.3,1), opacity .3s';
      sec.style.transform = 'translateX(0)';
      sec.style.opacity = '1';
      setTimeout(() => limparArraste(sec), 320);
    }
  };
  main.addEventListener('touchend', soltar, { passive: true });
  main.addEventListener('touchcancel', soltar, { passive: true });

  // Caixa
  document.querySelectorAll('.seg').forEach((b) => b.addEventListener('click', () => setForma(b.dataset.forma)));
  $('#pago').addEventListener('input', renderTroco);
  // Pagamento dividido
  document.querySelectorAll('[data-parte]').forEach((i) => i.addEventListener('input', renderTroco));
  $('#dividido-deu').addEventListener('input', renderTroco);
  document.querySelectorAll('[data-resto]').forEach((b) => b.addEventListener('click', () => preencherResto(b.dataset.resto)));
  document.querySelectorAll('.atalho').forEach((b) => b.addEventListener('click', () => {
    const v = b.dataset.valor === 'exato' ? totalPedido() : Number(b.dataset.valor);
    $('#pago').value = centavosParaCampo(v);
    renderTroco();
  }));
  $('#venda-cliente').addEventListener('change', renderInfoCliente);
  $('#btn-confirmar').addEventListener('click', confirmarVenda);
  $('#btn-limpar').addEventListener('click', async () => {
    if (pedido.size && !(await perguntar('Limpar o pedido atual?'))) return;
    limparPedido();
  });

  // Gastos
  $('#form-gasto').addEventListener('submit', lancarGasto);
  $('#gasto-nome').addEventListener('input', aoDigitarNomeGasto);
  $('#form-perda').addEventListener('submit', registrarPerda);
  $('#perda-item').addEventListener('change', atualizarValorPerda);
  $('#perda-qtd').addEventListener('input', atualizarValorPerda);
  $('#periodo-gastos').addEventListener('change', renderListaGastos);

  // Contas
  $('#periodo').addEventListener('change', renderContas);
  $('#form-funcionamento').addEventListener('submit', salvarFuncionamento);
  $('#btn-baixar').addEventListener('click', baixarCopia);
  $('#btn-restaurar').addEventListener('click', () => $('#arquivo-restaurar').click());
  $('#arquivo-restaurar').addEventListener('change', (e) => { restaurarCopia(e.target.files[0]); e.target.value = ''; });

  // Cardápio
  $('#btn-novo-item').addEventListener('click', abrirFormItem);
  $('#form-item').addEventListener('submit', salvarItem);
  $('#item-preco').addEventListener('input', atualizarLucroForm);
  $('#item-custo').addEventListener('input', atualizarLucroForm);

  // Clientes
  $('#btn-novo-cliente').addEventListener('click', () => abrirFormCliente());
  $('#busca-cliente').addEventListener('input', renderClientes);
  $('#form-cliente').addEventListener('submit', salvarCliente);
  $('#cli-cpf').addEventListener('input', (e) => { e.target.value = mascaraCPF(e.target.value); });
  $('#cli-telefone').addEventListener('input', (e) => { e.target.value = mascaraTelefone(e.target.value); });

  // Fechar diálogo tocando fora
  document.querySelectorAll('dialog').forEach((dlg) => dlg.addEventListener('click', (e) => { if (e.target === dlg) fecharDialogo(dlg); }));

  // Se os dados mudarem em outra aba do navegador, recarrega
  window.addEventListener('storage', (e) => {
    if (e.key === CONFIG.chave) { dados = carregar(); renderAbaAtual(); }
  });

  // Lembra quais grupos de gasto estão abertos
  document.addEventListener('toggle', (e) => {
    const g = e.target.dataset && e.target.dataset.grupo;
    if (!g) return;
    if (e.target.open) gruposAbertos.add(g); else gruposAbertos.delete(g);
  }, true);

  // Ao rolar a página, os cartões aparecem suavemente
  if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const obs = new IntersectionObserver((entradas) => {
      entradas.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('visivel'); obs.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -40px 0px', threshold: 0.05 });
    document.querySelectorAll('.aba .cartao, .aba .resumo').forEach((el) => { el.classList.add('revelar'); obs.observe(el); });
  }

  // Botão "voltar ao topo"
  const btnTopo = $('#btn-topo');
  const verTopo = () => btnTopo.classList.toggle('mostrar', window.scrollY > 500);
  window.addEventListener('scroll', verTopo, { passive: true });
  btnTopo.addEventListener('click', () => { window.scrollTo({ top: 0, behavior: 'smooth' }); $('#conteudo').focus({ preventScroll: true }); });

  // Virada do dia
  setInterval(verificarVirada, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) verificarVirada(); });

  abrirAba(ultimaAba());
}

function ultimaAba() {
  try { return localStorage.getItem(CONFIG.chave + '-aba') || 'caixa'; } catch (e) { return 'caixa'; }
}

/* ---------- Instalar como aplicativo (ícone na tela inicial) ---------- */
let pedidoInstalar = null;
function prepararApp() {
  // atualização automática e funcionar sem internet (só em endereço seguro: https ou localhost)
  const dentroDeOutraPagina = window.top !== window.self; // ex.: página do Claude
  if ('serviceWorker' in navigator && window.isSecureContext && !dentroDeOutraPagina) {
    navigator.serviceWorker.register('sw.js').then((reg) => {
      // app aberto há muito tempo: confere versão nova a cada 15 min e quando volta para a tela
      const conferir = () => reg.update().catch(() => {});
      setInterval(conferir, 15 * 60 * 1000);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) conferir(); });
    }).catch(() => {});
    // quando sair versão nova do sistema, recarrega sozinho uma vez
    let recarregou = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (recarregou || !navigator.serviceWorker.controller) return;
      recarregou = true;
      if (!document.querySelector('dialog[open]') && !pedido.size) location.reload();
    });
  }
  const jaInstalado = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    pedidoInstalar = e;
    $('#btn-instalar').hidden = false;
  });
  $('#btn-instalar').addEventListener('click', async () => {
    if (!pedidoInstalar) return;
    pedidoInstalar.prompt();
    await pedidoInstalar.userChoice;
    pedidoInstalar = null;
    $('#btn-instalar').hidden = true;
  });
  window.addEventListener('appinstalled', () => { $('#btn-instalar').hidden = true; toast('App instalado na tela inicial ✓'); });
  // iPhone não tem botão automático: mostra a dica de como instalar
  const iphone = /iphone|ipad|ipod/i.test(navigator.userAgent);
  $('#dica-instalar').hidden = jaInstalado;
  if (iphone) $('#dica-instalar-texto').innerHTML = 'No iPhone: abra no <strong>Safari</strong>, toque em <strong>Compartilhar</strong> (quadrado com seta) e depois em <strong>Adicionar à Tela de Início</strong>.';

  $('#btn-sair').addEventListener('click', async () => {
    if (!(await perguntar('Sair da conta da loja neste celular?\n\nPara entrar de novo vai precisar da senha.'))) return;
    if (window.Nuvem) window.Nuvem.sair();
  });
}

iniciar();
prepararApp();

/* Olhinho: mostra ou esconde a senha para conferir o que foi digitado */
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-ver-senha]');
  if (!b) return;
  const campo = document.getElementById(b.dataset.verSenha);
  if (!campo) return;
  const mostrar = campo.type === 'password';
  campo.type = mostrar ? 'text' : 'password';
  b.setAttribute('aria-pressed', String(mostrar));
  b.setAttribute('aria-label', mostrar ? 'Esconder a senha' : 'Mostrar a senha');
  b.title = mostrar ? 'Esconder a senha' : 'Mostrar a senha';
  campo.focus();
});
