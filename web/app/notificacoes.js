/**
 * Sistema de notificações do painel
 * Exibe toasts com sucesso, erro, aviso, etc
 */

export class NotificadorUI {
  constructor() {
    this.container = null;
    this.inicializar();
  }

  inicializar() {
    // Criar container de notificações se não existir
    if (!document.getElementById('notificacoes-container')) {
      const div = document.createElement('div');
      div.id = 'notificacoes-container';
      div.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 10000;
        max-width: 400px;
      `;
      document.body.appendChild(div);
    }
    this.container = document.getElementById('notificacoes-container');
  }

  criar(mensagem, tipo = 'info', duracao = 5000) {
    const id = `notif-${Date.now()}-${Math.random()}`;
    const cores = {
      sucesso: '#10b981',
      erro: '#ef4444',
      aviso: '#f59e0b',
      info: '#3b82f6',
    };
    const icones = {
      sucesso: '✓',
      erro: '✕',
      aviso: '⚠',
      info: 'ℹ',
    };

    const el = document.createElement('div');
    el.id = id;
    el.style.cssText = `
      background: white;
      border-left: 4px solid ${cores[tipo] || cores.info};
      border-radius: 4px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      padding: 16px;
      margin-bottom: 12px;
      display: flex;
      gap: 12px;
      align-items: flex-start;
      animation: slideInRight 0.3s ease-out;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 14px;
      line-height: 1.5;
    `;

    el.innerHTML = `
      <span style="color: ${cores[tipo] || cores.info}; font-weight: bold; font-size: 18px; flex-shrink: 0;">
        ${icones[tipo]}
      </span>
      <span style="flex-grow: 1; color: #1f2937;">
        ${this.escaparHTML(mensagem)}
      </span>
      <button 
        onclick="document.getElementById('${id}').remove()" 
        style="
          background: none;
          border: none;
          color: #9ca3af;
          cursor: pointer;
          font-size: 20px;
          padding: 0;
          flex-shrink: 0;
        "
      >
        ×
      </button>
    `;

    this.container.appendChild(el);

    if (duracao > 0) {
      setTimeout(() => {
        const el = document.getElementById(id);
        if (el) {
          el.style.animation = 'slideOutRight 0.3s ease-out forwards';
          setTimeout(() => el.remove(), 300);
        }
      }, duracao);
    }

    return id;
  }

  sucesso(mensagem, duracao = 5000) {
    return this.criar(mensagem, 'sucesso', duracao);
  }

  erro(mensagem, duracao = 7000) {
    return this.criar(mensagem, 'erro', duracao);
  }

  aviso(mensagem, duracao = 6000) {
    return this.criar(mensagem, 'aviso', duracao);
  }

  info(mensagem, duracao = 4000) {
    return this.criar(mensagem, 'info', duracao);
  }

  remover(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
  }

  escaparHTML(texto) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return String(texto).replace(/[&<>"']/g, (m) => map[m]);
  }
}

// Criar instância global
export const notificador = new NotificadorUI();

// Adicionar estilos de animação
if (typeof document !== 'undefined' && !document.getElementById('notificacoes-estilos')) {
  const style = document.createElement('style');
  style.id = 'notificacoes-estilos';
  style.textContent = `
    @keyframes slideInRight {
      from {
        opacity: 0;
        transform: translateX(400px);
      }
      to {
        opacity: 1;
        transform: translateX(0);
      }
    }

    @keyframes slideOutRight {
      from {
        opacity: 1;
        transform: translateX(0);
      }
      to {
        opacity: 0;
        transform: translateX(400px);
      }
    }
  `;
  document.head.appendChild(style);
}
