/* =============================================================================
   🧬 GAJE — static/js/chat/storage.js
   Persistencia de mensajes, historial y sincronización con GajeHelixDB.
   ============================================================================= */

window.ChatStorage = {
    pushHistory(entry) {
        if (!entry.time) {
            entry.time = (entry.metrics && entry.metrics.server_time) || (entry.meta && entry.meta.server_time) || window.ChatUtils.formatExactTime();
        }
        if (entry.metrics && !entry.meta) {
            entry.meta = entry.metrics;
        }
        if (entry.role === 'assistant' && !entry.model) {
            const modelSelect = document.getElementById('model-select');
            entry.model = modelSelect ? modelSelect.value : (window.ChatState?.activeModel || 'GAJE');
        }
        if (!entry.sessionId) {
            entry.sessionId = window.ChatState?.currentSessionId || window.ChatSidebarController?.activeSessionId || 'default';
        }
        if (window.GajeDB) {
            window.GajeDB.saveMessage(entry);
        }
        if (window.ChatSidebarController && typeof window.ChatSidebarController.renderSessions === 'function') {
            window.ChatSidebarController.renderSessions();
        }
    },

    clearHistory() {
        if (window.GajeDB) {
            window.GajeDB.clearAllMessages();
        }
    },

    async getRecentHistory(limit = 8, currentModel = null) {
        if (!window.GajeDB) return [];
        try {
            const targetSession = window.ChatState?.currentSessionId || 'default';
            const msgs = await window.GajeDB.getAllMessages(targetSession);
            if (!msgs || msgs.length === 0) return [];

            let filtered = msgs;
            if (currentModel) {
                let lastDiffIdx = -1;
                for (let i = msgs.length - 1; i >= 0; i--) {
                    const m = msgs[i];
                    if (m.role === 'assistant' && m.model && m.model !== currentModel) {
                        lastDiffIdx = i;
                        break;
                    }
                }
                if (lastDiffIdx !== -1) {
                    filtered = msgs.slice(lastDiffIdx + 1);
                }
            }

            return filtered.slice(-limit).map(e => ({ role: e.role, content: e.content }));
        } catch (e) {
            return [];
        }
    },

    async renderHistory(sessionId = null) {
        const chatWindow = document.getElementById('chat-window');
        if (!chatWindow || !window.GajeDB) return false;
        const targetSession = sessionId || window.ChatState?.currentSessionId || 'default';
        const arr = await window.GajeDB.getAllMessages(targetSession);
        if (!arr || arr.length === 0) {
            window.ChatComposerController?.showStarters();
            return false;
        }

        // Si hay historial almacenado, ocultar las preguntas rápidas
        window.ChatComposerController?.hideStarters();
        const starters = document.getElementById('chat-starters');
        if (starters) starters.style.display = 'none';

        arr.forEach(entry => {
            const posixVal = entry.timestampPosix || (entry.savedAt ? entry.savedAt / 1000 : null);
            const timeVal = (entry.meta && entry.meta.server_time) || entry.time || window.ChatUtils.formatExactTime(posixVal);
            const metaVal = entry.meta || entry.metrics || null;
            if (entry.role === 'user') {
                window.ChatComposerController?.addMessage(entry.content, 'user', null, timeVal, null, posixVal);
            } else if (entry.role === 'assistant') {
                window.ChatComposerController?.addMessage(entry.content, 'bot', metaVal, timeVal, entry.model, posixVal);
            } else if (entry.role === 'system') {
                window.ChatComposerController?.addMessage(entry.content, 'system', null, timeVal, null, posixVal);
            }
        });
        chatWindow.scrollTop = chatWindow.scrollHeight;
        return true;
    }
};
