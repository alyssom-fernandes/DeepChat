/**
 * demo.js — DeepChat
 * Demonstração sem chaves (?demo=1). As respostas e revisões são textos de
 * exemplo, escritos para mostrar o app: nada é enviado a nenhuma API e nada
 * fica salvo. Os fatos e o código dos exemplos foram conferidos.
 */

const CPF = {
  autores: { respondeu: 'chatgpt', revisou: 'deepseek' },
  pergunta: 'Escreva uma função em JavaScript que valide um CPF.',
  resposta: `Segue uma função que confere os dois dígitos verificadores:

\`\`\`js
function validarCPF(cpf) {
  const numeros = cpf.replace(/\\D/g, '');
  if (numeros.length !== 11) return false;

  const digito = (base) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) {
      soma += Number(base[i]) * (base.length + 1 - i);
    }
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  const d1 = digito(numeros.slice(0, 9));
  const d2 = digito(numeros.slice(0, 10));
  return d1 === Number(numeros[9]) && d2 === Number(numeros[10]);
}
\`\`\`

**Como funciona**

1. Remove pontos e traço, ficando só com os dígitos.
2. Calcula o primeiro dígito com pesos de 10 a 2 sobre os 9 primeiros números.
3. Calcula o segundo com pesos de 11 a 2 sobre os 10 primeiros.
4. Compara os dois com os últimos dígitos informados.

\`\`\`js
validarCPF('529.982.247-25'); // true
validarCPF('529.982.247-24'); // false
\`\`\``,
  revisao: `Veredito: Parcialmente correta

## Precisão
O cálculo dos dígitos está certo, e \`529.982.247-25\` é mesmo um CPF válido. Mas a função aceita CPFs com todos os dígitos iguais, que a Receita Federal não emite.

## Pontos fortes
- Pesos e resto aplicados do jeito certo nos dois dígitos
- Aceita o CPF com ou sem pontuação
- Os exemplos mostram um caso válido e um inválido

## A melhorar
- \`validarCPF('111.111.111-11')\` retorna \`true\`: sequências repetidas passam no cálculo e precisam ser recusadas antes
- Com \`null\` ou um número, \`cpf.replace\` quebra; converter com \`String(cpf ?? '')\` resolve

## Sugestões
Recusar sequências repetidas logo depois de conferir o tamanho e converter a entrada para texto.

## Versão revisada
\`\`\`js
function validarCPF(cpf) {
  const numeros = String(cpf ?? '').replace(/\\D/g, '');
  if (numeros.length !== 11 || /^(\\d)\\1{10}$/.test(numeros)) return false;

  const digito = (base) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) {
      soma += Number(base[i]) * (base.length + 1 - i);
    }
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  return digito(numeros.slice(0, 9)) === Number(numeros[9])
      && digito(numeros.slice(0, 10)) === Number(numeros[10]);
}

validarCPF('111.111.111-11'); // false
\`\`\``,
};

const MURALHA = {
  autores: { respondeu: 'deepseek', revisou: 'chatgpt' },
  pergunta: 'A Muralha da China dá para ver do espaço?',
  resposta: `Sim. A Grande Muralha da China é muitas vezes citada como a única construção humana visível a olho nu do espaço. Com mais de 21 mil quilômetros, ela pode ser vista da órbita da Terra e, segundo alguns relatos, até da Lua.

Isso acontece porque:

- **a extensão é enorme**, cruzando boa parte do norte da China;
- **o traçado contínuo** se destaca do relevo ao redor.`,
  revisao: `Veredito: Incorreta

## Precisão
A afirmação central é um mito. A muralha é longa, mas estreita (de 5 a 9 metros) e tem a cor do terreno. Astronautas, inclusive o chinês Yang Liwei em 2003, disseram não conseguir vê-la a olho nu da órbita. Da Lua, a 384 mil km, nenhuma obra humana é visível.

## Pontos fortes
- Os 21 mil km estão certos: é a soma de todos os trechos, medida pela China em 2012

## A melhorar
- O que torna algo visível de longe é a largura e o contraste, não o comprimento
- "Única construção visível" é falso: da órbita baixa se veem cidades iluminadas à noite, aeroportos e as estufas de Almería, na Espanha

## Sugestões
Corrigir a resposta e explicar por que o mito se espalhou.

## Versão revisada
Não a olho nu. A Grande Muralha tem mais de 21 mil km, mas é estreita e da cor do terreno, então some na paisagem vista da órbita, a uns 400 km de altura. Astronautas, como o chinês Yang Liwei, confirmaram isso. Com zoom ou em fotos de satélite ela aparece; da Lua, nenhuma obra humana é visível.`,
};

const JUROS = {
  autores: { respondeu: 'deepseek', revisou: 'chatgpt' },
  pergunta: 'Qual a diferença entre juros simples e compostos?',
  resposta: `A diferença está na base sobre a qual os juros são calculados.

- **Juros simples** incidem sempre sobre o valor inicial: o rendimento é o mesmo todo mês.
- **Juros compostos** incidem sobre o valor inicial mais os juros já acumulados, os "juros sobre juros".

**Exemplo:** R$ 1.000 a 2% ao mês, por 12 meses.

| | Juros simples | Juros compostos |
|---|---:|---:|
| Fórmula | M = C × (1 + i × n) | M = C × (1 + i)ⁿ |
| Montante | R$ 1.240,00 | R$ 1.268,24 |
| Juros | R$ 240,00 | R$ 268,24 |

No curto prazo a diferença é pequena; no longo, os compostos crescem muito mais rápido. Por isso os investimentos rendem tanto com o tempo, e a dívida do cartão cresce tão depressa.`,
  revisao: `Veredito: Correta

## Precisão
Definições, fórmulas e contas estão certas: 1.000 × 1,02¹² = 1.268,24.

## Pontos fortes
- A tabela compara as duas modalidades com o mesmo exemplo
- Liga o conceito ao dia a dia, com investimento e cartão de crédito

## A melhorar
- Vale dizer que quase todo produto financeiro usa juros compostos; os simples aparecem mais em juros de mora e em alguns contratos

## Sugestões
Mostrar um prazo longo para o efeito ficar claro: em 10 anos, o montante seria R$ 3.400 nos simples contra cerca de R$ 10.765 nos compostos.`,
};

const EXEMPLOS = [CPF, MURALHA, JUROS];

/** Perguntas sugeridas na conversa nova. */
export const PERGUNTAS_EXEMPLO = [MURALHA.pergunta, CPF.pergunta, JUROS.pergunta];

const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Resposta, revisão e autores (quem respondeu e quem revisou) gravados para uma pergunta de exemplo, ou null. */
export function exemploDaPergunta(pergunta) {
  const p = norm(pergunta);
  return EXEMPLOS.find(e => norm(e.pergunta) === p) || null;
}

/** Espera como uma chamada de verdade, e para se o usuário cancelar. */
export function esperarDemo(ms, signal) {
  return new Promise((res, rej) => {
    if (signal?.aborted) { rej(new DOMException('Cancelado', 'AbortError')); return; }
    const parar = () => { clearTimeout(t); rej(new DOMException('Cancelado', 'AbortError')); };
    const t = setTimeout(() => { signal?.removeEventListener('abort', parar); res(); }, ms);
    signal?.addEventListener('abort', parar, { once: true });
  });
}

/**
 * Escreve o texto gravado aos pedaços, como a API faz no stream: espera um
 * pouco e manda de uma a três palavras por vez. `aoParcial` recebe o texto
 * acumulado; para se o usuário cancelar.
 */
export async function escreverDemo(texto, aoParcial, signal, { antes = 900, passo = 28 } = {}) {
  await esperarDemo(antes, signal);
  const palavras = String(texto ?? '').split(/(?<=\s)(?=\S)/);
  let feito = '';
  for (let i = 0, vez = 0; i < palavras.length; vez++) {
    const n = 1 + (vez % 3);
    feito += palavras.slice(i, i + n).join('');
    i += n;
    aoParcial?.(feito);
    if (i < palavras.length) await esperarDemo(passo, signal);
  }
  return feito;
}

/** Histórico da demonstração: três conversas, uma em cada grupo de data. */
export function conversasDemo(agora = new Date()) {
  const menos = min => new Date(agora.getTime() - min * 60_000).toISOString();
  const conversa = (id, ex, minutosAtras) => {
    const { respondeu, revisou } = ex.autores;
    const t0 = menos(minutosAtras), t1 = menos(minutosAtras - 1), t2 = menos(minutosAtras - 2);
    const turno = `${id}_p`;
    return {
      id, criada: t0, atualizada: t2, titulo: ex.pergunta,
      mensagens: [
        { id: turno,      turno, papel: 'pergunta', autor: 'usuario', texto: ex.pergunta, em: t0 },
        { id: `${id}_r`,  turno, papel: 'resposta', autor: respondeu, texto: ex.resposta, em: t1 },
        { id: `${id}_v`,  turno, papel: 'revisao',  autor: revisou,   texto: ex.revisao,  em: t2 },
      ],
    };
  };
  return [
    conversa('demo_muralha', MURALHA, 18),
    conversa('demo_cpf',     CPF,     60 * 26),
    conversa('demo_juros',   JUROS,   60 * 24 * 3 + 40),
  ];
}
