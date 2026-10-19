import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

/*
 * Testes do cofre de chaves (js/storage.js) em Node, sem navegador: o
 * localStorage e o IndexedDB abaixo são falsos, escritos só para estes testes.
 * O crypto.subtle é o de verdade.
 */

// ── localStorage falso ────────────────────────────────────────────────────────

function criarLocalStorage() {
  const dados = new Map();
  return {
    getItem: k => (dados.has(k) ? dados.get(k) : null),
    setItem: (k, v) => { dados.set(k, String(v)); },
    removeItem: k => { dados.delete(k); },
    chaves: () => [...dados.keys()],
  };
}

// ── IndexedDB falso (o mínimo que o storage.js usa) ───────────────────────────

function criarIndexedDB({ falharAoAbrir = false } = {}) {
  const bancos = new Map();   // nome -> Map(loja -> Map(chave -> valor))
  const agendar = fn => setTimeout(fn, 0);

  return {
    lojas: bancos,
    open(nome) {
      const req = {};
      agendar(() => {
        if (falharAoAbrir) { req.error = new Error('IndexedDB indisponível'); req.onerror?.(); return; }
        const novo = !bancos.has(nome);
        if (novo) bancos.set(nome, new Map());
        const lojas = bancos.get(nome);
        const db = {
          objectStoreNames: { contains: n => lojas.has(n) },
          createObjectStore: n => { lojas.set(n, new Map()); },
          close() {},
          transaction(nomeLoja) {
            const tx = { pendentes: 0, fim: false };
            const verificar = () => agendar(() => {
              if (!tx.pendentes && !tx.fim) { tx.fim = true; tx.oncomplete?.(); }
            });
            const pedir = operacao => {
              const r = {};
              tx.pendentes++;
              agendar(() => {
                r.result = operacao();
                tx.pendentes--;
                r.onsuccess?.();
                verificar();
              });
              return r;
            };
            const loja = lojas.get(nomeLoja);
            tx.objectStore = () => ({
              get: k => pedir(() => loja.get(k)),
              put: (v, k) => pedir(() => { loja.set(k, v); return k; }),
              delete: k => pedir(() => { loja.delete(k); }),
            });
            verificar();
            return tx;
          },
        };
        req.result = db;
        if (novo) req.onupgradeneeded?.();
        req.onsuccess?.();
      });
      return req;
    },
  };
}

function instalar({ falharAoAbrir = false } = {}) {
  const ls = criarLocalStorage();
  const idb = criarIndexedDB({ falharAoAbrir });
  Object.defineProperty(globalThis, 'localStorage', { value: ls, configurable: true, writable: true });
  Object.defineProperty(globalThis, 'indexedDB', { value: idb, configurable: true, writable: true });
  return { ls, idb };
}

const { salvarChaves, carregarChaves, esquecerChaves, temChavesSalvas, ErroCofre } = await import('../js/storage.js');

const MENSAGEM = 'Não deu para abrir as chaves salvas; cole de novo.';
const CHAVES = { deepseekKey: 'sk-deepseek-de-teste-0123456789', chatgptKey: 'sk-openai-de-teste-0123456789' };

/** Monta um cofre no formato antigo, igual ao que a versão anterior gravava. */
async function gravarCofreAntigo(ls, senha) {
  const enc = s => new TextEncoder().encode(s);
  const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const sal = crypto.getRandomValues(new Uint8Array(16));
  ls.setItem('dc_salt', b64(sal));
  const base = await crypto.subtle.importKey('raw', enc(senha), 'PBKDF2', false, ['deriveKey']);
  const chave = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: sal, iterations: 100_000, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cifra = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, chave, enc(JSON.stringify(CHAVES)));
  ls.setItem('dc_vault', JSON.stringify({ iv: b64(iv), data: b64(cifra) }));
}

const senhaAtualDoNavegador = () =>
  [navigator.userAgent, navigator.language, Intl.DateTimeFormat().resolvedOptions().timeZone].join('|');

let ambiente;
beforeEach(() => { ambiente = instalar(); });

test('cifra e decifra: o cofre não guarda as chaves em texto e a chave de cifra não é exportável', async () => {
  assert.equal(await carregarChaves(), null);
  assert.equal(temChavesSalvas(), false);

  await salvarChaves(CHAVES.deepseekKey, CHAVES.chatgptKey);

  const bruto = ambiente.ls.getItem('dc_vault');
  assert.ok(!bruto.includes(CHAVES.deepseekKey) && !bruto.includes(CHAVES.chatgptKey));
  assert.equal(JSON.parse(bruto).v, 2);
  assert.equal(temChavesSalvas(), true);
  assert.deepEqual(await carregarChaves(), CHAVES);

  const chaveDeCifra = ambiente.idb.lojas.get('deepchat').get('cofre').get('chave-aes');
  assert.equal(chaveDeCifra.type, 'secret');
  assert.equal(chaveDeCifra.extractable, false);
  await assert.rejects(crypto.subtle.exportKey('raw', chaveDeCifra));
});

test('salvar de novo reaproveita a mesma chave de cifra e troca os valores', async () => {
  await salvarChaves('a'.repeat(25), 'b'.repeat(25));
  const antes = ambiente.idb.lojas.get('deepchat').get('cofre').get('chave-aes');
  await salvarChaves(CHAVES.deepseekKey, CHAVES.chatgptKey);
  assert.strictEqual(ambiente.idb.lojas.get('deepchat').get('cofre').get('chave-aes'), antes);
  assert.deepEqual(await carregarChaves(), CHAVES);
});

test('migração: o cofre antigo abre uma vez, é regravado no formato novo e o sal sai', async () => {
  await gravarCofreAntigo(ambiente.ls, senhaAtualDoNavegador());
  assert.equal(JSON.parse(ambiente.ls.getItem('dc_vault')).v, undefined);

  assert.deepEqual(await carregarChaves(), CHAVES);

  assert.equal(JSON.parse(ambiente.ls.getItem('dc_vault')).v, 2);
  assert.equal(ambiente.ls.getItem('dc_salt'), null);
  // sem o sal e sem a senha derivada, só o formato novo pode abrir
  assert.deepEqual(await carregarChaves(), CHAVES);
});

test('migração do texto puro mais antigo: passa para o cofre e apaga o original', async () => {
  ambiente.ls.setItem('ds_api_key', CHAVES.deepseekKey);
  ambiente.ls.setItem('gpt_api_key', CHAVES.chatgptKey);

  assert.deepEqual(await carregarChaves(), CHAVES);

  assert.equal(ambiente.ls.getItem('ds_api_key'), null);
  assert.equal(ambiente.ls.getItem('gpt_api_key'), null);
  assert.equal(JSON.parse(ambiente.ls.getItem('dc_vault')).v, 2);
  assert.deepEqual(await carregarChaves(), CHAVES);
});

test('migração com o IndexedDB fora do ar: as chaves valem na sessão e o cofre antigo não se perde', async () => {
  await gravarCofreAntigo(ambiente.ls, senhaAtualDoNavegador());
  const antes = ambiente.ls.getItem('dc_vault');
  instalarSemIndexedDB(ambiente.ls);

  assert.deepEqual(await carregarChaves(), CHAVES);
  assert.equal(ambiente.ls.getItem('dc_vault'), antes);
  assert.ok(ambiente.ls.getItem('dc_salt'));
});

function instalarSemIndexedDB(ls) {
  Object.defineProperty(globalThis, 'indexedDB', { value: criarIndexedDB({ falharAoAbrir: true }), configurable: true, writable: true });
  return ls;
}

test('falha de abertura: cofre antigo com a senha do navegador mudada', async () => {
  await gravarCofreAntigo(ambiente.ls, 'outro user agent|en|Outro/Fuso');
  const antes = ambiente.ls.getItem('dc_vault');

  await assert.rejects(carregarChaves(), e => e instanceof ErroCofre && e.message === MENSAGEM);
  assert.equal(ambiente.ls.getItem('dc_vault'), antes, 'não apaga o cofre sozinho');
});

test('falha de abertura: a chave de cifra sumiu do IndexedDB', async () => {
  await salvarChaves(CHAVES.deepseekKey, CHAVES.chatgptKey);
  ambiente.idb.lojas.get('deepchat').get('cofre').clear();

  await assert.rejects(carregarChaves(), e => e instanceof ErroCofre && e.message === MENSAGEM);
});

test('falha de abertura: cofre adulterado ou ilegível', async () => {
  await salvarChaves(CHAVES.deepseekKey, CHAVES.chatgptKey);
  const cofre = JSON.parse(ambiente.ls.getItem('dc_vault'));
  cofre.data = cofre.data.slice(0, -8) + 'AAAAAAA=';
  ambiente.ls.setItem('dc_vault', JSON.stringify(cofre));
  await assert.rejects(carregarChaves(), ErroCofre);

  ambiente.ls.setItem('dc_vault', 'isto não é JSON');
  await assert.rejects(carregarChaves(), ErroCofre);
});

test('falha de abertura: IndexedDB indisponível com cofre novo gravado', async () => {
  await salvarChaves(CHAVES.deepseekKey, CHAVES.chatgptKey);
  instalarSemIndexedDB(ambiente.ls);
  await assert.rejects(carregarChaves(), ErroCofre);
});

test('salvar rejeita quando o IndexedDB não abre, sem deixar cofre pela metade', async () => {
  instalarSemIndexedDB(ambiente.ls);
  await assert.rejects(salvarChaves(CHAVES.deepseekKey, CHAVES.chatgptKey));
  assert.equal(ambiente.ls.getItem('dc_vault'), null);
});

test('esquecerChaves apaga o cofre, o sal, o texto puro e a chave de cifra', async () => {
  await salvarChaves(CHAVES.deepseekKey, CHAVES.chatgptKey);
  ambiente.ls.setItem('dc_salt', 'x');
  ambiente.ls.setItem('ds_api_key', 'y');
  ambiente.ls.setItem('gpt_api_key', 'z');
  const chaveAntiga = ambiente.idb.lojas.get('deepchat').get('cofre').get('chave-aes');

  await esquecerChaves();

  for (const k of ['dc_vault', 'dc_salt', 'ds_api_key', 'gpt_api_key']) assert.equal(ambiente.ls.getItem(k), null);
  assert.equal(ambiente.idb.lojas.get('deepchat').get('cofre').has('chave-aes'), false);
  assert.equal(temChavesSalvas(), false);
  assert.equal(await carregarChaves(), null);

  await salvarChaves(CHAVES.deepseekKey, CHAVES.chatgptKey);
  assert.notStrictEqual(ambiente.idb.lojas.get('deepchat').get('cofre').get('chave-aes'), chaveAntiga);
  assert.deepEqual(await carregarChaves(), CHAVES);
});

test('esquecerChaves não falha se o IndexedDB estiver indisponível', async () => {
  await salvarChaves(CHAVES.deepseekKey, CHAVES.chatgptKey);
  instalarSemIndexedDB(ambiente.ls);
  await esquecerChaves();
  assert.equal(ambiente.ls.getItem('dc_vault'), null);
});
