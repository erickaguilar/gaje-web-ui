/**
 * 🧬 GAJE-WASM: Web Worker para Inferencia Client-Side Zero-Server
 * Ejecuta el organismo genómico completamente dentro de WebAssembly sin bloquear la UI.
 */

import init, { GajeWasmEngine } from '../wasm/_impl.js';

let wasmEngine = null;
let isInitialized = false;
let currentModelName = '';

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
                currentModelName = (typeof modelName === 'string') ? modelName.toLowerCase() : '';
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
                currentModelName = (typeof modelName === 'string') ? modelName.toLowerCase() : '';
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
                temperature = 0.65,
                minP = 0.05,
                repetitionPenalty = 1.05,
                injectRag = true,
                systemPrompt = 'Eres GAJE AI, un asistente genómico soberano, conciso y útil.',
                history = []
            } = payload;

            // Obtener plantilla conversacional canónica resuelta desde la cabecera/GTOK
            const chatTemplate = (typeof wasmEngine.get_chat_template === 'function')
                ? wasmEngine.get_chat_template()
                : 'chatml';

            // Formatear prompt respetando la plantilla declarada por el organismo
            let formattedPrompt = prompt;
            if (Array.isArray(history) && history.length > 0) {
                let contextBlock = '';
                if (chatTemplate === 'chatml') {
                    for (const msg of history.slice(-4)) {
                        if (msg && msg.content) {
                            const role = msg.role === 'assistant' ? 'assistant' : 'user';
                            contextBlock += `<|im_start|>${role}\n${msg.content}<|im_end|>\n`;
                        }
                    }
                    formattedPrompt = `<|im_start|>system\n${systemPrompt}<|im_end|>\n${contextBlock}<|im_start|>user\n${prompt}<|im_end|>\n<|im_start|>assistant\n`;
                } else if (chatTemplate === 'llama3') {
                    for (const msg of history.slice(-4)) {
                        if (msg && msg.content) {
                            const role = msg.role === 'assistant' ? 'assistant' : 'user';
                            contextBlock += `<|start_header_id|>${role}<|end_header_id|>\n\n${msg.content}<|eot_id|>`;
                        }
                    }
                    formattedPrompt = `<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\n${systemPrompt}<|eot_id|>${contextBlock}<|start_header_id|>user<|end_header_id|>\n\n${prompt}<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n\n`;
                } else if (chatTemplate === 'classic') {
                    for (const msg of history.slice(-4)) {
                        if (msg && msg.content) {
                            const role = msg.role === 'assistant' ? 'Assistant' : 'Human';
                            contextBlock += `${role}: ${msg.content}\n\n`;
                        }
                    }
                    formattedPrompt = `${contextBlock}Human: ${prompt}\n\nAssistant:`;
                } else {
                    formattedPrompt = (typeof wasmEngine.format_prompt === 'function')
                        ? wasmEngine.format_prompt(prompt, systemPrompt)
                        : prompt;
                }
            } else {
                formattedPrompt = (typeof wasmEngine.format_prompt === 'function')
                    ? wasmEngine.format_prompt(prompt, systemPrompt)
                    : prompt;
            }

            // Si el usuario configuró una temperatura explícita, respetarla con límite seguro [0.01, 1.0];
            // de lo contrario aplicar preset ontogénico según la plantilla del organismo
            const effectiveTemp = typeof temperature === 'number' && !isNaN(temperature)
                ? Math.min(Math.max(temperature, 0.01), 1.0)
                : ((chatTemplate === 'classic' || chatTemplate === 'raw') ? 0.65 : 0.40);
            const t0 = performance.now();
            let rawResponse = wasmEngine.chat_with_memory(formattedPrompt, maxTokens, effectiveTemp, repetitionPenalty, injectRag);
            const genTimeMs = (performance.now() - t0).toFixed(2);
            const memoryStats = JSON.parse(wasmEngine.get_memory_stats());
            let ragInjected = [];
            try {
                if (typeof wasmEngine.get_last_rag_injected === 'function') {
                    ragInjected = JSON.parse(wasmEngine.get_last_rag_injected());
                }
            } catch (_) {}

            // Limpieza de delimitadores ChatML / Llama3 / EOS en la salida
            let cleanResponse = (typeof rawResponse === 'string') ? rawResponse
                .replace(/<\|im_end\|>[\s\S]*$/gi, '')
                .replace(/<\|im_start\|>[\s\S]*$/gi, '')
                .replace(/<\|endoftext\|>[\s\S]*$/gi, '')
                .replace(/<\|eot_id\|>[\s\S]*$/gi, '')
                .replace(/<\|end_of_text\|>[\s\S]*$/gi, '')
                .replace(/<end_of_turn>[\s\S]*$/gi, '')
                .replace(/<\|end\|>[\s\S]*$/gi, '')
                .replace(/<\/s>[\s\S]*$/gi, '')
                .replace(/<eos>[\s\S]*$/gi, '')
                .trim() : '';

            // Auto-fallback resiliente: si la respuesta colapsó a EOS vacío o a un solo carácter (ej. '¡'),
            // reintentar con inferencia directa a temperatura 0.45 para superar el atractor prematuro de fin de secuencia
            if (!cleanResponse || cleanResponse.length <= 2) {
                const retryRaw = wasmEngine.chat(prompt, maxTokens, 0.45, repetitionPenalty);
                const retryClean = (typeof retryRaw === 'string') ? retryRaw
                    .replace(/<\|im_end\|>[\s\S]*$/gi, '')
                    .replace(/<\|im_start\|>[\s\S]*$/gi, '')
                    .replace(/<\|endoftext\|>[\s\S]*$/gi, '')
                    .replace(/<\|eot_id\|>[\s\S]*$/gi, '')
                    .replace(/<\|end_of_text\|>[\s\S]*$/gi, '')
                    .replace(/<end_of_turn>[\s\S]*$/gi, '')
                    .replace(/<\|end\|>[\s\S]*$/gi, '')
                    .replace(/<\/s>[\s\S]*$/gi, '')
                    .replace(/<eos>[\s\S]*$/gi, '')
                    .trim() : '';
                if (retryClean && retryClean.length > (cleanResponse ? cleanResponse.length : 0)) {
                    cleanResponse = retryClean;
                }
            }

            // Conteo forense de tokens vía tokenizador GTOK si está disponible
            let promptTokens = 0;
            let completionTokens = 0;
            try {
                if (typeof wasmEngine.encode === 'function') {
                    promptTokens = wasmEngine.encode(formattedPrompt).length;
                    if (cleanResponse) {
                        completionTokens = wasmEngine.encode(cleanResponse).length;
                    }
                }
            } catch (_) {}
            if (completionTokens === 0 && cleanResponse) {
                completionTokens = Math.max(1, Math.round(cleanResponse.trim().split(/\s+/).length * 1.3));
            }

            // Identificación forense de la causa de parada (Stop Reason)
            let stopReason = 'EOS_TOKEN';
            if (typeof rawResponse === 'string') {
                if (rawResponse.includes('<|im_end|>') || rawResponse.includes('<|eot_id|>') || rawResponse.includes('<|endoftext|>') || rawResponse.includes('<end_of_turn>') || rawResponse.includes('</s>')) {
                    stopReason = 'EOS_TOKEN';
                } else if (completionTokens >= (maxTokens - 2)) {
                    stopReason = 'MAX_TOKENS_LIMIT';
                } else {
                    stopReason = 'COMPLETED';
                }
            }

            self.postMessage({
                status: 'chat_response',
                response: cleanResponse,
                genTimeMs,
                memoryStats,
                effectiveTemp,
                requestedTemp: temperature,
                ragInjected,
                rawPrompt: formattedPrompt,
                chatTemplate,
                promptTokens,
                completionTokens,
                stopReason
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
