/**
 * storage.js — DeepChat
 * Tudo o que fica no navegador: chaves, preferências, histórico e rascunho.
 *
 * Sobre as chaves: elas são cifradas com AES-GCM por uma chave aleatória e
 * não exportável (CryptoKey) guardada no IndexedDB; o texto cifrado fica no
 * localStorage. Quem olha o localStorage, um backup ou um arquivo copiado do
 * perfil só vê texto cifrado, e a chave de cifra não pode ser lida nem
 * exportada. Mas ela não é um segredo contra o próprio site: qualquer script
 * que rode nesta origem consegue pedir ao navegador para decifrar. Quem quiser
 * mais cuidado pode deixar "Lembrar neste navegador" desmarcado.
 *
 * Formato antigo: a senha da cifra era derivada do user agent, do idioma e do
 * fuso (PBKDF2 com um sal em dc_salt). Esse cofre é aberto uma vez, regravado
 * no formato novo e o sal é apagado.
 *
 * Na demonstração nada é gravado: o histórico fica só na memória.
 */

import { migrarConversa, ordenarHistorico } from './conversa.js';

const SALT_KEY    = 'dc_salt';         // só no formato antigo
const VAULT_KEY   = 'dc_vault';
const PREFS_KEY   = 'dc_prefs';
const HISTORY_KEY = 'dc_history';
const DRAFT_KEY   = 'dc_draft';        // sessionStorage
const LEGADO      = ['ds_api_key', 'gpt_api_key'];
const MAX_CONVERSAS = 100;
const VERSAO_COFRE  = 2;

const IDB_NOME  = 'deepchat';
const IDB_LOJA  = 'cofre';
const IDB_CHAVE = 'chave-aes';

let _memoria = null;   // histórico da demonstração

export function usarMemoria(conversas) { _memoria = [...conversas]; }
export const emMemoria = () => _memoria !== null;

/** Há chaves salvas, mas não foi possível abri-las. */
export class ErroCofre extends Error {
  constructor(causa) {
    super('Não deu para abrir as chaves salvas; cole de novo.');
    this.name = 'ErroCofre';
    this.causa = causa;
  }
}

// ── Cifra ─────────────────────────────────────────────────────────────────────

const enc = str => new TextEncoder().encode(str);
const dec = buf => new TextDecoder().decode(buf);
const bufToB64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const b64ToBuf = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;

// ── Chave de cifra no IndexedDB ───────────────────────────────────────────────

const pedido = req => new Promise((ok, erro) => {
  req.onsuccess = () => ok(req.result);
  req.onerror   = () => erro(req.error);
});

function abrirBanco() {
  return new Promise((ok, erro) => {
    const req = indexedDB.open(IDB_NOME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IDB_LOJA)) req.result.createObjectStore(IDB_LOJA);
    };
    req.onsuccess = () => ok(req.result);
    req.onerror   = () => erro(req.error);
    req.onblocked = () => erro(new Error('IndexedDB bloqueado'));
  });
}

/** Roda `fn(loja)` numa transação e espera ela terminar. */
async function comLoja(modo, fn) {
  const banco = await abrirBanco();
  try {
    return await new Promise((ok, erro) => {
      const tx = banco.transaction(IDB_LOJA, modo);
      let resultado;
      tx.oncomplete = () => ok(resultado);
      tx.onerror = tx.onabort = () => erro(tx.error || new Error('Transação cancelada'));
      Promise.resolve(fn(tx.objectStore(IDB_LOJA))).then(r => { resultado = r; }, erro);
    });
  } finally {
    banco.close?.();
  }
}

const lerChaveDeCifra = () => comLoja('readonly', loja => pedido(loja.get(IDB_CHAVE)));

/** Devolve a chave de cifra; cria uma nova (não exportável) se ainda não existe. */
async function obterOuCriarChaveDeCifra() {
  const existente = await lerChaveDeCifra();
  if (existente) return existente;
  const nova = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  // Se outra aba criou uma enquanto isso, vale a que já está gravada.
  return comLoja('readwrite', async loja => {
    const outra = await pedido(loja.get(IDB_CHAVE));
    if (outra) return outra;
    await pedido(loja.put(nova, IDB_CHAVE));
    return nova;
  });
}

const apagarChaveDeCifra = () => comLoja('readwrite', loja => pedido(loja.delete(IDB_CHAVE)));

// ── Formato antigo (senha derivada do navegador) ──────────────────────────────

async function derivarChaveLegada(senha, sal) {
  const base = await crypto.subtle.importKey('raw', enc(senha), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: sal, iterations: 100_000, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  );
}

const senhaLegada = () =>
  [navigator.userAgent, navigator.language, Intl.DateTimeFormat().resolvedOptions().timeZone].join('|');

async function abrirCofreLegado({ iv, data }) {
  const b64 = localStorage.getItem(SALT_KEY);
  if (!b64) throw new Error('Sal do formato antigo ausente');
  const chave = await derivarChaveLegada(senhaLegada(), new Uint8Array(b64ToBuf(b64)));
  return decifrar(chave, iv, data);
}

// ── Cofre ─────────────────────────────────────────────────────────────────────

async function decifrar(chave, iv, data) {
  const plano = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(b64ToBuf(iv)) }, chave, b64ToBuf(data));
  return JSON.parse(dec(plano));
}

/** Cifra as chaves e grava no localStorage. Rejeita se o navegador recusar (IndexedDB ou cota). */
export async function salvarChaves(deepseekKey, chatgptKey) {
  const chave = await obterOuCriarChaveDeCifra();
  const iv    = crypto.getRandomValues(new Uint8Array(12));
  const cifra = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, chave, enc(JSON.stringify({ deepseekKey, chatgptKey })));
  localStorage.setItem(VAULT_KEY, JSON.stringify({ v: VERSAO_COFRE, iv: bufToB64(iv.buffer), data: bufToB64(cifra) }));
  localStorage.removeItem(SALT_KEY);   // o sal só servia ao formato antigo
}

/**
 * @returns {Promise<{deepseekKey: string, chatgptKey: string} | null>} null quando não há nada salvo.
 * @throws {ErroCofre} quando há chaves salvas e elas não abrem.
 */
export async function carregarChaves() {
  // Formato muito antigo, em texto puro: passa para o cofre e apaga.
  const [ds, gpt] = LEGADO.map(k => localStorage.getItem(k));
  if (ds && gpt) {
    try {
      await salvarChaves(ds, gpt);
      LEGADO.forEach(k => localStorage.removeItem(k));
    } catch { /* não gravou: o texto puro fica onde estava e as chaves valem nesta sessão */ }
    return { deepseekKey: ds, chatgptKey: gpt };
  }
  const raw = localStorage.getItem(VAULT_KEY);
  if (!raw) return null;
  try {
    const cofre = JSON.parse(raw);
    if (cofre.v === VERSAO_COFRE) {
      const chave = await lerChaveDeCifra();
      if (!chave) throw new Error('Chave de cifra ausente');
      return await decifrar(chave, cofre.iv, cofre.data);
    }
    // Formato antigo: abre uma vez e já regrava no formato novo.
    const chaves = await abrirCofreLegado(cofre);
    try { await salvarChaves(chaves.deepseekKey, chaves.chatgptKey); } catch { /* segue com o cofre antigo */ }
    return chaves;
  } catch (e) {
    throw new ErroCofre(e);
  }
}

export const temChavesSalvas = () => { try { return !!localStorage.getItem(VAULT_KEY); } catch { return false; } };

/** Apaga o cofre, a chave de cifra e qualquer resto do formato antigo. */
export async function esquecerChaves() {
  [VAULT_KEY, SALT_KEY, ...LEGADO].forEach(k => { try { localStorage.removeItem(k); } catch (_) {} });
  try { await apagarChaveDeCifra(); } catch (_) {}
}

// ── Rascunho ──────────────────────────────────────────────────────────────────

export function salvarRascunho(texto) { try { sessionStorage.setItem(DRAFT_KEY, texto); } catch (_) {} }
export function lerRascunho()         { try { return sessionStorage.getItem(DRAFT_KEY) || ''; } catch { return ''; } }
export function apagarRascunho()      { try { sessionStorage.removeItem(DRAFT_KEY); } catch (_) {} }

// ── Preferências ──────────────────────────────────────────────────────────────
// { ordem: 'deepseek'|'chatgpt' (quem responde), modelo, som }
// O tema fica com o boot.js, que precisa dele antes da página aparecer.

export function lerPreferencias() {
  let p = {};
  try { p = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') || {}; } catch (_) {}
  return {
    ordem:  p.ordem === 'chatgpt' || p.modoInvertido === true ? 'chatgpt' : 'deepseek',
    modelo: p.modelo || p.chatgptModel || 'gpt-4o-mini',
    som:    p.som === true,
  };
}

export function salvarPreferencias(prefs) {
  if (_memoria) return;
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (_) {}
}

// ── Histórico ─────────────────────────────────────────────────────────────────

export function lerHistorico() {
  if (_memoria) return ordenarHistorico(_memoria, MAX_CONVERSAS);
  let lista = [];
  try { lista = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch (_) {}
  if (!Array.isArray(lista)) return [];
  return ordenarHistorico(lista.map(migrarConversa), MAX_CONVERSAS);
}

/**
 * Grava o histórico inteiro. Sem cortar texto: se o navegador recusar por
 * falta de espaço, saem as conversas mais antigas, uma de cada vez.
 * @returns {number} quantas conversas antigas saíram
 */
export function gravarHistorico(lista) {
  let conversas = ordenarHistorico(lista, MAX_CONVERSAS);
  if (_memoria) { _memoria = conversas; return 0; }
  let removidas = 0;
  while (true) {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(conversas));
      return removidas;
    } catch (e) {
      if (conversas.length <= 1) throw e;
      conversas = conversas.slice(0, -1);
      removidas++;
    }
  }
}

export function salvarConversa(conversa) {
  const lista = lerHistorico().filter(c => c.id !== conversa.id);
  return gravarHistorico([conversa, ...lista]);
}

export function excluirConversa(id) {
  gravarHistorico(lerHistorico().filter(c => c.id !== id));
}

export function apagarHistorico() {
  if (_memoria) { _memoria = []; return; }
  localStorage.removeItem(HISTORY_KEY);
}
