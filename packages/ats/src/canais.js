import { escapeXML, normalizar } from "../../core/src/texto.js";
import { urlPublica } from "./vagas.js";
import { dataNoFuso, deslocamentoDoFuso } from "../../core/src/datas.js";
import { MODELO_TRABALHO } from "./constantes.js";

export const CANAIS_PUBLICACAO = Object.freeze({
  PORTAL_LABUTAR: "PORTAL_LABUTAR",
  GOOGLE_JOBS: "GOOGLE_JOBS",
  SITE_EMPRESA: "SITE_EMPRESA",
  FEED_XML: "FEED_XML",
  LINKEDIN: "LINKEDIN",
  INDEED: "INDEED",
  CATHO: "CATHO",
  INFOJOBS: "INFOJOBS",
  GLASSDOOR: "GLASSDOOR",
  FACEBOOK: "FACEBOOK",
  WHATSAPP: "WHATSAPP",
});

export const METODO_PUBLICACAO = Object.freeze({
  AUTOMATICO: "AUTOMATICO",
  SEMI_AUTOMATICO: "SEMI_AUTOMATICO",
  MANUAL: "MANUAL",
  INDISPONIVEL: "INDISPONIVEL",
});

/**
 * Verdade sobre cada canal, verificada em 2026-09-27. Prometer publicação
 * automática onde não há API é pior do que não ter o canal: o recrutador
 * acredita que a vaga está no ar e ela não está.
 */
const PLANOS = {
  [CANAIS_PUBLICACAO.PORTAL_LABUTAR]: {
    metodo: METODO_PUBLICACAO.AUTOMATICO,
    bloqueio: null,
    observacao: "Portal público do Labutar. Sem dependência de terceiro.",
  },
  [CANAIS_PUBLICACAO.GOOGLE_JOBS]: {
    metodo: METODO_PUBLICACAO.AUTOMATICO,
    bloqueio: null,
    observacao:
      "Marcação JobPosting (schema.org) na página pública da vaga. Sem API e sem cadastro — o Google indexa sozinho. Exige página pública acessível e título/descrição/localização completos.",
  },
  [CANAIS_PUBLICACAO.SITE_EMPRESA]: {
    metodo: METODO_PUBLICACAO.SEMI_AUTOMATICO,
    bloqueio: null,
    observacao: "Gera o snippet HTML/JSON-LD para colar no site do cliente.",
  },
  [CANAIS_PUBLICACAO.FEED_XML]: {
    metodo: METODO_PUBLICACAO.SEMI_AUTOMATICO,
    bloqueio: "Cada agregador define o próprio schema e exige cadastro do feed.",
    observacao: "Gera o XML; o envio/registro no agregador é manual.",
  },
  [CANAIS_PUBLICACAO.LINKEDIN]: {
    metodo: METODO_PUBLICACAO.MANUAL,
    bloqueio:
      "A Jobs API do LinkedIn foi descontinuada para terceiros; publicação programática exige parceria Talent Solutions ou Marketing Developer Platform, com aprovação da Meta/LinkedIn.",
    observacao: "Gera o texto pronto para colar e o link com UTM.",
  },
  [CANAIS_PUBLICACAO.INDEED]: {
    metodo: METODO_PUBLICACAO.MANUAL,
    bloqueio: "Indeed só aceita integração por parceiro autorizado (Indeed Apply / Sponsored).",
    observacao: "Gera o texto pronto para colar.",
  },
  [CANAIS_PUBLICACAO.CATHO]: {
    metodo: METODO_PUBLICACAO.MANUAL,
    bloqueio:
      "Catho não tem API pública (verificado em 2026-09-27: developers.catho.com.br não resolve; a página catho.com.br/empresas não menciona API, ATS ou webhook).",
    observacao: "Anúncio é gratuito e ilimitado no painel da Catho; publicação por cópia.",
  },
  [CANAIS_PUBLICACAO.INFOJOBS]: {
    metodo: METODO_PUBLICACAO.MANUAL,
    bloqueio: "API restrita a parceiros comerciais; o InfoJobs é do grupo Redarbor, o mesmo da Catho.",
    observacao: "Gera o texto pronto para colar.",
  },
  [CANAIS_PUBLICACAO.GLASSDOOR]: {
    metodo: METODO_PUBLICACAO.MANUAL,
    bloqueio: "Publicação de vaga depende de conta employer branding verificada.",
    observacao: "Gera o texto pronto para colar.",
  },
  [CANAIS_PUBLICACAO.FACEBOOK]: {
    metodo: METODO_PUBLICACAO.MANUAL,
    bloqueio:
      "Meta descontinuou o recurso de vagas (Jobs) em 2023. Restou publicar como post comum na página, o que exige Graph API aprovada.",
    observacao: "Gera o texto do post.",
  },
  [CANAIS_PUBLICACAO.WHATSAPP]: {
    metodo: METODO_PUBLICACAO.INDISPONIVEL,
    bloqueio:
      "WhatsApp Business Cloud API exige aprovação da Meta, opt-in do destinatário e template revisado. Divulgação de vaga em massa sem opt-in viola os termos e a LGPD.",
    observacao: "Fora do escopo até haver aprovação de template.",
  },
};

export function planoDePublicacao(canal) {
  const plano = PLANOS[canal];
  if (!plano) return { canal, metodo: METODO_PUBLICACAO.INDISPONIVEL, bloqueio: "canal desconhecido", observacao: null };
  return { canal, ...plano };
}

export function canaisDisponiveis() {
  return Object.keys(PLANOS)
    .map((canal) => planoDePublicacao(canal))
    .filter((p) => p.metodo !== METODO_PUBLICACAO.INDISPONIVEL);
}

const EMPREGO_POR_CONTRATO = {
  CLT: ["FULL_TIME"],
  PJ: ["CONTRACTOR"],
  ESTAGIO: ["INTERN"],
  APRENDIZ: ["INTERN"],
  TEMPORARIO: ["TEMPORARY"],
};

function tipoDeEmprego(vaga) {
  if (vaga.tipoContrato === "CLT" && vaga.jornada?.tipo === "PARCIAL") return ["PART_TIME"];
  return EMPREGO_POR_CONTRATO[vaga.tipoContrato] ?? ["FULL_TIME"];
}

function paragrafosHTML(texto) {
  return String(texto ?? "")
    .split(/\n{2,}|\r\n{2,}/)
    .map((bloco) => bloco.trim())
    .filter(Boolean)
    .map((bloco) => `<p>${escapeXML(bloco).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function listaHTML(itens, titulo) {
  if (!itens?.length) return "";
  return `<p><strong>${titulo}</strong></p><ul>${itens
    .map((item) => `<li>${escapeXML(String(item))}</li>`)
    .join("")}</ul>`;
}

/**
 * Marcação JobPosting (schema.org) exigida pelo Google for Jobs.
 * Regras que quebram a indexação se violadas: `description` precisa ser HTML
 * com a descrição completa (não um resumo), `datePosted` em ISO-8601, e vaga
 * remota usa `applicantLocationRequirements` em vez de `jobLocation`.
 */
export function gerarJobPosting(vaga, { baseUrl, tenantSlug, organizacao = {}, agora } = {}) {
  if (!vaga?.titulo) throw new Error("gerarJobPosting exige vaga com titulo");

  const quando = agora ? new Date(agora) : new Date();
  const remota = vaga.local?.modelo === MODELO_TRABALHO.REMOTO;

  const descricao = [
    paragrafosHTML(vaga.descricao),
    listaHTML(vaga.responsabilidades, "Responsabilidades"),
    listaHTML(vaga.requisitos, "Requisitos"),
    listaHTML(vaga.beneficios, "Benefícios"),
  ]
    .filter(Boolean)
    .join("");

  const postagem = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: vaga.titulo,
    description: descricao,
    identifier: {
      "@type": "PropertyValue",
      name: organizacao.nome ?? tenantSlug ?? "Labutar",
      value: vaga.id,
    },
    datePosted: quando.toISOString(),
    validThrough: vaga.datas?.encerradaEm
      ? `${dataNoFuso(vaga.datas.encerradaEm)}T23:59:59${deslocamentoDoFuso()}`
      : new Date(quando.getTime() + 30 * 86_400_000).toISOString(),
    employmentType: tipoDeEmprego(vaga),
    hiringOrganization: {
      "@type": "Organization",
      name: organizacao.nome ?? tenantSlug ?? null,
      sameAs: organizacao.site ?? null,
      logo: organizacao.logo ?? null,
    },
    baseSalary:
      vaga.salario?.min != null || vaga.salario?.max != null
        ? {
            "@type": "MonetaryAmount",
            currency: "BRL",
            value: {
              "@type": "QuantitativeValue",
              minValue: vaga.salario.min != null ? vaga.salario.min / 100 : undefined,
              maxValue: vaga.salario.max != null ? vaga.salario.max / 100 : undefined,
              unitText: "MONTH",
            },
          }
        : undefined,
    jobBenefits: vaga.beneficios?.length ? vaga.beneficios : undefined,
    occupationalCategory: vaga.cbo ?? undefined,
    url: urlPublica(vaga, { baseUrl, tenantSlug }) ?? undefined,
  };

  if (remota) {
    postagem.applicantLocationRequirements = [{ "@type": "Country", name: vaga.local?.pais ?? "BR" }];
  } else if (vaga.local?.cidade || vaga.local?.uf) {
    postagem.jobLocation = [
      {
        "@type": "Place",
        address: {
          "@type": "PostalAddress",
          streetAddress: vaga.local.endereco ?? undefined,
          addressLocality: vaga.local.cidade ?? undefined,
          addressRegion: vaga.local.uf ?? undefined,
          postalCode: vaga.local.cep ?? undefined,
          addressCountry: "BR",
        },
      },
    ];
  }

  return JSON.parse(JSON.stringify(postagem));
}

export function gerarJsonLd(vaga, opcoes) {
  return `<script type="application/ld+json">${JSON.stringify(gerarJobPosting(vaga, opcoes))}</script>`;
}

export function gerarFeedVagas(vagas = [], { baseUrl, tenantSlug, tituloFeed = "Vagas", agora } = {}) {
  const quando = agora ?? new Date().toISOString();
  const itens = vagas
    .map((vaga) => {
      const url = urlPublica(vaga, { baseUrl, tenantSlug }) ?? "";
      return `    <item>
      <title>${escapeXML(vaga.titulo)}</title>
      <link>${escapeXML(url)}</link>
      <guid isPermaLink="false">${escapeXML(vaga.id)}</guid>
      <pubDate>${escapeXML(quando)}</pubDate>
      <description>${escapeXML(String(vaga.resumo ?? vaga.descricao ?? "").slice(0, 500))}</description>
      <job:title>${escapeXML(vaga.titulo)}</job:title>
      <job:company>${escapeXML(tenantSlug ?? "")}</job:company>
      <job:location>${escapeXML(vaga.local?.cidade ?? "")}</job:location>
      <job:region>${escapeXML(vaga.local?.uf ?? "")}</job:region>
      <job:country>BR</job:country>
      <job:type>${escapeXML(vaga.tipoContrato ?? "")}</job:type>
    </item>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:job="https://labutar.com.br/ns/vagas/1.0">
  <channel>
    <title>${escapeXML(tituloFeed)}</title>
    <link>${escapeXML(baseUrl ?? "")}</link>
    <description>Feed de vagas — Labutar</description>
    <language>pt-BR</language>
    <lastBuildDate>${escapeXML(quando)}</lastBuildDate>
${itens}
  </channel>
</rss>
`;
}

export function gerarLinkUTM(vaga, canal, { baseUrl, tenantSlug, campanha } = {}) {
  const url = urlPublica(vaga, { baseUrl, tenantSlug });
  if (!url) return null;
  const parametros = new URLSearchParams({
    utm_source: normalizar(canal).toLowerCase().replace(/_/g, "-"),
    utm_medium: "job-board",
    utm_campaign: campanha ?? normalizar(vaga.titulo).toLowerCase().replace(/\s+/g, "-"),
    utm_content: vaga.id,
  });
  return `${url}?${parametros.toString()}`;
}

const LIMITE_TEXTO = {
  LINKEDIN: 3000,
  FACEBOOK: 1500,
  WHATSAPP: 4000,
};

/**
 * Caminho semi-automático: como a maioria dos job boards não tem API aberta,
 * o que dá para automatizar de verdade é a produção do anúncio. O recrutador
 * copia e cola; o Labutar rastreia a origem pelo UTM.
 */
export function gerarTextoParaRedes(vaga, canal, { baseUrl, tenantSlug } = {}) {
  const link = gerarLinkUTM(vaga, canal, { baseUrl, tenantSlug });
  const partes = [
    `📢 ${vaga.titulo}`,
    vaga.resumo || null,
    vaga.local?.modelo === MODELO_TRABALHO.REMOTO
      ? "🌎 100% remoto"
      : `📍 ${[vaga.local?.cidade, vaga.local?.uf].filter(Boolean).join("/") || "Local a combinar"}`,
    vaga.tipoContrato ? `💼 ${vaga.tipoContrato}` : null,
    vaga.salario?.exibir && vaga.salario?.max != null
      ? `💰 Até R$ ${(vaga.salario.max / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
      : null,
    vaga.requisitos?.length ? `✅ ${vaga.requisitos.slice(0, 5).join(" · ")}` : null,
    link ? `🔗 ${link}` : null,
  ].filter(Boolean);

  const texto = partes.join("\n\n");
  const limite = LIMITE_TEXTO[canal] ?? 1500;
  return {
    canal,
    texto: texto.length <= limite ? texto : `${texto.slice(0, limite - 1).trimEnd()}…`,
    truncado: texto.length > limite,
    link,
  };
}

export function publicacaoInicial(vaga, { canais, baseUrl, tenantSlug, agora } = {}) {
  const quando = agora ?? new Date().toISOString();
  const alvos = canais ?? [CANAIS_PUBLICACAO.PORTAL_LABUTAR, CANAIS_PUBLICACAO.GOOGLE_JOBS];

  return alvos.map((canal) => {
    const plano = planoDePublicacao(canal);
    return {
      id: `${vaga.id}:${canal}`,
      vagaId: vaga.id,
      tenantId: vaga.tenantId ?? null,
      canal,
      metodo: plano.metodo,
      url:
        plano.metodo === METODO_PUBLICACAO.INDISPONIVEL
          ? null
          : plano.metodo === METODO_PUBLICACAO.AUTOMATICO
            ? urlPublica(vaga, { baseUrl, tenantSlug })
            : gerarLinkUTM(vaga, canal, { baseUrl, tenantSlug }),
      status:
        plano.metodo === METODO_PUBLICACAO.AUTOMATICO
          ? "PUBLICADA"
          : plano.metodo === METODO_PUBLICACAO.INDISPONIVEL
            ? "BLOQUEADA"
            : "PENDENTE_MANUAL",
      bloqueio: plano.bloqueio,
      criadoEm: quando,
    };
  });
}
