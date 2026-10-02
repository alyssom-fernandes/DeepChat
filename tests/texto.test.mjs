import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esc, formatarBytes, slug, tituloDaPergunta, resumir, grupoDeData, dataArquivo } from '../js/texto.js';

test('esc escapa tudo o que vira HTML', () => {
  assert.equal(esc('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
  assert.equal(esc("O'Neil & cia"), 'O&#39;Neil &amp; cia');
  assert.equal(esc(null), '');
});

test('formatarBytes usa vírgula decimal', () => {
  assert.equal(formatarBytes(512), '512 B');
  assert.equal(formatarBytes(1536), '1,5 KB');
  assert.equal(formatarBytes(5 * 1024 * 1024), '5,0 MB');
  assert.equal(formatarBytes(-1), '');
});

test('slug tira acento e pontuação', () => {
  assert.equal(slug('Como funciona a fotossíntese?'), 'como-funciona-a-fotossintese');
  assert.equal(slug('???'), 'conversa');
  assert.ok(slug('a'.repeat(200)).length <= 48);
});

test('tituloDaPergunta corta na palavra e usa a primeira linha', () => {
  assert.equal(tituloDaPergunta('\n  Primeira linha\nsegunda'), 'Primeira linha');
  const t = tituloDaPergunta('Explique em detalhes como funciona o protocolo de consenso de uma blockchain pública');
  assert.ok(t.endsWith('…'));
  assert.ok(t.length <= 61);
  assert.ok(!t.includes('blockch…'), 'não corta no meio da palavra');
  assert.equal(tituloDaPergunta(''), 'Nova conversa');
});

test('resumir junta linhas e tira marcação', () => {
  assert.equal(resumir('## Título\n\n**negrito** e `código`'), 'Título negrito e código');
  assert.equal(resumir('abcdef', 4), 'abc…');
});

test('grupoDeData separa hoje, ontem e os mais antigos', () => {
  const agora = new Date(2026, 9, 1, 15, 0);
  assert.equal(grupoDeData(new Date(2026, 9, 1, 0, 5).toISOString(), agora), 'Hoje');
  assert.equal(grupoDeData(new Date(2026, 8, 30, 23, 0).toISOString(), agora), 'Ontem');
  assert.equal(grupoDeData(new Date(2026, 8, 27).toISOString(), agora), 'Últimos 7 dias');
  assert.equal(grupoDeData(new Date(2026, 8, 10).toISOString(), agora), 'Últimos 30 dias');
  assert.equal(grupoDeData(new Date(2026, 0, 1).toISOString(), agora), 'Mais antigas');
  assert.equal(grupoDeData('lixo', agora), 'Mais antigas');
});

test('dataArquivo no formato ano-mês-dia', () => {
  assert.equal(dataArquivo(new Date(2026, 9, 1, 12).toISOString()), '2026-10-01');
});
