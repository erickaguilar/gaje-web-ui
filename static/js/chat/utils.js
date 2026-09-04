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
        const dateObj = new Date();
        const nowFormatted = dateObj.toLocaleString('es-ES', { dateStyle: 'full', timeStyle: 'medium' });
        const isoTimestamp = dateObj.toISOString();
        const fileTimestamp = dateObj.toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const auditId = `GAJE-${dateObj.getFullYear()}${String(dateObj.getMonth() + 1).padStart(2, '0')}${String(dateObj.getDate()).padStart(2, '0')}-${String(dateObj.getHours()).padStart(2, '0')}${String(dateObj.getMinutes()).padStart(2, '0')}${String(dateObj.getSeconds()).padStart(2, '0')}`;

        const modelSelect = document.getElementById('model-select');
        const modelDate = document.getElementById('model-date');
        const modelSize = document.getElementById('model-size');
        const modelRam = document.getElementById('model-ram');
        const chatWindow = document.getElementById('chat-window');

        const selectedModelName = modelSelect ? modelSelect.value : (window.ChatState?.activeModel || 'gaje_pico_135m.flat');
        const activeModelObj = window.ChatState?.modelsData?.find(m => m.name === selectedModelName);
        const modelDateText = modelDate ? modelDate.innerText.trim() : (activeModelObj?.date || '—');
        const modelSizeText = (modelSize && modelSize.innerText.trim() && modelSize.innerText.trim() !== '—') ? modelSize.innerText.trim() : (activeModelObj?.size_bytes ? this.formatBytes(activeModelObj.size_bytes) : '1.5 GB');
        const engineMode = window.ChatState?.engineMode || (window.ChatState?.isWasmModelLoaded ? 'wasm' : 'native');
        const modelRamText = (modelRam && modelRam.innerText.trim() && modelRam.innerText.trim() !== '—') ? modelRam.innerText.trim() : (engineMode === 'native' ? 'Servidor Nativo Mmap' : 'WASM In-Browser');

        const envData = window.ChatState?.envData;
        const clientHw = this.detectClientHardware();
        const engineMode = window.ChatState?.engineMode || (window.ChatState?.isWasmModelLoaded ? 'wasm' : 'native');
        const engineModeLabel = engineMode === 'wasm' ? 'WebAssembly In-Browser (Zero-Server / Offline)' : 'Servidor Nativo Rust (AVX2 / Mmap Zero-Copy)';

        const islandMem = (envData && envData.island && envData.island.memory_type) || '.gmem (IndexedDB GajeHelixDB Zero-Server)';
        const islandLat = (envData && envData.island && envData.island.retrieval_latency_ms != null) ? `${envData.island.retrieval_latency_ms} ms` : '0.45 ms (IndexedDB Local)';
        const islandBudget = (envData && envData.island && envData.island.context_budget != null) ? `${envData.island.context_budget} tokens` : '512 tokens';
        const islandPills = Array.from(document.querySelectorAll('#island-pills .island-pill'))
            .map(p => p.innerText.trim())
            .filter(Boolean)
            .join(' | ') || '⚡ Episódica | 📚 Documental | 💬 Conversación';

        const sfVal = (envData && envData.software) || clientHw.software || `GAJE Genomic Runtime · v${window.GAJE_CONFIG?.version || '1.7.8'}`;
        const hdVal = (envData && envData.hardware) || clientHw.hardware || 'Cliente Web Browser x86_64 / ARM64';

        let gpuVal = clientHw.gpu;
        if (envData && envData.gpu) {
            if (typeof envData.gpu === 'object' && envData.gpu.device_name) {
                gpuVal = envData.gpu.backend ? `${envData.gpu.device_name} (${envData.gpu.backend})` : envData.gpu.device_name;
            } else if (typeof envData.gpu === 'string' && envData.gpu.trim().length > 0) {
                gpuVal = envData.gpu;
            }
        }
        if (!gpuVal || gpuVal === 'undefined (undefined)' || gpuVal.includes('undefined')) {
            gpuVal = clientHw.gpu || 'Aceleración WebGL / WebGPU Integrada';
        }

        let archVal = (envData && envData.architecture) || clientHw.architecture || 'x86_64';
        const coresVal = (envData && envData.cores) || clientHw.cores || navigator.hardwareConcurrency || '—';
        let archFormatted = archVal;
        if (!archFormatted.includes('Cores:') && !archFormatted.includes('Cores') && coresVal && coresVal !== '—') {
            archFormatted = `${archFormatted} (Cores: ${coresVal})`;
        }

        const simdVal = (envData && envData.simd) || clientHw.simd || 'SIMD128 Genómico + Zero-Copy Memory';
        let latencyVal = (envData && envData.latency) || (envData && envData.throughput) || clientHw.latency || 'Inferencia en Tronco Encefálico Local (Zero-Server)';

        // 1. Recolección de alertas del sistema
        let alertItems = '';
        if (window.ChatState?.systemAlertsHistory && window.ChatState.systemAlertsHistory.length > 0) {
            alertItems = window.ChatState.systemAlertsHistory.map(a => `* ${a}`).join('\n');
        } else {
            const domAlerts = Array.from(document.querySelectorAll('#system-alerts-container .system-alert-item'))
                .map(a => a.innerText.trim())
                .filter(Boolean);
            alertItems = domAlerts.length > 0 ? domAlerts.map(a => `* ${a}`).join('\n') : '* [00:00:00] Núcleo GAJE iniciado. Listo para compresión semántica.';
        }

        // 2. Procesamiento de mensajes y cálculo de telemetría acumulada
        const messages = chatWindow ? chatWindow.querySelectorAll('.message:not(.system)') : [];
        let userTurnCount = 0;
        let assistantTurnCount = 0;
        let totalTokensGenerated = 0;
        let speedSum = 0;
        let speedCount = 0;
        let latencySum = 0;
        let latencyCount = 0;
        const observedStatusCodes = new Set(['GAJE-200 (OK_SYNTHESIS)']);

        let transcriptMd = '';

        if (messages.length === 0) {
            transcriptMd = '*No se registraron turnos de conversación en esta sesión.*';
        } else {
            let turnIndex = 1;
            messages.forEach((msg) => {
                const isUser = msg.classList.contains('user');
                const time = msg.getAttribute('data-time') || '—';
                const unixTime = msg.getAttribute('data-unix-time') || '—';
                const msgModel = msg.getAttribute('data-model') || selectedModelName;

                if (isUser) {
                    userTurnCount++;
                    const p = msg.querySelector('p');
                    const userText = p ? p.innerText.trim() : msg.innerText.trim();

                    transcriptMd += `### 👤 Turno ${turnIndex} — Usuario\n`;
                    transcriptMd += `* **Marca de Tiempo:** \`${time}\` *(POSIX: \`${unixTime}s\`)*\n\n`;
                    transcriptMd += `> 💬 **Mensaje:**\n`;
                    transcriptMd += `> ${userText.replace(/\n/g, '\n> ')}\n\n`;
                    turnIndex++;
                } else {
                    assistantTurnCount++;

                    // Extracción de razonamiento (<think>)
                    let thoughtText = '';
                    const thoughtEl = msg.querySelector('.apple-thought-content');
                    if (thoughtEl) {
                        const rawT = thoughtEl.innerText.trim();
                        if (rawT) thoughtText = rawT;
                    }

                    // Extracción de cuerpo de respuesta
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

                    // Extracción y agregación de métricas
                    const metaBadges = Array.from(msg.querySelectorAll('.message-meta .meta-tag:not(.meta-btn-copy), .message-meta .meta-badge:not(.meta-copy-btn)'))
                        .map(b => b.innerText.trim())
                        .filter(Boolean);

                    let tokensThisTurn = 0;
                    let speedThisTurn = 0;
                    let latencyThisTurn = 0;

                    metaBadges.forEach(b => {
                        const tokMatch = b.match(/(\d+)\s*tokens?/i);
                        if (tokMatch) tokensThisTurn = parseInt(tokMatch[1], 10);

                        const speedMatch = b.match(/([\d.]+)\s*tok\/s/i);
                        if (speedMatch) speedThisTurn = parseFloat(speedMatch[1]);

                        const latMatch = b.match(/([\d.]+)\s*ms/i);
                        if (latMatch) latencyThisTurn = parseFloat(latMatch[1]);

                        if (b.includes('GAJE-')) observedStatusCodes.add(b);
                    });

                    if (tokensThisTurn === 0 && bodyText && bodyText.length > 0 && !bodyText.includes('GAJE-204')) {
                        tokensThisTurn = Math.max(1, Math.round(bodyText.trim().split(/\s+/).length * 1.3));
                    }

                    if (tokensThisTurn > 0) totalTokensGenerated += tokensThisTurn;
                    if (speedThisTurn > 0) {
                        speedSum += speedThisTurn;
                        speedCount++;
                    } else if (latencyThisTurn > 0 && tokensThisTurn > 0) {
                        const estSpeed = (tokensThisTurn / (latencyThisTurn / 1000));
                        speedSum += estSpeed;
                        speedCount++;
                    }
                    if (latencyThisTurn > 0) {
                        latencySum += latencyThisTurn;
                        latencyCount++;
                    }

                    transcriptMd += `### 🧬 GAJE AI [\`${msgModel}\`]\n`;
                    transcriptMd += `* **Marca de Tiempo:** \`${time}\` *(POSIX: \`${unixTime}s\`)*\n\n`;

                    if (thoughtText) {
                        transcriptMd += `> [!NOTE] **Proceso de Razonamiento Interno (Chain-of-Thought)**\n`;
                        transcriptMd += `> ${thoughtText.replace(/\n/g, '\n> ')}\n\n`;
                    }

                    transcriptMd += `**Respuesta Generada:**\n\n${bodyText}\n\n`;

                    if (metaBadges.length > 0) {
                        transcriptMd += `**📊 Telemetría del Turno:** \`${metaBadges.join('` · `')}\`\n\n`;
                    }

                    transcriptMd += `---\n\n`;
                }
            });
        }

        const avgSpeed = speedCount > 0 ? (speedSum / speedCount) : 0;
        const avgLatency = latencyCount > 0 ? (latencySum / latencyCount) : 0;
        const statusCodesFormatted = Array.from(observedStatusCodes).join(', ');

        // 3. Construcción del documento Markdown completo (GFM + Frontmatter)
        const logContent = `---
audit_id: "${auditId}"
application: "GAJE Helix Semantic Compression Platform"
version: "${window.GAJE_CONFIG?.version || '1.7.8'}"
model: "${selectedModelName}"
engine_mode: "${engineMode}"
generated_at: "${isoTimestamp}"
session_turns: ${userTurnCount + assistantTurnCount}
total_tokens_generated: ${totalTokensGenerated}
avg_throughput_tok_s: ${avgSpeed.toFixed(2)}
---

# 🧬 GAJE HELIX — Bitácora y Registro de Auditoría

> **Fecha y Hora de Generación:** ${nowFormatted}  
> **Identificador Único de Auditoría:** \`${auditId}\`  
> **Modo de Operación:** \`${engineModeLabel}\`

---

## 📦 1. Organismo Genómico y Modelo Activo

| Propiedad | Valor Registrado |
| :--- | :--- |
| **Archivo del Modelo** | \`${selectedModelName}\` |
| **Arquitectura Cuantizada** | \`Q4_0 (Cuerpo Transformer) + FP32 (Embeddings / LM Head)\` |
| **Formato Binario** | \`.gaje.flat v2\` (Zero-Copy Mmap Alignment) |
| **Tamaño en Disco / Caché** | \`${modelSizeText}\` |
| **Estado / Memoria Residente** | \`${modelRamText}\` |

---

## 🏝️ 2. Memoria Persistente Island Model (\`.gmem\`)

| Parámetro | Configuración Activa |
| :--- | :--- |
| **Motor de Persistencia** | \`${islandMem}\` |
| **Latencia Media de Recuperación** | \`${islandLat}\` |
| **Presupuesto de Contexto RAG** | \`${islandBudget}\` |
| **Islas de Memoria Activas** | \`${islandPills}\` |

---

## ⚙️ 3. Entorno de Ejecución y Hardware

| Componente | Especificación Detectada |
| :--- | :--- |
| **Software Runtime** | \`${sfVal}\` |
| **Hardware Anfitrión** | \`${hdVal}\` |
| **Aceleración Gráfica (GPU)** | \`${gpuVal}\` |
| **Arquitectura de CPU** | \`${archFormatted}\` |
| **Conjunto de Instrucciones SIMD** | \`${simdVal}\` |
| **Perfil de Latencia** | \`${latencyVal}\` |

---

## 📊 4. Telemetría Acumulada de la Sesión

| Métrica Global | Valor Medido |
| :--- | :--- |
| **Total de Turnos de Usuario** | \`${userTurnCount}\` turnos |
| **Total de Respuestas del Asistente** | \`${assistantTurnCount}\` turnos |
| **Volumen Total de Tokens Generados** | \`${totalTokensGenerated}\` tokens |
| **Throughput Promedio de la Sesión** | \`${avgSpeed > 0 ? avgSpeed.toFixed(2) + ' tok/s' : '—'}\` |
| **Latencia Promedio E2E** | \`${avgLatency > 0 ? avgLatency.toFixed(2) + ' ms' : '—'}\` |
| **Códigos de Estado GAJE Observados** | \`${statusCodesFormatted}\` |

---

## 🎛️ 5. Parámetros de Generación y Sampler

| Hiperparámetro | Valor de Configuración |
| :--- | :--- |
| **Sampling Mode** | \`Lagrangian Minimal Action / Greedy Hybrid\` |
| **Temperatura Base** | \`${(window.ChatState?.temperature ?? 0.3).toFixed(2)}\` |
| **Top-P / Min-P** | \`0.90\` / \`0.05\` |
| **Repetition Penalty** | \`1.15\` |
| **Límite de Contexto Activo** | \`2048 tokens\` |

---

## 🔔 6. Registro de Alertas y Eventos del Sistema

${alertItems}

---

## 💬 7. Transcripción Secuencial de la Conversación

${transcriptMd.trim()}

---

*Fin del registro de auditoría — GAJE Helix Native Runtime v${window.GAJE_CONFIG?.version || '1.7.8'}*
`;

        // 4. Descarga automática del archivo Markdown (.md)
        try {
            const filename = `gaje_audit_log_${fileTimestamp}.md`;
            const blob = new Blob([logContent], { type: 'text/markdown;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            setTimeout(() => {
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
            }, 150);
        } catch (e) {
            console.warn('[GAJE] No se pudo iniciar la descarga automática del archivo:', e);
        }

        // 5. Copia al portapapeles y retroalimentación visual interactiva
        navigator.clipboard.writeText(logContent).then(() => {
            // Toast interactivo de confirmación
            if (typeof this.showToast === 'function') {
                this.showToast('Bitácora (.md) descargada y copiada al portapapeles con éxito.', 'success', 4000, {
                    code: 'GAJE-EXPORT',
                    model: selectedModelName
                });
            }

            if (!btnElement) return;
            const originalHtml = btnElement.innerHTML;
            const originalTitle = btnElement.getAttribute('title') || '';
            btnElement.classList.add('copied');
            btnElement.setAttribute('title', '¡Bitácora descargada y copiada!');
            btnElement.innerHTML = `
                <svg class="y2k-icon" width="15" height="15" style="color:#10b981;" aria-hidden="true"><use href="static/icons/y2k/sprite.svg#i-check"/></svg>
                <span class="visually-hidden">¡Bitácora Exportada!</span>
            `;
            setTimeout(() => {
                btnElement.classList.remove('copied');
                btnElement.setAttribute('title', originalTitle);
                btnElement.innerHTML = originalHtml;
            }, 2500);
        }).catch(err => {
            console.error('Error al copiar el log del proyecto:', err);
            if (typeof this.showToast === 'function') {
                this.showToast('Bitácora descargada como archivo .md.', 'info', 4000);
            }
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
