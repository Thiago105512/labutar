# @labutar/avaliacoes

Avaliações do processo seletivo do Labutar: perfil comportamental **DISC**, **testes** objetivos e
dissertativos com rubrica, e **trilhas de curso** com progresso e certificado.

JavaScript puro, ESM, **zero dependências** — nenhuma biblioteca e nenhum módulo nativo do Node.
O mesmo código roda no servidor e no navegador, porque o resultado das avaliações é calculado no
cliente. A única importação externa é o pacote irmão `@labutar/core`, por caminho relativo.

## Uso

```js
import {
  criarAvaliacaoDISC,
  calcularDISC,
  descreverPerfil,
  criarTeste,
  corrigirTeste,
  criarCurso,
  matricular,
  registrarProgresso,
  calcularProgresso,
  emitirCertificado,
} from "@labutar/avaliacoes";
```

### DISC — `src/disc.js`

| Função | O que faz |
| --- | --- |
| `criarAvaliacaoDISC({ titulo, instrucoes, questoes })` | Valida e normaliza o questionário de escolha forçada: cada questão com `id`, `enunciado` opcional e **exatamente 4** alternativas `{ id, texto, fator }`, `fator ∈ D\|I\|S\|C`. Rejeita id duplicado, alternativa sem texto, fator inválido e número errado de alternativas. Questão que não cobre os quatro fatores gera `avisos`, não erro. |
| `responderDISC(avaliacao, respostas)` | Confere `{ questaoId, mais, menos }` sem calcular nada. Devolve `{ completo, pendentes, invalidas, validas }`. `mais === menos` é autocontradição e vai para `invalidas`. A última resposta válida de cada questão vence. |
| `calcularDISC(avaliacao, respostas)` | Devolve `bruto` (contagem de "mais"), `menos`/`pressao` (contagem de "menos"), `liquido` (diferença) e os três normalizados em 0–100 (`percentuais`, `percentuaisMenos`, `percentuaisLiquidos`), além de `fatorPredominante`, `perfil` (1 ou 2 letras), `completo`, `pendentes` e `invalidas`. |
| `descreverPerfil(perfil)` | Devolve `{ codigo, titulo, resumo, fatores, forcas, desafios, papeisSugeridos, ressalvas }`. Cobre os 16 códigos de 1 e 2 letras (`D`…`CS`); a ordem das letras importa — `DI` e `ID` são descrições diferentes. |
| `codigosPerfilDISC()`, `PERFIS_DISC` | Lista e tabela (congelada) dos perfis. |

**Desempate:** determinístico, sempre na ordem canônica `D, I, S, C`. Perfil de duas letras só é
emitido quando o segundo fator **empata** com o primeiro e o valor líquido é positivo; com todos os
fatores zerados o resultado sai com uma letra só.

**Percentual líquido:** 50 é o ponto neutro, porque `liquido` pode ser negativo.

### Testes — `src/testes.js`

| Função | O que faz |
| --- | --- |
| `criarTeste({ titulo, tipo, questoes, notaCorte, tempoLimiteMinutos, descricao })` | `tipo ∈ MULTIPLA_ESCOLHA \| VERDADEIRO_FALSO \| NUMERICA \| DISSERTATIVA`. Cada questão pode sobrescrever o `tipo` do teste (teste misto). `notaCorte` é **percentual** de 0 a 100 sobre a nota máxima. Valida gabarito, alternativas, `respostaEsperada` e `correta`. |
| `corrigirTeste(teste, respostas, { tempoGastoMinutos })` | Corrige só as objetivas. Devolve `{ nota, notaMaxima, notaMaximaCorrigida, percentual, percentualCorrigido, aprovado, gabaritoComparado, pendentesRevisao, acertos, erros, naoRespondidas, tempoExcedido }`. Questão dissertativa volta em `pendentesRevisao` com `nota: null` — o sistema **não inventa nota de texto**. |
| `criarRubrica({ questaoId, criterios })` | Critérios ponderados que **devem somar 100**, cada um avaliado de 0 a 5. |
| `avaliarComRubrica(rubrica, notas, { avaliador })` | Aceita `{ criterioId: nota }` ou `[{ criterioId, nota }]`. Resultado de 0 a 100. Rejeita nota fora da escala, critério faltante e critério inexistente. |
| `parsearNumero(valor)` | Converte `"3,5"`, `"1.234,56"` e `"3.5"` em número. |

**Regra de ouro:** enquanto houver questão aguardando revisão humana, `aprovado` é `null` — nunca
`false`. Um teste corrigido pela metade não pode reprovar candidato. `aprovado` também é `null`
quando o teste não define `notaCorte`. Estourar `tempoLimiteMinutos` apenas sinaliza
`tempoExcedido: true`; não zera a nota.

### Cursos — `src/cursos.js`

| Função | O que faz |
| --- | --- |
| `criarCurso({ titulo, descricao, modulos })` | Módulos com `aulas { id, titulo, duracaoMinutos, tipo ∈ VIDEO\|TEXTO\|QUIZ, notaMinima? }`. Ids de aula são únicos no curso. Devolve também `indiceAulas`, `totalAulas` e `cargaHorariaMinutos`. |
| `matricular(curso, { alunoId, prazoDias, turma, quando })` | Cria matrícula `EM_ANDAMENTO` com `prazoLimite` calculado. A matrícula carrega o índice de aulas, então é autocontida. |
| `registrarProgresso(matricula, { aulaId, concluida, nota, quando }, curso?)` | **Pura** (devolve matrícula nova) e **idempotente**: o progresso é indexado por `aulaId`, então repetir aula não conta duas vezes — só `tentativas` sobe e `concluidaEm` mantém a primeira data. Rejeita `aulaId` fora do curso. Quiz com `notaMinima` não conclui abaixo da nota. |
| `calcularProgresso(curso, matricula, referencia?)` | `{ aulasConcluidas, aulasTotais, percentual, minutosConcluidos, minutosRestantes, modulosConcluidos, modulosPendentes, concluido, notaMedia, atrasada, status }`. Módulo só conta como concluído com **todas** as aulas feitas. Percentual é por aula, não por minuto. |
| `emitirCertificado(curso, matricula, { emissor, alunoNome, validadeDias, quando })` | Só com o curso 100% concluído; caso contrário lança erro dizendo quantas aulas faltam. Gera `token` de 24 caracteres e `codigoVerificacao` derivado dele. A carga horária sai da definição do curso. |
| `validarCertificado(certificado, curso?)` | Devolve `{ valido, motivo, problemas }`. Sem o curso, confere estrutura e coerência interna (código × token, horas × minutos, data). Com o curso, **recalcula** a carga horária e pega número adulterado. |
| `estaVencendoCertificado(certificado, diasAntes?, referencia?)` | Reaproveita `estaVencendo` do core sobre `validoAte`. Certificado sem validade nunca vence. |
| `formatarCargaHoraria(minutos)`, `codigoVerificacaoDe(token)` | Formatação `1h15` e montagem do código `XXXX-XXXX-XXXX`. |

### Constantes — `src/constantes.js`

`FATOR_DISC`, `ORDEM_FATORES_DISC`, `NOME_FATOR_DISC`, `RESSALVAS_DISC`, `TIPO_TESTE`,
`TIPOS_AUTO_CORRIGIVEIS`, `TIPO_AULA`, `STATUS_MATRICULA`, `ESCALA_RUBRICA` — todas congeladas.

## Testes

```
cd /d "C:\Users\FENIX JURIDICO\labutar" && node --test "packages/avaliacoes/test/*.test.js"
```

91 testes em `test/disc.test.js`, `test/testes.test.js`, `test/cursos.test.js` e `test/index.test.js`
(fixtures em `test/auxiliares.js`). Um deles varre `src/` e falha se qualquer módulo importar pacote
externo ou `node:*`.

## Limitações

**DISC**

- O resultado é **indicativo**. Descreve preferências que a própria pessoa declarou; **não mede**
  capacidade, inteligência, competência técnica nem desempenho no trabalho.
- **Não prevê desempenho** e **não pode ser o único critério** de uma decisão de contratação. Serve
  para orientar a conversa da entrevista, junto com análise de experiência, teste técnico e
  referência.
- **Usar o perfil como filtro eliminatório é juridicamente arriscado no Brasil.** Recusar candidato
  com base apenas em traço de personalidade pode configurar prática discriminatória
  (Lei 9.029/1995, além do art. 5º da CF) e gerar condenação por dano moral. Nenhuma função deste
  pacote devolve decisão de aprovação/reprovação a partir do DISC — de propósito.
- É **instrumento de autorrelato**: sofre desejabilidade social (o candidato responde o que acha que
  a vaga pede), varia com humor e contexto, e depende de quanto a pessoa conhece a função.
- **Não é teste psicológico.** Teste psicológico validado é de uso privativo de psicólogo
  (Lei 4.119/1964 e SATEPSI/CFP). O questionário aqui é de preferências comportamentais e não pode
  ser apresentado como avaliação psicológica.
- **Não é diagnóstico** clínico, psicológico ou médico, e não identifica transtorno, deficiência ou
  aptidão permanente.
- **LGPD:** o resultado é dado pessoal. Informar a finalidade antes da aplicação, manter base legal,
  garantir acesso e correção ao titular e restringir o acesso interno ao mínimo necessário.
- Perfil não é bom nem ruim. `forcas`, `desafios` e `papeisSugeridos` são hipóteses de conversa, não
  veredito.

**Testes e rubricas**

- `notaCorte` é um número definido por quem contrata. Corte alto em teste não validado estatisticamente
  tem o mesmo efeito prático de um filtro discriminatório — revisar o corte com base no resultado real
  da turma antes de usá-lo para eliminar.
- A nota da dissertativa depende do revisor. A rubrica reduz a subjetividade, mas não a elimina;
  dois revisores podem dar notas diferentes para o mesmo texto.
- `tempoLimiteMinutos` é medido pelo cliente. Sem controle no servidor, é um indicador fraco de
  cola ou de uso de IA — não usar como prova contra o candidato.

**Cursos e certificados**

- `validarCertificado` detecta adulteração de conteúdo, **mas não prova autoria**: o token atesta que
  o registro existe e confere com o curso, não que a pessoa assistiu. Conferência de identidade é
  responsabilidade de quem aplica.
- `gerarToken` usa `crypto.getRandomValues` quando disponível e cai em `Math.random` fora do
  navegador/Node moderno. Em produção, exigir o primeiro caminho.
- Progresso é declarado pelo cliente. Sem assinatura do servidor, um aluno pode marcar aula como
  concluída sem assistir.
