/**
 * Módulo Folha de pagamento: resumo da competência, holerites com lançamentos,
 * custo por tomador e catálogo de verbas. Todo cálculo é do servidor (packages/folha);
 * a tela só exibe e envia lançamentos.
 */
import { icone } from "./icones.js";
import { api, sessao } from "./sessao.js";
import { esc, moeda, cnpj, cpf, matricula, avatar, etiqueta, aviso, abrirPainel, fecharPainel } from "./ui.js";

export const COMPETENCIA_PADRAO = "2026-09";
const cache = { competencia: COMPETENCIA_PADRAO, folha: null, parametros: null, busca: "" };

const NOME_VINCULO = { TEMPORARIO: ["Temporário", "e-azul"], TERCEIRIZADO: ["Terceirizado", "e-marca"], PROPRIO: ["Próprio", "e-cinza"] };
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const nomeCompetencia = (c) => `${MESES[Number(c.slice(5, 7)) - 1]}/${c.slice(0, 4)}`;
const competenciaTela = (c) => `${c.slice(5, 7)}/${c.slice(0, 4)}`;
const decimal = (n) => String(n ?? 0).replace(".", ",");

async function carregarFolha({ forcar = false } = {}) {
  if (!cache.folha || forcar || cache.folha.competencia !== cache.competencia) {
    cache.folha = await api(`/folha/${cache.competencia}`);
  }
  return cache.folha;
}

export function limparFolha() {
  cache.folha = null;
  cache.parametros = null;
}

function nomeLotacao(id) {
  return cache.folha?.lotacoes?.find((l) => l.id === id)?.nome ?? id ?? "Sem lotação";
}

function cabecalhoCompetencia(f, extra = "") {
  return `
    <div class="barra-filtros">
      <span class="etiqueta sem-ponto e-marca">${icone("relogio")}Competência ${competenciaTela(f.competencia)}</span>
      <span class="dica">${f.empresa?.razaoSocial ? `${esc(f.empresa.razaoSocial)} · CNPJ ${esc(cnpj(f.empresa.cnpj))} · ` : ""}Tabelas legais vigentes desde ${competenciaTela(f.tabela.de)}</span>
      ${extra}
    </div>`;
}

// ---------------------------------------------------------------- resumo

export async function paginaFolhaResumo() {
  const f = await carregarFolha();
  const r = f.resumo;
  const indicadores = [
    { rotulo: "Colaboradores na folha", valor: r.colaboradores, icone: "pessoas", cor: "var(--marca-500)", fundo: "var(--marca-100)", nota: `${f.pendencias.length} para a rescisão` },
    { rotulo: "Proventos", valor: moeda(r.proventos), icone: "dinheiro", cor: "var(--azul)", fundo: "var(--azul-bg)", nota: `descontos ${moeda(r.descontos)}` },
    { rotulo: "Líquido a pagar", valor: moeda(r.liquido), icone: "ok", cor: "var(--verde)", fundo: "var(--verde-bg)", nota: "depois do adiantamento" },
    { rotulo: "Custo total da empresa", valor: moeda(r.custoTotal), icone: "financeiro", cor: "var(--ambar)", fundo: "var(--ambar-bg)", nota: "proventos + FGTS + encargos" },
  ];
  const proventos = r.porVerba.filter((v) => v.tipo === "PROVENTO");
  const descontos = r.porVerba.filter((v) => v.tipo === "DESCONTO");
  const linhaVerba = (v) => `<tr><td><code>${esc(v.codigo)}</code></td><td>${esc(v.nome)}</td><td class="num col-opcional">${v.colaboradores}</td><td class="num">${moeda(v.valor)}</td></tr>`;

  return `
    ${cabecalhoCompetencia(f)}
    <section class="boas-vindas">
      <div>
        <h2>Folha de ${nomeCompetencia(f.competencia)}</h2>
        <p>${r.colaboradores} colaboradores calculados com INSS, IRRF (com a redução da Lei 15.270/2025), FGTS, salário-família e DSR pelo calendário de Manaus.
        ${f.pendencias.length ? `${f.pendencias.length} desligamento no mês vai para a rescisão.` : ""}</p>
        <div class="acoes">
          <a class="botao botao-claro" href="#/folha/holerites">${icone("folha")}Ver holerites</a>
          <a class="botao botao-vidro" href="#/folha/tomadores">${icone("tomadores")}Custo por tomador</a>
        </div>
      </div>
    </section>

    <section class="indicadores">
      ${indicadores.map((i) => `
        <div class="cartao indicador">
          <span class="indicador-icone" style="color:${i.cor};background:${i.fundo}">${icone(i.icone)}</span>
          <div><small>${i.rotulo}</small><strong>${i.valor}</strong><span class="dica">${esc(i.nota)}</span></div>
        </div>`).join("")}
    </section>

    ${r.semCPF ? `
      <div class="cartao alerta-folha">
        ${icone("cracha")}
        <div><strong>${r.semCPF} colaborador${r.semCPF === 1 ? "" : "es"} sem CPF</strong>
          <p>O cálculo sai normalmente, mas o envio ao eSocial exige o CPF de cada pessoa. Informe no holerite de cada um.</p></div>
      </div>` : ""}
    ${f.pendencias.length ? `
      <div class="cartao alerta-folha">
        ${icone("relogio")}
        <div><strong>Fora da folha mensal</strong>
          ${f.pendencias.map((p) => `<p>${esc(p.nome)} (${esc(matricula(p.matricula))}): ${esc(p.motivo)}</p>`).join("")}</div>
      </div>` : ""}

    <section class="grade-folha">
      <div class="cartao">
        <div class="cartao-cabecalho"><div><h3>Bases e encargos</h3><p>Guias da competência</p></div></div>
        <div class="cartao-corpo">
          <table class="tabela tabela-compacta">
            <tbody>
              <tr><td>Base de INSS</td><td class="num">${moeda(r.baseINSS)}</td></tr>
              <tr><td>INSS descontado dos colaboradores</td><td class="num">${moeda(r.inss)}</td></tr>
              <tr><td>INSS da empresa (20%)</td><td class="num">${moeda(r.encargos.patronal)}</td></tr>
              <tr><td>RAT ajustado pelo FAP (${esc(decimal(f.empresa.ratPercentual))}% × ${esc(decimal(f.empresa.fap ?? 1))})</td><td class="num">${moeda(r.encargos.rat)}</td></tr>
              <tr><td>Terceiros (${esc(decimal(f.empresa.terceirosPercentual))}%)</td><td class="num">${moeda(r.encargos.terceiros)}</td></tr>
              <tr class="total"><td>Total da guia de INSS (DCTFWeb)</td><td class="num">${moeda(r.inss + r.encargos.total)}</td></tr>
              <tr><td>Base de FGTS</td><td class="num">${moeda(r.baseFGTS)}</td></tr>
              <tr class="total"><td>FGTS (8%) — FGTS Digital</td><td class="num">${moeda(r.fgts)}</td></tr>
              <tr class="total"><td>IRRF retido</td><td class="num">${moeda(r.irrf)}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
      <div class="cartao">
        <div class="cartao-cabecalho"><div><h3>Totais por verba</h3><p>Código no padrão do eSocial</p></div><a class="botao botao-fantasma botao-sm" href="#/folha/verbas">Catálogo</a></div>
        <div class="cartao-corpo">
          <table class="tabela tabela-compacta">
            <thead><tr><th>Código</th><th>Proventos</th><th class="num col-opcional">Pessoas</th><th class="num">Valor</th></tr></thead>
            <tbody>${proventos.map(linhaVerba).join("")}</tbody>
            <thead><tr><th>Código</th><th>Descontos</th><th class="num col-opcional">Pessoas</th><th class="num">Valor</th></tr></thead>
            <tbody>${descontos.map(linhaVerba).join("")}</tbody>
          </table>
        </div>
      </div>
    </section>`;
}

// ---------------------------------------------------------------- holerites

export async function paginaHolerites() {
  const f = await carregarFolha();
  const termo = cache.busca.trim().toLowerCase();
  const lista = f.holerites.filter((h) => !termo || `${h.colaborador.nome} ${h.colaborador.matricula} ${h.colaborador.cargo ?? ""}`.toLowerCase().includes(termo));
  return `
    ${cabecalhoCompetencia(f, `<input class="filtro-texto" type="search" placeholder="Buscar por nome, matrícula ou cargo" value="${esc(cache.busca)}" data-folha-busca>`)}
    <div class="cartao tabela-cartao">
      <table class="tabela">
        <thead><tr><th>Colaborador</th><th>Vínculo</th><th>Lotação</th><th class="num">Proventos</th><th class="num">Descontos</th><th class="num">Líquido</th><th></th></tr></thead>
        <tbody>
          ${lista.map((h) => `
            <tr class="linha-clicavel" data-folha-holerite="${esc(h.colaborador.matricula)}">
              <td><div class="pessoa">${avatar(h.colaborador.nome, "avatar-sm")}<div><strong>${esc(h.colaborador.nome)}</strong><small>${h.colaborador.cpf ? `CPF ${esc(cpf(h.colaborador.cpf))}` : '<span class="etiqueta e-ambar">CPF pendente</span>'} · ${esc(matricula(h.colaborador.matricula))} · ${esc(h.colaborador.cargo ?? "")}</small></div></div></td>
              <td>${etiqueta(NOME_VINCULO, h.colaborador.vinculo)}</td>
              <td>${esc(nomeLotacao(h.colaborador.lotacao))}</td>
              <td class="num">${moeda(h.proventos)}</td>
              <td class="num">${moeda(h.descontos)}</td>
              <td class="num"><strong>${moeda(h.liquido)}</strong></td>
              <td class="acoes-linha"><button class="botao botao-secundario botao-sm" data-folha-holerite="${esc(h.colaborador.matricula)}">Holerite</button></td>
            </tr>`).join("") || '<tr><td colspan="7" class="vazio">Nenhum colaborador encontrado.</td></tr>'}
        </tbody>
      </table>
    </div>`;
}

const CAMPOS_LANCAMENTO = [
  ["horasExtras50", "Horas extras 50%", "horas"],
  ["horasExtras100", "Horas extras 100%", "horas"],
  ["horasNoturnas", "Horas noturnas", "horas"],
  ["faltasDias", "Faltas", "dias"],
  ["dsrPerdidos", "DSR perdidos", "dias"],
  ["adiantamento", "Adiantamento pago", "R$"],
  ["custoValeTransporte", "Custo do vale-transporte", "R$"],
  ["eConsignado", "Crédito do Trabalhador (eConsignado)", "R$"],
];

function painelHolerite(mat) {
  const h = cache.folha.holerites.find((x) => x.colaborador.matricula === mat);
  if (!h) return;
  const lanc = cache.folha.lancamentos?.[mat] ?? {};
  const podeLancar = sessao.pode("folha", "editar");
  const linhas = (tipo) => h.itens.filter((i) => i.tipo === tipo).map((i) => `
    <tr><td><code>${esc(i.codigo)}</code></td><td>${esc(i.nome)}</td><td class="dica">${esc(i.referencia ?? "")}</td><td class="num">${moeda(i.valor)}</td></tr>`).join("");
  const ir = h.detalhe.irrf;
  const valorCampo = (campo, unidade) => (lanc[campo] == null ? "" : unidade === "R$" ? (lanc[campo] / 100).toFixed(2) : lanc[campo]);

  abrirPainel(`
    <header class="painel-cabecalho">
      ${avatar(h.colaborador.nome, "avatar-lg")}
      <div class="texto"><h2>${esc(h.colaborador.nome)}</h2>
        <p>${h.colaborador.cpf ? `CPF ${esc(cpf(h.colaborador.cpf))} · ` : ""}Matrícula ${esc(matricula(h.colaborador.matricula))} · ${esc(h.colaborador.cargo ?? "")} · ${esc(nomeLotacao(h.colaborador.lotacao))}</p>
        <div class="meta" style="margin-top:8px">${etiqueta(NOME_VINCULO, h.colaborador.vinculo)}<span>${icone("relogio")}Competência ${competenciaTela(h.competencia)}</span></div></div>
      <button class="botao-icone" data-fechar aria-label="Fechar">${icone("fechar")}</button>
    </header>
    <div class="painel-corpo">
      ${h.pendencias.length ? `
      <div class="secao alerta-folha">
        ${icone("cracha")}
        <div><strong>${h.pendencias.map(esc).join(" ")}</strong>
          <p>O CPF é o código da pessoa no Labutar e no eSocial; a matrícula identifica o vínculo.</p>
          ${podeLancar ? `<form class="formulario linha-cpf" id="form-cpf"><input name="cpf" inputmode="numeric" placeholder="000.000.000-00" required aria-label="CPF"><button class="botao botao-primario botao-sm" type="submit">Salvar CPF</button></form>` : ""}
        </div>
      </div>` : ""}
      <div class="secao">
        <h4>Holerite</h4>
        <table class="tabela tabela-compacta holerite">
          <thead><tr><th>Código</th><th>Proventos</th><th>Ref.</th><th class="num">Valor</th></tr></thead>
          <tbody>${linhas("PROVENTO")}</tbody>
          <thead><tr><th>Código</th><th>Descontos</th><th>Ref.</th><th class="num">Valor</th></tr></thead>
          <tbody>${linhas("DESCONTO")}</tbody>
          <tbody>
            <tr class="total"><td></td><td>Total de proventos</td><td></td><td class="num">${moeda(h.proventos)}</td></tr>
            <tr class="total"><td></td><td>Total de descontos</td><td></td><td class="num">${moeda(h.descontos)}</td></tr>
            <tr class="total destaque"><td></td><td>Líquido</td><td></td><td class="num">${moeda(h.liquido)}</td></tr>
          </tbody>
        </table>
      </div>
      <div class="secao">
        <h4>Bases</h4>
        <div class="bases">
          <div><small>Base INSS</small><strong>${moeda(h.bases.inss)}</strong></div>
          <div><small>Base FGTS</small><strong>${moeda(h.bases.fgts)}</strong></div>
          <div><small>FGTS do mês</small><strong>${moeda(h.fgts)}</strong></div>
          <div><small>Base IRRF</small><strong>${moeda(h.bases.irrf)}</strong></div>
        </div>
        <p class="dica">IRRF: ${ir.modo === "DESCONTO_SIMPLIFICADO" ? "desconto simplificado (R$ 607,20) deu menos imposto que as deduções legais" : "deduções legais (INSS e dependentes)"}.
          Imposto pela tabela ${moeda(ir.impostoTabela)}${ir.reducao ? `, redução da Lei 15.270/2025 de ${moeda(ir.reducao)}` : ""} → retido ${moeda(ir.valor)}.
          Valor-hora ${moeda(h.detalhe.valorHora)}; ${h.detalhe.diasDeContrato} dias de contrato no mês.</p>
        ${h.avisos.map((a) => `<p class="dica">${icone("relogio")}${esc(a)}</p>`).join("")}
      </div>
      ${h.convencao ? `
      <div class="secao">
        <h4>Convenção coletiva</h4>
        <div class="bases">
          <div><small>Instrumento</small><strong>${esc(h.convencao.instrumento.tipo)} ${esc(h.convencao.instrumento.registroMTE)}</strong></div>
          <div><small>Função</small><strong>${h.convencao.enquadrada ? esc(h.convencao.funcao) : "Fora da tabela (piso geral)"}</strong></div>
          <div><small>Piso</small><strong>${moeda(h.convencao.piso)}</strong></div>
          <div><small>Custo da empresa</small><strong>${moeda(h.convencao.custos.reduce((s, c) => s + c.valor, 0))}</strong></div>
        </div>
        ${h.convencao.beneficios.length ? `<p class="dica">Benefícios fora do holerite: ${h.convencao.beneficios.map((b) => `${esc(b.nome)} ${moeda(b.valor)}`).join(" · ")}.</p>` : ""}
      </div>` : ""}
      ${podeLancar ? `
      <form class="secao formulario" id="form-lancamentos" data-matricula="${esc(mat)}">
        <h4>Lançamentos do mês</h4>
        <div class="duas">
          ${CAMPOS_LANCAMENTO.map(([campo, rotulo, unidade]) => `
            <div class="campo"><label for="l-${campo}">${rotulo} (${unidade})</label>
              <input id="l-${campo}" name="${campo}" type="number" min="0" step="${unidade === "R$" ? "0.01" : "0.5"}" value="${esc(String(valorCampo(campo, unidade)))}"></div>`).join("")}
        </div>
        <p class="dica">Ao salvar, o holerite é recalculado na hora.</p>
      </form>` : ""}
    </div>
    <footer class="painel-rodape">
      <button class="botao botao-secundario" data-fechar type="button">Fechar</button>
      ${podeLancar ? `<button class="botao botao-primario" type="submit" form="form-lancamentos">${icone("ok")}Salvar e recalcular</button>` : ""}
    </footer>`);

  document.getElementById("form-cpf")?.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    try {
      await api(`/folha/colaboradores/${mat}`, { metodo: "PATCH", corpo: { cpf: new FormData(evento.target).get("cpf") } });
      await carregarFolha({ forcar: true });
      aviso("CPF salvo.");
      cache.aoAlterar?.();
      painelHolerite(mat);
    } catch (erro) {
      aviso(erro.message, "erro");
    }
  });

  document.getElementById("form-lancamentos")?.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const dados = Object.fromEntries(new FormData(evento.target));
    const corpo = {};
    for (const [campo, , unidade] of CAMPOS_LANCAMENTO) {
      if (dados[campo] === "") continue;
      corpo[campo] = unidade === "R$" ? Math.round(Number(dados[campo]) * 100) : Number(dados[campo]);
    }
    try {
      await api(`/folha/${cache.competencia}/lancamentos/${mat}`, { metodo: "PUT", corpo });
      await carregarFolha({ forcar: true });
      aviso("Lançamentos salvos e holerite recalculado.");
      cache.aoAlterar?.();
      painelHolerite(mat);
    } catch (erro) {
      aviso(erro.message, "erro");
    }
  });
}

// ---------------------------------------------------------------- por tomador

export async function paginaFolhaTomadores() {
  const f = await carregarFolha();
  const r = f.resumo;
  const maior = Math.max(1, ...r.porLotacao.map((l) => l.custoTotal));
  return `
    ${cabecalhoCompetencia(f)}
    <div class="cartao tabela-cartao">
      <table class="tabela">
        <thead><tr><th>Lotação</th><th class="num">Colaboradores</th><th class="num">Proventos</th><th class="num">FGTS</th><th class="num">Encargos</th><th class="num col-opcional">Convenção</th><th class="num">Custo total</th><th>Participação</th></tr></thead>
        <tbody>
          ${r.porLotacao.map((l) => `
            <tr>
              <td><div class="pessoa"><span class="indicador-icone pequeno">${icone(l.lotacao.startsWith("TOM:") ? "tomadores" : "pessoas")}</span><div><strong>${esc(nomeLotacao(l.lotacao))}</strong><small>${esc(l.lotacao)}</small></div></div></td>
              <td class="num">${l.colaboradores}</td>
              <td class="num">${moeda(l.proventos)}</td>
              <td class="num">${moeda(l.fgts)}</td>
              <td class="num">${moeda(l.encargos.total)}</td>
              <td class="num col-opcional">${moeda(l.beneficios ?? 0)}</td>
              <td class="num"><strong>${moeda(l.custoTotal)}</strong></td>
              <td><div class="barra"><i style="width:${(l.custoTotal / maior) * 100}%"></i></div></td>
            </tr>`).join("")}
          <tr class="total"><td>Total</td><td class="num">${r.colaboradores}</td><td class="num">${moeda(r.proventos)}</td><td class="num">${moeda(r.fgts)}</td><td class="num">${moeda(r.encargos.total)}</td><td class="num col-opcional">${moeda(r.beneficios ?? 0)}</td><td class="num"><strong>${moeda(r.custoTotal)}</strong></td><td></td></tr>
        </tbody>
      </table>
    </div>
    <p class="dica">Cada tomador é uma lotação no eSocial (S-1020) e a remuneração vai segregada por lotação no S-1200. O custo por tomador é a base da fatura de mão de obra. A coluna Convenção soma os custos da convenção coletiva (vale-refeição, cesta, odontológico, seguro, assistência social e qualificação).</p>`;
}

// ---------------------------------------------------------------- verbas

const NOME_INCIDENCIA_CP = { "00": "Não incide", "11": "Base mensal", "12": "Base do 13º", "31": "Desconto do segurado", "32": "Desconto do segurado no 13º" };
const NOME_INCIDENCIA_FGTS = { "00": "Não incide", "11": "Base mensal", "12": "Base do 13º", "21": "Aviso prévio indenizado", "31": "Desconto do eConsignado" };
const NOME_INCIDENCIA_IR = { true: "Mensal", 13: "Exclusiva do 13º", FERIAS: "Em separado (férias)", false: "Não incide" };

export async function paginaVerbas() {
  if (!cache.parametros) cache.parametros = await api("/folha/parametros");
  const { verbas } = cache.parametros;
  return `
    <div class="barra-filtros"><span class="dica">Código NNNN.VV = natureza da Tabela 03 do eSocial + variante. O mesmo código vai ao eSocial (S-1010), ao holerite e à contabilidade.</span></div>
    <div class="cartao tabela-cartao">
      <table class="tabela">
        <thead><tr><th>Código</th><th>Verba</th><th>Tipo</th><th>INSS</th><th>FGTS</th><th>IRRF</th><th>Natureza</th></tr></thead>
        <tbody>
          ${verbas.map((v) => `
            <tr>
              <td><code>${esc(v.codigo)}</code></td>
              <td><strong>${esc(v.nome)}</strong></td>
              <td>${v.tipo === "PROVENTO" ? '<span class="etiqueta e-verde">Provento</span>' : '<span class="etiqueta e-vermelho">Desconto</span>'}</td>
              <td>${esc(NOME_INCIDENCIA_CP[v.incidencias.inss] ?? v.incidencias.inss)} <small class="dica">(${esc(v.incidencias.inss)})</small></td>
              <td>${esc(NOME_INCIDENCIA_FGTS[v.incidencias.fgts] ?? v.incidencias.fgts)} <small class="dica">(${esc(v.incidencias.fgts)})</small></td>
              <td>${NOME_INCIDENCIA_IR[v.incidencias.irrf]}</td>
              <td>${v.naturezaConferida ? '<span class="etiqueta e-verde">Conferida</span>' : '<span class="etiqueta e-ambar">A conferir</span>'}</td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>`;
}

// ---------------------------------------------------------------- eventos

export function ligarEventosFolha({ aoAlterar }) {
  cache.aoAlterar = aoAlterar;
  document.addEventListener("click", (evento) => {
    const alvo = evento.target.closest("[data-folha-holerite]");
    if (alvo) painelHolerite(alvo.dataset.folhaHolerite);
  });
  document.addEventListener("input", (evento) => {
    if (!evento.target.matches("[data-folha-busca]")) return;
    cache.busca = evento.target.value;
    clearTimeout(cache.timer);
    cache.timer = setTimeout(() => {
      aoAlterar?.();
      const campo = document.querySelector("[data-folha-busca]");
      if (campo) { campo.focus(); campo.setSelectionRange(campo.value.length, campo.value.length); }
    }, 250);
  });
}

export { fecharPainel };
