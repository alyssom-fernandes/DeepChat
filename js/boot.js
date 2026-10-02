/* boot.js — DeepChat
   Script comum (não é módulo), carregado no <head> antes de tudo:
   1. aplica o tema antes da página aparecer, sem piscar;
   2. registra no navegador qualquer falha não tratada, para aparecer em
      Sobre › Diagnóstico. `errosRegistrados()` no console lista as falhas.
   Nada aqui pode lançar erro: tudo fica dentro de try/catch. */
(function () {
  'use strict';
  var raiz = document.documentElement;

  /* ── Tema: 'sistema' | 'claro' | 'escuro' ─────────────────────────── */
  var CHAVE_TEMA = 'dc_tema';
  var escuroMq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function preferencia() {
    try { return localStorage.getItem(CHAVE_TEMA) || 'sistema'; } catch (_) { return 'sistema'; }
  }
  function aplicar(pref) {
    var p = pref || preferencia();
    var tema = p === 'sistema' ? (escuroMq && !escuroMq.matches ? 'claro' : 'escuro') : p;
    raiz.setAttribute('data-tema', tema);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', tema === 'escuro' ? '#141416' : '#ffffff');
    return tema;
  }
  aplicar();
  if (escuroMq && escuroMq.addEventListener) {
    escuroMq.addEventListener('change', function () { if (preferencia() === 'sistema') aplicar(); });
  }
  window.deepchatTema = {
    preferencia: preferencia,
    definir: function (p) {
      try { localStorage.setItem(CHAVE_TEMA, p); } catch (_) {}
      return aplicar(p);
    }
  };

  /* ── Registro de falhas ───────────────────────────────────────────── */
  var CHAVE_ERROS = 'dc_erros', MAX_ERROS = 20;

  window.errosRegistrados = function () {
    try { return JSON.parse(localStorage.getItem(CHAVE_ERROS) || '[]'); } catch (_) { return []; }
  };
  window.errosLimpar = function () {
    try { localStorage.removeItem(CHAVE_ERROS); } catch (_) {}
  };

  function registrar(tipo, msg, detalhe) {
    try {
      var item = {
        ts: new Date().toISOString(),
        tipo: tipo,
        msg: String(msg || '').slice(0, 300),
        detalhe: String(detalhe || '').slice(0, 600),
        demo: /[?&]demo=1\b/.test(location.search)
      };
      var lista = window.errosRegistrados();
      lista.unshift(item);
      localStorage.setItem(CHAVE_ERROS, JSON.stringify(lista.slice(0, MAX_ERROS)));
      window.dispatchEvent(new CustomEvent('deepchat:erro', { detail: item }));
    } catch (_) { /* armazenamento cheio ou bloqueado: não há o que fazer */ }
  }
  window.deepchatRegistrarErro = registrar;

  window.addEventListener('error', function (e) {
    var alvo = e.target;
    // falha ao carregar script, folha de estilo ou imagem (vem sem mensagem)
    if (alvo && alvo !== window && (alvo.src || alvo.href)) {
      registrar('recurso', 'Não carregou: ' + (alvo.src || alvo.href));
      return;
    }
    var onde = e.filename ? e.filename.split('/').pop() + ':' + e.lineno + ':' + e.colno : '';
    registrar('erro', e.message, [onde, e.error && e.error.stack].filter(Boolean).join('\n'));
  }, true);

  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason;
    if (r && r.name === 'AbortError') return;   // pergunta cancelada pelo usuário
    registrar('promessa', (r && (r.message || r.code)) || String(r), r && r.stack);
  });
})();
