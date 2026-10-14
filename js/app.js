/**
 * app.js — DeepChat
 * Orquestra o app: chaves, fluxo pergunta → resposta → revisão, histórico,
 * menus, diálogos, anexos, demonstração, exportação e impressão.
 */

import { estado, papeis } from './state.js';
import * as arm from './storage.js';
import { CONFIG, RequestChain, consultar, ErroApi, ehCancelamento,
         conteudoComAnexo, anexoParaRevisor, reduzirImagem,
         EXTENSOES_TEXTO, TIPOS_IMAGEM } from './api-client.js';
import { SISTEMA_RESPOSTA, SISTEMA_REVISAO, promptRevisao, nomeDaIA, lerRevisao, VEREDITOS } from './revisao.js';
import { criarConversa, tituloDaConversa, contextoParaApi, textoParaApi, contextoResumido,
         markdownDaConversa, filtrarHistorico, novoId } from './conversa.js';
import { formatarBytes, slug, dataArquivo, dataLonga, resumir } from './texto.js';
import { PERGUNTAS_EXEMPLO, exemploDaPergunta, esperarDemo, conversasDemo } from './demo.js';
import { $, ICONE, elementoMensagem, elementoPensando, elementoAviso, elementoVazio,
         renderizarHistorico, toast, abrirDialogo, confirmar, anunciar } from './ui.js';

const MAX_ARQUIVO = 5 * 1024 * 1024;
const agoraIso = () => new Date().toISOString();
const gaveta = () => matchMedia('(max-width: 899px)').matches;
/** Tela de toque: Enter quebra a linha (o envio é pelo botão). Teclado físico: Enter envia. */
const toque = () => matchMedia('(pointer: coarse)').matches;

/** Anexos completos (com a imagem ou o texto) da sessão, por turno, para "Outra resposta". */
const anexosDoTurno = new Map();
/** Ações dos avisos dentro da conversa. */
const acoesDeAviso = new WeakMap();

// ── Início ────────────────────────────────────────────────────────────────────

async function iniciar() {
  document.querySelectorAll('[data-ic]').forEach(el => el.insertAdjacentHTML('afterbegin', ICONE[el.dataset.ic] || ''));
  $('ajModelo').innerHTML = CONFIG.MODELOS_CHATGPT.map(m => `<option value="${m.id}">${m.nome} · ${m.detalhe}</option>`).join('');
  estado.prefs = arm.lerPreferencias();
  ligarEventos();

  if (new URLSearchParams(location.search).get('demo') === '1') { iniciarDemo(); return; }
  if (dentroDeOutroSite()) { mostrarQuadro(); return; }

  const chaves = await arm.carregarChaves();
  if (chaves?.deepseekKey && chaves?.chatgptKey) {
    estado.chaves = { deepseek: chaves.deepseekKey, chatgpt: chaves.chatgptKey };
    abrirApp();
  } else {
    mostrarInicio();
  }
}

/* Dentro de um iframe, outro site poderia cobrir os campos e capturar cliques
   (clickjacking). O GitHub Pages não deixa mandar o cabeçalho que proíbe isso,
   então o app não pede nem abre as chaves ali; a demonstração, sem chaves, abre. */
function dentroDeOutroSite() {
  try { return window.top !== window.self; } catch { return true; }
}

function mostrarQuadro() {
  $('telaQuadro').hidden = false;
  $('quadroAbrir').href = location.href;
}

function mostrarInicio() {
  $('telaApp').hidden = true;
  $('telaInicio').hidden = false;
  document.title = 'DeepChat · Uma IA responde, outra revisa';
  if (!toque()) $('chaveDeepseek').focus({ preventScroll: true });
}

function abrirApp() {
  $('telaInicio').hidden = true;
  $('telaApp').hidden = false;
  atualizarOrdem();
  novaConversa({ focar: false });
  const rascunho = arm.lerRascunho();
  if (rascunho) $('pergunta').value = rascunho;
  aoDigitar();
  $('faixaOffline').hidden = navigator.onLine;
  if (!toque()) $('pergunta').focus({ preventScroll: true });
}

function iniciarDemo() {
  estado.demo = true;
  estado.prefs = { ordem: 'deepseek', modelo: CONFIG.MODELOS_CHATGPT[0].id, som: false };
  const conversas = conversasDemo();
  arm.usarMemoria(conversas);
  document.body.classList.add('demo');
  $('seloDemo').hidden = false;
  $('faixaDemo').hidden = false;
  document.querySelector('[data-menu="sair-demo"]').hidden = false;
  abrirApp();
  carregarConversa(conversas[0].id, { rolar: 'topo' });
}

// ── Chaves ────────────────────────────────────────────────────────────────────

function problemaNaChave(valor, servico) {
  if (!valor) return `Falta a chave ${servico}.`;
  if (/\s/.test(valor)) return `A chave ${servico} tem espaços. Copie de novo, sem espaços.`;
  if (valor.length < 20) return `A chave ${servico} parece incompleta.`;
  return null;
}

function mostrarErro(el, texto) {
  el.textContent = texto || '';
  el.hidden = !texto;
}

async function entrar(e) {
  e.preventDefault();
  const ds = $('chaveDeepseek').value.trim();
  const gpt = $('chaveChatgpt').value.trim();
  const erroDs = problemaNaChave(ds, 'do DeepSeek');
  const erroGpt = problemaNaChave(gpt, 'da OpenAI');
  mostrarErro($('erroChaves'), !ds && !gpt ? 'Cole as duas chaves para começar.' : (erroDs || erroGpt));
  $('chaveDeepseek').setAttribute('aria-invalid', String(!!erroDs));
  $('chaveChatgpt').setAttribute('aria-invalid', String(!!erroGpt));
  if (erroDs) { $('chaveDeepseek').focus(); return; }
  if (erroGpt) { $('chaveChatgpt').focus(); return; }

  estado.chaves = { deepseek: ds, chatgpt: gpt };
  if ($('lembrarChaves').checked) await arm.salvarChaves(ds, gpt);
  else arm.esquecerChaves();
  $('chaveDeepseek').value = $('chaveChatgpt').value = '';
  abrirApp();
}

// ── Conversa na tela ──────────────────────────────────────────────────────────

function desenharConversa() {
  const col = $('conversa');
  col.textContent = '';
  const msgs = estado.conversa.mensagens;
  if (!msgs.length) {
    const { respondente, revisor } = papeis();
    col.appendChild(elementoVazio({ respondente, revisor, exemplos: PERGUNTAS_EXEMPLO, demo: estado.demo }));
  } else {
    const frag = document.createDocumentFragment();
    for (const m of msgs) frag.appendChild(elementoMensagem(comAnexoDaSessao(m)));
    col.appendChild(frag);
    marcarUltima();
    avisarTurnosIncompletos();
  }
  atualizarTitulo();
  atualizarMenu();
}

/* Os avisos não ficam salvos. Ao abrir uma conversa, o turno que ficou sem
   resposta ou sem revisão (falhou, foi parado) ganha de novo a sua ação. */
function avisarTurnosIncompletos() {
  const msgs = estado.conversa.mensagens;
  for (const p of msgs.filter(m => m.papel === 'pergunta')) {
    const doTurno = msgs.filter(m => m.turno === p.turno);
    const resposta = doTurno.findLast(m => m.papel === 'resposta');
    if (estado.demo && !exemploDaPergunta(p.texto)) { avisoDemo(p.id, { rolar: false }); continue; }
    if (!resposta) {
      avisoNaConversa({ tipo: 'info', turno: p.id, titulo: 'Esta pergunta ficou sem resposta',
        acoes: [{ rotulo: 'Perguntar de novo', acao: 'repetir', principal: true }] },
      { repetir: () => rodarTurno(p) }, { rolar: false });
    } else if (!doTurno.some(m => m.papel === 'revisao')) {
      avisoNaConversa({ tipo: 'info', turno: p.id, titulo: 'A resposta não foi revisada',
        acoes: [{ rotulo: 'Revisar agora', acao: 'repetir', principal: true }] },
      { repetir: () => rodarTurno(p, { soRevisao: resposta }) }, { rolar: false });
    }
  }
}

function avisoDemo(turno, op) {
  avisoNaConversa({
    tipo: 'info', turno,
    titulo: 'Na demonstração, só os exemplos têm resposta',
    texto: 'Esta pergunta não foi enviada a nenhuma IA. Para perguntar o que quiser, use suas chaves.',
    acoes: [{ rotulo: 'Usar minhas chaves', acao: 'chaves', principal: true }, { rotulo: 'Ver os exemplos', acao: 'exemplos' }],
  }, { chaves: () => { location.href = './'; }, exemplos: () => novaConversa() }, op);
}

function comAnexoDaSessao(m) {
  const a = m.papel === 'pergunta' && anexosDoTurno.get(m.turno);
  return a?.dataUrl ? { ...m, anexo: { ...m.anexo, dataUrl: a.dataUrl } } : m;
}

/** Só a resposta do último turno oferece "Outra resposta". */
function marcarUltima() {
  const ultimo = ultimoTurno();
  $('conversa').querySelectorAll('.msg-resposta').forEach(r => r.classList.toggle('ultima', r.dataset.turno === ultimo));
}

const ultimoTurno = () => [...estado.conversa.mensagens].reverse().find(m => m.papel === 'pergunta')?.turno ?? null;

/** Mensagens anteriores ao turno: é o contexto que a IA recebe. */
function antesDoTurno(turno) {
  const msgs = estado.conversa.mensagens;
  const i = msgs.findIndex(m => m.turno === turno);
  return i < 0 ? msgs : msgs.slice(0, i);
}

/** Põe o elemento logo depois do que já existe do turno; sem turno, no fim. */
function inserirNoTurno(el, turno) {
  const doTurno = turno ? $('conversa').querySelectorAll(`[data-turno="${CSS.escape(turno)}"]`) : [];
  const fim = doTurno[doTurno.length - 1];
  if (fim) fim.after(el); else $('conversa').appendChild(el);
}

function atualizarTitulo() {
  const t = estado.conversa.mensagens.length ? tituloDaConversa(estado.conversa) : 'Nova conversa';
  $('tituloConversa').textContent = t;
  document.title = estado.conversa.mensagens.length ? `${t} · DeepChat` : 'DeepChat · Uma IA responde, outra revisa';
}

function adicionarMensagem(m) {
  const col = $('conversa');
  col.querySelector('.vazio')?.remove();
  // resposta e revisão entram no lugar do turno, mesmo se já houver pergunta mais nova
  const msgs = estado.conversa.mensagens;
  const fim = m.papel === 'pergunta' ? -1 : msgs.findLastIndex(x => x.turno === m.turno);
  if (fim >= 0) msgs.splice(fim + 1, 0, m); else msgs.push(m);
  const el = elementoMensagem(comAnexoDaSessao(m));
  inserirNoTurno(el, m.papel === 'pergunta' ? null : m.turno);
  marcarUltima();
  if (m.papel === 'pergunta') { atualizarTitulo(); rolarParaFim(); }
  else if (m.turno !== ultimoTurno()) rolarAte(el);
  else if (m.papel === 'resposta') {
    const pergunta = col.querySelector(`.msg-pergunta[data-turno="${CSS.escape(m.turno)}"]`);
    rolarAte(pergunta && pergunta.getBoundingClientRect().height < rolagem().clientHeight * 0.35 ? pergunta : el);
  }
  else avisarSeFora(el, 'Revisão pronta');
  atualizarMenu();
  return el;
}

function avisoNaConversa(opcoes, acoes = {}, { rolar = true } = {}) {
  const el = elementoAviso(opcoes);
  acoesDeAviso.set(el, acoes);
  inserirNoTurno(el, opcoes.turno);
  if (!rolar) return el;   // conversa sendo aberta: quem rola é carregarConversa
  if (!opcoes.turno || opcoes.turno === ultimoTurno()) rolarParaFim(); else rolarAte(el);
  // região viva criada já com texto nem sempre é lida: anuncia à parte
  if (opcoes.tipo === 'info') anunciar(opcoes.titulo);
  return el;
}

function salvar() {
  const c = estado.conversa;
  if (!c.mensagens.length) return;
  c.titulo = tituloDaConversa(c);
  c.atualizada = agoraIso();
  try {
    const saiu = arm.salvarConversa(c);
    if (saiu) toast(`O navegador ficou sem espaço: ${saiu === 1 ? 'a conversa mais antiga saiu' : `as ${saiu} conversas mais antigas saíram`} do histórico.`, { duracao: 8000 });
  } catch {
    toast('Não deu para salvar esta conversa: o navegador está sem espaço.', { tipo: 'erro', duracao: 8000 });
  }
  renderizarLista();
}

// ── Rolagem ───────────────────────────────────────────────────────────────────

const rolagem = () => $('rolagem');
const pertoDoFim = () => { const r = rolagem(); return r.scrollHeight - r.scrollTop - r.clientHeight < 120; };

function rolarParaFim(suave = true) {
  requestAnimationFrame(() => {
    const r = rolagem();
    r.scrollTo({ top: r.scrollHeight, behavior: suave && !movimentoReduzido() ? 'smooth' : 'auto' });
  });
}

/** Posição do elemento dentro da área que rola (offsetTop contaria a barra do topo). */
const topoNaRolagem = el => el.getBoundingClientRect().top - rolagem().getBoundingClientRect().top + rolagem().scrollTop;

function rolarAte(el) {
  requestAnimationFrame(() => {
    rolagem().scrollTo({ top: topoNaRolagem(el) - 16, behavior: movimentoReduzido() ? 'auto' : 'smooth' });
  });
}

/** Se a revisão chegou fora da vista, mostra "Revisão pronta" em vez de puxar a tela. */
function avisarSeFora(el, texto) {
  requestAnimationFrame(() => {
    const r = rolagem().getBoundingClientRect();
    const b = el.getBoundingClientRect();
    if (b.top > r.bottom - 40) mostrarIrFim(texto);
  });
}

function mostrarIrFim(texto = 'Ir para o fim') {
  $('irFimTexto').textContent = texto;
  $('btnIrFim').hidden = false;
}

function aoRolar() {
  if (pertoDoFim()) $('btnIrFim').hidden = true;
  else if ($('btnIrFim').hidden && rolagem().scrollHeight > rolagem().clientHeight * 1.5) mostrarIrFim();
}

const movimentoReduzido = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// ── Pergunta → resposta → revisão ─────────────────────────────────────────────

const normalizar = s => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

async function enviar({ texto: forcado, repetir = false } = {}) {
  if (estado.ocupado) return;
  const campo = $('pergunta');
  const texto = (forcado ?? campo.value).trim();
  const anexo = estado.anexo;
  if (!texto && !anexo) return;

  if (!estado.demo && !navigator.onLine) {
    toast('Sem conexão. A pergunta continua no campo; envie quando a internet voltar.', { tipo: 'erro' });
    return;
  }
  const { respondente } = papeis();
  if (anexo?.imagem && respondente === 'deepseek') { avisarImagemDeepseek(); return; }

  const anterior = [...estado.conversa.mensagens].reverse().find(m => m.papel === 'pergunta');
  if (!repetir && !anexo && anterior && normalizar(anterior.texto) === normalizar(texto)) {
    // do campo, relê o campo (e limpa ao enviar); de um exemplo, manda o exemplo
    const deNovo = () => enviar(forcado === undefined ? { repetir: true } : { texto, repetir: true });
    toast('Você acabou de fazer essa pergunta.', { acao: deNovo, rotulo: 'Perguntar de novo', duracao: 7000 });
    return;
  }

  const id = novoId();
  const pergunta = {
    id, turno: id, papel: 'pergunta', autor: 'usuario', em: agoraIso(),
    texto: texto || (anexo?.imagem ? 'Descreva esta imagem.' : 'Analise o arquivo anexado.'),
  };
  if (estado.citacao) pergunta.citacao = { ...estado.citacao };
  if (anexo) {
    pergunta.anexo = { nome: anexo.nome, tamanho: anexo.tamanho, tipo: anexo.tipo, imagem: !!anexo.imagem };
    anexosDoTurno.set(id, anexo);
  }

  if (forcado === undefined) { campo.value = ''; arm.apagarRascunho(); }
  tirarCitacao(); tirarAnexo(); aoDigitar();
  adicionarMensagem(pergunta);
  if (estado.demo) tirarRepetidaDaDemo(pergunta.texto);

  if (estado.demo && !exemploDaPergunta(pergunta.texto)) {
    avisoDemo(id);
    salvar();
    return;
  }
  salvar();
  await rodarTurno(pergunta);
}

/* Na demonstração, o exemplo escolhido numa conversa nova já existe entre as
   conversas gravadas: a gravada sai, e a nova fica no lugar, sem título repetido. */
function tirarRepetidaDaDemo(texto) {
  if (estado.conversa.mensagens.length > 1) return;
  for (const c of arm.lerHistorico()) {
    if (c.id !== estado.conversa.id && normalizar(c.mensagens[0]?.texto) === normalizar(texto)) arm.excluirConversa(c.id);
  }
}

/**
 * Pede a resposta e depois a revisão de um turno.
 * @param {object} pergunta
 * @param {{outra?: string, soRevisao?: object}} op `outra`: texto da resposta
 *   anterior (pedido de outra resposta); `soRevisao`: resposta já pronta.
 */
async function rodarTurno(pergunta, { outra = null, soRevisao = null } = {}) {
  if (estado.ocupado) return;
  const anexo = anexosDoTurno.get(pergunta.turno) || null;
  const cadeia = new RequestChain();
  definirOcupado(cadeia);
  try {
    let resposta = soRevisao;
    if (!resposta) {
      // pergunta com imagem é sempre do ChatGPT (o DeepSeek não lê imagem),
      // mesmo se a ordem mudou antes de "Tentar de novo"
      let respondente = papeis().respondente;
      if (anexo?.imagem && respondente === 'deepseek') {
        respondente = 'chatgpt';
        toast('Esta pergunta tem imagem: quem responde é o ChatGPT.');
      }
      const texto = await etapa(respondente, 'resposta', pergunta, cadeia,
        () => pedirResposta(respondente, pergunta, anexo, outra, cadeia.signal));
      if (texto == null) return;
      resposta = { id: novoId(), turno: pergunta.id, papel: 'resposta', autor: respondente, texto, em: agoraIso() };
      if (respondente === 'chatgpt') resposta.modelo = estado.prefs.modelo;
      adicionarMensagem(resposta);
      salvar();
      anunciar(`O ${nomeDaIA(respondente)} respondeu.`);
    }

    const revisor = resposta.autor === 'deepseek' ? 'chatgpt' : 'deepseek';
    const textoRev = await etapa(revisor, 'revisao', pergunta, cadeia,
      () => pedirRevisao(revisor, pergunta, resposta, anexo, cadeia.signal), resposta);
    if (textoRev == null) return;
    const revisao = { id: novoId(), turno: pergunta.id, papel: 'revisao', autor: revisor, texto: textoRev, em: agoraIso() };
    if (revisor === 'chatgpt') revisao.modelo = estado.prefs.modelo;
    adicionarMensagem(revisao);
    salvar();
    const { veredito } = lerRevisao(textoRev);
    anunciar(`Revisão do ${nomeDaIA(revisor)} pronta${veredito ? `: ${VEREDITOS[veredito]}` : ''}.`);
    if (estado.prefs.som) tocarSom();
  } finally {
    definirOcupado(null);
  }
}

/** Uma chamada com o "está respondendo…" na tela. Devolve null se falhou ou parou. */
async function etapa(ia, papel, pergunta, cadeia, fn, resposta = null) {
  const pensando = elementoPensando(ia, papel);
  pensando.dataset.turno = pergunta.id;
  inserirNoTurno(pensando, pergunta.id);
  if (pergunta.id !== ultimoTurno()) rolarAte(pensando);
  else if (papel === 'resposta' || pertoDoFim()) rolarParaFim();
  try {
    return await fn();
  } catch (e) {
    const turno = pergunta.id;
    if (ehCancelamento(e) || cadeia.cancelled) {
      avisoNaConversa({
        tipo: 'info', turno,
        titulo: papel === 'resposta' ? 'Você parou a resposta' : 'Você parou a revisão',
        acoes: [{ rotulo: papel === 'resposta' ? 'Perguntar de novo' : 'Revisar agora', acao: 'repetir', principal: true }],
      }, { repetir: () => rodarTurno(pergunta, { soRevisao: resposta }) });
      return null;
    }
    const exp = explicarErro(e, ia);
    const acoes = [{ rotulo: papel === 'resposta' ? 'Tentar de novo' : 'Revisar agora', acao: 'repetir', principal: true }];
    if (exp.chaves) acoes.push({ rotulo: 'Revisar as chaves', acao: 'chaves' });
    avisoNaConversa({
      tipo: 'erro', turno,
      titulo: papel === 'resposta' ? exp.titulo : `A resposta acima não foi revisada. ${exp.titulo}.`,
      texto: exp.texto, acoes,
    }, { repetir: () => rodarTurno(pergunta, { soRevisao: resposta }), chaves: () => abrirAjustes('#ajDeepseek') });
    if (!(e instanceof ErroApi)) window.deepchatRegistrarErro?.('fluxo', e?.message || String(e), e?.stack);
    return null;
  } finally {
    pensando.remove();
  }
}

function explicarErro(e, ia) {
  const nome = nomeDaIA(ia);
  switch (e?.tipo) {
    case 'chave':    return { chaves: true, titulo: `A chave do ${nome} foi recusada`, texto: 'Confira se ela foi copiada inteira e se ainda está ativa no site do serviço.' };
    case 'cota':     return { titulo: `O ${nome} recusou por limite ou saldo`, texto: 'A conta pode estar sem créditos ou ter passado do limite de pedidos. Espere um pouco ou confira o saldo no site do serviço.' };
    case 'tempo':    return { titulo: `O ${nome} demorou demais`, texto: 'Passou de 60 segundos sem resposta, mesmo tentando de novo.' };
    case 'rede':     return { titulo: `Não deu para falar com o ${nome}`, texto: navigator.onLine ? 'A conexão falhou três vezes seguidas.' : 'Você está sem internet.' };
    case 'circuito': return { titulo: `O ${nome} falhou várias vezes seguidas`, texto: `Para não insistir à toa, o DeepChat espera ${e.segundos} s antes de tentar de novo.` };
    case 'servidor': return { titulo: `O ${nome} está com problemas`, texto: 'O serviço respondeu com erro. Costuma passar em poucos minutos.' };
    case 'pedido':   return { titulo: `O ${nome} não aceitou o pedido`, texto: resumir(e.message, 220) };
    default:         return { titulo: 'Algo deu errado', texto: 'A falha ficou registrada em Sobre › Diagnóstico.' };
  }
}

async function pedirResposta(ia, pergunta, anexo, outra, signal) {
  if (estado.demo) {
    await esperarDemo(1500, signal);
    return exemploDaPergunta(pergunta.texto).resposta;
  }
  const anteriores = antesDoTurno(pergunta.turno);
  let sistema = SISTEMA_RESPOSTA;
  if (outra) sistema += `\n\nO usuário pediu outra resposta. Responda de outro jeito; a anterior começava assim: "${resumir(outra, 300)}"`;
  let textoUsuario = textoParaApi(pergunta);
  if (pergunta.anexo && !anexo) textoUsuario = `(O anexo ${pergunta.anexo.nome} não está mais disponível.)\n\n${textoUsuario}`;
  const mensagens = [
    { role: 'system', content: sistema },
    ...contextoParaApi(anteriores, CONFIG.MAX_CONTEXTO),
    { role: 'user', content: conteudoComAnexo(textoUsuario, anexo) },
  ];
  return consultar(ia, mensagens, { chave: estado.chaves[ia], modelo: estado.prefs.modelo, temperatura: outra ? 0.9 : 0.7, signal });
}

async function pedirRevisao(ia, pergunta, resposta, anexo, signal) {
  if (estado.demo) {
    await esperarDemo(1300, signal);
    return exemploDaPergunta(pergunta.texto).revisao;
  }
  const anteriores = antesDoTurno(pergunta.turno);
  const veImagem = ia === 'chatgpt';
  const prompt = promptRevisao({
    pergunta: textoParaApi(pergunta),
    resposta: resposta.texto,
    quem: resposta.autor,
    contexto: contextoResumido(anteriores),
    anexo: anexoParaRevisor(anexo, veImagem),
  });
  const conteudo = anexo?.imagem && veImagem ? conteudoComAnexo(prompt, anexo) : prompt;
  return consultar(ia, [{ role: 'system', content: SISTEMA_REVISAO }, { role: 'user', content: conteudo }],
    { chave: estado.chaves[ia], modelo: estado.prefs.modelo, temperatura: 0.3, signal });
}

function definirOcupado(cadeia) {
  estado.ocupado = !!cadeia;
  estado.cadeia = cadeia;
  document.body.classList.toggle('ocupado', !!cadeia);
  const b = $('btnEnviar');
  b.innerHTML = cadeia ? ICONE.parar : ICONE.enviar;
  b.setAttribute('aria-label', cadeia ? 'Parar' : 'Enviar pergunta');
  b.title = cadeia ? 'Parar (Esc)' : '';
  aoDigitar();
}

function parar() { estado.cadeia?.cancel(); }

/** Tira a resposta e a revisão do último turno e pede de novo. */
function outraResposta(turno) {
  if (estado.ocupado || turno !== ultimoTurno()) return;
  const msgs = estado.conversa.mensagens;
  const pergunta = msgs.find(m => m.id === turno);
  const antiga = msgs.find(m => m.turno === turno && m.papel === 'resposta');
  if (!pergunta) return;
  estado.conversa.mensagens = msgs.filter(m => m.turno !== turno || m.papel === 'pergunta');
  $('conversa').querySelectorAll(`[data-turno="${CSS.escape(turno)}"]:not(.msg-pergunta)`).forEach(el => el.remove());
  salvar();   // o histórico não pode guardar a resposta que o usuário descartou
  rodarTurno(pergunta, { outra: antiga?.texto || '' });
}

// ── Compositor ────────────────────────────────────────────────────────────────

function aoDigitar() {
  const campo = $('pergunta');
  campo.style.height = 'auto';
  campo.style.height = Math.min(campo.scrollHeight, Math.round(innerHeight * 0.4)) + 'px';
  const n = campo.value.length;
  const cont = $('contador');
  cont.textContent = n > 3500 ? `${n} de 4000` : '';
  cont.classList.toggle('no-limite', n >= 4000);
  $('btnEnviar').disabled = !estado.ocupado && !campo.value.trim() && !estado.anexo;
}

let _timerRascunho;
function aoEditar() {
  aoDigitar();
  clearTimeout(_timerRascunho);
  _timerRascunho = setTimeout(() => arm.salvarRascunho($('pergunta').value), 400);
}

function citar(id) {
  const m = estado.conversa.mensagens.find(x => x.id === id);
  if (!m) return;
  const autor = m.papel === 'revisao' ? `a revisão do ${nomeDaIA(m.autor)}` : nomeDaIA(m.autor);
  let texto = m.texto;
  if (m.papel === 'revisao') {
    const rev = lerRevisao(m.texto);
    const partes = rev.secoes.filter(s => s.chave !== 'versao').map(s => `${s.titulo}: ${s.corpo}`);
    if (partes.length) texto = [rev.veredito ? `Veredito: ${VEREDITOS[rev.veredito]}.` : '', ...partes].filter(Boolean).join('\n');
  }
  estado.citacao = {
    autor: m.papel === 'revisao' ? `Revisão do ${nomeDaIA(m.autor)}` : nomeDaIA(m.autor),
    ia: m.autor, papel: m.papel, texto: resumir(texto, 600),
  };
  $('citacaoAutor').textContent = `Citando ${autor}:`;
  const previa = m.papel === 'revisao' ? lerRevisao(m.texto) : null;
  $('citacaoTexto').textContent = previa?.secoes.length
    ? resumir(`${previa.veredito ? VEREDITOS[previa.veredito] + '. ' : ''}${previa.secoes[0].corpo}`, 120)
    : resumir(m.texto, 120);
  $('extraCitacao').hidden = false;
  $('pergunta').focus();
}

function tirarCitacao() { estado.citacao = null; $('extraCitacao').hidden = true; }

function tirarAnexo() {
  estado.anexo = null;
  $('extraAnexo').hidden = true;
  aoDigitar();
}

function avisarImagemDeepseek(arquivo) {
  toast('O DeepSeek não lê imagens. Para perguntar sobre uma imagem, deixe o ChatGPT responder.', {
    rotulo: 'Trocar a ordem', duracao: 9000,
    acao: () => { definirOrdem('chatgpt'); if (arquivo) anexar(arquivo); },
  });
}

async function anexar(arquivo) {
  if (!arquivo) return;
  if (estado.demo) { toast('Na demonstração não dá para anexar arquivos.'); return; }
  if (arquivo.size > MAX_ARQUIVO) {
    toast(`O arquivo tem ${formatarBytes(arquivo.size)}. O limite é 5 MB.`, { tipo: 'erro' });
    return;
  }
  const ext = (arquivo.name.split('.').pop() || '').toLowerCase();
  try {
    if (TIPOS_IMAGEM.includes(arquivo.type)) {
      if (papeis().respondente === 'deepseek') { avisarImagemDeepseek(arquivo); return; }
      const dataUrl = await reduzirImagem(arquivo);
      estado.anexo = { nome: arquivo.name || 'imagem.png', tamanho: arquivo.size, tipo: ext, imagem: true, dataUrl };
    } else if (EXTENSOES_TEXTO.includes(ext) || arquivo.type.startsWith('text/')) {
      const texto = await arquivo.text();
      if (texto.slice(0, 2000).includes('\u0000')) throw new Error('binário');
      const cortado = texto.length > CONFIG.MAX_TEXTO_ANEXO;
      estado.anexo = { nome: arquivo.name, tamanho: arquivo.size, tipo: ext, imagem: false, texto, cortado };
      if (cortado) {
        const mil = Math.round(CONFIG.MAX_TEXTO_ANEXO / 1000);
        toast(`O arquivo é grande: só os primeiros ${mil} mil caracteres vão para as IAs.`, { duracao: 7000 });
      }
    } else {
      toast('Esse tipo de arquivo não dá para enviar. Use uma imagem (PNG, JPG, WebP) ou um arquivo de texto (TXT, MD, CSV, JSON, código).', { tipo: 'erro', duracao: 8000 });
      return;
    }
  } catch {
    toast('Não deu para ler esse arquivo.', { tipo: 'erro' });
    return;
  }
  const a = estado.anexo;
  if (a.imagem) $('anexoIcone').replaceChildren(Object.assign(document.createElement('img'), { src: a.dataUrl, alt: '' }));
  else $('anexoIcone').innerHTML = ICONE.arquivo;
  $('anexoNome').textContent = a.nome;
  $('anexoTam').textContent = formatarBytes(a.tamanho) + (a.cortado ? ' · vai só o começo' : '');
  $('extraAnexo').hidden = false;
  aoDigitar();
  $('pergunta').focus();
}

// ── Ordem (quem responde) ─────────────────────────────────────────────────────

function atualizarOrdem() {
  const { respondente, revisor } = papeis();
  const b = $('btnOrdem');
  b.innerHTML =
    `<span class="ordem-ia" data-ia="${respondente}">${nomeDaIA(respondente)}</span><span class="ordem-papel">responde</span>` +
    `<span class="ordem-sep" aria-hidden="true"></span>` +
    `<span class="ordem-ia" data-ia="${revisor}">${nomeDaIA(revisor)}</span><span class="ordem-papel">revisa</span>${ICONE.trocar}`;
  b.setAttribute('aria-label', `${nomeDaIA(respondente)} responde e ${nomeDaIA(revisor)} revisa. Trocar a ordem.`);
  const vazio = $('conversa').querySelector('.vazio');
  if (vazio) desenharConversa();
  document.querySelectorAll('#dlgAjustes input[name="ordem"]').forEach(r => { r.checked = r.value === respondente; });
}

function definirOrdem(respondente, { silencioso = false } = {}) {
  if (estado.prefs.ordem === respondente) return;
  estado.prefs.ordem = respondente;
  arm.salvarPreferencias(estado.prefs);
  atualizarOrdem();
  const { revisor } = papeis();
  if (!silencioso) anunciar(`Agora o ${nomeDaIA(respondente)} responde e o ${nomeDaIA(revisor)} revisa.`);
  if (estado.anexo?.imagem && respondente === 'deepseek') {
    tirarAnexo();
    toast('A imagem saiu: o DeepSeek não lê imagens.');
  }
}

// ── Conversas ─────────────────────────────────────────────────────────────────

function ocupadoAvisa() {
  if (!estado.ocupado) return false;
  toast('Espere a resposta terminar, ou pare antes.', { acao: parar, rotulo: 'Parar' });
  return true;
}

function novaConversa({ focar = true } = {}) {
  if (ocupadoAvisa()) return;
  estado.conversa = criarConversa();
  tirarCitacao();
  desenharConversa();
  renderizarLista();
  fecharLateral();
  $('btnIrFim').hidden = true;
  rolagem().scrollTop = 0;
  if (focar) $('pergunta').focus();
}

function carregarConversa(id, { rolar = 'fim' } = {}) {
  if (ocupadoAvisa()) return;
  const c = arm.lerHistorico().find(x => x.id === id);
  if (!c) return;
  estado.conversa = structuredClone(c);
  tirarCitacao();
  desenharConversa();
  // a caixa de pergunta segue a ordem da conversa aberta: quem respondeu por último responde a próxima
  const ultimaResposta = estado.conversa.mensagens.findLast(m => m.papel === 'resposta');
  if (ultimaResposta && ultimaResposta.autor !== papeis().respondente) definirOrdem(ultimaResposta.autor, { silencioso: true });
  renderizarLista();
  fecharLateral();
  $('btnIrFim').hidden = true;
  requestAnimationFrame(() => {
    const perguntas = $('conversa').querySelectorAll('.msg-pergunta');
    const ultima = perguntas[perguntas.length - 1];
    if (rolar === 'topo' || perguntas.length <= 1) rolagem().scrollTop = 0;
    else rolagem().scrollTop = topoNaRolagem(ultima) - 16;
  });
}

async function excluirConversa(id) {
  const c = arm.lerHistorico().find(x => x.id === id);
  if (!c) return;
  const eraAtual = id === estado.conversa.id;
  if (eraAtual && ocupadoAvisa()) return;
  // o botão clicado some com o item: o foco vai para o item seguinte da lista
  const lista = $('listaConversas');
  const daLista = lista.contains(document.activeElement);
  const posicao = [...lista.querySelectorAll('[data-conv]')].findIndex(b => b.dataset.conv === id);
  arm.excluirConversa(id);
  if (eraAtual) novaConversa({ focar: false });
  else renderizarLista();
  if (daLista) {
    const itens = [...lista.querySelectorAll('[data-conv]')];
    (itens[Math.min(posicao, itens.length - 1)] || $('btnNova')).focus();
  }
  toast('Conversa excluída.', {
    rotulo: 'Desfazer', duracao: 7000,
    acao: () => { arm.gravarHistorico([c, ...arm.lerHistorico()]); if (eraAtual) carregarConversa(c.id); else renderizarLista(); },
  });
}

function renderizarLista() {
  const todas = arm.lerHistorico();
  const termo = $('busca').value;
  renderizarHistorico($('listaConversas'), filtrarHistorico(todas, termo), { ativa: estado.conversa.id, termo, total: todas.length });
}

// ── Lateral (gaveta no celular) ───────────────────────────────────────────────

function abrirLateral() {
  if (!gaveta()) { $('busca').focus(); return; }
  const l = $('lateral');
  l.classList.add('aberta');
  $('veu').hidden = false;
  $('principal').inert = true;
  $('btnLateral').setAttribute('aria-expanded', 'true');
  ($('listaConversas').querySelector('[aria-current]') || $('btnNova')).focus();
}

function fecharLateral() {
  if (!$('lateral').classList.contains('aberta')) return;
  $('lateral').classList.remove('aberta');
  $('veu').hidden = true;
  $('principal').inert = false;
  $('btnLateral').setAttribute('aria-expanded', 'false');
  if (gaveta()) $('btnLateral').focus();
}

// ── Menu ⋯ ────────────────────────────────────────────────────────────────────

/* Itens indisponíveis continuam focáveis (aria-disabled), para o leitor de tela
   saber que existem; o clique neles não faz nada. */
function atualizarMenu() {
  const tem = estado.conversa.mensagens.length > 0;
  document.querySelectorAll('#menu [data-precisa-conversa]').forEach(b => b.setAttribute('aria-disabled', String(!tem)));
}

const itensMenu = () => [...$('menu').querySelectorAll('button:not([hidden])')];

function abrirMenu() {
  atualizarMenu();
  $('menu').hidden = false;
  $('btnMenu').setAttribute('aria-expanded', 'true');
  itensMenu()[0]?.focus();
}

function fecharMenu(devolverFoco = false) {
  if ($('menu').hidden) return;
  $('menu').hidden = true;
  $('btnMenu').setAttribute('aria-expanded', 'false');
  if (devolverFoco) $('btnMenu').focus();
}

function teclaNoMenu(e) {
  const itens = itensMenu();
  const i = itens.indexOf(document.activeElement);
  const ir = n => { e.preventDefault(); itens[(n + itens.length) % itens.length]?.focus(); };
  if (e.key === 'ArrowDown') ir(i + 1);
  else if (e.key === 'ArrowUp') ir(i - 1);
  else if (e.key === 'Home') ir(0);
  else if (e.key === 'End') ir(itens.length - 1);
  else if (e.key === 'Escape') { e.preventDefault(); fecharMenu(true); }
  else if (e.key === 'Tab') fecharMenu();
}

function acaoDoMenu(acao) {
  fecharMenu();
  if (acao === 'exportar') exportarMarkdown();
  if (acao === 'imprimir') imprimir();
  if (acao === 'excluir') excluirConversa(estado.conversa.id);
  if (acao === 'ajustes') abrirAjustes();
  if (acao === 'sobre') abrirSobre();
  if (acao === 'sair-demo') location.href = './';
}

// ── Exportar e imprimir ───────────────────────────────────────────────────────

function exportarMarkdown() {
  const c = estado.conversa;
  if (!c.mensagens.length) return;
  const nome = `deepchat-${slug(tituloDaConversa(c))}-${dataArquivo(c.criada)}.md`;
  const url = URL.createObjectURL(new Blob([markdownDaConversa({ ...c, titulo: tituloDaConversa(c) })], { type: 'text/markdown;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: nome });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast(`Conversa exportada: ${nome}`);
}

let _fechadosNaImpressao = [];
function antesDeImprimir() {
  const c = estado.conversa;
  $('impressaoCab').innerHTML = '';
  const h = document.createElement('h1'); h.textContent = tituloDaConversa(c);
  const p = document.createElement('p'); p.textContent = `DeepChat · ${dataLonga(c.criada)}`;
  $('impressaoCab').append(h, p);
  _fechadosNaImpressao = [...document.querySelectorAll('#conversa details:not([open])')];
  _fechadosNaImpressao.forEach(d => { d.open = true; });
}
function depoisDeImprimir() {
  _fechadosNaImpressao.forEach(d => { d.open = false; });
  _fechadosNaImpressao = [];
}
function imprimir() {
  if (!estado.conversa.mensagens.length) return;
  window.print();
}

// ── Diálogos ──────────────────────────────────────────────────────────────────

function abrirAjustes(foco) {
  const dlg = $('dlgAjustes');
  $('grupoChaves').hidden = estado.demo;
  $('grupoChavesDemo').hidden = !estado.demo;
  $('ajDeepseek').value = estado.chaves.deepseek;
  $('ajChatgpt').value = estado.chaves.chatgpt;
  $('ajLembrar').checked = arm.temChavesSalvas();
  mostrarErro($('ajErroChaves'), '');
  dlg.querySelectorAll('input[name="ordem"]').forEach(r => { r.checked = r.value === estado.prefs.ordem; });
  $('ajModelo').value = estado.prefs.modelo;
  const tema = window.deepchatTema?.preferencia() || 'sistema';
  dlg.querySelectorAll('input[name="tema"]').forEach(r => { r.checked = r.value === tema; });
  $('ajSom').checked = estado.prefs.som;
  $('ajNotaDados').textContent = estado.demo
    ? 'Na demonstração as conversas ficam só na memória e somem ao fechar a página.'
    : 'As conversas ficam só neste navegador.';
  abrirDialogo(dlg, estado.demo ? '[data-fechar]' : (foco || '[data-fechar]'));
}

async function salvarChavesDosAjustes() {
  const ds = $('ajDeepseek').value.trim(), gpt = $('ajChatgpt').value.trim();
  const erro = problemaNaChave(ds, 'do DeepSeek') || problemaNaChave(gpt, 'da OpenAI');
  mostrarErro($('ajErroChaves'), erro);
  if (erro) return;
  estado.chaves = { deepseek: ds, chatgpt: gpt };
  if ($('ajLembrar').checked) { await arm.salvarChaves(ds, gpt); toast('Chaves salvas neste navegador.'); }
  else { arm.esquecerChaves(); toast('Chaves trocadas. Valem até recarregar ou fechar a página.'); }
}

async function esquecerChavesDosAjustes() {
  if (ocupadoAvisa()) return;
  const ok = await confirmar({
    titulo: 'Esquecer as chaves?',
    texto: 'Elas saem deste navegador e o DeepChat volta para a tela de início. As conversas continuam salvas.',
    confirmar: 'Esquecer chaves', perigo: true,
  });
  if (!ok) return;
  arm.esquecerChaves();
  estado.chaves = { deepseek: '', chatgpt: '' };
  $('dlgAjustes').close();
  mostrarInicio();
}

async function apagarTudo() {
  if (ocupadoAvisa()) return;
  const n = arm.lerHistorico().length;
  if (!n) { toast('Não há conversas para apagar.'); return; }
  const ok = await confirmar({
    titulo: 'Apagar todas as conversas?',
    texto: `${n === 1 ? 'A conversa salva vai' : `As ${n} conversas salvas vão`} sair deste navegador. Não dá para desfazer.`,
    confirmar: 'Apagar tudo', perigo: true,
  });
  if (!ok) return;
  arm.apagarHistorico();
  $('dlgAjustes').close();
  novaConversa({ focar: false });
  toast('Conversas apagadas.');
}

function abrirSobre() {
  const erros = typeof window.errosRegistrados === 'function' ? window.errosRegistrados() : [];
  const diag = $('diag');
  diag.hidden = !erros.length;
  if (erros.length) {
    diag.innerHTML = `
      <h3>Diagnóstico</h3>
      <p>${erros.length === 1 ? 'Uma falha ficou registrada' : `${erros.length} falhas ficaram registradas`} neste navegador. A última: <span class="diag-msg"></span></p>
      <div class="linha-botoes">
        <button type="button" class="btn btn-sec" data-diag="copiar">Copiar detalhes</button>
        <button type="button" class="btn btn-texto" data-diag="apagar">Apagar registro</button>
      </div>`;
    diag.querySelector('.diag-msg').textContent = resumir(erros[0].msg, 140);
  }
  abrirDialogo($('dlgSobre'), '[data-fechar]');
}

// ── Copiar ────────────────────────────────────────────────────────────────────

async function copiarTexto(texto, botao) {
  try {
    await navigator.clipboard.writeText(texto);
  } catch {
    toast('Não deu para copiar. Selecione o texto e use Ctrl+C.', { tipo: 'erro' });
    return;
  }
  if (!botao) { toast('Copiado.'); return; }
  const rotulo = botao.querySelector('span');
  const antes = botao.innerHTML;
  botao.innerHTML = `${ICONE.ok}<span>${rotulo ? 'Copiado' : ''}</span>`;
  botao.classList.add('feito');
  anunciar('Copiado.');
  setTimeout(() => { botao.innerHTML = antes; botao.classList.remove('feito'); }, 1600);
}

// ── Som ───────────────────────────────────────────────────────────────────────

let _audio;
function tocarSom() {
  try {
    _audio ||= new (window.AudioContext || window.webkitAudioContext)();
    const t = _audio.currentTime, osc = _audio.createOscillator(), g = _audio.createGain();
    osc.connect(g); g.connect(_audio.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(660, t);
    osc.frequency.exponentialRampToValueAtTime(880, t + 0.12);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    osc.start(t); osc.stop(t + 0.36);
  } catch (_) {}
}

// ── Eventos ───────────────────────────────────────────────────────────────────

function ligarEventos() {
  // os avisos ficam logo acima da caixa de pergunta, qualquer que seja a altura dela
  new ResizeObserver(([e]) => {
    document.documentElement.style.setProperty('--rodape-h', `${Math.round(e.target.offsetHeight)}px`);
  }).observe(document.querySelector('.rodape-pergunta'));
  // Início
  $('formChaves').addEventListener('submit', entrar);
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-mostrar]');
    if (!b) return;
    const campo = $(b.dataset.mostrar);
    const mostrar = campo.type === 'password';
    campo.type = mostrar ? 'text' : 'password';
    b.innerHTML = mostrar ? ICONE.olhoFech : ICONE.olho;
    b.setAttribute('aria-pressed', String(mostrar));
  });

  // Compositor
  const campo = $('pergunta');
  $('compositor').addEventListener('submit', e => { e.preventDefault(); estado.ocupado ? parar() : enviar(); });
  campo.addEventListener('input', aoEditar);
  campo.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !toque()) {
      e.preventDefault();
      if (!estado.ocupado) enviar();
    }
  });
  campo.addEventListener('paste', e => {
    const arq = [...(e.clipboardData?.files || [])][0];
    if (arq) { e.preventDefault(); anexar(arq); }
  });
  $('btnAnexo').addEventListener('click', () => (estado.demo ? toast('Na demonstração não dá para anexar arquivos.') : $('arquivo').click()));
  $('arquivo').addEventListener('change', e => { anexar(e.target.files[0]); e.target.value = ''; });
  $('btnTirarAnexo').addEventListener('click', () => { tirarAnexo(); campo.focus(); });
  $('btnTirarCitacao').addEventListener('click', () => { tirarCitacao(); campo.focus(); });
  $('btnOrdem').addEventListener('click', () => definirOrdem(papeis().respondente === 'deepseek' ? 'chatgpt' : 'deepseek'));
  const principal = $('principal');
  principal.addEventListener('dragover', e => { if (e.dataTransfer?.types.includes('Files')) { e.preventDefault(); principal.classList.add('soltando'); } });
  principal.addEventListener('dragleave', e => { if (!principal.contains(e.relatedTarget)) principal.classList.remove('soltando'); });
  principal.addEventListener('drop', e => {
    principal.classList.remove('soltando');
    const arq = e.dataTransfer?.files?.[0];
    if (arq) { e.preventDefault(); anexar(arq); }
  });

  // Conversa (delegação)
  $('conversa').addEventListener('click', e => {
    const ex = e.target.closest('[data-exemplo]');
    if (ex) { enviar({ texto: ex.dataset.exemplo }); return; }
    const b = e.target.closest('[data-acao]');
    if (!b) return;
    const aviso = b.closest('.aviso');
    if (aviso) {
      const fn = acoesDeAviso.get(aviso)?.[b.dataset.acao];
      if (fn) { aviso.remove(); fn(); }
      return;
    }
    const art = b.closest('.msg');
    const m = art && estado.conversa.mensagens.find(x => x.id === art.dataset.id);
    switch (b.dataset.acao) {
      case 'copiar':        if (m) copiarTexto(m.texto, b); break;
      case 'copiar-codigo': copiarTexto(b.closest('.md-codigo').querySelector('pre').innerText.replace(/\n$/, ''), b); break;
      case 'citar':         if (m) citar(m.id); break;
      case 'outra':         if (m) outraResposta(m.turno); break;
    }
  });
  rolagem().addEventListener('scroll', aoRolar, { passive: true });
  $('btnIrFim').addEventListener('click', () => { $('btnIrFim').hidden = true; rolarParaFim(); });

  // Lateral
  $('btnNova').addEventListener('click', () => novaConversa());
  $('busca').addEventListener('input', renderizarLista);
  $('listaConversas').addEventListener('click', e => {
    const ex = e.target.closest('[data-excluir]');
    if (ex) { excluirConversa(ex.dataset.excluir); return; }
    const c = e.target.closest('[data-conv]');
    if (c) carregarConversa(c.dataset.conv);
  });
  $('btnLateral').addEventListener('click', abrirLateral);
  $('btnFecharLateral').addEventListener('click', fecharLateral);
  $('veu').addEventListener('click', fecharLateral);
  matchMedia('(max-width: 899px)').addEventListener('change', () => fecharLateral());

  // Menu
  $('btnMenu').addEventListener('click', () => ($('menu').hidden ? abrirMenu() : fecharMenu()));
  $('menu').addEventListener('keydown', teclaNoMenu);
  $('menu').addEventListener('click', e => {
    const b = e.target.closest('[data-menu]');
    if (b && b.getAttribute('aria-disabled') !== 'true') acaoDoMenu(b.dataset.menu);
  });
  document.addEventListener('pointerdown', e => {
    if (!$('menu').hidden && !e.target.closest('.menu-caixa')) fecharMenu();
  });

  // Diálogos
  document.querySelectorAll('dialog [data-fechar]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
  document.querySelectorAll('dialog.dlg:not(.dlg-pequeno)').forEach(d => d.addEventListener('click', e => { if (e.target === d) d.close(); }));
  $('ajSalvarChaves').addEventListener('click', salvarChavesDosAjustes);
  $('ajEsquecer').addEventListener('click', esquecerChavesDosAjustes);
  $('ajApagarHistorico').addEventListener('click', apagarTudo);
  $('dlgAjustes').addEventListener('change', e => {
    const t = e.target;
    if (t.name === 'ordem') definirOrdem(t.value);
    if (t.name === 'tema') window.deepchatTema?.definir(t.value);
    if (t.id === 'ajModelo') { estado.prefs.modelo = t.value; arm.salvarPreferencias(estado.prefs); }
    if (t.id === 'ajSom') { estado.prefs.som = t.checked; arm.salvarPreferencias(estado.prefs); if (t.checked) tocarSom(); }
  });
  $('diag').addEventListener('click', async e => {
    const b = e.target.closest('[data-diag]');
    if (!b) return;
    if (b.dataset.diag === 'copiar') {
      const info = { app: 'DeepChat', navegador: navigator.userAgent, quando: agoraIso(), erros: window.errosRegistrados() };
      copiarTexto(JSON.stringify(info, null, 2));
    } else {
      window.errosLimpar();
      $('diag').hidden = true;
      toast('Registro de falhas apagado.');
    }
  });

  // Teclado
  document.addEventListener('keydown', e => {
    if ($('telaApp').hidden || document.querySelector('dialog[open]')) return;
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') { e.preventDefault(); novaConversa(); return; }
    if (e.key === 'Escape') {
      if (!$('menu').hidden) { fecharMenu(true); return; }
      if ($('lateral').classList.contains('aberta')) { fecharLateral(); return; }
      if (estado.ocupado) { e.preventDefault(); parar(); }
    }
  });

  // Rede, impressão, falhas
  addEventListener('online', () => { $('faixaOffline').hidden = true; });
  addEventListener('offline', () => { $('faixaOffline').hidden = false; });
  addEventListener('beforeprint', antesDeImprimir);
  addEventListener('afterprint', depoisDeImprimir);
  let avisouFalha = false;
  addEventListener('deepchat:erro', () => {
    if (avisouFalha || $('telaApp').hidden) return;
    avisouFalha = true;
    toast('Algo falhou e ficou registrado.', { acao: abrirSobre, rotulo: 'Ver detalhes', tipo: 'erro', duracao: 9000 });
  });
}

iniciar();
