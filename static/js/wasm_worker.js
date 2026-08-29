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
        } else if (action === 'load_model_opfs') {
            const { modelName } = payload;
            try {
                if (!navigator.storage || !navigator.storage.getDirectory) {
                    throw new Error('OPFS (Origin Private File System) no está disponible en este entorno.');
                }
                const root = await navigator.storage.getDirectory();
                const fileHandle = await root.getFileHandle(modelName);
                const file = await fileHandle.getFile();
                const buffer = await file.arrayBuffer();
                const uint8Array = new Uint8Array(buffer);

                const t0 = performance.now();
                if (wasmEngine) {
                    try { wasmEngine.free(); } catch (_) {}
                    wasmEngine = null;
                }
                wasmEngine = GajeWasmEngine.load_from_bytes(uint8Array);
                const loadTimeMs = (performance.now() - t0).toFixed(2);
                const info = JSON.parse(wasmEngine.get_model_info());

                self.postMessage({
                    status: 'model_loaded',
                    modelName,
                    loadTimeMs,
                    source: 'OPFS',
                    info
                });
            } catch (err) {
                self.postMessage({
                    status: 'error',
                    code: 'GAJE-404',
                    name: 'OPFS_NOT_FOUND',
                    error: `No se pudo cargar [${modelName}] desde OPFS: ${err.message}`,
                    recommendation: 'Descarga el modelo nuevamente o selecciona modo servidor.'
                });
            }
        } else if (action === 'load_model') {
            const { buffer, modelName } = payload;
            const uint8Array = new Uint8Array(buffer);

            const t0 = performance.now();
            if (wasmEngine) {
                try { wasmEngine.free(); } catch (_) {}
                wasmEngine = null;
            }
            try {
                wasmEngine = GajeWasmEngine.load_from_bytes(uint8Array);
                const loadTimeMs = (performance.now() - t0).toFixed(2);
                const info = JSON.parse(wasmEngine.get_model_info());

                self.postMessage({
                    status: 'model_loaded',
                    modelName,
                    loadTimeMs,
                    info
                });
            } catch (wasmErr) {
                const msg = wasmErr?.message || String(wasmErr);
                let errCode = 'GAJE-500';
                let errName = 'KERNEL_PANIC';
                let friendlyErr = `Excepción en el Tronco Encefálico: ${msg}`;
                let recommendation = 'Verifica la integridad del archivo .flat o consulta el log del sistema.';

                if (msg.includes('unreachable') || msg.includes('memory') || uint8Array.byteLength > 600 * 1024 * 1024) {
                    errCode = 'GAJE-413';
                    errName = 'GENOME_HEAP_OVERFLOW';
                    friendlyErr = `El organismo (${(uint8Array.byteLength / (1024 * 1024)).toFixed(0)} MB) excede la memoria del cliente (32-bit heap limit).`;
                    recommendation = 'Para modelos medianos y grandes (>500 MB), selecciona "Modo Servidor (Nativo Rust AVX2)" en el menú de Motor.';
                } else if (msg.includes('gtok') || msg.includes('tokenizer')) {
                    errCode = 'GAJE-422';
                    errName = 'VOCAB_GTOK_MISSING';
                    friendlyErr = 'El archivo .flat no contiene el vocabulario binario GTOK incrustado necesario para la ejecución local.';
                    recommendation = 'Exporta el modelo incluyendo el tokenizador con gaje-cli export --embed-gtok.';
                }

                self.postMessage({
                    status: 'error',
                    code: errCode,
                    name: errName,
                    error: friendlyErr,
                    recommendation
                });
            }
        } else if (action === 'chat') {
            if (!wasmEngine) {
                self.postMessage({
                    status: 'error',
                    code: 'GAJE-503',
                    name: 'RUNTIME_UNAVAILABLE',
                    error: 'No hay ningún organismo activo en el Tronco Encefálico Local.',
                    recommendation: 'Carga un modelo .flat desde el menú o selecciona un organismo del catálogo.'
                });
                return;
            }

            const {
                prompt,
                maxTokens = 128,
                temperature = 0.4,
                repetitionPenalty = 1.15,
                injectRag = true,
                systemPrompt = 'Eres GAJE AI, un asistente genómico soberano, conciso y útil.',
                history = []
            } = payload;

            // Inyección automática de ChatML (<|im_start|> / <|im_end|>) si el prompt es texto plano
            let formattedPrompt = prompt;
            if (typeof prompt === 'string' && !prompt.includes('<|im_start|>') && !prompt.includes('<|user|>')) {
                let contextBlock = '';
                if (Array.isArray(history) && history.length > 0) {
                    for (const msg of history.slice(-4)) {
                        if (msg && msg.content) {
                            const role = msg.role === 'assistant' ? 'assistant' : 'user';
                            contextBlock += `<|im_start|>${role}\n${msg.content}<|im_end|>\n`;
                        }
                    }
                }
                formattedPrompt = `<|im_start|>system\n${systemPrompt}<|im_end|>\n${contextBlock}<|im_start|>user\n${prompt}<|im_end|>\n<|im_start|>assistant\n`;
            }

            const t0 = performance.now();
            let rawResponse = wasmEngine.chat_with_memory(formattedPrompt, maxTokens, temperature, repetitionPenalty, injectRag);
            const genTimeMs = (performance.now() - t0).toFixed(2);
            const memoryStats = JSON.parse(wasmEngine.get_memory_stats());

            // Limpieza de delimitadores ChatML en la salida
            let cleanResponse = rawResponse;
            if (typeof cleanResponse === 'string') {
                cleanResponse = cleanResponse
                    .replace(/<\|im_end\|>[\s\S]*$/gi, '')
                    .replace(/<\|im_start\|>[\s\S]*$/gi, '')
                    .replace(/<\|endoftext\|>[\s\S]*$/gi, '')
                    .replace(/<\|end\|>[\s\S]*$/gi, '')
                    .trim();
            }

            self.postMessage({
                status: 'chat_response',
                response: cleanResponse,
                genTimeMs,
                memoryStats
            });
        } else if (action === 'ingest_sensory') {
            if (!wasmEngine) throw new Error("Motor WASM no cargado");
            const { text, vector = [], niche = 'documental', customId = null } = payload;
            const entryId = wasmEngine.ingest_sensory(text, new Float32Array(vector), niche, customId);
            const memoryStats = JSON.parse(wasmEngine.get_memory_stats());
            self.postMessage({ status: 'sensory_ingested', entryId: Number(entryId), niche, memoryStats });
        } else if (action === 'retrieve_context') {
            if (!wasmEngine) throw new Error("Motor WASM no cargado");
            const { queryText = '', queryVector = [], topK = 3 } = payload;
            const contextsJson = wasmEngine.retrieve_context(queryText, new Float32Array(queryVector), topK);
            self.postMessage({ status: 'context_retrieved', contexts: JSON.parse(contextsJson) });
        } else if (action === 'sleep_cycle') {
            if (!wasmEngine) throw new Error("Motor WASM no cargado");
            const { dedupThreshold = 0.95 } = payload || {};
            const statsJson = wasmEngine.autonomic_sleep_cycle(dedupThreshold);
            const memoryStats = JSON.parse(wasmEngine.get_memory_stats());
            self.postMessage({ status: 'sleep_cycle_completed', stats: JSON.parse(statsJson), memoryStats });
        } else if (action === 'export_memory') {
            if (!wasmEngine) throw new Error("Motor WASM no cargado");
            const { niche = 'documental' } = payload;
            const gmemBytes = wasmEngine.export_gmem_island(niche);
            self.postMessage({ status: 'memory_exported', niche, buffer: gmemBytes.buffer }, [gmemBytes.buffer]);
        } else if (action === 'import_memory') {
            if (!wasmEngine) throw new Error("Motor WASM no cargado");
            const { niche = 'documental', buffer } = payload;
            wasmEngine.import_gmem_island(niche, new Uint8Array(buffer));
            const memoryStats = JSON.parse(wasmEngine.get_memory_stats());
            self.postMessage({ status: 'memory_imported', niche, memoryStats });
        } else if (action === 'memory_stats') {
            if (!wasmEngine) throw new Error("Motor WASM no cargado");
            const memoryStats = JSON.parse(wasmEngine.get_memory_stats());
            self.postMessage({ status: 'memory_stats_response', memoryStats });
        } else if (action === 'actuate') {
            if (!wasmEngine) throw new Error("Motor WASM no cargado");
            const { prompt, toolsSchemaJson = '[]' } = payload;
            const t0 = performance.now();
            const actionResponse = wasmEngine.actuate(prompt, toolsSchemaJson);
            const genTimeMs = (performance.now() - t0).toFixed(2);
            self.postMessage({ status: 'actuated', actionResponse, genTimeMs });
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
