/**
 * realce.js — DeepChat
 * Cores nos blocos de código das respostas, sem biblioteca. Um leitor simples
 * por família de linguagem marca comentários, textos, números, palavras-chave,
 * funções e chaves; o que ele não reconhece fica sem cor. Não é um analisador
 * completo, e não precisa ser: a cor só ajuda a ler.
 * Função pura: recebe o texto do código e devolve HTML com todo o texto
 * escapado (testado em tests/realce.test.mjs).
 *
 * Classes: tk-c comentário · tk-s texto · tk-n número e literal · tk-k palavra-chave
 *          tk-f função · tk-p chave, propriedade e atributo
 */

import { esc } from './texto.js';

const lista = s => new Set(s.split(' '));

const PALAVRAS_JS = 'as async await break case catch class const continue debugger default delete do else export extends ' +
  'finally for from function get if import in instanceof let new of return set static super switch this throw try typeof ' +
  'var void while with yield';
const PALAVRAS_TS = ' abstract declare enum implements interface keyof namespace private protected public readonly type satisfies';
const PALAVRAS_C = 'abstract as async auto await bool boolean break byte case catch char class const continue def default defer ' +
  'delegate do double dyn echo else enum explicit export extends extern final finally float fn for foreach func go goto if impl ' +
  'implements import in inline int interface internal is let long loop match mod move mut namespace new object operator override ' +
  'package private protected pub public readonly ref register return sealed select short signed sizeof static string struct ' +
  'super switch synchronized template this throw throws trait try type typedef typename union unsafe unsigned use using var ' +
  'virtual void volatile when where while yield';
const PALAVRAS_PY = 'and as assert async await break class continue def del elif else except finally for from global if import ' +
  'in is lambda match case nonlocal not or pass raise return try while with yield self print';
const PALAVRAS_SQL = 'add all alter and as asc between by case check column constraint create cross database default delete desc ' +
  'distinct drop else end exists foreign from full group having if in index inner insert into is join key left like limit not ' +
  'null offset on or order outer primary references returning right select set table then union unique update values view when ' +
  'where with';
const PALAVRAS_SH = 'case do done elif else esac exit export fi for function if in local readonly return select set shift source ' +
  'then unset until while echo cd';
const LITERAIS = lista('true false null undefined NaN Infinity None True False nil');

// ── Regras comuns ─────────────────────────────────────────────────────────────

const R = {
  linhaBarra:  /\/\/[^\n]*/y,
  bloco:       /\/\*[\s\S]*?(?:\*\/|$)/y,
  linhaHash:   /#[^\n]*/y,
  linhaTraco:  /--[^\n]*/y,
  aspas:       /"(?:\\.|[^\\"\n])*"?|'(?:\\.|[^\\'\n])*'?/y,
  crase:       /`(?:\\[\s\S]|[^\\`])*`?/y,
  numero:      /(?:0[xX][\da-fA-F_]+|0[bB][01_]+|\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?[nfFdDlLuU]?)(?![\w$])/y,
  ident:       /[A-Za-z_$][\w$]*/y,
  regex:       /\/(?![*/])(?:\\.|\[(?:\\.|[^\]\\\n])*\]|[^/\\\n[])+\/[dgimsuyv]*/y,
  textoPy:     /(?:[rRbBuUfF]{1,2})?(?:"""[\s\S]*?(?:"""|$)|'''[\s\S]*?(?:'''|$)|"(?:\\.|[^\\"\n])*"?|'(?:\\.|[^\\'\n])*'?)/y,
  decorador:   /@[\w.]+/y,
  preproc:     /#\s*[a-z]+/y,
  variavelSh:  /\$\{[^}\n]*\}|\$[\w@#?$!*-]/y,
};

/**
 * Leitor genérico: a cada posição tenta as regras em ordem; sem regra, o
 * caractere passa sem cor. `regexDepois` decide se uma "/" abre uma regex (JS).
 */
function varrer(codigo, familia) {
  const { regras, palavras, maiusculas = false } = familia;
  let html = '', simples = '', i = 0;
  let podeRegex = true;          // JS: depois de operador ou no começo, "/" abre regex
  const soltar = () => { if (simples) { html += esc(simples); simples = ''; } };
  const marcar = (classe, txt) => { soltar(); html += `<span class="tk-${classe}">${esc(txt)}</span>`; };

  while (i < codigo.length) {
    let casou = false;
    for (const [re, classe, condicao] of regras) {
      if (condicao && !condicao(codigo, i, podeRegex)) continue;
      re.lastIndex = i;
      const m = re.exec(codigo);
      if (!m || !m[0]) continue;
      const txt = m[0];
      if (classe === 'ident') {
        const chave = maiusculas ? txt.toLowerCase() : txt;
        if (palavras.has(chave)) { marcar('k', txt); podeRegex = true; }
        else if (LITERAIS.has(txt)) { marcar('n', txt); podeRegex = false; }
        else if (/^\s*\(/.test(codigo.slice(i + txt.length, i + txt.length + 8))) { marcar('f', txt); podeRegex = false; }
        else { simples += txt; podeRegex = false; }
      } else if (typeof classe === 'function') {
        soltar(); html += classe(txt, codigo, i + txt.length);
        podeRegex = false;
      } else {
        marcar(classe, txt);
        podeRegex = classe === 'c' ? podeRegex : false;
      }
      i += txt.length;
      casou = true;
      break;
    }
    if (casou) continue;
    const ch = codigo[i++];
    simples += ch;
    if (!/\s/.test(ch)) podeRegex = !/[)\]}]/.test(ch);
  }
  soltar();
  return html;
}

const inicioDeLinhaOuEspaco = (codigo, i) => i === 0 || /\s/.test(codigo[i - 1]);
const inicioDeLinha = (codigo, i) => { let j = i - 1; while (j >= 0 && (codigo[j] === ' ' || codigo[j] === '\t')) j--; return j < 0 || codigo[j] === '\n'; };
const regexAqui = (_c, _i, podeRegex) => podeRegex;

// chave de JSON ou YAML: o texto seguido de ":" vira chave
const textoOuChave = (txt, codigo, fim) =>
  `<span class="tk-${/^\s*:/.test(codigo.slice(fim, fim + 4)) ? 'p' : 's'}">${esc(txt)}</span>`;

const FAMILIAS = {
  js: {
    palavras: lista(PALAVRAS_JS + PALAVRAS_TS),
    regras: [[R.linhaBarra, 'c'], [R.bloco, 'c'], [R.crase, 's'], [R.aspas, 's'], [R.regex, 's', regexAqui],
             [R.numero, 'n'], [R.ident, 'ident']],
  },
  c: {
    palavras: lista(PALAVRAS_C),
    regras: [[R.linhaBarra, 'c'], [R.bloco, 'c'], [R.preproc, 'k', inicioDeLinha], [R.crase, 's'], [R.aspas, 's'],
             [R.numero, 'n'], [R.ident, 'ident']],
  },
  py: {
    palavras: lista(PALAVRAS_PY),
    regras: [[R.linhaHash, 'c'], [R.textoPy, 's'], [R.decorador, 'k'], [R.numero, 'n'], [R.ident, 'ident']],
  },
  sql: {
    palavras: lista(PALAVRAS_SQL), maiusculas: true,
    regras: [[R.linhaTraco, 'c'], [R.bloco, 'c'], [R.aspas, 's'], [R.numero, 'n'], [R.ident, 'ident']],
  },
  sh: {
    palavras: lista(PALAVRAS_SH),
    regras: [[R.linhaHash, 'c', inicioDeLinhaOuEspaco], [R.variavelSh, 'p'], [R.aspas, 's'], [R.numero, 'n'],
             [/[A-Za-z_][\w-]*/y, 'ident']],
  },
  json: {
    palavras: new Set(),
    regras: [[R.linhaBarra, 'c'], [R.bloco, 'c'], [/"(?:\\.|[^\\"\n])*"?/y, textoOuChave], [/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/y, 'n'],
             [R.ident, 'ident']],
  },
  yaml: {
    palavras: new Set(),
    regras: [[R.linhaHash, 'c', inicioDeLinhaOuEspaco], [R.aspas, textoOuChave],
             [/[\w.-]+(?=\s*:(?:\s|$))/y, 'p'], [/-?\d+(?:\.\d+)?(?![\w.])/y, 'n'], [R.ident, 'ident']],
  },
  css: {
    palavras: new Set(),
    regras: [[R.bloco, 'c'], [R.aspas, 's'], [/@[\w-]+/y, 'k'], [/#[\da-fA-F]{3,8}(?![\w-])/y, 'n'],
             [/-?(?:\d*\.)?\d+(?:%|[a-zA-Z]+)?/y, 'n'], [/--?[A-Za-z][\w-]*(?=\s*:[^{\n]*(?:;|\n|$))/y, 'p'],
             [/[A-Za-z][\w-]*(?=\s*:[^{\n]*(?:;|\n|$))/y, 'p'], [/[A-Za-z_-][\w-]*(?=\()/y, 'f']],
  },
};

/** HTML e XML: só colore dentro das tags (o texto entre elas fica como está). */
function varrerHtml(codigo) {
  let html = '';
  const re = /<!--[\s\S]*?(?:-->|$)|<\/?[A-Za-z][\w:.-]*[^>]*>?/g;
  let fim = 0, m;
  while ((m = re.exec(codigo))) {
    html += esc(codigo.slice(fim, m.index));
    fim = m.index + m[0].length;
    if (m[0].startsWith('<!--')) { html += `<span class="tk-c">${esc(m[0])}</span>`; continue; }
    const [, abre, nome, resto] = m[0].match(/^(<\/?)([\w:.-]+)([\s\S]*)$/);
    html += esc(abre) + `<span class="tk-k">${esc(nome)}</span>` + resto.replace(
      /("[^"]*"?|'[^']*'?)|([\w:.@-]+)(?=\s*=)|([^"'\w:.@-]+|[\w:.@-]+)/g,
      (_, texto, atributo, outro) => texto ? `<span class="tk-s">${esc(texto)}</span>`
        : atributo ? `<span class="tk-p">${esc(atributo)}</span>` : esc(outro));
  }
  return html + esc(codigo.slice(fim));
}

const APELIDOS = {
  js: 'js', javascript: 'js', mjs: 'js', cjs: 'js', jsx: 'js', ts: 'js', typescript: 'js', tsx: 'js', node: 'js',
  c: 'c', h: 'c', cpp: 'c', 'c++': 'c', cc: 'c', hpp: 'c', cs: 'c', csharp: 'c', 'c#': 'c', java: 'c', go: 'c', golang: 'c',
  rust: 'c', rs: 'c', kotlin: 'c', kt: 'c', swift: 'c', php: 'c', dart: 'c', scala: 'c',
  py: 'py', python: 'py', python3: 'py',
  sql: 'sql', mysql: 'sql', postgresql: 'sql', postgres: 'sql', sqlite: 'sql', plsql: 'sql', tsql: 'sql',
  sh: 'sh', bash: 'sh', shell: 'sh', zsh: 'sh', console: 'sh', terminal: 'sh',
  json: 'json', jsonc: 'json', json5: 'json',
  yml: 'yaml', yaml: 'yaml',
  css: 'css', scss: 'css', less: 'css',
  html: 'html', htm: 'html', xml: 'html', svg: 'html', vue: 'html',
};

/** Família reconhecida para o nome da linguagem do bloco, ou null. */
export const familiaDe = lingua => APELIDOS[String(lingua ?? '').toLowerCase()] ?? null;

/**
 * Código → HTML com cores. Linguagem desconhecida: só escapa.
 * @param {string} codigo
 * @param {string} lingua nome que veio no bloco (```js, ```python…)
 */
export function realcar(codigo, lingua) {
  const texto = String(codigo ?? '');
  const familia = familiaDe(lingua);
  if (!familia) return esc(texto);
  return familia === 'html' ? varrerHtml(texto) : varrer(texto, FAMILIAS[familia]);
}
