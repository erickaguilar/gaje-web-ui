/**
 * 🧬 GAJE-WASM: Web Worker para Inferencia Client-Side Zero-Server
 * Ejecuta el organismo genómico completamente dentro de WebAssembly sin bloquear la UI.
 */

import init, { GajeWasmEngine } from '../wasm/_impl.js';

let wasmEngine = null;
let isInitialized = false;

self.onmessage = async (e) => {
    const { action, payload } = e.data;

    try {
        if (action === 'init') {
            if (!isInitialized) {
                await init({ module_or_path: '/static/wasm/_impl_bg.wasm' });
                GajeWasmEngine.init_engine();
                isInitialized = true;
            }
            self.postMessage({ status: 'ready' });
        } else if (action === 'load_model') {
            const { buffer, modelName } = payload;
            const uint8Array = new Uint8Array(buffer);

            const t0 = performance.now();
            if (wasmEngine) {
                wasmEngine.free();
                wasmEngine = null;
            }
            wasmEngine = GajeWasmEngine.load_from_bytes(uint8Array);
            const loadTimeMs = (performance.now() - t0).toFixed(2);
            const info = JSON.parse(wasmEngine.get_model_info());

            self.postMessage({
                status: 'model_loaded',
                modelName,
                loadTimeMs,
                info
            });
        } else if (action === 'chat') {
            if (!wasmEngine) {
                throw new Error("No hay ningún modelo cargado en WebAssembly");
            }

            const { prompt, maxTokens = 64, temperature = 0.7, repetitionPenalty = 1.1 } = payload;
            const t0 = performance.now();
            const response = wasmEngine.chat(prompt, maxTokens, temperature, repetitionPenalty);
            const genTimeMs = (performance.now() - t0).toFixed(2);

            self.postMessage({
                status: 'chat_response',
                response,
                genTimeMs
            });
        } else if (action === 'reset') {
            if (wasmEngine) {
                wasmEngine.reset_cache();
            }
            self.postMessage({ status: 'cache_reset' });
        }
    } catch (err) {
        self.postMessage({
            status: 'error',
            error: err.message || String(err)
        });
    }
};
