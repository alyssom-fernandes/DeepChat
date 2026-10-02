/**
 * api-client.js — DeepChat
 * Chamadas ao DeepSeek e à OpenAI, direto do navegador.
 * - AbortController por pergunta (RequestChain), para o botão Parar;
 * - tempo limite por chamada;
 * - nova tentativa com espera exponencial em falha de rede, tempo esgotado e erro 5xx;
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

async function chamar(ia, corpo, chaveApi, signal) {
  const limite = new AbortController();
  const timer  = setTimeout(() => limite.abort(), CONFIG.TIMEOUT_MS);
  // Junta o Parar do usuário e o tempo limite. Sem AbortSignal.any (Safari < 17.4),
  // liga à mão: o Parar também aborta o controlador do tempo limite.
  let sinal = limite.signal;
  if (signal && AbortSignal.any) sinal = AbortSignal.any([signal, limite.signal]);
  else if (signal) signal.addEventListener('abort', () => limite.abort(), { once: true });
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
      if (signal?.aborted) throw e;
      if (limite.signal.aborted) throw new ErroApi('tempo', 'Tempo esgotado');
      throw new ErroApi('rede', e.message || 'Falha de rede');
    }
    if (!resp.ok) {
      const j = await resp.json().catch(() => ({}));
      const msg = j?.error?.message || `HTTP ${resp.status}`;
      if (resp.status === 401 || resp.status === 403) throw new ErroApi('chave', msg, { status: resp.status });
      if (resp.status === 402 || resp.status === 429) throw new ErroApi('cota', msg, { status: resp.status });
      if (resp.status >= 500) throw new ErroApi('servidor', msg, { status: resp.status });
      throw new ErroApi('pedido', msg, { status: resp.status });
    }
    const dados = await resp.json();
    const texto = dados?.choices?.[0]?.message?.content;
    if (!texto || !String(texto).trim()) throw new ErroApi('servidor', 'Resposta vazia');
    return String(texto);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Consulta uma IA.
 * @param {'deepseek'|'chatgpt'} ia
 * @param {{role: string, content: any}[]} mensagens
 * @param {{chave: string, modelo?: string, temperatura?: number, signal?: AbortSignal}} opcoes
 */
export async function consultar(ia, mensagens, { chave, modelo, temperatura = 0.7, signal } = {}) {
  const disj = disjuntores[ia];
  if (disj.aberto()) throw new ErroApi('circuito', 'Muitas falhas seguidas', { segundos: disj.restante() });
  const corpo = {
    model: ia === 'deepseek' ? CONFIG.DEEPSEEK_MODEL : (modelo || CONFIG.MODELOS_CHATGPT[0].id),
    messages: mensagens,
    temperature: temperatura,
  };
  for (let tentativa = 1; ; tentativa++) {
    try {
      const texto = await chamar(ia, corpo, chave, signal);
      disj.sucesso();
      return texto;
    } catch (e) {
      if (ehCancelamento(e) || signal?.aborted) throw e;
      if (!transitorio(e) || tentativa >= CONFIG.MAX_TENTATIVAS) {
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
