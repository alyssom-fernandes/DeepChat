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
- Dá para parar a qualquer momento, pelo botão ou com Esc.

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
  espera crescente. Quando três perguntas seguidas falham na mesma API, o
  app espera 30 s antes de insistir nela.
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
- **Chaves.** Com "Lembrar neste navegador", elas ficam no `localStorage`
  cifradas com AES-GCM (chave derivada com PBKDF2, 100 mil iterações). A
  senha da cifra vem do próprio navegador: isso evita que as chaves fiquem
  legíveis num backup ou numa olhada no armazenamento, mas não protege
  contra um script rodando nesta mesma página. Sem a opção, as chaves valem
  só até recarregar ou fechar a página. Vale usar chaves com limite de gasto.
- **Conteúdo das IAs.** O Markdown passa pelo DOMPurify; todo texto de fora
  (pergunta, nome de arquivo, título) é escapado antes de virar HTML.
- **Content Security Policy** sem `'unsafe-inline'`, com conexões liberadas
  só para as duas APIs. O `marked` e o DOMPurify vêm com versão fixa e
  conferência de integridade (SRI).

## Como é feito

| Parte | Tecnologia |
|---|---|
| Interface | HTML, CSS e JavaScript em módulos ES, sem framework e sem build |
| Markdown | marked 9 e DOMPurify 3, pelo jsDelivr, com SRI |
| APIs | `fetch` direto para DeepSeek (`deepseek-chat`) e OpenAI (GPT-4o mini ou GPT-4o) |
| Dados | `localStorage` para histórico e preferências; WebCrypto para as chaves |
| Fontes | Instrument Sans na interface; JetBrains Mono no código e na assinatura (Google Fonts) |
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

## Limitações conhecidas

- É preciso ter uma chave de API de cada serviço, com créditos. Sem elas,
  só a demonstração funciona.
- As respostas chegam inteiras, não palavra por palavra. Uma pergunta com
  revisão costuma levar de 5 a 30 segundos.
- O DeepSeek não lê imagens. PDF não é aceito: para um PDF, copie o texto
  para um arquivo TXT.
- O histórico fica só neste navegador. Limpar os dados do site apaga as
  conversas; para guardar uma, exporte em Markdown.
- O `marked`, o DOMPurify e as fontes vêm de CDN. Sem eles, o Markdown cai
  num formato simples e seguro, e as fontes, nas do sistema.
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
  api-client.js       chamadas às APIs: tentativas, tempo limite, circuit breaker, anexos
  revisao.js          prompts e leitura da revisão (veredito e seções)
  conversa.js         modelo da conversa, migração, contexto e exportação
  storage.js          chaves cifradas, preferências e histórico
  state.js            estado da sessão
  texto.js            texto, datas e tamanhos
  demo.js             conversas da demonstração
tests/                testes das funções puras
.github/workflows/    roda os testes a cada envio
docs/telas/           imagens deste README e a prévia de link (og.png)
```

## Licença

[MIT](LICENSE). Feito por [Alyssom Fernandes](https://github.com/alyssom-fernandes), AFN Systems.
