# eSocial no Labutar — o que entra no sistema

> Levantamento de 2026-09-30 feito sobre os **esquemas oficiais S-1.3** versionados em
> `packages/esocial/xsd/` (pacote de 2026-12-14). A página de documentação técnica do
> gov.br não abre neste ambiente (rede bloqueada); a versão vigente dos leiautes é a
> **S-1.3 consolidada até a NT 07/2026**. Os documentos que ainda faltam estão na seção 5.

## 1. Eventos de tabela (cadastro do empregador)

| Evento | Nome | Onde nasce no Labutar | Prioridade |
|---|---|---|---|
| S-1000 | Informações do empregador | Cadastro da empresa (classificação tributária, regime, FAP) | Essencial |
| S-1005 | Estabelecimentos e obras | Filiais da empresa; CNAE e RAT por estabelecimento | Essencial |
| S-1010 | Rubricas | Catálogo de verbas `NNNN.VV` com natureza (Tabela 03) e incidências | Essencial |
| S-1020 | Lotações tributárias | **Uma lotação por tomador** (cessão de mão de obra e trabalho temporário) | Essencial — diferencial |
| S-1070 | Processos administrativos/judiciais | Jurídico: processos que suspendem incidência | Desejável |

## 2. Eventos não periódicos (vida do vínculo)

| Evento | Nome | Módulo | Prioridade |
|---|---|---|---|
| S-2190 | Registro preliminar | Admissão (admissão urgente antes do cadastro completo) | Essencial |
| S-2200 | Admissão | Admissão | Essencial |
| S-2205 | Alteração cadastral | Colaboradores | Essencial |
| S-2206 | Alteração contratual | Colaboradores (cargo, salário, jornada) | Essencial |
| S-2230 | Afastamento temporário | Colaboradores / SST | Essencial |
| S-2299 | Desligamento | Rescisão (fim do temporário = motivo próprio) | Essencial |
| S-2298 | Reintegração | Jurídico / Rescisão | Desejável |
| S-2300 / S-2306 / S-2399 | Trabalhador sem vínculo (estagiário, autônomo, diretor) | Colaboradores | Desejável |
| S-2210 | CAT | SST | Essencial |
| S-2220 | Monitoramento da saúde (ASO) | SST / clínicas parceiras | Essencial |
| S-2221 | Exame toxicológico do motorista profissional | SST — obrigatório para motoristas de caminhão | Essencial quando houver motorista |
| S-2240 | Condições ambientais (agentes nocivos) | SST, **pelo local do posto no tomador** | Essencial |
| S-2500 / S-2501 / S-2555 / S-3500 | Processo trabalhista e tributos dele | Jurídico | Desejável |
| S-8200 / S-8299 | Anotação e baixa judicial | Enviados pela Justiça do Trabalho; o Labutar só consulta | Informativo |

## 3. Eventos periódicos (folha)

| Evento | Nome | Módulo | Prioridade |
|---|---|---|---|
| S-1200 | Remuneração (RGPS) | Folha — **segregada por lotação/tomador** | Essencial |
| S-1210 | Pagamentos de rendimentos | Folha / financeiro (data do pagamento, IRRF por regime de caixa) | Essencial |
| S-1280 | Informações complementares | Folha (desoneração, quando houver) | Condicional |
| S-1298 | Reabertura | Folha | Essencial |
| S-1299 | Fechamento | Folha — **um por CNPJ por competência** | Essencial |
| S-1270 | Avulsos não portuários | Folha | Condicional |
| S-3000 | Exclusão de eventos | Todos | Essencial |
| S-1202, S-1207, S-2231, S-2400 a S-2420 | Entes públicos (RPPS, benefícios, cessão) | Fora do foco | — |
| S-1260 | Produção rural | Fora do foco | — |

## 4. Retornos do governo (totalizadores) — conferência automática

O eSocial devolve o que **ele** calculou. O Labutar compara com o que calculou e acusa a
diferença antes do fechamento — é assim que se resolve, com prova, a dúvida de
arredondamento do INSS encontrada no teste de dezembro/2020.

| Evento | O que traz | Conferência no Labutar |
|---|---|---|
| S-5001 | Contribuições sociais por colaborador | INSS descontado × INSS calculado pelo eSocial |
| S-5002 | IRRF por colaborador | IRRF retido × apurado |
| S-5003 | FGTS por colaborador | FGTS calculado × informado |
| S-5011 | Contribuições consolidadas | Total da guia (DCTFWeb) |
| S-5012 | IRRF consolidado | Total de IRRF |
| S-5013 | FGTS consolidado | Guia do FGTS Digital |
| S-5501 / S-5503 | Tributos e FGTS de processo trabalhista | Jurídico |

## 5. Comunicação

Pacote de comunicação (versionado, versão **alfa**): envio de lote (até 50 eventos), consulta
de lote, consulta de identificadores e download de eventos. Exige certificado digital ICP-Brasil
e habilitação no ambiente de produção restrita para testes.

## 6. Tabelas usadas pela folha

Vêm do XSD (e estão no código): tipo de verba (`tpRubr`), incidência de INSS (`codIncCP`, 29
códigos, incluindo salário-paternidade a partir de 2027-01) e de FGTS (`codIncFGTS`, 8 códigos).
Dependem do Anexo I (tabelas), que ainda falta obter: **Tabela 01** (categorias), **Tabela 03**
(natureza das verbas), **Tabela 21** (incidência de IRRF), Tabela 04 (FPAS e terceiros), Tabela 18
(motivos de afastamento), Tabela 19 (motivos de desligamento).

## 7. Documentos que faltam

A rede deste ambiente bloqueia o gov.br. Para completar, baixar em
gov.br/esocial → Documentação técnica e enviar:

1. **Leiautes S-1.3 consolidados até a NT 07/2026** — Anexo I (tabelas) e Anexo II (regras de validação).
2. **MOS — Manual de Orientação do eSocial** (versão S-1.3 vigente).
3. **Notas técnicas** posteriores à NT 07/2026, se houver.
4. **Manual do desenvolvedor** (assinatura, lotes, retornos) e o pacote de comunicação de **produção**.
