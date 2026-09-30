/**
 * Folha: convenções e acordos coletivos. Consulta do instrumento (pisos, benefícios, jornada,
 * contribuições, rescisão, encargos) e conformidade da competência: quem está abaixo do piso e
 * quem precisa ter a função enquadrada na tabela. As regras são do servidor (packages/convencoes).
 */
import { icone } from "./icones.js";
import { api, sessao } from "./sessao.js";
import { esc, moeda, cnpj, matricula, data, avatar, etiqueta, aviso, abrirPainel } from "./ui.js";
import { COMPETENCIA_PADRAO, limparFolha } from "./folha-telas.js";

const NOME_VINCULO = { TEMPORARIO: ["Temporário", "e-azul"], TERCEIRIZADO: ["Terceirizado", "e-marca"], PROPRIO: ["Próprio", "e-cinza"] };
const NOME_JORNADA = { "40H_SEG_SEX": "40 h, seg. a sex.", "44H_SEG_SEX": "44 h, seg. a sex.", "44H_SEG_SAB": "44 h, seg. a sáb.", "12X36": "12x36" };
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const cache = { lista: null, folha: null, detalhes: {}, aberta: null, busca: "", aoAlterar: null };
const pct = (n) => `${String(n).replace(".", ",")}%`;

export function limparConvencoes() {
  cache.lista = null;
  cache.folha = null;
  cache.detalhes = {};
}

export async function paginaConvencoes() {
  [cache.lista, cache.folha] = await Promise.all([cache.lista ?? api("/convencoes"), cache.folha ?? api(`/folha/${COMPETENCIA_PADRAO}`)]);
  const conf = cache.folha.convencoes?.conformidade ?? [];
  const abaixo = conf.filter((c) => c.erros.length);
  const semFuncao = conf.filter((c) => !c.enquadrada && !c.erros.length);
  const patronais = cache.folha.convencoes?.contribuicoesPatronais ?? [];
  return `
    <div class="barra-filtros"><span class="dica">A convenção vale para quem é vinculado ao sindicato dela (o sindicato é obrigatório no cadastro); acordo coletivo do tomador ou da empresa prevalece sobre ela (CLT, art. 620).</span></div>
    <div class="grade-folha">
      ${cache.lista.map((i) => `
        <div class="cartao linha-clicavel" data-conv="${esc(i.id)}">
          <div class="cartao-cabecalho"><div>
            <h3>${esc(i.tipo)} ${esc(i.registroMTE)}</h3>
            <p class="dica">${esc(i.abrangencia?.categoria ?? "")} · ${esc(i.abrangencia?.uf ?? "")}</p>
          </div>${i.vigente ? '<span class="etiqueta e-verde">Vigente</span>' : '<span class="etiqueta e-cinza">Fora da vigência</span>'}</div>
          <div class="cartao-corpo">
            <div class="bases">
              <div><small>Vigência</small><strong>${data(i.vigencia.inicio)} a ${data(i.vigencia.fim)}</strong></div>
              <div><small>Data-base</small><strong>${MESES[(i.dataBase?.mes ?? 1) - 1]}</strong></div>
              <div><small>Piso geral</small><strong>${moeda(i.pisoGeral)}</strong></div>
              <div><small>Funções com piso</small><strong>${i.funcoes}</strong></div>
            </div>
            <p class="dica" style="margin-top:12px">${esc(i.sindicatoLaboral.sigla)} (CNPJ ${esc(cnpj(i.sindicatoLaboral.cnpj))})${i.sindicatoPatronal ? ` e ${esc(i.sindicatoPatronal.sigla)} (CNPJ ${esc(cnpj(i.sindicatoPatronal.cnpj))})` : ""}</p>
            <p class="dica">Aplicada a quem é vinculado ao ${esc(i.sindicatoLaboral.sigla)}: ${Object.keys(i.vinculados ?? {}).length ? Object.entries(i.vinculados).map(([t, n]) => `${etiqueta(NOME_VINCULO, t)} ${n}`).join(" ") : "nenhum colaborador ainda"}</p>
          </div>
        </div>`).join("")}
    </div>

    <div class="cartao" style="margin-top:18px">
      <div class="cartao-cabecalho"><div><h3>Conformidade em ${COMPETENCIA_PADRAO.slice(5, 7)}/${COMPETENCIA_PADRAO.slice(0, 4)}</h3>
        <p class="dica">${abaixo.length ? `${abaixo.length} abaixo do piso` : "Ninguém abaixo do piso"} · ${semFuncao.length} com a função fora da tabela (vale o piso geral até enquadrar)</p></div></div>
      ${conf.length ? `
      <div class="cartao-corpo"><table class="tabela tabela-compacta">
        <thead><tr><th>Colaborador</th><th class="col-opcional">Cargo</th><th>Função na convenção</th><th class="num">Piso</th><th class="num">Salário</th><th></th></tr></thead>
        <tbody>${conf.map((c) => `
          <tr>
            <td><div class="pessoa">${avatar(c.nome, "avatar-sm")}<div><strong>${esc(c.nome)}</strong><small>${esc(matricula(c.matricula))} · ${etiqueta(NOME_VINCULO, c.vinculo)}</small></div></div></td>
            <td class="col-opcional">${esc(c.cargo ?? "")}</td>
            <td>${c.enquadrada ? esc(c.funcao) : '<span class="etiqueta e-ambar">Enquadrar</span>'}</td>
            <td class="num">${moeda(c.piso)}</td>
            <td class="num">${c.erros.length ? `<span class="etiqueta e-vermelho">${moeda(c.salario)}</span>` : moeda(c.salario)}</td>
            <td class="acoes-linha">${sessao.pode("folha", "editar") ? `<button class="botao botao-secundario botao-sm" data-conv-enquadrar="${esc(c.matricula)}" data-conv-id="${esc(c.instrumento.id)}" data-conv-cargo="${esc(c.cargo ?? "")}" data-conv-nome="${esc(c.nome)}">Enquadrar</button>` : ""}</td>
          </tr>`).join("")}</tbody>
      </table></div>` : '<div class="cartao-corpo"><p class="dica">Todos os colaboradores enquadrados e com salário no piso.</p></div>'}
    </div>

    ${patronais.length ? `<p class="dica" style="margin-top:12px">Contribuição negocial patronal do mês: ${patronais.map((p) => `${esc(p.instrumento)}, ${p.colaboradores} colaboradores, ${moeda(p.valor)}`).join(" · ")}.</p>` : ""}`;
}

async function detalhe(id) {
  cache.detalhes[id] ??= await api(`/convencoes/${encodeURIComponent(id)}`);
  return cache.detalhes[id];
}

function linhasPisos(i, termo) {
  const t = termo.trim().toLowerCase();
  return i.pisos.flatMap((p) => p.funcoes.map((f) => ({ f, v: p.valor })))
    .filter((x) => !t || x.f.toLowerCase().includes(t))
    .sort((a, b) => a.f.localeCompare(b.f, "pt-BR"))
    .map((x) => `<tr><td>${esc(x.f)}</td><td class="num">${moeda(x.v)}</td></tr>`).join("") || '<tr><td colspan="2" class="dica">Nenhuma função com esse nome: vale o piso geral.</td></tr>';
}

async function painelConvencao(id) {
  const i = await detalhe(id);
  cache.aberta = id;
  const beneficios = [
    i.valeRefeicao && ["Vale-refeição", `${moeda(i.valeRefeicao.porDia)} por dia trabalhado; desconto de até ${pct(i.valeRefeicao.descontoMaximoPercentual)}; falta desconta o dia; dispensado com refeitório da empresa ou do tomador`],
    i.cestaBasica && ["Cesta básica", `${moeda(i.cestaBasica.valor)} por mês${i.cestaBasica.soAssociados ? ", só para associados ao sindicato" : ""}; perde com mais de ${i.cestaBasica.faltasToleradas} falta ou atestado, atrasos de ${i.cestaBasica.atrasosHorasLimite} h, férias ou afastamento, ou mês incompleto; entrega até o dia ${i.cestaBasica.entregaAteDia}`],
    i.valeTransporte && ["Vale-transporte", `desconto de ${pct(i.valeTransporte.descontoPercentual)} do salário-base (${pct(i.valeTransporte.descontoPercentual12x36)} na escala 12x36)`],
    ...(i.custosPorColaborador ?? []).map((c) => [c.nome, `${moeda(c.valor)} por colaborador por mês (custo da empresa, cláusula ${c.clausula}ª)`]),
    i.planoSaude && ["Plano de saúde", "opcional, descontado integralmente do colaborador"],
  ].filter(Boolean);
  const ct = i.contribuicoes ?? {};
  const jornadas = i.encargosMinimos?.jornadas ?? [];
  abrirPainel(`
    <header class="painel-cabecalho">
      <span class="indicador-icone" style="color:var(--marca-500);background:var(--marca-100)">${icone("folha")}</span>
      <div class="texto"><h2>${esc(i.tipo)} ${esc(i.registroMTE)}</h2>
        <p>${esc(i.abrangencia?.categoria ?? "")} · vigência ${data(i.vigencia.inicio)} a ${data(i.vigencia.fim)} · registro no MTE em ${data(i.dataRegistro)}</p></div>
      <button class="botao-icone" data-fechar aria-label="Fechar">${icone("fechar")}</button>
    </header>
    <div class="painel-corpo">
      <div class="secao"><h4>Pisos salariais</h4>
        <p class="dica">Piso geral ${moeda(i.pisoGeral)} para função fora da tabela. Reajuste mínimo de ${pct(i.reajuste?.percentual ?? 0)} desde ${data(i.reajuste?.desde)} para quem ganha acima do piso.</p>
        <div class="campo" style="margin:10px 0"><input type="search" placeholder="Buscar função" aria-label="Buscar função" data-conv-busca-piso value="${esc(cache.busca)}"></div>
        <table class="tabela tabela-compacta"><thead><tr><th>Função</th><th class="num">Piso</th></tr></thead><tbody id="conv-pisos">${linhasPisos(i, cache.busca)}</tbody></table>
      </div>
      <div class="secao"><h4>Adicionais e jornada</h4>
        <table class="tabela tabela-compacta"><tbody>
          <tr><td>Insalubridade</td><td>mínimo de ${pct(i.insalubridade?.minimoEmHospital ?? 0)} em hospitais; ${(i.insalubridade?.porFuncao ?? []).map((f) => `${esc(f.funcao)}: ${pct(f.grau)}`).join("; ")} (sobre o salário mínimo)</td></tr>
          ${(i.gratificacoes ?? []).map((g) => `<tr><td>${esc(g.nome)}</td><td>${esc(g.funcao)}: ${pct(g.percentual)} sobre o ${g.base === "SALARIO_MINIMO" ? "salário mínimo" : "salário-base"}</td></tr>`).join("")}
          ${i.escala12x36 ? `<tr><td>Escala 12x36</td><td>divisor ${i.escala12x36.divisor}; adicional noturno de ${pct(i.escala12x36.adicionalNoturno)} das ${i.escala12x36.noturnoDe} às ${i.escala12x36.noturnoAte}; intervalo não concedido indenizado com ${pct(i.escala12x36.intervaloIndenizadoPercentual)}</td></tr>` : ""}
          ${i.bancoHoras ? `<tr><td>Banco de horas</td><td>com adesão por escrito; as primeiras ${i.bancoHoras.horasPagasNoMes} h acima de ${i.bancoHoras.acimaDeHorasMensais} h no mês pagas com ${pct(i.bancoHoras.adicionalPago)}; o resto compensado em ${i.bancoHoras.prazoDias} dias ou pago com ${pct(i.bancoHoras.adicionalSaldo)}</td></tr>` : ""}
          ${i.tempoParcial ? `<tr><td>Tempo parcial</td><td>só com o piso integral; ${i.tempoParcial.feriasDias} dias de férias</td></tr>` : ""}
          ${i.decimoTerceiro ? `<tr><td>13º salário</td><td>1ª parcela até ${i.decimoTerceiro.primeiraAte.split("-").reverse().join("/")}, 2ª até ${i.decimoTerceiro.segundaAte.split("-").reverse().join("/")}</td></tr>` : ""}
        </tbody></table>
      </div>
      <div class="secao"><h4>Benefícios e custos da empresa</h4>
        <table class="tabela tabela-compacta"><tbody>${beneficios.map(([n, t]) => `<tr><td>${esc(n)}</td><td>${esc(t)}</td></tr>`).join("")}</tbody></table>
      </div>
      <div class="secao"><h4>Contribuições</h4>
        <table class="tabela tabela-compacta"><tbody>
          ${ct.mensalidadeAssociativa ? `<tr><td>Mensalidade associativa</td><td>${pct(ct.mensalidadeAssociativa.percentualSalarioBase)} do salário-base, mínimo ${moeda(ct.mensalidadeAssociativa.minimo)}; oposição por escrito a qualquer tempo</td></tr>` : ""}
          ${ct.assistencial ? `<tr><td>Contribuição assistencial</td><td>na folha de ${MESES[ct.assistencial.mes - 1]}: ${moeda(ct.assistencial.associado)} (associado) ou ${moeda(ct.assistencial.naoAssociado)}; oposição até ${data(ct.assistencial.oposicaoAte)}</td></tr>` : ""}
          ${(i.contribuicaoNegocialPatronal ?? []).length ? `<tr><td>Negocial patronal</td><td>de ${moeda(i.contribuicaoNegocialPatronal[0].valor)} a ${moeda(i.contribuicaoNegocialPatronal.at(-1).valor)} por mês, pelo número de colaboradores</td></tr>` : ""}
        </tbody></table>
      </div>
      ${i.rescisao ? `<div class="secao"><h4>Rescisão</h4>
        <table class="tabela tabela-compacta"><tbody>
          <tr><td>Pagamento</td><td>até ${i.rescisao.pagamentoDias} dias do desligamento</td></tr>
          <tr><td>Homologação</td><td>no sindicato laboral para contrato com mais de ${i.rescisao.homologacaoSindicalAcimaDeMeses} meses; taxa de ${moeda(i.rescisao.taxaHomologacao?.regular)} (empresa regular)</td></tr>
          <tr><td>Documentos</td><td>TRCT e documentos ao sindicato em até ${i.rescisao.entregaDocumentosDias} dias${i.rescisao.exigePPP ? "; PPP em qualquer motivo" : ""}</td></tr>
          ${i.rescisao.sucessaoContratual ? `<tr><td>Sucessão de contrato</td><td>rescisão por acordo (motivo ${esc(i.rescisao.sucessaoContratual.motivoESocial)} do eSocial): ${pct(i.rescisao.sucessaoContratual.multaFGTS)} do FGTS e metade do aviso indenizado</td></tr>` : ""}
        </tbody></table></div>` : ""}
      ${jornadas.length ? `<div class="secao"><h4>Encargos mínimos na proposta de preço</h4>
        <div style="overflow-x:auto"><table class="tabela tabela-compacta" style="min-width:560px"><thead><tr><th>Grupo</th>${jornadas.map((j) => `<th class="num">${esc(NOME_JORNADA[j] ?? j)}</th>`).join("")}</tr></thead><tbody>
          ${i.encargosMinimos.grupos.map((g) => `<tr><td>${esc(g.grupo)} · ${esc(g.nome)}</td>${g.total.map((v) => `<td class="num">${pct(v)}</td>`).join("")}</tr>`).join("")}
          <tr class="total"><td>Total</td>${jornadas.map((j) => `<td class="num">${pct(i.encargosMinimos.total[j])}</td>`).join("")}</tr>
        </tbody></table></div></div>` : ""}
      <div class="secao"><h4>Cláusulas</h4>
        <p class="dica">${(i.clausulas ?? []).map((c) => `${c.numero}ª ${esc(c.assunto)}`).join(" · ")}</p>
      </div>
    </div>
    <footer class="painel-rodape"><button class="botao botao-secundario" data-fechar type="button">Fechar</button></footer>`);
}

async function painelEnquadrar({ matricula: mat, id, cargo, nome }) {
  const [i, sugestoes] = await Promise.all([detalhe(id), api(`/convencoes/${encodeURIComponent(id)}/sugestoes?cargo=${encodeURIComponent(cargo)}`)]);
  const todas = i.pisos.flatMap((p) => p.funcoes.map((f) => ({ f, v: p.valor }))).sort((a, b) => a.f.localeCompare(b.f, "pt-BR"));
  abrirPainel(`
    <header class="painel-cabecalho">
      ${avatar(nome, "avatar-lg")}
      <div class="texto"><h2>Enquadrar função</h2><p>${esc(nome)} · cargo "${esc(cargo)}" · ${esc(i.tipo)} ${esc(i.registroMTE)}</p></div>
      <button class="botao-icone" data-fechar aria-label="Fechar">${icone("fechar")}</button>
    </header>
    <form class="painel-corpo formulario" id="form-enquadrar">
      <p class="dica">A função escolhida vale para o posto inteiro (todos que o ocupam). Colaborador próprio, sem posto, guarda no vínculo.</p>
      ${sugestoes.length ? `<div class="secao"><h4>Mais parecidas com o cargo</h4><div class="lista">
        ${sugestoes.map((s) => `<button type="button" class="lista-item origem-item" data-conv-escolher="${esc(s.funcao)}"><div class="texto"><strong>${esc(s.funcao)}</strong><small>piso ${moeda(s.valor)}</small></div><span class="dica">Usar ${icone("seta")}</span></button>`).join("")}
      </div></div>` : ""}
      <div class="campo"><label for="e-funcao">Função na tabela de pisos</label>
        <select id="e-funcao" name="funcaoConvencao"><option value="">Nenhuma (piso geral de ${moeda(i.pisoGeral)})</option>${todas.map((x) => `<option value="${esc(x.f)}">${esc(x.f)} · ${moeda(x.v)}</option>`).join("")}</select></div>
    </form>
    <footer class="painel-rodape">
      <button class="botao botao-secundario" data-fechar type="button">Cancelar</button>
      <button class="botao botao-primario" type="submit" form="form-enquadrar">${icone("ok")}Salvar enquadramento</button>
    </footer>`);
  const form = document.getElementById("form-enquadrar");
  form.addEventListener("click", (e) => {
    const b = e.target.closest("[data-conv-escolher]");
    if (b) form.funcaoConvencao.value = b.dataset.convEscolher;
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await api(`/enquadramento/${mat}`, { metodo: "PATCH", corpo: { funcaoConvencao: form.funcaoConvencao.value } });
      aviso("Enquadramento salvo.");
      cache.folha = null;
      limparFolha(); // o holerite mostra o piso e a função
      document.querySelector("[data-fechar]")?.click();
      cache.aoAlterar?.();
    } catch (erro) { aviso(erro.message, "erro"); }
  });
}

export function ligarEventosConvencoes({ aoAlterar }) {
  cache.aoAlterar = aoAlterar;
  document.addEventListener("click", (evento) => {
    const enq = evento.target.closest("[data-conv-enquadrar]");
    if (enq) {
      const d = enq.dataset;
      return painelEnquadrar({ matricula: d.convEnquadrar, id: d.convId, cargo: d.convCargo, nome: d.convNome }).catch((e) => aviso(e.message, "erro"));
    }
    const cartao = evento.target.closest("[data-conv]");
    if (cartao) painelConvencao(cartao.dataset.conv).catch((e) => aviso(e.message, "erro"));
  });
  document.addEventListener("input", (evento) => {
    if (!evento.target.matches("[data-conv-busca-piso]")) return;
    cache.busca = evento.target.value;
    const corpo = document.getElementById("conv-pisos");
    if (corpo && cache.aberta) corpo.innerHTML = linhasPisos(cache.detalhes[cache.aberta], cache.busca);
  });
}
