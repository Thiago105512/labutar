# Clínica de SST do grupo

> Decisão de 2026-09-30. A clínica de medicina e segurança do trabalho **pertence ao grupo da
> empresa de RH, mas tem CNPJ próprio**. Ela presta à empresa de RH os serviços de SST
> (exames, ASO, PCMSO, PGR, laudos). No Labutar ela ganha um módulo próprio: **Clínica de SST**.
>
> **Para os testes**, a CRQ (C R Q Clínica Integrada de Serviços Médicos, CNPJ 42.288.454/0001-50)
> faz os dois papéis: empresa de RH e clínica.

## 1. Empresas do grupo

Uma conta no Labutar é um **grupo**. Dentro dele há uma ou mais **empresas** (CNPJs), cada uma
com seus papéis:

| Papel | O que faz | Consequência no sistema |
|---|---|---|
| `EMPRESA_RH` | Recruta, emprega e aloca colaboradores em tomadores | Empregador no eSocial, folha própria, tomadores como lotação |
| `CLINICA_SST` | Presta medicina e segurança do trabalho | Agenda, ASO, programas e laudos; fatura os serviços para a empresa de RH |

Cada CNPJ tem **folha, eSocial e guias próprios**: os funcionários da clínica (médico,
recepção, técnicos) estão na folha da clínica, não na do RH. O que é do grupo é compartilhado:
cadastro único de pessoas, usuários e perfis, padrões.

## 2. Quem usa o módulo

| Perfil | Nível na Clínica | Vê dados de saúde? |
|---|---|---|
| Médico(a) do trabalho | Gestor | Sim — só ele assina ASO e acessa prontuário |
| Equipe da clínica (recepção, técnico de segurança) | Operador | Não: vê agenda, situação (apto/inapto) e laudos técnicos |
| RH / DP da empresa de RH | Consulta (via módulo SST) | Não: recebe só a conclusão do ASO (apto ou inapto, com as restrições escritas) |
| Administrador geral | Total | Sim |

Diagnóstico e resultado de exame são dado sensível (LGPD, art. 11) e sigilo médico: a empresa de
RH **nunca** recebe o prontuário, só a conclusão do ASO (no eSocial, apto ou inapto; restrições
ficam escritas no próprio ASO). A permissão "dados de saúde"
(`dadosSensiveis`) já existe no controle de acesso.

## 3. O que o módulo faz

| Função | Norma | Liga com |
|---|---|---|
| Agenda de exames: admissional, periódico, retorno ao trabalho, mudança de risco, demissional | NR-7 | Admissão pede o exame; alerta de periódico vencendo |
| ASO assinado pelo médico, com apto/inapto | NR-7 | **Admissão não libera início sem ASO apto**; S-2220 do empregador |
| Exames complementares e toxicológico do motorista | NR-7; CLT, art. 168 | S-2220 e S-2221 |
| PCMSO por empresa e por **posto do tomador** | NR-7 | Os riscos vêm do local de trabalho no tomador |
| PGR e inventário de riscos, incluindo psicossociais | NR-1 | Postos dos tomadores; S-2240 |
| LTCAT, laudos de insalubridade e periculosidade | NR-15, NR-16 | **Adicionais da folha** (grau de insalubridade, periculosidade) |
| PPP | IN do INSS | Desligamento |
| CAT | Lei 8.213/1991, art. 22 | S-2210 |
| Faturamento dos serviços da clínica para a empresa de RH (e, depois, para outros clientes) | — | Financeiro das duas empresas |

O laudo decide o adicional: quando a clínica conclui insalubridade de grau 20% num posto, todo
colaborador alocado nele recebe o adicional na folha a partir da data do laudo — sem digitação.

## 4. Exames ocupacionais (NR-7)

Regras em `packages/clinica/src/exames.js`, com o código do eSocial conferido no XSD do S-2220.

| Código eSocial | Exame | Quando |
|---|---|---|
| 0 | Admissional | Antes de começar a trabalhar |
| 1 | Periódico | Anual para exposto a risco do PGR ou com doença crônica; a cada 2 anos nos demais (ou menos, a critério do médico) |
| 2 | Retorno ao trabalho | Antes de reassumir, após 30 dias ou mais afastado por doença ou acidente (ocupacional ou não) |
| 3 | Mudança de risco ocupacional | Antes da mudança de função, posto ou local que altere a exposição |
| 4 | Monitoração pontual | Casos fora dos demais, a critério do médico |
| 9 | Demissional | Até 10 dias após o fim do contrato; dispensável se o último exame clínico tiver menos de 135 dias (grau de risco 1–2) ou 90 dias (grau 3–4) |

Complementares, conforme o risco do posto no PGR: audiometria para exposição a ruído
(admissão, 6 meses, anual e demissão — NR-7, Anexo II), raio-X de tórax para poeiras, indicadores
biológicos para agentes químicos (Anexo I), entre outros definidos pelo médico no PCMSO.

**Toxicológico** do motorista profissional (CNH C, D ou E): antes da admissão e no desligamento
(CLT, art. 168, § 6º), com evento próprio no eSocial (S-2221).

**Proibidos:** teste de gravidez ou de esterilização (Lei 9.029/1995) e teste de HIV
(Portaria MTE 1.246/2010).

**Temporário e terceirizado:** o exame é da empresa de RH (a empregadora), pelo PCMSO dela, mas os
riscos são os do posto no tomador — por isso o PCMSO é por posto.

## 5. Ordem de construção

1. Empresas do grupo (CNPJs e papéis) e a CRQ como empresa de teste. ✅ iniciado
2. Agenda de exames e ASO com liberação da admissão.
3. Riscos por posto (PGR) e laudos ligando aos adicionais da folha.
4. Eventos S-2220, S-2221, S-2240 e S-2210 gerados para o empregador.
5. Faturamento entre as empresas do grupo.

## 6. Pontos a confirmar

1. A clínica atende só a empresa de RH ou também outras empresas? (Muda o faturamento e o cadastro de clientes.)
2. Quem é o médico responsável pelo PCMSO e qual o CRM? (Vai no ASO e no S-2220.)
3. ~~Regime tributário de cada CNPJ~~ — **respondido: lucro real, todas as empresas do grupo.**
   Na folha: 20% de INSS da empresa + RAT ajustado pelo FAP + terceiros conforme o FPAS de cada
   lotação (a confirmar com o contador: no relatório de 12/2020 os terceiros foram de 2,5%).
4. Na CRQ como empresa de RH: a atividade 78.20-5-00 (trabalho temporário) e o registro no
   Ministério do Trabalho ainda não existem no CNPJ — só para os testes isso não importa.
