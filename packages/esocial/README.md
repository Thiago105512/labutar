# @labutar/esocial — ⏸ ADIADO (interface reservada)

**Estado: não implementado.** Decisão de 2026-09-27: eSocial fica para depois, mas com o
contrato já definido para que a Fase 4 comece sem retrabalho.

Este pacote é o **único** do monorepo com dependências nativas de Node
(`node-forge`, `xml-crypto`, `soap`, `pem`). Nunca é importado pelo front-end.

## Contrato reservado

```js
import {
  EVENTOS,                  // { S2200, S2220, S2240 }
  PendenciaError,           // lançado por toda função ainda não implementada
  criarTransmissor,         // ({ certificado, ambiente }) => Transmissor
  gerarS2200,               // (admissao) => xml
  gerarS2220,               // (aso) => xml
  gerarS2240,               // (condicoesAmbientais) => xml
  validarContraXSD,         // (xml, evento) => { valido, erros }
  transmitir,               // (transmissor, eventos) => { protocolo }
  consultarLote,            // (transmissor, protocolo) => retorno
} from "@labutar/esocial";
```

Toda função acima lança `PendenciaError` hoje. Isso é deliberado: um stub que devolve
`null` ou `{ ok: true }` permitiria que uma admissão fosse marcada como transmitida sem
ter sido. Enviar evento mal formado ao eSocial gera multa, então o padrão aqui é falhar alto.

## Fluxo que a Fase 4 vai implementar

```
Admissao (docs/02-modelo-de-dados.md)
   ├─ dadosContrato + checklist completo + ASO apto
   ├─ gerarS2200(admissao)          → xml
   ├─ gerarS2220(admissao.aso)      → xml
   ├─ validarContraXSD(xml, evento) → bloqueia se inválido
   ├─ assinar(xml, certificado)     → xml assinado (ICP-Brasil, RSA-SHA256)
   ├─ transmitir(...)               → protocolo
   └─ consultarLote(protocolo)      → PROCESSADO | REJEITADO
        └─ EventoESocial persistido com xmlAssinado, hash, retorno e erros
```

Retificação: `indRetif=2` + `nrRecibo` do evento original.

## Antes de escrever qualquer linha

1. Ler `docs/05-compliance.md` — inventaria 14 defeitos do código herdado,
   3 deles confirmados contra o fonte instalado de `xml-crypto` e `node-forge`.
2. Baixar os XSDs do leiaute vigente em `packages/esocial/xsd/` e versioná-los.
   O leiaute muda; código validado contra o XSD de hoje quebra no próximo.
3. Resolver os pré-requisitos externos (certificado A1, habilitação em produção
   restrita, qualificação cadastral) — listados no fim do `05-compliance.md`.
4. Decidir **quem assina** o ASO: e-CNPJ do empregador ou e-CPF do médico do
   trabalho. Tem consequência jurídica direta e não é reversível depois de enviado.

## Dependências

Já instaladas em `C:\Users\FENIX JURIDICO\node_modules`: `node-forge@1.4.0`,
`xml-crypto@6.3.2`, `soap@1.13.1`, `pem@1.14.8`, `xmlbuilder@15.1.1`.

Falta: um validador XSD real (`libxmljs2` ou equivalente).
