import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lerRevisao, lerVeredito, promptRevisao } from '../js/revisao.js';

test('lê o formato pedido: veredito e seções', () => {
  const r = lerRevisao(`Veredito: Parcialmente correta

## Precisão
Quase certa.

## Pontos fortes
- Clara

## A melhorar
- Faltou um exemplo

## Sugestões
Dar um exemplo.

## Versão revisada
Texto corrigido.`);
  assert.equal(r.veredito, 'parcial');
  assert.deepEqual(r.secoes.map(s => s.chave), ['precisao', 'fortes', 'melhorar', 'sugestoes', 'versao']);
  assert.equal(r.secoes[0].corpo, 'Quase certa.');
  assert.equal(r.introducao, '');
});

test('aceita veredito em negrito e sem acento', () => {
  assert.equal(lerRevisao('**Veredito:** Correta\n\n## Precisao\nOk.').veredito, 'correta');
  assert.equal(lerVeredito('INCORRETA'), 'incorreta');
  assert.equal(lerVeredito('Parcialmente correta'), 'parcial');
  assert.equal(lerVeredito('talvez'), null);
});

test('lê o formato antigo, com emojis e marcadores •', () => {
  const r = lerRevisao(`✅ PRECISÃO: Correta.

💪 PONTOS FORTES:
• Direta

⚠️ PONTOS A MELHORAR:
• Faltou citar que é sem estado

💡 SUGESTÕES:
Dar um exemplo de URL.

✨ VERSÃO REVISADA (opcional):
[texto]`);
  assert.equal(r.veredito, 'correta', 'no formato antigo, a primeira palavra da precisão vira o veredito');
  assert.deepEqual(r.secoes.map(s => s.chave), ['precisao', 'fortes', 'melhorar', 'sugestoes']);
  assert.equal(r.secoes[0].corpo, 'Correta.');
  assert.equal(r.secoes[1].corpo, '- Direta');
});

test('formato antigo: só vira veredito se a precisão começar por ele', () => {
  assert.equal(lerRevisao('✅ PRECISÃO: Parcialmente correta, faltou X.').veredito, 'parcial');
  assert.equal(lerRevisao('✅ PRECISÃO: Incorreto: a data está errada.').veredito, 'incorreta');
  assert.equal(lerRevisao('✅ PRECISÃO: A resposta está correta e bem organizada.').veredito, null);
});

test('versão revisada vazia ou "não necessária" some', () => {
  const r = lerRevisao('Veredito: Correta\n\n## Precisão\nCerta.\n\n## Versão revisada\nNão é necessária.');
  assert.deepEqual(r.secoes.map(s => s.chave), ['precisao']);
});

test('fora do formato: nenhuma seção, o texto inteiro fica na introdução', () => {
  const r = lerRevisao('A resposta está boa, mas poderia citar fontes.');
  assert.equal(r.secoes.length, 0);
  assert.equal(r.introducao, 'A resposta está boa, mas poderia citar fontes.');
});

test('uma linha de lista que começa em maiúsculas não vira título', () => {
  const r = lerRevisao('## A melhorar\n- PONTOS de atenção no código\n- outro');
  assert.equal(r.secoes.length, 1);
  assert.match(r.secoes[0].corpo, /PONTOS de atenção/);
});

test('o prompt leva pergunta, resposta, anexo e pede o formato', () => {
  const p = promptRevisao({ pergunta: 'P?', resposta: 'R.', quem: 'chatgpt', contexto: 'Usuário: oi', anexo: 'Arquivo anexado: a.txt' });
  assert.match(p, /resposta que o ChatGPT deu/);
  assert.match(p, /PERGUNTA DO USUÁRIO:\nP\?/);
  assert.match(p, /RESPOSTA DO CHATGPT:\nR\./);
  assert.match(p, /ANEXO ENVIADO COM A PERGUNTA:\nArquivo anexado: a\.txt/);
  assert.match(p, /Veredito: Correta \| Parcialmente correta \| Incorreta/);
  assert.doesNotMatch(p, /\n{3,}/);
});
