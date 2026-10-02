/* A demonstração mostra revisões apontando erros. Estes testes conferem que
   os erros e as correções que ela mostra são de verdade. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conversasDemo, exemploDaPergunta, PERGUNTAS_EXEMPLO } from '../js/demo.js';
import { lerRevisao } from '../js/revisao.js';

const conversa = id => conversasDemo().find(c => c.id === id);
const blocosJs = texto => [...texto.matchAll(/```js\n([\s\S]*?)```/g)].map(m => m[1]);
const funcao = codigo => new Function(`${codigo.replace(/^validarCPF\(.*$/gm, '')}\nreturn validarCPF;`)();

test('cada exemplo tem resposta e revisão no formato, com o veredito esperado', () => {
  const esperado = { demo_muralha: 'incorreta', demo_cpf: 'parcial', demo_juros: 'correta' };
  for (const c of conversasDemo()) {
    const rev = lerRevisao(c.mensagens.find(m => m.papel === 'revisao').texto);
    assert.equal(rev.veredito, esperado[c.id], c.id);
    assert.ok(rev.secoes.length >= 4, c.id);
  }
  for (const p of PERGUNTAS_EXEMPLO) assert.ok(exemploDaPergunta(p), p);
  assert.ok(exemploDaPergunta('  a muralha da china DÁ para ver do espaço  '));
  assert.equal(exemploDaPergunta('Qual a capital da Austrália?'), null);
});

test('CPF: a função da resposta aceita 111.111.111-11, e a revisada não', () => {
  const c = conversa('demo_cpf');
  const [daResposta] = blocosJs(c.mensagens[1].texto);
  const [revisada] = blocosJs(c.mensagens[2].texto);
  const original = funcao(daResposta), corrigida = funcao(revisada);
  for (const v of [original, corrigida]) {
    assert.equal(v('529.982.247-25'), true);
    assert.equal(v('529.982.247-24'), false);
    assert.equal(v('123'), false);
  }
  assert.equal(original('111.111.111-11'), true, 'o defeito que a revisão aponta existe');
  assert.equal(corrigida('111.111.111-11'), false);
  assert.equal(corrigida(null), false);
  assert.throws(() => original(null), 'a revisão diz que null quebra a função original');
});

test('juros: as contas da resposta e da revisão batem', () => {
  const composto = (c, i, n) => c * (1 + i) ** n;
  assert.equal(composto(1000, 0.02, 12).toFixed(2), '1268.24');
  assert.equal(1000 * (1 + 0.02 * 12), 1240);
  assert.equal(1000 * (1 + 0.02 * 120), 3400);
  assert.equal(Math.round(composto(1000, 0.02, 120)), 10765);
});
