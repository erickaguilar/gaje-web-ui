/* =============================================================================
   🧬 GAJE — static/js/chat/index.js
   Punto de entrada orquestador para los submódulos de la consola de chat.
   ============================================================================= */

(() => {
    'use strict';

    const bootChat = async () => {
        // 1. Inicializar el Composer prioritariamente para activar el botón enviar, textarea y starter cards
        try {
            if (window.ChatComposerController) window.ChatComposerController.init();
        } catch (err) {
            console.error('🔥 [GAJE-UI] Error inicializando ChatComposerController:', err);
        }

        // 2. Inicializar la barra de herramientas y carga de metadatos del modelo
        try {
            if (window.ChatToolbarController) await window.ChatToolbarController.init();
        } catch (err) {
            console.error('🔥 [GAJE-UI] Error inicializando ChatToolbarController:', err);
        }

        // 3. Inicializar telemetría HUD
        try {
            if (window.ChatTelemetryController) window.ChatTelemetryController.init();
        } catch (err) {
            console.error('🔥 [GAJE-UI] Error inicializando ChatTelemetryController:', err);
        }

        // 4. Renderizar historial previo si existe
        try {
            if (window.ChatStorage) await window.ChatStorage.renderHistory();
        } catch (err) {
            console.error('🔥 [GAJE-UI] Error renderizando historial:', err);
        }

        // Registrar inicio del sistema en consola
        const ver = window.GAJE_CONFIG?.version || '1.7.0-alpha';
        console.log(`🧬 [GAJE-CORE] Núcleo GAJE v${ver} iniciado. Inferencia nativa mmap zero-copy activa.`);
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
