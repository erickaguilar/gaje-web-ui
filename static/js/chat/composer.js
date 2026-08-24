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

        this.addMessage(text, 'user');
        window.ChatStorage?.pushHistory({ role: 'user', content: text });
        userInput.value = '';
        userInput.style.height = 'auto';
        if (charCount) charCount.textContent = '0 car.';
        userInput.disabled = true;
        if (sendBtn) sendBtn.disabled = true;

        if (window.ArchView && typeof window.ArchView.isLoaded === 'function' && window.ArchView.isLoaded()) {
            window.ArchView.setFlow('inference');
        }

        if (engineMode === 'wasm') {
            await window.ChatEngineController?.wasmChat(text, modelValue);
            userInput.disabled = false;
            if (sendBtn) sendBtn.disabled = false;
            userInput.focus();
            return;
        }

        const ok = await window.ChatEngineController?.streamChat(text, modelValue);
        if (!ok) {
            await window.ChatEngineController?.fallbackChat(text, modelValue);
        }

        userInput.disabled = false;
        if (sendBtn) sendBtn.disabled = false;
        userInput.focus();
    },

    createBotMessage(modelName = null) {
        const modelSelect = document.getElementById('model-select');
        const msgDiv = document.createElement('div');
        msgDiv.className = 'message bot';
        const msgTime = window.ChatUtils.formatExactTime();
        msgDiv.setAttribute('data-time', msgTime);
        const mName = modelName || (modelSelect ? modelSelect.value : window.ChatState?.activeModel) || 'gaje-model';
        msgDiv.setAttribute('data-model', mName);
        return msgDiv;
    },

    addMessage(text, type, meta = null, explicitTime = null, modelName = null) {
        const chatWindow = document.getElementById('chat-window');
        const modelSelect = document.getElementById('model-select');
        if (!chatWindow) return;

        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${type}`;

        const timeStr = explicitTime || window.ChatUtils.formatExactTime();
        msgDiv.setAttribute('data-time', timeStr);

        const mName = modelName || (modelSelect ? modelSelect.value : window.ChatState?.activeModel) || 'gaje-model';
        msgDiv.setAttribute('data-model', mName);

        if (type === 'bot') {
            msgDiv.innerHTML = window.ChatMarkdown?.parse(text) || text;
            const latencyMs = meta && meta.latency_ms ? meta.latency_ms : null;
            const latencyStr = window.ChatUtils.formatLatency(latencyMs);

            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = this.renderMinimalMetaHtml(meta, mName, latencyStr, text, timeStr);
            const metaEl = tempDiv.firstElementChild;

            const copyBtn = metaEl.querySelector('.meta-btn-copy, .meta-copy-btn');
            if (copyBtn) {
                copyBtn.addEventListener('click', () => {
                    window.ChatUtils.copyTextToClipboard(text, copyBtn);
                });
            }
            msgDiv.appendChild(metaEl);
        } else if (type === 'user') {
            msgDiv.innerHTML = `<p>${window.ChatUtils.escapeHtml(text)}</p>`;
        } else {
            msgDiv.innerHTML = `<div class="msg-content"><p>${window.ChatUtils.escapeHtml(text)}</p></div>`;
        }

        chatWindow.appendChild(msgDiv);
        chatWindow.scrollTop = chatWindow.scrollHeight;
    },

    renderMinimalMetaHtml(meta, mName, latencyStr, fullText, timeStr = null) {
        const shortName = mName ? mName.replace('.gaje.flat', '').replace('.flat', '').replace('.gaje', '') : 'GAJE';
        const displayTime = timeStr || window.ChatUtils.formatExactTime();

        let badgesHtml = '';
        if (meta) {
            if (meta.compression_ratio) {
                badgesHtml += `<span class="meta-tag meta-stats" data-tooltip="Ratio de Compresión Semántica"><svg class="y2k-icon-inline"><use href="static/icons/y2k/sprite.svg#i-dna"/></svg> ${meta.compression_ratio}</span>`;
            }
            if (meta.island_retrieval_ms) {
                badgesHtml += `<span class="meta-tag meta-island" data-tooltip="Latencia de Memoria .gmem"><svg class="y2k-icon-inline"><use href="static/icons/y2k/sprite.svg#i-island"/></svg> ${meta.island_retrieval_ms}ms</span>`;
            }
            if (meta.tokens_per_second) {
                badgesHtml += `<span class="meta-tag meta-stats" data-tooltip="Velocidad de Generación"><svg class="y2k-icon-inline"><use href="static/icons/y2k/sprite.svg#i-bolt"/></svg> ${meta.tokens_per_second} tok/s</span>`;
            }
            if (meta.ppl) {
                badgesHtml += `<span class="meta-tag meta-stats" data-tooltip="Perplejidad Semántica"><svg class="y2k-icon-inline"><use href="static/icons/y2k/sprite.svg#i-dna"/></svg> PPL ${meta.ppl.toFixed(2)}</span>`;
            }
        }

        return `
            <div class="message-meta">
                <span class="meta-tag meta-model" data-tooltip="Modelo Activo"><svg class="y2k-icon-inline"><use href="static/icons/y2k/sprite.svg#i-sparkle"/></svg> ${shortName}</span>
                <span class="meta-tag meta-latency" data-tooltip="Latencia de Inferencia (HH:MM:SS::MS)"><svg class="y2k-icon-inline"><use href="static/icons/y2k/sprite.svg#i-clock"/></svg> ${latencyStr}</span>
                <span class="meta-tag meta-time" data-tooltip="Hora de Generación">${displayTime}</span>
                ${badgesHtml}
                <button class="meta-btn-copy" data-tooltip="Copiar respuesta al portapapeles" aria-label="Copiar respuesta">
                    <svg class="y2k-icon" width="12" height="12"><use href="static/icons/y2k/sprite.svg#i-copy"/></svg>
                    <span>Copiar</span>
                </button>
            </div>
        `;
    },

    addMetaTo(msgEl, elapsed, prefix = '', fullText = '', modelName = '', metrics = null) {
        const mName = modelName || msgEl.getAttribute('data-model') || '';
        const latencyText = window.ChatUtils.formatLatency(metrics && metrics.latency_ms ? metrics.latency_ms : elapsed);
        const finalLatency = prefix ? `${latencyText} (${prefix})` : latencyText;
        const msgTime = msgEl.getAttribute('data-time') || window.ChatUtils.formatExactTime();

        const tempContainer = document.createElement('div');
        tempContainer.innerHTML = this.renderMinimalMetaHtml(metrics, mName, finalLatency, fullText, msgTime);
        const meta = tempContainer.firstElementChild;

        const copyBtn = meta.querySelector('.meta-btn-copy, .meta-copy-btn');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                const textToCopy = fullText || msgEl.innerText;
                window.ChatUtils.copyTextToClipboard(textToCopy, copyBtn);
            });
        }
        msgEl.appendChild(meta);
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
