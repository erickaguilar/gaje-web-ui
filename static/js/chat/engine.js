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
                const code = data.code || 'GAJE-500';
                window.ChatUtils?.showToast(`[${code}] ${data.error}`, 'error', 5000);
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

        const stopBtn = document.getElementById('stop-btn');
        if (stopBtn) stopBtn.hidden = false;
        const msgStopBtn = botMsg.querySelector('.msg-stop-btn, .msg-header-stop-btn, .stop-btn-action');

        let wasmAborted = false;
        const wasmDlAbortController = new AbortController();
        const handleWasmStop = () => {
            if (wasmAborted) return;
            wasmAborted = true;
            try { wasmDlAbortController.abort(); } catch (e) {}
            if (worker) worker.postMessage({ action: 'abort' });
            window.ChatToolbarController?.setModelLoading(false);
            botMsg.classList.remove('streaming');
            statusAnchor.remove();
            msgStopBtn?.remove();
            const streamingFooter = botMsg.querySelector('.msg-footer-streaming');
            if (streamingFooter) streamingFooter.remove();
            if (stopBtn) stopBtn.hidden = true;
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
                            console.warn(`[GAJE-WASM] El modelo ${modelName} en caché local IndexedDB está desactualizado (sin GTOK). Purgando y descargando versión actualizada...`);
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
                        const localRes = await fetch(`/models/${encodeURIComponent(modelName)}`, { signal: wasmDlAbortController.signal });
                        if (localRes.ok) {
                            const localBuf = await localRes.arrayBuffer();
                            if (localBuf && localBuf.byteLength >= 4096) {
                                buffer = localBuf;
                            }
                        }
                    } catch (err) {
                        if (wasmAborted) throw new Error('Descarga cancelada por el usuario');
                        console.warn('[GAJE-WASM] Backend local no respondió, usando CDN...');
                    }
                }

                // 2. Si no hay backend local (ej. Vercel/PWA), descargar usando descarga concurrente de 4 canales
                if (!buffer) {
                    const dataAlert = document.createElement('div');
                    dataAlert.className = 'data-usage-alert';
                    dataAlert.setAttribute('role', 'alert');
                    dataAlert.innerHTML = `
                        <div class="data-alert-icon"><svg class="y2k-icon"><use href="static/icons/y2k/sprite.svg#i-download"/></svg></div>
                        <div class="data-alert-content">
                            <div class="data-alert-header">
                                <span class="data-alert-title"><svg class="y2k-icon-inline"><use href="static/icons/y2k/sprite.svg#i-alert"/></svg> Descarga Multi-Canal (4 Streams)</span>
                                <span class="data-alert-badge">4x HTTP Range</span>
                            </div>
                            <p class="data-alert-text">Descargando pesos de <strong>${modelName}</strong> en 4 canales concurrentes. Los pesos se guardarán en caché local IndexedDB para futuras ejecuciones offline sin consumo de datos.</p>
                            <div class="data-alert-progress-track">
                                <div class="data-alert-progress-bar" style="width: 0%"></div>
                            </div>
                            <div class="data-alert-stats">
                                <span class="data-alert-pct">Iniciando 4 canales...</span>
                                <span class="data-alert-mb">Calculando</span>
                            </div>
                        </div>
                    `;
                    contentSection.insertBefore(dataAlert, contentEl);

                    contentEl.textContent = `Conectando con CDN en 4 canales paralelos (${modelName})...`;

                    const bar = dataAlert.querySelector('.data-alert-progress-bar');
                    const pctEl = dataAlert.querySelector('.data-alert-pct');
                    const mbEl = dataAlert.querySelector('.data-alert-mb');

                    const dlResult = await this.downloadModelMultiStream(
                        modelName,
                        ({ pct, receivedBytes, totalBytes, speedMb, etaSec, concurrency }) => {
                            const recMb = (receivedBytes / (1024 * 1024)).toFixed(1);
                            const totMb = totalBytes > 0 ? (totalBytes / (1024 * 1024)).toFixed(1) : '?';
                            const speedStr = speedMb ? speedMb.toFixed(1) : '0.0';
                            const etaStr = etaSec > 60 ? `${Math.floor(etaSec / 60)}m ${etaSec % 60}s` : `${etaSec}s`;
                            const channelText = concurrency > 1 ? ` · ${concurrency} canales` : '';

                            if (bar) bar.style.width = `${pct}%`;
                            if (pctEl) pctEl.textContent = `${pct}% (${speedStr} MB/s${channelText})`;
                            if (mbEl) mbEl.textContent = `${recMb} / ${totMb} MB · ETA ${etaStr}`;
                            contentEl.textContent = `Descargando ${modelName}: ${pct}% (${recMb} / ${totMb} MB · ${speedStr} MB/s${channelText})...`;
                        },
                        wasmDlAbortController.signal
                    );

                    buffer = dlResult.buffer;
                    const dlTotalSec = dlResult.stats.elapsedSec;
                    const avgSpeedMb = dlResult.stats.speedMb;
                    const channels = dlResult.stats.channels || 4;

                    dataAlert.classList.add('completed');
                    const iconContainer = dataAlert.querySelector('.data-alert-icon');
                    if (iconContainer) iconContainer.innerHTML = '<svg class="y2k-icon"><use href="static/icons/y2k/sprite.svg#i-database"/></svg>';
                    const titleEl = dataAlert.querySelector('.data-alert-title');
                    const badgeEl = dataAlert.querySelector('.data-alert-badge');
                    if (titleEl) titleEl.innerHTML = `<svg class="y2k-icon-inline"><use href="static/icons/y2k/sprite.svg#i-check"/></svg> Descarga completada en ${dlTotalSec}s (${avgSpeedMb} MB/s - ${channels}x streams)`;
                    if (badgeEl) badgeEl.textContent = 'IndexedDB Listo';

                    // Guardar en caché IndexedDB para que en futuros inicios la carga sea instantánea (0s descarga)
                    if (buffer && buffer.byteLength >= 4096 && window.GajeDB && typeof window.GajeDB.saveCachedModel === 'function') {
                        window.GajeDB.saveCachedModel(modelName, buffer.slice(0));
                    }
                }

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
                        temperature: 0.4,
                        repetitionPenalty: 1.15,
                        injectRag: true,
                        history: recentHistory
                    }
                });
            });

            window.ChatToolbarController?.setModelLoading(false);
            if (stopBtn) stopBtn.hidden = true;
            msgStopBtn?.remove();
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

            chatWindow.scrollTop = chatWindow.scrollHeight;
            return true;
        } catch (err) {
            window.ChatToolbarController?.setModelLoading(false);
            if (stopBtn) stopBtn.hidden = true;
            msgStopBtn?.remove();
            botMsg.classList.remove('streaming');
            statusAnchor.remove();
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

        const finish = (aborted) => {
            if (done) return;
            done = true;
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
            body: JSON.stringify({ message: message, model: modelName, history: recentHistory }),
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
                body: JSON.stringify({ message: text, model: modelName, history: recentHistory })
            });
            const data = await response.json();
            if (data.error) {
                window.ChatUtils?.showToast(`Error del servidor: ${data.error}`, 'error', 5000);
            } else {
                window.ChatComposerController?.addMessage(data.response, 'bot', data.metrics, null, modelName);
                window.ChatStorage?.pushHistory({ role: 'assistant', content: data.response, model: modelName });
                window.ChatComposerController?.updateMetrics(data.metrics);
                window.ChatComposerController?.updateDNA(data.dna);
            }
        } catch (err) {
            window.ChatUtils?.showToast('Error de conexión con el núcleo GAJE.', 'error', 5000);
            console.error(err);
        }
    },

    async downloadModelMultiStream(modelNameOrUrl, progressCb = null, signal = null) {
        /**
         * Descarga un modelo .flat usando 4 streams HTTP Range concurrentes (estilo DNF / hf_transfer).
         * Iguala y supera la implementación nativa en Rust src/io/downloader.rs.
         * 
         * @param {string} modelNameOrUrl - Nombre del modelo o URL completa
         * @param {function} progressCb - Callback({ pct, receivedBytes, totalBytes, speedMb, etaSec, concurrency }) => void
         * @param {AbortSignal} signal - AbortSignal opcional para cancelación inmediata
         * @returns {Promise<{buffer: ArrayBuffer, filename: string, stats: object}>} Buffer del modelo y estadísticas
         */
        const [url, filename] = this.resolveModelUrl(modelNameOrUrl);
        const CONCURRENCY = 4;

        console.log(`⚡ [Web-DL] Iniciando descarga multi-stream (${CONCURRENCY} canales) para: ${filename} desde ${url}`);

        // 1. Petición HEAD previa para determinar tamaño y soporte de Range
        let contentLength = 0;
        let supportsRange = false;
        try {
            const headResp = await fetch(url, { method: 'HEAD', mode: 'cors', signal });
            if (headResp.ok) {
                contentLength = parseInt(headResp.headers.get('content-length') || '0', 10);
                const acceptRanges = headResp.headers.get('accept-ranges') || '';
                supportsRange = acceptRanges.toLowerCase().includes('bytes') || contentLength > 0;
                console.log(`⚡ [Web-DL] HEAD: Content-Length=${contentLength}, Range=${supportsRange ? 'sí' : 'no'}`);
            }
        } catch (e) {
            if (signal?.aborted) throw new Error('Descarga cancelada por el usuario');
            console.warn('⚠️ [Web-DL] HEAD request falló o bloqueado por CORS, procediendo con descarga:', e);
        }

        // Si no soporta Range o archivo pequeño (< 4MB) o longitud desconocida, fallback a descarga lineal
        if (!supportsRange || contentLength < 4 * 1024 * 1024) {
            console.log('[Web-DL] Fallback a descarga lineal por streaming...');
            return this.downloadLinearStream(url, filename, contentLength, progressCb, signal);
        }

        // 2. Partición exacta en 4 rangos contiguos sin huecos ni solapamientos
        const chunkSize = Math.ceil(contentLength / CONCURRENCY);
        const ranges = [];
        for (let i = 0; i < CONCURRENCY; i++) {
            const start = i * chunkSize;
            if (start >= contentLength) break;
            const end = Math.min(start + chunkSize - 1, contentLength - 1);
            ranges.push({ workerId: i, start, end, total: (end - start + 1) });
        }

        const totalBuffer = new ArrayBuffer(contentLength);
        const totalView = new Uint8Array(totalBuffer);

        const channelReceived = new Array(ranges.length).fill(0);
        const dlStart = Date.now();
        let lastSpeedCheck = dlStart;
        let lastReceived = 0;
        let currentSpeedMb = 0;

        const updateProgress = () => {
            if (!progressCb) return;
            const now = Date.now();
            const totalReceived = channelReceived.reduce((a, b) => a + b, 0);
            const elapsedSec = (now - dlStart) / 1000;
            const intervalSec = (now - lastSpeedCheck) / 1000;

            if (intervalSec >= 0.25 || totalReceived === contentLength) {
                const bytesInInterval = totalReceived - lastReceived;
                currentSpeedMb = (bytesInInterval / (1024 * 1024)) / Math.max(intervalSec, 0.001);
                lastSpeedCheck = now;
                lastReceived = totalReceived;
            }

            const pct = Math.min(100, Math.round((totalReceived / contentLength) * 100));
            const remainingBytes = contentLength - totalReceived;
            const avgSpeed = totalReceived / Math.max(elapsedSec, 0.001);
            const etaSec = avgSpeed > 0 ? Math.ceil(remainingBytes / avgSpeed) : 0;

            progressCb({
                pct,
                receivedBytes: totalReceived,
                totalBytes: contentLength,
                speedMb: currentSpeedMb > 0 ? currentSpeedMb : (totalReceived / (1024 * 1024 * Math.max(0.1, elapsedSec))),
                etaSec,
                concurrency: ranges.length
            });
        };

        const downloadRange = async (range) => {
            const rangeHeader = `bytes=${range.start}-${range.end}`;
            const resp = await fetch(url, {
                method: 'GET',
                headers: { 'Range': rangeHeader },
                mode: 'cors',
                signal
            });

            if (!resp.ok && resp.status !== 206 && resp.status !== 200) {
                throw new Error(`Canal ${range.workerId} error HTTP: ${resp.status} ${resp.statusText}`);
            }

            if (!resp.body) {
                const chunkData = await resp.arrayBuffer();
                const chunkView = new Uint8Array(chunkData);
                totalView.set(chunkView, range.start);
                channelReceived[range.workerId] = chunkView.length;
                updateProgress();
                return;
            }

            const reader = resp.body.getReader();
            let writeOffset = range.start;

            try {
                while (true) {
                    if (signal?.aborted) {
                        try { await reader.cancel(); } catch (e) {}
                        throw new Error('Descarga cancelada por el usuario');
                    }
                    const { done, value } = await reader.read();
                    if (done) break;
                    totalView.set(value, writeOffset);
                    writeOffset += value.length;
                    channelReceived[range.workerId] += value.length;
                    updateProgress();
                }
            } finally {
                reader.releaseLock();
            }
        };

        console.log(`⚡ [Web-DL] Lanzando ${ranges.length} streams concurrentes:`, ranges.map(r => `C${r.workerId}: ${r.start}-${r.end}`));

        try {
            await Promise.all(ranges.map(r => downloadRange(r)));
        } catch (err) {
            if (signal?.aborted) {
                throw new Error('Descarga cancelada por el usuario');
            }
            console.warn('⚠️ [Web-DL] Falló descarga multi-canal, recurriendo a descarga lineal:', err);
            return this.downloadLinearStream(url, filename, contentLength, progressCb, signal);
        }

        const totalElapsedSec = (Date.now() - dlStart) / 1000;
        const finalAvgSpeed = (contentLength / (1024 * 1024)) / Math.max(0.1, totalElapsedSec);

        if (progressCb) {
            progressCb({
                pct: 100,
                receivedBytes: contentLength,
                totalBytes: contentLength,
                speedMb: finalAvgSpeed,
                etaSec: 0,
                concurrency: ranges.length
            });
        }

        console.log(`✅ [Web-DL] Descarga 4-canales completada en ${totalElapsedSec.toFixed(1)}s a ${finalAvgSpeed.toFixed(1)} MB/s`);

        return {
            buffer: totalBuffer,
            filename,
            stats: {
                elapsedSec: totalElapsedSec.toFixed(1),
                speedMb: finalAvgSpeed.toFixed(1),
                channels: ranges.length
            }
        };
    },

    async downloadLinearStream(url, filename, expectedBytes = 0, progressCb = null, signal = null) {
        /**
         * Descarga lineal por streaming con actualización fluida de telemetría de progreso.
         */
        const resp = await fetch(url, { mode: 'cors', signal });
        if (!resp.ok) {
            throw new Error(`No se pudo descargar el modelo (${resp.status} ${resp.statusText})`);
        }

        const totalBytes = expectedBytes || parseInt(resp.headers.get('content-length') || '0', 10);
        const dlStart = Date.now();
        let lastSpeedCheck = dlStart;
        let lastReceived = 0;
        let currentSpeedMb = 0;

        if (resp.body && totalBytes > 0) {
            const reader = resp.body.getReader();
            const totalBuffer = new ArrayBuffer(totalBytes);
            const totalView = new Uint8Array(totalBuffer);
            let receivedBytes = 0;

            try {
                while (true) {
                    if (signal?.aborted) {
                        try { await reader.cancel(); } catch (e) {}
                        throw new Error('Descarga cancelada por el usuario');
                    }
                    const { done, value } = await reader.read();
                    if (done) break;
                    totalView.set(value, receivedBytes);
                    receivedBytes += value.length;

                    const now = Date.now();
                    const elapsedSec = (now - dlStart) / 1000;
                    const intervalSec = (now - lastSpeedCheck) / 1000;

                    if (intervalSec >= 0.25 || receivedBytes === totalBytes) {
                        const bytesInInterval = receivedBytes - lastReceived;
                        currentSpeedMb = (bytesInInterval / (1024 * 1024)) / Math.max(intervalSec, 0.001);
                        lastSpeedCheck = now;
                        lastReceived = receivedBytes;
                    }

                    if (progressCb) {
                        const pct = Math.min(100, Math.round((receivedBytes / totalBytes) * 100));
                        const remainingBytes = totalBytes - receivedBytes;
                        const avgSpeed = receivedBytes / Math.max(elapsedSec, 0.001);
                        const etaSec = avgSpeed > 0 ? Math.ceil(remainingBytes / avgSpeed) : 0;
                        progressCb({
                            pct,
                            receivedBytes,
                            totalBytes,
                            speedMb: currentSpeedMb > 0 ? currentSpeedMb : (receivedBytes / (1024 * 1024 * Math.max(0.1, elapsedSec))),
                            etaSec,
                            concurrency: 1
                        });
                    }
                }
            } finally {
                reader.releaseLock();
            }

            const totalElapsedSec = (Date.now() - dlStart) / 1000;
            const avgSpeed = (totalBytes / (1024 * 1024)) / Math.max(0.1, totalElapsedSec);

            return {
                buffer: totalBuffer,
                filename,
                stats: {
                    elapsedSec: totalElapsedSec.toFixed(1),
                    speedMb: avgSpeed.toFixed(1),
                    channels: 1
                }
            };
        } else {
            const buffer = await resp.arrayBuffer();
            const totalElapsedSec = (Date.now() - dlStart) / 1000;
            const avgSpeed = (buffer.byteLength / (1024 * 1024)) / Math.max(0.1, totalElapsedSec);

            return {
                buffer,
                filename,
                stats: {
                    elapsedSec: totalElapsedSec.toFixed(1),
                    speedMb: avgSpeed.toFixed(1),
                    channels: 1
                }
            };
        }
    },

    resolveModelUrl(modelIdentifier) {
        /**
         * Resuelve un identificador de modelo o URL directa al endpoint real de Hugging Face.
         */
        if (typeof modelIdentifier !== 'string') {
            return ['https://huggingface.co/eaguilar/gaje-models/resolve/main/gaje_nano_1.5b.flat', 'gaje_nano_1.5b.flat'];
        }

        if (modelIdentifier.startsWith('http://') || modelIdentifier.startsWith('https://')) {
            const cleanUrl = modelIdentifier.split('?')[0];
            const parts = cleanUrl.split('/');
            const filename = parts[parts.length - 1] || 'model.flat';
            return [modelIdentifier, filename];
        }

        const modelMap = {
            'pico': ['gaje_pico_135m.flat', 'eaguilar/gaje-models'],
            'nano': ['gaje_nano_1.5b.flat', 'eaguilar/gaje-models'],
            'prime': ['gaje_prime_3b.flat', 'eaguilar/gaje-models'],
            'ultra': ['gaje_ultra_7b.flat', 'eaguilar/gaje-models'],
            'gaje_pico_135m.flat': ['gaje_pico_135m.flat', 'eaguilar/gaje-models'],
            'gaje_nano_1.5b.flat': ['gaje_nano_1.5b.flat', 'eaguilar/gaje-models'],
            'gaje_prime_3b.flat': ['gaje_prime_3b.flat', 'eaguilar/gaje-models'],
            'gaje_ultra_7b.flat': ['gaje_ultra_7b.flat', 'eaguilar/gaje-models'],
            'SmolLM2-135M-Instruct.flat': ['SmolLM2-135M-Instruct.flat', 'eaguilar/gaje-models'],
            'Qwen2-0.5B-Instruct.flat': ['Qwen2-0.5B-Instruct.flat', 'eaguilar/gaje-models'],
            'Qwen2.5-1.5B-Instruct.flat': ['Qwen2.5-1.5B-Instruct.flat', 'eaguilar/gaje-models']
        };

        if (modelMap[modelIdentifier]) {
            const [fname, repo] = modelMap[modelIdentifier];
            const cdnBase = window.GAJE_CONFIG?.cdnBaseUrl || `https://huggingface.co/${repo}/resolve/main/`;
            const url = cdnBase.endsWith('/') ? `${cdnBase}${encodeURIComponent(fname)}` : `${cdnBase}/${encodeURIComponent(fname)}`;
            return [url, fname];
        }

        const fname = modelIdentifier.endsWith('.flat') || modelIdentifier.endsWith('.gaje') ? modelIdentifier : `${modelIdentifier}.flat`;
        const cdnBase = window.GAJE_CONFIG?.cdnBaseUrl || 'https://huggingface.co/eaguilar/gaje-models/resolve/main/';
        const url = cdnBase.endsWith('/') ? `${cdnBase}${encodeURIComponent(fname)}` : `${cdnBase}/${encodeURIComponent(fname)}`;
        return [url, fname];
    }
};
