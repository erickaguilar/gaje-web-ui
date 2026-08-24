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
                contentEl.textContent = `Descargando y compilando ${modelName} en el navegador...`;
                await new Promise((resolve, reject) => {
                    const handler = (ev) => {
                        if (ev.data.status === 'model_loaded') {
                            worker.removeEventListener('message', handler);
                            resolve();
                        } else if (ev.data.status === 'error') {
                            worker.removeEventListener('message', handler);
                            reject(new Error(ev.data.error));
                        }
                    };
                    worker.addEventListener('message', handler);
                    worker.postMessage({ action: 'load_model', payload: { modelUrl: `/models/${modelName}`, modelName } });
                });
            }

            contentEl.textContent = '';
            const result = await new Promise((resolve, reject) => {
                const handler = (ev) => {
                    if (ev.data.status === 'token') {
                        contentEl.textContent += ev.data.token;
                        chatWindow.scrollTop = chatWindow.scrollHeight;
                    } else if (ev.data.status === 'done') {
                        worker.removeEventListener('message', handler);
                        resolve(ev.data);
                    } else if (ev.data.status === 'error') {
                        worker.removeEventListener('message', handler);
                        reject(new Error(ev.data.error));
                    }
                };
                worker.addEventListener('message', handler);
                worker.postMessage({ action: 'generate', payload: { prompt: text, maxTokens: 256, temperature: 0.7 } });
            });

            window.ChatToolbarController?.setModelLoading(false);
            botMsg.classList.remove('streaming');
            statusAnchor.remove();

            const responseText = result.text || contentEl.textContent;
            contentEl.innerHTML = window.ChatMarkdown?.parse(responseText) || responseText;

            const elapsed = Date.now() - started;
            const wasmMetrics = {
                latency_ms: elapsed,
                tokens_per_second: (result.tokenCount / (elapsed / 1000)).toFixed(1),
                compression_ratio: '16.0x (WASM)',
                mode: 'WASM In-Browser'
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
            contentEl.innerHTML = `<span style="color: #fca5a5">Error WASM: ${err.message}</span>`;
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
