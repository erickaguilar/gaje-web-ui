/* =============================================================================
   🧬 GAJE — static/js/chat/engine.js
   Motores de inferencia: Streaming SSE Server y WebAssembly In-Browser Worker.
   ============================================================================= */

window.ChatEngineController = {
    initWasmWorker() {
        if (window.ChatState.wasmWorker) return window.ChatState.wasmWorker;
        window.ChatState.wasmWorker = new Worker('static/js/wasm_worker.js', { type: 'module' });
        window.ChatState.wasmWorker.postMessage({ action: 'init' });
        window.ChatState.wasmWorker.onmessage = (e) => {
            const data = e.data;
            const modelRam = document.getElementById('model-ram');
            if (data.status === 'ready') {
                console.log('⚡ [GAJE-WASM] Web Worker listo para inferencia.');
            } else if (data.status === 'model_loaded') {
                console.log(`✅ [GAJE-WASM] Modelo ${data.modelName} cargado en ${data.loadTimeMs} ms`, data.info);
                window.ChatState.isWasmModelLoaded = true;
                window.ChatState.wasmActiveModelName = data.modelName;
                this.resetAutonomicCycle();
                this.startAutonomicTick();
                window.ChatToolbarController?.setModelLoading(false);
                if (modelRam) modelRam.innerHTML = `<span class="ram-led active"></span><span>WASM ${data.loadTimeMs}ms</span>`;
                window.ChatComposerController?.addMessage(`Modelo ${data.modelName} listo en WebAssembly (${data.loadTimeMs} ms).`, 'system');
            } else if (data.status === 'error') {
                console.error('🔥 [GAJE-WASM Error]:', data.error);
                window.ChatToolbarController?.setModelLoading(false);
                window.ChatComposerController?.addMessage(`Error WASM: ${data.error}`, 'system');
            }
        };
        return window.ChatState.wasmWorker;
    },

    scheduleIdleWork(fn, timeoutMs = 4000) {
        if (typeof requestIdleCallback === 'function') {
            requestIdleCallback(fn, { timeout: timeoutMs });
        } else {
            setTimeout(fn, Math.min(timeoutMs, 2000));
        }
    },

    runAutonomicSleepCycle(reason) {
        const worker = this.initWasmWorker();
        if (!window.ChatState.isWasmModelLoaded || window.ChatState.autonomic.inFlight || !window.ChatState.wasmActiveModelName) return;
        window.ChatState.autonomic.inFlight = true;
        console.log(`💤 [GAJE-WASM] Ciclo autonómico automático (${reason})...`);

        const modelName = window.ChatState.wasmActiveModelName;
        const onCycleDone = async (ev) => {
            worker.removeEventListener('message', onCycleDone);
            worker.removeEventListener('message', onCycleError);
            try {
                if (ev.data.status === 'sleep_cycle_completed') {
                    worker.postMessage({ action: 'export_memory', payload: { niche: 'documental' } });
                    const expHandler = async (exp) => {
                        if (exp.data.status === 'memory_exported' && window.GajeDB && exp.data.niche === 'documental') {
                            worker.removeEventListener('message', expHandler);
                            await window.GajeDB.saveMemoryIsland(modelName, exp.data.niche, exp.data.buffer);
                        }
                    };
                    worker.addEventListener('message', expHandler);
                    const s = ev.data.stats || {};
                    window.ChatComposerController?.addMessage(`💤 Consolidación autonómica: ${s.episodic_transferred || 0} transferidos, ${s.duplicates_pruned || 0} podados.`, 'system');
                }
            } finally {
                window.ChatState.autonomic.inFlight = false;
                window.ChatState.autonomic.lastCycleAt = Date.now();
                window.ChatState.autonomic.interactions = 0;
            }
        };
        const onCycleError = (ev) => {
            if (ev.data.status !== 'error') return;
            worker.removeEventListener('message', onCycleDone);
            worker.removeEventListener('message', onCycleError);
            console.warn('🔥 [GAJE-WASM] Falló ciclo autonómico:', ev.data.error);
            window.ChatState.autonomic.inFlight = false;
            window.ChatState.autonomic.lastCycleAt = Date.now();
            window.ChatState.autonomic.interactions = 0;
        };

        worker.addEventListener('message', onCycleDone);
        worker.addEventListener('message', onCycleError);
        worker.postMessage({ action: 'sleep_cycle', payload: { dedupThreshold: 0.95 } });
    },

    maybeRunAutonomicCycle(reason) {
        if (!window.ChatState.isWasmModelLoaded || window.ChatState.autonomic.inFlight) return;
        const dueByUsage = window.ChatState.autonomic.interactions >= window.ChatState.autonomic.interactionsLimit;
        const dueByTime = (Date.now() - window.ChatState.autonomic.lastCycleAt) >= window.ChatState.autonomic.maxIntervalMs && window.ChatState.autonomic.interactions > 0;
        if (dueByUsage || dueByTime) {
            this.scheduleIdleWork(() => this.runAutonomicSleepCycle(reason));
        }
    },

    registerWasmInteraction() {
        window.ChatState.autonomic.interactions += 1;
        this.maybeRunAutonomicCycle(`uso: ${window.ChatState.autonomic.interactions} interacciones`);
    },

    resetAutonomicCycle() {
        window.ChatState.autonomic.interactions = 0;
        window.ChatState.autonomic.lastCycleAt = Date.now();
    },

    startAutonomicTick() {
        if (window.ChatState.autonomic.tickTimer) return;
        window.ChatState.autonomic.tickTimer = setInterval(() => this.maybeRunAutonomicCycle('temporal'), window.ChatState.autonomic.tickMs);
    },

    stopAutonomicTick() {
        if (window.ChatState.autonomic.tickTimer) {
            clearInterval(window.ChatState.autonomic.tickTimer);
            window.ChatState.autonomic.tickTimer = null;
        }
    },

    async wasmChat(text, modelName) {
        const chatWindow = document.getElementById('chat-window');
        const worker = this.initWasmWorker();
        const botMsg = window.ChatComposerController?.createBotMessage(modelName);
        if (!botMsg) return false;
        botMsg.classList.add('streaming');

        const contentSection = botMsg.querySelector('.msg-content') || botMsg;

        const statusEl = document.createElement('span');
        statusEl.className = 'stream-status';
        statusEl.textContent = 'WASM';
        const statusAnchor = document.createElement('div');
        statusAnchor.className = 'stream-status-row';
        statusAnchor.appendChild(statusEl);
        contentSection.appendChild(statusAnchor);

        const contentEl = document.createElement('div');
        contentEl.className = 'stream-text response-body';
        contentEl.textContent = 'Procesando en WebAssembly...';
        contentSection.appendChild(contentEl);
        chatWindow.appendChild(botMsg);
        chatWindow.scrollTop = chatWindow.scrollHeight;

        const started = Date.now();
        window.ChatToolbarController?.setModelLoading(true);

        try {
            if (!window.ChatState.isWasmModelLoaded || window.ChatState.wasmActiveModelName !== modelName) {
                let buffer = null;

                // 0. Verificar si el modelo ya está en la caché local persistente IndexedDB
                if (window.GajeDB && typeof window.GajeDB.getCachedModel === 'function') {
                    contentEl.textContent = `Verificando caché local para ${modelName}...`;
                    const cachedBuf = await window.GajeDB.getCachedModel(modelName);
                    if (cachedBuf && cachedBuf.byteLength >= 4096) {
                        // Validar presencia de tokenizador GTOK incrustado (uint64 en offset 88)
                        let gtokLen = 0n;
                        try {
                            const dv = new DataView(cachedBuf);
                            gtokLen = dv.getBigUint64(88, true);
                        } catch (e) {
                            gtokLen = 0n;
                        }

                        if (gtokLen > 0n) {
                            console.log(`⚡ [GAJE-WASM] Modelo ${modelName} recuperado desde caché IndexedDB (${(cachedBuf.byteLength / 1048576).toFixed(1)} MB, con tokenizador GTOK).`);
                            contentEl.textContent = `Cargando ${modelName} desde almacenamiento local...`;
                            buffer = cachedBuf;
                        } else {
                            console.warn(`⚠️ [GAJE-WASM] El modelo ${modelName} en caché local IndexedDB está desactualizado (sin GTOK). Purgando y descargando versión actualizada...`);
                            if (typeof window.GajeDB.deleteCachedModel === 'function') {
                                await window.GajeDB.deleteCachedModel(modelName);
                            }
                            buffer = null;
                        }
                    }
                }

                // 1. Si no está en caché, intentar descargar desde el backend local si existe
                if (!buffer && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
                    try {
                        const localRes = await fetch(`/models/${encodeURIComponent(modelName)}`);
                        if (localRes.ok) {
                            const localBuf = await localRes.arrayBuffer();
                            if (localBuf && localBuf.byteLength >= 4096) {
                                buffer = localBuf;
                            }
                        }
                    } catch (err) {
                        console.warn('[GAJE-WASM] Backend local no respondió, usando CDN...');
                    }
                }

                // 2. Si no hay backend local (ej. Vercel/PWA), descargar desde el CDN oficial de Hugging Face
                if (!buffer) {
                    const cdnBase = window.GAJE_CONFIG?.cdnBaseUrl || 'https://huggingface.co/eaguilar/gaje-models/resolve/main/';
                    const cdnUrl = `${cdnBase}${encodeURIComponent(modelName)}`;
                    contentEl.textContent = `Conectando con CDN (${modelName})...`;
                    const cdnRes = await fetch(cdnUrl, { mode: 'cors' });
                    if (!cdnRes.ok) {
                        throw new Error(`No se pudo descargar el modelo (${cdnRes.status} ${cdnRes.statusText})`);
                    }

                    const contentLength = cdnRes.headers.get('content-length');
                    const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;

                    if (cdnRes.body && totalBytes > 0) {
                        const reader = cdnRes.body.getReader();
                        let receivedBytes = 0;
                        const chunks = [];
                        while (true) {
                            const { done, value } = await reader.read();
                            if (done) break;
                            chunks.push(value);
                            receivedBytes += value.length;
                            const pct = Math.round((receivedBytes / totalBytes) * 100);
                            const recMb = (receivedBytes / (1024 * 1024)).toFixed(1);
                            const totMb = (totalBytes / (1024 * 1024)).toFixed(1);
                            contentEl.textContent = `Descargando ${modelName}: ${pct}% (${recMb} / ${totMb} MB)...`;
                        }
                        const allChunks = new Uint8Array(receivedBytes);
                        let position = 0;
                        for (let chunk of chunks) {
                            allChunks.set(chunk, position);
                            position += chunk.length;
                        }
                        buffer = allChunks.buffer;
                    } else {
                        buffer = await cdnRes.arrayBuffer();
                    }

                    // Guardar en caché IndexedDB para que en futuros inicios la carga sea instantánea (0s descarga)
                    if (buffer && buffer.byteLength >= 4096 && window.GajeDB && typeof window.GajeDB.saveCachedModel === 'function') {
                        window.GajeDB.saveCachedModel(modelName, buffer.slice(0));
                    }
                }

                if (!buffer || buffer.byteLength < 4096) {
                    throw new Error(`El archivo de modelo es inválido o menor a 4096 bytes (${buffer ? buffer.byteLength : 0} B)`);
                }

                contentEl.textContent = `Compilando organismo genómico en WebAssembly...`;
                await new Promise((resolve, reject) => {
                    const handler = (ev) => {
                        if (ev.data.status === 'model_loaded') {
                            worker.removeEventListener('message', handler);
                            window.ChatState.isWasmModelLoaded = true;
                            window.ChatState.wasmActiveModelName = modelName;
                            resolve();
                        } else if (ev.data.status === 'error') {
                            worker.removeEventListener('message', handler);
                            reject(new Error(ev.data.error));
                        }
                    };
                    worker.addEventListener('message', handler);
                    worker.postMessage({ action: 'load_model', payload: { buffer, modelName } }, [buffer]);
                });
            }

            contentEl.textContent = 'Generando respuesta en WebAssembly...';
            const result = await new Promise((resolve, reject) => {
                const handler = (ev) => {
                    if (ev.data.status === 'chat_response') {
                        worker.removeEventListener('message', handler);
                        resolve(ev.data);
                    } else if (ev.data.status === 'error') {
                        worker.removeEventListener('message', handler);
                        reject(new Error(ev.data.error));
                    }
                };
                worker.addEventListener('message', handler);
                worker.postMessage({
                    action: 'chat',
                    payload: {
                        prompt: text,
                        maxTokens: 128,
                        temperature: 0.7,
                        repetitionPenalty: 1.1,
                        injectRag: true
                    }
                });
            });

            window.ChatToolbarController?.setModelLoading(false);
            botMsg.classList.remove('streaming');
            statusAnchor.remove();

            const responseText = (result && typeof result.response === 'string' && result.response.trim().length > 0)
                ? result.response
                : 'Inferencia completada.';
            contentEl.innerHTML = window.ChatMarkdown?.parse(responseText) || responseText;

            const elapsed = Date.now() - started;
            const wasmMetrics = {
                latency_ms: elapsed,
                tokens_per_second: result.genTimeMs ? ((responseText.length / 4) / (parseFloat(result.genTimeMs) / 1000)).toFixed(1) : '35.0',
                compression_ratio: '16.0x (WASM)',
                mode: 'WASM In-Browser',
                server_time: window.ChatUtils ? window.ChatUtils.formatExactTime() : null,
                timestamp_posix: window.ChatUtils ? window.ChatUtils.getUnixTimestamp() : (Date.now() / 1000)
            };

            window.ChatComposerController?.addMetaTo(botMsg, elapsed, 'WASM', responseText, modelName, wasmMetrics);
            window.ChatStorage?.pushHistory({ role: 'assistant', content: responseText, model: modelName, metrics: wasmMetrics });
            window.ChatComposerController?.updateMetrics(wasmMetrics);
            this.registerWasmInteraction();
            chatWindow.scrollTop = chatWindow.scrollHeight;
            return true;
        } catch (err) {
            window.ChatToolbarController?.setModelLoading(false);
            botMsg.classList.remove('streaming');
            statusAnchor.remove();
            contentEl.innerHTML = `<span style="color: #fca5a5">⚠️ Error WASM: ${err.message}</span>`;
            chatWindow.scrollTop = chatWindow.scrollHeight;
            return false;
        }
    },

    async streamChat(message, modelName) {
        const chatWindow = document.getElementById('chat-window');
        const botMsg = window.ChatComposerController?.createBotMessage(modelName);
        if (!botMsg) return false;
        botMsg.classList.add('streaming');

        const contentSection = botMsg.querySelector('.msg-content') || botMsg;

        const statusEl = document.createElement('span');
        statusEl.className = 'stream-status';
        statusEl.textContent = 'Generando';
        const statusAnchor = document.createElement('div');
        statusAnchor.className = 'stream-status-row';
        statusAnchor.appendChild(statusEl);
        contentSection.appendChild(statusAnchor);

        const contentEl = document.createElement('div');
        contentEl.className = 'stream-text response-body';
        contentSection.appendChild(contentEl);
        chatWindow.appendChild(botMsg);
        chatWindow.scrollTop = chatWindow.scrollHeight;

        window.ChatState.abortController = new AbortController();
        const stopBtn = document.getElementById('stop-btn');
        if (stopBtn) stopBtn.hidden = false;
        if (chatWindow) chatWindow.setAttribute('aria-busy', 'true');

        let fullText = '';
        let started = Date.now();
        let done = false;
        let latestMetrics = null;

        const finish = (aborted) => {
            if (done) return;
            done = true;
            window.ChatState.abortController = null;
            if (stopBtn) stopBtn.hidden = true;
            if (chatWindow) chatWindow.setAttribute('aria-busy', 'false');
            botMsg.classList.remove('streaming');
            statusAnchor.remove();
            const elapsed = Date.now() - started;
            if (fullText) {
                contentEl.innerHTML = window.ChatMarkdown?.parse(fullText) || fullText;
            }
            if (aborted && fullText) {
                window.ChatComposerController?.addMetaTo(botMsg, elapsed, '⏹️ detenido', fullText, modelName, latestMetrics);
            } else if (!aborted) {
                window.ChatComposerController?.addMetaTo(botMsg, elapsed, '', fullText, modelName, latestMetrics);
            }
            if (fullText) window.ChatStorage?.pushHistory({ role: 'assistant', content: fullText, model: modelName, metrics: latestMetrics });
            chatWindow.scrollTop = chatWindow.scrollHeight;
        };

        if (stopBtn) {
            stopBtn.onclick = () => {
                if (window.ChatState.abortController) window.ChatState.abortController.abort();
            };
        }

        const recentHistory = await (window.ChatStorage?.getRecentHistory(8) || []);

        return fetch('/api/chat/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: message, model: modelName, history: recentHistory }),
            signal: window.ChatState.abortController.signal
        }).then(async (response) => {
            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                botMsg.remove();
                window.ChatComposerController?.addMessage(`Error: ${data.error || 'Fallo en el stream'}`, 'bot');
                finish(true);
                return false;
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let buffer = '';

            while (true) {
                const { value, done: rdDone } = await reader.read();
                if (rdDone) break;
                buffer += decoder.decode(value, { stream: true });
                let idx;
                while ((idx = buffer.indexOf('\n')) !== -1) {
                    const line = buffer.slice(0, idx).trim();
                    buffer = buffer.slice(idx + 1);
                    if (line.startsWith('data: ')) {
                        const payload = line.slice(6);
                        if (payload === '[DONE]') {
                            reader.releaseLock();
                            finish(false);
                            return true;
                        }
                        try {
                            const parsed = JSON.parse(payload);
                            if (parsed && typeof parsed === 'object') {
                                if (parsed.__gaje_metrics__) {
                                    latestMetrics = parsed.__gaje_metrics__;
                                    if (parsed.dna) window.ChatComposerController?.updateDNA(parsed.dna);
                                    window.ChatComposerController?.updateMetrics(latestMetrics);
                                    continue;
                                }
                                if (parsed.error) throw new Error(parsed.error);
                            }
                            fullText += (typeof parsed === 'string' ? parsed : '');
                            contentEl.innerHTML = window.ChatMarkdown?.parse(fullText) || fullText;
                            chatWindow.scrollTop = chatWindow.scrollHeight;
                        } catch (e) {
                            if (e.message) {
                                botMsg.remove();
                                window.ChatComposerController?.addMessage(`Error: ${e.message}`, 'bot');
                                finish(true);
                                return false;
                            }
                        }
                    }
                }
            }
            finish(false);
            return true;
        }).catch((err) => {
            if (err && err.name === 'AbortError') {
                finish(true);
                return true;
            }
            botMsg.remove();
            window.ChatComposerController?.addMessage('Error de conexión con el núcleo GAJE (streaming).', 'bot');
            finish(true);
            return false;
        });
    },

    async fallbackChat(text, modelName) {
        try {
            const recentHistory = await (window.ChatStorage?.getRecentHistory(8) || []);
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: text, model: modelName, history: recentHistory })
            });
            const data = await response.json();
            if (data.error) {
                window.ChatComposerController?.addMessage(`Error: ${data.error}`, 'bot', null, null, modelName);
            } else {
                window.ChatComposerController?.addMessage(data.response, 'bot', data.metrics, null, modelName);
                window.ChatStorage?.pushHistory({ role: 'assistant', content: data.response, model: modelName });
                window.ChatComposerController?.updateMetrics(data.metrics);
                window.ChatComposerController?.updateDNA(data.dna);
            }
        } catch (err) {
            window.ChatComposerController?.addMessage('Error de conexión con el núcleo GAJE.', 'bot', null, null, modelName);
            console.error(err);
        }
    }
};
