/**
 * Centro de custos: resultado por contrato (Financeiro), lançamentos de custo e itens (Financeiro
 * e Estoque) e rateio de colaboradores próprios entre contratos (preposto, supervisão).
 * O cálculo é do servidor (packages/custos); a tela só mostra e envia.
 */
import { icone } from "./icones.js";
import { api, sessao } from "./sessao.js";
import { esc, moeda, moedaParaCampo, lerMoeda, matricula, data, avatar, etiqueta, aviso, abrirPainel, fecharPainel } from "./ui.js";
import { COMPETENCIA_PADRAO } from "./folha-telas.js";

const cache = { resultado: null, criterio: "COLABORADORES", tipos: null, itens: null, lancamentos: null, colaboradores: null, aoAlterar: null };
const NOME_CONTRATO = { TRABALHO_TEMPORARIO: ["Temporário", "e-azul"], PRESTACAO_SERVICOS: ["Serviços", "e-marca"] };
const NOME_MODALIDADE = { POR_COLABORADOR: "Valor por colaborador", TAXA_SOBRE_CUSTO: "Custo da mão de obra + taxa", VALOR_FIXO: "Valor fixo mensal" };
const competenciaTela = (c) => `${c.slice(5, 7)}/${c.slice(0, 4)}`;
const pct = (n) => (n == null ? "—" : `${String(n).replace(".", ",")}%`);
const sinal = (v) => (v < 0 ? "valor-negativo" : "valor-positivo");

export function limparCustos() {
  Object.assign(cache, { resultado: null, tipos: null, itens: null, lancamentos: null, colaboradores: null });
}

async function tipos() {
  cache.tipos ??= await api("/custos/tipos");
  return cache.tipos;
}
const nomeTipo = (id) => cache.tipos?.tipos.find((t) => t.id === id)?.nome ?? id;

// ---------------------------------------------------------------- resultado por contrato

export async function paginaResultado() {
  await tipos();
  cache.resultado ??= await api(`/custos/resultado/${COMPETENCIA_PADRAO}?criterio=${cache.criterio}`);
  const r = cache.resultado;
  const t = r.totais;
  const botao = (c, nome) => `<button class="botao ${cache.criterio === c ? "botao-primario" : "botao-secundario"} botao-sm" data-custo-criterio="${c}">${nome}</button>`;
  const indicadores = [
    { rotulo: "Receita", valor: moeda(t.receita), icone: "dinheiro", cor: "var(--azul)", fundo: "var(--azul-bg)", nota: `tributos ${moeda(t.tributos)} (${pct(r.tributosPercentual)})` },
    { rotulo: "Custo total", valor: moeda(t.custo), icone: "financeiro", cor: "var(--ambar)", fundo: "var(--ambar-bg)", nota: `${t.colaboradores} colaboradores em ${t.contratos} contratos` },
    { rotulo: "Margem de contribuição", valor: moeda(t.margemContribuicao), icone: "ok", cor: "var(--verde)", fundo: "var(--verde-bg)", nota: "antes da estrutura (indiretos)" },
    { rotulo: "Resultado", valor: moeda(t.resultado), icone: "alvo", cor: t.resultado < 0 ? "var(--vermelho)" : "var(--verde)", fundo: t.resultado < 0 ? "var(--vermelho-bg)" : "var(--verde-bg)", nota: `margem ${pct(t.margem)} · ${t.prejuizo} com prejuízo` },
  ];
  return `
    <div class="barra-filtros">
      <span class="etiqueta sem-ponto e-marca">${icone("relogio")}Competência ${competenciaTela(r.competencia)}</span>
      <span class="dica">Rateio dos indiretos:</span>${botao("COLABORADORES", "por colaboradores")}${botao("CUSTO_DIRETO", "por custo direto")}
    </div>
    <section class="indicadores">
      ${indicadores.map((i) => `
        <div class="cartao indicador">
          <span class="indicador-icone" style="color:${i.cor};background:${i.fundo}">${icone(i.icone)}</span>
          <div><small>${i.rotulo}</small><strong>${i.valor}</strong><span class="dica">${esc(i.nota)}</span></div>
        </div>`).join("")}
    </section>
    <div class="cartao tabela-cartao">
      <table class="tabela">
        <thead><tr><th>Contrato</th><th class="num">Colab.</th><th class="num">Receita</th><th class="num col-opcional">Custo direto</th><th class="num col-opcional">Indiretos</th><th class="num">Contribuição</th><th class="num">Resultado</th><th class="num">Margem</th></tr></thead>
        <tbody>
          ${r.contratos.map((c) => `
            <tr class="linha-clicavel" data-custo-contrato="${esc(c.contratoId)}">
              <td><div class="pessoa"><span class="indicador-icone pequeno">${icone("tomadores")}</span><div><strong>${esc(c.tomador)}</strong><small>${etiqueta(NOME_CONTRATO, c.tipoContrato)} ${c.faturamento ? esc(NOME_MODALIDADE[c.faturamento.modalidade]) : '<span class="etiqueta e-ambar">sem preço</span>'}</small></div></div></td>
              <td class="num">${c.colaboradores}</td>
              <td class="num">${moeda(c.receita)}</td>
              <td class="num col-opcional">${moeda(c.custoDireto)}</td>
              <td class="num col-opcional">${moeda(c.custos.indiretos)}</td>
              <td class="num ${sinal(c.margemContribuicao)}">${moeda(c.margemContribuicao)}</td>
              <td class="num ${sinal(c.resultado)}"><strong>${moeda(c.resultado)}</strong></td>
              <td class="num">${c.margem == null ? "—" : `<span class="etiqueta ${c.margem < 0 ? "e-vermelho" : c.margem < 10 ? "e-ambar" : "e-verde"}">${pct(c.margem)}</span>`}</td>
            </tr>`).join("") || '<tr><td colspan="8" class="vazio">Nenhum contrato em vigência na competência.</td></tr>'}
        </tbody>
      </table>
    </div>
    <div class="cartao" style="margin-top:18px">
      <div class="cartao-cabecalho"><div><h3>Custos indiretos (estrutura)</h3><p class="dica">${moeda(r.indiretos.total)} rateados entre os contratos ${cache.criterio === "COLABORADORES" ? "pelo número de colaboradores" : "pelo custo direto"}. Próprio que atende contratos (preposto, supervisor) sai daqui pelo rateio.</p></div>
        ${sessao.pode("financeiro", "editar") ? `<a class="botao botao-secundario botao-sm" href="#/financeiro/rateio">${icone("pessoas")}Rateio de próprios</a>` : ""}</div>
      <div class="cartao-corpo"><table class="tabela tabela-compacta"><tbody>
        ${r.indiretos.itens.map((i) => `<tr><td>${esc(i.descricao)}</td><td class="num">${moeda(i.valor)}</td></tr>`).join("") || '<tr><td class="dica">Sem custos indiretos.</td></tr>'}
      </tbody></table></div>
    </div>
    <p class="dica">Custo do contrato = folha de quem trabalha nele (proventos sem salário-família, encargos e FGTS) + provisões de 13º e férias + benefícios da convenção + preposto + custos lançados (uniforme, EPI, crachá, exames…) + parte da estrutura. Tributos sobre a receita pelo percentual da empresa (conferir com a contabilidade).</p>`;
}

function linhaCusto(nome, valor, total) {
  const p = total ? Math.round((valor / total) * 1000) / 10 : 0;
  return `<tr><td>${esc(nome)}</td><td class="num">${moeda(valor)}</td><td class="num col-opcional">${pct(p)}</td></tr>`;
}

function painelContrato(id) {
  const c = cache.resultado?.contratos.find((x) => x.contratoId === id);
  if (!c) return;
  const k = c.custos;
  const composicao = [
    ["Salários e adicionais", k.pessoal], ["Encargos e FGTS", k.encargos], ["Provisões (13º, férias e encargos)", k.provisoes],
    ["Benefícios da convenção", k.beneficios], ["Salário do preposto/supervisor próprio (rateio)", k.supervisao],
    ...Object.entries(k.lancados).map(([t, v]) => [nomeTipo(t), v]), ["Estrutura (indiretos rateados)", k.indiretos],
  ].filter(([, v]) => v);
  const f = c.faturamento ?? {};
  const eq = c.equilibrio ?? {};
  const pode = sessao.pode("financeiro", "editar");
  abrirPainel(`
    <header class="painel-cabecalho">
      <span class="indicador-icone" style="color:var(--marca-500);background:var(--marca-100)">${icone("tomadores")}</span>
      <div class="texto"><h2>${esc(c.tomador)}</h2><p>${esc(c.contratoId)} · ${c.colaboradores} colaboradores · competência ${competenciaTela(cache.resultado.competencia)}</p>
        <div class="meta" style="margin-top:8px">${etiqueta(NOME_CONTRATO, c.tipoContrato)}${c.margem != null ? `<span class="etiqueta ${c.margem < 0 ? "e-vermelho" : "e-verde"}">margem ${pct(c.margem)}</span>` : ""}</div></div>
      <button class="botao-icone" data-fechar aria-label="Fechar">${icone("fechar")}</button>
    </header>
    <div class="painel-corpo">
      ${c.alertas.length ? `<div class="secao alerta-folha">${icone("relogio")}<div>${c.alertas.map((a) => `<p>${esc(a)}</p>`).join("")}</div></div>` : ""}
      <div class="secao"><h4>Resultado</h4>
        <div class="bases">
          <div><small>Receita</small><strong>${moeda(c.receita)}</strong></div>
          <div><small>Tributos</small><strong>${moeda(c.tributos)}</strong></div>
          <div><small>Margem de contribuição</small><strong class="${sinal(c.margemContribuicao)}">${moeda(c.margemContribuicao)}</strong></div>
          <div><small>Resultado</small><strong class="${sinal(c.resultado)}">${moeda(c.resultado)}</strong></div>
          <div><small>Custo por colaborador</small><strong>${moeda(c.custoPorColaborador)}</strong></div>
          <div><small>Ponto de equilíbrio</small><strong>${eq.valorPorColaborador ? `${moeda(eq.valorPorColaborador)} por colaborador` : eq.taxaPercentual != null ? `taxa de ${pct(eq.taxaPercentual)}` : `receita de ${moeda(eq.receita)}`}</strong></div>
        </div>
      </div>
      <div class="secao"><h4>Composição do custo</h4>
        <table class="tabela tabela-compacta"><thead><tr><th>Custo</th><th class="num">Valor</th><th class="num col-opcional">%</th></tr></thead><tbody>
          ${composicao.map(([n, v]) => linhaCusto(n, v, c.custoTotal)).join("")}
          <tr class="total"><td>Total</td><td class="num">${moeda(c.custoTotal)}</td><td class="col-opcional"></td></tr>
        </tbody></table>
      </div>
      <form class="secao formulario" id="form-faturamento">
        <h4>Preço do contrato</h4>
        <div class="duas">
          <div class="campo"><label for="f-mod">Modalidade</label><select id="f-mod" name="modalidade" ${pode ? "" : "disabled"}>
            ${Object.entries(NOME_MODALIDADE).map(([id, n]) => `<option value="${id}" ${f.modalidade === id ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></div>
          <div class="campo"><label for="f-val" data-rotulo-valor>${f.modalidade === "TAXA_SOBRE_CUSTO" ? "Taxa de administração (%)" : "Valor (R$)"}</label>
            <input id="f-val" name="valor" inputmode="decimal" value="${f.modalidade === "TAXA_SOBRE_CUSTO" ? String(f.taxaPercentual ?? "").replace(".", ",") : moedaParaCampo(f.valor)}" ${pode ? "" : "disabled"}></div>
        </div>
        ${pode ? `<button class="botao botao-secundario" type="submit">${icone("ok")}Salvar preço</button>` : ""}
      </form>
      <div class="secao"><h4>Colaboradores e preposto</h4>
        <table class="tabela tabela-compacta"><tbody>${c.detalhe.colaboradores.map((x) => `<tr><td>${esc(x.nome)} <small class="dica">${esc(matricula(x.matricula))} · ${esc(x.cargo ?? "")}${x.rateio ? " · rateio" : ""}</small></td><td class="num">${moeda(x.custo)}</td></tr>`).join("") || '<tr><td class="dica">Ninguém alocado.</td></tr>'}</tbody></table>
      </div>
      <div class="secao"><h4>Custos lançados no mês</h4>
        <table class="tabela tabela-compacta"><tbody>${c.detalhe.lancamentos.map((l) => `<tr><td>${data(l.data)}</td><td>${esc(nomeTipo(l.tipo))}: ${esc(l.descricao)}</td><td class="num">${moeda(l.valor)}</td></tr>`).join("") || '<tr><td class="dica">Nenhum custo lançado.</td></tr>'}</tbody></table>
      </div>
    </div>
    <footer class="painel-rodape"><button class="botao botao-secundario" data-fechar type="button">Fechar</button></footer>`);
  const form = document.getElementById("form-faturamento");
  form.modalidade.addEventListener("change", () => {
    form.querySelector("[data-rotulo-valor]").textContent = form.modalidade.value === "TAXA_SOBRE_CUSTO" ? "Taxa de administração (%)" : "Valor (R$)";
    form.valor.value = "";
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const modalidade = form.modalidade.value;
    const corpo = modalidade === "TAXA_SOBRE_CUSTO" ? { modalidade, taxaPercentual: Number(form.valor.value.replace(",", ".")) } : { modalidade, valor: lerMoeda(form.valor.value) };
    try {
      await api(`/contratos/${encodeURIComponent(id)}/faturamento`, { metodo: "PATCH", corpo });
      aviso("Preço salvo.");
      cache.resultado = null;
      await cache.aoAlterar?.();
      painelContrato(id);
    } catch (erro) { aviso(erro.message, "erro"); }
  });
}

// ---------------------------------------------------------------- lançamentos de custo

/** Todos os vínculos (para mostrar o nome no destino); a escolha de destino usa só os ativos. */
async function colaboradores() {
  cache.colaboradores ??= (await api("/colaboradores")).itens;
  return cache.colaboradores;
}

export async function paginaLancamentos() {
  const [t, itens, lista, colabs, tomadores] = await Promise.all([
    tipos(), cache.itens ?? api("/custos/itens"), cache.lancamentos ?? api(`/custos/lancamentos?competencia=${COMPETENCIA_PADRAO}`), colaboradores(), api("/tomadores"),
  ]);
  cache.itens = itens;
  cache.lancamentos = lista;
  const contratos = (await Promise.all(tomadores.map((x) => api(`/tomadores/${x.id}`)))).flatMap((x) => x.contratos.map((c) => ({ id: c.id, nome: `${x.nomeFantasia || x.razaoSocial} · ${c.tipo === "TRABALHO_TEMPORARIO" ? "temporário" : "serviços"}` })));
  cache.contratos = contratos;
  const podeCriar = sessao.pode("financeiro", "criar") || sessao.pode("estoque", "criar");
  const podeExcluir = sessao.pode("financeiro", "excluir") || sessao.pode("estoque", "excluir");
  const total = lista.reduce((s, l) => s + l.valor, 0);
  const destino = (d) => d.tipo === "COLABORADOR" ? `${esc(colabs.find((v) => v.matricula === d.matricula)?.pessoa?.nome ?? d.matricula)} <small class="dica">${esc(matricula(d.matricula))}</small>`
    : d.tipo === "CONTRATO" ? esc(contratos.find((c) => c.id === d.contratoId)?.nome ?? d.contratoId)
      : d.contratoIds ? `Rateio: ${d.contratoIds.map((id) => esc(contratos.find((c) => c.id === id)?.nome ?? id)).join(", ")}` : "Estrutura (rateio entre todos)";
  return `
    ${podeCriar ? `
    <form class="cartao" id="form-custo">
      <div class="cartao-cabecalho"><div><h3>Lançar custo</h3><p class="dica">Entrega ao colaborador vai para o contrato em que ele trabalha; despesa do contrato vai direto; o resto é rateado.</p></div></div>
      <div class="cartao-corpo formulario">
        <div class="duas">
          <div class="campo"><label for="l-item">Item do catálogo</label><select id="l-item" name="itemId"><option value="">Outro (informar abaixo)</option>
            ${itens.map((i) => `<option value="${esc(i.id)}" data-preco="${i.custoUnitario}" data-tipo="${esc(i.tipo)}">${esc(i.nome)} · ${moeda(i.custoUnitario)}${i.amortizarMeses > 1 ? ` (${i.amortizarMeses} meses)` : ""}</option>`).join("")}</select></div>
          <div class="campo"><label for="l-data">Data</label><input id="l-data" name="data" type="date" value="${COMPETENCIA_PADRAO}-30" required></div>
        </div>
        <div class="duas" data-custo-manual>
          <div class="campo"><label for="l-tipo">Tipo</label><select id="l-tipo" name="tipo">${t.tipos.map((x) => `<option value="${x.id}">${esc(x.nome)}</option>`).join("")}</select></div>
          <div class="campo"><label for="l-desc">Descrição</label><input id="l-desc" name="descricao" placeholder="Ex.: visita do preposto, carrinho de limpeza"></div>
        </div>
        <div class="duas">
          <div class="campo"><label for="l-qtd">Quantidade</label><input id="l-qtd" name="quantidade" type="number" min="1" value="1" required></div>
          <div class="campo"><label for="l-valor">Custo unitário (R$)</label><input id="l-valor" name="custoUnitario" inputmode="decimal" placeholder="Vem do catálogo"></div>
        </div>
        <div class="duas">
          <div class="campo"><label for="l-dest">Destino</label><select id="l-dest" name="destino">
            <option value="COLABORADOR">Colaborador (entrega, exame)</option><option value="CONTRATO">Contrato (despesa do tomador)</option><option value="RATEIO">Estrutura (rateio entre todos)</option></select></div>
          <div class="campo" data-dest="COLABORADOR"><label for="l-colab">Colaborador</label><select id="l-colab" name="matricula">${colabs.filter((v) => !v.desligamento).map((v) => `<option value="${esc(v.matricula)}">${esc(v.pessoa?.nome)} · ${esc(matricula(v.matricula))}</option>`).join("")}</select></div>
          <div class="campo" data-dest="CONTRATO" hidden><label for="l-ctr">Contrato</label><select id="l-ctr" name="contratoId">${contratos.map((c) => `<option value="${esc(c.id)}">${esc(c.nome)}</option>`).join("")}</select></div>
        </div>
        <div><button class="botao botao-primario" type="submit">${icone("ok")}Lançar custo</button></div>
      </div>
    </form>` : ""}
    <div class="cartao tabela-cartao" style="margin-top:18px">
      <div class="cartao-cabecalho"><div><h3>Custos lançados em ${competenciaTela(COMPETENCIA_PADRAO)}</h3><p class="dica">${lista.length} lançamentos · ${moeda(total)} (material amortizado entra aos poucos no resultado)</p></div></div>
      <table class="tabela">
        <thead><tr><th>Data</th><th>Custo</th><th>Destino</th><th class="num">Qtd.</th><th class="num">Valor</th><th></th></tr></thead>
        <tbody>${lista.map((l) => `
          <tr>
            <td>${data(l.data)}</td>
            <td><strong>${esc(l.descricao)}</strong><small class="dica" style="display:block">${esc(nomeTipo(l.tipo))}${l.amortizarMeses > 1 ? ` · amortizado em ${l.amortizarMeses} meses` : ""}${l.origem === "ADMISSAO" ? " · kit de admissão" : ""}</small></td>
            <td>${destino(l.destino)}</td>
            <td class="num">${l.quantidade}</td>
            <td class="num">${moeda(l.valor)}</td>
            <td class="acoes-linha">${podeExcluir ? `<button class="botao botao-secundario botao-sm" data-custo-excluir="${esc(l.id)}">Excluir</button>` : ""}</td>
          </tr>`).join("") || '<tr><td colspan="6" class="vazio">Nenhum custo lançado na competência.</td></tr>'}</tbody>
      </table>
    </div>`;
}

// ---------------------------------------------------------------- itens de custo

export async function paginaItens() {
  const [t, itens] = await Promise.all([tipos(), cache.itens ?? api("/custos/itens")]);
  cache.itens = itens;
  const podeCriar = sessao.pode("financeiro", "criar") || sessao.pode("estoque", "criar");
  return `
    <div class="cartao tabela-cartao">
      <table class="tabela">
        <thead><tr><th>Item</th><th>Tipo</th><th class="num">Custo unitário</th><th class="num">Amortização</th></tr></thead>
        <tbody>${itens.map((i) => `<tr><td><strong>${esc(i.nome)}</strong></td><td>${esc(nomeTipo(i.tipo))}</td><td class="num">${moeda(i.custoUnitario)}</td><td class="num">${i.amortizarMeses > 1 ? `${i.amortizarMeses} meses` : "no mês"}</td></tr>`).join("")}</tbody>
      </table>
    </div>
    ${podeCriar ? `
    <form class="cartao" id="form-item-custo" style="margin-top:18px">
      <div class="cartao-cabecalho"><div><h3>Novo item</h3><p class="dica">Material de vida útil longa (uniforme, bota) pode ser amortizado: o custo entra no contrato em parcelas mensais.</p></div></div>
      <div class="cartao-corpo formulario">
        <div class="duas">
          <div class="campo"><label for="i-nome">Nome</label><input id="i-nome" name="nome" required placeholder="Ex.: Óculos de proteção"></div>
          <div class="campo"><label for="i-tipo">Tipo</label><select id="i-tipo" name="tipo">${t.tipos.map((x) => `<option value="${x.id}">${esc(x.nome)}</option>`).join("")}</select></div>
        </div>
        <div class="duas">
          <div class="campo"><label for="i-valor">Custo unitário (R$)</label><input id="i-valor" name="custoUnitario" inputmode="decimal" required></div>
          <div class="campo"><label for="i-meses">Amortizar em (meses)</label><input id="i-meses" name="amortizarMeses" type="number" min="1" max="60" value="1"></div>
        </div>
        <div><button class="botao botao-primario" type="submit">${icone("ok")}Salvar item</button></div>
      </div>
    </form>` : ""}`;
}

// ---------------------------------------------------------------- rateio de próprios

export async function paginaRateio() {
  const [colabs, tomadores] = await Promise.all([colaboradores(), api("/tomadores")]);
  const contratos = (await Promise.all(tomadores.map((x) => api(`/tomadores/${x.id}`)))).flatMap((x) => x.contratos.map((c) => ({ id: c.id, nome: `${x.nomeFantasia || x.razaoSocial} · ${c.tipo === "TRABALHO_TEMPORARIO" ? "temporário" : "serviços"}` })));
  const proprios = colabs.filter((v) => !v.postoId && !v.desligamento);
  const pode = sessao.pode("financeiro", "editar");
  return `
    <div class="barra-filtros"><span class="dica">Colaborador próprio sem rateio é estrutura (indireto). Com rateio, o custo dele (salário, encargos, provisões e benefícios) vai para os contratos que ele atende — preposto, supervisor, técnico de segurança.</span></div>
    <div class="grade-folha">
      ${proprios.map((v) => `
        <form class="cartao" data-form-rateio="${esc(v.matricula)}">
          <div class="cartao-cabecalho"><div class="pessoa">${avatar(v.pessoa?.nome, "avatar-sm")}<div><strong>${esc(v.pessoa?.nome)}</strong><small>${esc(v.cargo ?? "")} · ${esc(matricula(v.matricula))}</small></div></div>
            ${v.rateioContratos?.length ? '<span class="etiqueta e-verde">Rateado</span>' : '<span class="etiqueta e-cinza">Estrutura</span>'}</div>
          <div class="cartao-corpo formulario">
            ${contratos.map((c) => {
              const atual = v.rateioContratos?.find((x) => x.contratoId === c.id)?.percentual ?? "";
              return `<div class="duas"><div class="campo"><label>${esc(c.nome)}</label></div><div class="campo"><input name="${esc(c.id)}" type="number" min="0" max="100" step="0.01" value="${atual}" placeholder="%" aria-label="Percentual em ${esc(c.nome)}" ${pode ? "" : "disabled"}></div></div>`;
            }).join("")}
            ${pode ? `<div><button class="botao botao-secundario" type="submit">${icone("ok")}Salvar rateio</button></div>` : ""}
          </div>
        </form>`).join("") || '<div class="cartao vazio">Nenhum colaborador próprio.</div>'}
    </div>`;
}

// ---------------------------------------------------------------- eventos

export function ligarEventosCustos({ aoAlterar }) {
  cache.aoAlterar = aoAlterar;
  document.addEventListener("click", async (evento) => {
    const criterio = evento.target.closest("[data-custo-criterio]");
    if (criterio) { cache.criterio = criterio.dataset.custoCriterio; cache.resultado = null; return aoAlterar?.(); }
    const linha = evento.target.closest("[data-custo-contrato]");
    if (linha) return painelContrato(linha.dataset.custoContrato);
    const excluir = evento.target.closest("[data-custo-excluir]");
    if (excluir && confirm("Excluir este lançamento de custo?")) {
      try {
        await api(`/custos/lancamentos/${encodeURIComponent(excluir.dataset.custoExcluir)}`, { metodo: "DELETE" });
        aviso("Lançamento excluído.");
        cache.lancamentos = null; cache.resultado = null;
        aoAlterar?.();
      } catch (erro) { aviso(erro.message, "erro"); }
    }
  });
  document.addEventListener("change", (evento) => {
    const form = evento.target.closest("#form-custo");
    if (!form) return;
    if (evento.target.name === "destino") {
      for (const campo of form.querySelectorAll("[data-dest]")) campo.hidden = campo.dataset.dest !== form.destino.value;
    }
    if (evento.target.name === "itemId") {
      const op = form.itemId.selectedOptions[0];
      form.querySelector("[data-custo-manual]").hidden = Boolean(form.itemId.value);
      form.custoUnitario.value = op?.dataset.preco ? moedaParaCampo(Number(op.dataset.preco)) : "";
    }
  });
  document.addEventListener("submit", async (evento) => {
    const form = evento.target;
    if (form.id === "form-custo") {
      evento.preventDefault();
      const f = Object.fromEntries(new FormData(form));
      const destino = f.destino === "COLABORADOR" ? { tipo: "COLABORADOR", matricula: f.matricula } : f.destino === "CONTRATO" ? { tipo: "CONTRATO", contratoId: f.contratoId } : { tipo: "RATEIO" };
      try {
        await api("/custos/lancamentos", { metodo: "POST", corpo: {
          itemId: f.itemId || undefined, tipo: f.itemId ? undefined : f.tipo, descricao: f.itemId ? undefined : f.descricao,
          quantidade: Number(f.quantidade), custoUnitario: f.custoUnitario ? lerMoeda(f.custoUnitario) : undefined, data: f.data, destino,
        } });
        aviso("Custo lançado.");
        cache.lancamentos = null; cache.resultado = null;
        aoAlterar?.();
      } catch (erro) { aviso(erro.message, "erro"); }
    } else if (form.id === "form-item-custo") {
      evento.preventDefault();
      const f = Object.fromEntries(new FormData(form));
      try {
        await api("/custos/itens", { metodo: "POST", corpo: { nome: f.nome, tipo: f.tipo, custoUnitario: lerMoeda(f.custoUnitario), amortizarMeses: Number(f.amortizarMeses || 1) } });
        aviso("Item salvo.");
        cache.itens = null;
        aoAlterar?.();
      } catch (erro) { aviso(erro.message, "erro"); }
    } else if (form.dataset.formRateio) {
      evento.preventDefault();
      const rateioContratos = [...new FormData(form)].filter(([, v]) => Number(v) > 0).map(([contratoId, v]) => ({ contratoId, percentual: Number(v) }));
      try {
        await api(`/colaboradores/${form.dataset.formRateio}/rateio`, { metodo: "PATCH", corpo: { rateioContratos } });
        aviso(rateioContratos.length ? "Rateio salvo." : "Colaborador volta para a estrutura.");
        cache.colaboradores = null; cache.resultado = null;
        aoAlterar?.();
      } catch (erro) { aviso(erro.message, "erro"); }
    }
  });
}

export { fecharPainel };
