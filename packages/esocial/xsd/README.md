# Esquemas oficiais do eSocial

Arquivos publicados pelo eSocial, guardados **sem alteração** para validar os eventos gerados
pelo Labutar antes de qualquer envio (docs/13, seção 3). Não edite estes arquivos: versão nova
entra numa pasta nova, e o teste `packages/esocial/test/xsd.test.js` passa a apontar para ela.

| Pasta | Conteúdo | Pacote de origem |
|---|---|---|
| `v_S_01_03_00/` | Leiaute S-1.3: 50 eventos + `tipos.xsd` + assinatura | `2026-12-14_esquemas_xsd_v_s_01_03_00-1.zip` (MD5 `515a096731a71b36675c4400d2d21da6`) |
| `comunicacao-v1.6-alfa/` | WSDL e XSD de envio e consulta de lotes | `pacote-de-comunicacao-esocial-v1-6-alfa.zip` (MD5 `1039edfda330e08f102b642385794a85`) |

O pacote de 2026-12-14 substitui o de 2026-11-23: muda `evtTabRubrica`, `evtBasesTrab`,
`evtCS`, `evtContProc` e `evtInfoEmpregador` (salário-paternidade, códigos de incidência
23, 24, 27 e 28, a partir de 2027-01).

O pacote de comunicação é **alfa** (versão para CNPJ alfanumérico); o de produção precisa ser
conferido antes do primeiro envio real.
