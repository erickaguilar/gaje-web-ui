/* =============================================================================
   🧬 GAJE — static/js/chat/sidebar.js
   Controlador de Barra Lateral / Cajón Móvil de Sesiones e Historial.
   ============================================================================= */

window.ChatSidebarController = {
    isLoaded: false,
    activeSessionId: 'default',

    async init() {
        const drawer = document.getElementById('chat-sidebar-drawer');
        if (!drawer) return;

        // Cargar template parcial si está vacío
        if (!this.isLoaded) {
            await this.loadPartial();
        }

        this.bindEvents();
        await this.renderSessions();
    },

    async loadPartial() {
        const drawer = document.getElementById('chat-sidebar-drawer');
        if (!drawer) return;
        try {
            const url = window.GAJE_CONFIG ? window.GAJE_CONFIG.assetUrl('static/partials/sidebar.html') : 'static/partials/sidebar.html?v=1.7.4';
            const res = await fetch(url);
            if (res.ok) {
                drawer.innerHTML = await res.text();
                this.isLoaded = true;
            }
        } catch (e) {
            console.warn('[Sidebar] No se pudo cargar partial sidebar.html:', e);
        }
    },

    bindEvents() {
        const drawer = document.getElementById('chat-sidebar-drawer');
        const backdrop = document.getElementById('sidebar-backdrop');
        const closeBtn = document.getElementById('sidebar-close-btn');
        const newChatBtn = document.getElementById('sidebar-new-chat-btn');
        const clearBtn = document.getElementById('sidebar-clear-btn');
        const exportBtn = document.getElementById('sidebar-export-btn');

        if (backdrop) {
            backdrop.addEventListener('click', () => this.close());
        }

        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.close());
        }

        if (newChatBtn) {
            newChatBtn.addEventListener('click', () => this.newSession());
        }

        if (clearBtn) {
            clearBtn.addEventListener('click', async () => {
                if (confirm('¿Deseas eliminar todas las conversaciones y vaciar el almacenamiento?')) {
                    if (window.ChatStorage) window.ChatStorage.clearHistory();
                    const chatWindow = document.getElementById('chat-window');
                    if (chatWindow) chatWindow.innerHTML = '';
                    window.ChatComposerController?.showStarters();
                    await this.renderSessions();
                    this.close();
                    window.ChatUtils?.showToast('Historial completo eliminado.', 'info', 3000);
                }
            });
        }

        if (exportBtn) {
            exportBtn.addEventListener('click', async () => {
                if (!window.GajeDB) return;
                const msgs = await window.GajeDB.getAllMessages();
                const blob = new Blob([JSON.stringify(msgs, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `gaje_conversations_${Date.now()}.json`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
                window.ChatUtils?.showToast('Historial exportado en JSON.', 'success', 3000);
            });
        }
    },

    toggle() {
        const drawer = document.getElementById('chat-sidebar-drawer');
        if (!drawer) return;
        const isOpen = drawer.classList.contains('open');
        if (isOpen) {
            this.close();
        } else {
            this.open();
        }
    },

    open() {
        const drawer = document.getElementById('chat-sidebar-drawer');
        const backdrop = document.getElementById('sidebar-backdrop');
        if (!drawer) return;

        drawer.classList.add('open');
        if (backdrop) backdrop.classList.add('active');
        this.renderSessions();
    },

    close() {
        const drawer = document.getElementById('chat-sidebar-drawer');
        const backdrop = document.getElementById('sidebar-backdrop');
        if (drawer) drawer.classList.remove('open');
        if (backdrop) backdrop.classList.remove('active');
    },

    async newSession() {
        this.activeSessionId = 'session_' + Date.now();
        if (window.ChatState) window.ChatState.currentSessionId = this.activeSessionId;

        const chatWindow = document.getElementById('chat-window');
        if (chatWindow) {
            chatWindow.innerHTML = '';
        }

        window.ChatComposerController?.showStarters();
        this.close();
        await this.renderSessions();
        window.ChatUtils?.showToast('Nueva sesión iniciada.', 'info', 2500);
    },

    async switchSession(sessionId) {
        this.activeSessionId = sessionId;
        if (window.ChatState) window.ChatState.currentSessionId = sessionId;

        const chatWindow = document.getElementById('chat-window');
        if (chatWindow) chatWindow.innerHTML = '';

        if (window.ChatStorage && typeof window.ChatStorage.renderHistory === 'function') {
            await window.ChatStorage.renderHistory(sessionId);
        }

        this.close();
        await this.renderSessions();
    },

    async renderSessions() {
        const listEl = document.getElementById('sidebar-sessions-list');
        const countEl = document.getElementById('sidebar-session-count');
        const emptyEl = document.getElementById('sidebar-empty-state');
        if (!listEl || !window.GajeDB) return;

        const allMsgs = await window.GajeDB.getAllMessages();
        if (!allMsgs || allMsgs.length === 0) {
            listEl.innerHTML = '';
            if (countEl) countEl.textContent = '0';
            if (emptyEl) emptyEl.style.display = 'flex';
            return;
        }

        if (emptyEl) emptyEl.style.display = 'none';

        // Agrupar mensajes por sessionId
        const sessionsMap = new Map();
        allMsgs.forEach(m => {
            const sid = m.sessionId || 'default';
            if (!sessionsMap.has(sid)) {
                sessionsMap.set(sid, []);
            }
            sessionsMap.get(sid).push(m);
        });

        if (countEl) countEl.textContent = String(sessionsMap.size);

        let html = '';
        sessionsMap.forEach((msgs, sid) => {
            const firstUserMsg = msgs.find(m => m.role === 'user');
            const rawTitle = firstUserMsg ? firstUserMsg.content : (msgs[0]?.content || 'Conversación sin título');
            const title = rawTitle.slice(0, 36) + (rawTitle.length > 36 ? '...' : '');
            const lastTime = msgs[msgs.length - 1]?.time || 'Reciente';
            const isActive = sid === this.activeSessionId ? ' active' : '';

            html += `
                <li class="sidebar-session-item${isActive}" onclick="window.ChatSidebarController.switchSession('${sid}')">
                    <div class="session-info">
                        <span class="session-title">${window.ChatUtils?.escapeHtml(title) || title}</span>
                        <span class="session-time">${lastTime} · ${msgs.length} mensajes</span>
                    </div>
                    <button type="button" class="session-del-btn" onclick="event.stopPropagation(); window.ChatSidebarController.deleteSession('${sid}')" title="Eliminar conversación">
                        ✕
                    </button>
                </li>
            `;
        });

        listEl.innerHTML = html;
    },

    async deleteSession(sessionId) {
        if (!window.GajeDB) return;
        try {
            await window.GajeDB.deleteMessagesBySession(sessionId);
            if (this.activeSessionId === sessionId) {
                this.activeSessionId = 'default';
                const chatWindow = document.getElementById('chat-window');
                if (chatWindow) chatWindow.innerHTML = '';
                window.ChatComposerController?.showStarters();
            }
            await this.renderSessions();
            window.ChatUtils?.showToast('Conversación eliminada.', 'info', 2500);
        } catch (e) {
            console.warn('[Sidebar] Error eliminando sesión:', e);
        }
    }
};
