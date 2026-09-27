# Labutar — Modelo de dados

Convenções: datas civis em `AAAA-MM-DD`, timestamps em ISO-8601 UTC, dinheiro em
**centavos (inteiro)**, IDs com prefixo por entidade (`VAGA_`, `CAND_`, `CTDA_`).

## Coleções Firestore

```
tenants/{tenantId}
tenants/{tenantId}/usuarios/{usuarioId}
tenants/{tenantId}/clientes/{clienteId}              # só para consultorias de RH
tenants/{tenantId}/vagas/{vagaId}
tenants/{tenantId}/vagas/{vagaId}/publicacoes/{canal}
tenants/{tenantId}/vagas/{vagaId}/candidaturas/{candidaturaId}
tenants/{tenantId}/candidatos/{candidatoId}          # banco de talentos
tenants/{tenantId}/candidatos/{candidatoId}/curriculos/{curriculoId}
tenants/{tenantId}/entrevistas/{entrevistaId}
tenants/{tenantId}/avaliacoes/{avaliacaoId}
tenants/{tenantId}/avaliacoes/{avaliacaoId}/respostas/{respostaId}
tenants/{tenantId}/cursos/{cursoId}
tenants/{tenantId}/cursos/{cursoId}/matriculas/{matriculaId}
tenants/{tenantId}/avisos/{avisoId}
tenants/{tenantId}/admissoes/{admissaoId}
tenants/{tenantId}/admissoes/{admissaoId}/documentos/{documentoId}
tenants/{tenantId}/eventosESocial/{eventoId}
tenants/{tenantId}/modelosProcesso/{modeloId}        # templates de pipeline
contas/{uid}                                         # login de candidato (portal)
```

## Vaga

```js
{
  id: "VAGA_…",
  tenantId, clienteId: null,          // clienteId preenchido em consultorias
  titulo, slug, resumo, descricao,     // descricao em Markdown
  responsabilidades: [], requisitos: [], beneficios: [],
  competencias: [{ nome, peso, obrigatoria }],
  area, nivel, cbo, tipoContrato,      // CLT | PJ | ESTAGIO | APRENDIZ | TEMPORARIO
  jornada: { tipo, horasSemanais, turnos },
  local: { modelo, cidade, uf, cep, endereco },   // modelo: PRESENCIAL | HIBRIDO | REMOTO
  salario: { min, max, exibir, periodicidade },   // centavos
  quantidadeVagas: 1,
  idiomas: [{ codigo, nivel }],
  etapas: [{ id, nome, ordem, tipo, avaliadores, slaDias }],
  knockout: [{ id, pergunta, tipo, obrigatoria, eliminatória }],
  regrasTriagem: { pesoCompetencias, pesoExperiencia, pesoFormacao,
                   pesoIdiomas, pesoLocalizacao, corteMinimo, reprovacaoAutomatica },
  status,                              // RASCUNHO | ABERTA | PAUSADA | ENCERRADA | CANCELADA
  recrutadorId, requisitanteId,
  datas: { criadaEm, abertaEm, encerradaEm, previsaoContratacao },
  seo: { titulo, descricao, keywords },
  diversidade: { cotaPcd, politica },
  acessibilidade: { descricao }
}
```

`etapas[].tipo` ∈ `TRIAGEM | CURRICULO | AVALIACAO | ENTREVISTA | PROPOSTA | APPROVACAO |
ADMISSAO | SAIDA`. Etapas do tipo `SAIDA` recebem `motivo` (reprovado, desistente, banco).

## Candidato (banco de talentos)

```js
{
  id: "CAND_…", tenantId, contaUid: null,
  dados: { nome, nomeSocial, cpf, nascimento, genero, pcd, tipoDeficiencia },
  contato: { email, telefone, cidade, uf, links: { linkedin, github, portfolio } },
  formacao: [{ instituicao, curso, nivel, inicio, conclusao, concluido }],
  experiencias: [{ empresa, cargo, inicio, fim, atual, descricao, competencias }],
  competencias: [{ nome, nivel, anosExperiencia }],
  idiomas: [{ codigo, nivel }],
  pretensaoSalarial, disponibilidadeInicio,
  curriculoTexto,                       // extraído do PDF/DOCX, indexado para busca
  consentimento: { aceito, versaoTermo, em, ip, finalidade },
  origem,                               // canal que trouxe o candidato
  duplicadoDe: null,
  criadoEm, atualizadoEm
}
```

**Deduplicação:** chave composta por `cpf` normalizado; na ausência, `email` minúsculo;
na ausência, `telefone` (DDD + número). Conflito gera `duplicadoDe` e nunca sobrescreve.

## Candidatura

```js
{
  id: "CTDA_…", tenantId, vagaId, candidatoId,
  etapaAtualId, etapaAtualDesde,
  origem: { canal, utm: { source, medium, campaign }, publicacaoId },
  respostasKnockout: [{ perguntaId, valor, eliminatoriaFalhou }],
  score: { total, corte, componentes: { competencias, experiencia, formacao,
           idiomas, localizacao, salario }, aprovado },
  status,                    // EM_ANDAMENTO | APROVADO | REPROVADO | DESISTENTE | BANCO
  motivoReprovacao,
  historico: [{ etapaId, de, para, em, porUsuarioId, observacao }],
  avaliacoes: [{ avaliacaoId, tipo, resultado, em }],
  entrevistas: [entrevistaId],
  avaliacoresInternas: [{ usuarioId, nota, parecer, em }],
  anexos: [{ nome, url, tipo, enviadoEm }],
  criadoEm, atualizadoEm
}
```

## Entrevista

```js
{
  id: "ENTV_…", tenantId, vagaId, candidaturaId,
  tipo,                        // VIDEO | PRESENCIAL | TELEFONE
  participanteIds: [], candidatoId,
  agenda: { inicio, fim, duracaoMinutos, fuso },
  local: { endereco } | { link, provider },
  status,                      // AGENDADA | CONFIRMADA | EM_ANDAMENTO | CONCLUIDA | CANCELADA | FALTA
  lembretes: [{ enviar, antesMinutos, canais: [], enviadoEm }],
  roteiro: [],
  scorecards: [{ usuarioId, criterios: [{ id, nota, comentario }], parecer, recomendacao, em }]
}
```

Reaproveita a máquina de estados de `agendamento.js` (o código existente), que já está correta.

## Admissão

```js
{
  id: "ADM_…", tenantId, candidaturaId, candidatoId, vagaId,
  dadosContrato: { tipoRegime, cargo, cbo, salarioCentavos, jornada, dataAdmissao,
                   localTrabalho, matricula, tpRegPrev },
  checklist: [{ documento, obrigatorio, status, arquivoUrl, validadoPor, validadoEm }],
  aso: { asoId, tipo: "1", apto, realizadoEm, medicoCrm },
  esocial: { s2200: {status, protocolo, enviadoEm},
             s2220: {status, protocolo, enviadoEm},
             s2240: {status, protocolo, enviadoEm} },
  status,                       // PENDENTE | DOCUMENTOS_OK | ASO_OK | ENVIADA | CONCLUIDA | BLOQUEADA
  bloqueios: [{ campo, motivo }]
}
```

## Evento eSocial

```js
{
  id: "EVS_…", tenantId, evento: "S-2200" | "S-2220" | "S-2240",
  referenciaId,                 // admissaoId / asoId
  idEvento,                     // 36 chars — ver @labutar/core ids.js
  xmlAssinado, hash,
  protocolo, status,            // GERADO | ASSINADO | ENVIADO | PROCESSADO | REJEITADO
  retorno, erros: [{ codigo, descricao }],
  retificacao: { indRetif, nrRecibo },
  criadoEm, enviadoEm, processadoEm
}
```

`indRetif`/`nrRecibo` existem no leiaute oficial e **faltam** no `esocial.js` herdado.
