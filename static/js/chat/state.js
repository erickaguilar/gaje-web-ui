/* =============================================================================
   🧬 GAJE — static/js/chat/state.js
   Gestor central de estado reactivo del chat.
   ============================================================================= */

window.ChatState = {
    activeModel: 'qwen2_5_3b.flat',
    engineMode: 'native', // 'native' | 'wasm'
    isGenerating: false,
    abortController: null,
    modelsData: [
        { name: 'qwen2_5_3b.flat', size_bytes: 2405756928, date: '2026-08-09 22:57', ram_mb: 0.0 },
        { name: 'deepseek_r1_1_5b.flat', size_bytes: 1324845056, date: '2026-08-21 23:28', ram_mb: 0.0 },
        { name: 'qwen2_0_5b.flat', size_bytes: 522679808, date: '2026-08-09 14:17', ram_mb: 0.0 },
        { name: 'smollm2_135m.flat', size_bytes: 496182528, date: '2026-08-19 00:33', ram_mb: 0.0 }
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
