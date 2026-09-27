import test from "node:test";
import assert from "node:assert/strict";

import {
  CANAIS_PUBLICACAO,
  METODO_PUBLICACAO,
  planoDePublicacao,
  canaisDisponiveis,
  gerarJobPosting,
  gerarJsonLd,
  gerarFeedVagas,
  gerarLinkUTM,
  gerarTextoParaRedes,
  publicacaoInicial,
} from "../src/canais.js";
import { criarVaga } from "../src/vagas.js";

const DESCRICAO =
  "Buscamos pessoa desenvolvedora sênior para o time de plataforma, com foco em Node.js e arquitetura de serviços distribuídos.";

const BASE = { baseUrl: "https://vagas.labutar.com.br", tenantSlug: "acme" };
const AGORA = "2026-09-27T12:00:00.000Z";

function vagaPresencial(sobrescrever = {}) {
  return criarVaga({
    titulo: "Pessoa Desenvolvedora Sênior",
    descricao: DESCRICAO,
    responsabilidades: ["Desenhar serviços"],
    requisitos: ["5 anos com Node.js"],
    beneficios: ["Vale refeição", "Plano de saúde"],
    local: { modelo: "PRESENCIAL", cidade: "São Paulo", uf: "SP", cep: "06454-000", endereco: "Av. Paulista, 1000" },
    salario: { min: 1_200_000, max: 1_800_000, exibir: true },
    tipoContrato: "CLT",
    cbo: "3171100",
    datas: { encerradaEm: "2026-10-10" },
    ...sobrescrever,
  });
}

test("canal desconhecido é reportado como indisponível, não como ok", () => {
  const plano = planoDePublicacao("CANAL_INVENTADO");
  assert.equal(plano.metodo, METODO_PUBLICACAO.INDISPONIVEL);
  assert.equal(plano.bloqueio, "canal desconhecido");
});

test("canais próprios são automáticos e não dependem de terceiro", () => {
  for (const canal of [CANAIS_PUBLICACAO.PORTAL_LABUTAR, CANAIS_PUBLICACAO.GOOGLE_JOBS]) {
    const plano = planoDePublicacao(canal);
    assert.equal(plano.metodo, METODO_PUBLICACAO.AUTOMATICO);
    assert.equal(plano.bloqueio, null);
  }
  assert.match(planoDePublicacao(CANAIS_PUBLICACAO.GOOGLE_JOBS).observacao, /schema\.org/);
});

test("job boards sem API pública ficam marcados como manuais, com o bloqueio explicado", () => {
  const catho = planoDePublicacao(CANAIS_PUBLICACAO.CATHO);
  assert.equal(catho.metodo, METODO_PUBLICACAO.MANUAL);
  assert.match(catho.bloqueio, /não tem API pública/);
  assert.match(catho.bloqueio, /2026-09-27/);

  for (const canal of [CANAIS_PUBLICACAO.LINKEDIN, CANAIS_PUBLICACAO.INDEED, CANAIS_PUBLICACAO.INFOJOBS]) {
    assert.equal(planoDePublicacao(canal).metodo, METODO_PUBLICACAO.MANUAL);
    assert.ok(planoDePublicacao(canal).bloqueio.length > 10);
  }
});

test("WhatsApp fica indisponível enquanto não houver opt-in e template aprovado", () => {
  const plano = planoDePublicacao(CANAIS_PUBLICACAO.WHATSAPP);
  assert.equal(plano.metodo, METODO_PUBLICACAO.INDISPONIVEL);
  assert.match(plano.bloqueio, /opt-in/);
  assert.match(plano.bloqueio, /LGPD/);
});

test("canaisDisponiveis exclui apenas o que está indisponível", () => {
  const disponiveis = canaisDisponiveis();
  assert.equal(disponiveis.length, Object.keys(CANAIS_PUBLICACAO).length - 1);
  assert.ok(!disponiveis.some((c) => c.canal === CANAIS_PUBLICACAO.WHATSAPP));
  assert.ok(disponiveis.every((c) => c.metodo !== METODO_PUBLICACAO.INDISPONIVEL));
});

test("JobPosting traz os campos que o Google for Jobs exige", () => {
  const jp = gerarJobPosting(vagaPresencial(), { ...BASE, organizacao: { nome: "ACME Ltda", site: "https://acme.com.br" }, agora: AGORA });

  assert.equal(jp["@context"], "https://schema.org");
  assert.equal(jp["@type"], "JobPosting");
  assert.equal(jp.title, "Pessoa Desenvolvedora Sênior");
  assert.equal(jp.datePosted, AGORA);
  assert.equal(jp.validThrough, "2026-10-10T23:59:59-03:00");
  assert.equal(jp.hiringOrganization["@type"], "Organization");
  assert.equal(jp.hiringOrganization.name, "ACME Ltda");
  assert.equal(jp.identifier.value.length > 0, true);
  assert.equal(jp.occupationalCategory, "3171100");
  assert.ok(jp.description.length > 100);
  assert.match(jp.description, /^<p>/);
  assert.match(jp.description, /<li>5 anos com Node\.js<\/li>/);
});

test("JobPosting converte salário de centavos para valor mensal em BRL", () => {
  const jp = gerarJobPosting(vagaPresencial(), { agora: AGORA });
  assert.equal(jp.baseSalary["@type"], "MonetaryAmount");
  assert.equal(jp.baseSalary.currency, "BRL");
  assert.equal(jp.baseSalary.value.minValue, 12_000);
  assert.equal(jp.baseSalary.value.maxValue, 18_000);
  assert.equal(jp.baseSalary.value.unitText, "MONTH");
  assert.deepEqual(jp.jobBenefits, ["Vale refeição", "Plano de saúde"]);
});

test("vaga presencial usa jobLocation; remota usa applicantLocationRequirements", () => {
  const presencial = gerarJobPosting(vagaPresencial(), { agora: AGORA });
  assert.equal(presencial.jobLocation.length, 1);
  assert.equal(presencial.jobLocation[0].address.addressLocality, "São Paulo");
  assert.equal(presencial.jobLocation[0].address.addressRegion, "SP");
  assert.equal(presencial.jobLocation[0].address.postalCode, "06454-000");
  assert.equal(presencial.jobLocation[0].address.addressCountry, "BR");
  assert.equal("applicantLocationRequirements" in presencial, false);

  const remota = gerarJobPosting(criarVaga({ titulo: "Dev Remoto", descricao: DESCRICAO, local: { modelo: "REMOTO" } }), { agora: AGORA });
  assert.deepEqual(remota.applicantLocationRequirements, [{ "@type": "Country", name: "BR" }]);
  assert.equal("jobLocation" in remota, false);
});

test("campos ausentes saem do JSON-LD em vez de virarem null", () => {
  const jp = gerarJobPosting(criarVaga({ titulo: "Estágio", descricao: DESCRICAO, local: { modelo: "REMOTO" }, tipoContrato: "ESTAGIO" }), { agora: AGORA });
  assert.equal("baseSalary" in jp, false);
  assert.equal("occupationalCategory" in jp, false);
  assert.equal("jobBenefits" in jp, false);
  assert.equal("url" in jp, false);
  assert.deepEqual(jp.employmentType, ["INTERN"]);
});

test("employmentType reflete contrato e jornada", () => {
  const tipo = (vaga) => gerarJobPosting(vaga, { agora: AGORA }).employmentType;
  assert.deepEqual(tipo(vagaPresencial()), ["FULL_TIME"]);
  assert.deepEqual(tipo(vagaPresencial({ tipoContrato: "PJ" })), ["CONTRACTOR"]);
  assert.deepEqual(tipo(vagaPresencial({ tipoContrato: "TEMPORARIO" })), ["TEMPORARY"]);
  assert.deepEqual(tipo(vagaPresencial({ tipoContrato: "APRENDIZ" })), ["INTERN"]);
  assert.deepEqual(tipo(vagaPresencial({ jornada: { tipo: "PARCIAL", horasSemanais: 20 } })), ["PART_TIME"]);
});

test("validThrough cai em 30 dias quando a vaga não tem data de encerramento", () => {
  const jp = gerarJobPosting(criarVaga({ titulo: "Dev", descricao: DESCRICAO, local: { modelo: "REMOTO" } }), { agora: AGORA });
  assert.equal(jp.validThrough, "2026-10-27T12:00:00.000Z");
});

test("gerarJobPosting exige título", () => {
  assert.throws(() => gerarJobPosting({}), /exige vaga com titulo/);
});

test("gerarJsonLd embrulha a marcação em script de application/ld+json", () => {
  const html = gerarJsonLd(vagaPresencial(), { agora: AGORA });
  assert.ok(html.startsWith('<script type="application/ld+json">{'));
  assert.ok(html.endsWith("}</script>"));
  assert.doesNotThrow(() => JSON.parse(html.slice('<script type="application/ld+json">'.length, -"</script>".length)));
});

test("feed XML escapa caracteres reservados", () => {
  const vaga = { id: "VAGA_1", titulo: "Dev <Sênior> & Cia", resumo: 'Buscamos "gente boa"', local: { cidade: "São Paulo", uf: "SP" }, tipoContrato: "CLT" };
  const xml = gerarFeedVagas([vaga], { ...BASE, agora: AGORA });

  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.match(xml, /<rss version="2\.0"/);
  assert.match(xml, /Dev &lt;Sênior&gt; &amp; Cia/);
  assert.match(xml, /Buscamos &quot;gente boa&quot;/);
  assert.equal(xml.match(/<item>/g).length, 1);
  assert.match(xml, /<job:region>SP<\/job:region>/);
  assert.match(xml, /<language>pt-BR<\/language>/);
});

test("feed XML com lista vazia continua bem formado", () => {
  const xml = gerarFeedVagas([], BASE);
  assert.equal(xml.match(/<item>/g), null);
  assert.match(xml, /<\/rss>/);
});

test("gerarLinkUTM monta rastreio por canal e campanha", () => {
  const vaga = vagaPresencial();
  const link = gerarLinkUTM(vaga, CANAIS_PUBLICACAO.LINKEDIN, { ...BASE, campanha: "dev-2026" });

  assert.ok(link.startsWith(`https://vagas.labutar.com.br/acme/${vaga.slug}?`));
  assert.ok(link.includes("utm_source=linkedin"));
  assert.ok(link.includes("utm_medium=job-board"));
  assert.ok(link.includes("utm_campaign=dev-2026"));
  assert.ok(link.includes(`utm_content=${vaga.id}`));
  assert.equal(gerarLinkUTM(vaga, CANAIS_PUBLICACAO.LINKEDIN, {}), null);
});

test("gerarLinkUTM deriva a campanha do título quando não informada", () => {
  const link = gerarLinkUTM(vagaPresencial(), CANAIS_PUBLICACAO.CATHO, BASE);
  assert.ok(link.includes("utm_campaign=pessoa-desenvolvedora-senior"));
  assert.ok(link.includes("utm_source=catho"));
});

test("texto para redes é truncado no limite do canal", () => {
  const vaga = vagaPresencial({ resumo: "x".repeat(1600) });

  const facebook = gerarTextoParaRedes(vaga, CANAIS_PUBLICACAO.FACEBOOK, BASE);
  assert.equal(facebook.truncado, true);
  assert.ok(facebook.texto.length <= 1500);
  assert.ok(facebook.texto.endsWith("…"));

  const whatsapp = gerarTextoParaRedes(vaga, CANAIS_PUBLICACAO.WHATSAPP, BASE);
  assert.equal(whatsapp.truncado, false);
});

test("texto para redes carrega os dados essenciais da vaga", () => {
  const texto = gerarTextoParaRedes(vagaPresencial(), CANAIS_PUBLICACAO.LINKEDIN, BASE).texto;
  assert.match(texto, /Pessoa Desenvolvedora Sênior/);
  assert.match(texto, /São Paulo\/SP/);
  assert.match(texto, /CLT/);
  assert.match(texto, /Até R\$ 18\.000,00/);
  assert.match(texto, /5 anos com Node\.js/);
  assert.match(texto, /utm_source=linkedin/);
});

test("texto para redes indica remoto no lugar do endereço", () => {
  const vaga = criarVaga({ titulo: "Dev", descricao: DESCRICAO, local: { modelo: "REMOTO" } });
  const texto = gerarTextoParaRedes(vaga, CANAIS_PUBLICACAO.LINKEDIN, BASE).texto;
  assert.match(texto, /100% remoto/);
  assert.doesNotMatch(texto, /📍/);
});

test("publicacaoInicial marca o status real de cada canal", () => {
  const vaga = vagaPresencial();
  const publicacoes = publicacaoInicial(vaga, {
    canais: [CANAIS_PUBLICACAO.PORTAL_LABUTAR, CANAIS_PUBLICACAO.LINKEDIN, CANAIS_PUBLICACAO.WHATSAPP],
    ...BASE,
    agora: AGORA,
  });

  assert.deepEqual(publicacoes.map((p) => p.status), ["PUBLICADA", "PENDENTE_MANUAL", "BLOQUEADA"]);
  assert.equal(publicacoes[0].url, `https://vagas.labutar.com.br/acme/${vaga.slug}`);
  assert.ok(publicacoes[1].url.includes("utm_source=linkedin"));
  assert.equal(publicacoes[2].url, null);
  assert.match(publicacoes[2].bloqueio, /opt-in/);
  assert.equal(publicacoes[0].criadoEm, AGORA);
});

test("publicacaoInicial usa portal e Google Jobs por padrão", () => {
  const publicacoes = publicacaoInicial(vagaPresencial(), { ...BASE, agora: AGORA });
  assert.deepEqual(publicacoes.map((p) => p.canal), [CANAIS_PUBLICACAO.PORTAL_LABUTAR, CANAIS_PUBLICACAO.GOOGLE_JOBS]);
  assert.ok(publicacoes.every((p) => p.status === "PUBLICADA"));
});
