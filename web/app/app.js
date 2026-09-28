/**
 * Painel de recrutador do Labutar.
 * Fluxo mínimo: vagas + pipeline + movimentação de candidatura.
 */
const API_BASE = 'http://localhost:8080/api';
const TENANT_ID = 'demo-industrial';

class LabutarApp {
  constructor() {
    this.currentSection = 'vagas';
    this.currentVagaFilter = null;
    this.vagas = [];
    this.candidaturas = [];
    this.candidatos = [];
    this.init();
  }

  async init() {
    this.setupEventListeners();
    await this.loadData();
    this.render();
  }

  setupEventListeners() {
    document.querySelectorAll('.nav-item').forEach((item) => {
      item.addEventListener('click', (event) => {
        event.preventDefault();
        this.navigateTo(event.currentTarget.dataset.route);
      });
    });

    document.getElementById('btn-nova-vaga').addEventListener('click', () => {
      document.getElementById('modal-nova-vaga').classList.add('active');
    });

    document.getElementById('form-nova-vaga').addEventListener('submit', async (event) => {
      event.preventDefault();
      await this.criarVaga();
    });

    document.querySelectorAll('.btn-close, .btn-close-form').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.getElementById('modal-nova-vaga')?.classList.remove('active');
        document.getElementById('modal-candidatura')?.classList.remove('active');
      });
    });

    document.getElementById('filter-vaga').addEventListener('change', (event) => {
      this.currentVagaFilter = event.target.value || null;
      this.renderPipeline();
    });
  }

  navigateTo(route) {
    document.querySelectorAll('.nav-item').forEach((item) => item.classList.remove('active'));
    const link = document.querySelector(`[data-route="${route}"]`);
    if (link) link.classList.add('active');

    document.querySelectorAll('.content-section').forEach((section) => section.classList.remove('active'));
    const sectionEl = document.getElementById(`${route}-section`);
    if (sectionEl) sectionEl.classList.add('active');

    const titles = { vagas: 'Vagas', candidatos: 'Candidatos', pipeline: 'Pipeline' };
    const pageTitle = document.getElementById('page-title');
    if (pageTitle) pageTitle.textContent = titles[route] ?? 'Labutar';

    this.currentSection = route;

    if (route === 'vagas') this.renderVagas();
    if (route === 'pipeline') this.renderPipeline();
    if (route === 'candidatos') this.renderCandidatos();
  }

  async loadData() {
    try {
      const vagasRes = await fetch(`${API_BASE}/vagas`, {
        headers: { 'X-Labutar-Tenant': TENANT_ID }
      });
      const vagasData = await vagasRes.json();
      this.vagas = vagasData?.dados?.itens || [];

      const candidatosRes = await fetch(`${API_BASE}/candidatos`, {
        headers: { 'X-Labutar-Tenant': TENANT_ID }
      });
      const candidatosData = await candidatosRes.json();
      this.candidatos = candidatosData?.dados?.itens || [];

      this.candidaturas = [];
      const vagasAbertas = this.vagas.filter((vaga) => vaga.status === 'ABERTA');
      for (const vaga of vagasAbertas) {
        const res = await fetch(`${API_BASE}/vagas/${vaga.id}/candidaturas`, {
          headers: { 'X-Labutar-Tenant': TENANT_ID }
        });
        const data = await res.json();
        const itens = data?.dados?.itens || [];
        this.candidaturas.push(...itens.map((candidatura) => ({ ...candidatura, vagaTitulo: vaga.titulo })));
      }
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      this.showError('Erro ao carregar dados do servidor');
    }
  }

  render() {
    if (this.currentSection === 'vagas') this.renderVagas();
    if (this.currentSection === 'pipeline') this.renderPipeline();
    if (this.currentSection === 'candidatos') this.renderCandidatos();
  }

  renderVagas() {
    const container = document.getElementById('vagas-grid');
    if (!container) return;

    if (!this.vagas.length) {
      container.innerHTML = '<div class="loading">Nenhuma vaga criada.</div>';
      return;
    }

    container.innerHTML = this.vagas.map((vaga) => `
      <div class="vaga-card">
        <div class="vaga-card-header">
          <div>
            <div class="vaga-card-title">${vaga.titulo}</div>
            <span class="vaga-status ${vaga.status}">${vaga.status}</span>
          </div>
        </div>
        <div class="vaga-card-meta">
          <div>📍 ${vaga.local?.cidade || 'Remoto'}, ${vaga.local?.uf || ''}</div>
          <div>💼 ${vaga.area || 'N/A'}</div>
          <div>🎯 ${vaga.quantidadeVagas || 1} vaga(s)</div>
          ${vaga.salario?.min ? `<div>💰 R$ ${(vaga.salario.min / 100).toLocaleString('pt-BR')} - R$ ${(vaga.salario.max / 100).toLocaleString('pt-BR')}</div>` : ''}
        </div>
        <div class="vaga-card-actions">
          <button class="btn btn-primary" type="button" onclick="app.abrirVaga('${vaga.id}')">
            ${vaga.status === 'ABERTA' ? '✓ Aberta' : 'Abrir'}
          </button>
          <button class="btn btn-secondary" type="button" onclick="app.visualizarPipeline('${vaga.id}')">
            Pipeline →
          </button>
        </div>
      </div>
    `).join('');
  }

  renderPipeline() {
    const container = document.getElementById('pipeline-container');
    const filterSelect = document.getElementById('filter-vaga');
    if (!container || !filterSelect) return;

    const openVagas = this.vagas.filter((vaga) => vaga.status === 'ABERTA');
    filterSelect.innerHTML = '<option value="">Todas as vagas</option>' +
      openVagas.map((vaga) => `<option value="${vaga.id}">${vaga.titulo}</option>`).join('');

    const selected = this.currentVagaFilter || (openVagas[0]?.id ?? '');
    if (selected) filterSelect.value = selected;

    const vagaBase = openVagas.find((vaga) => vaga.id === selected) || openVagas[0];
    if (!vagaBase || !Array.isArray(vagaBase.etapas)) {
      container.innerHTML = '<div class="loading">Nenhuma vaga aberta.</div>';
      return;
    }

    const etapas = vagaBase.etapas || [];
    const pipelineColumns = etapas.map((etapa) => {
      const candidaturas = this.candidaturas.filter((c) => c.vagaId === vagaBase.id && c.etapaAtualId === etapa.id);
      return { ...etapa, candidaturas };
    });

    container.innerHTML = pipelineColumns.map((etapa) => `
      <div class="pipeline-column">
        <div class="pipeline-column-header">
          ${etapa.nome}
          <span class="pipeline-column-count">${etapa.candidaturas.length}</span>
        </div>
        <div class="pipeline-cards">
          ${etapa.candidaturas.length === 0 ? '<div class="loading small">Vazio</div>' : etapa.candidaturas.map((candidatura) => {
            const candidato = this.candidatos.find((item) => item.id === candidatura.candidatoId);
            const nome = candidato?.dados?.nome || 'Candidato';
            const score = candidatura.score?.total ?? 0;
            return `
              <div class="candidatura-card" onclick="app.openCandidaturaDetails('${candidatura.id}')">
                <div class="candidatura-card-name">${nome}</div>
                <div class="candidatura-card-score">Score: ${score}%</div>
                ${candidatura.score?.destaque ? '<div class="pill destaque">⭐ Destaque</div>' : ''}
                <div class="pill">${candidatura.status || 'EM_ANDAMENTO'}</div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `).join('');
  }

  renderCandidatos() {
    const container = document.getElementById('candidatos-list');
    if (!container) return;

    if (!this.candidatos.length) {
      container.innerHTML = '<div class="loading">Nenhum candidato no banco.</div>';
      return;
    }

    container.innerHTML = this.candidatos.map((candidato) => `
      <div class="candidate-item">
        <div class="candidate-name">${candidato.dados?.nome || 'Nome não informado'}</div>
        <div class="candidate-meta">
          <div>📧 ${candidato.contato?.email || 'N/A'}</div>
          <div>📱 ${candidato.contato?.telefone || 'N/A'}</div>
          <div>📍 ${candidato.contato?.cidade || 'N/A'} / ${candidato.contato?.uf || 'N/A'}</div>
        </div>
      </div>
    `).join('');
  }

  async criarVaga() {
    const titulo = document.getElementById('vaga-titulo').value.trim();
    const descricao = document.getElementById('vaga-descricao').value.trim();
    const area = document.getElementById('vaga-area').value.trim();
    const nivel = document.getElementById('vaga-nivel').value;
    const cidade = document.getElementById('vaga-cidade').value.trim();
    const uf = document.getElementById('vaga-uf').value.trim();
    const salarioMin = Number(document.getElementById('vaga-salario-min').value || 0);
    const salarioMax = Number(document.getElementById('vaga-salario-max').value || 0);
    const quantidade = Number(document.getElementById('vaga-quantidade').value || 1);

    if (!titulo || !descricao) {
      this.showError('Título e descrição são obrigatórios');
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/vagas`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Labutar-Tenant': TENANT_ID,
          'X-Labutar-User': 'recrutador-teste'
        },
        body: JSON.stringify({
          titulo,
          descricao,
          area,
          nivel,
          local: { modelo: cidade ? 'PRESENCIAL' : 'REMOTO', cidade, uf },
          salario: { min: salarioMin, max: salarioMax, exibir: salarioMin > 0 || salarioMax > 0 },
          quantidadeVagas: quantidade,
          regrasTriagem: { corteMinimo: 60 }
        })
      });

      if (!response.ok) {
        throw new Error('Erro ao criar vaga');
      }

      const data = await response.json();
      this.vagas.push(data.dados.vaga);
      document.getElementById('modal-nova-vaga').classList.remove('active');
      document.getElementById('form-nova-vaga').reset();
      this.renderVagas();
      this.showSuccess('Vaga criada com sucesso');
    } catch (error) {
      console.error(error);
      this.showError('Erro ao criar vaga');
    }
  }

  async abrirVaga(vagaId) {
    const vaga = this.vagas.find((item) => item.id === vagaId);
    if (!vaga || vaga.status === 'ABERTA') return;

    try {
      const response = await fetch(`${API_BASE}/vagas/${vagaId}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Labutar-Tenant': TENANT_ID,
          'X-Labutar-User': 'recrutador-teste'
        },
        body: JSON.stringify({ para: 'ABERTA' })
      });

      if (!response.ok) {
        throw new Error('Erro ao abrir vaga');
      }

      const data = await response.json();
      const index = this.vagas.findIndex((item) => item.id === vagaId);
      this.vagas[index] = data.dados.vaga;
      this.renderVagas();
      this.showSuccess('Vaga aberta com sucesso');
    } catch (error) {
      console.error(error);
      this.showError('Erro ao abrir vaga');
    }
  }

  visualizeVagaPipeline(vagaId) {
    this.currentVagaFilter = vagaId;
    this.navigateTo('pipeline');
  }

  visualizarPipeline(vagaId) {
    this.visualizeVagaPipeline(vagaId);
  }

  async openCandidaturaDetails(candidaturaId) {
    const candidatura = this.candidaturas.find((item) => item.id === candidaturaId);
    if (!candidatura) return;

    const modal = document.getElementById('modal-candidatura');
    const body = document.getElementById('candidatura-body');
    const vaga = this.vagas.find((item) => item.id === candidatura.vagaId);
    const candidato = this.candidatos.find((item) => item.id === candidatura.candidatoId);
    const etapaAtual = vaga?.etapas?.find((etapa) => etapa.id === candidatura.etapaAtualId);
    const proximaEtapa = vaga?.etapas?.find((etapa, index, etapas) => {
      return etapas[index - 1]?.id === candidatura.etapaAtualId || (index === 0 && !etapas.some((item) => item.id === candidatura.etapaAtualId));
    });

    const proxima = vaga?.etapas && Array.isArray(vaga.etapas)
      ? vaga.etapas[vaga.etapas.findIndex((etapa) => etapa.id === candidatura.etapaAtualId) + 1]
      : null;

    const score = candidatura.score?.total ?? 0;
    const decisoes = candidatura.triagem?.decisao || 'sem decisão';

    body.innerHTML = `
      <div class="detail-grid">
        <div class="detail-box">
          <h4>Dados do candidato</h4>
          <p><strong>Nome:</strong> ${candidato?.dados?.nome || 'N/A'}</p>
          <p><strong>E-mail:</strong> ${candidato?.contato?.email || 'N/A'}</p>
          <p><strong>Telefone:</strong> ${candidato?.contato?.telefone || 'N/A'}</p>
          <p><strong>Local:</strong> ${candidato?.contato?.cidade || 'N/A'} / ${candidato?.contato?.uf || 'N/A'}</p>
        </div>

        <div class="detail-box">
          <h4>Dados da vaga</h4>
          <p><strong>Vaga:</strong> ${vaga?.titulo || candidatura.vagaTitulo || 'N/A'}</p>
          <p><strong>Etapa atual:</strong> ${etapaAtual?.nome || candidatura.etapaAtualId}</p>
          <p><strong>Decisão da triagem:</strong> ${decisoes}</p>
          <p><strong>Score:</strong> ${score}%</p>
        </div>
      </div>

      <div class="detail-box mt-1">
        <h4>Histórico</h4>
        <ul class="history-list">
          ${(candidatura.historico || []).map((item) => `
            <li>
              <span>${item.etapaId}</span>
              <small>${new Date(item.em).toLocaleString('pt-BR')}</small>
            </li>
          `).join('') || '<li>Sem histórico.</li>'}
        </ul>
      </div>

      <div class="modal-action-area">
        ${proxima ? `<button class="btn btn-primary" type="button" onclick="app.moverCandidatura('${candidatura.id}', '${proxima.id}')">Avançar para ${proxima.nome}</button>` : '<button class="btn btn-secondary" type="button" disabled>Finalizada</button>'}
      </div>
    `;

    modal.classList.add('active');
  }

  async moverCandidatura(candidaturaId, paraEtapaId) {
    try {
      const response = await fetch(`${API_BASE}/candidaturas/${candidaturaId}/mover`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Labutar-Tenant': TENANT_ID,
          'X-Labutar-User': 'recrutador-teste'
        },
        body: JSON.stringify({ paraEtapaId, observacao: 'Movido pelo painel de recrutador' })
      });

      if (!response.ok) {
        throw new Error('Erro ao mover candidatura');
      }

      const data = await response.json();
      const index = this.candidaturas.findIndex((item) => item.id === candidaturaId);
      if (index >= 0) {
        this.candidaturas[index] = { ...this.candidaturas[index], ...data.dados };
      }

      document.getElementById('modal-candidatura').classList.remove('active');
      this.renderPipeline();
      this.showSuccess('Candidatura movida com sucesso');
    } catch (error) {
      console.error(error);
      this.showError('Erro ao mover candidatura');
    }
  }

  showSuccess(message) {
    console.log(`✓ ${message}`);
  }

  showError(message) {
    console.error(`✗ ${message}`);
  }
}

window.app = new LabutarApp();
