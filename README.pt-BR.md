# DeepChat

![DeepChat: a conversa no computador e no celular, com a revisão do ChatGPT marcando a resposta como incorreta](docs/telas/capa.png)

O DeepChat faz cada pergunta a duas IAs. O **DeepSeek** responde; o
**ChatGPT** recebe a pergunta e a resposta e devolve uma revisão com um
veredito (correta, parcialmente correta ou incorreta), os pontos fortes, o
que melhorar e, quando precisa, a versão corrigida. Em vez de confiar numa
IA só, você vê a resposta e a conferência dela lado a lado.

Roda inteiro no navegador, com JavaScript puro, sem framework, sem etapa de
build e sem servidor: as perguntas vão direto do navegador para as APIs.

**[Abrir o DeepChat](https://alyssom-fernandes.github.io/DeepChat/)** · **[Ver a demonstração](https://alyssom-fernandes.github.io/DeepChat/?demo=1)**, sem
chaves: três conversas de exemplo, em que nada é enviado nem salvo.

[![Testes](https://github.com/alyssom-fernandes/DeepChat/actions/workflows/testes.yml/badge.svg)](https://github.com/alyssom-fernandes/DeepChat/actions/workflows/testes.yml)
![JavaScript](https://img.shields.io/badge/JavaScript-sem_framework-f7df1e?style=flat-square&logo=javascript&logoColor=black)
![Sem build](https://img.shields.io/badge/etapa_de_build-nenhuma-success?style=flat-square)
![Sem servidor](https://img.shields.io/badge/servidor-nenhum-success?style=flat-square)
![Tema](https://img.shields.io/badge/tema-claro_e_escuro-3651d4?style=flat-square)
![Licença](https://img.shields.io/badge/licen%C3%A7a-MIT-blue?style=flat-square)

Este README também está em [inglês](README.md).

## Em 30 segundos

1. Abra a [demonstração](https://alyssom-fernandes.github.io/DeepChat/?demo=1).
   Ela começa numa pergunta em que a resposta repete um mito, e a revisão
   marca **Incorreta**.
2. Na lateral, abra a conversa do CPF: a revisão acha um defeito de verdade
   no código (a função aceita `111.111.111-11`) e traz a versão corrigida.
3. Em **Nova conversa**, escolha um exemplo e veja a resposta e a revisão
   chegando.

## Telas

Capturadas do modo demonstração.

| Conversa, tema escuro | Revisão de código, tema claro |
|---|---|
| ![Conversa no tema escuro, com a revisão marcando Incorreta](docs/telas/conversa-escuro.png) | ![Revisão de uma função JavaScript no tema claro, marcando Parcialmente correta](docs/telas/codigo-claro.png) |
| **Tela de início, tema claro** | **Conversa nova, tema escuro** |
| ![Tela de início, com o campo das duas chaves](docs/telas/inicio-claro.png) | ![Conversa nova, com perguntas de exemplo](docs/telas/nova-escuro.png) |

| No celular, tema claro | No celular, tema escuro |
|---|---|
| <img src="docs/telas/celular-claro.png" alt="Revisão no celular, tema claro" width="260"> | <img src="docs/telas/celular-escuro.png" alt="Revisão no celular, tema escuro" width="260"> |

## O que ele faz

### A pergunta passa por duas IAs

- O DeepSeek responde. O ChatGPT revisa num formato fixo: **veredito**,
  precisão, pontos fortes, o que melhorar, sugestões e, só quando há erro
  ou lacuna importante, a **versão revisada** (fechada, para abrir).
- A ordem troca com um clique, na própria caixa de pergunta: o ChatGPT
  responde e o DeepSeek revisa.
- **Outra resposta**, na última resposta, pede de novo, de outro jeito, e
  revisa de novo.
- **Citar** leva um trecho de qualquer resposta ou revisão para a próxima
  pergunta, e o trecho vai junto para a IA.
- A resposta aparece palavra por palavra, e a revisão também: o veredito
  surge assim que a primeira linha dela chega. Enquanto isso, a caixa de
  pergunta mostra quem está trabalhando e há quanto tempo.
- A resposta revisada ganha na margem um traço na cor do veredito, como a
  marca de um revisor.
- Dá para parar a qualquer momento, pelo botão ou com Esc. O que já tinha
  chegado fica na conversa, marcado, e não vai para a revisão.
- Blocos de código com cores (JavaScript, TypeScript, Python, SQL, shell,
  JSON, YAML, CSS, HTML e a família do C) e botão de copiar.

### Anexos

- Arquivos de texto e de código (TXT, MD, CSV, JSON, JS, PY e outros, até
  5 MB): o conteúdo vai para quem responde e para quem revisa. Vão só os
  primeiros 20 mil caracteres; num arquivo maior, o app avisa.
- Imagens (PNG, JPG, WebP, GIF), reduzidas a 1024 px antes de enviar,
  quando o ChatGPT responde. O DeepSeek não lê imagens; o app avisa e
  oferece trocar a ordem.
- Pelo clipe, colando (Ctrl+V) ou arrastando para a conversa.

### Quando algo dá errado

- Cada erro é explicado em português: chave recusada (com atalho para
  revisar as chaves), sem saldo ou acima do limite, demora, falha de rede,
  serviço fora do ar.
- Se só a revisão falhar, a resposta fica, e o aviso oferece **Revisar
  agora**.
- Falha de rede, tempo esgotado e erro 5xx têm até três tentativas, com
  espera crescente, enquanto nenhum texto chegou. Se a conexão cai no meio
  da resposta, o que chegou fica, e o aviso oferece **Tentar de novo**.
  Quando três perguntas seguidas falham na mesma API, o app espera 30 s
  antes de insistir nela.
- O tempo limite é de 60 s sem receber nada; cada pedaço que chega renova
  o prazo.
- Uma falha inesperada fica registrada no navegador e aparece em
  **Sobre › Diagnóstico**, pronta para copiar.

### Histórico e exportação

- As conversas ficam salvas no navegador, agrupadas por data, com busca no
  título e no texto. Excluir tem **Desfazer**.
- Exportar em Markdown e imprimir ou salvar em PDF, com um layout próprio
  para o papel.
- O rascunho da pergunta fica guardado enquanto a aba estiver aberta.
- Conversas salvas pela versão anterior do app são convertidas sozinhas.

### Celular, temas e acessibilidade

- Tema claro, escuro ou do sistema, sem piscar ao abrir.
- No celular, a lista de conversas vira gaveta e os diálogos viram folhas
  que sobem de baixo.
- Teclado: Enter envia, Shift+Enter quebra a linha, Ctrl+K abre uma
  conversa nova e Esc para a resposta. O menu anda com as setas.
- O leitor de tela é avisado quando a resposta e a revisão chegam, com o
  veredito.
- Respeita "reduzir movimento" e o alto contraste do sistema.

## Privacidade e segurança

- **Sem servidor.** As perguntas vão do navegador direto para
  `api.deepseek.com` e `api.openai.com`. O custo de cada pergunta cai na
  sua conta de cada serviço.
- **Chaves.** "Lembrar neste navegador" vem desmarcado: as chaves valem só
  até recarregar ou fechar a página. Se você marcar, elas são cifradas com
  AES-GCM por uma chave aleatória que o navegador não deixa exportar (uma
  `CryptoKey` não extraível, guardada no IndexedDB); só o texto cifrado vai
  para o `localStorage`. Isso evita que as chaves fiquem legíveis num
  backup, numa cópia do perfil do navegador ou numa olhada no armazenamento.
  Não protege contra código rodando nesta mesma origem: ele não lê a chave
  de cifra, mas pode pedir ao navegador que decifre com ela. A origem
  `alyssom-fernandes.github.io` é compartilhada com outros projetos do
  autor; por isso, só marque a opção num computador que seja só seu. Se as
  chaves salvas não abrirem (por exemplo, depois de limpar parte dos dados
  do site), o app avisa e pede para colar de novo. Cofres de versões
  anteriores, com senha derivada do navegador, são abertos uma vez e
  convertidos. Vale usar chaves com limite de gasto.
- **Conteúdo das IAs.** O Markdown passa pelo DOMPurify; todo texto de fora
  (pergunta, nome de arquivo, título) é escapado antes de virar HTML.
- **Content Security Policy** sem `'unsafe-inline'`, com conexões liberadas
  só para as duas APIs. O `marked` e o DOMPurify vêm com versão fixa e
  conferência de integridade (SRI). A página 404 libera o script e o estilo
  dela pelo hash, e um teste confere esses hashes.
- **O que mais a página carrega.** Só as duas bibliotecas de Markdown, do
  jsDelivr, que vê o endereço IP de quem abre a página, nunca as conversas.
  As fontes são servidas pelo próprio site. Nenhum pedido manda o endereço
  da página (`Referer`), nem às APIs.
- **Dentro de outro site.** Num iframe, o DeepChat não pede nem abre as
  chaves (o GitHub Pages não manda o cabeçalho que impede isso) e oferece
  abrir numa aba própria. A demonstração, que não tem chaves, abre.

## Como é feito

| Parte | Tecnologia |
|---|---|
| Interface | HTML, CSS e JavaScript em módulos ES, sem framework e sem build |
| Markdown | marked 9 e DOMPurify 3, pelo jsDelivr, com SRI |
| APIs | `fetch` com stream (Server-Sent Events) direto para DeepSeek (`deepseek-chat`) e OpenAI (GPT-4o mini ou GPT-4o) |
| Código colorido | `js/realce.js`, sem biblioteca |
| Dados | `localStorage` para histórico e preferências; WebCrypto para as chaves |
| Fontes | Instrument Sans na interface; JetBrains Mono no código e na assinatura, servidas pelo próprio site (licença OFL) |
| Testes | `node --test`, sem dependências, rodando a cada envio (GitHub Actions) |

Algumas decisões por trás dele:

- **A revisão tem formato fixo, e a tela lê esse formato.** É assim que o
  veredito aparece em destaque e cada parte vai para o seu lugar. Se o
  modelo fugir do formato, a revisão aparece inteira, como texto comum; o
  formato antigo, com emojis, também é lido.
- **Quem responde não vê as revisões anteriores.** O contexto enviado tem
  só as perguntas e respostas da conversa; a revisão recebe a pergunta, a
  resposta, um resumo da conversa e o anexo. Menos tokens, e cada IA no seu
  papel.
- **A demonstração é testada.** Os exemplos foram escritos para mostrar o
  app, e os testes conferem que o que eles afirmam é verdade: rodam a
  função de CPF da resposta e a da revisão, e refazem as contas dos juros.
- **As partes que decidem o que aparece são funções puras e testadas**:
  leitura da revisão (formato novo e antigo), migração do histórico,
  contexto enviado às APIs, exportação em Markdown, busca, datas e textos.
- **O cofre de chaves é testado em Node.** Com um `localStorage` e um
  IndexedDB falsos (e o `crypto.subtle` de verdade), os testes cobrem cifrar
  e decifrar, a migração do formato antigo, a falha de abertura e o
  esquecimento das chaves.
- **O stream é testado sem rede.** Um `fetch` falso entrega a resposta aos
  pedaços, corta a conexão no meio e responde com erro; os testes conferem
  o texto montado, quando há nova tentativa e quando não há.
- **Cores no código sem biblioteca.** Um leitor pequeno por família de
  linguagem, em vez de mais um script de fora na CSP. Os testes conferem que
  o código na tela é idêntico ao que a IA mandou e que nada dele vira HTML.

## Limitações conhecidas

- É preciso ter uma chave de API de cada serviço, com créditos. Sem elas,
  só a demonstração funciona.
- O DeepSeek não lê imagens. PDF não é aceito: para um PDF, copie o texto
  para um arquivo TXT.
- As chaves salvas dependem da chave de cifra guardada neste navegador. Se
  os dados do site forem limpos em parte (IndexedDB apagado, `localStorage`
  mantido), as chaves não abrem e você cola de novo.
- O histórico fica só neste navegador. Limpar os dados do site apaga as
  conversas; para guardar uma, exporte em Markdown.
- O `marked` e o DOMPurify vêm de CDN. Sem eles, o Markdown cai num formato
  simples e seguro.
- A interface é só em português.

## Como usar a sua cópia

O app usa módulos ES, que o navegador não carrega direto do disco
(`file://`). Sirva a pasta com qualquer servidor estático, por exemplo:

```bash
python -m http.server 8000
```

e abra `http://localhost:8000`. Para publicar, o GitHub Pages serve a pasta
como está.

Para rodar os testes (Node 22 ou mais novo, sem instalar nada):

```bash
node --test
```

## Estrutura

```
index.html            a página: início, conversa e diálogos
404.html              página de endereço não encontrado
css/style.css         tema claro e escuro, celular e impressão
js/
  boot.js             tema antes da página aparecer e registro de falhas
  app.js              fluxo pergunta → resposta → revisão, eventos e diálogos
  ui.js               mensagens, revisão, avisos, histórico e toasts
  api-client.js       chamadas às APIs: stream, tentativas, tempo limite, circuit breaker, anexos
  realce.js           cores nos blocos de código
  revisao.js          prompts e leitura da revisão (veredito e seções)
  conversa.js         modelo da conversa, migração, contexto e exportação
  storage.js          chaves cifradas, preferências e histórico
  state.js            estado da sessão
  texto.js            texto, datas e tamanhos
  demo.js             conversas da demonstração
fonts/                Instrument Sans e JetBrains Mono, com as licenças OFL
tests/                testes das funções puras, do stream (fetch falso) e da CSP
.github/workflows/    roda os testes a cada envio
docs/telas/           imagens deste README e a prévia de link (og.png)
```

## Licença

[MIT](LICENSE). Feito por [Alyssom Fernandes](https://github.com/alyssom-fernandes), AFN Systems.
