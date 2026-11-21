/* Nuvem do Tio Espeto (Firebase) — Brazuka Web
   - Login único da loja (e-mail já preenchido; a equipe só digita a senha uma vez por celular).
   - Cada venda, gasto, cliente e espetinho vira um registro na nuvem. Mudança em um celular
     aparece nos outros em segundos. Sem internet, guarda no aparelho e envia quando voltar.
   - Se NUVEM_CONFIG estiver vazio (null), nada disso liga e o sistema fica só no aparelho. */

const cfg = window.NUVEM_CONFIG;
const VERSAO_SDK = '10.12.2';
const COLECOES = ['cardapio', 'clientes', 'vendas', 'gastos', 'tiposGasto', 'perdas'];

/* JSON com as chaves sempre na mesma ordem (para comparar o que mudou sem reenviar tudo) */
function estavel(v) {
  if (Array.isArray(v)) return '[' + v.map(estavel).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).filter((k) => v[k] !== undefined).sort()
      .map((k) => JSON.stringify(k) + ':' + estavel(v[k])).join(',') + '}';
  }
  return JSON.stringify(v === undefined ? null : v);
}

if (cfg && window.App) {
  iniciarNuvem().catch((e) => {
    console.error(e);
    window.App.statusNuvem('Não deu para ligar a nuvem. Salvando só neste aparelho.', 'erro');
  });
}

async function iniciarNuvem() {
  const App = window.App;
  const base = `https://www.gstatic.com/firebasejs/${VERSAO_SDK}/`;
  const [{ initializeApp }, A, F] = await Promise.all([
    import(base + 'firebase-app.js'),
    import(base + 'firebase-auth.js'),
    import(base + 'firebase-firestore.js')
  ]);

  const app = initializeApp(cfg);
  const auth = A.getAuth(app);
  let db;
  try {
    db = F.initializeFirestore(app, {
      ignoreUndefinedProperties: true,
      localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() })
    });
  } catch (e) {
    db = F.getFirestore(app);
  }
  const loja = window.NUVEM_LOJA || 'loja';
  const chaveSync = (uid) => `tio-espeto-nuvem-sincronizado-${uid}`;

  /* ---------- Tela de entrar ---------- */
  const tela = document.getElementById('tela-login');
  const form = document.getElementById('form-login');
  const campoEmail = document.getElementById('login-email');
  const campoSenha = document.getElementById('login-senha');
  const erro = document.getElementById('login-erro');
  const botao = document.getElementById('btn-entrar');
  if (window.NUVEM_EMAIL) campoEmail.value = window.NUVEM_EMAIL;

  const mensagens = {
    'auth/invalid-credential': 'Senha errada. Confira e tente de novo.',
    'auth/wrong-password': 'Senha errada. Confira e tente de novo.',
    'auth/user-not-found': 'Esse e-mail não está cadastrado.',
    'auth/invalid-email': 'E-mail inválido.',
    'auth/too-many-requests': 'Muitas tentativas. Espere um pouquinho e tente de novo.',
    'auth/network-request-failed': 'Sem internet. Conecte e tente de novo.'
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    erro.textContent = '';
    if (!campoSenha.value) { erro.textContent = 'Digite a senha da loja.'; campoSenha.focus(); return; }
    botao.disabled = true;
    botao.textContent = 'Entrando…';
    try {
      await A.signInWithEmailAndPassword(auth, campoEmail.value.trim(), campoSenha.value);
      campoSenha.value = '';
    } catch (err) {
      erro.textContent = mensagens[err.code] || 'Não deu para entrar. Tente de novo.';
    } finally {
      botao.disabled = false;
      botao.textContent = 'Entrar';
    }
  });

  window.Nuvem = {
    ativa: false,
    enviar,
    sair: () => A.signOut(auth)
  };
  App.nuvemLigada(true);

  A.onAuthStateChanged(auth, (user) => {
    if (user) {
      tela.hidden = true;
      document.body.classList.remove('sem-login');
      comecar(user);
    } else {
      parar();
      tela.hidden = false;
      document.body.classList.add('sem-login');
      setTimeout(() => (campoEmail.value ? campoSenha : campoEmail).focus(), 100);
    }
  });

  /* ---------- Sincronização ---------- */
  let ultimo = {};            // coleção → Map(id → JSON do que está na nuvem)
  let ultimoConfig = '';
  let desligar = [];

  function parar() {
    desligar.forEach((f) => f());
    desligar = [];
    window.Nuvem.ativa = false;
  }

  function comecar(user) {
    parar();
    ultimo = {};
    COLECOES.forEach((c) => { ultimo[c] = new Map(); });
    const primeiraVezAqui = !localStorage.getItem(chaveSync(user.uid));
    const iniciais = {};
    const doServidor = new Set();

    const aoReceber = (nome, valor, meta) => {
      if (primeiraVezAqui && !window.Nuvem.ativa) {
        // primeira vez neste celular: espera os dados da nuvem chegarem para juntar com os daqui
        iniciais[nome] = valor;
        if (!meta.fromCache) doServidor.add(nome);
        if (doServidor.size === COLECOES.length + 1) juntarPrimeiraVez(user, iniciais);
        else App.statusNuvem('Buscando os dados da loja…', 'neutro');
        return;
      }
      App.aplicarDaNuvem(nome, valor);
    };

    COLECOES.forEach((c) => {
      desligar.push(F.onSnapshot(F.collection(db, 'lojas', loja, c), (snap) => {
        const itens = snap.docs.map((d) => d.data());
        ultimo[c] = new Map(itens.map((it) => [it.id, estavel(it)]));
        aoReceber(c, itens, snap.metadata);
      }, falhou));
    });
    desligar.push(F.onSnapshot(F.doc(db, 'lojas', loja), (snap) => {
      const d = snap.data() || {};
      ultimoConfig = estavel(d.funcionamento || null);
      aoReceber('config', d, snap.metadata);
    }, falhou));

    if (!primeiraVezAqui) {
      window.Nuvem.ativa = true;
      App.statusNuvem(navigator.onLine ? 'Salvo na nuvem' : 'Sem internet: salva quando voltar', navigator.onLine ? 'ok' : 'offline');
    }
  }

  /* Primeira vez num celular: junta o que já tinha nele com o que está na nuvem (nada se perde) */
  function juntarPrimeiraVez(user, remoto) {
    const local = App.obterDados();
    const nuvemVazia = COLECOES.every((c) => !(remoto[c] || []).length);
    COLECOES.forEach((c) => {
      const mapa = new Map((remoto[c] || []).map((it) => [it.id, it]));
      (local[c] || []).forEach((it) => {
        if (it.exemplo && !nuvemVazia) return; // não duplica o espetinho de exemplo
        if (!mapa.has(it.id)) mapa.set(it.id, it);
      });
      App.aplicarDaNuvem(c, [...mapa.values()]);
    });
    if (remoto.config && remoto.config.funcionamento && remoto.config.funcionamento.configurado) {
      App.aplicarDaNuvem('config', remoto.config);
    }
    localStorage.setItem(chaveSync(user.uid), new Date().toISOString());
    window.Nuvem.ativa = true;
    enviar(App.obterDados()); // manda para a nuvem o que só existia aqui
    App.statusNuvem('Salvo na nuvem', 'ok');
  }

  /* Envia só o que mudou desde a última vez */
  function enviar(dados) {
    if (!window.Nuvem.ativa) return;
    const ops = [];
    COLECOES.forEach((c) => {
      const atual = new Map();
      (dados[c] || []).forEach((it, i) => atual.set(it.id, c === 'cardapio' ? Object.assign({}, it, { ordem: i }) : it));
      atual.forEach((obj, id) => {
        const js = estavel(obj);
        if (ultimo[c].get(id) !== js) { ops.push({ tipo: 'set', ref: F.doc(db, 'lojas', loja, c, id), obj }); ultimo[c].set(id, js); }
      });
      [...ultimo[c].keys()].forEach((id) => {
        if (!atual.has(id)) { ops.push({ tipo: 'del', ref: F.doc(db, 'lojas', loja, c, id) }); ultimo[c].delete(id); }
      });
    });
    const cfgAtual = estavel(dados.funcionamento || null);
    if (cfgAtual !== ultimoConfig) {
      ops.push({ tipo: 'set', ref: F.doc(db, 'lojas', loja), obj: { funcionamento: dados.funcionamento } });
      ultimoConfig = cfgAtual;
    }
    if (!ops.length) return;

    App.statusNuvem(navigator.onLine ? 'Salvando…' : 'Sem internet: salva quando voltar', navigator.onLine ? 'neutro' : 'offline');
    const lotes = [];
    for (let i = 0; i < ops.length; i += 400) lotes.push(ops.slice(i, i + 400));
    Promise.all(lotes.map((lote) => {
      const b = F.writeBatch(db);
      lote.forEach((op) => (op.tipo === 'set' ? b.set(op.ref, op.obj) : b.delete(op.ref)));
      return b.commit();
    }))
      .then(() => App.statusNuvem('Salvo na nuvem', 'ok'))
      .catch(falhou);
  }

  function falhou(e) {
    console.error(e);
    if (e && e.code === 'permission-denied') {
      App.statusNuvem('Sem permissão na nuvem. Avise o Daniel.', 'erro');
    } else {
      App.statusNuvem('Problema na nuvem. Os dados ficam guardados neste aparelho.', 'erro');
    }
  }

  window.addEventListener('online', () => window.Nuvem.ativa && App.statusNuvem('Salvo na nuvem', 'ok'));
  window.addEventListener('offline', () => window.Nuvem.ativa && App.statusNuvem('Sem internet: salva quando voltar', 'offline'));
}
