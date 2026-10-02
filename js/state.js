/**
 * state.js — DeepChat
 * Estado da sessão, num lugar só. Quem muda é o app.js; o resto só lê.
 */

import { criarConversa } from './conversa.js';

export const estado = {
  demo:      false,
  chaves:    { deepseek: '', chatgpt: '' },
  prefs:     { ordem: 'deepseek', modelo: 'gpt-4o-mini', som: false },
  conversa:  criarConversa(),
  ocupado:   false,     // há uma pergunta em andamento
  cadeia:    null,      // RequestChain da pergunta em andamento
  citacao:   null,      // { autor, texto } citado na próxima pergunta
  anexo:     null,      // { nome, tamanho, tipo, imagem, dataUrl?, texto? }
};

/** Quem responde e quem revisa, pela preferência atual. */
export function papeis() {
  const respondente = estado.prefs.ordem === 'chatgpt' ? 'chatgpt' : 'deepseek';
  return { respondente, revisor: respondente === 'deepseek' ? 'chatgpt' : 'deepseek' };
}
