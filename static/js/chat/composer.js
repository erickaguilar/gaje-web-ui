/* =============================================================================
   🧬 GAJE — static/js/chat/composer.js
   Controlador de entrada de mensajes, renderizado de turnos y visualizador de ADN.
   ============================================================================= */

window.ChatComposerController = {
    init() {
        const sendBtn = document.getElementById('send-btn');
        const userInput = document.getElementById('user-input');
        const charCount = document.getElementById('char-count');

        if (sendBtn) sendBtn.addEventListener('click', () => this.sendMessage());

        if (userInput) {
            userInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendMessage();
                }
            });

            userInput.addEventListener('input', () => {
                // Auto-resize textarea dynamically
                userInput.style.height = 'auto';
                userInput.style.height = Math.min(userInput.scrollHeight, 160) + 'px';

                // Toggle send button disabled state based on input
                if (sendBtn) {
                    sendBtn.disabled = !userInput.value.trim().length;
                }

                // Update character counter
                if (charCount) {
                    const len = userInput.value.length;
                    charCount.textContent = `${len} car.`;
                }
            });
        }

        // Configurar botones de starters rápidos
        this.initStarters();
    },

    initStarters() {
        const starterCards = document.querySelectorAll('.starter-card');
        starterCards.forEach(card => {
            card.addEventListener('click', () => {
                const prompt = card.getAttribute('data-prompt');
                const userInput = document.getElementById('user-input');
                if (userInput && prompt) {
                    userInput.value = prompt;
                    userInput.dispatchEvent(new Event('input'));
                    this.sendMessage();
                }
            });
        });
    },

    hideStarters() {
        const starters = document.getElementById('chat-starters');
        if (starters) {
            starters.style.display = 'none';
        }
    },

    async sendMessage() {
        const userInput = document.getElementById('user-input');
        const sendBtn = document.getElementById('send-btn');
        const stopBtn = document.getElementById('stop-btn');
        const modelSelect = document.getElementById('model-select');
        const engineModeSelect = document.getElementById('engine-mode-select');
        const charCount = document.getElementById('char-count');

        if (!userInput) return;
        const text = userInput.value.trim();
        const modelValue = modelSelect ? modelSelect.value : (window.ChatState?.activeModel || 'qwen2_5_3b.flat');
        const engineMode = engineModeSelect ? engineModeSelect.value : (window.ChatState?.engineMode || 'native');

        if (!text) return;
        if (!modelValue || modelValue === 'none' || modelValue === '') {
            this.addMessage('Por favor, selecciona un modelo válido.', 'bot');
            return;
        }

        // Ocultar starters al primer turno
        this.hideStarters();

        const posixNow = window.ChatUtils.getUnixTimestamp();
        this.addMessage(text, 'user', null, null, null, posixNow);
        window.ChatStorage?.pushHistory({ role: 'user', content: text, timestampPosix: posixNow });
        userInput.value = '';
        userInput.style.height = 'auto';
        if (charCount) charCount.textContent = '0 car.';
        userInput.disabled = true;
        
        // Transición fluida a botón de Stop
        if (sendBtn) sendBtn.hidden = true;
        if (stopBtn) stopBtn.hidden = false;

        if (window.ArchView && typeof window.ArchView.isLoaded === 'function' && window.ArchView.isLoaded()) {
            window.ArchView.setFlow('inference');
        }

        try {
            if (engineMode === 'wasm') {
                await window.ChatEngineController?.wasmChat(text, modelValue);
            } else {
                const ok = await window.ChatEngineController?.streamChat(text, modelValue);
                if (!ok) {
                    const fallbackOk = await window.ChatEngineController?.fallbackChat(text, modelValue);
                    if (!fallbackOk) {
                        console.warn('[GAJE] Backend server no responde, ejecutando en modo WebAssembly en el navegador...');
                        await window.ChatEngineController?.wasmChat(text, modelValue);
                    }
                }
            }
        } finally {
            userInput.disabled = false;
            if (sendBtn) {
                sendBtn.hidden = false;
                sendBtn.disabled = true;
            }
            if (stopBtn) stopBtn.hidden = true;
            userInput.focus();
        }
    },

    createBotMessage(modelName = null) {
        const modelSelect = document.getElementById('model-select');
        const mName = modelName || (modelSelect ? modelSelect.value : window.ChatState?.activeModel) || 'gaje-model';
        const shortName = mName.replace('.gaje.flat', '').replace('.flat', '').replace('.gaje', '');
        const posixNow = window.ChatUtils.getUnixTimestamp();
        const msgTime = window.ChatUtils.formatExactTime(posixNow);
        const isoTime = window.ChatUtils.formatUnixIso(posixNow);

        const msgDiv = document.createElement('article');
        msgDiv.className = 'message bot';
        msgDiv.setAttribute('data-time', msgTime);
        msgDiv.setAttribute('data-unix-time', posixNow.toFixed(3));
        msgDiv.setAttribute('data-model', mName);

        msgDiv.innerHTML = `
            <header class="msg-header">
                <div class="msg-author">
                    <span class="msg-avatar-icon"><svg class="y2k-icon-inline"><use href="static/icons/y2k/sprite.svg#i-dna"/></svg></span>
                    <span class="msg-author-name">GAJE AI</span>
                    <span class="msg-model-tag">${shortName}</span>
                </div>
                <time class="msg-timestamp" datetime="${isoTime}" data-unix="${posixNow.toFixed(3)}" data-tooltip="Tiempo Unix POSIX: ${posixNow.toFixed(3)}s">${msgTime}</time>
            </header>
            <section class="msg-content"></section>
        `;
        return msgDiv;
    },

    addMessage(text, type, meta = null, explicitTime = null, modelName = null, explicitPosix = null) {
        const chatWindow = document.getElementById('chat-window');
        const modelSelect = document.getElementById('model-select');
        if (!chatWindow) return;

        const posixVal = (meta && meta.timestamp_posix) || explicitPosix || window.ChatUtils.getUnixTimestamp();
        const timeStr = (meta && meta.server_time) || explicitTime || window.ChatUtils.formatExactTime(posixVal);

        // Los mensajes de sistema se registran en la bitácora/auditoría sin ensuciar la ventana visual del chat
        if (type === 'system') {
            if (!window.ChatState) window.ChatState = {};
            if (!window.ChatState.systemAlertsHistory) window.ChatState.systemAlertsHistory = [];
            window.ChatState.systemAlertsHistory.push(`[${timeStr}] ${text}`);
            if (window.GajeDB && typeof window.GajeDB.saveAuditLog === 'function') {
                window.GajeDB.saveAuditLog(text, 'system');
            }
            return;
        }

        const isoTime = window.ChatUtils.formatUnixIso(posixVal);
        const mName = modelName || (modelSelect ? modelSelect.value : window.ChatState?.activeModel) || 'gaje-model';

        const msgDiv = document.createElement(type === 'bot' ? 'article' : 'div');
        msgDiv.className = `message ${type}`;
        msgDiv.setAttribute('data-time', timeStr);
        msgDiv.setAttribute('data-unix-time', Number(posixVal).toFixed(3));
        msgDiv.setAttribute('data-model', mName);

        if (type === 'bot') {
            const shortName = mName.replace('.gaje.flat', '').replace('.flat', '').replace('.gaje', '');
            const parsedBody = window.ChatMarkdown?.parse(text) || text;
            const footerHtml = this.renderTelemetryFooterHtml(meta, mName, text);

            msgDiv.innerHTML = `
                <header class="msg-header">
                    <div class="msg-author">
                        <span class="msg-avatar-icon"><svg class="y2k-icon-inline"><use href="static/icons/y2k/sprite.svg#i-dna"/></svg></span>
                        <span class="msg-author-name">GAJE AI</span>
                        <span class="msg-model-tag">${shortName}</span>
                    </div>
                    <time class="msg-timestamp" datetime="${isoTime}" data-unix="${Number(posixVal).toFixed(3)}" data-tooltip="Tiempo Unix POSIX: ${Number(posixVal).toFixed(3)}s">${timeStr}</time>
                </header>
                <section class="msg-content">
                    ${parsedBody}
                </section>
                ${footerHtml}
            `;

            const copyBtn = msgDiv.querySelector('.copy-btn');
            if (copyBtn) {
                copyBtn.addEventListener('click', () => {
                    window.ChatUtils.copyTextToClipboard(text, copyBtn);
                });
            }
        } else if (type === 'user') {
            msgDiv.innerHTML = `
                <header class="msg-header msg-user-header">
                    <div class="msg-author user-author">
                        <span class="msg-avatar-icon user-avatar"><svg class="y2k-icon-inline"><use href="static/icons/y2k/sprite.svg#i-user"/></svg></span>
                        <span class="msg-author-name user-author-name">Tú</span>
                        <span class="msg-user-tag user-role-tag">PROMPT</span>
                    </div>
                    <div class="user-header-right">
                        <time class="msg-timestamp user-timestamp" datetime="${isoTime}" data-unix="${Number(posixVal).toFixed(3)}" data-tooltip="Tiempo Unix POSIX: ${Number(posixVal).toFixed(3)}s">${timeStr}</time>
                        <div class="user-msg-actions">
                            <button type="button" class="user-action-btn user-copy-btn copy-btn" data-tooltip="Copiar prompt al portapapeles" aria-label="Copiar prompt">
                                <svg class="y2k-icon-inline"><use href="static/icons/y2k/sprite.svg#i-copy"/></svg>
                            </button>
                            <button type="button" class="user-action-btn user-edit-btn" data-tooltip="Reutilizar / Editar en composer" aria-label="Reutilizar prompt">
                                <svg class="y2k-icon-inline"><use href="static/icons/y2k/sprite.svg#i-edit"/></svg>
                            </button>
                        </div>
                    </div>
                </header>
                <section class="msg-content msg-user-content user-content">
                    <p>${window.ChatUtils.escapeHtml(text)}</p>
                </section>
            `;

            const copyBtn = msgDiv.querySelector('.copy-btn, .user-copy-btn');
            if (copyBtn) {
                copyBtn.addEventListener('click', () => {
                    window.ChatUtils.copyTextToClipboard(text, copyBtn);
                });
            }

            const editBtn = msgDiv.querySelector('.user-edit-btn');
            if (editBtn) {
                editBtn.addEventListener('click', () => {
                    const input = document.getElementById('user-input');
                    if (input) {
                        input.value = text;
                        input.focus();
                        input.style.height = 'auto';
                        input.style.height = `${Math.min(input.scrollHeight, 180)}px`;
                        const charCount = document.getElementById('char-count');
                        if (charCount) charCount.textContent = `${text.length} car.`;
                        const sendBtn = document.getElementById('send-btn');
                        if (sendBtn) {
                            sendBtn.hidden = false;
                            sendBtn.disabled = false;
                        }
                        const stopBtn = document.getElementById('stop-btn');
                        if (stopBtn) stopBtn.hidden = true;
                        input.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                });
            }
        } else {
            msgDiv.innerHTML = `<div class="msg-content"><p>${window.ChatUtils.escapeHtml(text)}</p></div>`;
        }

        chatWindow.appendChild(msgDiv);
        chatWindow.scrollTop = chatWindow.scrollHeight;
    },

    renderTelemetryFooterHtml(meta, mName, fullText, latencyOverride = null) {
        let pillsHtml = '';
        const latencyMs = (meta && meta.latency_ms) ? meta.latency_ms : null;
        const latencyStr = latencyOverride || window.ChatUtils.formatLatency(latencyMs);

        // 1. Latencia de Inferencia (Linux Monotonic Clock)
        pillsHtml += `<span class="telemetry-pill pill-latency" data-tooltip="Latencia de Inferencia (Linux Clock: HH:MM:SS::MS)"><svg class="y2k-icon-inline"><use href="static/icons/y2k/sprite.svg#i-clock"/></svg> <span>${latencyStr}</span></span>`;

        if (meta) {
            // 2. Velocidad de Generación (tok/s)
            const tokSec = meta.tokens_per_second || meta.tokens_sec || (meta.decode_tokens_sec ? `${meta.decode_tokens_sec}` : null);
            if (tokSec) {
                pillsHtml += `<span class="telemetry-pill pill-speed" data-tooltip="Velocidad de Generación"><svg class="y2k-icon-inline"><use href="static/icons/y2k/sprite.svg#i-bolt"/></svg> <span>${tokSec} tok/s</span></span>`;
            }
            // 3. Ratio de Compresión Semántica
            const ratio = meta.compression_ratio || (meta.ratio ? `${meta.ratio}x` : null);
            if (ratio) {
                pillsHtml += `<span class="telemetry-pill pill-compression" data-tooltip="Ratio de Compresión Semántica"><svg class="y2k-icon-inline"><use href="static/icons/y2k/sprite.svg#i-dna"/></svg> <span>${ratio}</span></span>`;
            }
            // 4. Memoria Island .gmem
            if (meta.island_retrieval_ms) {
                pillsHtml += `<span class="telemetry-pill pill-memory" data-tooltip="Latencia de Memoria .gmem"><svg class="y2k-icon-inline"><use href="static/icons/y2k/sprite.svg#i-island"/></svg> <span>${meta.island_retrieval_ms}ms</span></span>`;
            }
            // 5. Perplejidad PPL
            if (meta.ppl) {
                pillsHtml += `<span class="telemetry-pill pill-ppl" data-tooltip="Perplejidad Semántica"><span>PPL ${meta.ppl.toFixed(2)}</span></span>`;
            }
        }

        return `
            <footer class="msg-footer">
                <div class="msg-telemetry">
                    ${pillsHtml}
                </div>
                <div class="msg-actions">
                    <button type="button" class="msg-action-btn copy-btn" data-tooltip="Copiar respuesta al portapapeles" aria-label="Copiar respuesta">
                        <svg class="y2k-icon-inline"><use href="static/icons/y2k/sprite.svg#i-copy"/></svg>
                        <span>Copiar</span>
                    </button>
                </div>
            </footer>
        `;
    },

    addMetaTo(msgEl, elapsed, prefix = '', fullText = '', modelName = '', metrics = null) {
        const mName = modelName || msgEl.getAttribute('data-model') || '';
        const latencyText = window.ChatUtils.formatLatency(metrics && metrics.latency_ms ? metrics.latency_ms : elapsed);
        const finalLatency = prefix ? `${latencyText} (${prefix})` : latencyText;

        // Si el backend envió la hora exacta del servidor Linux, actualizar el timestamp en header
        if (metrics && metrics.server_time) {
            const timeEl = msgEl.querySelector('.msg-timestamp');
            if (timeEl) timeEl.textContent = metrics.server_time;
        }

        // Remover footer previo si existiera
        const existingFooter = msgEl.querySelector('.msg-footer, .message-meta');
        if (existingFooter) existingFooter.remove();

        const tempContainer = document.createElement('div');
        tempContainer.innerHTML = this.renderTelemetryFooterHtml(metrics, mName, fullText, finalLatency);
        const footerEl = tempContainer.firstElementChild;

        const copyBtn = footerEl.querySelector('.copy-btn');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                const textToCopy = fullText || msgEl.innerText;
                window.ChatUtils.copyTextToClipboard(textToCopy, copyBtn);
            });
        }
        msgEl.appendChild(footerEl);
    },

    updateMetrics(metrics) {
        if (!metrics) return;
        const setTxt = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.innerText = val;
        };

        if (metrics.latency_ms) setTxt('latency-val', `${metrics.latency_ms.toFixed(2)} ms`);
        if (metrics.compression_ratio) setTxt('ratio-val', metrics.compression_ratio);
        if (metrics.bpc) setTxt('bpc-val', metrics.bpc.toFixed(2));
        if (metrics.ppl) setTxt('ppl-val', metrics.ppl.toFixed(2));

        if (metrics.latency_ms) setTxt('modal-latency-val', `${metrics.latency_ms.toFixed(2)} ms`);
        if (metrics.compression_ratio) setTxt('modal-ratio-val', metrics.compression_ratio);
        if (metrics.bpc) setTxt('modal-bpc-val', metrics.bpc.toFixed(2));
        if (metrics.ppl) setTxt('modal-ppl-val', metrics.ppl.toFixed(2));
    },

    updateDNA(strand) {
        const dnaStrand = document.getElementById('dna-strand');
        if (!dnaStrand || !strand) return;
        dnaStrand.innerHTML = '';
        strand.split('').forEach(base => {
            const span = document.createElement('span');
            span.className = `base ${base.toLowerCase()}`;
            span.innerText = base;
            dnaStrand.appendChild(span);
        });
    }
};
