# @labutar/ia

Camada de IA do Labutar. **A função principal deste pacote não é chamar modelo —
é garantir que dado pessoal não chegue a ele.**

O endpoint do Bailian fica em Singapura (`token-plan.ap-southeast-1.maas.aliyuncs.com`).
Mandar currículo para lá é transferência internacional de dado pessoal (LGPD art. 33).
Currículo tem CPF, nome, endereço, telefone — e neste produto pode ter ASO, que é dado
sensível (art. 5º, II).

JS puro, zero dependência, roda no Node e no navegador. **Não faz HTTP**: o transporte
mora em `server/`.

## A porta de saída

```js
import { desidentificarCandidato, assertPayloadLimpo } from "@labutar/ia";

const { texto, substituicoes } = desidentificarCandidato(candidato);
assertPayloadLimpo({ vaga: vagaTexto, candidato: texto });   // lança se houver identificador
// só então o transporte envia
```

`assertPayloadLimpo` **lança** em vez de devolver `false`. Um booleano pode ser ignorado
por descuido; o custo de ignorar aqui é CPF de candidato saindo do país.

`substituicoes` é o mapa pseudônimo → valor real. Fica no servidor e **nunca** vai no payload.

## O que sai e o que fica

| Sai | Fica |
|---|---|
| cargos, competências e níveis | nome, nome social |
| durações e datas de emprego | CPF, e-mail, telefone, CEP |
| nome de curso e situação | **cidade e UF** |
| empresa → `EMPRESA_1` | data de nascimento, gênero |
| instituição → `INSTITUICAO_1` | fotos, links de perfil |
| pretensão salarial | qualquer URL de rede social |

Empresa e instituição viram **pseudônimo estável** em vez de sumir: sem elas o modelo não
julga continuidade de emprego nem progressão de cargo, que é o que mais indica aderência.

Cidade sai mesmo parecendo inofensiva. Em mercado pequeno, **Manaus + empresa + cargo**
reidentifica sem precisar de nome.

## Limitações — leia antes de confiar

**Detecção de nome próprio é heurística e tem falso negativo.** Casa palavra capitalizada
contra uma lista de ~180 prenomes brasileiros comuns. `João` pega; `Batista` e `Silva`
sozinhos, não. Por isso existe a segunda camada: literais conhecidos (nome completo,
empregadores, instituições, contatos) são removidos por substituição direta. As duas
camadas juntas cobrem o caso prático, mas **não são prova**.

Consequência de projeto: a lista de literais vem do próprio candidato. Se ele escrever um
nome que o sistema não conhece — o de um sócio, o de um gestor citado na descrição — nada
pega. Não há detector determinístico de nome em texto livre sem modelo de linguagem, e usar
um modelo para decidir o que pode ir a outro modelo é circular.

Ordem importa: literais são substituídos **antes** dos padrões. Ao contrário, o detector
trocaria `João` por `[removido]` e o literal `João Batista Silva` deixaria de casar —
sobraria `Batista Silva` no payload.

Exigir inicial maiúscula para nome próprio é deliberado: sem isso, "rosa" (cor) e "vera"
(advérbio) virariam violação e a porta ficaria inutilizável. Para uma trava de segurança,
falso positivo é barato e falso negativo é caro — mas falso positivo em massa também
impede o uso.

## Matching: o score é recalculado, nunca confiado

`interpretarMatching(texto, { criterios, textoCandidato })`:

1. O prompt proíbe o modelo de calcular score global. Ele devolve **nota 0–5 por critério**.
2. O score é **recalculado aqui** a partir das notas e dos pesos da rubrica. Se o modelo
   mandar um número, ele vai para `scoreInformadoPeloModelo` e é comparado — nunca adotado.
   Um número que não se reconstrói a partir das partes não é auditável, e decisão de
   contratação precisa ser.
3. Cada `evidencia` é **conferida contra o texto do candidato** (comparação normalizada).
   Não estando lá, o componente é marcado `naoVerificado` e `ok` vira `false`.
4. Critério sem resposta, nota inválida ou componente fora da rubrica → `ok: false`.
5. Falha de parsing → `ok: false` e `score: null`. **Nunca um número padrão**: um score
   inventado pode reprovar uma pessoa real.

`extrairJson` nunca lança. Aceita objeto nu, cerca de código, prosa em volta e vírgula
final; recusa truncado, array e não-objeto com motivo legível.

## Parecer: IA apoia, não decide

`interpretarParecer` **recusa** resposta que contenha `reprovado`, `eliminar`, `descartar`,
`desqualificado`, `rejeitar`, `inapto`, `não contratar` ou equivalente. Parecer que conclui
por eliminação não é parecer: é decisão automatizada, sujeita a revisão pelo art. 20 da LGPD
e a registro pelo art. 37 — e reprovar alguém por texto gerado sem responsabilidade
identificada é passivo trabalhista direto.

Toda saída carrega o aviso de que a decisão é humana.

## Rubrica comparável à triagem determinística

`criarRubrica(vaga)` deriva critérios de `competencias`, `formacaoMinima`, `idiomas` e
`regrasTriagem.experienciaAnosMinimos`, com pesos alinhados a `REGRAS_TRIAGEM_PADRAO.pesos`.

**Localização fica de fora de propósito** — é removida na desidentificação, então o modelo
não tem como julgá-la. Isso quer dizer que comparar `scoreIA` com `triagem.score.total`
gera **divergência fantasma** em toda vaga presencial com candidato de outra cidade.

`scoreDeterministicoComparavel(triagem)` recalcula o score determinístico na mesma base
(sem localização, renormalizado). É com ele que `compararComTriagem` compara.

`compararComTriagem` liga `exigirRevisaoHumana` quando: a divergência passa do limite
(padrão 20 pontos), há evidência não verificada, a interpretação falhou, ou o score global
do modelo diverge do recalculado. Essa divergência é o sinal mais útil do sistema — ou a
rubrica está mal calibrada, ou o modelo alucinou. Nos dois casos resolve uma pessoa.

## Ausência de embedding

O Token Plan disponível não tem capability de embedding. Matching por vetor não é opção;
a rubrica por `text.chat` é mais cara por chamada, mas é **auditável**, o que para decisão
de contratação é vantagem.

## Transporte (não está aqui)

`server/` é quem chama o Bailian. Deve:

1. `desidentificarCandidato` / `desidentificarVaga`
2. `assertPayloadLimpo(payload)` — **obrigatório antes de qualquer requisição**
3. anexar `regrasDeSaida()` ao system prompt
4. `interpretarMatching` / `interpretarParecer` na resposta
5. ler o perfil `token-plan` de `~/.bailian/config.json`, **nunca** a variável de ambiente
   `DASHSCOPE_API_KEY` — nesta máquina ela está expirada e quebra o auth
