/**
 * storage.js — DeepChat
 * Tudo o que fica no navegador: chaves, preferências, histórico e rascunho.
 *
 * Sobre as chaves: elas são cifradas com AES-GCM, mas a senha da cifra é
 * derivada do próprio navegador (user agent, idioma e fuso, com um sal
 * aleatório). Isso evita que fiquem legíveis num backup ou numa olhada
 * rápida no localStorage; não protege contra um script rodando nesta mesma
 * página. Quem quiser mais cuidado pode desmarcar "Lembrar neste navegador".
 *
 * Na demonstração nada é gravado: o histórico fica só na memória.
 */

import { migrarConversa, ordenarHistorico } from './conversa.js';

const SALT_KEY    = 'dc_salt';
const VAULT_KEY   = 'dc_vault';
const PREFS_KEY   = 'dc_prefs';
const HISTORY_KEY = 'dc_history';
const DRAFT_KEY   = 'dc_draft';        // sessionStorage
const LEGADO      = ['ds_api_key', 'gpt_api_key'];
const MAX_CONVERSAS = 100;

let _memoria = null;   // histórico da demonstração

export function usarMemoria(conversas) { _memoria = [...conversas]; }
export const emMemoria = () => _memoria !== null;

// ── Cifra ─────────────────────────────────────────────────────────────────────

const enc = str => new TextEncoder().encode(str);
const dec = buf => new TextDecoder().decode(buf);
const bufToB64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const b64ToBuf = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;

async function derivarChave(senha, sal) {
  const base = await crypto.subtle.importKey('raw', enc(senha), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: sal, iterations: 100_000, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  );
}

function salDoNavegador() {
  let b64 = localStorage.getItem(SALT_KEY);
  if (!b64) {
    b64 = bufToB64(crypto.getRandomValues(new Uint8Array(16)).buffer);
    localStorage.setItem(SALT_KEY, b64);
  }
  return new Uint8Array(b64ToBuf(b64));
}

const senhaDoNavegador = () =>
  [navigator.userAgent, navigator.language, Intl.DateTimeFormat().resolvedOptions().timeZone].join('|');

export async function salvarChaves(deepseekKey, chatgptKey) {
  const chave  = await derivarChave(senhaDoNavegador(), salDoNavegador());
  const iv     = crypto.getRandomValues(new Uint8Array(12));
  const cifra  = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, chave, enc(JSON.stringify({ deepseekKey, chatgptKey })));
  localStorage.setItem(VAULT_KEY, JSON.stringify({ iv: bufToB64(iv.buffer), data: bufToB64(cifra) }));
}

export async function carregarChaves() {
  try {
    // Formato antigo, em texto puro: passa para o cofre e apaga.
    const [ds, gpt] = LEGADO.map(k => localStorage.getItem(k));
    if (ds && gpt) {
      await salvarChaves(ds, gpt);
      LEGADO.forEach(k => localStorage.removeItem(k));
      return { deepseekKey: ds, chatgptKey: gpt };
    }
    const raw = localStorage.getItem(VAULT_KEY);
    if (!raw) return null;
    const { iv, data } = JSON.parse(raw);
    const chave = await derivarChave(senhaDoNavegador(), salDoNavegador());
    const plano = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(b64ToBuf(iv)) }, chave, b64ToBuf(data));
    return JSON.parse(dec(plano));
  } catch {
    return null;   // navegador mudou (atualização, idioma): pede as chaves de novo
  }
}

export const temChavesSalvas = () => { try { return !!localStorage.getItem(VAULT_KEY); } catch { return false; } };

export function esquecerChaves() {
  [VAULT_KEY, SALT_KEY, ...LEGADO].forEach(k => localStorage.removeItem(k));
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
