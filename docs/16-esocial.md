# eSocial no Labutar — o que entra no sistema

> Levantamento de 2026-09-30 feito sobre os **esquemas oficiais S-1.3** versionados em
> `packages/esocial/xsd/` e pesquisa do que está em vigor (seção 8). A versão vigente é a
> **S-1.3 consolidada até a NT 07/2026, revisada em 24/09/2026**. A página do gov.br não abre
> neste ambiente (rede bloqueada); os documentos que faltam estão na seção 7.

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

1. **Leiautes S-1.3 consolidados até a NT 07/2026 rev. 24/09/2026** — leiautes, Anexo I (tabelas) e Anexo II (regras de validação).
   Também o **pacote XSD vigente hoje** (antes de 23/11/2026) e a própria NT 07/2026 revisada.
2. **MOS — Manual de Orientação do eSocial** (versão S-1.3 vigente).
3. **Notas técnicas** posteriores à NT 07/2026, se houver.
4. **Manual do desenvolvedor** (assinatura, lotes, retornos) e o pacote de comunicação de **produção**.

## 8. Em vigor e a caminho (pesquisa de 2026-09-30)

### 8.1 Cronograma da NT S-1.3 nº 07/2026 (revisada em 24/09/2026)

| Data em produção | O que muda | Efeito no Labutar |
|---|---|---|
| 29/09/2026 | S-2410 e S-2416 (benefícios de entes públicos); S-5002 e Tabelas 01 (código 313) e 29 | Fora do foco (entes públicos) |
| 26/10/2026 | Ajustes em eventos de vínculo e desligamento | Conferir no Anexo II quando obtido |
| **23/11/2026** | **CPF dos dependentes validado na base da Receita** (S-1210, S-2501 e cadastro); esquemas do pacote de 23/11 | Dependente com CPF inválido trava o envio: validar CPF do dependente no cadastro |
| **14/12/2026** | Esquemas do pacote de 14/12: **salário-paternidade** (incidências 23, 24, 27, 28); S-2200 sem `infoCota`; S-2205 muda `infoDeficiencia` | Validar pelo esquema da data do envio (`esquemaVigente`) |
| 18/01/2027 | Última etapa da NT | A acompanhar |

Na revisão de 24/09: S-2230 deixa de aceitar "I – Indeterminado (não consta CID)" em
`infoMesmoMtv`; Tabela 18 (motivos de afastamento) ganha os códigos 52 e 53 — o 53 é o
afastamento da gestante ou lactante de atividade insalubre sem local salubre, que liga a
**Clínica de SST** (laudo de insalubridade) ao afastamento no eSocial.

### 8.2 Leis e programas que mexem na folha

| Assunto | Vigência | O que o Labutar precisa |
|---|---|---|
| **CNPJ alfanumérico** | eSocial aceita desde 01/08/2026 | ✅ validação, formatação e raiz nos dois formatos |
| **IRRF — Lei 15.270/2025** (redução até R$ 7.350) | 01/2026 | ✅ no motor |
| **Crédito do Trabalhador (eConsignado)** | em vigor | ✅ verba 9253.01 (codIncFGTS 31); ⬜ importar o arquivo mensal do Portal Emprega Brasil; descontar também na rescisão (S-2299) |
| **FGTS Digital** | em vigor | Vencimento dia 20; pagamento só por Pix; guia da rescisão em até 10 dias após o S-2299; processos trabalhistas pelo FGTS Digital desde 05/2026 |
| **Salário-paternidade — Lei 15.371/2026** | **01/01/2027**: 10 dias; 2028: 15; 2029: 20 | Afastamento, verba de salário-paternidade pago pelo INSS com compensação na DCTFWeb, **estabilidade até 30 dias após o retorno** (bloquear desligamento) |
| **Reoneração gradual — Lei 14.973/2024** | 2026: 10% sobre a folha + 60% da CPRB; 2027: 15% + 40%; 2028: 20% | Só para empresas dos setores da desoneração: confirmar com o contador se alguma do grupo está na CPRB (senão, 20% cheio) |
| **NR-1 — riscos psicossociais no PGR** | Fiscalização desde 26/05/2026; multas suspensas pelo STF em 08/2026, obrigação mantida | PGR da Clínica de SST com riscos psicossociais |

### 8.3 Fontes

- [Contábeis — revisão da NT S-1.3 nº 07/2026 e cronograma](https://www.contabeis.com.br/noticias/79659/esocial-publica-revisao-da-nt-s-1-3-no-07-2026-veja-o-cronograma/)
- [Contábeis — NT S-1.3 nº 07/2026](https://www.contabeis.com.br/noticias/79276/esocial-nota-tecnica-s-1-3-no-07-2026-atualiza-leiautes/)
- [TecnoSpeed — NT S-1.3 07/2026](https://blog.tecnospeed.com.br/esocial-nota-tecnica-s-1-3-07-2026/)
- [e-Contab — alterações até janeiro de 2027](https://blog.e-contab.com.br/index.php/2026/09/10/nota-tecnica-no-07-2026-do-esocial-alteracoes-serao-implantadas-ate-janeiro-de-2027/)
- [eSocial — parada para o CNPJ alfanumérico](https://www.gov.br/esocial/pt-br/noticias/parada-do-esocial-em-31-07-2026-19h-manutencao-programada-para-implantacao-do-cnpj-alfanumerico)
- [Senior — Crédito do Trabalhador](https://documentacao.senior.com.br/exigenciaslegais/destaques/credito-do-trabalhador/)
- [Agência Brasil — licença-paternidade a partir de 2027](https://agenciabrasil.ebc.com.br/direitos-humanos/noticia/2026-04/novos-prazos-para-licenca-paternidade-valem-partir-de-2027-entenda)
- [Contábeis — reoneração da folha em 2026](https://www.contabeis.com.br/noticias/74532/desoneracao-da-folha-em-2026-o-que-muda-com-a-reoneracao-gradual/)
- [Sinat — NR-1 em fiscalização](https://www.sinat.com.br/nr-1-entra-em-fase-de-fiscalizacao-e-pressiona-empresas-a-partir-de-26-de-maio/)
- [LegisWeb — FGTS de processos trabalhistas pelo FGTS Digital](https://www.legisweb.com.br/noticia/?id=33103)
