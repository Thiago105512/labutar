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
| RH / DP da empresa de RH | Consulta (via módulo SST) | Não: recebe só apto, inapto ou apto com restrição |
| Administrador geral | Total | Sim |

Diagnóstico e resultado de exame são dado sensível (LGPD, art. 11) e sigilo médico: a empresa de
RH **nunca** recebe o prontuário, só a conclusão do ASO. A permissão "dados de saúde"
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

## 4. Ordem de construção

1. Empresas do grupo (CNPJs e papéis) e a CRQ como empresa de teste. ✅ iniciado
2. Agenda de exames e ASO com liberação da admissão.
3. Riscos por posto (PGR) e laudos ligando aos adicionais da folha.
4. Eventos S-2220, S-2221, S-2240 e S-2210 gerados para o empregador.
5. Faturamento entre as empresas do grupo.

## 5. Pontos a confirmar

1. A clínica atende só a empresa de RH ou também outras empresas? (Muda o faturamento e o cadastro de clientes.)
2. Quem é o médico responsável pelo PCMSO e qual o CRM? (Vai no ASO e no S-2220.)
3. Regime tributário de cada CNPJ (define os encargos da folha de cada um).
4. Na CRQ como empresa de RH: a atividade 78.20-5-00 (trabalho temporário) e o registro no
   Ministério do Trabalho ainda não existem no CNPJ — só para os testes isso não importa.
