/* =============================================================================
   🧬 GAJE — static/js/chat/sidebar.js
   Controlador de Barra Lateral / Cajón Móvil de Historial de Conversaciones.
   Soporta búsqueda en vivo, renombrado de títulos, exportación individual y
   agrupación cronológica bajo el sistema Tri-Theme.
   ============================================================================= */

window.ChatSidebarController = {
    isLoaded: false,
    activeSessionId: 'default',
    searchQuery: '',
    editingSessionId: null,

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
        const backdrop = document.getElementById('sidebar-backdrop');
        const closeBtn = document.getElementById('sidebar-close-btn');
        const newChatBtn = document.getElementById('sidebar-new-chat-btn');
        const clearBtn = document.getElementById('sidebar-clear-btn');
        const exportBtn = document.getElementById('sidebar-export-btn');
        const searchInput = document.getElementById('sidebar-search-input');
        const searchClear = document.getElementById('sidebar-search-clear-btn');

        if (backdrop) {
            backdrop.addEventListener('click', () => this.close());
        }

        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.close());
        }

        if (newChatBtn) {
            newChatBtn.addEventListener('click', () => this.newSession());
        }

        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchQuery = (e.target.value || '').toLowerCase().trim();
                if (searchClear) {
                    searchClear.style.display = this.searchQuery ? 'inline-flex' : 'none';
                }
                this.renderSessions();
            });
            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    this.clearSearch();
                }
            });
        }

        if (searchClear) {
            searchClear.addEventListener('click', () => this.clearSearch());
        }

        if (clearBtn) {
            clearBtn.addEventListener('click', async () => {
                if (confirm('¿Deseas eliminar todo el historial de conversaciones de forma permanente?')) {
                    if (window.ChatStorage) window.ChatStorage.clearHistory();
                    const chatWindow = document.getElementById('chat-window');
                    if (chatWindow) chatWindow.innerHTML = '';
                    window.ChatComposerController?.showStarters();
                    this.activeSessionId = 'default';
                    if (window.ChatState) window.ChatState.currentSessionId = 'default';
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
                const sessions = await window.GajeDB.getAllSessions();
                const payload = {
                    exportedAt: new Date().toISOString(),
                    totalSessions: sessions.length,
                    totalMessages: msgs.length,
                    sessions: sessions,
                    messages: msgs
                };
                const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `gaje_backup_conversaciones_${Date.now()}.json`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
                window.ChatUtils?.showToast('Copia de seguridad descargada en JSON.', 'success', 3000);
            });
        }

        // Atajo teclado Escape para cerrar Drawer si está abierto
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const drawer = document.getElementById('chat-sidebar-drawer');
                if (drawer && drawer.classList.contains('open')) {
                    this.close();
                }
            }
        });
    },

    clearSearch() {
        const searchInput = document.getElementById('sidebar-search-input');
        const searchClear = document.getElementById('sidebar-search-clear-btn');
        if (searchInput) searchInput.value = '';
        if (searchClear) searchClear.style.display = 'none';
        this.searchQuery = '';
        this.renderSessions();
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

        const searchInput = document.getElementById('sidebar-search-input');
        if (searchInput && window.innerWidth > 600) {
            setTimeout(() => searchInput.focus(), 150);
        }
    },

    close() {
        const drawer = document.getElementById('chat-sidebar-drawer');
        const backdrop = document.getElementById('sidebar-backdrop');
        if (drawer) drawer.classList.remove('open');
        if (backdrop) backdrop.classList.remove('active');
        this.editingSessionId = null;
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
        window.ChatUtils?.showToast('Nueva conversación lista.', 'info', 2200);

        // Foco inmediato en el área de texto del prompt
        const promptInput = document.getElementById('chat-input') || document.getElementById('user-input');
        if (promptInput) promptInput.focus();
    },

    async switchSession(sessionId) {
        if (this.editingSessionId) return; // Evitar cambio mientras edita
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
        const noResultsEl = document.getElementById('sidebar-no-results');
        const toolbarBadge = document.getElementById('sidebar-toolbar-badge');
        if (!listEl || !window.GajeDB) return;

        const [allMsgs, storedSessions] = await Promise.all([
            window.GajeDB.getAllMessages(),
            window.GajeDB.getAllSessions()
        ]);

        const sessionsMetadataMap = new Map();
        (storedSessions || []).forEach(s => sessionsMetadataMap.set(s.sessionId, s));

        if (!allMsgs || allMsgs.length === 0) {
            listEl.innerHTML = '';
            if (countEl) countEl.textContent = '0';
            if (toolbarBadge) toolbarBadge.style.display = 'none';
            if (emptyEl) emptyEl.style.display = 'flex';
            if (noResultsEl) noResultsEl.style.display = 'none';
            return;
        }

        // Agrupar mensajes por sessionId
        const sessionsMap = new Map();
        allMsgs.forEach(m => {
            const sid = m.sessionId || 'default';
            if (!sessionsMap.has(sid)) {
                sessionsMap.set(sid, []);
            }
            sessionsMap.get(sid).push(m);
        });

        const totalCount = sessionsMap.size;
        if (countEl) countEl.textContent = String(totalCount);
        if (toolbarBadge) {
            toolbarBadge.textContent = String(totalCount);
            toolbarBadge.style.display = totalCount > 0 ? 'inline-flex' : 'none';
        }

        // Generar lista de sesiones enriquecida
        const sessionList = [];
        sessionsMap.forEach((msgs, sid) => {
            const meta = sessionsMetadataMap.get(sid);
            const firstUserMsg = msgs.find(m => m.role === 'user');
            const defaultTitle = firstUserMsg ? firstUserMsg.content : (msgs[0]?.content || 'Conversación');
            const cleanTitle = (defaultTitle.replace(/\s+/g, ' ').trim()).slice(0, 48);
            const title = meta?.title || cleanTitle || 'Conversación sin título';
            const lastMsg = msgs[msgs.length - 1];
            const lastActivity = meta?.lastActivity || lastMsg?.savedAt || Date.now();
            const lastTime = lastMsg?.time || this.formatRelativeTime(lastActivity);
            const model = meta?.model || lastMsg?.model || 'GAJE';

            sessionList.push({
                sessionId: sid,
                title: title,
                lastActivity: lastActivity,
                lastTime: lastTime,
                msgCount: msgs.length,
                model: model,
                msgs: msgs
            });
        });

        // Ordenar descendentemente por última actividad
        sessionList.sort((a, b) => b.lastActivity - a.lastActivity);

        // Filtrar por término de búsqueda si existe
        let filteredList = sessionList;
        if (this.searchQuery) {
            const q = this.searchQuery;
            filteredList = sessionList.filter(s => {
                const inTitle = s.title.toLowerCase().includes(q);
                const inMsgs = s.msgs.some(m => (m.content && m.content.toLowerCase().includes(q)));
                return inTitle || inMsgs;
            });
        }

        if (filteredList.length === 0) {
            listEl.innerHTML = '';
            if (emptyEl) emptyEl.style.display = 'none';
            if (noResultsEl) noResultsEl.style.display = 'flex';
            return;
        }

        if (emptyEl) emptyEl.style.display = 'none';
        if (noResultsEl) noResultsEl.style.display = 'none';

        // Agrupar cronológicamente: Hoy, Ayer, Esta Semana, Anteriores
        const groups = {
            today: [],
            yesterday: [],
            week: [],
            older: []
        };

        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const startOfYesterday = startOfToday - (24 * 60 * 60 * 1000);
        const startOfWeek = startOfToday - (7 * 24 * 60 * 60 * 1000);

        filteredList.forEach(item => {
            const act = item.lastActivity;
            if (act >= startOfToday) {
                groups.today.push(item);
            } else if (act >= startOfYesterday) {
                groups.yesterday.push(item);
            } else if (act >= startOfWeek) {
                groups.week.push(item);
            } else {
                groups.older.push(item);
            }
        });

        let finalHtml = '';
        const groupLabels = [
            { key: 'today', title: 'Hoy' },
            { key: 'yesterday', title: 'Ayer' },
            { key: 'week', title: 'Últimos 7 días' },
            { key: 'older', title: 'Anteriores' }
        ];

        groupLabels.forEach(grp => {
            const items = groups[grp.key];
            if (items && items.length > 0) {
                finalHtml += `<li class="sidebar-date-group-header" role="presentation">${grp.title}</li>`;
                items.forEach(item => {
                    finalHtml += this.renderSessionItemHtml(item);
                });
            }
        });

        listEl.innerHTML = finalHtml;
    },

    renderSessionItemHtml(item) {
        const sid = item.sessionId;
        const isActive = sid === this.activeSessionId ? ' active' : '';
        const isEditing = sid === this.editingSessionId;
        const escapedTitle = window.ChatUtils?.escapeHtml ? window.ChatUtils.escapeHtml(item.title) : item.title;
        const shortModel = (item.model || 'GAJE').replace('.flat', '').replace('.gaje', '');

        if (isEditing) {
            return `
                <li class="sidebar-session-item editing" onclick="event.stopPropagation();">
                    <div class="session-rename-form">
                        <input type="text" id="rename-input-${sid}" class="session-rename-input" value="${escapedTitle}" maxlength="60" aria-label="Editar título de conversación">
                        <div class="session-rename-actions">
                            <button type="button" class="rename-confirm-btn" onclick="window.ChatSidebarController.saveRename('${sid}')" title="Guardar título">✓</button>
                            <button type="button" class="rename-cancel-btn" onclick="window.ChatSidebarController.cancelRename()" title="Cancelar">✕</button>
                        </div>
                    </div>
                </li>
            `;
        }

        return `
            <li class="sidebar-session-item${isActive}" onclick="window.ChatSidebarController.switchSession('${sid}')" role="button" tabindex="0" aria-label="Conversación: ${escapedTitle}">
                <div class="session-info">
                    <div class="session-title-row">
                        <span class="session-title" title="${escapedTitle}">${escapedTitle}</span>
                    </div>
                    <div class="session-meta-row">
                        <span class="session-model-badge">${shortModel}</span>
                        <span class="session-time">${item.lastTime} · ${item.msgCount} msgs</span>
                    </div>
                </div>
                <div class="session-actions-group" onclick="event.stopPropagation();">
                    <button type="button" class="session-action-btn edit-btn" onclick="window.ChatSidebarController.startRename('${sid}', event)" title="Renombrar conversación" aria-label="Renombrar">
                        <svg class="y2k-icon-inline"><use href="static/icons/y2k/sprite.svg#i-settings"/></svg>
                    </button>
                    <button type="button" class="session-action-btn export-btn" onclick="window.ChatSidebarController.exportSingle('${sid}', event)" title="Exportar conversación (.md)" aria-label="Exportar Markdown">
                        <svg class="y2k-icon-inline"><use href="static/icons/y2k/sprite.svg#i-download"/></svg>
                    </button>
                    <button type="button" class="session-action-btn del-btn" onclick="window.ChatSidebarController.deleteSession('${sid}', event)" title="Eliminar conversación" aria-label="Eliminar">
                        <svg class="y2k-icon-inline"><use href="static/icons/y2k/sprite.svg#i-stop"/></svg>
                    </button>
                </div>
            </li>
        `;
    },

    formatRelativeTime(timestamp) {
        if (!timestamp) return 'Reciente';
        const diff = Date.now() - timestamp;
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'Ahora';
        if (mins < 60) return `${mins}m`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours}h`;
        const days = Math.floor(hours / 24);
        if (days < 7) return `${days}d`;
        return new Date(timestamp).toLocaleDateString('es-ES', { month: 'short', day: 'numeric' });
    },

    startRename(sessionId, event) {
        if (event) event.stopPropagation();
        this.editingSessionId = sessionId;
        this.renderSessions();
        setTimeout(() => {
            const input = document.getElementById(`rename-input-${sessionId}`);
            if (input) {
                input.focus();
                input.select();
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') this.saveRename(sessionId);
                    if (e.key === 'Escape') this.cancelRename();
                });
            }
        }, 60);
    },

    async saveRename(sessionId) {
        const input = document.getElementById(`rename-input-${sessionId}`);
        if (!input) return;
        const newTitle = (input.value || '').trim();
        if (newTitle && window.GajeDB) {
            await window.GajeDB.updateSessionTitle(sessionId, newTitle);
            window.ChatUtils?.showToast('Título actualizado.', 'success', 2000);
        }
        this.editingSessionId = null;
        await this.renderSessions();
    },

    cancelRename() {
        this.editingSessionId = null;
        this.renderSessions();
    },

    async exportSingle(sessionId, event) {
        if (event) event.stopPropagation();
        if (!window.GajeDB) return;
        const res = await window.GajeDB.exportSessionMarkdown(sessionId);
        if (res) {
            window.ChatUtils?.showToast('Conversación exportada en Markdown.', 'success', 2500);
        } else {
            window.ChatUtils?.showToast('No se pudo exportar la conversación.', 'error', 3000);
        }
    },

    async deleteSession(sessionId, event) {
        if (event) event.stopPropagation();
        if (!window.GajeDB) return;

        if (!confirm('¿Deseas eliminar esta conversación de forma permanente?')) {
            return;
        }

        try {
            await window.GajeDB.deleteMessagesBySession(sessionId);
            if (this.activeSessionId === sessionId) {
                this.activeSessionId = 'default';
                if (window.ChatState) window.ChatState.currentSessionId = 'default';
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
