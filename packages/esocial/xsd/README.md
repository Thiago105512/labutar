# Esquemas oficiais do eSocial

Arquivos publicados pelo eSocial, guardados **sem alteração** para validar os eventos gerados
pelo Labutar antes de qualquer envio (docs/13, seção 3). Não edite estes arquivos: versão nova
entra numa pasta nova e numa linha nova de `ESQUEMAS_ESOCIAL`.

Falta o pacote vigente **antes de 23/11/2026** (produção de hoje): baixar em gov.br/esocial.

| Pasta | Conteúdo | Pacote de origem |
|---|---|---|
| `S-1.3-2026-11-23/` | Leiaute S-1.3, vigente a partir de 23/11/2026 (NT 07/2026) | `2026-11-23_esquemas_xsd_v_s_01_03_00-1.zip` (MD5 `76177bd79d437243317884b810b7eb4f`) |
| `S-1.3-2026-12-14/` | Leiaute S-1.3, vigente a partir de 14/12/2026 (NT 07/2026) | `2026-12-14_esquemas_xsd_v_s_01_03_00-1.zip` (MD5 `515a096731a71b36675c4400d2d21da6`) |
| `comunicacao-v1.6-alfa/` | WSDL e XSD de envio e consulta de lotes | `pacote-de-comunicacao-esocial-v1-6-alfa.zip` (MD5 `1039edfda330e08f102b642385794a85`) |

Os dois pacotes são etapas da NT S-1.3 nº 07/2026 (rev. 24/09/2026): cada evento é validado pelo
esquema **vigente na data do envio** (`esquemaVigente` em `src/esquemas.js`). O de 14/12 muda `evtTabRubrica`, `evtBasesTrab`,
`evtCS`, `evtContProc` e `evtInfoEmpregador` (salário-paternidade, códigos de incidência
23, 24, 27 e 28, a partir de 2027-01).

O pacote de comunicação é **alfa** (versão para CNPJ alfanumérico); o de produção precisa ser
conferido antes do primeiro envio real.
