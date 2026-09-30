/**
 * Módulos Colaboradores e Tomadores: cadastro único (pessoa por CPF, vínculo por matrícula),
 * tomadores com contratos e postos, e importação da planilha do sistema anterior.
 * As regras (Lei 6.019/1974, remuneração equivalente, quarentenas) são do servidor.
 */
import { icone } from "./icones.js";
import { api, sessao } from "./sessao.js";
import { esc, moeda, cnpj, cpf, matricula, data, lerMoeda, avatar, etiqueta, aviso, abrirPainel, fecharPainel } from "./ui.js";

const cache = { colaboradores: null, tomadores: null, busca: "", aoAlterar: null, previa: null, planilha: "" };
const NOME_VINCULO = { TEMPORARIO: ["Temporário", "e-azul"], TERCEIRIZADO: ["Terceirizado", "e-marca"], PROPRIO: ["Próprio", "e-cinza"] };
const TIPO_CONTRATO = { TRABALHO_TEMPORARIO: ["Trabalho temporário", "e-azul"], PRESTACAO_SERVICOS: ["Prestação de serviços", "e-marca"] };
const HIPOTESE = { DEMANDA_COMPLEMENTAR: "Demanda complementar de serviços", SUBSTITUICAO_TRANSITORIA: "Substituição transitória de pessoal" };

export function limparCadastro() {
  cache.colaboradores = null;
  cache.tomadores = null;
  cache.previa = null;
}

async function recarregar() {
  limparCadastro();
  cache.aoAlterar?.();
}

// ---------------------------------------------------------------- colaboradores

export async function paginaColaboradores() {
  cache.colaboradores ??= await api("/colaboradores");
  const { itens, totais } = cache.colaboradores;
  const termo = cache.busca.trim().toLowerCase();
  const lista = itens.filter((v) => !termo || `${v.pessoa?.nome} ${v.pessoa?.cpf ?? ""} ${v.matricula} ${v.cargo} ${v.tomador?.nome ?? ""}`.toLowerCase().includes(termo));
  const podeCriar = sessao.pode("colaboradores", "criar");
  return `
    <div class="barra-filtros">
      <span class="etiqueta sem-ponto e-azul">${totais.porTipo.TEMPORARIO} temporários</span>
      <span class="etiqueta sem-ponto e-marca">${totais.porTipo.TERCEIRIZADO} terceirizados</span>
      <span class="etiqueta sem-ponto e-cinza">${totais.porTipo.PROPRIO} próprios</span>
      ${totais.semCPF ? `<span class="etiqueta e-ambar">${totais.semCPF} sem CPF</span>` : ""}
      <input class="filtro-texto" type="search" placeholder="Buscar por nome, CPF, matrícula, cargo ou tomador" value="${esc(cache.busca)}" data-cad-busca>
      ${podeCriar ? `<button class="botao botao-primario" data-cad="novo-colaborador">${icone("mais")}Novo colaborador</button>` : ""}
    </div>
    <div class="cartao tabela-cartao">
      <table class="tabela">
        <thead><tr><th>Colaborador</th><th>Vínculo</th><th>Lotação</th><th>Cargo</th><th>Admissão</th><th class="num">Salário</th></tr></thead>
        <tbody>
          ${lista.map((v) => `
            <tr class="linha-clicavel" data-cad-colaborador="${esc(v.matricula)}">
              <td><div class="pessoa">${avatar(v.pessoa?.nome, "avatar-sm")}<div><strong>${esc(v.pessoa?.nome)}</strong>
                <small>${v.pessoa?.cpf ? `CPF ${esc(cpf(v.pessoa.cpf))}` : '<span class="etiqueta e-ambar">CPF pendente</span>'} · ${esc(matricula(v.matricula))}</small></div></div></td>
              <td>${etiqueta(NOME_VINCULO, v.tipo)}${v.desligamento ? ' <span class="etiqueta e-cinza">Desligado</span>' : ""}</td>
              <td>${esc(v.tomador?.nome ?? `Setor ${v.setor ?? "—"}`)}</td>
              <td>${esc(v.cargo ?? "")}</td>
              <td>${data(v.admissao)}</td>
              <td class="num">${moeda(v.salario)}</td>
            </tr>`).join("") || '<tr><td colspan="6" class="vazio">Nenhum colaborador encontrado.</td></tr>'}
        </tbody>
      </table>
    </div>`;
}

async function painelColaborador(mat) {
  const v = await api(`/colaboradores/${mat}`);
  const p = v.pessoaCompleta ?? {};
  const podeEditar = sessao.pode("colaboradores", "editar");
  const historico = [...(v.historicoSalarial ?? [])].reverse();
  abrirPainel(`
    <header class="painel-cabecalho">
      ${avatar(p.nome, "avatar-lg")}
      <div class="texto"><h2>${esc(p.nome)}</h2>
        <p>${p.cpf ? `CPF ${esc(cpf(p.cpf))} · ` : ""}Matrícula ${esc(matricula(v.matricula))}${v.matriculaAnterior ? ` · anterior ${esc(v.matriculaAnterior)}` : ""}</p>
        <div class="meta" style="margin-top:8px">${etiqueta(NOME_VINCULO, v.tipo)}<span>${icone("tomadores")}${esc(v.tomador?.nome ?? `Setor ${v.setor ?? "—"}`)}</span></div></div>
      <button class="botao-icone" data-fechar aria-label="Fechar">${icone("fechar")}</button>
    </header>
    <div class="painel-corpo">
      ${!p.cpf ? `
      <div class="secao alerta-folha">${icone("cracha")}<div><strong>CPF não informado</strong>
        <p>O CPF é o código da pessoa no Labutar e no eSocial. Sem ele, nada desta pessoa vai ao eSocial.</p>
        ${podeEditar ? `<form class="formulario linha-cpf" id="form-cad-cpf"><input name="cpf" inputmode="numeric" placeholder="000.000.000-00" required aria-label="CPF"><button class="botao botao-primario botao-sm" type="submit">Salvar CPF</button></form>` : ""}
      </div></div>` : ""}
      <div class="secao"><h4>Vínculo</h4>
        <div class="bases">
          <div><small>Admissão</small><strong>${data(v.admissao)}</strong></div>
          <div><small>Cargo</small><strong>${esc(v.cargo ?? "—")}</strong></div>
          <div><small>Salário atual</small><strong>${moeda(v.salario)}</strong></div>
          <div><small>Posto</small><strong>${esc(v.posto?.funcao ?? "—")}${v.posto?.insalubridadeGrau ? ` · insalubridade ${v.posto.insalubridadeGrau}%` : ""}${v.posto?.periculosidade ? " · periculosidade" : ""}</strong></div>
        </div>
      </div>
      <div class="secao"><h4>Histórico salarial</h4>
        <table class="tabela tabela-compacta"><thead><tr><th>Desde</th><th>Motivo</th><th class="num">Salário</th></tr></thead>
          <tbody>${historico.map((h) => `<tr><td>${data(h.desde)}</td><td>${esc(h.motivo)}</td><td class="num">${moeda(h.valor)}</td></tr>`).join("")}</tbody></table>
        ${podeEditar ? `
        <form class="formulario" id="form-cad-salario" style="margin-top:12px">
          <div class="duas">
            <div class="campo"><label for="s-desde">Vigente desde</label><input id="s-desde" name="desde" type="date" required></div>
            <div class="campo"><label for="s-valor">Novo salário (R$)</label><input id="s-valor" name="valor" inputmode="decimal" placeholder="2.000,00" required></div>
          </div>
          <div class="campo"><label for="s-motivo">Motivo</label><input id="s-motivo" name="motivo" placeholder="Dissídio, promoção, enquadramento…" required></div>
          <button class="botao botao-secundario" type="submit">${icone("ok")}Salvar reajuste</button>
        </form>` : ""}
      </div>
      <div class="secao"><h4>Dependentes</h4>
        ${(p.dependentes ?? []).length ? `<table class="tabela tabela-compacta"><thead><tr><th>Nome</th><th>Parentesco</th><th>IRRF</th><th>Salário-família</th></tr></thead><tbody>
          ${p.dependentes.map((d) => `<tr><td>${esc(d.nome)}${d.cpf ? `<small class="dica"> · ${esc(cpf(d.cpf))}</small>` : ""}</td><td>${esc(d.parentesco === "FILHO" ? "Filho(a)" : d.parentesco)}</td><td>${d.deduzIR ? "Sim" : "Não"}</td><td>${d.salarioFamilia ? "Sim" : "Não"}</td></tr>`).join("")}
        </tbody></table>` : `<p class="dica">${v.dependentesIRImportados ? `${v.dependentesIRImportados} dependente(s) para IRRF informados na importação; cadastre nome e CPF de cada um.` : "Nenhum dependente cadastrado."}</p>`}
      </div>
    </div>
    <footer class="painel-rodape"><button class="botao botao-secundario" data-fechar type="button">Fechar</button></footer>`);

  document.getElementById("form-cad-cpf")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await api(`/pessoas/${p.id}`, { metodo: "PATCH", corpo: { cpf: new FormData(e.target).get("cpf") } });
      aviso("CPF salvo.");
      await recarregar();
      painelColaborador(mat);
    } catch (erro) { aviso(erro.message, "erro"); }
  });
  document.getElementById("form-cad-salario")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    try {
      await api(`/colaboradores/${mat}/salario`, { metodo: "POST", corpo: { desde: f.desde, valor: lerMoeda(f.valor), motivo: f.motivo } });
      aviso("Reajuste salvo.");
      await recarregar();
      painelColaborador(mat);
    } catch (erro) { aviso(erro.message, "erro"); }
  });
}

async function postosDisponiveis() {
  const tomadores = await api("/tomadores");
  const detalhes = await Promise.all(tomadores.map((t) => api(`/tomadores/${t.id}`)));
  return detalhes.flatMap((t) => t.contratos.flatMap((c) => c.postos.map((p) => ({ ...p, tomador: t.nomeFantasia || t.razaoSocial, contratoTipo: c.tipo }))));
}

async function painelNovoColaborador() {
  const postos = await postosDisponiveis();
  const opcoes = (tipo) => postos.filter((p) => (tipo === "TEMPORARIO" ? p.contratoTipo === "TRABALHO_TEMPORARIO" : p.contratoTipo === "PRESTACAO_SERVICOS"))
    .map((p) => `<option value="${esc(p.id)}" data-salario="${p.salarioReferencia ?? ""}">${esc(p.tomador)} — ${esc(p.funcao)}${p.salarioReferencia ? ` (tomadora paga ${moeda(p.salarioReferencia)})` : ""}</option>`).join("");
  abrirPainel(`
    <header class="painel-cabecalho">
      <span class="indicador-icone" style="color:var(--marca-500);background:var(--marca-100)">${icone("cracha")}</span>
      <div class="texto"><h2>Novo colaborador</h2><p>A pessoa é identificada pelo CPF; o vínculo recebe matrícula nova.</p></div>
      <button class="botao-icone" data-fechar aria-label="Fechar">${icone("fechar")}</button>
    </header>
    <form class="painel-corpo formulario" id="form-novo-colaborador">
      <div class="secao"><h4>Pessoa</h4>
        <div class="campo"><label for="n-nome">Nome completo</label><input id="n-nome" name="nome" required></div>
        <div class="duas">
          <div class="campo"><label for="n-cpf">CPF</label><input id="n-cpf" name="cpf" inputmode="numeric" placeholder="000.000.000-00"></div>
          <div class="campo"><label for="n-nasc">Nascimento</label><input id="n-nasc" name="nascimento" type="date"></div>
        </div>
      </div>
      <div class="secao"><h4>Vínculo</h4>
        <div class="duas">
          <div class="campo"><label for="n-tipo">Tipo</label>
            <select id="n-tipo" name="tipo" required><option value="TEMPORARIO">Temporário</option><option value="TERCEIRIZADO">Terceirizado</option><option value="PROPRIO">Próprio</option></select></div>
          <div class="campo"><label for="n-adm">Admissão</label><input id="n-adm" name="admissao" type="date" required></div>
        </div>
        <div class="campo" data-so-tomador><label for="n-posto">Posto no tomador</label>
          <select id="n-posto" name="postoId"><option value="">Selecione</option>${opcoes("TEMPORARIO")}</select>
          <p class="dica">Temporário só em contrato de trabalho temporário; terceirizado só em prestação de serviços.</p></div>
        <div class="campo" data-so-proprio hidden><label for="n-setor">Setor</label><input id="n-setor" name="setor" value="ADM"></div>
        <div class="duas">
          <div class="campo"><label for="n-cargo">Cargo</label><input id="n-cargo" name="cargo" placeholder="Vem da função do posto"></div>
          <div class="campo"><label for="n-sal">Salário (R$)</label><input id="n-sal" name="salario" inputmode="decimal" placeholder="2.000,00" required></div>
        </div>
        <div class="campo" data-so-temporario><label for="n-fim">Fim previsto do contrato temporário</label><input id="n-fim" name="fimPrevisto" type="date">
          <p class="dica">Até 180 dias na mesma tomadora, prorrogáveis por mais 90 com justificativa (Lei 6.019/1974, art. 10).</p></div>
      </div>
    </form>
    <footer class="painel-rodape">
      <button class="botao botao-secundario" data-fechar type="button">Cancelar</button>
      <button class="botao botao-primario" type="submit" form="form-novo-colaborador">${icone("ok")}Admitir</button>
    </footer>`);
  const form = document.getElementById("form-novo-colaborador");
  const ajustar = () => {
    const tipo = form.tipo.value;
    form.querySelector("[data-so-tomador]").hidden = tipo === "PROPRIO";
    form.querySelector("[data-so-proprio]").hidden = tipo !== "PROPRIO";
    form.querySelector("[data-so-temporario]").hidden = tipo !== "TEMPORARIO";
    form.postoId.innerHTML = `<option value="">Selecione</option>${opcoes(tipo)}`;
  };
  form.tipo.addEventListener("change", ajustar);
  form.postoId.addEventListener("change", () => {
    const s = form.postoId.selectedOptions[0]?.dataset.salario;
    if (s && !form.salario.value) form.salario.value = (Number(s) / 100).toFixed(2).replace(".", ",");
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form));
    const corpo = {
      pessoa: { nome: f.nome, cpf: f.cpf || null, nascimento: f.nascimento || undefined },
      vinculo: {
        tipo: f.tipo, admissao: f.admissao, cargo: f.cargo || undefined, salario: lerMoeda(f.salario),
        postoId: f.tipo === "PROPRIO" ? undefined : f.postoId || undefined,
        setor: f.tipo === "PROPRIO" ? f.setor : undefined,
        temporario: f.tipo === "TEMPORARIO" ? { fimPrevisto: f.fimPrevisto || null } : undefined,
      },
    };
    try {
      const r = await api("/colaboradores", { metodo: "POST", corpo });
      fecharPainel();
      aviso(`Admitido com a matrícula ${matricula(r.vinculo.matricula)}.`);
      for (const a of r.avisos ?? []) aviso(a);
      await recarregar();
    } catch (erro) { aviso(erro.message, "erro"); }
  });
}

// ---------------------------------------------------------------- importação

export async function paginaImportacao() {
  const p = cache.previa;
  return `
    <div class="cartao">
      <div class="cartao-cabecalho"><div><h3>Importar colaboradores do sistema anterior</h3>
        <p>Planilha CSV separada por ponto e vírgula. Primeiro o sistema confere cada linha; nada é gravado antes de você confirmar.</p></div></div>
      <div class="cartao-corpo formulario">
        <p class="dica">Colunas: <code>matricula_anterior; nome; cpf; vinculo; admissao; cargo; salario; dependentes_ir; tomador_cnpj; setor</code>.
          Vínculo: temporário, terceirizado ou próprio. O cargo precisa existir como posto do tomador.</p>
        <div class="campo"><label for="imp-arquivo">Arquivo</label><input id="imp-arquivo" type="file" accept=".csv,text/csv" data-cad-arquivo></div>
        <div class="campo"><label for="imp-texto">Ou cole aqui</label><textarea id="imp-texto" rows="6" data-cad-planilha>${esc(cache.planilha)}</textarea></div>
        <div><button class="botao botao-primario" data-cad="conferir-importacao">${icone("ok")}Conferir planilha</button></div>
      </div>
    </div>
    ${p ? `
    <div class="cartao tabela-cartao" style="margin-top:18px">
      <div class="cartao-cabecalho"><div><h3>${p.prontas.length} prontas para importar${p.erros.length ? ` · ${p.erros.length} com erro` : ""}</h3>
        <p>As linhas com erro ficam de fora; corrija e confira de novo.</p></div>
        ${p.prontas.length && sessao.pode("colaboradores", "criar") ? `<button class="botao botao-primario" data-cad="confirmar-importacao">${icone("ok")}Importar ${p.prontas.length} colaboradores</button>` : ""}</div>
      <table class="tabela">
        <thead><tr><th>Linha</th><th>Nome</th><th>Vínculo</th><th>Lotação</th><th>Cargo</th><th>Admissão</th><th class="num">Salário</th></tr></thead>
        <tbody>
          ${p.prontas.map((l) => `<tr><td>${l.linha}</td><td>${esc(l.nome)}${l.cpf ? "" : ' <span class="etiqueta e-ambar">CPF pendente</span>'}${(l.avisos ?? []).map((a) => `<small class="dica" style="display:block">${esc(a)}</small>`).join("")}</td><td>${etiqueta(NOME_VINCULO, l.tipo)}</td><td>${esc(l.lotacao ?? "")}</td><td>${esc(l.cargo)}</td><td>${data(l.admissao)}</td><td class="num">${moeda(l.salario)}</td></tr>`).join("")}
          ${p.erros.map((l) => `<tr><td>${l.linha}</td><td>${esc(l.nome ?? "")}</td><td colspan="5"><span class="etiqueta e-vermelho">Erro</span> ${esc(l.erros.join("; "))}</td></tr>`).join("")}
        </tbody>
      </table>
    </div>` : ""}`;
}

// ---------------------------------------------------------------- tomadores

export async function paginaTomadores() {
  cache.tomadores ??= await api("/tomadores");
  const podeCriar = sessao.pode("tomadores", "criar");
  return `
    <div class="barra-filtros">
      <span class="dica">${cache.tomadores.length} tomadores · ${cache.tomadores.reduce((s, t) => s + t.alocados, 0)} colaboradores alocados</span>
      ${podeCriar ? `<button class="botao botao-primario" style="margin-left:auto" data-cad="novo-tomador">${icone("mais")}Novo tomador</button>` : ""}
    </div>
    <div class="cartao tabela-cartao">
      <table class="tabela">
        <thead><tr><th>Tomador</th><th>Local</th><th class="num">Contratos</th><th class="num">Postos</th><th class="num">Alocados</th></tr></thead>
        <tbody>
          ${cache.tomadores.map((t) => `
            <tr class="linha-clicavel" data-cad-tomador="${esc(t.id)}">
              <td><div class="pessoa"><span class="indicador-icone pequeno">${icone("tomadores")}</span><div><strong>${esc(t.nomeFantasia || t.razaoSocial)}</strong><small>CNPJ ${esc(cnpj(t.cnpj))}</small></div></div></td>
              <td>${esc(t.municipio)}/${esc(t.uf)}</td>
              <td class="num">${t.contratos}</td><td class="num">${t.postos}</td><td class="num"><strong>${t.alocados}</strong></td>
            </tr>`).join("") || '<tr><td colspan="5" class="vazio">Nenhum tomador cadastrado.</td></tr>'}
        </tbody>
      </table>
    </div>`;
}

function painelNovoTomador() {
  abrirPainel(`
    <header class="painel-cabecalho">
      <span class="indicador-icone" style="color:var(--marca-500);background:var(--marca-100)">${icone("tomadores")}</span>
      <div class="texto"><h2>Novo tomador</h2><p>CNPJ numérico ou alfanumérico. A regra dos 180 dias do temporário conta pela raiz do CNPJ.</p></div>
      <button class="botao-icone" data-fechar aria-label="Fechar">${icone("fechar")}</button>
    </header>
    <form class="painel-corpo formulario" id="form-novo-tomador">
      <div class="campo"><label for="t-cnpj">CNPJ</label><input id="t-cnpj" name="cnpj" required placeholder="00.000.000/0000-00"></div>
      <div class="campo"><label for="t-razao">Razão social</label><input id="t-razao" name="razaoSocial" required></div>
      <div class="campo"><label for="t-fantasia">Nome fantasia</label><input id="t-fantasia" name="nomeFantasia"></div>
      <div class="duas">
        <div class="campo"><label for="t-mun">Município</label><input id="t-mun" name="municipio" value="Manaus" required></div>
        <div class="campo"><label for="t-uf">UF</label><input id="t-uf" name="uf" value="AM" maxlength="2" required></div>
      </div>
    </form>
    <footer class="painel-rodape">
      <button class="botao botao-secundario" data-fechar type="button">Cancelar</button>
      <button class="botao botao-primario" type="submit" form="form-novo-tomador">${icone("ok")}Salvar tomador</button>
    </footer>`);
  document.getElementById("form-novo-tomador").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const t = await api("/tomadores", { metodo: "POST", corpo: Object.fromEntries(new FormData(e.target)) });
      aviso("Tomador salvo.");
      await recarregar();
      painelTomador(t.id);
    } catch (erro) { aviso(erro.message, "erro"); }
  });
}

async function painelTomador(id) {
  const t = await api(`/tomadores/${id}`);
  const podeCriar = sessao.pode("tomadores", "criar");
  abrirPainel(`
    <header class="painel-cabecalho">
      <span class="indicador-icone" style="color:var(--marca-500);background:var(--marca-100)">${icone("tomadores")}</span>
      <div class="texto"><h2>${esc(t.nomeFantasia || t.razaoSocial)}</h2><p>CNPJ ${esc(cnpj(t.cnpj))} · ${esc(t.municipio)}/${esc(t.uf)}</p></div>
      <button class="botao-icone" data-fechar aria-label="Fechar">${icone("fechar")}</button>
    </header>
    <div class="painel-corpo">
      ${t.contratos.map((c) => `
        <div class="secao">
          <h4>${etiqueta(TIPO_CONTRATO, c.tipo)} ${data(c.inicio)} a ${c.fim ? data(c.fim) : "prazo indeterminado"}</h4>
          ${c.hipotese ? `<p class="dica">${esc(HIPOTESE[c.hipotese] ?? c.hipotese)}: ${esc(c.justificativa ?? "")}</p>` : ""}
          <table class="tabela tabela-compacta"><thead><tr><th>Posto</th><th>Adicionais</th><th class="num">Salário da tomadora</th><th class="num">Ocupados</th></tr></thead><tbody>
            ${c.postos.map((p) => `<tr><td>${esc(p.funcao)}${p.cbo ? `<small class="dica"> · CBO ${esc(p.cbo)}</small>` : ""}</td>
              <td>${p.insalubridadeGrau ? `Insalubridade ${p.insalubridadeGrau}%` : ""}${p.periculosidade ? " Periculosidade" : ""}${!p.insalubridadeGrau && !p.periculosidade ? "—" : ""}</td>
              <td class="num">${p.salarioReferencia ? moeda(p.salarioReferencia) : "—"}</td><td class="num">${p.ocupados} / ${p.vagas}</td></tr>`).join("") || '<tr><td colspan="4" class="vazio">Sem postos.</td></tr>'}
          </tbody></table>
          ${podeCriar ? `
          <form class="formulario form-posto" data-contrato="${esc(c.id)}" style="margin-top:10px">
            <div class="duas">
              <div class="campo"><label>Função do posto</label><input name="funcao" required></div>
              <div class="campo"><label>CBO</label><input name="cbo" inputmode="numeric" placeholder="6 dígitos"></div>
            </div>
            <div class="duas">
              <div class="campo"><label>Vagas</label><input name="vagas" type="number" min="1" value="1" required></div>
              <div class="campo"><label>Salário pago pela tomadora na função (R$)</label><input name="salarioReferencia" inputmode="decimal"></div>
            </div>
            <div class="duas">
              <div class="campo"><label>Insalubridade (laudo)</label><select name="insalubridadeGrau"><option value="">Não</option><option value="10">10%</option><option value="20">20%</option><option value="40">40%</option></select></div>
              <div class="campo"><label>Periculosidade (laudo)</label><select name="periculosidade"><option value="">Não</option><option value="1">Sim (30%)</option></select></div>
            </div>
            <button class="botao botao-secundario" type="submit">${icone("mais")}Novo posto</button>
          </form>` : ""}
        </div>`).join("") || '<p class="dica">Nenhum contrato ainda.</p>'}
      ${podeCriar ? `
      <form class="secao formulario" id="form-novo-contrato">
        <h4>Novo contrato</h4>
        <div class="duas">
          <div class="campo"><label for="c-tipo">Tipo</label><select id="c-tipo" name="tipo"><option value="TRABALHO_TEMPORARIO">Trabalho temporário</option><option value="PRESTACAO_SERVICOS">Prestação de serviços</option></select></div>
          <div class="campo"><label for="c-hip">Hipótese (temporário)</label><select id="c-hip" name="hipotese"><option value="DEMANDA_COMPLEMENTAR">Demanda complementar</option><option value="SUBSTITUICAO_TRANSITORIA">Substituição transitória</option></select></div>
        </div>
        <div class="duas">
          <div class="campo"><label for="c-ini">Início</label><input id="c-ini" name="inicio" type="date" required></div>
          <div class="campo"><label for="c-fim">Fim</label><input id="c-fim" name="fim" type="date"></div>
        </div>
        <div class="campo"><label for="c-just">Motivo justificador (temporário)</label><input id="c-just" name="justificativa" placeholder="Ex.: acréscimo de produção do segundo semestre"></div>
        <button class="botao botao-secundario" type="submit">${icone("mais")}Novo contrato</button>
      </form>` : ""}
    </div>
    <footer class="painel-rodape"><button class="botao botao-secundario" data-fechar type="button">Fechar</button></footer>`);

  document.getElementById("form-novo-contrato")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const temp = f.tipo === "TRABALHO_TEMPORARIO";
    try {
      await api(`/tomadores/${id}/contratos`, { metodo: "POST", corpo: { tipo: f.tipo, inicio: f.inicio, fim: f.fim || null, hipotese: temp ? f.hipotese : undefined, justificativa: temp ? f.justificativa : undefined } });
      aviso("Contrato salvo.");
      await recarregar();
      painelTomador(id);
    } catch (erro) { aviso(erro.message, "erro"); }
  });
  for (const form of document.querySelectorAll(".form-posto")) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(form));
      try {
        await api(`/contratos/${form.dataset.contrato}/postos`, { metodo: "POST", corpo: {
          funcao: f.funcao, cbo: f.cbo || null, vagas: Number(f.vagas),
          salarioReferencia: f.salarioReferencia ? lerMoeda(f.salarioReferencia) : null,
          insalubridadeGrau: f.insalubridadeGrau ? Number(f.insalubridadeGrau) : null, periculosidade: f.periculosidade === "1",
        } });
        aviso("Posto salvo.");
        await recarregar();
        painelTomador(id);
      } catch (erro) { aviso(erro.message, "erro"); }
    });
  }
}

// ---------------------------------------------------------------- eventos

export function ligarEventosCadastro({ aoAlterar }) {
  cache.aoAlterar = aoAlterar;
  document.addEventListener("click", async (evento) => {
    const alvo = evento.target;
    const colab = alvo.closest("[data-cad-colaborador]");
    if (colab) return painelColaborador(colab.dataset.cadColaborador).catch((e) => aviso(e.message, "erro"));
    const tom = alvo.closest("[data-cad-tomador]");
    if (tom) return painelTomador(tom.dataset.cadTomador).catch((e) => aviso(e.message, "erro"));
    const acao = alvo.closest("[data-cad]")?.dataset.cad;
    if (acao === "novo-colaborador") return painelNovoColaborador().catch((e) => aviso(e.message, "erro"));
    if (acao === "novo-tomador") return painelNovoTomador();
    if (acao === "conferir-importacao" || acao === "confirmar-importacao") {
      const confirmar = acao === "confirmar-importacao";
      try {
        const r = await api("/colaboradores/importar", { metodo: "POST", corpo: { planilha: cache.planilha, confirmar } });
        if (confirmar) {
          aviso(`${r.gravados} colaboradores importados.`);
          cache.previa = null;
          cache.planilha = "";
          await recarregar();
        } else {
          cache.previa = r;
          aoAlterar?.();
        }
      } catch (erro) { aviso(erro.message, "erro"); }
    }
    return undefined;
  });
  document.addEventListener("input", (evento) => {
    if (evento.target.matches("[data-cad-planilha]")) cache.planilha = evento.target.value;
    if (evento.target.matches("[data-cad-busca]")) {
      cache.busca = evento.target.value;
      clearTimeout(cache.timer);
      cache.timer = setTimeout(() => {
        aoAlterar?.();
        const campo = document.querySelector("[data-cad-busca]");
        if (campo) { campo.focus(); campo.setSelectionRange(campo.value.length, campo.value.length); }
      }, 250);
    }
  });
  document.addEventListener("change", async (evento) => {
    if (!evento.target.matches("[data-cad-arquivo]")) return;
    const arquivo = evento.target.files?.[0];
    if (!arquivo) return;
    cache.planilha = await arquivo.text();
    const texto = document.querySelector("[data-cad-planilha]");
    if (texto) texto.value = cache.planilha;
  });
}
