/**
 * Folha: 13º salário do ano e simulação de rescisão e de férias por colaborador.
 * Todo cálculo é do servidor (packages/folha); as simulações não gravam nada.
 */
import { icone } from "./icones.js";
import { api } from "./sessao.js";
import { esc, moeda, cpf, matricula, data, lerMoeda, avatar, etiqueta, aviso, abrirPainel } from "./ui.js";

const NOME_VINCULO = { TEMPORARIO: ["Temporário", "e-azul"], TERCEIRIZADO: ["Terceirizado", "e-marca"], PROPRIO: ["Próprio", "e-cinza"] };
const ANO_PADRAO = 2026;
const cache = { parcela: 2, decimo: {}, colaboradores: null, motivos: null, matricula: "", resultado: null, aoAlterar: null };

export function limparRescisao() {
  cache.decimo = {};
  cache.colaboradores = null;
  cache.resultado = null;
}

/** Tabela de verbas (proventos, descontos, totais) no mesmo formato do holerite. */
function tabelaVerbas(r) {
  const linhas = (tipo) => r.itens.filter((i) => i.tipo === tipo).map((i) => `
    <tr><td><code>${esc(i.codigo)}</code></td><td>${esc(i.nome)}</td><td class="dica">${esc(i.referencia ?? "")}</td><td class="num">${moeda(i.valor)}</td></tr>`).join("");
  return `
    <table class="tabela tabela-compacta holerite">
      <thead><tr><th>Código</th><th>Proventos</th><th>Ref.</th><th class="num">Valor</th></tr></thead>
      <tbody>${linhas("PROVENTO")}</tbody>
      <thead><tr><th>Código</th><th>Descontos</th><th>Ref.</th><th class="num">Valor</th></tr></thead>
      <tbody>${linhas("DESCONTO") || '<tr><td colspan="4" class="dica">Sem descontos.</td></tr>'}</tbody>
      <tbody>
        <tr class="total"><td></td><td>Total de proventos</td><td></td><td class="num">${moeda(r.proventos)}</td></tr>
        <tr class="total"><td></td><td>Total de descontos</td><td></td><td class="num">${moeda(r.descontos)}</td></tr>
        <tr class="total destaque"><td></td><td>Líquido</td><td></td><td class="num">${moeda(r.liquido)}</td></tr>
      </tbody>
    </table>`;
}

const listaAvisos = (lista = []) => lista.map((a) => `<p class="dica">${icone("relogio")}${esc(a)}</p>`).join("");

// ---------------------------------------------------------------- 13º salário

export async function paginaDecimoTerceiro() {
  const chave = `${ANO_PADRAO}-${cache.parcela}`;
  cache.decimo[chave] ??= await api(`/folha/decimo-terceiro/${ANO_PADRAO}?parcela=${cache.parcela}`);
  const d = cache.decimo[chave];
  const t = d.totais;
  const botao = (p, nome) => `<button class="botao ${cache.parcela === p ? "botao-primario" : "botao-secundario"} botao-sm" data-rf-parcela="${p}">${nome}</button>`;
  return `
    <div class="barra-filtros">
      ${botao(1, "1ª parcela")}${botao(2, "2ª parcela")}
      <span class="dica">13º de ${d.ano} · pagamento até ${data(d.prazo)} · ${d.parcela === 1 ? "metade dos avos do ano, sem INSS e IRRF" : "integral com INSS e IRRF próprios, menos a 1ª parcela"}</span>
    </div>
    <section class="indicadores">
      ${[
        { rotulo: "Colaboradores", valor: t.colaboradores, icone: "pessoas", cor: "var(--marca-500)", fundo: "var(--marca-100)", nota: t.naRescisao ? `+ ${t.naRescisao} com o 13º na rescisão` : "ativos no mês do pagamento" },
        { rotulo: d.parcela === 1 ? "1ª parcela" : "13º integral", valor: moeda(t.proventos), icone: "dinheiro", cor: "var(--azul)", fundo: "var(--azul-bg)", nota: `descontos ${moeda(t.descontos)}` },
        { rotulo: "Líquido a pagar", valor: moeda(t.liquido), icone: "ok", cor: "var(--verde)", fundo: "var(--verde-bg)", nota: `até ${data(d.prazo)}` },
        { rotulo: "FGTS", valor: moeda(t.fgts), icone: "financeiro", cor: "var(--ambar)", fundo: "var(--ambar-bg)", nota: "depósito do mês" },
      ].map((i) => `
        <div class="cartao indicador">
          <span class="indicador-icone" style="color:${i.cor};background:${i.fundo}">${icone(i.icone)}</span>
          <div><small>${i.rotulo}</small><strong>${i.valor}</strong><span class="dica">${esc(i.nota)}</span></div>
        </div>`).join("")}
    </section>
    <div class="cartao tabela-cartao">
      <table class="tabela">
        <thead><tr><th>Colaborador</th><th>Vínculo</th><th class="num">Avos</th><th class="num col-opcional">Remuneração</th><th class="num">Bruto</th><th class="num col-opcional">Descontos</th><th class="num">Líquido</th></tr></thead>
        <tbody>
          ${d.itens.map((i) => `
            <tr class="linha-clicavel${i.naRescisao ? " linha-apagada" : ""}" data-rf-decimo="${esc(i.matricula)}">
              <td><div class="pessoa">${avatar(i.nome, "avatar-sm")}<div><strong>${esc(i.nome)}</strong><small>${i.cpf ? `CPF ${esc(cpf(i.cpf))}` : '<span class="etiqueta e-ambar">CPF pendente</span>'} · ${esc(matricula(i.matricula))}</small>
                ${i.naRescisao ? `<small class="dica" style="display:block">Contrato até ${data(i.fimPrevisto)}: o 13º vai na rescisão, fora dos totais.</small>` : ""}</div></div></td>
              <td>${etiqueta(NOME_VINCULO, i.vinculo)}</td>
              <td class="num">${i.avos}/12</td>
              <td class="num col-opcional">${moeda(i.base)}</td>
              <td class="num">${moeda(i.proventos)}</td>
              <td class="num col-opcional">${moeda(i.descontos)}</td>
              <td class="num"><strong>${moeda(i.liquido)}</strong></td>
            </tr>`).join("") || '<tr><td colspan="7" class="vazio">Nenhum colaborador ativo.</td></tr>'}
        </tbody>
      </table>
    </div>`;
}

function painelDecimo(mat) {
  const d = cache.decimo[`${ANO_PADRAO}-${cache.parcela}`];
  const i = d?.itens.find((x) => x.matricula === mat);
  if (!i) return;
  abrirPainel(`
    <header class="painel-cabecalho">
      ${avatar(i.nome, "avatar-lg")}
      <div class="texto"><h2>${esc(i.nome)}</h2>
        <p>Matrícula ${esc(matricula(i.matricula))} · ${i.avos}/12 avos · remuneração ${moeda(i.base)}</p>
        <div class="meta" style="margin-top:8px">${etiqueta(NOME_VINCULO, i.vinculo)}<span>${icone("relogio")}${d.parcela}ª parcela do 13º de ${d.ano}</span></div></div>
      <button class="botao-icone" data-fechar aria-label="Fechar">${icone("fechar")}</button>
    </header>
    <div class="painel-corpo"><div class="secao"><h4>Recibo</h4>${tabelaVerbas(i)}</div>
      <div class="secao"><h4>FGTS</h4><div class="bases"><div><small>Depósito</small><strong>${moeda(i.fgts)}</strong></div><div><small>Prazo de pagamento</small><strong>${data(d.prazo)}</strong></div></div></div>
    </div>
    <footer class="painel-rodape"><button class="botao botao-secundario" data-fechar type="button">Fechar</button></footer>`);
}

// ---------------------------------------------------------------- rescisão e férias

export async function paginaRescisaoFerias() {
  cache.colaboradores ??= await api("/colaboradores");
  cache.motivos ??= await api("/folha/rescisao/motivos");
  const ativos = cache.colaboradores.itens.filter((v) => !v.desligamento);
  if (!cache.matricula || !ativos.some((v) => v.matricula === cache.matricula)) cache.matricula = ativos[0]?.matricula ?? "";
  const atual = ativos.find((v) => v.matricula === cache.matricula);
  const r = cache.resultado;
  return `
    <div class="barra-filtros">
      <label class="dica" for="rf-colaborador">Colaborador</label>
      <select id="rf-colaborador" class="filtro-texto" data-rf-colaborador>
        ${ativos.map((v) => `<option value="${esc(v.matricula)}" ${v.matricula === cache.matricula ? "selected" : ""}>${esc(v.pessoa?.nome)} · ${esc(matricula(v.matricula))}</option>`).join("")}
      </select>
      ${atual ? `<span class="dica">${etiqueta(NOME_VINCULO, atual.tipo)} admissão ${data(atual.admissao)} · ${moeda(atual.salario)}</span>` : ""}
    </div>
    <div class="grade-folha">
      <form class="cartao" id="form-rf-rescisao">
        <div class="cartao-cabecalho"><div><h3>Rescisão</h3><p class="dica">Simulação: nada é gravado.</p></div></div>
        <div class="cartao-corpo formulario">
          <div class="duas">
            <div class="campo"><label for="rf-desligamento">Último dia trabalhado</label><input id="rf-desligamento" name="desligamento" type="date" value="2026-09-30" required></div>
            <div class="campo"><label for="rf-saldo">Saldo do FGTS para a multa (R$)</label><input id="rf-saldo" name="saldoFGTS" inputmode="decimal" placeholder="0,00"></div>
          </div>
          <div class="campo"><label for="rf-motivo">Motivo (Tabela 19 do eSocial)</label>
            <select id="rf-motivo" name="motivo">${cache.motivos.map((m) => `<option value="${m.codigo}" ${m.codigo === (atual?.tipo === "TEMPORARIO" ? "06" : "02") ? "selected" : ""}>${m.codigo} · ${esc(m.nome)}</option>`).join("")}</select></div>
          <label class="opcao-marcar"><input type="checkbox" name="avisoIndenizado" checked> Aviso prévio indenizado (quando o motivo tem aviso do empregador)</label>
          <label class="opcao-marcar"><input type="checkbox" name="avisoNaoCumprido"> Pedido de demissão sem cumprir o aviso</label>
          <button class="botao botao-primario" type="submit">${icone("ok")}Calcular rescisão</button>
        </div>
      </form>
      <form class="cartao" id="form-rf-ferias">
        <div class="cartao-cabecalho"><div><h3>Férias</h3><p class="dica">Período aquisitivo mais antigo em aberto.</p></div></div>
        <div class="cartao-corpo formulario">
          <div class="duas">
            <div class="campo"><label for="rf-inicio">Início do gozo</label><input id="rf-inicio" name="inicio" type="date" value="2026-11-09" required></div>
            <div class="campo"><label for="rf-dias">Dias de gozo</label><input id="rf-dias" name="dias" type="number" min="5" max="30" value="30" required></div>
          </div>
          <div class="campo"><label for="rf-abono">Abono pecuniário (dias vendidos, até 10)</label><input id="rf-abono" name="abonoDias" type="number" min="0" max="10" value="0"></div>
          <button class="botao botao-primario" type="submit">${icone("ok")}Calcular férias</button>
        </div>
      </form>
    </div>
    ${r ? resultadoHtml(r) : ""}`;
}

function resultadoHtml(r) {
  if (r.tipo === "rescisao") {
    const d = r.dados;
    return `
      <div class="cartao" style="margin-top:16px">
        <div class="cartao-cabecalho"><div><h3>Rescisão · ${esc(d.motivo.codigo)} ${esc(d.motivo.nome)}</h3>
          <p class="dica">Desligamento em ${data(d.desligamento)}${d.aviso.indenizado ? ` · aviso de ${d.aviso.dias} dias indenizado, projeção até ${data(d.aviso.fimProjetado)}` : ""} · pagamento até ${data(d.prazoPagamento)}</p></div></div>
        <div class="cartao-corpo">
          ${tabelaVerbas(d)}
          <div class="bases" style="margin-top:16px">
            <div><small>Base INSS</small><strong>${moeda(d.bases.inss)}</strong></div>
            <div><small>Base INSS 13º</small><strong>${moeda(d.bases.inss13)}</strong></div>
            <div><small>FGTS do mês</small><strong>${moeda(d.fgts.mes)}</strong></div>
            <div><small>Multa do FGTS (${d.fgts.multaPercentual}%)</small><strong>${moeda(d.fgts.multa)}</strong></div>
          </div>
          <p class="dica">eSocial: ${esc(d.esocial.evento)} com motivo ${esc(d.esocial.mtvDeslig)}${d.esocial.dtProjFimAPI ? ` e projeção do aviso até ${data(d.esocial.dtProjFimAPI)}` : ""}. Saque do FGTS: ${d.fgts.saque ? `${d.fgts.saque}%` : "não"}. A multa vai na guia do FGTS Digital, não no termo.</p>
          ${listaAvisos(d.avisos)}
        </div>
      </div>`;
  }
  const { periodo, programacao: p, recibo } = r.dados;
  return `
    <div class="cartao" style="margin-top:16px">
      <div class="cartao-cabecalho"><div><h3>Férias de ${data(recibo.inicio)} a ${data(recibo.fim)}</h3>
        <p class="dica">Período aquisitivo ${data(periodo.inicio)} a ${data(periodo.fim)} · concessivo até ${data(periodo.fimConcessivo)} · pagamento até ${data(recibo.prazoPagamento)} · direito de ${p.direito} dias</p></div></div>
      <div class="cartao-corpo">
        ${p.erros.length ? `<div class="secao alerta-folha">${icone("cadeado")}<div><strong>Programação fora das regras</strong>${p.erros.map((e) => `<p>${esc(e)}</p>`).join("")}</div></div>` : ""}
        ${tabelaVerbas(recibo)}
        <div class="bases" style="margin-top:16px">
          <div><small>Base INSS</small><strong>${moeda(recibo.bases.inss)}</strong></div>
          <div><small>Base IRRF</small><strong>${moeda(recibo.bases.irrf)}</strong></div>
          <div><small>FGTS</small><strong>${moeda(recibo.fgts)}</strong></div>
          <div><small>Por mês de gozo</small><strong>${recibo.porCompetencia.map((c) => `${c.competencia.slice(5, 7)}/${c.competencia.slice(0, 4)}: ${c.dias} dias`).join(" · ")}</strong></div>
        </div>
        ${listaAvisos(p.avisos)}
      </div>
    </div>`;
}

// ---------------------------------------------------------------- eventos

export function ligarEventosRescisao({ aoAlterar }) {
  cache.aoAlterar = aoAlterar;
  document.addEventListener("click", (evento) => {
    const parcela = evento.target.closest("[data-rf-parcela]");
    if (parcela) {
      cache.parcela = Number(parcela.dataset.rfParcela);
      aoAlterar?.();
      return;
    }
    const linha = evento.target.closest("[data-rf-decimo]");
    if (linha) painelDecimo(linha.dataset.rfDecimo);
  });
  document.addEventListener("change", (evento) => {
    if (!evento.target.matches("[data-rf-colaborador]")) return;
    cache.matricula = evento.target.value;
    cache.resultado = null;
    aoAlterar?.();
  });
  document.addEventListener("submit", async (evento) => {
    const form = evento.target;
    if (form.id !== "form-rf-rescisao" && form.id !== "form-rf-ferias") return;
    evento.preventDefault();
    const f = Object.fromEntries(new FormData(form));
    try {
      if (form.id === "form-rf-rescisao") {
        const dados = await api("/folha/rescisao/simular", { metodo: "POST", corpo: {
          matricula: cache.matricula, desligamento: f.desligamento, motivo: f.motivo,
          avisoIndenizado: f.avisoIndenizado === "on", avisoNaoCumprido: f.avisoNaoCumprido === "on",
          saldoFGTS: f.saldoFGTS ? lerMoeda(f.saldoFGTS) : 0,
        } });
        cache.resultado = { tipo: "rescisao", dados };
      } else {
        const dados = await api("/folha/ferias/simular", { metodo: "POST", corpo: { matricula: cache.matricula, inicio: f.inicio, dias: Number(f.dias), abonoDias: Number(f.abonoDias || 0) } });
        cache.resultado = { tipo: "ferias", dados };
      }
      await aoAlterar?.();
      document.querySelector(".cartao:last-child")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (erro) { aviso(erro.message, "erro"); }
  });
}
