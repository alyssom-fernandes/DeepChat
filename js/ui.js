/**
 * ui.js — DeepChat
 * Desenho da interface: mensagens, revisão, estados de espera, avisos,
 * histórico, toasts e diálogos. Sem regra de negócio.
 * Todo texto que vem de fora (usuário, IA, nome de arquivo) passa por esc()
 * ou pelo DOMPurify antes de virar HTML.
 */

import { esc, formatarBytes, horaCurta, grupoDeData, resumir } from './texto.js';
import { lerRevisao, nomeDaIA, VEREDITOS } from './revisao.js';

export const $ = id => document.getElementById(id);

// ── Ícones (24 × 24, traço) ───────────────────────────────────────────────────

const svg = (corpo, extra = '') =>
  `<svg class="ic" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"${extra}>${corpo}</svg>`;

export const ICONE = {
  nova:      svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>'),
  busca:     svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  painel:    svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>'),
  mais:      svg('<circle cx="5" cy="12" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="19" cy="12" r="1.2" fill="currentColor"/>'),
  enviar:    svg('<path d="M12 19V5"/><path d="m5 12 7-7 7 7"/>'),
  parar:     svg('<rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" stroke="none"/>'),
  anexo:     svg('<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>'),
  trocar:    svg('<path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/>'),
  copiar:    svg('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>'),
  ok:        svg('<path d="M20 6 9 17l-5-5"/>'),
  citar:     svg('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
  outra:     svg('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>'),
  lixeira:   svg('<path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>'),
  fechar:    svg('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
  olho:      svg('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>'),
  olhoFech:  svg('<path d="M9.9 4.24A9 9 0 0 1 12 4c6.5 0 10 8 10 8a17 17 0 0 1-2.16 3.19"/><path d="M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><path d="m2 2 20 20"/>'),
  baixar:    svg('<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>'),
  imprimir:  svg('<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/>'),
  ajustes:   svg('<path d="M4 6h10"/><path d="M18 6h2"/><circle cx="16" cy="6" r="2"/><path d="M4 12h4"/><path d="M12 12h8"/><circle cx="10" cy="12" r="2"/><path d="M4 18h12"/><path d="M20 18h0"/><circle cx="18" cy="18" r="2"/>'),
  info:      svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>'),
  sair:      svg('<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="m10 17-5-5 5-5"/><path d="M15 12H5"/>'),
  alerta:    svg('<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>'),
  semRede:   svg('<path d="m2 2 20 20"/><path d="M8.5 16.5a5 5 0 0 1 7 0"/><path d="M2 8.8a15 15 0 0 1 4.2-2.6"/><path d="M10.7 5.1A15 15 0 0 1 22 8.8"/><path d="M5 12.6a10 10 0 0 1 5.2-2.6"/><path d="M16.8 11.2a10 10 0 0 1 2.2 1.4"/><path d="M12 20h.01"/>'),
  arquivo:   svg('<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z"/><path d="M14 3v6h6"/><path d="M8 13h8"/><path d="M8 17h5"/>'),
  imagem:    svg('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>'),
  seta:      svg('<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>'),
  externo:   svg('<path d="M7 17 17 7"/><path d="M8 7h9v9"/>'),
  chave:     svg('<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 9.3-9.3"/><path d="m16 7 3 3"/><path d="m19 4 2 2"/>'),
  vereditoCorreta:   svg('<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>'),
  vereditoParcial:   svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v6"/><path d="M12 16.5h.01"/>'),
  vereditoIncorreta: svg('<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6"/><path d="m15 9-6 6"/>'),
};

const ICONE_VEREDITO = { correta: ICONE.vereditoCorreta, parcial: ICONE.vereditoParcial, incorreta: ICONE.vereditoIncorreta };
const INICIAL = { deepseek: 'D', chatgpt: 'G' };
const marcaIA = ia => `<span class="marca-ia" aria-hidden="true">${INICIAL[ia] || '?'}</span>`;

// ── Markdown seguro ───────────────────────────────────────────────────────────

/* O texto da IA não pode usar as classes do app (um <span class="veu"> cobriria
   a tela): só passa a classe da linguagem num <code>, e <input> só como a
   caixinha das listas de tarefa. */
let _purifyPronto = false;
function prepararPurify() {
  if (_purifyPronto || !window.DOMPurify) return;
  window.DOMPurify.addHook('uponSanitizeAttribute', (no, dado) => {
    if (dado.attrName === 'class') {
      dado.forceKeepAttr = no.tagName === 'CODE' && /^language-[\w+#-]+$/.test(dado.attrValue);
      if (!dado.forceKeepAttr) dado.keepAttr = false;
    }
  });
  window.DOMPurify.addHook('afterSanitizeAttributes', no => {
    if (no.tagName === 'A') {
      no.setAttribute('target', '_blank');
      no.setAttribute('rel', 'noopener noreferrer');
    }
    if (no.tagName === 'INPUT' && no.getAttribute('type') !== 'checkbox') no.remove();
  });
  _purifyPronto = true;
}

const TAGS = ['p', 'br', 'strong', 'b', 'em', 'i', 'del', 's', 'code', 'pre', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'blockquote', 'a', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'sup', 'sub', 'input', 'span'];
const ATRIBUTOS = ['href', 'title', 'align', 'start', 'type', 'checked', 'disabled'];

/** Markdown → HTML limpo. Sem o marked (CDN fora do ar), cai num formato simples e seguro. */
export function markdownParaHtml(texto) {
  const t = String(texto ?? '');
  if (window.marked && window.DOMPurify) {
    prepararPurify();
    const html = window.marked.parse(t, { gfm: true, breaks: true });
    return window.DOMPurify.sanitize(html, { ALLOWED_TAGS: TAGS, ALLOWED_ATTR: ATRIBUTOS });
  }
  return esc(t)
    .replace(/```[\w-]*\n([\s\S]*?)```/g, (_, c) => `<pre><code>${c}</code></pre>`)
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .split(/\n{2,}/).map(b => b.startsWith('<pre>') ? b : `<p>${b.replace(/\n/g, '<br>')}</p>`).join('');
}

const _cache = new Map();

/** Põe o Markdown num elemento e arruma tabelas, código e listas de tarefa. */
export function preencherMarkdown(el, texto, chave) {
  let html = chave ? _cache.get(chave) : null;
  if (html == null || (chave && _cache.get(chave + ':t') !== texto)) {
    html = markdownParaHtml(texto);
    if (chave) { _cache.set(chave, html); _cache.set(chave + ':t', texto); }
  }
  el.innerHTML = html;
  el.querySelectorAll('table').forEach(t => {
    const caixa = document.createElement('div');
    caixa.className = 'md-tabela';
    caixa.tabIndex = 0;
    caixa.setAttribute('role', 'region');
    caixa.setAttribute('aria-label', 'Tabela (role para o lado se precisar)');
    t.replaceWith(caixa);
    caixa.appendChild(t);
  });
  el.querySelectorAll('pre').forEach(pre => {
    const code = pre.querySelector('code');
    const lingua = (code?.className.match(/language-([\w+#-]+)/) || [])[1] || '';
    const bloco = document.createElement('div');
    bloco.className = 'md-codigo';
    bloco.innerHTML = `<div class="md-codigo-cab"><span>${esc(lingua || 'código')}</span>` +
      `<button type="button" class="btn-mini" data-acao="copiar-codigo">${ICONE.copiar}<span>Copiar</span></button></div>`;
    pre.replaceWith(bloco);
    bloco.appendChild(pre);
  });
  el.querySelectorAll('input[type="checkbox"]').forEach(c => { c.disabled = true; c.tabIndex = -1; });
  return el;
}

// ── Mensagens ─────────────────────────────────────────────────────────────────

function acoes(lista) {
  const rotulos = {
    copiar: [ICONE.copiar, 'Copiar'],
    citar:  [ICONE.citar, 'Citar'],
    outra:  [ICONE.outra, 'Outra resposta'],
  };
  return `<div class="msg-acoes">${lista.map(a =>
    `<button type="button" class="btn-mini" data-acao="${a}">${rotulos[a][0]}<span>${rotulos[a][1]}</span></button>`).join('')}</div>`;
}

function htmlAnexo(anexo) {
  if (!anexo) return '';
  if (anexo.imagem && anexo.dataUrl) {
    return `<img class="anexo-imagem" src="${esc(anexo.dataUrl)}" alt="${esc(anexo.nome)}">`;
  }
  return `<div class="anexo-chip">${anexo.imagem ? ICONE.imagem : ICONE.arquivo}` +
    `<span class="anexo-nome">${esc(anexo.nome)}</span><span class="anexo-tam">${esc(formatarBytes(anexo.tamanho))}</span></div>`;
}

/**
 * Elemento de uma mensagem.
 * @param {object} m mensagem (ver conversa.js)
 * A resposta sempre traz "Outra resposta"; o CSS só mostra na última (.ultima).
 */
export function elementoMensagem(m) {
  const art = document.createElement('article');
  art.className = `msg msg-${m.papel}`;
  art.dataset.id = m.id;
  art.dataset.turno = m.turno;
  if (m.autor !== 'usuario') art.dataset.ia = m.autor;
  const hora = horaCurta(m.em);

  if (m.papel === 'pergunta') {
    art.setAttribute('aria-label', 'Sua pergunta');
    const cit = m.citacao?.texto
      ? `<div class="citacao"><span class="citacao-autor">Citando ${esc(m.citacao.autor)}</span><span class="citacao-texto">${esc(resumir(m.citacao.texto, 160))}</span></div>`
      : '';
    art.innerHTML = `<div class="balao">${cit}${htmlAnexo(m.anexo)}<div class="texto-usuario"></div></div>${acoes(['copiar'])}`;
    art.querySelector('.texto-usuario').textContent = m.texto;
    return art;
  }

  if (m.papel === 'resposta') {
    art.setAttribute('aria-label', `Resposta do ${nomeDaIA(m.autor)}`);
    art.innerHTML = `
      <header class="msg-cab">${marcaIA(m.autor)}<strong class="msg-autor">${nomeDaIA(m.autor)}</strong>
        <span class="msg-meta">respondeu${hora ? ` · <time datetime="${esc(m.em)}">${hora}</time>` : ''}</span></header>
      <div class="md"></div>
      ${acoes(['copiar', 'citar', 'outra'])}`;
    preencherMarkdown(art.querySelector('.md'), m.texto, m.id);
    return art;
  }

  // revisão
  const rev = lerRevisao(m.texto);
  art.setAttribute('aria-label', `Revisão do ${nomeDaIA(m.autor)}${rev.veredito ? `: ${VEREDITOS[rev.veredito]}` : ''}`);
  if (rev.veredito) art.dataset.veredito = rev.veredito;
  const veredito = rev.veredito
    ? `<span class="veredito">${ICONE_VEREDITO[rev.veredito]}<span>${VEREDITOS[rev.veredito]}</span></span>` : '';
  art.innerHTML = `
    <div class="rev">
      <header class="rev-cab">${marcaIA(m.autor)}
        <span class="rev-quem"><strong class="msg-autor">Revisão do ${nomeDaIA(m.autor)}</strong>
          ${hora ? `<span class="msg-meta"><time datetime="${esc(m.em)}">${hora}</time></span>` : ''}</span>
        ${veredito}
      </header>
      <div class="rev-corpo"></div>
    </div>
    ${acoes(['copiar', 'citar'])}`;
  const corpo = art.querySelector('.rev-corpo');

  if (!rev.secoes.length) {
    const md = document.createElement('div');
    md.className = 'md';
    corpo.appendChild(preencherMarkdown(md, rev.introducao || m.texto, m.id));
    return art;
  }

  const secao = s => {
    const el = document.createElement(s.chave === 'versao' ? 'details' : 'section');
    el.className = `rev-sec rev-${s.chave}`;
    el.innerHTML = s.chave === 'versao'
      ? `<summary><span>Ver a versão revisada</span></summary><div class="md"></div>`
      : `<h2 class="rev-sec-titulo">${s.titulo}</h2><div class="md"></div>`;
    preencherMarkdown(el.querySelector('.md'), s.corpo, `${m.id}:${s.chave}`);
    return el;
  };
  if (rev.introducao) {
    const md = document.createElement('div');
    md.className = 'md rev-intro';
    corpo.appendChild(preencherMarkdown(md, rev.introducao, `${m.id}:intro`));
  }
  const fortes = rev.secoes.find(s => s.chave === 'fortes');
  const melhorar = rev.secoes.find(s => s.chave === 'melhorar');
  for (const s of rev.secoes) {
    if (s === fortes && melhorar) {
      const par = document.createElement('div');
      par.className = 'rev-par';
      par.append(secao(fortes), secao(melhorar));
      corpo.appendChild(par);
    } else if (s !== melhorar || !fortes) {
      corpo.appendChild(secao(s));
    }
  }
  return art;
}

/** "DeepSeek está respondendo…", com cronômetro. */
export function elementoPensando(ia, papel) {
  const el = document.createElement('div');
  el.className = 'msg msg-pensando';
  el.dataset.ia = ia;
  el.id = 'pensando';
  const acao = papel === 'revisao' ? 'revisando' : 'respondendo';
  el.innerHTML = `
    <header class="msg-cab">${marcaIA(ia)}<strong class="msg-autor">${nomeDaIA(ia)}</strong>
      <span class="msg-meta">está ${acao}<span class="cronometro" aria-hidden="true"></span></span></header>
    <div class="esqueleto" aria-hidden="true"><span></span><span></span><span></span></div>`;
  const inicio = Date.now();
  const crono = el.querySelector('.cronometro');
  const tique = () => {
    if (!el.isConnected) { clearInterval(timer); return; }
    const s = Math.floor((Date.now() - inicio) / 1000);
    crono.textContent = s >= 3 ? ` · ${s} s` : '';
  };
  const timer = setInterval(tique, 1000);
  return el;
}

/**
 * Aviso dentro da conversa (erro ou informação).
 * @param {{tipo?: 'erro'|'info', titulo: string, texto?: string, acoes?: {rotulo: string, acao: string, principal?: boolean}[], turno?: string}} a
 */
export function elementoAviso({ tipo = 'erro', titulo, texto = '', acoes = [], turno = '' }) {
  const el = document.createElement('div');
  el.className = `aviso aviso-${tipo}`;
  el.setAttribute('role', tipo === 'erro' ? 'alert' : 'status');
  if (turno) el.dataset.turno = turno;
  el.innerHTML = `
    <span class="aviso-icone">${tipo === 'erro' ? ICONE.alerta : ICONE.info}</span>
    <div class="aviso-corpo">
      <strong class="aviso-titulo">${esc(titulo)}</strong>
      ${texto ? `<p class="aviso-texto">${esc(texto)}</p>` : ''}
      ${acoes.length ? `<div class="aviso-acoes">${acoes.map(a =>
        `<button type="button" class="btn ${a.principal ? 'btn-sec' : 'btn-texto'}" data-acao="${esc(a.acao)}">${esc(a.rotulo)}</button>`).join('')}</div>` : ''}
    </div>`;
  return el;
}

/** Conversa nova: o que o app faz e perguntas para começar. */
export function elementoVazio({ respondente, revisor, exemplos = [], demo = false }) {
  const el = document.createElement('section');
  el.className = 'vazio';
  el.setAttribute('aria-labelledby', 'vazioTitulo');
  el.innerHTML = `
    <h2 class="vazio-titulo" id="vazioTitulo">Uma IA responde.<br><span>Outra revisa.</span></h2>
    <p class="vazio-texto">Faça uma pergunta. O <strong data-ia="${respondente}">${nomeDaIA(respondente)}</strong> responde e o
      <strong data-ia="${revisor}">${nomeDaIA(revisor)}</strong> confere: diz se está certa, o que falta e, se for preciso, corrige.</p>
    ${exemplos.length ? `
    <div class="exemplos">
      <h3 class="exemplos-rotulo">${demo ? 'Escolha um exemplo' : 'Para começar'}</h3>
      <ul>${exemplos.map(e => `<li><button type="button" class="exemplo" data-exemplo="${esc(e)}"><span>${esc(e)}</span>${ICONE.seta}</button></li>`).join('')}</ul>
    </div>` : ''}`;
  return el;
}

// ── Histórico ─────────────────────────────────────────────────────────────────

export function renderizarHistorico(lista, conversas, { ativa, termo = '', total = 0 }) {
  if (!conversas.length) {
    lista.innerHTML = termo
      ? `<p class="lista-vazia">Nenhuma conversa com “${esc(termo)}”.</p>`
      : `<p class="lista-vazia">${total ? '' : 'Suas conversas aparecem aqui. Ficam só neste navegador.'}</p>`;
    return;
  }
  const grupos = new Map();
  for (const c of conversas) {
    const g = grupoDeData(c.atualizada);
    if (!grupos.has(g)) grupos.set(g, []);
    grupos.get(g).push(c);
  }
  lista.innerHTML = [...grupos].map(([grupo, itens]) => `
    <section class="grupo" aria-label="${esc(grupo)}">
      <h2 class="grupo-titulo">${esc(grupo)}</h2>
      <ul>${itens.map(c => `
        <li class="conv${c.id === ativa ? ' ativa' : ''}">
          <button type="button" class="conv-abrir" data-conv="${esc(c.id)}"${c.id === ativa ? ' aria-current="true"' : ''}>${esc(c.titulo || 'Conversa')}</button>
          <button type="button" class="conv-excluir btn-icone" data-excluir="${esc(c.id)}" aria-label="Excluir “${esc(resumir(c.titulo, 60))}”" title="Excluir">${ICONE.lixeira}</button>
        </li>`).join('')}
      </ul>
    </section>`).join('');
}

// ── Toasts ────────────────────────────────────────────────────────────────────

/**
 * Aviso rápido no rodapé.
 * @param {string} texto
 * @param {{acao?: () => void, rotulo?: string, duracao?: number, tipo?: 'info'|'erro'}} op
 */
export function toast(texto, { acao, rotulo, duracao = 4000, tipo = 'info' } = {}) {
  const area = $('toasts');
  const el = document.createElement('div');
  el.className = `toast toast-${tipo}`;
  el.innerHTML = `<span class="toast-texto"></span>${acao ? `<button type="button" class="toast-acao"></button>` : ''}` +
    `<button type="button" class="toast-fechar btn-icone" aria-label="Fechar aviso">${ICONE.fechar}</button>`;
  el.querySelector('.toast-texto').textContent = texto;
  let timer;
  const fechar = () => { clearTimeout(timer); el.classList.add('saindo'); setTimeout(() => el.remove(), 180); };
  if (acao) {
    const b = el.querySelector('.toast-acao');
    b.textContent = rotulo || 'Desfazer';
    b.addEventListener('click', () => { fechar(); acao(); });
  }
  el.querySelector('.toast-fechar').addEventListener('click', fechar);
  // pausa enquanto o mouse ou o foco estiverem no aviso
  const armar = () => { clearTimeout(timer); if (duracao) timer = setTimeout(fechar, duracao); };
  el.addEventListener('mouseenter', () => clearTimeout(timer));
  el.addEventListener('mouseleave', armar);
  el.addEventListener('focusin', () => clearTimeout(timer));
  el.addEventListener('focusout', armar);
  while (area.children.length >= 3) area.firstElementChild.remove();
  // Com um diálogo aberto, o resto da página fica por baixo dele (e inerte):
  // o aviso vai para dentro do diálogo de cima e volta quando ele fecha.
  const abertos = document.querySelectorAll('dialog[open]');
  const dono = abertos[abertos.length - 1] || document.body;
  if (area.parentElement !== dono) dono.appendChild(area);
  area.appendChild(el);
  armar();
  return fechar;
}

// ── Diálogos ──────────────────────────────────────────────────────────────────

/** Abre um <dialog> como modal e devolve o foco a quem abriu, ao fechar. */
export function abrirDialogo(dlg, focoInicial) {
  const anterior = document.activeElement;
  dlg.addEventListener('close', () => {
    if (dlg.contains($('toasts'))) document.body.appendChild($('toasts'));
    if (anterior?.isConnected) anterior.focus();
  }, { once: true });
  dlg.showModal();
  (focoInicial ? dlg.querySelector(focoInicial) : null)?.focus();
}

/** Pergunta de confirmação. Resolve true só no botão de confirmar. */
export function confirmar({ titulo, texto, confirmar: rotulo = 'Confirmar', perigo = false }) {
  const dlg = $('dlgConfirmar');
  dlg.querySelector('#confirmarTitulo').textContent = titulo;
  dlg.querySelector('#confirmarTexto').textContent = texto;
  const ok = dlg.querySelector('[data-confirmar]');
  ok.textContent = rotulo;
  ok.classList.toggle('btn-perigo', perigo);
  ok.classList.toggle('btn-pri', !perigo);
  return new Promise(resolve => {
    dlg.returnValue = '';
    dlg.addEventListener('close', () => resolve(dlg.returnValue === 'sim'), { once: true });
    abrirDialogo(dlg, '[data-cancelar]');
  });
}

/** Lido pelo leitor de tela, sem aparecer. */
export function anunciar(texto) {
  const el = $('anuncio');
  el.textContent = '';
  setTimeout(() => { el.textContent = texto; }, 60);
}
