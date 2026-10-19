import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { estado, papeis } from '../js/state.js';

beforeEach(() => { estado.prefs = { ordem: 'deepseek', modelo: 'gpt-4o-mini', som: false }; estado.ordemConversa = null; });

test('papeis: sem conversa aberta, vale a preferência salva', () => {
  assert.deepEqual(papeis(), { respondente: 'deepseek', revisor: 'chatgpt' });
  estado.prefs.ordem = 'chatgpt';
  assert.deepEqual(papeis(), { respondente: 'chatgpt', revisor: 'deepseek' });
});

test('papeis: a ordem da conversa aberta vale sem mexer na preferência', () => {
  estado.ordemConversa = 'chatgpt';
  assert.deepEqual(papeis(), { respondente: 'chatgpt', revisor: 'deepseek' });
  assert.equal(estado.prefs.ordem, 'deepseek');
  estado.ordemConversa = null;
  assert.equal(papeis().respondente, 'deepseek');
});
