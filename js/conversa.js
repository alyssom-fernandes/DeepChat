/**
 * conversa.js — DeepChat
 * Modelo da conversa, migração do formato antigo, contexto enviado às APIs
 * e exportação em Markdown. Funções puras, testadas em tests/.
 *
 * Conversa: { id, criada, atualizada, titulo, mensagens: Mensagem[] }
 * Mensagem: { id, turno, papel: 'pergunta'|'resposta'|'revisao',
 *             autor: 'usuario'|'deepseek'|'chatgpt', texto, em (ISO),
 *             citacao?: {autor, texto}, anexo?: {nome, tamanho, tipo},
 *             modelo?: string, interrompida?: true }
 * `interrompida`: resposta que parou no meio (o usuário parou ou a conexão caiu).
 * `turno` é o id da pergunta: a resposta e a revisão apontam para ela.
 */

import { tituloDaPergunta, resumir, dataLonga, horaCurta } from './texto.js';
import { nomeDaIA, lerRevisao, VEREDITOS } from './revisao.js';

export const AUTORES = { usuario: 'Você', deepseek: 'DeepSeek', chatgpt: 'ChatGPT' };

let _seq = 0;
export function novoId(prefixo = 'm') {
  _seq = (_seq + 1) % 1e6;
  return `${prefixo}_${Date.now().toString(36)}_${_seq.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function criarConversa(agora = new Date()) {
  const iso = agora.toISOString();
  return { id: novoId('c'), criada: iso, atualizada: iso, titulo: 'Nova conversa', mensagens: [] };
}

/** Título a partir da primeira pergunta. */
export function tituloDaConversa(conversa) {
  const p = conversa.mensagens.find(m => m.papel === 'pergunta');
  return p ? tituloDaPergunta(p.texto) : 'Nova conversa';
}

// ── Migração (formato até maio/2026) ──────────────────────────────────────────
// Antes: { id, data, titulo, mensagens: [{ id, sender: 'user'|'deepseek'|'chatgpt',
//          text, hora: 'HH:MM', replyTo? }] }. Depois de uma pergunta, as IAs se
// alternam: resposta, revisão e, se o usuário pediu outra, resposta e revisão
// de novo, no mesmo turno.

export function ehFormatoAntigo(c) {
  return !!c && Array.isArray(c.mensagens) && c.mensagens.some(m => 'sender' in m || 'text' in m);
}

/** Data da conversa com a hora da mensagem (HH:MM, no fuso local). */
function comHora(baseIso, hora) {
  const d = new Date(baseIso);
  const [, h, min] = String(hora ?? '').match(/^(\d{1,2}):(\d{2})$/) || [];
  if (!h || !Number.isFinite(d.getTime())) return baseIso;
  d.setHours(+h, +min, 0, 0);
  return d.toISOString();
}

export function migrarConversa(c) {
  if (!ehFormatoAntigo(c)) return c;
  const base = c.data || new Date().toISOString();
  let turno = null, iasNoTurno = 0;
  const mensagens = c.mensagens.map(m => {
    const autor = m.sender === 'user' ? 'usuario' : (m.sender === 'chatgpt' ? 'chatgpt' : 'deepseek');
    const novo = { id: m.id || novoId(), autor, texto: String(m.text ?? ''), em: comHora(base, m.hora) };
    if (autor === 'usuario') {
      turno = novo.id; iasNoTurno = 0;
      novo.papel = 'pergunta';
      if (m.replyTo?.text) novo.citacao = { autor: m.replyTo.sender || 'IA', texto: resumir(m.replyTo.text, 200) };
    } else {
      novo.papel = iasNoTurno % 2 === 0 ? 'resposta' : 'revisao';
      iasNoTurno++;
    }
    novo.turno = turno || novo.id;
    return novo;
  });
  const conv = { id: String(c.id || novoId('c')), criada: base, atualizada: base, titulo: c.titulo || 'Conversa', mensagens };
  if (!c.titulo || c.titulo === 'Nova conversa') conv.titulo = tituloDaConversa(conv);
  return conv;
}

// ── Contexto para as APIs ─────────────────────────────────────────────────────

/** Perguntas e respostas anteriores (sem as revisões), no formato de chat. */
export function contextoParaApi(mensagens, max = 10) {
  return mensagens
    .filter(m => m.papel === 'pergunta' || m.papel === 'resposta')
    .slice(-max)
    .map(m => ({ role: m.papel === 'pergunta' ? 'user' : 'assistant', content: textoParaApi(m) }));
}

/** Texto da pergunta como vai para a IA: com o trecho citado, se houver. */
export function textoParaApi(m) {
  if (m.papel !== 'pergunta' || !m.citacao?.texto) return m.texto;
  const c = m.citacao;
  const deQuem = c.ia
    ? `da ${c.papel === 'revisao' ? 'revisão' : 'resposta'} do ${nomeDaIA(c.ia)}`
    : `da mensagem de ${c.autor}`;   // citação migrada do formato antigo
  return `Sobre este trecho ${deQuem}:\n> ${c.texto.replace(/\n/g, '\n> ')}\n\n${m.texto}`;
}

/** Resumo da conversa anterior para o revisor. */
export function contextoResumido(mensagens, max = 6) {
  return mensagens.slice(-max).map(m => {
    const quem = m.papel === 'pergunta' ? 'Usuário' : `${nomeDaIA(m.autor)}${m.papel === 'revisao' ? ' (revisão)' : ''}`;
    return `${quem}: ${resumir(m.texto, 240)}`;
  }).join('\n');
}

// ── Exportação ────────────────────────────────────────────────────────────────

export function markdownDaConversa(conversa, agora = new Date()) {
  const linhas = [
    `# ${conversa.titulo || 'Conversa'}`,
    '',
    `Exportada do DeepChat em ${dataLonga(agora.toISOString())}, às ${horaCurta(agora.toISOString())}.`,
    '',
  ];
  for (const m of conversa.mensagens) {
    const quem = AUTORES[m.autor] || 'IA';
    if (m.papel === 'pergunta') {
      linhas.push('---', '', `## Pergunta`, '');
      if (m.citacao?.texto) linhas.push(`> **Citando ${m.citacao.autor}:** ${m.citacao.texto.replace(/\n/g, ' ')}`, '');
      if (m.anexo?.nome)    linhas.push(`*Anexo: ${m.anexo.nome}*`, '');
      linhas.push(m.texto, '');
    } else if (m.papel === 'resposta') {
      linhas.push(`### Resposta do ${quem}${m.interrompida ? ' (parou no meio)' : ''}`, '', m.texto, '');
    } else {
      const { veredito } = lerRevisao(m.texto);
      linhas.push(`### Revisão do ${quem}${veredito ? ` — ${VEREDITOS[veredito]}` : ''}`, '', m.texto, '');
    }
  }
  return linhas.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

// ── Histórico ─────────────────────────────────────────────────────────────────

/** Mais recentes primeiro; no máximo `max`. */
export function ordenarHistorico(lista, max = 100) {
  return [...lista]
    .filter(c => c && Array.isArray(c.mensagens) && c.mensagens.length)
    .sort((a, b) => String(b.atualizada).localeCompare(String(a.atualizada)))
    .slice(0, max);
}

/** Busca no título e no texto de todas as mensagens, sem acento nem caixa. */
export function filtrarHistorico(lista, termo) {
  const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const t = norm(termo).trim();
  if (!t) return lista;
  return lista.filter(c => norm(c.titulo).includes(t) || c.mensagens.some(m => norm(m.texto).includes(t)));
}
