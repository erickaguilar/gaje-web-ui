/* =============================================================================
   🧬 GAJE — chat.js (Modular Core Architecture v1.7.0)
   Estructura modular y desacoplada preparada para componentes independientes:
   - ChatState (Gestor central de estado reactivo)
   - ChatUtils & ChatMarkdown (Utilidades, formateadores y parser Apple HIG)
   - ChatStorage (Persistencia IndexedDB & LocalStorage)
   - ChatToolbarController (Manejo de modelos, hardware y acciones)
   - ChatEngineController (Inferencia Nativa SSE + Worker WebAssembly)
   - ChatComposerController (Interacción de usuario y renderizado de turnos)
   - ChatTelemetryController (HUD de métricas y gestión de épocas)
   ============================================================================= */

(() => {
    'use strict';

    // =========================================================================
    // 1. ESTADO CENTRAL DEL CHAT (ChatState)
    // =========================================================================
    const ChatState = {
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

    // =========================================================================
    // 2. UTILIDADES Y FORMATEADORES (ChatUtils)
    // =========================================================================
    const ChatUtils = {
        escapeHtml(value) {
            return String(value).replace(/[&<>"']/g, c => ({
                '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
            }[c]));
        },

        formatExactTime(date = new Date()) {
            const d = date instanceof Date ? date : new Date(date);
            const target = isNaN(d.getTime()) ? new Date() : d;
            const hh = String(target.getHours()).padStart(2, '0');
            const mm = String(target.getMinutes()).padStart(2, '0');
            const ss = String(target.getSeconds()).padStart(2, '0');
            const mmm = String(target.getMilliseconds()).padStart(3, '0');
            return `${hh}:${mm}:${ss}::${mmm}`;
        },

        formatLatency(ms) {
            if (!ms && ms !== 0) return '00:00:00::000';
            const totalMs = Math.round(ms);
            const hours = Math.floor(totalMs / 3600000);
            const minutes = Math.floor((totalMs % 3600000) / 60000);
            const seconds = Math.floor((totalMs % 60000) / 1000);
            const milli = totalMs % 1000;

            const hh = String(hours).padStart(2, '0');
            const mm = String(minutes).padStart(2, '0');
            const ss = String(seconds).padStart(2, '0');
            const mmm = String(milli).padStart(3, '0');

            return `${hh}:${mm}:${ss}::${mmm}`;
        },

        formatBytes(bytes) {
            if (!bytes && bytes !== 0) return '—';
            const gb = bytes / (1024 * 1024 * 1024);
            if (gb >= 1) return gb.toFixed(2) + ' GB';
            const mb = bytes / (1024 * 1024);
            if (mb >= 1) return mb.toFixed(0) + ' MB';
            return Math.round(bytes) + ' B';
        },

        copyTextToClipboard(rawText, btnElement) {
            if (!rawText) return;
            let textToCopy = rawText;
            if (textToCopy.includes('<think>')) {
                textToCopy = textToCopy.replace(/<think>([\s\S]*?)<\/think>/i, (m, thought) => {
                    return `--- [RAZONAMIENTO] ---\n${thought.trim()}\n----------------------\n\n`;
                }).trim();
            }

            navigator.clipboard.writeText(textToCopy).then(() => {
                if (!btnElement) return;
                const originalHtml = btnElement.innerHTML;
                btnElement.classList.add('copied');
                btnElement.innerHTML = `
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                    <span style="color:#10b981; font-weight:600;">¡Copiado!</span>
                `;
                setTimeout(() => {
                    btnElement.classList.remove('copied');
                    btnElement.innerHTML = originalHtml;
                }, 2000);
            }).catch(err => {
                console.error('Error al copiar al portapapeles:', err);
            });
        },

        copyEntireChat(btnElement) {
            const chatWindow = document.getElementById('chat-window');
            if (!chatWindow) return;
            const messages = chatWindow.querySelectorAll('.message:not(.system)');
            if (!messages.length) return;

            let transcript = `=== CONVERSACIÓN GAJE HELIX ===\nFecha: ${new Date().toLocaleString()}\n\n`;
            messages.forEach(msg => {
                const isUser = msg.classList.contains('user');
                const msgModel = msg.getAttribute('data-model');
                const shortModel = msgModel ? msgModel.replace('.gaje.flat', '').replace('.flat', '').replace('.gaje', '') : '';
                const role = isUser ? '👤 USUARIO' : (shortModel ? `🧬 GAJE LLM (${shortModel})` : '🧬 GAJE LLM');

                let content = '';
                if (isUser) {
                    const p = msg.querySelector('p');
                    content = p ? p.innerText.trim() : msg.innerText.trim();
                } else {
                    const thoughtBox = msg.querySelector('.apple-thought-content');
                    if (thoughtBox) {
                        const rawThought = thoughtBox.innerText.trim();
                        if (rawThought) {
                            content += `[Razonamiento]:\n${rawThought}\n\n`;
                        }
                    }
                    const responseBody = msg.querySelector('.response-body');
                    if (responseBody) {
                        content += responseBody.innerText.trim();
                    } else {
                        const pClone = msg.cloneNode(true);
                        const box = pClone.querySelector('.apple-thought-box');
                        if (box) box.remove();
                        const meta = pClone.querySelector('.message-meta');
                        if (meta) meta.remove();
                        content += pClone.innerText.trim();
                    }
                    content = content.replace(/<\/?(thinks?|answers?|p|div|content)[^>]*>/gi, '').trim();
                }

                transcript += `[${role}]:\n${content}\n\n`;
            });

            navigator.clipboard.writeText(transcript.trim()).then(() => {
                if (!btnElement) return;
                const originalHtml = btnElement.innerHTML;
                const originalTitle = btnElement.getAttribute('title') || '';
                btnElement.classList.add('copied');
                btnElement.setAttribute('title', '¡Chat copiado!');
                btnElement.innerHTML = `
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                    <span class="visually-hidden">¡Chat Copiado!</span>
                `;
                setTimeout(() => {
                    btnElement.classList.remove('copied');
                    btnElement.setAttribute('title', originalTitle);
                    btnElement.innerHTML = originalHtml;
                }, 2000);
            });
        },

        generateProjectLog(btnElement) {
            const now = new Date().toLocaleString('es-ES', { dateStyle: 'full', timeStyle: 'medium' });
            const modelSelect = document.getElementById('model-select');
            const modelDate = document.getElementById('model-date');
            const modelSize = document.getElementById('model-size');
            const modelRam = document.getElementById('model-ram');
            const chatWindow = document.getElementById('chat-window');

            const selectedModelName = modelSelect ? modelSelect.value : (ChatState.activeModel || 'Desconocido');
            const modelDateText = modelDate ? modelDate.innerText : '—';
            const modelSizeText = modelSize ? modelSize.innerText : '—';
            const modelRamText = modelRam ? modelRam.innerText : '—';

            const islandMem = (ChatState.envData && ChatState.envData.island && ChatState.envData.island.memory_type) || document.getElementById('island-mem-val')?.innerText || '.gmem (Zero-Copy Mmap)';
            const islandLat = (ChatState.envData && ChatState.envData.island && ChatState.envData.island.retrieval_latency_ms != null) ? `${ChatState.envData.island.retrieval_latency_ms} ms` : (document.getElementById('island-lat-val')?.innerText || '0.75 ms');
            const islandBudget = (ChatState.envData && ChatState.envData.island && ChatState.envData.island.context_budget != null) ? `${ChatState.envData.island.context_budget} tokens` : (document.getElementById('island-budget-val')?.innerText || '512 tokens');
            const islandPills = Array.from(document.querySelectorAll('#island-pills .island-pill'))
                .map(p => p.innerText.trim())
                .filter(Boolean)
                .join(' | ') || '⚡ Episódica | 📚 Documental | 💬 Conversación';

            const sfVal = (ChatState.envData && ChatState.envData.software) || document.getElementById('sf-val')?.innerText || 'Rust 2021 (AVX2/FMA/AVX/SSE4.2) + PyO3 / Python 3.14.6';
            const hdVal = (ChatState.envData && ChatState.envData.hardware) || document.getElementById('hd-val')?.innerText || 'AMD Ryzen 7 5800H with Radeon Graphics - x86_64 (16 cores)';
            const gpuVal = (ChatState.envData && ChatState.envData.gpu) ? `${ChatState.envData.gpu.device_name} (${ChatState.envData.gpu.backend})` : (document.getElementById('modal-gpu-val')?.innerText || 'AMD Radeon Graphics (Vulkan)');
            const archVal = (ChatState.envData && ChatState.envData.architecture) || document.getElementById('arch-val')?.innerText || 'x86_64';
            const simdVal = (ChatState.envData && ChatState.envData.simd) || document.getElementById('simd-val')?.innerText || 'AVX2/FMA/AVX/SSE4.2';
            const coresVal = (ChatState.envData && ChatState.envData.cores) || document.getElementById('cores-val')?.innerText || '16';
            let latencyVal = document.getElementById('latency-val')?.innerText || '';
            if (!latencyVal || latencyVal.trim() === '—') latencyVal = 'Optimizado para baja latencia SIMD AVX2';

            let alertItems = '';
            if (ChatState.systemAlertsHistory && ChatState.systemAlertsHistory.length > 0) {
                alertItems = ChatState.systemAlertsHistory.map(a => `• ${a}`).join('\n');
            } else {
                const domAlerts = Array.from(document.querySelectorAll('#system-alerts-container .system-alert-item'))
                    .map(a => a.innerText.trim())
                    .filter(Boolean);
                alertItems = domAlerts.length > 0 ? domAlerts.map(a => `• ${a}`).join('\n') : '• [00:00:00] Núcleo GAJE iniciado. Listo para compresión semántica.';
            }

            const messages = chatWindow ? chatWindow.querySelectorAll('.message:not(.system)') : [];
            let chatTranscript = '';

            if (messages.length === 0) {
                chatTranscript = '(No hay mensajes en esta sesión aún)';
            } else {
                messages.forEach((msg) => {
                    const isUser = msg.classList.contains('user');
                    const time = msg.getAttribute('data-time') || '—';
                    const msgModel = msg.getAttribute('data-model') || selectedModelName;
                    const role = isUser ? '👤 USUARIO' : `🧬 GAJE LLM [${msgModel}]`;

                    if (isUser) {
                        const p = msg.querySelector('p');
                        const userText = p ? p.innerText.trim() : msg.innerText.trim();
                        chatTranscript += `--------------------------------------------------------------------------------\n`;
                        chatTranscript += `[${time}] ${role}:\n`;
                        chatTranscript += `💬 [MENSAJE]:\n${userText}\n\n`;
                    } else {
                        let thoughtText = '';
                        const thoughtEl = msg.querySelector('.apple-thought-content');
                        if (thoughtEl) {
                            const rawT = thoughtEl.innerText.trim();
                            if (rawT) thoughtText = `💡 [PROCESO DE RAZONAMIENTO / THINK]:\n${rawT}\n\n`;
                        }

                        let bodyText = '';
                        const respBody = msg.querySelector('.response-body, .stream-text');
                        if (respBody) {
                            bodyText = respBody.innerText.trim();
                        } else {
                            const pClone = msg.cloneNode(true);
                            const box = pClone.querySelector('.apple-thought-box');
                            if (box) box.remove();
                            const meta = pClone.querySelector('.message-meta');
                            if (meta) meta.remove();
                            const statusRow = pClone.querySelector('.stream-status-row, .stream-status');
                            if (statusRow) statusRow.remove();
                            bodyText = pClone.innerText.trim();
                        }
                        bodyText = bodyText.replace(/<\/?thinks?>/gi, '').trim();

                        let metaText = '';
                        const metaBadges = Array.from(msg.querySelectorAll('.message-meta .meta-tag:not(.meta-btn-copy), .message-meta .meta-badge:not(.meta-copy-btn)'))
                            .map(b => b.innerText.trim())
                            .filter(Boolean)
                            .join(' | ');
                        if (metaBadges) {
                            metaText = `\n📊 [Métricas del Turno]: ${metaBadges}`;
                        }

                        chatTranscript += `--------------------------------------------------------------------------------\n`;
                        chatTranscript += `[${time}] ${role}:\n`;
                        if (thoughtText) chatTranscript += `${thoughtText}`;
                        chatTranscript += `💬 [RESPUESTA]:\n${bodyText}`;
                        if (metaText) chatTranscript += `${metaText}`;
                        chatTranscript += `\n\n`;
                    }
                });
            }

            const logContent = `================================================================================
🧬 GAJE HELIX — BITÁCORA Y REGISTRO COMPLETO DEL PROYECTO (SYSTEM AUDIT LOG)
Fecha y Hora de Generación: ${now}
================================================================================

📦 1. MODELO GENÓMICO ACTIVO
--------------------------------------------------------------------------------
• Archivo del Modelo: ${selectedModelName}
• ${modelDateText}
• ${modelSizeText}
• ${modelRamText}

🏝️ 2. MEMORIA ISLAND MODEL (.gmem)
--------------------------------------------------------------------------------
• Persistencia: ${islandMem}
• Latencia de Retrieval: ${islandLat}
• Presupuesto de Contexto: ${islandBudget}
• Módulos de Memoria: ${islandPills}

⚙️ 3. ENTORNO DE EJECUCIÓN Y HARDWARE
--------------------------------------------------------------------------------
• Software: ${sfVal}
• Hardware: ${hdVal}
• Aceleración GPU: ${gpuVal}
• Arquitectura CPU: ${archVal} (Cores: ${coresVal})
• Instrucciones SIMD: ${simdVal}
• Rendimiento Inferencia: ${latencyVal}

🔔 4. REGISTRO DE ALERTAS DEL SISTEMA
--------------------------------------------------------------------------------
${alertItems}

💬 5. TRANSCRIPCIÓN SECUENCIAL DEL CHAT (CON HORAS EXACTAS)
================================================================================
${chatTranscript.trim()}
================================================================================
FIN DE LA BITÁCORA — GAJE NATIVE RUNTIME
================================================================================`;

            navigator.clipboard.writeText(logContent).then(() => {
                if (!btnElement) return;
                const originalHtml = btnElement.innerHTML;
                const originalTitle = btnElement.getAttribute('title') || '';
                btnElement.classList.add('copied');
                btnElement.setAttribute('title', '¡Log copiado al portapapeles!');
                btnElement.innerHTML = `
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                    <span class="visually-hidden">¡Log Copiado!</span>
                `;
                setTimeout(() => {
                    btnElement.classList.remove('copied');
                    btnElement.setAttribute('title', originalTitle);
                    btnElement.innerHTML = originalHtml;
                }, 2500);
            }).catch(err => {
                console.error('Error al copiar el log del proyecto:', err);
            });
        }
    };

    // =========================================================================
    // 3. PARSER MARKDOWN APPLE HIG (ChatMarkdown)
    // =========================================================================
    const ChatMarkdown = {
        parse(text) {
            if (!text) return '';

            let cleanText = text.replace(/<\|im_end\|>|<\|endoftext\|>|<end_of_turn>|<\/s>/gi, '').trim();
            let thoughtHtml = '';

            const thinkMatch = cleanText.match(/<think>([\s\S]*?)(?:<\/think>|$)/i);
            if (thinkMatch) {
                const rawThought = thinkMatch[1].trim();
                if (rawThought) {
                    const parsedThought = this.formatMarkdownBody(rawThought);
                    thoughtHtml = `
                        <details class="apple-thought-box" open>
                            <summary class="apple-thought-summary">
                                <span class="thought-icon">💡</span>
                                <span class="thought-label">Proceso de Razonamiento</span>
                                <span class="thought-badge">CoT</span>
                            </summary>
                            <div class="apple-thought-content">${parsedThought}</div>
                        </details>
                    `;
                }
                cleanText = cleanText.replace(/<think>[\s\S]*?(?:<\/think>|$)/i, '').trim();
            }

            const bodyHtml = this.formatMarkdownBody(cleanText);
            return thoughtHtml ? `${thoughtHtml}<div class="response-body">${bodyHtml}</div>` : bodyHtml;
        },

        formatMarkdownBody(txt) {
            if (!txt) return '';

            // Bloques de código
            txt = txt.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (match, lang, code) => {
                const langLabel = lang ? `<span class="code-lang">${lang.toUpperCase()}</span>` : '';
                return `
                    <div class="code-block-wrapper">
                        <div class="code-block-header">
                            ${langLabel}
                            <button class="code-copy-btn" onclick="navigator.clipboard.writeText(this.closest('.code-block-wrapper').querySelector('code').innerText); this.innerText='¡Copiado!'; setTimeout(() => this.innerText='Copiar', 1800);">Copiar</button>
                        </div>
                        <pre><code>${ChatUtils.escapeHtml(code.trim())}</code></pre>
                    </div>
                `;
            });

            // Código inline
            txt = txt.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

            // Negritas e itálicas
            txt = txt.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
            txt = txt.replace(/\*([^*]+)\*/g, '<em>$1</em>');

            // Listas
            txt = txt.replace(/^\s*[-*]\s+(.*)$/gim, '<li>$1</li>');
            txt = txt.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>');
            txt = txt.replace(/<\/ul>\s*<ul>/g, '');

            // Párrafos y saltos de línea
            const paragraphs = txt.split(/\n\n+/).map(p => {
                p = p.trim();
                if (!p) return '';
                if (p.startsWith('<div class="code-block-wrapper"') || p.startsWith('<ul') || p.startsWith('<details')) {
                    return p;
                }
                return `<p>${p.replace(/\n/g, '<br>')}</p>`;
            }).filter(Boolean);

            return paragraphs.join('');
        }
    };

    // =========================================================================
    // 4. ALMACENAMIENTO E HISTORIAL (ChatStorage)
    // =========================================================================
    const ChatStorage = {
        pushHistory(entry) {
            if (!entry.time) entry.time = ChatUtils.formatExactTime();
            if (entry.role === 'assistant' && !entry.model) {
                const modelSelect = document.getElementById('model-select');
                entry.model = modelSelect ? modelSelect.value : ChatState.activeModel;
            }
            if (window.GajeDB) {
                window.GajeDB.saveMessage(entry);
            }
        },

        clearHistory() {
            if (window.GajeDB) {
                window.GajeDB.clearAllMessages();
            }
        },

        async getRecentHistory(limit = 8) {
            if (!window.GajeDB) return [];
            try {
                const msgs = await window.GajeDB.getAllMessages();
                return (msgs || []).slice(-limit).map(e => ({ role: e.role, content: e.content }));
            } catch (e) {
                return [];
            }
        },

        async renderHistory() {
            const chatWindow = document.getElementById('chat-window');
            if (!chatWindow || !window.GajeDB) return;
            const arr = await window.GajeDB.getAllMessages();
            if (!arr || arr.length === 0) return;
            arr.forEach(entry => {
                if (entry.role === 'user') ChatComposerController.addMessage(entry.content, 'user', null, entry.time);
                else if (entry.role === 'assistant') ChatComposerController.addMessage(entry.content, 'bot', entry.meta || null, entry.time, entry.model);
                else if (entry.role === 'system') ChatComposerController.addMessage(entry.content, 'system', null, entry.time);
            });
            chatWindow.scrollTop = chatWindow.scrollHeight;
        }
    };

    // =========================================================================
    // 5. CONTROLADOR DE LA BARRA DE HERRAMIENTAS (ChatToolbarController)
    // =========================================================================
    const ChatToolbarController = {
        async init() {
            const host = document.getElementById('chat-toolbar');
            if (host && !host.children.length) {
                try {
                    const res = await fetch('static/partials/chat_toolbar.html?v=1.7.0');
                    if (res.ok) {
                        const html = await res.text();
                        host.innerHTML = html;
                    }
                } catch (err) {
                    console.warn('No se pudo cargar parcial chat_toolbar.html:', err);
                }
            }
            this.bindElements();
            const autoLoadEnabled = await this.loadEnvInfo();
            await this.loadModels(autoLoadEnabled);
        },

        bindElements() {
            const modelSelect = document.getElementById('model-select');
            if (modelSelect) {
                modelSelect.addEventListener('change', () => {
                    this.preloadModel(modelSelect.value);
                });
            }

            const clearHistoryBtn = document.getElementById('clear-history-btn');
            if (clearHistoryBtn) {
                clearHistoryBtn.addEventListener('click', () => {
                    ChatStorage.clearHistory();
                    const chatWindow = document.getElementById('chat-window');
                    if (chatWindow) {
                        const messages = chatWindow.querySelectorAll('.message');
                        messages.forEach(m => { if (!m.classList.contains('system')) m.remove(); });
                    }
                });
            }

            const unloadModelBtn = document.getElementById('unload-model-btn');
            if (unloadModelBtn) {
                unloadModelBtn.addEventListener('click', () => this.unloadModels());
            }

            const exportLogBtn = document.getElementById('export-log-btn');
            if (exportLogBtn) {
                exportLogBtn.addEventListener('click', () => ChatUtils.generateProjectLog(exportLogBtn));
            }

            const copyAllBtn = document.getElementById('copy-all-btn');
            if (copyAllBtn) {
                copyAllBtn.addEventListener('click', () => ChatUtils.copyEntireChat(copyAllBtn));
            }

            // Selector Nativo vs In-Browser WASM
            const engineModeSelect = document.getElementById('engine-mode-select');
            if (engineModeSelect) {
                engineModeSelect.addEventListener('change', (e) => this.onEngineModeChange(e.target.value));
            }

            // Carga de archivo .flat local privado
            const btnLoadLocalFlat = document.getElementById('load-local-flat-btn');
            const inputLocalFlat = document.getElementById('local-flat-file-input');
            if (btnLoadLocalFlat && inputLocalFlat) {
                btnLoadLocalFlat.addEventListener('click', () => inputLocalFlat.click());
                inputLocalFlat.addEventListener('change', (e) => this.onLocalFlatSelected(e));
            }

            // Menú Overflow (•••)
            const menuBtn = document.getElementById('chat-overflow-menu-btn');
            const menuDropdown = document.getElementById('chat-actions-dropdown');
            if (menuBtn && menuDropdown) {
                menuBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const isHidden = menuDropdown.hasAttribute('hidden');
                    if (isHidden) {
                        menuDropdown.removeAttribute('hidden');
                        menuBtn.setAttribute('aria-expanded', 'true');
                    } else {
                        menuDropdown.setAttribute('hidden', '');
                        menuBtn.setAttribute('aria-expanded', 'false');
                    }
                });

                document.addEventListener('click', (e) => {
                    if (!menuDropdown.contains(e.target) && e.target !== menuBtn && !menuBtn.contains(e.target)) {
                        menuDropdown.setAttribute('hidden', '');
                        menuBtn.setAttribute('aria-expanded', 'false');
                    }
                });

                menuDropdown.querySelectorAll('.chat-menu-item:not(.engine-select-item)').forEach(item => {
                    item.addEventListener('click', () => {
                        menuDropdown.setAttribute('hidden', '');
                        menuBtn.setAttribute('aria-expanded', 'false');
                    });
                });
            }
        },

        async loadModels(autoLoadEnabled = true) {
            const modelSelect = document.getElementById('model-select');
            if (!modelSelect) return;

            try {
                const response = await fetch('/api/models');
                const data = await response.json();
                if (data && data.models && data.models.length > 0) {
                    ChatState.modelsData = data.models;
                    modelSelect.innerHTML = '';
                    ChatState.modelsData.forEach(model => {
                        const opt = document.createElement('option');
                        opt.value = model.name;
                        let label = model.name;
                        if (label === 'qwen2_5_3b.flat') label = '⚡ Qwen 2.5 3B · Principal';
                        else if (label === 'deepseek_r1_1_5b.flat') label = '⚡ DeepSeek-R1 1.5B · CoT';
                        else if (label === 'feto_genomico_v1.gaje') label = '🧬 Feto Genómico v1 · Nacido GAJE';
                        else if (label === 'qwen2_0_5b.flat') label = '⚡ Qwen 2 0.5B · Micro';
                        else if (label === 'smollm2_135m.flat') label = '⚡ SmolLM2 135M · Nano';
                        else if (label.endsWith('.gaje')) label = '🧬 ' + label.replace('.gaje', '');
                        else if (label.endsWith('.flat')) label = '⚡ ' + label.replace('.flat', '');
                        else label = '⚡ ' + label;
                        opt.innerText = label;
                        modelSelect.appendChild(opt);
                    });
                    this.updateModelMeta();
                } else {
                    this.updateModelMeta();
                }
            } catch (err) {
                console.log('Usando modelos por defecto certificados.');
                this.updateModelMeta();
            }
        },

        async loadEnvInfo() {
            try {
                const response = await fetch('/api/info');
                const info = await response.json();
                if (!info || info.error) return true;
                ChatState.envData = info;

                const setTxt = (id, txt) => {
                    const el = document.getElementById(id);
                    if (el) el.innerText = txt || '---';
                };

                setTxt('sf-val', info.software);
                setTxt('hd-val', info.hardware);
                setTxt('arch-val', info.architecture);
                setTxt('simd-val', info.simd);
                setTxt('cores-val', info.cores);

                setTxt('modal-sf-val', info.software);
                setTxt('modal-hd-val', info.hardware);
                setTxt('modal-arch-val', info.architecture);
                setTxt('modal-simd-val', info.simd);
                setTxt('modal-cores-val', info.cores);

                const status = document.querySelector('.status-text');
                if (status && info.simd) status.innerText = info.simd + ' Optimized';

                const gpuHeaderBadge = document.getElementById('gpu-header-badge');
                const gpuHeaderText = document.getElementById('gpu-header-text');
                const modalGpuVal = document.getElementById('modal-gpu-val');
                if (info.gpu) {
                    const gpuName = info.gpu.device_name || 'AMD Radeon Vega';
                    const gpuBackend = info.gpu.backend || 'Vulkan';
                    if (gpuHeaderBadge) gpuHeaderBadge.style.display = 'inline-flex';
                    if (gpuHeaderText) gpuHeaderText.innerText = `🎮 GPU (${gpuBackend})`;
                    if (modalGpuVal) modalGpuVal.innerText = `🎮 ${gpuName} (${gpuBackend})`;
                } else {
                    if (gpuHeaderBadge) gpuHeaderBadge.style.display = 'none';
                    if (modalGpuVal) modalGpuVal.innerText = 'No activa (Fallback CPU SIMD)';
                }

                if (info.island) {
                    const pillsHtml = (info.island.pills || []).map(p => {
                        let typeClass = '';
                        const lower = p.toLowerCase();
                        if (lower.includes('episod')) typeClass = 'pill-episodic';
                        else if (lower.includes('doc')) typeClass = 'pill-documental';
                        else if (lower.includes('convers')) typeClass = 'pill-conversational';
                        return `<span class="island-pill ${typeClass}">${p}</span>`;
                    }).join('');

                    setTxt('island-pills', pillsHtml);
                    const p1 = document.getElementById('island-pills');
                    if (p1) p1.innerHTML = pillsHtml;
                    const p2 = document.getElementById('modal-island-pills');
                    if (p2) p2.innerHTML = pillsHtml;

                    if (info.island.memory_type) {
                        setTxt('island-mem-val', info.island.memory_type);
                        setTxt('modal-island-mem-val', info.island.memory_type);
                    }
                    if (info.island.retrieval_latency_ms != null) {
                        setTxt('island-lat-val', `${info.island.retrieval_latency_ms} ms`);
                        setTxt('modal-island-lat-val', `${info.island.retrieval_latency_ms} ms`);
                    }
                    if (info.island.context_budget != null) {
                        setTxt('island-budget-val', `${info.island.context_budget} tokens`);
                        setTxt('modal-island-budget-val', `${info.island.context_budget} tokens`);
                    }
                }
                return info.auto_load_model !== false;
            } catch (err) {
                console.log('No se pudo detectar el entorno de ejecución.');
                return true;
            }
        },

        updateModelMeta() {
            const modelSelect = document.getElementById('model-select');
            const modelDate = document.getElementById('model-date');
            const modelSize = document.getElementById('model-size');
            const modelRam = document.getElementById('model-ram');

            if (!modelSelect) return;
            const selected = modelSelect.value;
            ChatState.activeModel = selected;
            const model = ChatState.modelsData.find(m => m.name === selected);
            if (!model) return;

            if (model.date && modelDate) modelDate.innerText = model.date;
            if (model.size_bytes != null && modelSize) modelSize.innerText = ChatUtils.formatBytes(model.size_bytes);
            if (modelRam) {
                const ramMb = model.ram_mb || 0;
                const ramText = ramMb > 0 ? (ramMb >= 1024 ? (ramMb / 1024).toFixed(2) + ' GB' : ramMb.toFixed(0) + ' MB') : '0 MB';
                modelRam.innerHTML = `<span class="ram-led ${ramMb > 0 ? 'active' : ''}"></span><span>${ramText}</span>`;
                modelRam.setAttribute('title', `RAM: ${ramText} · HD: ${ChatUtils.formatBytes(model.size_bytes)} · Creado: ${model.date || '—'}`);
            }
        },

        async refreshModelMeta(modelName) {
            try {
                const response = await fetch('/api/models');
                const data = await response.json();
                if (data && data.models && data.models.length > 0) {
                    ChatState.modelsData = data.models;
                    this.updateModelMeta();
                }
            } catch (err) {
                console.log('No se pudo refrescar los metadatos del modelo.');
            }
        },

        setModelLoading(active) {
            const modelLoadBar = document.getElementById('model-load-bar');
            const chatWindow = document.getElementById('chat-window');
            if (modelLoadBar) {
                modelLoadBar.hidden = !active;
                modelLoadBar.setAttribute('aria-valuetext', active ? 'cargando' : 'inactivo');
            }
            if (chatWindow) chatWindow.setAttribute('aria-busy', active ? 'true' : 'false');
        },

        async preloadModel(modelName) {
            if (!modelName) return;
            const modelSelect = document.getElementById('model-select');
            const userInput = document.getElementById('user-input');
            const sendBtn = document.getElementById('send-btn');

            if (modelSelect) modelSelect.disabled = true;
            if (userInput) userInput.disabled = true;
            if (sendBtn) sendBtn.disabled = true;

            this.updateModelMeta();
            this.setModelLoading(true);
            ChatComposerController.addMessage(`🧬 Cargando organismo genómico [${modelName}] en el servidor... Por favor espera.`, 'system');

            try {
                const response = await fetch('/api/load_model', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ model: modelName })
                });

                const data = await response.json();
                if (data.status === 'ok') {
                    ChatComposerController.addMessage(`✅ Organismo [${modelName}] cargado y listo en memoria.`, 'system');
                    await this.refreshModelMeta(modelName);
                } else {
                    ChatComposerController.addMessage(`❌ Error cargando el modelo: ${data.error}`, 'bot');
                }
            } catch (err) {
                ChatComposerController.addMessage(`❌ Error de conexión al cargar [${modelName}].`, 'bot');
                console.error(err);
            } finally {
                this.setModelLoading(false);
                if (modelSelect) modelSelect.disabled = false;
                if (userInput) {
                    userInput.disabled = false;
                    userInput.focus();
                }
                if (sendBtn) sendBtn.disabled = false;
                this.loadEnvInfo();
            }
        },

        async unloadModels() {
            const unloadModelBtn = document.getElementById('unload-model-btn');
            if (unloadModelBtn) unloadModelBtn.disabled = true;
            ChatComposerController.addMessage(`🧬 Purgando por completo todos los modelos y buffers de la memoria RAM...`, 'system');
            try {
                const response = await fetch('/api/unload_model', { method: 'POST' });
                const data = await response.json();
                if (data.status === 'ok') {
                    ChatComposerController.addMessage(`✅ Memoria RAM del servidor liberada al 100%. Todos los modelos inactivos.`, 'system');
                    ChatState.modelsData.forEach(m => { m.ram_mb = 0.0; });
                    this.updateModelMeta();
                    this.loadEnvInfo();
                } else {
                    ChatComposerController.addMessage(`❌ Error liberando los modelos: ${data.error}`, 'bot');
                }
            } catch (err) {
                ChatComposerController.addMessage(`❌ Error de conexión al intentar liberar la memoria.`, 'bot');
                console.error(err);
            } finally {
                if (unloadModelBtn) unloadModelBtn.disabled = false;
            }
        },

        onEngineModeChange(mode) {
            ChatState.engineMode = mode;
            const wasmHeaderBadge = document.getElementById('wasm-header-badge');
            const gpuHeaderBadge = document.getElementById('gpu-header-badge');
            const modelSelect = document.getElementById('model-select');

            if (mode === 'wasm') {
                if (wasmHeaderBadge) wasmHeaderBadge.style.display = 'inline-flex';
                if (gpuHeaderBadge) gpuHeaderBadge.style.display = 'none';

                if (modelSelect && (modelSelect.value === 'qwen2_5_3b.flat' || modelSelect.value === 'deepseek_r1_1_5b.flat')) {
                    modelSelect.value = 'smollm2_135m.flat';
                    this.updateModelMeta();
                    ChatComposerController.addMessage('⚡ [WASM] Seleccionado SmolLM2 135M (optimizado para memoria del navegador).', 'system');
                }

                ChatEngineController.initWasmWorker();
                ChatComposerController.addMessage('Modo In-Browser WASM (Zero-Server) activado.', 'system');
            } else {
                if (wasmHeaderBadge) wasmHeaderBadge.style.display = 'none';
                ChatEngineController.stopAutonomicTick();
                if (ChatState.envData && ChatState.envData.gpu && gpuHeaderBadge) {
                    gpuHeaderBadge.style.display = 'inline-flex';
                }
                ChatComposerController.addMessage('Modo Servidor Nativo (AVX2/GPU) activado.', 'system');
            }
        },

        async onLocalFlatSelected(e) {
            const file = e.target.files[0];
            if (!file) return;

            const engineModeSelect = document.getElementById('engine-mode-select');
            if (engineModeSelect) {
                engineModeSelect.value = 'wasm';
                engineModeSelect.dispatchEvent(new Event('change'));
            }

            const worker = ChatEngineController.initWasmWorker();
            this.setModelLoading(true);
            ChatComposerController.addMessage(`📂 Cargando modelo local ${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} MB)...`, 'system');

            const reader = new FileReader();
            reader.onload = async (event) => {
                const buffer = event.target.result;
                const modelName = file.name;

                await new Promise((resolve, reject) => {
                    const handler = async (ev) => {
                        if (ev.data.status === 'model_loaded') {
                            worker.removeEventListener('message', handler);
                            if (window.GajeDB) {
                                const docBuf = await window.GajeDB.loadMemoryIsland(modelName, 'documental');
                                if (docBuf) worker.postMessage({ action: 'import_memory', payload: { niche: 'documental', buffer: docBuf } });
                                const convBuf = await window.GajeDB.loadMemoryIsland(modelName, 'conversational');
                                if (convBuf) worker.postMessage({ action: 'import_memory', payload: { niche: 'conversational', buffer: convBuf } });
                            }
                            resolve();
                        } else if (ev.data.status === 'error') {
                            worker.removeEventListener('message', handler);
                            reject(new Error(ev.data.error));
                        }
                    };
                    worker.addEventListener('message', handler);
                    worker.postMessage({ action: 'load_model', payload: { buffer, modelName } }, [buffer]);
                });
            };
            reader.readAsArrayBuffer(file);
        }
    };

    // =========================================================================
    // 6. CONTROLADOR DE MOTORES DE INFERENCIA (ChatEngineController)
    // =========================================================================
    const ChatEngineController = {
        initWasmWorker() {
            if (ChatState.wasmWorker) return ChatState.wasmWorker;
            ChatState.wasmWorker = new Worker('static/js/wasm_worker.js', { type: 'module' });
            ChatState.wasmWorker.postMessage({ action: 'init' });
            ChatState.wasmWorker.onmessage = (e) => {
                const data = e.data;
                const modelRam = document.getElementById('model-ram');
                if (data.status === 'ready') {
                    console.log('⚡ [GAJE-WASM] Web Worker listo para inferencia.');
                } else if (data.status === 'model_loaded') {
                    console.log(`✅ [GAJE-WASM] Modelo ${data.modelName} cargado en ${data.loadTimeMs} ms`, data.info);
                    ChatState.isWasmModelLoaded = true;
                    ChatState.wasmActiveModelName = data.modelName;
                    this.resetAutonomicCycle();
                    this.startAutonomicTick();
                    ChatToolbarController.setModelLoading(false);
                    if (modelRam) modelRam.innerHTML = `<span class="ram-led active"></span><span>WASM ${data.loadTimeMs}ms</span>`;
                    ChatComposerController.addMessage(`Modelo ${data.modelName} listo en WebAssembly (${data.loadTimeMs} ms).`, 'system');
                } else if (data.status === 'error') {
                    console.error('🔥 [GAJE-WASM Error]:', data.error);
                    ChatToolbarController.setModelLoading(false);
                    ChatComposerController.addMessage(`Error WASM: ${data.error}`, 'system');
                }
            };
            return ChatState.wasmWorker;
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
            if (!ChatState.isWasmModelLoaded || ChatState.autonomic.inFlight || !ChatState.wasmActiveModelName) return;
            ChatState.autonomic.inFlight = true;
            console.log(`💤 [GAJE-WASM] Ciclo autonómico automático (${reason})...`);

            const modelName = ChatState.wasmActiveModelName;
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
                        ChatComposerController.addMessage(`💤 Consolidación autonómica: ${s.episodic_transferred || 0} transferidos, ${s.duplicates_pruned || 0} podados.`, 'system');
                    }
                } finally {
                    ChatState.autonomic.inFlight = false;
                    ChatState.autonomic.lastCycleAt = Date.now();
                    ChatState.autonomic.interactions = 0;
                }
            };
            const onCycleError = (ev) => {
                if (ev.data.status !== 'error') return;
                worker.removeEventListener('message', onCycleDone);
                worker.removeEventListener('message', onCycleError);
                console.warn('🔥 [GAJE-WASM] Falló ciclo autonómico:', ev.data.error);
                ChatState.autonomic.inFlight = false;
                ChatState.autonomic.lastCycleAt = Date.now();
                ChatState.autonomic.interactions = 0;
            };

            worker.addEventListener('message', onCycleDone);
            worker.addEventListener('message', onCycleError);
            worker.postMessage({ action: 'sleep_cycle', payload: { dedupThreshold: 0.95 } });
        },

        maybeRunAutonomicCycle(reason) {
            if (!ChatState.isWasmModelLoaded || ChatState.autonomic.inFlight) return;
            const dueByUsage = ChatState.autonomic.interactions >= ChatState.autonomic.interactionsLimit;
            const dueByTime = (Date.now() - ChatState.autonomic.lastCycleAt) >= ChatState.autonomic.maxIntervalMs && ChatState.autonomic.interactions > 0;
            if (dueByUsage || dueByTime) {
                this.scheduleIdleWork(() => this.runAutonomicSleepCycle(reason));
            }
        },

        registerWasmInteraction() {
            ChatState.autonomic.interactions += 1;
            this.maybeRunAutonomicCycle(`uso: ${ChatState.autonomic.interactions} interacciones`);
        },

        resetAutonomicCycle() {
            ChatState.autonomic.interactions = 0;
            ChatState.autonomic.lastCycleAt = Date.now();
        },

        startAutonomicTick() {
            if (ChatState.autonomic.tickTimer) return;
            ChatState.autonomic.tickTimer = setInterval(() => this.maybeRunAutonomicCycle('temporal'), ChatState.autonomic.tickMs);
        },

        stopAutonomicTick() {
            if (ChatState.autonomic.tickTimer) {
                clearInterval(ChatState.autonomic.tickTimer);
                ChatState.autonomic.tickTimer = null;
            }
        },

        async wasmChat(text, modelName) {
            const chatWindow = document.getElementById('chat-window');
            const worker = this.initWasmWorker();
            const botMsg = ChatComposerController.createBotMessage(modelName);
            botMsg.classList.add('streaming');

            const statusEl = document.createElement('span');
            statusEl.className = 'stream-status';
            statusEl.textContent = 'WASM';
            const statusAnchor = document.createElement('div');
            statusAnchor.className = 'stream-status-row';
            statusAnchor.appendChild(statusEl);
            botMsg.appendChild(statusAnchor);

            const contentEl = document.createElement('p');
            contentEl.className = 'stream-text';
            contentEl.textContent = 'Procesando en WebAssembly...';
            botMsg.appendChild(contentEl);
            chatWindow.appendChild(botMsg);
            chatWindow.scrollTop = chatWindow.scrollHeight;

            const started = Date.now();
            ChatToolbarController.setModelLoading(true);

            try {
                if (!ChatState.isWasmModelLoaded || ChatState.wasmActiveModelName !== modelName) {
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

                ChatToolbarController.setModelLoading(false);
                botMsg.classList.remove('streaming');
                statusAnchor.remove();

                const responseText = result.text || contentEl.textContent;
                contentEl.innerHTML = ChatMarkdown.parse(responseText);

                const elapsed = Date.now() - started;
                const wasmMetrics = {
                    latency_ms: elapsed,
                    tokens_per_second: (result.tokenCount / (elapsed / 1000)).toFixed(1),
                    compression_ratio: '16.0x (WASM)',
                    mode: 'WASM In-Browser'
                };

                ChatComposerController.addMetaTo(botMsg, elapsed, 'WASM', responseText, modelName, wasmMetrics);
                ChatStorage.pushHistory({ role: 'assistant', content: responseText, model: modelName, metrics: wasmMetrics });
                ChatComposerController.updateMetrics(wasmMetrics);
                this.registerWasmInteraction();
                chatWindow.scrollTop = chatWindow.scrollHeight;
                return true;
            } catch (err) {
                ChatToolbarController.setModelLoading(false);
                botMsg.classList.remove('streaming');
                statusAnchor.remove();
                contentEl.innerHTML = `<span style="color: #fca5a5">Error WASM: ${err.message}</span>`;
                chatWindow.scrollTop = chatWindow.scrollHeight;
                return false;
            }
        },

        async streamChat(message, modelName) {
            const chatWindow = document.getElementById('chat-window');
            const botMsg = ChatComposerController.createBotMessage(modelName);
            botMsg.classList.add('streaming');

            const statusEl = document.createElement('span');
            statusEl.className = 'stream-status';
            statusEl.textContent = 'Generando';
            const statusAnchor = document.createElement('div');
            statusAnchor.className = 'stream-status-row';
            statusAnchor.appendChild(statusEl);
            botMsg.appendChild(statusAnchor);

            const contentEl = document.createElement('p');
            contentEl.className = 'stream-text';
            botMsg.appendChild(contentEl);
            chatWindow.appendChild(botMsg);
            chatWindow.scrollTop = chatWindow.scrollHeight;

            ChatState.abortController = new AbortController();
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
                ChatState.abortController = null;
                if (stopBtn) stopBtn.hidden = true;
                if (chatWindow) chatWindow.setAttribute('aria-busy', 'false');
                botMsg.classList.remove('streaming');
                statusAnchor.remove();
                const elapsed = Date.now() - started;
                if (aborted && fullText) {
                    ChatComposerController.addMetaTo(botMsg, elapsed, '⏹️ detenido', fullText, modelName, latestMetrics);
                } else if (!aborted) {
                    ChatComposerController.addMetaTo(botMsg, elapsed, '', fullText, modelName, latestMetrics);
                }
                if (fullText) ChatStorage.pushHistory({ role: 'assistant', content: fullText, model: modelName, metrics: latestMetrics });
                chatWindow.scrollTop = chatWindow.scrollHeight;
            };

            if (stopBtn) {
                stopBtn.onclick = () => {
                    if (ChatState.abortController) ChatState.abortController.abort();
                };
            }

            const recentHistory = await ChatStorage.getRecentHistory(8);

            return fetch('/api/chat/stream', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: message, model: modelName, history: recentHistory }),
                signal: ChatState.abortController.signal
            }).then(async (response) => {
                if (!response.ok) {
                    const data = await response.json().catch(() => ({}));
                    botMsg.remove();
                    ChatComposerController.addMessage(`Error: ${data.error || 'Fallo en el stream'}`, 'bot');
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
                                        if (parsed.dna) ChatComposerController.updateDNA(parsed.dna);
                                        ChatComposerController.updateMetrics(latestMetrics);
                                        continue;
                                    }
                                    if (parsed.error) throw new Error(parsed.error);
                                }
                                fullText += (typeof parsed === 'string' ? parsed : '');
                                contentEl.innerHTML = ChatMarkdown.parse(fullText);
                                chatWindow.scrollTop = chatWindow.scrollHeight;
                            } catch (e) {
                                if (e.message) {
                                    botMsg.remove();
                                    ChatComposerController.addMessage(`Error: ${e.message}`, 'bot');
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
                ChatComposerController.addMessage('Error de conexión con el núcleo GAJE (streaming).', 'bot');
                finish(true);
                return false;
            });
        },

        async fallbackChat(text, modelName) {
            try {
                const recentHistory = await ChatStorage.getRecentHistory(8);
                const response = await fetch('/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: text, model: modelName, history: recentHistory })
                });
                const data = await response.json();
                if (data.error) {
                    ChatComposerController.addMessage(`Error: ${data.error}`, 'bot', null, null, modelName);
                } else {
                    ChatComposerController.addMessage(data.response, 'bot', data.metrics, null, modelName);
                    ChatStorage.pushHistory({ role: 'assistant', content: data.response, model: modelName });
                    ChatComposerController.updateMetrics(data.metrics);
                    ChatComposerController.updateDNA(data.dna);
                }
            } catch (err) {
                ChatComposerController.addMessage('Error de conexión con el núcleo GAJE.', 'bot', null, null, modelName);
                console.error(err);
            }
        }
    };

    // =========================================================================
    // 7. CONTROLADOR DE INTERACCIÓN Y COMPOSER (ChatComposerController)
    // =========================================================================
    const ChatComposerController = {
        init() {
            const sendBtn = document.getElementById('send-btn');
            const userInput = document.getElementById('user-input');

            if (sendBtn) sendBtn.addEventListener('click', () => this.sendMessage());
            if (userInput) {
                userInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') this.sendMessage();
                });
            }
        },

        async sendMessage() {
            const userInput = document.getElementById('user-input');
            const sendBtn = document.getElementById('send-btn');
            const modelSelect = document.getElementById('model-select');
            const engineModeSelect = document.getElementById('engine-mode-select');

            if (!userInput) return;
            const text = userInput.value.trim();
            const modelValue = modelSelect ? modelSelect.value : ChatState.activeModel;
            const engineMode = engineModeSelect ? engineModeSelect.value : ChatState.engineMode;

            if (!text) return;
            if (!modelValue || modelValue === 'none' || modelValue === '') {
                this.addMessage('Por favor, selecciona un modelo válido.', 'bot');
                return;
            }

            this.addMessage(text, 'user');
            ChatStorage.pushHistory({ role: 'user', content: text });
            userInput.value = '';
            userInput.disabled = true;
            if (sendBtn) sendBtn.disabled = true;

            if (window.ArchView && typeof window.ArchView.isLoaded === 'function' && window.ArchView.isLoaded()) {
                window.ArchView.setFlow('inference');
            }

            if (engineMode === 'wasm') {
                await ChatEngineController.wasmChat(text, modelValue);
                userInput.disabled = false;
                if (sendBtn) sendBtn.disabled = false;
                userInput.focus();
                return;
            }

            const ok = await ChatEngineController.streamChat(text, modelValue);
            if (!ok) {
                await ChatEngineController.fallbackChat(text, modelValue);
            }

            userInput.disabled = false;
            if (sendBtn) sendBtn.disabled = false;
            userInput.focus();
        },

        createBotMessage(modelName = null) {
            const modelSelect = document.getElementById('model-select');
            const msgDiv = document.createElement('div');
            msgDiv.className = 'message bot';
            const msgTime = ChatUtils.formatExactTime();
            msgDiv.setAttribute('data-time', msgTime);
            const mName = modelName || (modelSelect ? modelSelect.value : ChatState.activeModel) || 'gaje-model';
            msgDiv.setAttribute('data-model', mName);
            return msgDiv;
        },

        addMessage(text, type, meta = null, explicitTime = null, modelName = null) {
            const chatWindow = document.getElementById('chat-window');
            const modelSelect = document.getElementById('model-select');
            if (!chatWindow) return;

            const msgDiv = document.createElement('div');
            msgDiv.className = `message ${type}`;

            const timeStr = explicitTime || ChatUtils.formatExactTime();
            msgDiv.setAttribute('data-time', timeStr);

            const mName = modelName || (modelSelect ? modelSelect.value : ChatState.activeModel) || 'gaje-model';
            msgDiv.setAttribute('data-model', mName);

            if (type === 'bot') {
                msgDiv.innerHTML = ChatMarkdown.parse(text);
                const latencyMs = meta && meta.latency_ms ? meta.latency_ms : null;
                const latencyStr = ChatUtils.formatLatency(latencyMs);

                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = this.renderMinimalMetaHtml(meta, mName, latencyStr, text, timeStr);
                const metaEl = tempDiv.firstElementChild;

                const copyBtn = metaEl.querySelector('.meta-btn-copy, .meta-copy-btn');
                if (copyBtn) {
                    copyBtn.addEventListener('click', () => {
                        ChatUtils.copyTextToClipboard(text, copyBtn);
                    });
                }
                msgDiv.appendChild(metaEl);
            } else if (type === 'user') {
                msgDiv.innerHTML = `<p>${ChatUtils.escapeHtml(text)}</p>`;
            } else {
                msgDiv.innerHTML = `<div class="msg-content"><p>${ChatUtils.escapeHtml(text)}</p></div>`;
            }

            chatWindow.appendChild(msgDiv);
            chatWindow.scrollTop = chatWindow.scrollHeight;
        },

        renderMinimalMetaHtml(meta, mName, latencyStr, fullText, timeStr = null) {
            const shortName = mName ? mName.replace('.gaje.flat', '').replace('.flat', '').replace('.gaje', '') : 'GAJE';
            const displayTime = timeStr || ChatUtils.formatExactTime();

            let badgesHtml = '';
            if (meta) {
                if (meta.compression_ratio) {
                    badgesHtml += `<span class="meta-tag meta-stats" data-tooltip="Ratio de Compresión Semántica">🧬 ${meta.compression_ratio}</span>`;
                }
                if (meta.island_retrieval_ms) {
                    badgesHtml += `<span class="meta-tag meta-island" data-tooltip="Latencia de Memoria .gmem">🏝️ ${meta.island_retrieval_ms}ms</span>`;
                }
                if (meta.tokens_per_second) {
                    badgesHtml += `<span class="meta-tag meta-stats" data-tooltip="Velocidad de Generación">⚡ ${meta.tokens_per_second} tok/s</span>`;
                }
                if (meta.ppl) {
                    badgesHtml += `<span class="meta-tag meta-stats" data-tooltip="Perplejidad Semántica">📉 PPL ${meta.ppl.toFixed(2)}</span>`;
                }
            }

            return `
                <div class="message-meta">
                    <span class="meta-tag meta-model" data-tooltip="Modelo Activo">${shortName}</span>
                    <span class="meta-tag meta-latency" data-tooltip="Latencia de Inferencia (HH:MM:SS::MS)">⏱️ ${latencyStr}</span>
                    <span class="meta-tag meta-time" data-tooltip="Hora de Generación">${displayTime}</span>
                    ${badgesHtml}
                    <button class="meta-btn-copy" data-tooltip="Copiar respuesta al portapapeles" aria-label="Copiar respuesta">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                        <span>Copiar</span>
                    </button>
                </div>
            `;
        },

        addMetaTo(msgEl, elapsed, prefix = '', fullText = '', modelName = '', metrics = null) {
            const mName = modelName || msgEl.getAttribute('data-model') || '';
            const latencyText = ChatUtils.formatLatency(metrics && metrics.latency_ms ? metrics.latency_ms : elapsed);
            const finalLatency = prefix ? `${latencyText} (${prefix})` : latencyText;
            const msgTime = msgEl.getAttribute('data-time') || ChatUtils.formatExactTime();

            const tempContainer = document.createElement('div');
            tempContainer.innerHTML = this.renderMinimalMetaHtml(metrics, mName, finalLatency, fullText, msgTime);
            const meta = tempContainer.firstElementChild;

            const copyBtn = meta.querySelector('.meta-btn-copy, .meta-copy-btn');
            if (copyBtn) {
                copyBtn.addEventListener('click', () => {
                    const textToCopy = fullText || msgEl.innerText;
                    ChatUtils.copyTextToClipboard(textToCopy, copyBtn);
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

            // Sincronizar con el modal HUD
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

    // =========================================================================
    // 8. CONTROLADOR DE TELEMETRÍA Y MODAL HUD (ChatTelemetryController)
    // =========================================================================
    const ChatTelemetryController = {
        init() {
            const modal = document.getElementById('metrics-monitor-modal');
            if (!modal) return;

            const openHeaderBtn = document.getElementById('y2k-open-monitor-btn');
            const openSidebarBtn = document.getElementById('sidebar-open-monitor-btn');

            if (openHeaderBtn) openHeaderBtn.addEventListener('click', () => this.openModal(modal));
            if (openSidebarBtn) openSidebarBtn.addEventListener('click', () => this.openModal(modal));

            // Backdrop click para cerrar
            if (!('closedBy' in HTMLDialogElement.prototype)) {
                modal.addEventListener('click', (event) => {
                    if (event.target !== modal) return;
                    const rect = modal.getBoundingClientRect();
                    const isInside = (
                        rect.top <= event.clientY &&
                        event.clientY <= rect.top + rect.height &&
                        rect.left <= event.clientX &&
                        event.clientX <= rect.left + rect.width
                    );
                    if (!isInside) this.closeModal(modal);
                });
            }

            const closeDot = document.getElementById('modal-close-dot');
            const closeBtn = document.getElementById('modal-close-btn');
            if (closeDot) closeDot.addEventListener('click', () => this.closeModal(modal));
            if (closeBtn) closeBtn.addEventListener('click', () => this.closeModal(modal));

            const minDot = document.getElementById('modal-min-dot');
            const maxDot = document.getElementById('modal-max-dot');
            if (minDot) {
                minDot.addEventListener('click', () => {
                    modal.style.maxWidth = '860px';
                    modal.style.width = '92vw';
                });
            }
            if (maxDot) {
                maxDot.addEventListener('click', () => {
                    if (modal.style.maxWidth === '98vw') {
                        modal.style.maxWidth = '860px';
                        modal.style.width = '92vw';
                    } else {
                        modal.style.maxWidth = '98vw';
                        modal.style.width = '98vw';
                    }
                });
            }

            // Pestañas segmentadas
            const tabs = modal.querySelectorAll('.seg-tab');
            const panes = modal.querySelectorAll('.tab-pane');
            tabs.forEach(tab => {
                tab.addEventListener('click', () => {
                    tabs.forEach(t => {
                        t.classList.remove('active');
                        t.setAttribute('aria-selected', 'false');
                    });
                    panes.forEach(p => {
                        p.classList.remove('active');
                        p.setAttribute('hidden', '');
                    });

                    tab.classList.add('active');
                    tab.setAttribute('aria-selected', 'true');
                    const targetId = tab.getAttribute('data-tab');
                    const targetPane = document.getElementById(targetId);
                    if (targetPane) {
                        targetPane.classList.add('active');
                        targetPane.removeAttribute('hidden');
                    }
                    if (targetId === 'tab-storage') this.updateStorageTabStats();
                    if (targetId === 'tab-island') this.updateEpochsTab();
                });
            });

            window.addEventListener('gaje:db:changed', () => this.updateStorageTabStats());

            this.bindStorageActions();
            this.bindEpochActions();
        },

        openModal(modal) {
            this.updateStorageTabStats();
            this.updateEpochsTab();
            if (typeof modal.showModal === 'function') {
                modal.showModal();
            } else {
                modal.setAttribute('open', '');
            }
        },

        closeModal(modal) {
            if (typeof modal.close === 'function') {
                modal.close();
            } else {
                modal.removeAttribute('open');
            }
        },

        async updateStorageTabStats() {
            if (!window.GajeDB) return;
            const countEl = document.getElementById('modal-storage-msg-count');
            const usageEl = document.getElementById('modal-storage-usage-val');
            const quotaEl = document.getElementById('modal-storage-quota-val');

            const count = await window.GajeDB.getMessageCount();
            const est = await window.GajeDB.getStorageEstimate();

            if (countEl) countEl.innerText = `${count} mensajes`;
            if (usageEl) usageEl.innerText = est.usageFormatted;
            if (quotaEl) quotaEl.innerText = est.quotaFormatted !== 'N/A' ? `${est.quotaFormatted} (${est.percentUsed}% en uso)` : 'Ilimitada / No restringida';
        },

        async updateEpochsTab() {
            const tableBody = document.getElementById('modal-epochs-table-body');
            const feedback = document.getElementById('epoch-action-feedback');
            const modelSelect = document.getElementById('model-select');
            if (!tableBody) return;

            const selectedModel = modelSelect ? modelSelect.value : ChatState.activeModel;
            const organism = selectedModel.replace('.flat', '').replace('.gaje', '');

            try {
                const res = await fetch(`/api/memory/epochs?organism=${encodeURIComponent(organism)}`);
                const data = await res.json();
                if (!data || data.error || !data.epochs) {
                    tableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 0.8rem; color: var(--text-muted);">${data?.error || 'Sin épocas registradas'}</td></tr>`;
                    return;
                }

                tableBody.innerHTML = '';
                data.epochs.forEach(ep => {
                    const isActive = ep.epoch_id === data.active_epoch_id;
                    const tr = document.createElement('tr');
                    tr.style.borderBottom = '1px solid rgba(255,255,255,0.04)';
                    if (isActive) tr.style.background = 'rgba(56, 189, 248, 0.08)';

                    const verdictColor = ep.verdict === 'PROMOTED' || ep.verdict === 'SEALED' ? '#4ade80' : (ep.verdict === 'REJECTED' ? '#f87171' : '#38bdf8');
                    const badge = `<span style="display: inline-block; padding: 0.1rem 0.35rem; border-radius: 4px; font-size: 0.65rem; background: ${verdictColor}22; color: ${verdictColor}; border: 1px solid ${verdictColor}55;">${ep.verdict}</span>`;
                    const dateStr = ep.created_at ? ep.created_at.substring(0, 19).replace('T', ' ') : '—';

                    tr.innerHTML = `
                        <td style="padding: 0.4rem; font-weight: ${isActive ? 'bold' : 'normal'}; color: ${isActive ? 'var(--neon-cyan)' : 'inherit'};">
                            ${isActive ? '★ ' : ''}${ep.epoch_id}
                        </td>
                        <td style="padding: 0.4rem; color: var(--text-muted);">${ep.parent_epoch}</td>
                        <td style="padding: 0.4rem;">${badge}</td>
                        <td style="padding: 0.4rem;">${ep.entries_count}</td>
                        <td style="padding: 0.4rem; font-family: monospace; font-size: 0.68rem; color: var(--text-muted);">${dateStr}</td>
                        <td style="padding: 0.4rem; color: var(--text-muted); max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${ep.comment}">${ep.comment}</td>
                        <td style="padding: 0.4rem; text-align: center;">
                            ${isActive ? '<span style="font-size: 0.65rem; color: var(--neon-cyan);">ACTIVA</span>' : `<button class="apple-pill-btn btn-rollback-epoch" data-epoch-id="${ep.epoch_id}" style="font-size: 0.62rem; padding: 0.15rem 0.45rem;">⚡ Rollback</button>`}
                        </td>
                    `;
                    tableBody.appendChild(tr);
                });

                tableBody.querySelectorAll('.btn-rollback-epoch').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        const epId = parseInt(e.target.getAttribute('data-epoch-id'), 10);
                        if (!epId) return;
                        if (feedback) {
                            feedback.style.display = 'block';
                            feedback.innerText = `Ejecutando rollback determinista a Época ${epId}...`;
                        }
                        try {
                            const rbRes = await fetch('/api/memory/epochs/rollback', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ organism, epoch_id: epId })
                            });
                            const rbData = await rbRes.json();
                            if (feedback) {
                                feedback.innerText = `✓ Rollback completado a Época ${rbData.active_epoch_id}`;
                                setTimeout(() => { feedback.style.display = 'none'; }, 3000);
                            }
                            this.updateEpochsTab();
                        } catch (err) {
                            if (feedback) feedback.innerText = `Error: ${err.message}`;
                        }
                    });
                });
            } catch (err) {
                tableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 0.8rem; color: #f87171;">Error cargando épocas: ${err.message}</td></tr>`;
            }
        },

        bindEpochActions() {
            const btnSnapshot = document.getElementById('btn-epoch-snapshot');
            const btnSleep = document.getElementById('btn-epoch-sleep');
            const btnRefresh = document.getElementById('btn-epoch-refresh');
            const feedback = document.getElementById('epoch-action-feedback');
            const modelSelect = document.getElementById('model-select');
            const engineModeSelect = document.getElementById('engine-mode-select');

            if (btnRefresh) btnRefresh.addEventListener('click', () => this.updateEpochsTab());

            if (btnSnapshot) {
                btnSnapshot.addEventListener('click', async () => {
                    const selectedModel = modelSelect ? modelSelect.value : ChatState.activeModel;
                    const organism = selectedModel.replace('.flat', '').replace('.gaje', '');
                    const comment = prompt('Comentario para el Snapshot de Memoria:', 'Snapshot Manual Web UI');
                    if (comment === null) return;
                    if (feedback) {
                        feedback.style.display = 'block';
                        feedback.innerText = 'Creando snapshot inmutable de memoria...';
                    }
                    try {
                        const res = await fetch('/api/memory/epochs/snapshot', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ organism, comment })
                        });
                        const data = await res.json();
                        if (feedback) {
                            feedback.innerText = `✓ Snapshot creado: Época ID ${data.epoch_id}`;
                            setTimeout(() => { feedback.style.display = 'none'; }, 3500);
                        }
                        this.updateEpochsTab();
                    } catch (err) {
                        if (feedback) feedback.innerText = `Error: ${err.message}`;
                    }
                });
            }

            if (btnSleep) {
                btnSleep.addEventListener('click', async () => {
                    const selectedModel = modelSelect ? modelSelect.value : ChatState.activeModel;
                    const organism = selectedModel.replace('.flat', '').replace('.gaje', '');
                    if (feedback) {
                        feedback.style.display = 'block';
                        feedback.innerText = '💤 Ejecutando Ciclo de Sueño: Consolidando y podando memoria volátil...';
                    }
                    try {
                        if (engineModeSelect && engineModeSelect.value === 'wasm') {
                            const worker = ChatEngineController.initWasmWorker();
                            const sleepResult = await new Promise((resolve, reject) => {
                                const handler = (ev) => {
                                    if (ev.data.status === 'sleep_cycle_completed') {
                                        worker.removeEventListener('message', handler);
                                        resolve(ev.data);
                                    } else if (ev.data.status === 'error') {
                                        worker.removeEventListener('message', handler);
                                        reject(new Error(ev.data.error));
                                    }
                                };
                                worker.addEventListener('message', handler);
                                worker.postMessage({ action: 'sleep_cycle', payload: { dedupThreshold: 0.95 } });
                            });

                            worker.postMessage({ action: 'export_memory', payload: { niche: 'documental' } });
                            const expHandler = async (ev) => {
                                if (ev.data.status === 'memory_exported' && window.GajeDB) {
                                    worker.removeEventListener('message', expHandler);
                                    await window.GajeDB.saveMemoryIsland(selectedModel, 'documental', ev.data.buffer);
                                }
                            };
                            worker.addEventListener('message', expHandler);

                            if (feedback) {
                                const s = sleepResult.stats || {};
                                feedback.innerText = `✓ [WASM] Ciclo de Sueño completado: ${s.episodic_transferred || 0} transferidos, ${s.duplicates_pruned || 0} podados (Total: ${s.total_documental_entries || 0} docs)`;
                                setTimeout(() => { feedback.style.display = 'none'; }, 4500);
                            }
                            return;
                        }

                        const res = await fetch('/api/memory/epochs/consolidate', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ organism, dedup_threshold: 0.95 })
                        });
                        const data = await res.json();
                        if (feedback) {
                            const s = data.stats || {};
                            feedback.innerText = `✓ Ciclo de Sueño completado: Época ${data.epoch_id} (${s.episodic_transferred || 0} transferidos, ${s.duplicates_pruned || 0} podados)`;
                            setTimeout(() => { feedback.style.display = 'none'; }, 4500);
                        }
                        this.updateEpochsTab();
                    } catch (err) {
                        if (feedback) feedback.innerText = `Error: ${err.message}`;
                    }
                });
            }
        },

        bindStorageActions() {
            const chatWindow = document.getElementById('chat-window');
            const exportDbBtn = document.getElementById('modal-export-db-btn');
            if (exportDbBtn) {
                exportDbBtn.addEventListener('click', async () => {
                    if (window.GajeDB) await window.GajeDB.exportFullDatabase();
                });
            }

            const importDbBtn = document.getElementById('modal-import-db-btn');
            const importDbFile = document.getElementById('modal-import-db-file');
            if (importDbBtn && importDbFile) {
                importDbBtn.addEventListener('click', () => importDbFile.click());
                importDbFile.addEventListener('change', async (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = async (evt) => {
                        if (window.GajeDB) {
                            const res = await window.GajeDB.importFullDatabase(evt.target.result);
                            if (res.success) {
                                alert(`✅ Base de datos restaurada con éxito: ${res.count} mensajes.`);
                                if (chatWindow) chatWindow.innerHTML = '';
                                await ChatStorage.renderHistory();
                            } else {
                                alert(`❌ Error al importar backup: ${res.error}`);
                            }
                        }
                    };
                    reader.readAsText(file);
                    importDbFile.value = '';
                });
            }

            const clearDbBtn = document.getElementById('modal-clear-db-btn');
            if (clearDbBtn) {
                clearDbBtn.addEventListener('click', async () => {
                    if (confirm('¿Estás seguro de que deseas vaciar completamente la base de datos local IndexedDB? Esta acción es irreversible.')) {
                        if (window.GajeDB) {
                            await window.GajeDB.clearAllMessages();
                            if (chatWindow) chatWindow.innerHTML = '';
                            this.updateStorageTabStats();
                        }
                    }
                });
            }
        }
    };

    // =========================================================================
    // 9. PUNTO DE ENTRADA Y BOOTSTRAP
    // =========================================================================
    const bootChat = async () => {
        await ChatToolbarController.init();
        ChatComposerController.init();
        ChatTelemetryController.init();
        await ChatStorage.renderHistory();
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootChat);
    } else {
        bootChat();
    }

    // Exponer API pública controlada para futura modularidad de parciales
    window.GajeChat = {
        State: ChatState,
        Utils: ChatUtils,
        Markdown: ChatMarkdown,
        Storage: ChatStorage,
        Toolbar: ChatToolbarController,
        Engine: ChatEngineController,
        Composer: ChatComposerController,
        Telemetry: ChatTelemetryController,
        reloadToolbar: () => ChatToolbarController.init()
    };
})();
