/* =============================================================================
   🧬 GAJE — static/js/chat/state.js
   Gestor central de estado reactivo del chat.
   ============================================================================= */

window.ChatState = {
    activeModel: 'max.gaje',
    engineMode: 'wasm', // 'wasm' | 'native'
    temperature: parseFloat(localStorage.getItem('gaje_temperature')) || 0.3,
    isGenerating: false,
    abortController: null,
    modelsData: [
        { name: 'max.gaje', size_bytes: 104409712, date: '2026-08-30 00:38', ram_mb: 120.0 }
    ],
    envData: null,
    wasmWorker: null,
    isWasmModelLoaded: false,
    wasmActiveModelName: null,
    autonomic: {
        interactionsLimit: 12,
        maxIntervalMs: 5 * 60 * 1000,
        tickMs: 60 * 1000,
        interactions: 0,
        lastCycleAt: Date.now(),
        tickTimer: null,
        inFlight: false
    },
    systemAlertsHistory: [
        `[${new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}] Núcleo GAJE iniciado. Listo para compresión semántica.`
    ]
};
