window.GAJE_STATUS_CODES = {
    200: { code: 'GAJE-200', name: 'OK_SYNTHESIS', title: 'Síntesis Genómica Completada', desc: 'Resonancia semántica calculada y finalizada con éxito.' },
    204: { code: 'GAJE-204', name: 'EOS_DELIMITER', title: 'Delimitador EOS Alcanzado', desc: 'Secuencia finalizada por token de parada (<|im_end|>).' },
    206: { code: 'GAJE-206', name: 'STREAM_ABORTED', title: 'Inferencia Interrumpida', desc: 'Ciclo de generación detenido manualmente por el operador.' },
    404: { code: 'GAJE-404', name: 'GENOME_NOT_FOUND', title: 'Organismo No Encontrado', desc: 'El archivo de pesos .flat solicitado no existe en el catálogo o almacenamiento local.' },
    413: { code: 'GAJE-413', name: 'GENOME_HEAP_OVERFLOW', title: 'Desbordamiento de Memoria en Cliente', desc: 'El modelo excede el límite de memoria del cliente (32-bit heap). Selecciona "Modo Servidor (Nativo Rust AVX2)" en el menú de Motor.' },
    422: { code: 'GAJE-422', name: 'VOCAB_GTOK_MISSING', title: 'Vocabulario GTOK Ausente', desc: 'El archivo .flat no contiene el tokenizador nativo GTOK incrustado necesario para la ejecución local.' },
    500: { code: 'GAJE-500', name: 'KERNEL_PANIC', title: 'Fallo en Kernel Matemático', desc: 'Excepción crítica en la descompresión genómica o cálculo tensorial.' },
    503: { code: 'GAJE-503', name: 'RUNTIME_UNAVAILABLE', title: 'Tronco Encefálico Inactivo', desc: 'El entorno de ejecución del cliente no está inicializado o listo en memoria.' }
};

window.ChatUtils = {
    escapeHtml(value) {
        return String(value).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    },

    getUnixTimestamp() {
        return Date.now() / 1000;
    },

    formatExactTime(posixOrDate = Date.now() / 1000) {
        let d;
        if (typeof posixOrDate === 'number') {
            d = posixOrDate < 10000000000 ? new Date(posixOrDate * 1000) : new Date(posixOrDate);
        } else if (typeof posixOrDate === 'string') {
            const num = parseFloat(posixOrDate);
            if (!isNaN(num) && num > 100000000) {
                d = num < 10000000000 ? new Date(num * 1000) : new Date(num);
            } else {
                d = new Date(posixOrDate);
            }
        } else if (posixOrDate instanceof Date) {
            d = posixOrDate;
        } else {
            d = new Date();
        }

        const target = isNaN(d.getTime()) ? new Date() : d;
        const hh = String(target.getHours()).padStart(2, '0');
        const mm = String(target.getMinutes()).padStart(2, '0');
        const ss = String(target.getSeconds()).padStart(2, '0');
        const mmm = String(target.getMilliseconds()).padStart(3, '0');
        return `${hh}:${mm}:${ss}::${mmm}`;
    },

    formatUnixIso(posixTimestamp) {
        const ms = (typeof posixTimestamp === 'number' && posixTimestamp < 10000000000)
            ? posixTimestamp * 1000
            : Number(posixTimestamp);
        return new Date(isNaN(ms) ? Date.now() : ms).toISOString();
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
                <svg class="y2k-icon" width="12" height="12" style="color:#10b981;"><use href="static/icons/y2k/sprite.svg#i-check"/></svg>
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
                <svg class="y2k-icon" width="15" height="15" style="color:#10b981;" aria-hidden="true"><use href="static/icons/y2k/sprite.svg#i-check"/></svg>
                <span class="visually-hidden">¡Chat Copiado!</span>
            `;
            setTimeout(() => {
                btnElement.classList.remove('copied');
                btnElement.setAttribute('title', originalTitle);
                btnElement.innerHTML = originalHtml;
            }, 2000);
        });
    },

    detectClientHardware() {
        const ua = navigator.userAgent || '';
        let os = 'Dispositivo Web';
        let isMobile = false;

        if (/iPhone/i.test(ua)) { os = 'Apple iOS (iPhone)'; isMobile = true; }
        else if (/iPad/i.test(ua)) { os = 'Apple iPadOS (iPad)'; isMobile = true; }
        else if (/Android/i.test(ua)) { os = 'Android Mobile Device'; isMobile = true; }
        else if (/Macintosh|Mac OS X/i.test(ua)) { os = 'macOS (Apple Silicon / Intel)'; }
        else if (/Windows NT/i.test(ua)) { os = 'Windows Desktop'; }
        else if (/Linux/i.test(ua)) { os = 'Linux OS'; }

        const cores = navigator.hardwareConcurrency ? `${navigator.hardwareConcurrency} Cores` : 'Cores no reportados';
        
        let gpuName = 'WebGL Acelerado por Hardware';
        try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            if (gl) {
                const dbg = gl.getExtension('WEBGL_debug_renderer_info');
                if (dbg) {
                    gpuName = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || gpuName;
                }
            }
        } catch (e) {}

        const ramText = navigator.deviceMemory ? `~${navigator.deviceMemory} GB RAM` : 'Memoria Dinámica Navegador';

        return {
            software: `GAJE Genomic Runtime (Tronco Encefálico SIMD128) · ${os}`,
            hardware: `${os} (${cores}, ${ramText})`,
            gpu: gpuName,
            architecture: isMobile ? 'ARM / Mobile SoC' : (navigator.userAgentData?.platform || 'Cliente Web'),
            simd: 'SIMD128 Genómico + Memoria Zero-Copy (Cliente)',
            cores: navigator.hardwareConcurrency || '—',
            latency: 'Inferencia en Tronco Encefálico Local (Zero-Server)'
        };
    },

    generateProjectLog(btnElement) {
        const now = new Date().toLocaleString('es-ES', { dateStyle: 'full', timeStyle: 'medium' });
        const modelSelect = document.getElementById('model-select');
        const modelDate = document.getElementById('model-date');
        const modelSize = document.getElementById('model-size');
        const modelRam = document.getElementById('model-ram');
        const chatWindow = document.getElementById('chat-window');

        const selectedModelName = modelSelect ? modelSelect.value : (window.ChatState?.activeModel || 'Desconocido');
        const modelDateText = modelDate ? modelDate.innerText.trim() : '';
        const modelSizeText = modelSize ? modelSize.innerText.trim() : '';
        const modelRamText = modelRam ? modelRam.innerText.trim() : '';

        const envData = window.ChatState?.envData;
        const clientHw = this.detectClientHardware();

        const islandMem = (envData && envData.island && envData.island.memory_type) || '.gmem (IndexedDB GajeHelixDB Zero-Server)';
        const islandLat = (envData && envData.island && envData.island.retrieval_latency_ms != null) ? `${envData.island.retrieval_latency_ms} ms` : '0.45 ms (IndexedDB Local)';
        const islandBudget = (envData && envData.island && envData.island.context_budget != null) ? `${envData.island.context_budget} tokens` : '512 tokens';
        const islandPills = Array.from(document.querySelectorAll('#island-pills .island-pill'))
            .map(p => p.innerText.trim())
            .filter(Boolean)
            .join(' | ') || '⚡ Episódica | 📚 Documental | 💬 Conversación';

        const sfVal = (envData && envData.software) || clientHw.software;
        const hdVal = (envData && envData.hardware) || clientHw.hardware;

        let gpuVal = clientHw.gpu;
        if (envData && envData.gpu) {
            if (typeof envData.gpu === 'object' && envData.gpu.device_name) {
                gpuVal = envData.gpu.backend ? `${envData.gpu.device_name} (${envData.gpu.backend})` : envData.gpu.device_name;
            } else if (typeof envData.gpu === 'string' && envData.gpu.trim().length > 0) {
                gpuVal = envData.gpu;
            }
        }
        if (!gpuVal || gpuVal === 'undefined (undefined)' || gpuVal.includes('undefined')) {
            gpuVal = clientHw.gpu || 'Aceleración WebGL Integrada';
        }

        let archVal = (envData && envData.architecture) || clientHw.architecture || 'x86_64';
        const coresVal = (envData && envData.cores) || clientHw.cores || '—';
        let archFormatted = archVal;
        if (!archFormatted.includes('Cores:') && !archFormatted.includes('Cores') && coresVal && coresVal !== '—') {
            archFormatted = `${archFormatted} (Cores: ${coresVal})`;
        }

        const simdVal = (envData && envData.simd) || clientHw.simd;
        let latencyVal = (envData && envData.latency) || (envData && envData.throughput) || clientHw.latency;

        let alertItems = '';
        if (window.ChatState?.systemAlertsHistory && window.ChatState.systemAlertsHistory.length > 0) {
            alertItems = window.ChatState.systemAlertsHistory.map(a => `• ${a}`).join('\n');
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

        const modelInfoLines = [`• Archivo del Modelo: ${selectedModelName}`];
        if (modelDateText && modelDateText !== '—' && modelDateText !== '---') {
            modelInfoLines.push(`• Fecha de Compilación: ${modelDateText}`);
        }
        if (modelSizeText && modelSizeText !== '—' && modelSizeText !== '---') {
            modelInfoLines.push(`• Tamaño: ${modelSizeText}`);
        }
        if (modelRamText && modelRamText !== '—' && modelRamText !== '---') {
            modelInfoLines.push(`• Inicialización: ${modelRamText}`);
        }

        const logContent = `================================================================================
🧬 GAJE HELIX — BITÁCORA Y REGISTRO COMPLETO DEL PROYECTO (SYSTEM AUDIT LOG)
Fecha y Hora de Generación: ${now}
================================================================================

📦 1. MODELO GENÓMICO ACTIVO
--------------------------------------------------------------------------------
${modelInfoLines.join('\n')}

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
• Arquitectura CPU: ${archFormatted}
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
                <svg class="y2k-icon" width="15" height="15" style="color:#10b981;" aria-hidden="true"><use href="static/icons/y2k/sprite.svg#i-check"/></svg>
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
    },

    showToast(message, type = 'info', duration = 6000, meta = null) {
        let container = document.getElementById('y2k-toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'y2k-toast-container';
            container.className = 'y2k-toast-container';
            container.setAttribute('aria-live', 'polite');
            document.body.appendChild(container);
        }

        const iconMap = {
            success: 'i-check',
            info: 'i-info',
            warning: 'i-alert',
            error: 'i-alert',
            inference: 'i-bolt',
            dna: 'i-sparkle'
        };

        const iconId = iconMap[type] || 'i-info';
        const toast = document.createElement('div');
        toast.className = `y2k-toast y2k-toast-${type}`;
        toast.setAttribute('role', 'status');

        const exactTime = this.formatExactTime();
        let metaHtml = '';
        if (meta && typeof meta === 'object') {
            const parts = [];
            if (meta.code) parts.push(`<span class="toast-code-badge">${this.escapeHtml(meta.code)}</span>`);
            if (meta.model) parts.push(`<span class="toast-meta-pill">${this.escapeHtml(meta.model)}</span>`);
            if (meta.latency) parts.push(`<span class="toast-meta-pill">${this.escapeHtml(meta.latency)}</span>`);
            if (meta.speed) parts.push(`<span class="toast-meta-pill">${this.escapeHtml(meta.speed)}</span>`);
            if (parts.length > 0) metaHtml = `<div class="toast-meta-row">${parts.join('')}</div>`;
        }

        const progressHtml = duration > 0
            ? `<div class="toast-progress-track"><div class="toast-progress-bar" style="animation-duration: ${duration}ms;"></div></div>`
            : '';

        toast.innerHTML = `
            <div class="toast-icon-wrap">
                <svg class="y2k-icon"><use href="static/icons/y2k/sprite.svg#${iconId}"/></svg>
            </div>
            <div class="toast-body">
                <div class="toast-header-row">
                    <span class="toast-title">${type === 'success' ? 'Inferencia Completada' : type === 'warning' ? 'Aviso' : type === 'error' ? 'Error' : 'Sistema'}</span>
                    <time class="toast-time">${exactTime}</time>
                </div>
                <div class="toast-msg">${this.escapeHtml(message)}</div>
                ${metaHtml}
            </div>
            <button type="button" class="toast-close-btn" aria-label="Cerrar notificación">
                <svg class="y2k-icon-inline"><use href="static/icons/y2k/sprite.svg#i-close"/></svg>
            </button>
            ${progressHtml}
        `;

        const closeBtn = toast.querySelector('.toast-close-btn');
        let dismissed = false;
        const dismiss = () => {
            if (dismissed) return;
            dismissed = true;
            toast.classList.add('dismissing');
            setTimeout(() => {
                toast.remove();
                if (container.children.length === 0) {
                    container.remove();
                }
            }, 220);
        };

        if (closeBtn) closeBtn.onclick = dismiss;

        let timerId = null;
        let remainingTime = duration;
        let startTime = Date.now();

        const startTimer = (ms) => {
            if (ms <= 0) return;
            startTime = Date.now();
            timerId = setTimeout(dismiss, ms);
        };

        if (duration > 0) {
            startTimer(duration);

            // Pausar temporizador si el usuario pasa el cursor sobre el toast para leer
            toast.addEventListener('mouseenter', () => {
                if (timerId) {
                    clearTimeout(timerId);
                    timerId = null;
                    remainingTime -= (Date.now() - startTime);
                    toast.classList.add('paused');
                }
            });

            toast.addEventListener('mouseleave', () => {
                if (!dismissed && remainingTime > 0) {
                    toast.classList.remove('paused');
                    startTimer(remainingTime);
                }
            });
        }

        container.appendChild(toast);
        return toast;
    }
};
