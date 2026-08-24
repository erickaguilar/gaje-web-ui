/* =============================================================================
   🧬 GAJE — static/js/chat/index.js
   Punto de entrada orquestador para los submódulos de la consola de chat.
   ============================================================================= */

(() => {
    'use strict';

    const bootChat = async () => {
        if (window.ChatToolbarController) await window.ChatToolbarController.init();
        if (window.ChatComposerController) window.ChatComposerController.init();
        if (window.ChatTelemetryController) window.ChatTelemetryController.init();
        if (window.ChatStorage) await window.ChatStorage.renderHistory();
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootChat);
    } else {
        bootChat();
    }

    window.GajeChat = {
        get State() { return window.ChatState; },
        get Utils() { return window.ChatUtils; },
        get Markdown() { return window.ChatMarkdown; },
        get Storage() { return window.ChatStorage; },
        get Toolbar() { return window.ChatToolbarController; },
        get Engine() { return window.ChatEngineController; },
        get Composer() { return window.ChatComposerController; },
        get Telemetry() { return window.ChatTelemetryController; },
        reloadToolbar: () => window.ChatToolbarController?.init()
    };
})();
