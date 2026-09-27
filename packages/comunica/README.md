# @labutar/comunica

Camada de mensagens do Labutar: templates com variáveis e filtros, mural de avisos
com confirmação de leitura, lembretes agendáveis e roteamento de canais.

**Este pacote não envia nada.** Sem SMTP, sem API de WhatsApp, sem `fetch`, sem
`import` de Node. Ele devolve um objeto simples descrevendo o que deve ser enviado
(`{ canal, destino, assunto, corpo, anexos, metadata }`) e **o servidor é o dono da
entrega**. Isso mantém templates testáveis sem rede e permite trocar de provedor
sem tocar em regra de negócio.

Zero dependências; o único import externo é o `@labutar/core` por caminho relativo.
JS puro, roda igual no Node e no navegador (o painel do recrutador pré-visualiza
as mensagens no cliente).

## API

### `templates.js`
- `criarTemplate({ id, nome, canal, assunto, corpo, variaveis, ativo, categoria, descricao })`
  → template + `problemas[]` + `valido`. Incoerência entre texto e variáveis
  (`VARIAVEL_NAO_DECLARADA`, `VARIAVEL_NAO_USADA`, duplicada) é **problema, não
  exceção**: dá para salvar rascunho e corrigir depois.
- `renderizar(template, contexto)` → `{ ok, assunto, corpo, faltantes[], erros[], usadas[] }`.
  Variável ausente sem `padrao` derruba `ok` e **nunca** deixa `{{variavel}}` vazar
  para o candidato.
- `listarVariaveis(texto)`, `parsearExpressao(conteudo)`, `FILTROS`.
- `montarMensagem(template, { contexto, destino, anexos, metadata, urgencia })`
  → `{ ok, mensagem, faltantes, erros }`. Valida destino e limites do canal.
- `TEMPLATES_PADRAO`: 10 templates prontos (candidatura recebida, triagem aprovada,
  convite, lembretes de 24h e 1h, cobrança de parecer do gestor, proposta,
  reprovação, boas-vindas na admissão, documento pendente).

Sintaxe: `{{variavel}}`, `{{variavel|filtro}}`, `{{a|f1|f2}}`, caminhos com ponto
(`{{vaga.titulo}}`). Filtros: `maiusculas`, `minusculas`, `capitalizar`, `dataBR`,
`moeda` (valor em **centavos**, como no core), `cpf`, `telefone`, `cep`, `email`,
`nome` (mascaramento LGPD para telas compartilhadas), `truncar:N[:sufixo]`,
`padrao:valor`.

Reprovação de candidato **não** revela pontuação, corte nem posição no ranking.

### `canais.js`
- `CANAIS` = `EMAIL | WHATSAPP | SMS | PUSH | MURAL`; `limites(canal)` →
  `{ corpoMaximo, suportaAnexo, suportaAssunto, custoRelativo, intrusivo }`.
- `validarDestino(canal, destino)` → `{ valido, motivo, canal, normalizado }`.
  WhatsApp/SMS recusam telefone fixo; PUSH exige token; MURAL exige `usuarioId`.
- `contarSegmentosSMS(texto)` → `{ caracteres, segmentos, porSegmento, codificacao }`.
  GSM-7: 160 no primeiro segmento, 153 nos demais. Qualquer caractere fora da
  tabela GSM-7 (`á`, `õ`, `ç`, emoji) força UCS-2 e corta para 70/67.
- `escolherCanal({ preferencia, destino, urgencia, horarios, referencia })` →
  `{ canal, destino, motivo, adiarPara, tentativas }`. Prefere o canal pedido e
  cai em `ORDEM_FALLBACK` (WhatsApp → e-mail → SMS → push → mural). Fora da janela
  de horário tenta um canal assíncrono; se não houver, **adia** (`adiarPara`) em
  vez de descartar. `urgencia: CRITICA` ignora a janela.
- `janelaPermitida(canal, horarios, referencia)`.

### `avisos.js`
- `criarAviso({ titulo, corpo, publico, prioridade, fixado, vigencia, anexos, autorId })`
  → aviso + `problemas[]`. `publico.tipo` ∈ `TODOS | PAPEIS | USUARIOS | VAGA`.
- `destinatarios(aviso, usuarios)` — resolve o público (`papel`/`papeis`,
  `vagasIds`); público inválido devolve lista vazia em vez de avisar todo mundo.
- `registrarLeitura(aviso, usuarioId, em)` — idempotente, não muta a entrada.
- `leituraPorUsuario(aviso, usuarios)` → `{ total, lidos[], naoLidos[], taxaLeitura }`.
- `avisosVigentes(avisos, referencia)`, `avisosVencendo(avisos, diasAntes, referencia)`,
  `ordenarAvisos(avisos)` (prioridade → fixado → mais recente → id).

### `lembretes.js`
- `agendarLembrete({ tipo, destino, quando, antesMinutos, canais, templateId, contexto, referenciaId })`,
  `agendarLembretes` (várias antecedências) e `lembretesParaEntrevista(entrevista)`
  (usa `entrevista.lembretes` do modelo de dados ou o padrão 24h + 1h).
- `lembretesPendentes(lembretes, agora)` e `lembretesAtrasados(lembretes, agora)`.
- `marcarEnviado(lembrete, canal, em)` — idempotente **por canal**; só vira
  `ENVIADO` quando todos os canais dispararam.
- `canaisPendentes`, `estaCompleto`, `statusLembrete`, `minutosAtraso`,
  `detalheAtraso`, `cancelarLembrete`, `reagendarLembrete`.

### `constantes.js` / `instantes.js`
Enums compartilhados (`PRIORIDADE_AVISO`, `PUBLICO_ALVO`, `URGENCIA`,
`STATUS_LEMBRETE`, `TIPO_LEMBRETE`, `ATRASO_TOLERADO_MINUTOS`) e utilidades de
tempo (`paraInstante`, `somarMinutos`, `minutosEntre`, `minutosDaHora`,
`instanteCivil`).

## Testes

```
cd labutar
node --test "packages/comunica/test/*.test.js"
```
