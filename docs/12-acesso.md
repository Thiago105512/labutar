# Controle de acesso

> Login, escolha de módulo e permissões por perfil.
> Regras: `packages/acesso` (JS puro, testado). Servidor: `server/src/auth/`,
> `server/src/middleware/contexto.js`, `server/src/rotas-acesso.js`.
> Telas: `web/app/acesso-telas.js`, `web/app/sessao.js`.

## 1. Como a pessoa usa

1. **Entra** com empresa, e-mail e senha.
2. Se a senha é provisória (usuário recém-criado ou senha redefinida), **cria uma senha
   própria** antes de qualquer outra coisa.
3. **Escolhe o módulo.** Os liberados aparecem com o nível dela ("Operador", "Gestor"…);
   os demais aparecem com cadeado — ela sabe que existem e a quem pedir.
4. Dentro do módulo, **vê só as páginas e os botões que o nível permite**. "Trocar" no topo
   do menu volta para a escolha de módulo.

Esconder o botão é conveniência. **Quem decide é o servidor:** toda rota confere a
permissão do módulo, e digitar o endereço de um módulo bloqueado leva de volta à escolha.

## 2. Níveis — um por módulo

| Nível | Pode | Ações |
|---|---|---|
| Sem acesso | Não vê o módulo | — |
| **Consulta** | Ver | `ver` |
| **Operador** | Trabalho do dia a dia | + `criar`, `editar` |
| **Gestor** | Decisões | + `aprovar`, `excluir`, `exportar`, `dadosSensiveis` (saúde) |
| **Administrador do módulo** | Configurar o módulo | + `configurar` |

As ações são as mesmas em todos os módulos: "Gestor" significa a mesma coisa no
recrutamento e na folha. Dados cadastrais (nome, CPF, contato) são visíveis a quem tem
acesso ao módulo; os níveis limitam o que a pessoa **faz**, não o que ela lê. A exceção
prevista é dado de saúde (ASO, laudos), que a LGPD trata como sensível.

## 3. Perfis

Perfil = um nível em cada um dos 14 módulos. Os perfis **padrão** vêm com toda empresa e
não mudam (dá para duplicar e personalizar):

| Perfil | Resumo |
|---|---|
| **Administrador geral** | **Acesso total e irrestrito**: todos os módulos, todas as ações, usuários e perfis. É o único perfil com acesso total — perfil personalizado não pode tê-lo |
| Diretoria | Gestor em todos os módulos de negócio; consulta a administração |
| Gerente de RH e DP | Administra o recrutamento; gestor de colaboradores, admissão, ponto, folha, SST e treinamentos |
| Recrutador(a) | Operador no recrutamento e na admissão; consulta colaboradores e tomadores |
| Analista de DP | Operador em colaboradores, admissão, ponto, folha, SST e treinamentos |
| Supervisor(a) de operações | Operador em tomadores; gestor no ponto (aprova) |
| Comercial | Gestor no comercial; consulta tomadores |
| Financeiro | Gestor no financeiro; operador no contábil; consulta folha e tomadores |
| Contador(a) | Gestor no contábil; consulta financeiro e folha |
| Somente consulta | Consulta em todos os módulos de negócio |

**Ajustes individuais**: além do perfil, um usuário pode ter um nível diferente em algum
módulo (ex.: supervisora que também consulta o recrutamento). O ajuste vale só para ela.

## 4. Regras de segurança

| Regra | Onde |
|---|---|
| Senha com hash **scrypt** (N=2¹⁵, salt por senha); parâmetros no próprio hash para subir o custo depois | `auth/senhas.js` |
| Política de senha: mínimo 10 caracteres, sem senhas óbvias, sem nome/e-mail/empresa | `acesso/senha.js` |
| Senha provisória obriga troca no primeiro acesso | `trocarSenha` |
| E-mail inexistente e senha errada têm a **mesma resposta** e tempo parecido | `servico.entrar` |
| **5 tentativas erradas bloqueiam por 15 minutos** | `REGRAS_SESSAO` |
| Sessão de **12 horas**; o token é guardado no banco **só como hash** | `servico.entrar` |
| Token identifica a empresa: sessão de uma empresa nunca lê outra, mesmo pedindo em cabeçalho | `contexto.js` |
| Desativar usuário, mudar perfil ou ajustes **derruba as sessões** dele na hora | `atualizarUsuario` |
| **Ninguém concede acesso maior que o próprio**; só o Administrador geral concede acesso total ou administração plena | `podeConcederAcesso` |
| A empresa **nunca fica sem Administrador geral ativo** | `verificarAdministradorRestante` |
| Auditoria de logins, falhas, bloqueios, criação e alteração de usuários e perfis | coleção `auditoria` |

### Identidade por cabeçalho (só desenvolvimento)

Os testes antigos e o desenvolvimento local ainda aceitam `X-Labutar-Usuario` e
`X-Labutar-Papel` **sem login**. Esse modo:
- fica **desligado por padrão em produção** (`NODE_ENV=production`);
- pode ser forçado com `LABUTAR_IDENTIDADE_POR_CABECALHO=0|1`;
- passa pela mesma checagem de permissão (o papel vira um perfil padrão);
- nunca é usado quando há token: token inválido é 401, não "cai" para o cabeçalho.

## 5. Primeiro acesso de uma empresa nova

`criarPrimeiroAdministrador(tenant, { nome, email, senha })` cria o Administrador geral e
só funciona se a empresa ainda não tem usuários. A partir daí, tudo é feito pela tela
"Administração do sistema". No servidor de desenvolvimento (`npm run dev`) a empresa
`demo-industrial` já vem com um usuário de cada perfil; a senha é mostrada no terminal e
na tela de login (só em `localhost`).

## 6. Próximos passos

- Recuperação de senha por e-mail (depende de `comunica` com entrega real).
- Autenticação em dois fatores para Administrador geral e Gestor de folha/financeiro.
- Tenant resolvido pelo subdomínio (`empresa.labutar.com.br`), dispensando o campo "Empresa".
- Sessões ativas visíveis ao usuário, com "sair de todos os dispositivos".

## 7. Acessos externos: candidato, colaborador e cliente

Além da equipe, três públicos entram no Labutar — cada um por um **portal próprio**
(`/web/portal/`) e vendo **só o que é dele**. São tipos de conta diferentes: a mesma
pessoa pode ter uma conta de cada tipo com o mesmo e-mail (ex.: colaborador que também é
candidato a outra vaga), e o login pede o tipo.

| Conta | Como é criada | Escopo (filtro de tudo que ela vê) | O que acessa |
|---|---|---|---|
| **Candidato** | Ele mesmo, no portal, com aceite do termo LGPD | `candidatoId` | Vagas abertas, candidatar-se, acompanhar as próprias candidaturas (etapa, sem score), desistir, editar o currículo |
| **Colaborador** | A empresa libera (quem tem cadastro em **Colaboradores**) | `pessoaId` do cadastro único | Holerites, ponto, férias, documentos, informe de rendimentos, treinamentos — os serviços acendem conforme os módulos entram em produção |
| **Cliente (tomador)** | A empresa libera (quem tem cadastro em **Tomadores e postos**) | `tomadorId` (+ contratos) e **papel** | Consulta: alocados, presença, documentos · Gestor do contrato: + aprovar ponto e medição, pedir postos · Financeiro: medições e faturas |

Regras:

- **Conta externa nunca entra nas rotas da equipe** (`exigirPermissao` recusa), e a equipe
  não usa as rotas dos portais (`exigirConta`).
- Nos portais, **o dono do dado vem sempre do escopo gravado na conta**, nunca da URL.
  Recurso de outra pessoa responde 404 — nem a existência é confirmada.
- **Autocadastro não herda histórico pelo e-mail.** Se já existe currículo com aquele e-mail
  (candidatura feita sem conta), ligar exige o **código de acompanhamento** recebido na
  candidatura. Sem isso, qualquer um que soubesse o e-mail de outra pessoa leria as
  candidaturas dela.
- O candidato altera o próprio currículo, mas não o e-mail (que é o login).
- Contas de colaborador e cliente nascem com **senha provisória** (troca no primeiro acesso).
  Desativar ou mudar o papel **derruba a sessão** na hora.
- A equipe gerencia tudo em **Administração → Acessos externos**, que também mostra o link do
  portal para enviar. Cada aba exige a permissão do módulo correspondente
  (Colaboradores, Tomadores e postos, Recrutamento).
