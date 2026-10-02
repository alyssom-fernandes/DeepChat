/**
 * texto.js — DeepChat
 * Funções puras de texto, data e tamanho. Sem DOM: rodam no navegador e
 * nos testes (node --test).
 */

const ENTIDADES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escapa texto para entrar em HTML (conteúdo ou atributo). */
export function esc(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, c => ENTIDADES[c]);
}

export function formatarBytes(b) {
  if (!Number.isFinite(b) || b < 0) return '';
  if (b < 1024)    return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1).replace('.', ',')} KB`;
  return `${(b / 1048576).toFixed(1).replace('.', ',')} MB`;
}

/** "Como funciona a fotossíntese?" → "como-funciona-a-fotossintese" */
export function slug(texto, max = 48) {
  const s = String(texto ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s.slice(0, max).replace(/-+$/, '') || 'conversa';
}

/** Primeira linha da pergunta, cortada na palavra, para título da conversa. */
export function tituloDaPergunta(texto, max = 60) {
  const linha = String(texto ?? '').split('\n').map(l => l.trim()).find(Boolean) || '';
  if (linha.length <= max) return linha || 'Nova conversa';
  const corte = linha.slice(0, max);
  const espaco = corte.lastIndexOf(' ');
  return (espaco > max * 0.6 ? corte.slice(0, espaco) : corte).replace(/[\s,.;:–-]+$/, '') + '…';
}

/** Resume em uma linha, para citações e prévias. */
export function resumir(texto, max = 140) {
  const s = String(texto ?? '').replace(/[#>*_`~|]/g, '').replace(/\s+/g, ' ').trim();
  return s.length <= max ? s : s.slice(0, max - 1).trimEnd() + '…';
}

const DIA = 86_400_000;
function inicioDoDia(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); }

/** Grupo do histórico: Hoje, Ontem, Últimos 7 dias, Últimos 30 dias, Mais antigas. */
export function grupoDeData(iso, agora = new Date()) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return 'Mais antigas';
  const dias = Math.round((inicioDoDia(agora) - inicioDoDia(t)) / DIA);
  if (dias <= 0)  return 'Hoje';
  if (dias === 1) return 'Ontem';
  if (dias < 7)   return 'Últimos 7 dias';
  if (dias < 30)  return 'Últimos 30 dias';
  return 'Mais antigas';
}

export function horaCurta(iso) {
  const d = new Date(iso);
  return Number.isFinite(d.getTime())
    ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : '';
}

export function dataLonga(iso) {
  const d = new Date(iso);
  return Number.isFinite(d.getTime())
    ? d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })
    : '';
}

/** 2026-10-01 (para nome de arquivo, no fuso local) */
export function dataArquivo(iso) {
  const d = new Date(iso);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
