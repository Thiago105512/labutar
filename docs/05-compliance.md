# Compliance — código herdado e requisitos do eSocial

Inventário do que existe em `C:\Users\FENIX JURIDICO\{aso,esocial,certificado-digital,agendamento}.js`
e do que precisa ser resolvido antes de qualquer envio real.

> **Nenhum destes trechos foi corrigido.** O eSocial está adiado por decisão de 2026-09-27.
> Este documento existe para que a Fase 4 comece sabendo o que está quebrado.

## Defeitos confirmados contra o fonte instalado

Versões verificadas em `node_modules` em 2026-09-27: `xml-crypto@6.3.2`, `node-forge@1.4.0`,
`soap@1.13.1`.

### 1. `certificado-digital.js` → `assinarXML()` não assina

```js
signedXml.signingKey = crypto.createPrivateKey({ ... });
```

`xml-crypto@6.3.2` **não tem** a propriedade `signingKey`. Em `lib/signed-xml.js` a chave vem
de `options.privateKey` (linha 113/120) e a linha 335 lança erro quando `this.privateKey == null`.
O assignment é silenciosamente ignorado e `computeSignature()` falha.

Correção: `new SignedXml({ privateKey, publicCert, signatureAlgorithm, canonicalizationAlgorithm })`.

### 2. `certificado-digital.js` → `assinarDocumento()` usa a API errada do forge

```js
const hash = crypto.createHash("sha256").update(documentoBuffer).digest();
const assinatura = this.privateKey.sign(hash, "sha256");
```

`node-forge@1.4.0`, `lib/rsa.js:1321`: `key.sign = function(md, scheme)`.
- `md` precisa ser um **objeto message-digest** do forge (`forge.md.sha256.create().update(...)`),
  não um `Buffer` cru vindo do `node:crypto`.
- O segundo parâmetro é o **scheme** (`'RSASSA-PKCS1-V1_5'`, `'NONE'` ou um objeto PSS),
  não o nome do hash. `"sha256"` não corresponde a nenhum ramo do `if`.

### 3. Sobrescrita de `getKeyInfoContent` é desnecessária

```js
signedXml.getKeyInfoContent = () => `<X509Data>...`;
```

Continua funcionando como propriedade de instância, mas o xml-crypto 6 já monta o `KeyInfo`
a partir da opção `publicCert` (`SignedXml.getKeyInfoContent({ publicCert, prefix })` é estático).
O override manual deve ser removido, não mantido.

## Defeitos de leiaute no `esocial.js` — **não verificados contra XSD**

Os itens abaixo vêm de comparação com o leiaute S-1.0 de memória. **Precisam ser confirmados
baixando o XSD oficial** de `portal.esocial.gov.br` antes de qualquer correção.

4. `ideEvento` sem `indRetif` (obrigatório) nem `nrRecibo` (obrigatório quando `indRetif=2`).
5. `infoMonit` coloca `codCons`/`nmCons`/`nrCons`/`ufCons` no próprio elemento; o leiaute
   aninha esses campos em `medico`.
6. `<exames><exame>` — o leiaute usa `<ordExame>` com campos adicionais
   (`ordCol`, `dtCol`, `interpret`, `refExm`).
7. `Id="${Date.now()}${Math.random()...}"` — não é o formato oficial de 36 caracteres.
   ✅ **Já resolvido**: `idEventoESocial()` em `@labutar/core`, com teste.
8. `tpAmb` fixo em `2` mesmo quando `ambiente === "producao"` — evento de produção seria
   enviado marcado como produção restrita.
9. `enviarLoteEventosAsync` / `consultarProtocoloAsync` — nomes e shape de payload inventados.
   Os serviços reais são `RecepcaoLoteEventos` e `ConsultarLoteEventos`, e o envelope leva o
   XML do lote assinado como string. Precisa do WSDL real.
10. `validarXML()` usa `string.includes()`. Isso não é validação. Requer validador XSD de
    verdade (`libxmljs2`, `xmllint` ou o validador Java do próprio governo).

## Defeitos menores

11. `aso.js:gerarQRCode()` e `agendamento.js:_gerarLink()` apontam para `https://seuapp.com/...`.
    Domínio placeholder — trocar pela URL real do tenant.
12. `aso.js:gerarPDF()` não gera PDF: devolve um objeto com um bloco de texto.
13. `agendamento.js` tem `this.agendamentos = []` no construtor, mas todos os métodos são
    `static`. Estado morto.
14. Zero testes em qualquer dos quatro arquivos.

## O que está correto e vale reaproveitar

- `Agendamento.criar/confirmar/cancelar/registrarFalta/iniciar/concluir` — máquina de estados
  sólida. Vai direto para `packages/ats` como base do agendamento de entrevistas.
- `Agendamento.alertasPeriodicos` e `ASO.alertasVencimento` — mesma lógica; consolidar em
  `estaVencendo()` do core (já reimplementado e testado).
- `ASO.prepararESocial` — a ideia de separar o objeto de domínio do payload do eSocial está certa.
- `CertificadoDigital.carregar()` — extração de chave e certificado do PFX via forge está correta.

## Pré-requisitos externos (não são código)

- [ ] Certificado digital A1 (e-CNPJ) válido, com procuração eletrônica se for terceiro
- [ ] Habilitação no **ambiente de produção restrita** do eSocial
- [ ] XSDs do leiaute vigente baixados e versionados em `packages/esocial/xsd/`
- [ ] CAEPF/CEI quando aplicável; qualificação cadastral do empregador já feita
- [ ] Decisão sobre quem assina: o empregador (e-CNPJ) ou o médico do trabalho (e-CPF)
      para o ASO — tem consequência jurídica direta
