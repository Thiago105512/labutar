# Padrões do Labutar

> Regra do produto (2026-09-30): **tudo o mais padronizado possível — nada que confunda
> ou atrapalhe.** Um conceito tem um nome só, uma ação tem um verbo só, um dado tem um
> formato só, e toda tela do mesmo tipo funciona do mesmo jeito.
>
> O teste `server/test/padroes.test.js` fiscaliza as regras marcadas com 🔒: o CI falha
> se alguém usar um termo, formato ou nome de norma fora do padrão.

## 1. Princípios

1. **Um nome por conceito.** Se a tela diz "tomador", nenhuma outra diz "cliente" para a mesma coisa.
2. **Um verbo por ação.** "Salvar" é sempre "Salvar"; "Excluir" é sempre "Excluir".
3. **Um formato por dado.** Valor, data, CPF e competência aparecem sempre do mesmo jeito.
4. **Um lugar por regra.** Cálculo legal, formatação e fuso vivem num só módulo; ninguém reimplementa.
5. **Telas iguais para tarefas iguais.** Quem aprendeu uma lista aprendeu todas.
6. **Palavra do usuário, não do programador.** Nada de código de erro, sigla interna ou inglês na tela.

## 2. Glossário 🔒

| Use | Não use | Significado |
|---|---|---|
| **Colaborador** | trabalhador, funcionário, empregado | Pessoa com vínculo com a empresa: temporário, terceirizado ou próprio |
| **Candidato** | — | Pessoa em processo seletivo, ainda sem vínculo |
| **Tomador** | cliente | Empresa que recebe os colaboradores (Lei 6.019/1974). No comercial, quem ainda não contratou é **possível tomador** |
| **Contrato** | — | Acordo entre a empresa e um tomador (temporário ou terceirização) |
| **Posto** | — | Vaga de trabalho dentro de um contrato (função, local, escala) |
| **Alocação** | lotação (na tela) | Colaborador ocupando um posto num período. "Lotação" só no sentido do eSocial |
| **Vínculo** | — | Temporário, terceirizado ou próprio (prazo indeterminado) |
| **Verba** | rubrica | Provento ou desconto da folha. "Rubrica" só como o código da verba no eSocial |
| **Competência** | mês de referência | Mês da folha, mostrado como 09/2026 |
| **Convenção coletiva** / **Acordo coletivo** | CCT/ACT na tela | Normas coletivas; o acordo prevalece sobre a convenção no que regula |
| **Usuário** | — | Pessoa da equipe interna com login no painel |
| **Acesso** | conta, login (na tela) | Login de candidato, colaborador ou tomador nos portais |
| **Módulo**, **nível**, **perfil** | — | Controle de acesso (docs/12) |

Os textos legais citados nos documentos mantêm as palavras da lei ("empregado",
"trabalhador temporário"); a regra vale para o que o usuário lê nas telas.

## 3. Ações 🔒

| Use | Não use | Quando |
|---|---|---|
| **Salvar** | Gravar | Guardar alterações. Pode completar: "Salvar perfil" |
| **Excluir** | Apagar, Remover, Deletar | Tirar definitivamente. Sempre pede confirmação |
| **Cancelar** | — | Sair de um formulário sem salvar |
| **Fechar** | — | Fechar painel ou aviso sem ação pendente |
| **Novo …** | Adicionar, Criar (no botão de abrir) | Abrir o cadastro de um item: "Novo usuário" |
| **Editar** | Alterar, Modificar | Abrir um item para mudar |
| **Aprovar** / **Reprovar** | Aceitar, Recusar | Decisões com responsável (ponto, medição, laudo) |
| **Enviar** | Transmitir | Mandar para fora (eSocial, e-mail, tomador) |
| **Exportar** | Baixar, Download | Gerar arquivo (PDF, Excel, CNAB) |

Ordem dos botões no rodapé de formulário: **Cancelar à esquerda, ação principal à direita**.
A ação principal é a única com cor de destaque.

## 4. Formatos 🔒

| Dado | Na tela | Na API e no banco |
|---|---|---|
| Dinheiro | R$ 1.234,56 (sempre com centavos) | Inteiro em centavos: `123456` |
| Data | 30/09/2026 | `2026-09-30` |
| Data e hora | 30/09/2026 14:05 | ISO 8601 com fuso: `2026-09-30T18:05:00.000Z` |
| Competência | 09/2026 | `2026-09` |
| CPF | 123.456.789-09 | Só dígitos |
| CNPJ | 12.345.678/0001-90 | Só dígitos |
| Telefone | (92) 98888-7777 | Só dígitos com DDD |
| Percentual | 12,5% | Número: `12.5` |
| Hora de jornada | 08:00 | `08:00` |

Na interface, **só** as funções de `web/app/ui.js` formatam: `moeda()`, `data()`,
`dataHora()`. Nos pacotes, só as de `packages/core` (`formatarBRL`, `formatarDataBR`).

## 5. Fuso horário 🔒

- Fuso da empresa: **`America/Manaus` (UTC−4)**, `FUSO_PADRAO` em `packages/core/src/datas.js`.
  Quando houver configuração por empresa, ela substitui este padrão.
- "Que dia é" sai **só** de `hoje()` e `dataNoFuso()` do core. É proibido derivar o dia de
  `toISOString().slice(0, 10)` (dá o dia em UTC: às 20h em Manaus já é o dia seguinte) e
  fixar deslocamento (`-03:00`) no código.
- Horários na tela são mostrados no fuso da empresa, não no do navegador.

## 6. Nomes de normas 🔒

Sempre pelo mesmo nome: **Lei 6.019/1974**, **Portaria MTP 671/2021**, **CLT, art. N**,
**NR-N**, **Lei 13.709/2018 (LGPD)**. Eventos do eSocial pelo código: **S-2200**.

## 7. Códigos

Um código identifica **uma coisa só, para sempre**: nunca é reaproveitado, nunca é renumerado
e **nunca é montado com dado pessoal**.

### 7.1 Pessoa e matrícula

**A pessoa é identificada pelo CPF**, como no eSocial (`cpfTrab`): é o código do trabalhador
em todo o Labutar — cadastro, folha, portal, clínica. Uma pessoa tem um CPF só, a vida inteira,
em todos os vínculos. Sem CPF o cálculo da folha sai, mas o colaborador fica com a pendência
"CPF não informado" e nada dele vai ao eSocial. CPF de outra pessoa é recusado.

A **matrícula identifica o vínculo** (cada contratação), porque a mesma pessoa pode ter vários
vínculos ao longo do tempo — e o eSocial exige matrícula diferente em cada um. O código do
sistema anterior (ex.: `005328`) fica guardado como **matrícula anterior**, só para consulta.

| Regra | Por quê |
|---|---|
| Uma matrícula **por vínculo**, não por pessoa | O temporário que volta depois da quarentena abre vínculo novo; o eSocial não aceita a mesma matrícula em dois vínculos do mesmo empregador |
| **Não** derivar do CPF | Pessoas diferentes coincidem nos últimos dígitos (com 1.000 colaboradores e 6 dígitos, a chance de repetição passa de 30%); os 2 últimos do CPF são dígitos verificadores; e a matrícula aparece em crachá, holerite e relatórios, onde CPF não deve aparecer (LGPD) |
| Formato **V-NNNNNN-D**: 1 dígito do vínculo, 6 de sequência, 1 verificador | Lê-se o vínculo de relance; o verificador pega erro de digitação em planilha e relógio; só números, compatível com relógio, banco e eSocial |

Dígito do vínculo: **1** próprio · **2** temporário · **3** terceirizado. Exemplo: `2-004821-7`
(temporário). Na API e no eSocial, sem separadores: `20048217`. A pessoa é sempre achada
pelo CPF ou pelo nome; a matrícula identifica o vínculo.
Geração e validação só por `gerarMatricula`, `proximaMatricula`, `validarMatricula` e
`formatarMatricula` (`packages/mao-de-obra/src/matricula.js`).

### 7.2 Empresa e tomador

| Código | Formato | Exemplo |
|---|---|---|
| Empresa (grupo, todas as filiais) | Raiz do CNPJ, 8 caracteres | `11.222.333` |
| Estabelecimento (filial) | CNPJ completo | `11.222.333/0002-62` |

CNPJ é dado público e já é o identificador do eSocial e da regra dos 180 dias (que conta pela
raiz). Aceita os dois formatos: numérico e **alfanumérico** (IN RFB 2.229/2024, emitido desde
julho de 2026, ex.: `12.ABC.345/01DE-35`). Tomador pessoa física usa o CPF ou o CAEPF.

### 7.3 Verbas: o código é o do eSocial

O eSocial **não tem código fixo de verba**: cada empresa cria o seu (campo `codRubr` do evento
S-1010) e liga cada verba a uma **natureza** da Tabela 03 do eSocial (4 dígitos; ex.: 1000,
salário). Para não haver confusão, o código da verba no Labutar é:

**NNNN.VV** = natureza da Tabela 03 + variante de 2 dígitos

| Faixa da variante | Uso |
|---|---|
| `01`–`49` | Catálogo padrão do Labutar: o **mesmo código em todas as empresas** que usam o sistema |
| `50`–`99` | Verbas próprias da empresa (acordos coletivos, benefícios específicos) |

- Duas verbas com a mesma natureza (hora extra a 50% e a 100%) diferem só na variante.
- O código é exatamente o enviado ao eSocial (`codRubr`) e o impresso no holerite: um número
  só na tela, no holerite, no eSocial e na contabilidade.
- Mudou a incidência ou a natureza? Nova **vigência** da mesma verba, código mantido.
- Os códigos das naturezas são conferidos contra a Tabela 03 do leiaute vigente ao montar o
  catálogo padrão (docs/13, seção 16).

### 7.4 Códigos que são do próprio eSocial

Onde o eSocial tem tabela, **o Labutar usa o código dele, sem código paralelo**. Códigos de
sistemas antigos (como "05 = término do contrato" no relatório de 12/2020) são convertidos na
importação e não aparecem mais.

| Informação | Código usado | Origem |
|---|---|---|
| Natureza da verba | 4 dígitos, início do código `NNNN.VV` | Tabela 03 |
| Incidência de INSS e FGTS da verba | `codIncCP`, `codIncFGTS` | XSD do S-1010 (já no sistema) |
| Incidência de IRRF da verba | código da Tabela 21 | Anexo I (a obter) |
| Categoria do trabalhador | 106 temporário, 101 empregado | Tabela 01 |
| Motivo de afastamento | Tabela 18 | Anexo I (a obter) |
| Motivo de desligamento | Tabela 19 | Anexo I (a obter) |
| Tipo de lotação (tomador) | Tabela 10 | Anexo I (a obter) |
| Fatores de risco, exames do ASO | Tabelas 24 e 27 | Anexo I (a obter) |
| Cargo | CBO | Ministério do Trabalho |
| Atividade da empresa | CNAE | IBGE/Receita |

Onde o eSocial deixa o código livre, o Labutar tem padrão próprio: **matrícula** (7.1),
**empresa e tomador** pelo CNPJ (7.2) e **verba** `NNNN.VV` (7.3), sempre dentro dos formatos
que o XSD aceita — conferido por teste automático.

## 8. Telas

**Lista** (usuários, vagas, colaboradores, tomadores…): título e ação principal ("Novo …") no
topo à direita → filtros → tabela → estado vazio com frase explicando e a mesma ação.

**Detalhe e edição**: sempre no **painel lateral** que abre por cima da lista; nunca em
página nova. Cabeçalho com nome e situação, conteúdo, rodapé com Cancelar e ação principal.

**Confirmação**: só para ação que não se desfaz (excluir, fechar folha, enviar ao eSocial). O
texto diz o que vai acontecer e com o quê: "Excluir o perfil Supervisor? Os 3 usuários com
esse perfil ficarão sem acesso ao módulo."

**Situação** (etiquetas), mesma cor para o mesmo sentido em todo o sistema:

| Cor | Classe | Sentido |
|---|---|---|
| Verde | `e-verde` | Ativo, aprovado, em dia |
| Âmbar | `e-ambar` | Atenção: vence em breve, pendente de alguém |
| Vermelho | `e-vermelho` | Bloqueado, vencido, reprovado, erro |
| Cinza | `e-cinza` | Inativo, encerrado, rascunho |
| Azul | `e-azul` | Em andamento |
| Índigo | `e-marca` | Informação da própria empresa (perfil, papel) |
| Destaque | `e-destaque` | Acesso total e destaques raros |

**Ícones**: um ícone por conceito, todos em `web/app/icones.js`; o mesmo conceito usa o mesmo
ícone no painel e nos portais.

## 9. Mensagens

- **Sucesso**: o que foi feito, no passado: "Usuário criado."
- **Erro**: o que aconteceu e o que fazer: "O CPF já está cadastrado para Maria Costa. Abra o
  cadastro dela em vez de criar outro." Nunca código técnico nem "erro inesperado" sozinho.
- **Bloqueio legal**: cita a regra: "Contratação bloqueada: o temporário completou 180 dias
  nesta tomadora em 12/08/2026 e só pode voltar após 10/11/2026 (Lei 6.019/1974, art. 10, § 5º)."
- Tratamento por "você"; frases curtas; sem ponto de exclamação.

## 10. API e código

- Resposta sempre `{ ok: true, dados }` ou `{ ok: false, erro, codigo, detalhes }`.
- Rotas em português, no plural: `/api/colaboradores/:id`.
- Nomes em português no código, como no glossário (`tomadorId`, `competencia`, `verbas`).
- Constantes de situação em MAIÚSCULAS (`ATIVO`, `ENCERRADO`), com o nome de tela ao lado
  (`NOME_…`), nunca texto solto na tela.
- Regra de negócio em pacote puro (`packages/*`) com teste; a tela só exibe.

## 11. Como mudar um padrão

Padrão muda por decisão explícita, registrada aqui, com o teste de padrões atualizado no
mesmo PR — nunca com exceção pontual.
