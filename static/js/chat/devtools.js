/* =============================================================================
   🧬 GAJE — static/js/chat/devtools.js
   Controlador de la Consola DevTools Y2K, Diagnóstico y Filtros de Logs.
   Carga modular bajo demanda (Lazy Loaded Controller)
   ============================================================================= */

window.ChatDevToolsController = {
    _initialized: false,
    currentFilter: 'all',

    ensureStylesheet() {
        if (document.getElementById('gaje-console-css')) return;
        const link = document.createElement('link');
        link.id = 'gaje-console-css';
        link.rel = 'stylesheet';
        link.href = window.GAJE_CONFIG ? window.GAJE_CONFIG.assetUrl('static/css/console.css') : 'static/css/console.css';
        document.head.appendChild(link);
    },

    async ensureModal() {
        this.ensureStylesheet();
        let modal = document.getElementById('mobile-devtools-modal');
        if (modal) {
            if (!this._initialized) this.bindListeners(modal);
            return modal;
        }

        const url = window.GAJE_CONFIG ? window.GAJE_CONFIG.assetUrl('static/partials/devtools_modal.html') : 'static/partials/devtools_modal.html';
        try {
            const resp = await fetch(url);
            if (resp.ok) {
                const html = await resp.text();
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = html.trim();
                modal = tempDiv.firstElementChild;
                if (modal) {
                    document.body.appendChild(modal);
                    this.bindListeners(modal);
                    return modal;
                }
            }
        } catch (err) {
            console.warn('[DevTools] Error al cargar devtools_modal.html:', err);
        }
        return document.getElementById('mobile-devtools-modal');
    },

    bindListeners(modal) {
        if (!modal || this._initialized) return;
        this._initialized = true;

        modal.addEventListener('click', (e) => {
            if (e.target === modal) this.toggleConsole();
        });

        // Close actions
        const closeDot = document.getElementById('console-close-dot');
        const closeBtn = document.getElementById('console-btn-close');
        if (closeDot) closeDot.addEventListener('click', () => this.toggleConsole());
        if (closeBtn) closeBtn.addEventListener('click', () => this.toggleConsole());

        // Copy actions
        const copyDot = document.getElementById('console-copy-dot');
        const copyBtn = document.getElementById('console-btn-copy');
        if (copyDot) copyDot.addEventListener('click', () => this.copyLogs());
        if (copyBtn) copyBtn.addEventListener('click', () => this.copyLogs());

        // Clear actions
        const clearDot = document.getElementById('console-clear-dot');
        const clearBtn = document.getElementById('console-btn-clear');
        if (clearDot) clearDot.addEventListener('click', () => this.clearLogs());
        if (clearBtn) clearBtn.addEventListener('click', () => this.clearLogs());

        // Eruda injection
        const erudaBtn = document.getElementById('console-btn-eruda');
        if (erudaBtn) erudaBtn.addEventListener('click', () => this.injectEruda());

        // Filter chips
        const filterChips = modal.querySelectorAll('.console-filter-chip');
        filterChips.forEach(chip => {
            chip.addEventListener('click', () => {
                const filter = chip.getAttribute('data-filter') || 'all';
                this.setFilter(filter, chip);
            });
        });
    },

    async toggleConsole() {
        const modal = await this.ensureModal();
        if (!modal) return;
        const isHidden = modal.style.display === 'none';
        modal.style.display = isHidden ? 'flex' : 'none';
        if (isHidden) {
            this.renderLogs();
            const dd = document.getElementById('chat-actions-dropdown');
            if (dd) dd.hidden = true;
        }
    },

    setFilter(filterType, btnEl) {
        this.currentFilter = filterType;
        window.currentConsoleFilter = filterType;
        const modal = document.getElementById('mobile-devtools-modal');
        if (modal) {
            modal.querySelectorAll('.console-filter-chip').forEach(c => c.classList.remove('active'));
            if (btnEl) btnEl.classList.add('active');
        }
        this.renderLogs();
    },

    renderLogs() {
        const body = document.getElementById('mobile-devtools-body');
        const badgeToolbar = document.getElementById('mobile-err-badge');
        const badgeMenu = document.getElementById('mobile-err-badge-menu');
        const logs = window.gajeDevLogs || [];
        let errCount = 0;
        const filter = this.currentFilter || 'all';

        const filteredLogs = logs.filter(l => {
            if (l.type === 'error') errCount++;
            if (filter === 'all') return true;
            return l.type === filter;
        });

        if (body) {
            body.innerHTML = filteredLogs.map(l => {
                const rowClass = l.type === 'error' ? 'log-error' : (l.type === 'warn' ? 'log-warn' : 'log-info');
                const icon = l.type === 'error' ? '❌' : (l.type === 'warn' ? '⚠️' : 'ℹ️');
                return `<div class="console-log-row ${rowClass}">
                    <span class="console-log-time">[${l.time}]</span> ${icon} ${l.text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}
                </div>`;
            }).join('');
            body.scrollTop = body.scrollHeight;
        }

        const errStr = String(errCount);
        const showErr = errCount > 0;
        if (badgeToolbar) {
            badgeToolbar.textContent = errStr;
            badgeToolbar.style.display = showErr ? 'inline-flex' : 'none';
        }
        if (badgeMenu) {
            badgeMenu.textContent = errStr;
            badgeMenu.style.display = showErr ? 'inline-flex' : 'none';
        }
    },

    copyLogs() {
        const text = (window.gajeDevLogs || []).map(l => `[${l.time}] [${l.type.toUpperCase()}] ${l.text}`).join('\n');
        if (navigator.clipboard) {
            navigator.clipboard.writeText(text);
            window.ChatUtils?.showToast ? window.ChatUtils.showToast('📋 Logs copiados al portapapeles', 'success', 2500) : alert('Logs copiados.');
        }
    },

    clearLogs() {
        window.gajeDevLogs = [];
        this.renderLogs();
        if (window.ChatUtils?.showToast) {
            window.ChatUtils.showToast('🧹 Consola de logs reiniciada', 'info', 2000);
        }
    },

    injectEruda() {
        if (window.eruda) {
            window.eruda.show();
            return;
        }
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/eruda';
        s.onload = function () {
            window.eruda.init();
            window.eruda.show();
        };
        document.body.appendChild(s);
    }
};

// Exponer funciones globales para compatibilidad
window.toggleDevConsole = () => window.ChatDevToolsController.toggleConsole();
window.setConsoleFilter = (filter, btn) => window.ChatDevToolsController.setFilter(filter, btn);
window.renderDevLogs = () => window.ChatDevToolsController.renderLogs();
window.copyDevLogs = () => window.ChatDevToolsController.copyLogs();
window.clearDevLogs = () => window.ChatDevToolsController.clearLogs();
window.injectEruda = () => window.ChatDevToolsController.injectEruda();
