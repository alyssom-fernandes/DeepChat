/* O realce colore o código das respostas. O que importa: o texto continua
   exatamente o mesmo (só ganha <span>), tudo é escapado e as cores caem nos
   lugares certos dos casos comuns. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { realcar, familiaDe, MAX_REALCE } from '../js/realce.js';
import { exemploDaPergunta } from '../js/demo.js';

const ENTIDADES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
const texto = html => html.replace(/<span class="tk-[a-z]">|<\/span>/g, '').replace(/&(amp|lt|gt|quot|#39);/g, e => ENTIDADES[e]);
const marcados = (html, classe) => [...html.matchAll(new RegExp(`<span class="tk-${classe}">([^<]*)</span>`, 'g'))].map(m => texto(m[1]));

const AMOSTRAS = {
  js: "const re = /^(\\d)\\1{10}$/; // repetidos\nconst total = itens.reduce((s, x) => s + x * 2.5, 0);\nif (a / b > 1) return `ok ${a}`;\n/* fim */ console.log('fim');",
  python: 'def soma(a, b=2):\n    """Soma."""\n    return a + b  # comentário\n\n@cache\nprint(f"{soma(1)}", None, True)',
  sql: "SELECT nome, COUNT(*) FROM vendas -- total\nWHERE data >= '2026-01-01' GROUP BY nome;",
  bash: 'export PASTA="$HOME/x" # comentário\necho ${PASTA} && ls -la | grep "#nao"',
  json: '{"nome": "DeepChat", "versao": 2, "ativo": true, "lista": [1, -2.5e3, null]}',
  css: '.btn:hover { color: #3651d4; margin: -4px 0 1.5rem; }\n@media (max-width: 899px) { .a { width: calc(100% - 2px); } }',
  html: '<!-- topo -->\n<a href="https://x.dev" class=\'link\'>Texto com "aspas" & <b>negrito</b></a>',
  yaml: 'name: testes # ci\non:\n  push:\njobs:\n  node:\n    runs-on: "ubuntu-latest"\n    retries: 3',
  rust: 'fn main() {\n    let x: i32 = 0x1F; // hex\n    println!("{}", x);\n}',
};

test('o texto do código não muda: só ganha marcação, e tudo é escapado', () => {
  for (const [lingua, codigo] of Object.entries(AMOSTRAS)) {
    const html = realcar(codigo, lingua);
    assert.equal(texto(html), codigo, lingua);
    assert.ok(!/<(?!\/?span)/.test(html), `${lingua}: só <span> no HTML`);
  }
});

test('script ou HTML dentro do código vira texto, em qualquer linguagem', () => {
  const perigoso = '<img src=x onerror=alert(1)><script>alert("x")</script> \' " &';
  for (const lingua of ['js', 'python', 'html', 'json', 'desconhecida', '']) {
    const html = realcar(perigoso, lingua);
    assert.ok(!/<(img|script)/i.test(html), lingua);
    assert.equal(texto(html), perigoso, lingua);
  }
});

test('JavaScript: palavra-chave, texto, regex, número, comentário e função', () => {
  const html = realcar(AMOSTRAS.js, 'js');
  assert.deepEqual(marcados(html, 'k').slice(0, 2), ['const', 'const']);
  assert.ok(marcados(html, 's').includes('/^(\\d)\\1{10}$/'), 'a regex é reconhecida');
  assert.ok(marcados(html, 's').includes("'fim'"));
  assert.ok(marcados(html, 'c').includes('// repetidos'));
  assert.ok(marcados(html, 'n').includes('2.5'));
  assert.ok(marcados(html, 'f').includes('reduce'));
  assert.ok(!marcados(html, 's').some(s => s.startsWith('/ b')), 'a / b é divisão, não regex');
});

test('Python, SQL, shell, JSON, YAML e CSS: o principal de cada um', () => {
  const py = realcar(AMOSTRAS.python, 'py');
  assert.ok(marcados(py, 'k').includes('def') && marcados(py, 'k').includes('@cache'));
  assert.ok(marcados(py, 's').includes('"""Soma."""') && marcados(py, 's').includes('f"{soma(1)}"'));
  assert.ok(marcados(py, 'n').includes('None') && marcados(py, 'n').includes('True'));
  const sql = realcar(AMOSTRAS.sql, 'sql');
  assert.ok(['SELECT', 'FROM', 'WHERE', 'GROUP', 'BY'].every(p => marcados(sql, 'k').includes(p)), 'SQL sem caixa');
  assert.ok(marcados(sql, 'c').includes('-- total'));
  const sh = realcar(AMOSTRAS.bash, 'bash');
  assert.ok(marcados(sh, 'p').includes('${PASTA}'));
  assert.ok(marcados(sh, 'c').includes('# comentário'));
  assert.ok(!marcados(sh, 'c').some(c => c.includes('nao')), '"#" dentro do texto não é comentário');
  const json = realcar(AMOSTRAS.json, 'json');
  assert.deepEqual(marcados(json, 'p'), ['"nome"', '"versao"', '"ativo"', '"lista"']);
  assert.ok(marcados(json, 's').includes('"DeepChat"'));
  assert.ok(marcados(json, 'n').includes('-2.5e3') && marcados(json, 'n').includes('null'));
  const yaml = realcar(AMOSTRAS.yaml, 'yml');
  assert.ok(['name', 'on', 'push', 'jobs', 'runs-on', 'retries'].every(k => marcados(yaml, 'p').includes(k)));
  const css = realcar(AMOSTRAS.css, 'css');
  assert.ok(marcados(css, 'p').includes('color') && marcados(css, 'n').includes('#3651d4') && marcados(css, 'k').includes('@media'));
  assert.ok(!marcados(css, 'p').includes('btn'), 'seletor com :hover não é propriedade');
});

test('HTML: tag, atributo e valor; o texto entre as tags fica sem cor', () => {
  const html = realcar(AMOSTRAS.html, 'html');
  assert.deepEqual(marcados(html, 'k'), ['a', 'b', 'b', 'a']);
  assert.deepEqual(marcados(html, 'p'), ['href', 'class']);
  assert.ok(!marcados(html, 's').includes('"aspas"'), 'aspas no texto não viram valor');
});

test('entradas longas e malformadas não travam (tempo linear, e acima do limite só escapa)', () => {
  const n = MAX_REALCE - 10;
  const casos = [
    ['js', '1'.repeat(n) + 'a'], ['js', '/['.repeat(n / 2)], ['css', 'a'.repeat(n)], ['css', 'a:'.repeat(n / 2) + '{'],
    ['yaml', '-'.repeat(n)], ['yaml', '1'.repeat(n) + 'x'], ['sql', '1'.repeat(n) + 'x'], ['sh', 'echo ' + '1'.repeat(n - 10) + 'abc'],
    ['python', '"""' + 'x'.repeat(n)], ['html', '<a ' + 'b'.repeat(n)], ['js', '/*' + '*'.repeat(n)],
  ];
  for (const [lingua, codigo] of casos) {
    const inicio = performance.now();
    const html = realcar(codigo, lingua);
    const ms = performance.now() - inicio;
    assert.ok(ms < 1000, `${lingua} levou ${Math.round(ms)} ms`);
    assert.equal(texto(html), codigo, lingua);
  }
  const grande = 'const x = 1;\n'.repeat(MAX_REALCE / 10);
  assert.equal(realcar(grande, 'js'), grande.replace(/&/g, '&amp;'), 'acima do limite, sem cor');
});

test('linguagem desconhecida ou sem nome: só escapa', () => {
  assert.equal(familiaDe('brainfuck'), null);
  assert.equal(realcar('a < b', ''), 'a &lt; b');
  assert.equal(familiaDe('TypeScript'), 'js');
});

test('o código da demonstração (CPF) fica com as cores esperadas', () => {
  const resposta = exemploDaPergunta('Escreva uma função em JavaScript que valide um CPF.').resposta;
  const codigo = resposta.match(/```js\n([\s\S]*?)```/)[1];
  const html = realcar(codigo, 'js');
  assert.equal(texto(html), codigo);
  assert.ok(marcados(html, 'f').includes('validarCPF'));
  assert.ok(marcados(html, 's').includes('/\\D/g'));
});
