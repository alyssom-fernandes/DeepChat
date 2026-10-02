import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrarConversa, ehFormatoAntigo, contextoParaApi, textoParaApi, contextoResumido,
         markdownDaConversa, ordenarHistorico, filtrarHistorico, tituloDaConversa, criarConversa } from '../js/conversa.js';

const ANTIGA = {
  id: '1717000000000', data: '2026-05-10T14:00:00.000Z', titulo: 'Nova conversa',
  mensagens: [
    { id: 'a', sender: 'user', text: 'O que é REST?', hora: '14:00' },
    { id: 'b', sender: 'deepseek', text: 'Um estilo de API.', hora: '14:00' },
    { id: 'c', sender: 'chatgpt', text: '✅ PRECISÃO: Correta.', hora: '14:01' },
    { id: 'd', sender: 'user', text: 'E GraphQL?', hora: '14:02', replyTo: { sender: 'DeepSeek', text: 'Um estilo de API.' } },
    { id: 'e', sender: 'deepseek', text: 'Uma linguagem de consulta.', hora: '14:02' },
  ],
};

test('migra o formato de maio: papéis, turnos e citação', () => {
  assert.ok(ehFormatoAntigo(ANTIGA));
  const c = migrarConversa(ANTIGA);
  assert.ok(!ehFormatoAntigo(c));
  assert.deepEqual(c.mensagens.map(m => m.papel), ['pergunta', 'resposta', 'revisao', 'pergunta', 'resposta']);
  assert.deepEqual(c.mensagens.map(m => m.autor), ['usuario', 'deepseek', 'chatgpt', 'usuario', 'deepseek']);
  assert.deepEqual(c.mensagens.map(m => m.turno), ['a', 'a', 'a', 'd', 'd']);
  assert.equal(c.mensagens[3].citacao.autor, 'DeepSeek');
  assert.equal(c.titulo, 'O que é REST?', 'o título "Nova conversa" vira a primeira pergunta');
  assert.equal(migrarConversa(c), c, 'formato novo passa direto');
});

test('o contexto da API leva perguntas e respostas, sem as revisões', () => {
  const c = migrarConversa(ANTIGA);
  const ctx = contextoParaApi(c.mensagens);
  assert.deepEqual(ctx.map(m => m.role), ['user', 'assistant', 'user', 'assistant']);
  assert.ok(!ctx.some(m => m.content.includes('PRECISÃO')));
  assert.match(ctx[2].content, /^Sobre este trecho da mensagem de DeepSeek:\n> Um estilo de API\.\n\nE GraphQL\?$/);
  assert.equal(contextoParaApi(c.mensagens, 2).length, 2);
});

test('migração: IAs se alternam no turno e a hora da mensagem é mantida', () => {
  const c = migrarConversa({
    id: '1', data: new Date(2026, 4, 10, 9, 0).toISOString(), titulo: 'x',
    mensagens: [
      { id: 'a', sender: 'user', text: 'P', hora: '14:00' },
      { id: 'b', sender: 'deepseek', text: 'R1', hora: '14:01' },
      { id: 'c', sender: 'chatgpt', text: 'V1', hora: '14:01' },
      { id: 'd', sender: 'deepseek', text: 'R2 (outra resposta)', hora: '14:05' },
      { id: 'e', sender: 'chatgpt', text: 'V2', hora: 'lixo' },
    ],
  });
  assert.deepEqual(c.mensagens.map(m => m.papel), ['pergunta', 'resposta', 'revisao', 'resposta', 'revisao']);
  const hora = iso => { const d = new Date(iso); return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; };
  assert.equal(hora(c.mensagens[3].em), '14:05');
  assert.equal(c.mensagens[4].em, c.criada, 'hora inválida fica com a data da conversa');
});

test('textoParaApi diz de quem é o trecho citado', () => {
  assert.equal(textoParaApi({ papel: 'resposta', texto: 'x', citacao: { autor: 'A', texto: 'y' } }), 'x');
  assert.equal(textoParaApi({ papel: 'pergunta', texto: 'x' }), 'x');
  const p = { papel: 'pergunta', texto: 'E agora?', citacao: { autor: 'Revisão do ChatGPT', ia: 'chatgpt', papel: 'revisao', texto: 'Veredito: Incorreta.' } };
  assert.equal(textoParaApi(p), 'Sobre este trecho da revisão do ChatGPT:\n> Veredito: Incorreta.\n\nE agora?');
  assert.match(textoParaApi({ ...p, citacao: { ...p.citacao, ia: 'deepseek', papel: 'resposta' } }), /^Sobre este trecho da resposta do DeepSeek:/);
});

test('o resumo para o revisor marca quem fala', () => {
  const r = contextoResumido(migrarConversa(ANTIGA).mensagens);
  assert.match(r, /^Usuário: O que é REST\?/);
  assert.match(r, /ChatGPT \(revisão\): /);
});

test('Markdown exportado tem pergunta, resposta e revisão com veredito', () => {
  const c = criarConversa(new Date(2026, 9, 1));
  c.mensagens = [
    { id: 'p', turno: 'p', papel: 'pergunta', autor: 'usuario', texto: 'Pergunta?', anexo: { nome: 'dados.csv' } },
    { id: 'r', turno: 'p', papel: 'resposta', autor: 'deepseek', texto: 'Resposta.' },
    { id: 'v', turno: 'p', papel: 'revisao', autor: 'chatgpt', texto: 'Veredito: Incorreta\n\n## Precisão\nErrada.' },
  ];
  c.titulo = tituloDaConversa(c);
  const md = markdownDaConversa(c, new Date(2026, 9, 1, 10, 30));
  assert.match(md, /^# Pergunta\?\n/);
  assert.match(md, /## Pergunta\n\n\*Anexo: dados\.csv\*\n\nPergunta\?/);
  assert.match(md, /### Resposta do DeepSeek\n\nResposta\./);
  assert.match(md, /### Revisão do ChatGPT — Incorreta/);
  assert.doesNotMatch(md, /\n{3,}/);
});

test('histórico: mais recente primeiro, sem conversa vazia, com limite', () => {
  const lista = [
    { id: '1', atualizada: '2026-09-01', mensagens: [{}] },
    { id: '2', atualizada: '2026-10-01', mensagens: [{}] },
    { id: '3', atualizada: '2026-10-02', mensagens: [] },
  ];
  assert.deepEqual(ordenarHistorico(lista).map(c => c.id), ['2', '1']);
  assert.equal(ordenarHistorico(lista, 1).length, 1);
});

test('busca ignora acento e caixa e olha o texto das mensagens', () => {
  const lista = [
    { id: '1', titulo: 'Fotossíntese', mensagens: [{ texto: 'clorofila' }] },
    { id: '2', titulo: 'Juros', mensagens: [{ texto: 'Montante compostos' }] },
  ];
  assert.deepEqual(filtrarHistorico(lista, 'FOTOSSINTESE').map(c => c.id), ['1']);
  assert.deepEqual(filtrarHistorico(lista, 'compostos').map(c => c.id), ['2']);
  assert.equal(filtrarHistorico(lista, '  ').length, 2);
});
