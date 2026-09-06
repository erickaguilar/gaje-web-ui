/* =============================================================================
   🧬 GAJE — static/js/chat/engine.js
   Motores de inferencia: Streaming SSE Server y WebAssembly In-Browser Worker.
   Extendido con motor de descarga multi-stream concurrente (4 canales DNF-style).
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
                console.log(`✅ [GAJE-CORE] Organismo ${data.modelName} cargado en ${data.loadTimeMs} ms`, data.info);
                window.ChatState.isWasmModelLoaded = true;
                window.ChatState.wasmActiveModelName = data.modelName;
                this.resetAutonomicCycle();
                this.startAutonomicTick();
                window.ChatToolbarController?.setModelLoading(false);
                if (modelRam) modelRam.innerHTML = `<span class="ram-led active"></span><span>WASM ${data.loadTimeMs}ms</span>`;
                window.ChatUtils?.showToast(`Organismo [${data.modelName}] listo en Tronco Encefálico (${data.loadTimeMs} ms)`, 'success', 3000);
            } else if (data.status === 'error') {
                console.error('🔥 [GAJE-CORE Error]:', data);
                window.ChatToolbarController?.setModelLoading(false);
                // Si la acción activa es interactiva (wasmChat), el controlador muestra su propio card y toast
                if (!window.ChatState.isWasmActionInProgress) {
                    const code = data.code || 'GAJE-500';
                    window.ChatUtils?.showToast(`[${code}] ${data.error}`, 'error', 5000);
                }
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

        const timerDisplay = botMsg.querySelector('.timer-display');
        let timerInterval = null;
        if (timerDisplay) {
            timerInterval = setInterval(() => {
                const sec = ((Date.now() - started) / 1000).toFixed(1);
                timerDisplay.textContent = `${sec}s`;
            }, 80);
        }

        const stopBtn = document.getElementById('stop-btn');
        if (stopBtn) stopBtn.hidden = false;
        const msgStopBtn = botMsg.querySelector('.msg-stop-btn, .msg-header-stop-btn, .stop-btn-action');

        let wasmAborted = false;
        const wasmDlAbortController = new AbortController();
        let dataAlert = null;
        window.ChatState.isWasmActionInProgress = true;

        const handleWasmStop = () => {
            if (wasmAborted) return;
            wasmAborted = true;
            window.ChatState.isWasmActionInProgress = false;
            if (timerInterval) {
                clearInterval(timerInterval);
                timerInterval = null;
            }
            try { wasmDlAbortController.abort(); } catch (e) {}
            if (worker) worker.postMessage({ action: 'abort' });
            window.ChatToolbarController?.setModelLoading(false);
            botMsg.classList.remove('streaming');
            statusAnchor.remove();
            msgStopBtn?.remove();
            const streamingFooter = botMsg.querySelector('.msg-footer-streaming');
            if (streamingFooter) streamingFooter.remove();
            if (stopBtn) stopBtn.hidden = true;
            if (dataAlert && dataAlert.parentNode) {
                dataAlert.remove();
                dataAlert = null;
            }
            contentSection.querySelectorAll('.data-usage-alert').forEach(el => el.remove());
            contentEl.innerHTML = '<span style="color: var(--text-muted); display: inline-flex; align-items: center; gap: 4px;"><svg class="y2k-icon-inline"><use href="static/icons/y2k/sprite.svg#i-stop"/></svg> Inferencia detenida por el usuario.</span>';
            window.ChatComposerController?.addMetaTo(botMsg, Date.now() - started, 'detenido', 'Inferencia detenida.', modelName);
        };

        if (stopBtn) stopBtn.onclick = handleWasmStop;
        if (msgStopBtn) {
            msgStopBtn.onclick = (e) => {
                e.stopPropagation();
                handleWasmStop();
            };
        }

        try {
            if (!window.ChatState.isWasmModelLoaded || window.ChatState.wasmActiveModelName !== modelName) {
                // Obtener buffer del modelo vía ChatModelLoader (Caché IndexedDB / OPFS, backend local o CDN 4x Range)
                const loadResult = await (window.ChatModelLoader ? window.ChatModelLoader.loadOrFetchModel(modelName, {
                    signal: wasmDlAbortController.signal,
                    onStatusChange: (statusText) => { contentEl.textContent = statusText; },
                    containerEl: contentSection,
                    insertBeforeEl: contentEl
                }) : this.downloadModelMultiStream(modelName, null, wasmDlAbortController.signal));

                const buffer = loadResult?.buffer || loadResult;
                dataAlert = loadResult?.dataAlert || null;

                if (!buffer || buffer.byteLength < 4096) {
                    throw new Error(`El archivo de modelo es inválido o menor a 4096 bytes (${buffer ? buffer.byteLength : 0} B)`);
                }

                contentEl.textContent = `Compilando matriz genómica en Tronco Encefálico...`;
                await new Promise((resolve, reject) => {
                    const handler = (ev) => {
                        if (ev.data.status === 'model_loaded') {
                            worker.removeEventListener('message', handler);
                            window.ChatState.isWasmModelLoaded = true;
                            window.ChatState.wasmActiveModelName = modelName;
                            resolve();
                        } else if (ev.data.status === 'error') {
                            worker.removeEventListener('message', handler);
                            const err = new Error(ev.data.error || 'Error compilando organismo');
                            err.code = ev.data.code || 'GAJE-500';
                            err.name = ev.data.name || 'KERNEL_PANIC';
                            err.recommendation = ev.data.recommendation;
                            reject(err);
                        }
                    };
                    worker.addEventListener('message', handler);
                    worker.postMessage({ action: 'load_model', payload: { buffer, modelName } }, [buffer]);
                });
            }

            const recentHistory = await (window.ChatStorage?.getRecentHistory(4) || []);
            contentEl.textContent = 'Calculando resonancia semántica en núcleo local...';
            const result = await new Promise((resolve, reject) => {
                const handler = (ev) => {
                    if (ev.data.status === 'chat_response') {
                        worker.removeEventListener('message', handler);
                        resolve(ev.data);
                    } else if (ev.data.status === 'error') {
                        worker.removeEventListener('message', handler);
                        const err = new Error(ev.data.error || 'Error durante la inferencia genómica');
                        err.code = ev.data.code || 'GAJE-500';
                        err.name = ev.data.name || 'KERNEL_PANIC';
                        err.recommendation = ev.data.recommendation;
                        reject(err);
                    }
                };
                worker.addEventListener('message', handler);
                worker.postMessage({
                    action: 'chat',
                    payload: {
                        prompt: text,
                        maxTokens: 128,
                        temperature: window.ChatState.temperature ?? 0.3,
                        minP: 0.05,
                        repetitionPenalty: 1.05,
                        injectRag: true,
                        history: recentHistory
                    }
                });
            });

            if (timerInterval) {
                clearInterval(timerInterval);
                timerInterval = null;
            }
            window.ChatToolbarController?.setModelLoading(false);
            if (stopBtn) stopBtn.hidden = true;
            msgStopBtn?.remove();
            const streamingFooter = botMsg.querySelector('.msg-footer-streaming');
            if (streamingFooter) streamingFooter.remove();
            botMsg.classList.remove('streaming');
            statusAnchor.remove();

            const hasGeneratedText = result && typeof result.response === 'string' && result.response.trim().length > 0;
            const responseText = hasGeneratedText ? result.response : '';

            if (hasGeneratedText) {
                contentEl.innerHTML = window.ChatMarkdown?.parse(responseText) || responseText;
            } else {
                contentEl.innerHTML = `
                    <div class="empty-response-notice">
                        <span class="gaje-code-badge ok">GAJE-204</span>
                        <svg class="y2k-icon-inline"><use href="static/icons/y2k/sprite.svg#i-check"/></svg>
                        <span>Inferencia finalizada por delimitador de secuencia (<code class="y2k-code-inline">&lt;|im_end|&gt;</code>).</span>
                    </div>
                `;
            }

            const elapsed = Date.now() - started;
            const wasmMetrics = {
                latency_ms: elapsed,
                tokens_per_second: result.genTimeMs ? ((Math.max(responseText.length, 4) / 4) / (parseFloat(result.genTimeMs) / 1000)).toFixed(1) : '35.0',
                compression_ratio: '16.0x (Genomic)',
                mode: 'Tronco Encefálico Local',
                server_time: window.ChatUtils ? window.ChatUtils.formatExactTime() : null,
                timestamp_posix: window.ChatUtils ? window.ChatUtils.getUnixTimestamp() : (Date.now() / 1000)
            };

            window.ChatComposerController?.addMetaTo(botMsg, elapsed, 'Tronco Encefálico', responseText || 'EOS', modelName, wasmMetrics);
            if (responseText) {
                window.ChatStorage?.pushHistory({ role: 'assistant', content: responseText, model: modelName, metrics: wasmMetrics });
            }
            window.ChatComposerController?.updateMetrics(wasmMetrics);
            this.registerWasmInteraction();

            window.ChatUtils?.showToast(
                hasGeneratedText ? 'Síntesis genómica completada' : 'Delimitador EOS alcanzado',
                'success',
                6000,
                {
                    code: hasGeneratedText ? 'GAJE-200' : 'GAJE-204',
                    model: modelName.replace('.flat', ''),
                    latency: `${elapsed}ms`,
                    speed: `${wasmMetrics.tokens_per_second} tok/s`
                }
            );

            window.ChatState.isWasmActionInProgress = false;
            chatWindow.scrollTop = chatWindow.scrollHeight;
            return true;
        } catch (err) {
            window.ChatState.isWasmActionInProgress = false;
            if (timerInterval) {
                clearInterval(timerInterval);
                timerInterval = null;
            }
            window.ChatToolbarController?.setModelLoading(false);
            if (stopBtn) stopBtn.hidden = true;
            msgStopBtn?.remove();
            const streamingFooter = botMsg.querySelector('.msg-footer-streaming');
            if (streamingFooter) streamingFooter.remove();
            botMsg.classList.remove('streaming');
            statusAnchor.remove();

            // Limpiar inmediatamente cualquier alerta de descarga atascada o pendiente
            if (dataAlert && dataAlert.parentNode) {
                dataAlert.remove();
                dataAlert = null;
            }
            contentSection.querySelectorAll('.data-usage-alert').forEach(el => el.remove());

            if (!wasmAborted) {
                const code = err.code || 'GAJE-500';
                const name = err.name || 'KERNEL_PANIC';
                const msg = err.message || 'Error en el cálculo del organismo genómico.';
                const rec = err.recommendation || 'Verifica la integridad del modelo o selecciona el Modo Servidor Nativo.';

                contentEl.innerHTML = `
                    <div class="gaje-response-card gaje-error-card">
                        <div class="gaje-card-header">
                            <span class="gaje-code-badge error">${window.ChatUtils?.escapeHtml(code) || code}</span>
                            <span class="gaje-code-name">${window.ChatUtils?.escapeHtml(name) || name}</span>
                        </div>
                        <p class="gaje-card-desc">${window.ChatUtils?.escapeHtml(msg) || msg}</p>
                        <div class="gaje-card-action">
                            <svg class="y2k-icon-inline"><use href="static/icons/y2k/sprite.svg#i-info"/></svg>
                            <span>${window.ChatUtils?.escapeHtml(rec) || rec}</span>
                        </div>
                    </div>
                `;

                window.ChatUtils?.showToast(
                    `${name}: ${msg}`,
                    'error',
                    6000,
                    { code }
                );
            }
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
        const msgStopBtn = botMsg.querySelector('.msg-stop-btn, .msg-header-stop-btn, .stop-btn-action');
        if (chatWindow) chatWindow.setAttribute('aria-busy', 'true');

        let fullText = '';
        let started = Date.now();
        let done = false;
        let latestMetrics = null;

        const timerDisplay = botMsg.querySelector('.timer-display');
        let timerInterval = null;
        if (timerDisplay) {
            timerInterval = setInterval(() => {
                const sec = ((Date.now() - started) / 1000).toFixed(1);
                timerDisplay.textContent = `${sec}s`;
            }, 80);
        }

        const finish = (aborted) => {
            if (done) return;
            done = true;
            if (timerInterval) {
                clearInterval(timerInterval);
                timerInterval = null;
            }
            window.ChatState.abortController = null;
            if (stopBtn) stopBtn.hidden = true;
            msgStopBtn?.remove();
            const streamingFooter = botMsg.querySelector('.msg-footer-streaming');
            if (streamingFooter) streamingFooter.remove();
            if (chatWindow) chatWindow.setAttribute('aria-busy', 'false');
            botMsg.classList.remove('streaming');
            statusAnchor.remove();
            const elapsed = Date.now() - started;
            if (fullText) {
                contentEl.innerHTML = window.ChatMarkdown?.parse(fullText) || fullText;
            }
            if (aborted) {
                window.ChatUtils?.showToast('Inferencia detenida por el usuario', 'warning', 4500, { model: modelName });
                if (fullText) {
                    window.ChatComposerController?.addMetaTo(botMsg, elapsed, 'detenido', fullText, modelName, latestMetrics);
                }
            } else if (!aborted) {
                window.ChatComposerController?.addMetaTo(botMsg, elapsed, '', fullText, modelName, latestMetrics);
                if (fullText) {
                    window.ChatUtils?.showToast('Inferencia completada', 'success', 6000, {
                        model: modelName,
                        latency: `${elapsed}ms`,
                        speed: latestMetrics?.tokens_per_second ? `${latestMetrics.tokens_per_second} tok/s` : null
                    });
                }
            }
            if (fullText) window.ChatStorage?.pushHistory({ role: 'assistant', content: fullText, model: modelName, metrics: latestMetrics });
            chatWindow.scrollTop = chatWindow.scrollHeight;
        };

        const handleStop = () => {
            if (window.ChatState.abortController) window.ChatState.abortController.abort();
        };

        if (stopBtn) stopBtn.onclick = handleStop;
        if (msgStopBtn) {
            msgStopBtn.onclick = (e) => {
                e.stopPropagation();
                handleStop();
            };
        }

        const recentHistory = await (window.ChatStorage?.getRecentHistory(8) || []);

        return fetch('/api/chat/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: message,
                model: modelName,
                history: recentHistory,
                temperature: window.ChatState.temperature ?? 0.3
            }),
            signal: window.ChatState.abortController.signal
        }).then(async (response) => {
            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                botMsg.remove();
                window.ChatUtils?.showToast(`Error del servidor: ${data.error || 'Fallo en la inferencia'}`, 'error', 5000);
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
                                window.ChatUtils?.showToast(`Error en streaming: ${e.message}`, 'error', 5000);
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
            window.ChatUtils?.showToast('Error de conexión con el núcleo GAJE (streaming).', 'error', 5000);
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
                body: JSON.stringify({
                    message: text,
                    model: modelName,
                    history: recentHistory,
                    temperature: window.ChatState.temperature ?? 0.3
                })
            });
            const data = await response.json();
            if (data.error) {
                window.ChatUtils?.showToast(`Error del servidor: ${data.error}`, 'error', 5000);
                return false;
            } else {
                window.ChatComposerController?.addMessage(data.response, 'bot', data.metrics, null, modelName);
                window.ChatStorage?.pushHistory({ role: 'assistant', content: data.response, model: modelName });
                window.ChatComposerController?.updateMetrics(data.metrics);
                window.ChatComposerController?.updateDNA(data.dna);
                return true;
            }
        } catch (err) {
            window.ChatUtils?.showToast('Error de conexión con el núcleo GAJE.', 'error', 5000);
            console.error(err);
            return false;
        }
    },

    async downloadModelMultiStream(modelNameOrUrl, progressCb = null, signal = null) {
        if (window.ChatModelLoader) {
            return window.ChatModelLoader.downloadModelMultiStream(modelNameOrUrl, progressCb, signal);
        }
        throw new Error('ChatModelLoader no está inicializado.');
    },

    async downloadLinearStream(url, filename, expectedBytes = 0, progressCb = null, signal = null) {
        if (window.ChatModelLoader) {
            return window.ChatModelLoader.downloadLinearStream(url, filename, expectedBytes, progressCb, signal);
        }
        throw new Error('ChatModelLoader no está inicializado.');
    },

    resolveModelUrl(modelIdentifier) {
        if (window.ChatModelLoader) {
            return window.ChatModelLoader.resolveModelUrl(modelIdentifier);
        }
        return ['https://huggingface.co/eaguilar/gaje-models/resolve/main/max.gaje', 'max.gaje'];
    }
};
