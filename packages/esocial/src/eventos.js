/**
 * Eventos do eSocial gerados a partir do que o Labutar já calcula, no leiaute S-1.3 (conferidos
 * contra os XSD em ../xsd por `xmllint` nos testes):
 * - S-1200 (evtRemun): remuneração da competência fechada, por trabalhador;
 * - S-2299 (evtDeslig): desligamento, a partir da rescisão salva;
 * - S-2220 (evtMonit): ASO emitido pela clínica.
 * Valores em centavos na entrada; no XML, decimais com ponto.
 */
import { idEventoESocial } from "../../core/src/ids.js";
import { el, valorESocial } from "./xml.js";

export const VERSAO_PROCESSO = "Labutar-1.0";
export const TABELA_RUBRICAS = "LABUTAR";
const ns = (evento) => `http://www.esocial.gov.br/schema/evt/${evento}/v_S_01_03_00`;

/** Categoria do trabalhador (Tabela 01): empregado geral 101; temporário (Lei 6.019/1974) 106. */
export const CATEGORIA = Object.freeze({ PROPRIO: "101", TERCEIRIZADO: "101", TEMPORARIO: "106" });

const so = (v) => String(v ?? "").replace(/\D/g, "");

/** Empregador: CNPJ pela raiz (8 posições), como no S-1000 de quem não é órgão público. */
function ideEmpregador(empresa) {
  return el("ideEmpregador", {}, el("tpInsc", {}, "1"), el("nrInsc", {}, so(empresa.cnpj).slice(0, 8)));
}

function id(empresa, { sequencial = 1, quando = new Date() } = {}) {
  return idEventoESocial({ tpInsc: "1", nrInsc: so(empresa.cnpj).slice(0, 8), sequencial, quando });
}

const ambiente = (tpAmb) => (tpAmb === "1" ? "1" : "2"); // 2 = produção restrita (testes)

/**
 * S-1200 de um holerite da competência fechada.
 * @param dados { empresa: { cnpj }, competencia, holerite, codLotacao, codCateg?, tpAmb?, sequencial?, quando? }
 */
export function gerarS1200({ empresa, competencia, holerite: h, codLotacao, codCateg, tpAmb = "2", sequencial, quando }) {
  if (!h.colaborador.cpf) throw new Error(`${h.colaborador.nome}: sem CPF, o S-1200 não pode ser gerado`);
  const categoria = codCateg ?? CATEGORIA[h.colaborador.vinculo] ?? "101";
  const itens = h.itens.filter((i) => i.valor > 0 && i.tipo !== "INFORMATIVA");
  const rubricas = itens.map((i) => el("itensRemun", {},
    el("codRubr", {}, i.codigo), el("ideTabRubr", {}, TABELA_RUBRICAS), el("vrRubr", {}, valorESocial(i.valor))));
  const estabelecimento = el("ideEstabLot", {},
    el("tpInsc", {}, "1"), el("nrInsc", {}, so(empresa.cnpj)), el("codLotacao", {}, codLotacao),
    el("remunPerApur", {}, el("matricula", {}, so(h.colaborador.matricula)), rubricas));
  const evento = el("evtRemun", { Id: id(empresa, { sequencial, quando }) },
    el("ideEvento", {},
      el("indRetif", {}, "1"), el("indApuracao", {}, "1"), el("perApur", {}, competencia),
      el("tpAmb", {}, ambiente(tpAmb)), el("procEmi", {}, "1"), el("verProc", {}, VERSAO_PROCESSO)),
    ideEmpregador(empresa),
    el("ideTrabalhador", {}, el("cpfTrab", {}, so(h.colaborador.cpf))),
    el("dmDev", {},
      el("ideDmDev", {}, `FOL${competencia.replace("-", "")}${so(h.colaborador.matricula)}`.slice(0, 30)),
      el("codCateg", {}, categoria),
      el("infoPerApur", {}, estabelecimento)));
  return { namespace: ns("evtRemun"), evento, tipo: "S-1200" };
}

/**
 * S-2299 a partir da rescisão salva.
 * @param dados { empresa, rescisao: registro (resultado de calcularRescisao), cpf, codLotacao, tpAmb?, sequencial?, quando? }
 */
export function gerarS2299({ empresa, rescisao, cpf, codLotacao, tpAmb = "2", sequencial, quando }) {
  const r = rescisao.resultado;
  if (!cpf) throw new Error("sem CPF, o S-2299 não pode ser gerado");
  const itens = r.itens.filter((i) => i.valor > 0);
  const verbas = itens.map((i) => el("detVerbas", {},
    el("codRubr", {}, i.codigo), el("ideTabRubr", {}, TABELA_RUBRICAS), el("vrRubr", {}, valorESocial(i.valor))));
  const estabelecimento = el("ideEstabLot", {}, el("tpInsc", {}, "1"), el("nrInsc", {}, so(empresa.cnpj)), el("codLotacao", {}, codLotacao), verbas);
  const evento = el("evtDeslig", { Id: id(empresa, { sequencial, quando }) },
    el("ideEvento", {}, el("indRetif", {}, "1"), el("tpAmb", {}, ambiente(tpAmb)), el("procEmi", {}, "1"), el("verProc", {}, VERSAO_PROCESSO)),
    ideEmpregador(empresa),
    el("ideVinculo", {}, el("cpfTrab", {}, so(cpf)), el("matricula", {}, so(rescisao.matricula))),
    el("infoDeslig", {},
      el("mtvDeslig", {}, r.esocial.mtvDeslig),
      el("dtDeslig", {}, r.esocial.dtDeslig),
      // Aviso prévio indenizado: S/N e, se S, a data projetada do fim do contrato.
      el("indPagtoAPI", {}, r.aviso.indenizado ? "S" : "N"),
      r.aviso.indenizado && r.esocial.dtProjFimAPI ? el("dtProjFimAPI", {}, r.esocial.dtProjFimAPI) : null,
      el("pensAlim", {}, "0"),
      el("verbasResc", {},
        el("dmDev", {},
          el("ideDmDev", {}, `RES${so(rescisao.matricula)}${so(r.esocial.dtDeslig)}`.slice(0, 30)),
          el("infoPerApur", {}, estabelecimento)))));
  return { namespace: ns("evtDeslig"), evento, tipo: "S-2299" };
}

/**
 * S-2220 do ASO.
 * @param dados { empresa, exame: { tipo, codigoESocial, asoEm, resultado, medico: { nome, crm } }, cpf, matricula, tpAmb?, sequencial?, quando? }
 */
export function gerarS2220({ empresa, exame, cpf, matricula, tpAmb = "2", sequencial, quando }) {
  if (!cpf) throw new Error("sem CPF, o S-2220 não pode ser gerado");
  const [nrCRM, ufCRM] = String(exame.medico.crm).toUpperCase().split("/");
  const evento = el("evtMonit", { Id: id(empresa, { sequencial, quando }) },
    el("ideEvento", {}, el("indRetif", {}, "1"), el("tpAmb", {}, ambiente(tpAmb)), el("procEmi", {}, "1"), el("verProc", {}, VERSAO_PROCESSO)),
    ideEmpregador(empresa),
    el("ideVinculo", {}, el("cpfTrab", {}, so(cpf)), el("matricula", {}, so(matricula))),
    el("exMedOcup", {},
      el("tpExameOcup", {}, exame.codigoESocial),
      el("aso", {},
        el("dtAso", {}, exame.asoEm),
        el("resAso", {}, exame.resultado === "APTO" ? "1" : "2"),
        // Exame clínico (procedimento 0295 da Tabela 27) — o único que o Labutar registra hoje.
        el("exame", {}, el("dtExm", {}, exame.asoEm), el("procRealizado", {}, "0295")),
        el("medico", {}, el("nmMed", {}, exame.medico.nome), el("nrCRM", {}, so(nrCRM)), el("ufCRM", {}, (ufCRM ?? "AM").slice(0, 2)))),
      el("respMonit", {}, el("nmResp", {}, exame.medico.nome), el("nrCRM", {}, so(nrCRM)), el("ufCRM", {}, (ufCRM ?? "AM").slice(0, 2)))));
  return { namespace: ns("evtMonit"), evento, tipo: "S-2220" };
}
