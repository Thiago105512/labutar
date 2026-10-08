/**
 * eSocial e guias da competência fechada: eventos gerados a partir da fotografia da folha
 * (S-1200), das rescisões (S-2299) e dos ASO (S-2220), assinados e validados contra o XSD; e a
 * conferência do que as guias vão cobrar. As guias não são geradas aqui: o FGTS Digital e a
 * DCTFWeb são emitidos pelo governo a partir do eSocial — o Labutar mostra o valor esperado para
 * conferir antes de pagar.
 *
 * Assinatura: certificado A1 da empresa em PEM (LABUTAR_ESOCIAL_CHAVE_PEM e
 * LABUTAR_ESOCIAL_CERT_PEM). Sem ele, uma chave de teste gerada ao iniciar — o XML confere, mas
 * não tem valor jurídico e não é aceito pelo eSocial. Transmissão: pendente (certificado e WSDL).
 */
import { generateKeyPairSync } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  gerarS1200, gerarS2299, gerarS2220, assinarEvento, verificarAssinatura, statusIntegracao, ESQUEMAS_ESOCIAL,
} from "../../packages/esocial/src/index.js";
import { validarCompetencia, STATUS_COMPETENCIA, STATUS_RESCISAO } from "../../packages/folha/src/index.js";
import { somarDias, hoje } from "../../packages/core/src/datas.js";
import { sucesso, erroValidacao, erroNaoEncontrado, erroConflito } from "./http/resposta.js";
import { exigirPermissao } from "./middleware/contexto.js";
import { obterFechamento } from "./fechamento.js";
import { carregarCadastro } from "./cadastro.js";

const TUDO = { limite: 100_000 };
const ELEMENTO = { "S-1200": "evtRemun", "S-2299": "evtDeslig", "S-2220": "evtMonit" };

let credencialDeTeste = null;
function credencial() {
  if (process.env.LABUTAR_ESOCIAL_CHAVE_PEM && process.env.LABUTAR_ESOCIAL_CERT_PEM) {
    return { chavePrivada: process.env.LABUTAR_ESOCIAL_CHAVE_PEM, certificado: process.env.LABUTAR_ESOCIAL_CERT_PEM, teste: false };
  }
  credencialDeTeste ??= { chavePrivada: generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey, teste: true };
  return credencialDeTeste;
}

/**
 * Pacote de XSD para validar: o vigente na data; antes do primeiro pacote guardado, o mais
 * próximo — com aviso, porque o pacote vigente hoje não está no repositório.
 */
function pacoteXSD(data) {
  const vigentes = ESQUEMAS_ESOCIAL.filter((e) => e.vigenteDesde <= data).sort((a, b) => b.vigenteDesde.localeCompare(a.vigenteDesde));
  if (vigentes.length) return { pacote: vigentes[0], aviso: null };
  return { pacote: ESQUEMAS_ESOCIAL[0], aviso: `O pacote de XSD vigente hoje não está guardado; validado pelo de ${ESQUEMAS_ESOCIAL[0].vigenteDesde} (${ESQUEMAS_ESOCIAL[0].origem}).` };
}

/** Validação pelo xmllint, se instalado no servidor. */
function validarXSD(xml, elemento, pacote) {
  if (spawnSync("xmllint", ["--version"]).status !== 0) return { validado: null, erros: ["xmllint não instalado no servidor"] };
  const pasta = mkdtempSync(join(tmpdir(), "labutar-esocial-"));
  try {
    const arquivo = join(pasta, "evento.xml");
    writeFileSync(arquivo, xml);
    const xsd = fileURLToPath(new URL(`../../packages/esocial/xsd/${pacote.pasta}/${elemento}.xsd`, import.meta.url));
    const r = spawnSync("xmllint", ["--noout", "--schema", xsd, arquivo], { encoding: "utf8" });
    return { validado: r.status === 0, erros: r.status === 0 ? [] : r.stderr.split("\n").filter((l) => l.includes("error")).map((l) => l.replace(/^.*?: (?=Schemas|element)/, "")).slice(0, 5) };
  } finally { rmSync(pasta, { recursive: true, force: true }); }
}

/** Dia 20 do mês seguinte, antecipado para o dia útil anterior (FGTS Digital e DCTFWeb). */
function vencimentoDia20(competencia) {
  const [a, m] = competencia.split("-").map(Number);
  let d = `${m === 12 ? a + 1 : a}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-20`;
  while ([0, 6].includes(new Date(`${d}T12:00:00Z`).getUTCDay())) d = somarDias(d, -1);
  return d;
}

const lotacaoESocial = (lotacao) => String(lotacao ?? "ADM").split(":").pop().slice(0, 30);

async function dadosDaCompetencia(repo, tenant, competencia) {
  const f = await obterFechamento(repo, tenant, competencia);
  if (f.status !== STATUS_COMPETENCIA.FECHADA) throw erroConflito(`competência ${competencia} não está fechada: o eSocial sai da folha fechada`);
  const foto = f.fotografia;
  const cad = await carregarCadastro(repo, tenant);
  const pessoaDe = (m) => cad.pessoa.get(cad.vinculos.find((v) => v.matricula === m)?.pessoaId) ?? null;
  const [{ itens: rescisoes }, { itens: exames }] = await Promise.all([
    repo.listar(tenant, "rescisoes", {}, TUDO), repo.listar(tenant, "exames", { status: "REALIZADO" }, TUDO),
  ]);
  return {
    f, foto, pessoaDe, empresa: foto.empresa ?? {},
    rescisoes: rescisoes.filter((r) => r.status !== STATUS_RESCISAO.CANCELADA && r.desligamento.startsWith(competencia)),
    exames: exames.filter((e) => String(e.asoEm ?? "").startsWith(competencia)),
  };
}

function montarEvento(d, tipo, chave) {
  const { foto, empresa, pessoaDe } = d;
  if (tipo === "S-1200") {
    const h = foto.holerites.find((x) => x.colaborador.matricula === chave);
    if (!h) throw erroNaoEncontrado("holerite não encontrado na folha fechada");
    const cpf = pessoaDe(chave)?.cpf ?? h.colaborador.cpf;
    return { ev: gerarS1200({ empresa, competencia: foto.competencia ?? d.f.id, holerite: { ...h, colaborador: { ...h.colaborador, cpf } }, codLotacao: lotacaoESocial(h.colaborador.lotacao) }), nome: h.colaborador.nome, matricula: chave };
  }
  if (tipo === "S-2299") {
    const r = d.rescisoes.find((x) => x.id === chave);
    if (!r) throw erroNaoEncontrado("rescisão não encontrada na competência");
    return { ev: gerarS2299({ empresa, rescisao: r, cpf: pessoaDe(r.matricula)?.cpf ?? r.cpf, codLotacao: r.tomadorId ? lotacaoESocial(r.tomadorId) : "ADM" }), nome: r.nome, matricula: r.matricula };
  }
  if (tipo === "S-2220") {
    const e = d.exames.find((x) => x.id === chave);
    if (!e) throw erroNaoEncontrado("ASO não encontrado na competência");
    return { ev: gerarS2220({ empresa, exame: e, cpf: pessoaDe(e.matricula)?.cpf, matricula: e.matricula }), nome: e.nome, matricula: e.matricula };
  }
  throw erroValidacao("tipo de evento: S-1200, S-2299 ou S-2220", ["tipo"]);
}

export function registrarRotasESocial(r, { repo }) {
  r.get("/api/esocial/:competencia", async (req, res, ctx) => {
    const tenant = exigirPermissao(ctx, "folha", "ver");
    const competencia = ctx.params.competencia;
    if (!validarCompetencia(competencia)) throw erroValidacao("competência inválida: use AAAA-MM", ["competencia"]);
    const d = await dadosDaCompetencia(repo, tenant, competencia);
    const cpfDe = (m, alternativo) => d.pessoaDe(m)?.cpf ?? alternativo ?? null;
    const item = (tipo, chave, matricula, nome, cpf, referencia) => ({ tipo, chave, matricula, nome, referencia, situacao: cpf ? "PRONTO" : "PENDENTE", motivo: cpf ? null : "sem CPF: informe no cadastro" });
    const eventos = [
      ...d.foto.holerites.map((h) => item("S-1200", h.colaborador.matricula, h.colaborador.matricula, h.colaborador.nome, cpfDe(h.colaborador.matricula, h.colaborador.cpf), `remuneração de ${competencia}`)),
      ...d.rescisoes.map((x) => item("S-2299", x.id, x.matricula, x.nome, cpfDe(x.matricula, x.cpf), `desligamento em ${x.desligamento} (motivo ${x.motivo.codigo})`)),
      ...d.exames.map((x) => item("S-2220", x.id, x.matricula, x.nome, cpfDe(x.matricula), `ASO de ${x.asoEm}`)),
    ];
    const resumo = d.foto.resumo ?? {};
    const enc = resumo.encargos ?? { patronal: 0, rat: 0, terceiros: 0, total: 0 };
    const fgtsRescisorio = d.rescisoes.reduce((s, x) => s + x.resultado.fgts.mes + x.resultado.fgts.multa, 0);
    const venc = vencimentoDia20(competencia);
    sucesso(res, {
      competencia, fechadaEm: d.f.fechadaEm, hash: d.f.hash, eventos,
      guias: {
        fgtsDigital: { mensal: resumo.fgts ?? 0, rescisorio: fgtsRescisorio, total: (resumo.fgts ?? 0) + fgtsRescisorio, vencimento: venc, observacao: "FGTS da rescisão e multa vencem em até 10 dias do desligamento, em guia própria." },
        dctfWeb: {
          inssSegurados: resumo.inss ?? 0, patronal: enc.patronal, rat: enc.rat, terceiros: enc.terceiros, irrf: resumo.irrf ?? 0,
          total: (resumo.inss ?? 0) + enc.total + (resumo.irrf ?? 0), vencimento: venc,
        },
      },
      integracao: statusIntegracao(),
      assinatura: credencial().teste ? "chave de teste (sem certificado A1): o XML confere, mas o eSocial não aceita" : "certificado A1 da empresa",
      xsd: pacoteXSD(hoje()),
    });
  });

  r.get("/api/esocial/:competencia/xml", async (req, res, ctx) => {
    const tenant = exigirPermissao(ctx, "folha", "editar");
    const competencia = ctx.params.competencia;
    if (!validarCompetencia(competencia)) throw erroValidacao("competência inválida", ["competencia"]);
    const tipo = String(ctx.query.tipo ?? "");
    const d = await dadosDaCompetencia(repo, tenant, competencia);
    let montado;
    try { montado = montarEvento(d, tipo, String(ctx.query.chave ?? "")); } catch (e) { if (e.status) throw e; throw erroConflito(e.message); }
    const cred = credencial();
    const xml = assinarEvento(montado.ev, cred);
    const { pacote, aviso } = pacoteXSD(hoje());
    const validacao = validarXSD(xml, ELEMENTO[tipo], pacote);
    sucesso(res, {
      tipo, matricula: montado.matricula, nome: montado.nome, id: montado.ev.evento.atributos.Id,
      nomeArquivo: `${tipo}_${competencia}_${montado.matricula}.xml`, conteudo: xml,
      assinatura: { ...verificarAssinatura(xml), teste: cred.teste }, xsd: { pacote: pacote.pasta, aviso, ...validacao },
    });
  });
}
