/* A Content Security Policy não aceita 'unsafe-inline'. Estes testes conferem
   que o index.html não tem script nem estilo embutido, e que a 404 (que tem)
   libera cada um pelo hash exato do conteúdo. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const ler = arq => readFileSync(new URL(`../${arq}`, import.meta.url), 'utf8');
const csp = html => html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/)?.[1].replace(/\s+/g, ' ') ?? '';
const diretiva = (politica, nome) => politica.split(';').map(d => d.trim()).find(d => d.startsWith(nome + ' ')) ?? '';
const hash = texto => `'sha256-${createHash('sha256').update(texto, 'utf8').digest('base64')}'`;
const embutidos = (html, tag) => [...html.matchAll(new RegExp(`<${tag}(\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'g'))]
  .filter(m => !/\ssrc=/.test(m[1] ?? '')).map(m => m[2]);

test('index.html: CSP sem unsafe-inline e sem script, estilo ou evento embutido', () => {
  const html = ler('index.html');
  const politica = csp(html);
  assert.ok(politica, 'a CSP existe');
  assert.ok(!politica.includes('unsafe-inline'));
  assert.ok(!politica.includes('unsafe-eval'));
  assert.equal(embutidos(html, 'script').length, 0, 'script embutido');
  assert.equal(embutidos(html, 'style').length, 0, 'estilo embutido');
  assert.ok(!/\sstyle="/.test(html), 'atributo style');
  assert.ok(!/\son[a-z]+="/.test(html), 'atributo de evento (onclick…)');
});

test('404.html: cada script e estilo embutido está liberado pelo hash na CSP', () => {
  const html = ler('404.html');
  const politica = csp(html);
  assert.ok(politica, 'a CSP existe');
  assert.ok(!politica.includes('unsafe-inline'));
  const scripts = embutidos(html, 'script'), estilos = embutidos(html, 'style');
  assert.ok(scripts.length && estilos.length);
  for (const s of scripts) assert.ok(diretiva(politica, 'script-src').includes(hash(s)), `script sem hash: troque por ${hash(s)}`);
  for (const s of estilos) assert.ok(diretiva(politica, 'style-src').includes(hash(s)), `estilo sem hash: troque por ${hash(s)}`);
});

test('as duas páginas não mandam o endereço de origem (Referer)', () => {
  for (const arq of ['index.html', '404.html']) {
    assert.match(ler(arq), /<meta name="referrer" content="no-referrer">/, arq);
  }
});

test('fontes do próprio site: nenhuma página chama o Google, e cada fonte citada existe', () => {
  for (const arq of ['index.html', '404.html', 'css/style.css']) {
    assert.ok(!/googleapis|gstatic/.test(ler(arq)), arq);
  }
  assert.equal(diretiva(csp(ler('index.html')), 'font-src'), "font-src 'self'");
  const citadas = [...ler('css/style.css').matchAll(/url\('\.\.\/(fonts\/[\w.-]+)'\)/g)].map(m => m[1]);
  assert.equal(citadas.length, 4);
  for (const f of citadas) assert.ok(readFileSync(new URL(`../${f}`, import.meta.url)).subarray(0, 4).toString() === 'wOF2', f);
  for (const licenca of ['fonts/OFL-instrument-sans.txt', 'fonts/OFL-jetbrains-mono.txt']) assert.match(ler(licenca), /SIL Open Font License/);
});
