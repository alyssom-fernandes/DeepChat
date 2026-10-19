/* A resposta chega aos pedaços (stream). Estes testes conferem o leitor do
   fluxo e a consulta inteira com um fetch falso: nada sai para a rede. */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG, criarLeitorSSE, consultar, ErroApi, explicarFalhaDeRede } from '../js/api-client.js';
import { escreverDemo } from '../js/demo.js';

CONFIG.ESPERA_BASE_MS = 1;   // as novas tentativas não precisam esperar nos testes

const evento = texto => `data: ${JSON.stringify({ choices: [{ delta: { content: texto } }] })}\n\n`;
// entrega um pedaço por leitura, como a rede; no fim, fecha ou cai
const fluxo = (pedacos, { falhaNoFim = false } = {}) => {
  let i = 0;
  return new ReadableStream({
    pull(c) {
      if (i < pedacos.length) c.enqueue(new TextEncoder().encode(pedacos[i++]));
      else if (falhaNoFim) c.error(new TypeError('conexão caiu'));
      else c.close();
    },
  });
};
const sse = (pedacos, op) => new Response(fluxo(pedacos, op), { headers: { 'content-type': 'text/event-stream; charset=utf-8' } });

let chamadas;
const fetchFalso = respostas => {
  chamadas = [];
  globalThis.fetch = async (url, init) => {
    chamadas.push({ url, corpo: JSON.parse(init.body) });
    const r = respostas[Math.min(chamadas.length - 1, respostas.length - 1)];
    if (r instanceof Error) throw r;
    return typeof r === 'function' ? r() : r;
  };
};
let ia = 0;
const outraIA = () => (ia++ % 2 ? 'deepseek' : 'chatgpt');   // cada teste longe do disjuntor do outro
beforeEach(() => { chamadas = []; });

test('leitor SSE: junta linhas cortadas, ignora comentários e acha o fim', () => {
  const l = criarLeitorSSE();
  const tudo = evento('Olá') + ': keep-alive\n\n' + evento(', mundo') + 'data: [DONE]\n\n';
  const meio = Math.floor(tudo.length / 2);
  const eventos = [...l.ler(tudo.slice(0, 7)), ...l.ler(tudo.slice(7, meio)), ...l.ler(tudo.slice(meio)), ...l.fechar()];
  assert.deepEqual(eventos, [{ texto: 'Olá' }, { texto: ', mundo' }, { fim: true }]);
});

test('leitor SSE: CRLF, delta vazio e erro no meio do fluxo', () => {
  const l = criarLeitorSSE();
  const eventos = l.ler('data: {"choices":[{"delta":{"role":"assistant"}}]}\r\n\r\n' + evento('a').replace('\n\n', '\r\n\r\n') +
    'data: {"error":{"message":"sobrecarga"}}\n');
  assert.deepEqual(eventos, [{ texto: 'a' }, { erro: 'sobrecarga' }]);
  assert.deepEqual(l.fechar(), []);
});

test('consultar: pede stream, entrega cada pedaço e devolve o texto inteiro', async () => {
  fetchFalso([sse([evento('Uma '), evento('IA '), evento('revisa.'), 'data: [DONE]\n\n'])]);
  const parciais = [];
  const texto = await consultar(outraIA(), [{ role: 'user', content: 'oi' }], { chave: 'k', aoParcial: t => parciais.push(t) });
  assert.equal(texto, 'Uma IA revisa.');
  assert.deepEqual(parciais, ['Uma ', 'Uma IA ', 'Uma IA revisa.']);
  assert.equal(chamadas[0].corpo.stream, true);
});

test('consultar: sem text/event-stream, lê a resposta inteira (JSON)', async () => {
  fetchFalso([new Response(JSON.stringify({ choices: [{ message: { content: 'inteira' } }] }), { headers: { 'content-type': 'application/json' } })]);
  const parciais = [];
  assert.equal(await consultar(outraIA(), [], { chave: 'k', aoParcial: t => parciais.push(t) }), 'inteira');
  assert.deepEqual(parciais, ['inteira']);
});

test('consultar: falha antes do primeiro pedaço tenta de novo; depois, não', async () => {
  fetchFalso([new TypeError('sem rede'), () => sse([evento('ok'), 'data: [DONE]\n\n'])]);
  assert.equal(await consultar(outraIA(), [], { chave: 'k' }), 'ok');
  assert.equal(chamadas.length, 2, 'uma nova tentativa');

  fetchFalso([() => sse([evento('começo da resposta')], { falhaNoFim: true }), () => sse([evento('outra')])]);
  const erro = await consultar(outraIA(), [], { chave: 'k' }).catch(e => e);
  assert.ok(erro instanceof ErroApi);
  assert.equal(erro.tipo, 'rede');
  assert.equal(erro.parcial, 'começo da resposta', 'o erro traz o que chegou');
  assert.equal(chamadas.length, 1, 'sem nova tentativa: o começo já estava na tela');
});

test('consultar: o erro diz quantas tentativas houve de fato', async () => {
  const ia = outraIA(); outraIA();   // dois usos: mantém a alternância dos outros testes
  fetchFalso([new TypeError('sem rede')]);   // todas as tentativas falham
  const todas = await consultar(ia, [], { chave: 'k' }).catch(e => e);
  assert.equal(todas.tentativas, CONFIG.MAX_TENTATIVAS);
  assert.equal(chamadas.length, CONFIG.MAX_TENTATIVAS);

  fetchFalso([() => sse([evento('começo')], { falhaNoFim: true })]);   // cai depois de algum texto
  const uma = await consultar(ia, [], { chave: 'k' }).catch(e => e);
  assert.equal(uma.tentativas, 1);

  fetchFalso([() => sse([evento('ok'), 'data: [DONE]\n\n'])]);   // zera o disjuntor desta IA para os outros testes
  assert.equal(await consultar(ia, [], { chave: 'k' }), 'ok');
});

test('explicarFalhaDeRede: a frase segue o número real de tentativas', () => {
  assert.equal(explicarFalhaDeRede({ tipo: 'rede', tentativas: 3 }), 'A conexão falhou três vezes seguidas.');
  assert.equal(explicarFalhaDeRede({ tipo: 'rede', tentativas: 2 }), 'A conexão falhou duas vezes seguidas.');
  assert.equal(explicarFalhaDeRede({ tipo: 'rede', tentativas: 1 }), 'A conexão falhou.');
  assert.equal(explicarFalhaDeRede({ tipo: 'rede', tentativas: 3 }, false), 'Você está sem internet.');
  assert.equal(explicarFalhaDeRede({ tipo: 'tempo', tentativas: 3 }), 'Passou de 60 segundos sem resposta, mesmo depois de três tentativas.');
  assert.equal(explicarFalhaDeRede({ tipo: 'tempo', tentativas: 1 }), 'Passou de 60 segundos sem resposta.');
});

test('consultar: o fluxo que fecha sem [DONE] nem motivo de parada é resposta cortada', async () => {
  fetchFalso([() => sse([evento('metade da '), evento('resposta')])]);   // fecha sem [DONE]
  const erro = await consultar(outraIA(), [], { chave: 'k' }).catch(e => e);
  assert.equal(erro.tipo, 'rede');
  assert.equal(erro.parcial, 'metade da resposta');
  assert.equal(chamadas.length, 1);

  const fimPeloMotivo = `data: ${JSON.stringify({ choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] })}\n\n`;
  fetchFalso([() => sse([fimPeloMotivo])]);
  assert.equal(await consultar(outraIA(), [], { chave: 'k' }), 'ok', 'finish_reason também marca o fim');
});

test('consultar: erro no meio do fluxo cancela a conexão em vez de deixá-la aberta', async () => {
  let cancelados = 0;
  fetchFalso([() => new Response(new ReadableStream({
    start(c) { c.enqueue(new TextEncoder().encode(evento('parte') + 'data: {"error":{"message":"sobrecarga"}}\n\n')); },
    cancel() { cancelados++; },   // continua aberto: só fecha se o cliente cancelar
  }), { headers: { 'content-type': 'text/event-stream' } })]);
  const erro = await consultar(outraIA(), [], { chave: 'k' }).catch(e => e);
  assert.equal(erro.tipo, 'servidor');
  assert.equal(erro.parcial, 'parte');
  assert.equal(cancelados, 1);
});

test('consultar: erros HTTP viram tipos que a tela explica', async () => {
  const http = (status, msg) => new Response(JSON.stringify({ error: { message: msg } }), { status, headers: { 'content-type': 'application/json' } });
  fetchFalso([http(401, 'Incorrect API key')]);
  assert.equal((await consultar(outraIA(), [], { chave: 'k' }).catch(e => e)).tipo, 'chave');
  fetchFalso([http(429, 'Rate limit')]);
  assert.equal((await consultar(outraIA(), [], { chave: 'k' }).catch(e => e)).tipo, 'cota');
  fetchFalso([http(400, 'bad request')]);
  assert.equal((await consultar(outraIA(), [], { chave: 'k' }).catch(e => e)).tipo, 'pedido');
});

test('consultar: o Parar cancela no meio do fluxo', async () => {
  const ctrl = new AbortController();
  // como o fetch de verdade: o sinal cancelado corta o corpo que ainda está chegando
  globalThis.fetch = async (_url, init) => new Response(new ReadableStream({
    start(c) {
      c.enqueue(new TextEncoder().encode(evento('parte')));   // não fecha: fica esperando
      init.signal.addEventListener('abort', () => c.error(new DOMException('Cancelado', 'AbortError')));
    },
  }), { headers: { 'content-type': 'text/event-stream' } });
  const erro = await consultar(outraIA(), [], { chave: 'k', signal: ctrl.signal, aoParcial: () => ctrl.abort() }).catch(e => e);
  assert.equal(erro.name, 'AbortError');
});

test('demonstração: escreve o texto gravado aos pedaços, igual ao original, e para no Parar', async () => {
  const original = 'Uma IA responde.\n\n```js\nconst x = 1;\n```\nOutra revisa.';
  const parciais = [];
  const feito = await escreverDemo(original, t => parciais.push(t), undefined, { antes: 0, passo: 0 });
  assert.equal(feito, original);
  assert.ok(parciais.length > 3);
  assert.ok(parciais.every((p, i) => original.startsWith(p) && (i === 0 || p.length > parciais[i - 1].length)));

  const ctrl = new AbortController();
  const erro = await escreverDemo(original, () => ctrl.abort(), ctrl.signal, { antes: 0, passo: 5 }).catch(e => e);
  assert.equal(erro.name, 'AbortError');
});
