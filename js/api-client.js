/**
 * api-client.js — DeepChat
 * Chamadas ao DeepSeek e à OpenAI, direto do navegador.
 * - a resposta chega aos pedaços (stream), lida por criarLeitorSSE;
 * - AbortController por pergunta (RequestChain), para o botão Parar;
 * - tempo limite: 60 s sem receber nada (cada pedaço renova o prazo);
 * - nova tentativa com espera exponencial em falha de rede, tempo esgotado e
 *   erro 5xx, só enquanto nenhum texto chegou (depois disso, o texto já está na tela);
 * - circuit breaker por API: depois de 3 falhas seguidas, espera 30 s.
 */

export const CONFIG = {
  ENDPOINTS: {
    deepseek: 'https://api.deepseek.com/v1/chat/completions',
    chatgpt:  'https://api.openai.com/v1/chat/completions',
  },
  DEEPSEEK_MODEL:  'deepseek-chat',
  MODELOS_CHATGPT: [
    { id: 'gpt-4o-mini', nome: 'GPT-4o mini', detalhe: 'rápido e barato' },
    { id: 'gpt-4o',      nome: 'GPT-4o',      detalhe: 'mais caprichado' },
  ],
  MAX_CONTEXTO:    10,
  TIMEOUT_MS:      60_000,
  MAX_TENTATIVAS:  3,
  ESPERA_BASE_MS:  1_000,
  CIRCUITO_MS:     30_000,
  MAX_IMAGEM_PX:   1024,
  MAX_TEXTO_ANEXO: 20_000,
};

// ── Erros com tipo, para a tela explicar em português ────────────────────────

export class ErroApi extends Error {
  /** @param {'chave'|'cota'|'tempo'|'rede'|'circuito'|'servidor'|'pedido'} tipo */
  constructor(tipo, mensagem, extra = {}) {
    super(mensagem);
    this.name = 'ErroApi';
    this.tipo = tipo;
    Object.assign(this, extra);
  }
}

export const ehCancelamento = e => e?.name === 'AbortError' || e?.tipo === 'cancelado';

// ── Circuit breaker ───────────────────────────────────────────────────────────

class Disjuntor {
  constructor() { this.falhas = 0; this.abertoAte = 0; }
  aberto()   { return Date.now() < this.abertoAte; }
  sucesso()  { this.falhas = 0; }
  falha()    { if (++this.falhas >= 3) { this.abertoAte = Date.now() + CONFIG.CIRCUITO_MS; this.falhas = 0; } }
  restante() { return Math.max(0, Math.ceil((this.abertoAte - Date.now()) / 1000)); }
}
const disjuntores = { deepseek: new Disjuntor(), chatgpt: new Disjuntor() };

// ── Cadeia cancelável ─────────────────────────────────────────────────────────

export class RequestChain {
  constructor() { this._ctrl = new AbortController(); }
  get signal()    { return this._ctrl.signal; }
  get cancelled() { return this._ctrl.signal.aborted; }
  cancel()        { this._ctrl.abort(); }
}

// ── Núcleo ────────────────────────────────────────────────────────────────────

const dormir = (ms, signal) => new Promise((res, rej) => {
  const t = setTimeout(res, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); rej(new DOMException('Cancelado', 'AbortError')); }, { once: true });
});

const transitorio = e => e instanceof ErroApi && ['tempo', 'rede', 'servidor'].includes(e.tipo);

/**
 * Lê o fluxo da API de chat (Server-Sent Events, o mesmo formato no DeepSeek
 * e na OpenAI): linhas "data: {json}" e, no fim, "data: [DONE]". Os pedaços da
 * rede cortam linhas ao meio; o leitor guarda o resto até a linha fechar.
 * Função pura, testada em tests/api.test.mjs.
 * @returns {{ler: (pedaco: string) => object[], fechar: () => object[]}}
 *   cada evento é {texto} (um pedaço da resposta), {fim: true} ou {erro}.
 */
export function criarLeitorSSE() {
  let resto = '';
  const evento = linha => {
    if (!linha.startsWith('data:')) return null;   // linha vazia, ": keep-alive", event:, id:
    const dado = linha.slice(5).trim();
    if (dado === '[DONE]') return { fim: true };
    let j;
    try { j = JSON.parse(dado); } catch { return null; }
    if (j?.error) return { erro: String(j.error.message || 'Erro no meio da resposta') };
    const texto = j?.choices?.[0]?.delta?.content;
    return typeof texto === 'string' && texto ? { texto } : null;
  };
  return {
    ler(pedaco) {
      const linhas = (resto + pedaco).split(/\r?\n/);
      resto = linhas.pop();
      return linhas.map(evento).filter(Boolean);
    },
    fechar() {
      const ultimo = resto ? evento(resto) : null;
      resto = '';
      return ultimo ? [ultimo] : [];
    },
  };
}

async function chamar(ia, corpo, chaveApi, signal, aoParcial) {
  const limite = new AbortController();
  // o prazo conta o tempo sem receber nada: cada pedaço que chega renova
  let timer;
  const armar = () => { clearTimeout(timer); timer = setTimeout(() => limite.abort(), CONFIG.TIMEOUT_MS); };
  armar();
  // Junta o Parar do usuário e o tempo limite. Sem AbortSignal.any (Safari < 17.4),
  // liga à mão: o Parar também aborta o controlador do tempo limite.
  let sinal = limite.signal;
  if (signal && AbortSignal.any) sinal = AbortSignal.any([signal, limite.signal]);
  else if (signal) signal.addEventListener('abort', () => limite.abort(), { once: true });
  const falhaDeRede = (e, parcial = '') => {
    if (signal?.aborted) return e;
    if (limite.signal.aborted) return new ErroApi('tempo', 'Tempo esgotado', { parcial });
    return new ErroApi('rede', e?.message || 'Falha de rede', { parcial });
  };
  try {
    let resp;
    try {
      resp = await fetch(CONFIG.ENDPOINTS[ia], {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${chaveApi}` },
        body: JSON.stringify(corpo),
        signal: sinal,
      });
    } catch (e) {
      throw falhaDeRede(e);
    }
    if (!resp.ok) {
      const j = await resp.json().catch(() => ({}));
      const msg = j?.error?.message || `HTTP ${resp.status}`;
      if (resp.status === 401 || resp.status === 403) throw new ErroApi('chave', msg, { status: resp.status });
      if (resp.status === 402 || resp.status === 429) throw new ErroApi('cota', msg, { status: resp.status });
      if (resp.status >= 500) throw new ErroApi('servidor', msg, { status: resp.status });
      throw new ErroApi('pedido', msg, { status: resp.status });
    }
    // sem stream (um proxy, uma API que ignorou o pedido): a resposta vem inteira
    if (!/text\/event-stream/i.test(resp.headers.get('content-type') || '')) {
      let dados;
      try { dados = await resp.json(); } catch (e) { throw falhaDeRede(e); }
      const texto = dados?.choices?.[0]?.message?.content;
      if (!texto || !String(texto).trim()) throw new ErroApi('servidor', 'Resposta vazia');
      aoParcial?.(String(texto));
      return String(texto);
    }

    const leitor = criarLeitorSSE();
    const decodificador = new TextDecoder();
    const corrente = resp.body.getReader();
    let texto = '';
    const usar = eventos => {
      for (const ev of eventos) {
        if (ev.erro) throw new ErroApi('servidor', ev.erro, { parcial: texto });
        if (ev.texto) { texto += ev.texto; aoParcial?.(texto); }
      }
    };
    for (;;) {
      let pedaco;
      try { pedaco = await corrente.read(); } catch (e) { throw falhaDeRede(e, texto); }
      if (pedaco.done) break;
      armar();
      usar(leitor.ler(decodificador.decode(pedaco.value, { stream: true })));
    }
    usar(leitor.ler(decodificador.decode()));
    usar(leitor.fechar());
    if (!texto.trim()) throw new ErroApi('servidor', 'Resposta vazia');
    return texto;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Consulta uma IA. A resposta chega aos pedaços: `aoParcial` recebe o texto
 * acumulado a cada pedaço, e a promessa resolve com o texto inteiro.
 * Se a falha vem depois de algum texto, o erro traz `parcial` e não há nova
 * tentativa (o começo já foi mostrado).
 * @param {'deepseek'|'chatgpt'} ia
 * @param {{role: string, content: any}[]} mensagens
 * @param {{chave: string, modelo?: string, temperatura?: number, signal?: AbortSignal,
 *          aoParcial?: (texto: string) => void}} opcoes
 */
export async function consultar(ia, mensagens, { chave, modelo, temperatura = 0.7, signal, aoParcial } = {}) {
  const disj = disjuntores[ia];
  if (disj.aberto()) throw new ErroApi('circuito', 'Muitas falhas seguidas', { segundos: disj.restante() });
  const corpo = {
    model: ia === 'deepseek' ? CONFIG.DEEPSEEK_MODEL : (modelo || CONFIG.MODELOS_CHATGPT[0].id),
    messages: mensagens,
    temperature: temperatura,
    stream: true,
  };
  for (let tentativa = 1; ; tentativa++) {
    try {
      const texto = await chamar(ia, corpo, chave, signal, aoParcial);
      disj.sucesso();
      return texto;
    } catch (e) {
      if (ehCancelamento(e) || signal?.aborted) throw e;
      if (!transitorio(e) || e.parcial || tentativa >= CONFIG.MAX_TENTATIVAS) {
        if (transitorio(e)) disj.falha();
        throw e;
      }
      const espera = CONFIG.ESPERA_BASE_MS * 2 ** (tentativa - 1) * (0.8 + Math.random() * 0.4);
      await dormir(espera, signal);
    }
  }
}

// ── Anexos ────────────────────────────────────────────────────────────────────

export const EXTENSOES_TEXTO = ['txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'xml', 'yml', 'yaml', 'log',
  'html', 'css', 'js', 'mjs', 'ts', 'jsx', 'tsx', 'py', 'java', 'c', 'cpp', 'cs', 'go', 'rs', 'php', 'rb', 'sql', 'sh'];
export const TIPOS_IMAGEM = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

function blocoDoArquivo(anexo) {
  const corpo = anexo.texto.length > CONFIG.MAX_TEXTO_ANEXO
    ? anexo.texto.slice(0, CONFIG.MAX_TEXTO_ANEXO) + '\n…(arquivo cortado aqui)'
    : anexo.texto;
  return `Arquivo anexado: ${anexo.nome}\n\`\`\`\n${corpo}\n\`\`\``;
}

/** Conteúdo do usuário com o anexo, no formato da API de chat. */
export function conteudoComAnexo(texto, anexo) {
  if (!anexo) return texto;
  if (anexo.imagem) {
    return [
      { type: 'text', text: texto || 'Descreva esta imagem.' },
      { type: 'image_url', image_url: { url: anexo.dataUrl } },
    ];
  }
  return `${blocoDoArquivo(anexo)}\n\n${texto || 'Analise o arquivo acima.'}`;
}

/** O que o revisor fica sabendo do anexo (a imagem vai junto só se ele enxerga). */
export function anexoParaRevisor(anexo, revisorVeImagem) {
  if (!anexo) return '';
  if (anexo.imagem) {
    return revisorVeImagem
      ? `Uma imagem (${anexo.nome}), enviada junto com este pedido.`
      : `Uma imagem (${anexo.nome}), que você não consegue ver. Revise só o que dá para conferir sem ela e diga isso na precisão.`;
  }
  return blocoDoArquivo(anexo);
}

/** Reduz a imagem (no máximo 1024 px no lado maior) e devolve um data URL JPEG. */
export function reduzirImagem(arquivo) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(arquivo);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const r = Math.min(CONFIG.MAX_IMAGEM_PX / img.width, CONFIG.MAX_IMAGEM_PX / img.height, 1);
      const canvas = document.createElement('canvas');
      canvas.width  = Math.max(1, Math.round(img.width * r));
      canvas.height = Math.max(1, Math.round(img.height * r));
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';                       // PNG transparente vira fundo branco, não preto
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não deu para abrir a imagem.')); };
    img.src = url;
  });
}
