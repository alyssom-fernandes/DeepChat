/**
 * revisao.js — DeepChat
 * Os prompts e a leitura da revisão. A revisão vem num formato fixo
 * (veredito + seções) para a tela mostrar o veredito em destaque e cada
 * parte no seu lugar. Se o modelo fugir do formato, a revisão aparece
 * inteira, como Markdown comum. Funções puras, testadas em tests/.
 */

export const SISTEMA_RESPOSTA =
  'Você é um assistente útil, preciso e direto. Responda sempre em português do Brasil. ' +
  'Use Markdown quando ajudar a leitura (listas, tabelas, blocos de código).';

export const SISTEMA_REVISAO =
  'Você é um revisor crítico. Confere a resposta de outra IA com rigor, sem bajulação, ' +
  'e aponta erros concretos. Responde sempre em português do Brasil e segue o formato pedido.';

const NOMES = { deepseek: 'DeepSeek', chatgpt: 'ChatGPT' };
export const nomeDaIA = ia => NOMES[ia] || 'IA';

/**
 * Prompt da revisão.
 * @param {object} p
 * @param {string} p.pergunta  pergunta do usuário (já com a citação, se houver)
 * @param {string} p.resposta  resposta a revisar
 * @param {string} p.quem      'deepseek' | 'chatgpt' (quem respondeu)
 * @param {string} [p.contexto] conversa anterior resumida
 * @param {string} [p.anexo]   descrição ou conteúdo do anexo
 */
export function promptRevisao({ pergunta, resposta, quem, contexto = '', anexo = '' }) {
  return [
    `Revise a resposta que o ${nomeDaIA(quem)} deu à pergunta abaixo.`,
    '',
    'PERGUNTA DO USUÁRIO:',
    pergunta,
    anexo ? `\nANEXO ENVIADO COM A PERGUNTA:\n${anexo}` : '',
    '',
    `RESPOSTA DO ${nomeDaIA(quem).toUpperCase()}:`,
    resposta,
    contexto ? `\nCONVERSA ANTERIOR (resumo):\n${contexto}` : '',
    '',
    'Responda exatamente neste formato, em Markdown, sem nada antes da primeira linha:',
    '',
    'Veredito: Correta | Parcialmente correta | Incorreta',
    '',
    '## Precisão',
    'Uma ou duas frases: os fatos, números, código e raciocínio estão certos?',
    '',
    '## Pontos fortes',
    '- até 3 itens curtos',
    '',
    '## A melhorar',
    '- até 3 itens; cada um diz o que está errado ou faltando, e por quê',
    '- se não houver nada relevante, escreva só "- Nada relevante."',
    '',
    '## Sugestões',
    'Uma frase ou uma lista curta do que mudar.',
    '',
    '## Versão revisada',
    'Só se houver erro ou lacuna importante: a resposta corrigida e completa. Caso contrário, omita esta seção.',
  ].filter(l => l !== null).join('\n').replace(/\n{3,}/g, '\n\n');
}

// ── Leitura ───────────────────────────────────────────────────────────────────

export const TITULOS = {
  precisao:  'Precisão',
  fortes:    'Pontos fortes',
  melhorar:  'A melhorar',
  sugestoes: 'Sugestões',
  versao:    'Versão revisada',
};

export const VEREDITOS = {
  correta:   'Correta',
  parcial:   'Parcialmente correta',
  incorreta: 'Incorreta',
};

const semAcento = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Tira emoji, marcação e espaços das pontas de uma linha de título. */
function limparTitulo(linha) {
  return linha
    .replace(/^[\s#>*_\-\p{Extended_Pictographic}\u{FE0F}\u{200D}]+/u, '')
    .replace(/[*_]+/g, '')
    .trim();
}

function chaveDoTitulo(titulo) {
  const t = semAcento(titulo);
  if (/^precisao\b/.test(t))                          return 'precisao';
  if (/^pontos? fortes?\b/.test(t))                    return 'fortes';
  if (/^(pontos? )?a melhorar\b|^melhorias\b/.test(t)) return 'melhorar';
  if (/^sugest/.test(t))                               return 'sugestoes';
  if (/^versao revisada\b/.test(t))                    return 'versao';
  return null;
}

export function lerVeredito(valor) {
  const v = semAcento(String(valor ?? ''));
  if (/parcial/.test(v))  return 'parcial';
  if (/incorret/.test(v)) return 'incorreta';
  if (/corret/.test(v))   return 'correta';
  return null;
}

/** Corpo vazio ou de "não precisa": a seção some. */
function corpoVazio(corpo) {
  const t = semAcento(corpo.replace(/[[\]()*_\-•.]/g, ' ').trim());
  return t.length < 3 || /^(nao (e )?necessari|nenhuma|omitid|texto$|n\/a)/.test(t);
}

/**
 * Lê a revisão.
 * @returns {{veredito: string|null, secoes: {chave: string, titulo: string, corpo: string}[], introducao: string}}
 *   `secoes` vazio quer dizer "fora do formato": mostrar o texto inteiro.
 */
export function lerRevisao(texto) {
  const linhas = String(texto ?? '').replace(/\r\n/g, '\n').split('\n');
  let veredito = null;
  const secoes = [];
  const intro = [];
  let atual = null;

  for (const linha of linhas) {
    const limpa = limparTitulo(linha);
    const mv = !veredito && /^veredito\s*:/i.test(semAcento(limpa)) ? limpa.split(':').slice(1).join(':') : null;
    if (mv !== null) { veredito = lerVeredito(mv); continue; }

    // "## Precisão", "✅ PRECISÃO: texto", "**Pontos fortes:**"
    const ehTitulo = /^\s*(#{1,4}\s|[*_]{2}|\p{Extended_Pictographic})/u.test(linha) || /^[A-ZÀ-Ú ]{5,}:?/.test(limpa);
    const [cabeca, ...resto] = limpa.split(':');
    const chave = ehTitulo ? chaveDoTitulo(cabeca.replace(/\(.*?\)/g, '').trim()) : null;
    if (chave) {
      atual = { chave, titulo: TITULOS[chave], linhas: [] };
      secoes.push(atual);
      const mesmaLinha = resto.join(':').trim();
      if (mesmaLinha) atual.linhas.push(mesmaLinha);
      continue;
    }
    (atual ? atual.linhas : intro).push(linha);
  }

  const prontas = secoes
    .map(s => ({ chave: s.chave, titulo: s.titulo, corpo: s.linhas.join('\n').replace(/^\s*•\s*/gm, '- ').trim() }))
    .filter(s => !corpoVazio(s.corpo));

  // Formato antigo, sem a linha "Veredito": vale a primeira palavra da precisão
  // ("✅ PRECISÃO: Correta."), se ela for um veredito.
  if (!veredito) {
    const precisao = prontas.find(s => s.chave === 'precisao');
    const inicio = precisao && semAcento(precisao.corpo).match(/^(parcialmente corret[ao]|incorret[ao]|corret[ao])\b/);
    if (inicio) veredito = lerVeredito(inicio[1]);
  }

  return { veredito, secoes: prontas, introducao: intro.join('\n').trim() };
}
