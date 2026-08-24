/* =============================================================================
   🧬 GAJE — static/js/chat/utils.js
   Utilidades, formateadores temporales, métricas y copiado al portapapeles.
   ============================================================================= */

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

    generateProjectLog(btnElement) {
        const now = new Date().toLocaleString('es-ES', { dateStyle: 'full', timeStyle: 'medium' });
        const modelSelect = document.getElementById('model-select');
        const modelDate = document.getElementById('model-date');
        const modelSize = document.getElementById('model-size');
        const modelRam = document.getElementById('model-ram');
        const chatWindow = document.getElementById('chat-window');

        const selectedModelName = modelSelect ? modelSelect.value : (window.ChatState?.activeModel || 'Desconocido');
        const modelDateText = modelDate ? modelDate.innerText : '—';
        const modelSizeText = modelSize ? modelSize.innerText : '—';
        const modelRamText = modelRam ? modelRam.innerText : '—';

        const envData = window.ChatState?.envData;
        const islandMem = (envData && envData.island && envData.island.memory_type) || document.getElementById('island-mem-val')?.innerText || '.gmem (Zero-Copy Mmap)';
        const islandLat = (envData && envData.island && envData.island.retrieval_latency_ms != null) ? `${envData.island.retrieval_latency_ms} ms` : (document.getElementById('island-lat-val')?.innerText || '0.75 ms');
        const islandBudget = (envData && envData.island && envData.island.context_budget != null) ? `${envData.island.context_budget} tokens` : (document.getElementById('island-budget-val')?.innerText || '512 tokens');
        const islandPills = Array.from(document.querySelectorAll('#island-pills .island-pill'))
            .map(p => p.innerText.trim())
            .filter(Boolean)
            .join(' | ') || '⚡ Episódica | 📚 Documental | 💬 Conversación';

        const sfVal = (envData && envData.software) || document.getElementById('sf-val')?.innerText || 'Rust 2021 (AVX2/FMA/AVX/SSE4.2) + PyO3 / Python 3.14.6';
        const hdVal = (envData && envData.hardware) || document.getElementById('hd-val')?.innerText || 'AMD Ryzen 7 5800H with Radeon Graphics - x86_64 (16 cores)';
        const gpuVal = (envData && envData.gpu) ? `${envData.gpu.device_name} (${envData.gpu.backend})` : (document.getElementById('modal-gpu-val')?.innerText || 'AMD Radeon Graphics (Vulkan)');
        const archVal = (envData && envData.architecture) || document.getElementById('arch-val')?.innerText || 'x86_64';
        const simdVal = (envData && envData.simd) || document.getElementById('simd-val')?.innerText || 'AVX2/FMA/AVX/SSE4.2';
        const coresVal = (envData && envData.cores) || document.getElementById('cores-val')?.innerText || '16';
        let latencyVal = document.getElementById('latency-val')?.innerText || '';
        if (!latencyVal || latencyVal.trim() === '—') latencyVal = 'Optimizado para baja latencia SIMD AVX2';

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
    }
};
