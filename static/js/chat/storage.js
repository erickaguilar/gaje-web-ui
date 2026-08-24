/* =============================================================================
   🧬 GAJE — static/js/chat/storage.js
   Persistencia de mensajes, historial y sincronización con GajeHelixDB.
   ============================================================================= */

window.ChatStorage = {
    pushHistory(entry) {
        if (!entry.time) entry.time = window.ChatUtils.formatExactTime();
        if (entry.role === 'assistant' && !entry.model) {
            const modelSelect = document.getElementById('model-select');
            entry.model = modelSelect ? modelSelect.value : (window.ChatState?.activeModel || 'GAJE');
        }
        if (window.GajeDB) {
            window.GajeDB.saveMessage(entry);
        }
    },

    clearHistory() {
        if (window.GajeDB) {
            window.GajeDB.clearAllMessages();
        }
    },

    async getRecentHistory(limit = 8) {
        if (!window.GajeDB) return [];
        try {
            const msgs = await window.GajeDB.getAllMessages();
            return (msgs || []).slice(-limit).map(e => ({ role: e.role, content: e.content }));
        } catch (e) {
            return [];
        }
    },

    async renderHistory() {
        const chatWindow = document.getElementById('chat-window');
        if (!chatWindow || !window.GajeDB) return;
        const arr = await window.GajeDB.getAllMessages();
        if (!arr || arr.length === 0) return;
        arr.forEach(entry => {
            if (entry.role === 'user') window.ChatComposerController?.addMessage(entry.content, 'user', null, entry.time);
            else if (entry.role === 'assistant') window.ChatComposerController?.addMessage(entry.content, 'bot', entry.meta || null, entry.time, entry.model);
            else if (entry.role === 'system') window.ChatComposerController?.addMessage(entry.content, 'system', null, entry.time);
        });
        chatWindow.scrollTop = chatWindow.scrollHeight;
    }
};
