# @labutar/esocial

**Estado: gera, assina e valida; não transmite.**

| Faz | Como |
|---|---|
| Gera S-1200 (remuneração), S-2299 (desligamento) e S-2220 (ASO) | `src/eventos.js`, a partir da folha fechada, da rescisão salva e do ASO da clínica |
| Assina (XMLDSig enveloped, RSA-SHA256, C14N 1.0, Id do evento) | `src/assinatura.js`, só com `node:crypto` — o XML já sai em forma canônica (`src/xml.js`) |
| Confere a assinatura | `verificarAssinatura`; conferida também com uma implementação independente (signxml/lxml) |
| Valida pelo XSD oficial | `xmllint` contra `xsd/` (testes e servidor); sem xmllint o teste é pulado e o servidor avisa |

Sem dependência externa: o pacote não usa mais `xml-crypto`, `node-forge` nem `soap` (os
defeitos do código herdado em `docs/05-compliance.md` ficam só como histórico).

## Certificado

O A1 da empresa (.pfx) é convertido uma vez para PEM:

```sh
openssl pkcs12 -in empresa.pfx -nodes -out empresa.pem
```

e passado ao servidor em `LABUTAR_ESOCIAL_CHAVE_PEM` (chave) e `LABUTAR_ESOCIAL_CERT_PEM`
(certificado). Sem ele, o servidor usa uma chave de teste: o XML confere, mas não tem valor
jurídico e o eSocial recusa.

## Ainda pendente (lança `PendenciaError`)

- `criarTransmissor`, `transmitir`, `consultarLote`: certificado A1, habilitação em produção
  restrita e o WSDL de produção (o pacote de comunicação guardado é **alfa**).
- `gerarS2200`: completar no cadastro o que o leiaute pede (endereço, nascimento, CBO, horário
  contratual) — a admissão digital já coleta parte.
- `gerarS2240`: depende do PGR por posto.
- S-1010 (tabela de rubricas): falta a Tabela 21 (incidência de IRRF) conferida.
- **Decisão pendente**: quem assina o S-2220 — e-CNPJ do empregador ou e-CPF do médico.

Retificação (`indRetif=2` + `nrRecibo`) entra junto com a transmissão, quando houver recibo.
