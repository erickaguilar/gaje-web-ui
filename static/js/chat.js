document.addEventListener('DOMContentLoaded', () => {
    const chatWindow = document.getElementById('chat-window');
    const userInput = document.getElementById('user-input');
    const sendBtn = document.getElementById('send-btn');
    const metricsContent = document.getElementById('metrics-content');
    const dnaStrand = document.getElementById('dna-strand');
    const modelSelect = document.getElementById('model-select');
    const modelDate = document.getElementById('model-date');
    const modelSize = document.getElementById('model-size');
    const modelRam = document.getElementById('model-ram');
    const modelLoadBar = document.getElementById('model-load-bar');
    let envData = null;
    let systemAlertsHistory = [
        `[${new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}] Núcleo GAJE iniciado. Listo para compresión semántica.`
    ];
    let modelsData = [
        { name: 'qwen2_5_3b.flat', size_bytes: 2405756928, date: '2026-08-09 22:57', ram_mb: 0.0 },
        { name: 'deepseek_r1_1_5b.flat', size_bytes: 1324845056, date: '2026-08-21 23:28', ram_mb: 0.0 },
        { name: 'qwen2_0_5b.flat', size_bytes: 522679808, date: '2026-08-09 14:17', ram_mb: 0.0 },
        { name: 'smollm2_135m.flat', size_bytes: 496182528, date: '2026-08-19 00:33', ram_mb: 0.0 }
    ];

    // Cargar modelos disponibles
    async function loadModels(autoLoadEnabled = true) {
        try {
            const response = await fetch('/api/models');
            const data = await response.json();
            if (data && data.models && data.models.length > 0) {
                modelsData = data.models;
                modelSelect.innerHTML = '';
                modelsData.forEach(model => {
                    const opt = document.createElement('option');
                    opt.value = model.name;
                    let label = model.name;
                    if (label === 'qwen2_5_3b.flat') {
                        label = '⚡ Qwen 2.5 3B · Principal';
                    } else if (label === 'deepseek_r1_1_5b.flat') {
                        label = '⚡ DeepSeek-R1 1.5B · CoT';
                    } else if (label === 'feto_genomico_v1.gaje') {
                        label = '🧬 Feto Genómico v1 · Nacido GAJE';
                    } else if (label === 'qwen2_0_5b.flat') {
                        label = '⚡ Qwen 2 0.5B · Micro';
                    } else if (label === 'smollm2_135m.flat') {
                        label = '⚡ SmolLM2 135M · Nano';
                    } else if (label.endsWith('.gaje')) {
                        label = '🧬 ' + label.replace('.gaje', '');
                    } else if (label.endsWith('.flat')) {
                        label = '⚡ ' + label.replace('.flat', '');
                    } else {
                        label = '⚡ ' + label;
                    }
                    opt.innerText = label;
                    modelSelect.appendChild(opt);
                });
                updateModelMeta();

                // Verificar bandera de carga automática por URL o por configuración del servidor
                const urlParams = new URLSearchParams(window.location.search);
                const preloadUrl = urlParams.get('preload');
                const shouldPreload = (preloadUrl !== 'false' && preloadUrl !== '0') && autoLoadEnabled;

                if (modelSelect.value && shouldPreload) {
                    preloadModel(modelSelect.value);
                }
            } else {
                updateModelMeta();
            }
        } catch (err) {
            console.log('Usando modelos por defecto certificados.');
            updateModelMeta();
        }
    }

    // Detectar entorno real de ejecución (arquitectura, CPU, SIMD, Island)
    async function loadEnvInfo() {
        try {
            const response = await fetch('/api/info');
            const info = await response.json();
            if (!info || info.error) return true;
            envData = info;
            const sfEl = document.getElementById('sf-val');
            if (sfEl) sfEl.innerText = info.software || '---';
            const hdEl = document.getElementById('hd-val');
            if (hdEl) hdEl.innerText = info.hardware || '---';
            const archEl = document.getElementById('arch-val');
            if (archEl && info.architecture) archEl.innerText = info.architecture;
            const simdEl = document.getElementById('simd-val');
            if (simdEl && info.simd) simdEl.innerText = info.simd;
            const coresEl = document.getElementById('cores-val');
            if (coresEl && info.cores) coresEl.innerText = info.cores;
            const status = document.querySelector('.status-text');
            if (status && info.simd) status.innerText = info.simd + ' Optimized';

            // Mirror to Modal
            const mSf = document.getElementById('modal-sf-val');
            const mHd = document.getElementById('modal-hd-val');
            const mArch = document.getElementById('modal-arch-val');
            const mSimd = document.getElementById('modal-simd-val');
            const mCores = document.getElementById('modal-cores-val');
            if (mSf) mSf.innerText = info.software || '---';
            if (mHd) mHd.innerText = info.hardware || '---';
            if (mArch && info.architecture) mArch.innerText = info.architecture;
            if (mSimd && info.simd) mSimd.innerText = info.simd;
            if (mCores && info.cores) mCores.innerText = info.cores;

            // GPU Acceleration Telemetry
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

            // Island Model (.gmem) — valores desde el servidor, no hardcodeados
            if (info.island) {
                const pillsHtml = (info.island.pills || [])
                    .map(p => {
                        let typeClass = '';
                        const lower = p.toLowerCase();
                        if (lower.includes('episod') || lower.includes('episodic')) typeClass = 'pill-episodic';
                        else if (lower.includes('doc')) typeClass = 'pill-documental';
                        else if (lower.includes('convers')) typeClass = 'pill-conversational';
                        return `<span class="island-pill ${typeClass}">${p}</span>`;
                    })
                    .join('');

                const pillsEl = document.getElementById('island-pills');
                if (pillsEl) pillsEl.innerHTML = pillsHtml;
                const mPillsEl = document.getElementById('modal-island-pills');
                if (mPillsEl) mPillsEl.innerHTML = pillsHtml;

                if (info.island.memory_type) {
                    const memEl = document.getElementById('island-mem-val');
                    if (memEl) memEl.innerText = info.island.memory_type;
                    const mMem = document.getElementById('modal-island-mem-val');
                    if (mMem) mMem.innerText = info.island.memory_type;
                }
                if (info.island.retrieval_latency_ms != null) {
                    const latEl = document.getElementById('island-lat-val');
                    if (latEl) latEl.innerText = `${info.island.retrieval_latency_ms} ms`;
                    const mLat = document.getElementById('modal-island-lat-val');
                    if (mLat) mLat.innerText = `${info.island.retrieval_latency_ms} ms`;
                }
                if (info.island.context_budget != null) {
                    const budEl = document.getElementById('island-budget-val');
                    if (budEl) budEl.innerText = `${info.island.context_budget} tokens`;
                    const mBud = document.getElementById('modal-island-budget-val');
                    if (mBud) mBud.innerText = `${info.island.context_budget} tokens`;
                }
            }
            return info.auto_load_model !== false;
        } catch (err) {
            console.log('No se pudo detectar el entorno de ejecución.');
            return true;
        }
    }

    function formatBytes(bytes) {
        if (!bytes && bytes !== 0) return '—';
        const gb = bytes / (1024 * 1024 * 1024);
        if (gb >= 1) return gb.toFixed(2) + ' GB';
        const mb = bytes / (1024 * 1024);
        if (mb >= 1) return mb.toFixed(0) + ' MB';
        return Math.round(bytes) + ' B';
    }

    function updateModelMeta() {
        const selected = modelSelect.value;
        const model = modelsData.find(m => m.name === selected);
        if (!model) return;
        if (model.date && modelDate) modelDate.innerText = model.date;
        if (model.size_bytes != null && modelSize) modelSize.innerText = formatBytes(model.size_bytes);
        if (modelRam) {
            const ramMb = model.ram_mb || 0;
            const ramText = ramMb > 0 ? (ramMb >= 1024 ? (ramMb / 1024).toFixed(2) + ' GB' : ramMb.toFixed(0) + ' MB') : '0 MB';
            modelRam.innerHTML = `<span class="ram-led ${ramMb > 0 ? 'active' : ''}"></span><span>${ramText}</span>`;
            modelRam.setAttribute('title', `RAM: ${ramText} · HD: ${formatBytes(model.size_bytes)} · Creado: ${model.date || '—'}`);
        }
    }

    async function refreshModelMeta(modelName) {
        try {
            const response = await fetch('/api/models');
            const data = await response.json();
            if (data && data.models && data.models.length > 0) {
                modelsData = data.models;
                updateModelMeta();
            }
        } catch (err) {
            console.log('No se pudo refrescar los metadatos del modelo.');
        }
    }

    function setModelLoading(active) {
        if (!modelLoadBar) return;
        if (active) {
            modelLoadBar.hidden = false;
            modelLoadBar.setAttribute('aria-valuetext', 'cargando');
            modelLoadBar.setAttribute('aria-valuenow', '');
        } else {
            modelLoadBar.hidden = true;
            modelLoadBar.setAttribute('aria-valuetext', 'inactivo');
        }
        if (chatWindow) chatWindow.setAttribute('aria-busy', active ? 'true' : 'false');
    }

    async function preloadModel(modelName) {
        if (!modelName) return;

        modelSelect.disabled = true;
        userInput.disabled = true;
        sendBtn.disabled = true;

        updateModelMeta();
        setModelLoading(true);
        addMessage(`🧬 Cargando organismo genómico [${modelName}] en el servidor... Por favor espera.`, 'system');

        try {
            const response = await fetch('/api/load_model', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: modelName })
            });

            const data = await response.json();
            if (data.status === 'ok') {
                addMessage(`✅ Organismo [${modelName}] cargado y listo en memoria.`, 'system');
                await refreshModelMeta(modelName); // refrescar RAM real tras la carga
            } else {
                addMessage(`❌ Error cargando el modelo: ${data.error}`, 'bot');
            }
        } catch (err) {
            addMessage(`❌ Error de conexión al cargar [${modelName}].`, 'bot');
            console.error(err);
        } finally {
            setModelLoading(false);
            modelSelect.disabled = false;
            userInput.disabled = false;
            sendBtn.disabled = false;
            userInput.focus();
            // Actualizar el entorno real de ejecución al terminar de cargar el modelo
            loadEnvInfo();
        }
    }

    modelSelect.addEventListener('change', () => {
        preloadModel(modelSelect.value);
    });

    async function init() {
        const autoLoadEnabled = await loadEnvInfo();
        await loadModels(autoLoadEnabled);
    }
    init();

    const clearHistoryBtn = document.getElementById('clear-history-btn');
    if (clearHistoryBtn) {
        clearHistoryBtn.addEventListener('click', () => {
            clearHistory();
            const messages = chatWindow.querySelectorAll('.message');
            messages.forEach(m => { if (!m.classList.contains('system')) m.remove(); });
        });
    }

    const unloadModelBtn = document.getElementById('unload-model-btn');
    if (unloadModelBtn) {
        unloadModelBtn.addEventListener('click', async () => {
            unloadModelBtn.disabled = true;
            addMessage(`🧬 Purgando por completo todos los modelos y buffers de la memoria RAM...`, 'system');
            try {
                const response = await fetch('/api/unload_model', {
                    method: 'POST'
                });
                const data = await response.json();
                if (data.status === 'ok') {
                    addMessage(`✅ Memoria RAM del servidor liberada al 100%. Todos los modelos inactivos.`, 'system');
                    // Resetear la memoria de todos los modelos a 0.0 MB
                    modelsData.forEach(m => { m.ram_mb = 0.0; });
                    updateModelMeta();
                    loadEnvInfo();
                } else {
                    addMessage(`❌ Error liberando los modelos: ${data.error}`, 'bot');
                }
            } catch (err) {
                addMessage(`❌ Error de conexión al intentar liberar la memoria.`, 'bot');
                console.error(err);
            } finally {
                unloadModelBtn.disabled = false;
            }
        });
    }

    function escapeHtml(value) {
        return String(value).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    function formatExactTime(date = new Date()) {
        const d = date instanceof Date ? date : new Date(date);
        if (isNaN(d.getTime())) {
            const now = new Date();
            const hh = String(now.getHours()).padStart(2, '0');
            const mm = String(now.getMinutes()).padStart(2, '0');
            const ss = String(now.getSeconds()).padStart(2, '0');
            const mmm = String(now.getMilliseconds()).padStart(3, '0');
            return `${hh}:${mm}:${ss}::${mmm}`;
        }
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        const ss = String(d.getSeconds()).padStart(2, '0');
        const mmm = String(d.getMilliseconds()).padStart(3, '0');
        return `${hh}:${mm}:${ss}::${mmm}`;
    }

    function formatLatency(ms) {
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
    }

    function copyTextToClipboard(rawText, btnElement) {
        if (!rawText) return;
        
        let textToCopy = rawText;
        if (textToCopy.includes('<think>')) {
            textToCopy = textToCopy.replace(/<think>([\s\S]*?)<\/think>/i, (m, thought) => {
                return `--- [RAZONAMIENTO] ---\n${thought.trim()}\n----------------------\n\n`;
            }).trim();
        }
        
        navigator.clipboard.writeText(textToCopy).then(() => {
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
    }

    function copyEntireChat(btnElement) {
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
                // Limpieza de etiquetas residuales
                content = content.replace(/<\/?(thinks?|answers?|p|div|content)[^>]*>/gi, '').trim();
            }
            
            transcript += `[${role}]:\n${content}\n\n`;
        });
        
        navigator.clipboard.writeText(transcript.trim()).then(() => {
            const originalHtml = btnElement.innerHTML;
            const originalTitle = btnElement.getAttribute('title');
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
    }

    function generateProjectLog(btnElement) {
        const now = new Date().toLocaleString('es-ES', { dateStyle: 'full', timeStyle: 'medium' });
        
        // 1. Metadatos del Modelo Activo
        const selectedModelName = modelSelect.value || 'Desconocido';
        const modelDateText = modelDate ? modelDate.innerText : '—';
        const modelSizeText = modelSize ? modelSize.innerText : '—';
        const modelRamText = modelRam ? modelRam.innerText : '—';

        // 2. Island Model (.gmem)
        const islandMem = (envData && envData.island && envData.island.memory_type) || document.getElementById('island-mem-val')?.innerText || '.gmem (Zero-Copy Mmap)';
        const islandLat = (envData && envData.island && envData.island.retrieval_latency_ms != null) ? `${envData.island.retrieval_latency_ms} ms` : (document.getElementById('island-lat-val')?.innerText || '0.75 ms');
        const islandBudget = (envData && envData.island && envData.island.context_budget != null) ? `${envData.island.context_budget} tokens` : (document.getElementById('island-budget-val')?.innerText || '512 tokens');
        const islandPills = Array.from(document.querySelectorAll('#island-pills .island-pill'))
            .map(p => p.innerText.trim())
            .filter(Boolean)
            .join(' | ') || '⚡ Episódica | 📚 Documental | 💬 Conversación';

        // 3. Entorno de Ejecución y Hardware
        const sfVal = (envData && envData.software) || document.getElementById('sf-val')?.innerText || 'Rust 2021 (AVX2/FMA/AVX/SSE4.2) + PyO3 / Python 3.14.6';
        const hdVal = (envData && envData.hardware) || document.getElementById('hd-val')?.innerText || 'AMD Ryzen 7 5800H with Radeon Graphics - x86_64 (16 cores)';
        const gpuVal = (envData && envData.gpu) ? `${envData.gpu.device_name} (${envData.gpu.backend})` : (document.getElementById('modal-gpu-val')?.innerText || 'AMD Radeon Graphics (Vulkan)');
        const archVal = (envData && envData.architecture) || document.getElementById('arch-val')?.innerText || 'x86_64';
        const simdVal = (envData && envData.simd) || document.getElementById('simd-val')?.innerText || 'AVX2/FMA/AVX/SSE4.2';
        const coresVal = (envData && envData.cores) || document.getElementById('cores-val')?.innerText || '16';
        let latencyVal = document.getElementById('latency-val')?.innerText || '';
        if (!latencyVal || latencyVal.trim() === '—') latencyVal = 'Optimizado para baja latencia SIMD AVX2';

        // 4. Registro Histórico de Alertas del Sistema
        let alertItems = '';
        if (systemAlertsHistory && systemAlertsHistory.length > 0) {
            alertItems = systemAlertsHistory.map(a => `• ${a}`).join('\n');
        } else {
            const domAlerts = Array.from(document.querySelectorAll('#system-alerts-container .system-alert-item'))
                .map(a => a.innerText.trim())
                .filter(Boolean);
            alertItems = domAlerts.length > 0 ? domAlerts.map(a => `• ${a}`).join('\n') : '• [00:00:00] Núcleo GAJE iniciado. Listo para compresión semántica.';
        }

        // 5. Transcripción Secuencial del Chat con Marcas de Tiempo
        const messages = chatWindow.querySelectorAll('.message:not(.system)');
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

        // Construir el reporte completo del proyecto
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
            const originalHtml = btnElement.innerHTML;
            const originalTitle = btnElement.getAttribute('title');
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

    function parseMarkdown(text) {
        if (!text) return '';

        // Limpiar tokens de parada especiales residuales
        let cleanText = text.replace(/<\|im_end\|>|<\|endoftext\|>|<end_of_turn>|<\/s>/gi, '').trim();

        // Renderizar pensamiento <think>...</think> al estilo Apple HIG (Cupertino Thought Disclosure)
        let thoughtHtml = '';

        const thinkMatch = cleanText.match(/<think>([\s\S]*?)(?:<\/think>|$)/i);
        if (thinkMatch) {
            const rawThought = thinkMatch[1].trim();
            cleanText = cleanText.replace(/<think>[\s\S]*?(?:<\/think>|$)/i, '').trim();
            
            if (rawThought) {
                const isFinished = text.includes('</think>');
                let formattedThought = escapeHtml(rawThought);
                formattedThought = formattedThought.replace(/```(\w*)\n([\s\S]*?)\n```/g, '<pre class="code-block"><code class="$1">$2</code></pre>');
                formattedThought = formattedThought.replace(/`([^`\n]+)`/g, '<code class="inline-code">$1</code>');
                formattedThought = formattedThought.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
                formattedThought = formattedThought.replace(/\*([^*]+)\*/g, '<em>$1</em>');
                formattedThought = formattedThought.replace(/\n[-*]\s+([^\n]+)/g, '<br>• $1');
                formattedThought = formattedThought.replace(/\n/g, '<br>');

                thoughtHtml = `
                    <details class="apple-thought-box" ${isFinished ? '' : 'open'}>
                        <summary class="apple-thought-summary">
                            <div class="apple-thought-header">
                                <span class="apple-thought-icon">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <path d="M12 2a8 8 0 0 0-8 8c0 3.4 2.1 6.3 5.1 7.4.3.1.5.4.5.7v1.9c0 .6.4 1 1 1h6.8c.6 0 1-.4 1-1V18c0-.3.2-.6.5-.7 3-1.1 5.1-4 5.1-7.4a8 8 0 0 0-8-8z"/>
                                        <path d="M9 22h6"/>
                                    </svg>
                                </span>
                                <span class="apple-thought-title">Proceso de Razonamiento (${isFinished ? 'completado' : 'pensando...'})</span>
                                <span class="apple-thought-chevron">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                        <polyline points="6 9 12 15 18 9"/>
                                    </svg>
                                </span>
                            </div>
                        </summary>
                        <div class="apple-thought-content">
                            ${formattedThought}
                        </div>
                    </details>
                `;
            }
        }

        let html = escapeHtml(cleanText);
        
        // Parse code blocks: ```javascript\ncode\n```
        html = html.replace(/```(\w*)\n([\s\S]*?)\n```/g, (match, lang, code) => {
            return `<pre class="code-block"><code class="${lang}">${code}</code></pre>`;
        });
        
        // Parse inline code: `code`
        html = html.replace(/`([^`\n]+)`/g, '<code class="inline-code">$1</code>');
        
        // Parse bold: **text**
        html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        
        // Parse italic: *text*
        html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
        
        // Parse bullet points: \n- item or \n* item
        html = html.replace(/\n[-*]\s+([^\n]+)/g, '<br>• $1');
        
        // Parse line breaks
        html = html.replace(/\n/g, '<br>');
        
        return thoughtHtml + (html ? (thoughtHtml ? '<div class="response-body">' + html + '</div>' : html) : '');
    }

    function addMessage(text, type, meta = null, explicitTime = null, modelName = null) {
        if (type === 'system') {
            const nowTime = explicitTime || new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            systemAlertsHistory.push(`[${nowTime}] ${text}`);
            const alertsContainer = document.getElementById('system-alerts-container');
            if (alertsContainer) {
                const item = document.createElement('div');
                item.className = 'system-alert-item';
                item.innerText = `[${nowTime}] ${text}`;
                alertsContainer.appendChild(item);
                alertsContainer.scrollTop = alertsContainer.scrollHeight;
            }
            const modalAlerts = document.getElementById('modal-system-alerts-container');
            if (modalAlerts) {
                const itemM = document.createElement('div');
                itemM.className = 'system-alert-item';
                itemM.innerText = `[${nowTime}] ${text}`;
                modalAlerts.appendChild(itemM);
                modalAlerts.scrollTop = modalAlerts.scrollHeight;
            }
            return;
        }

        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${type}`;
        const msgTime = explicitTime || formatExactTime();
        msgDiv.setAttribute('data-time', msgTime);
        if (type === 'bot') {
            const mName = modelName || modelSelect.value || 'gaje-model';
            msgDiv.setAttribute('data-model', mName);
            if (/^❌|^Error/.test(text)) {
                msgDiv.classList.add('error');
            }
        }

        let html = `<p>${parseMarkdown(text)}</p>`;
        if (type === 'bot') {
            const mName = msgDiv.getAttribute('data-model') || '';
            const latencyStr = meta && meta.latency_ms ? formatLatency(meta.latency_ms) : '';
            html += renderMinimalMetaHtml(meta, mName, latencyStr, text, msgTime);
        }

        msgDiv.innerHTML = html;
        const copyBtn = msgDiv.querySelector('.meta-btn-copy, .meta-copy-btn');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => copyTextToClipboard(text, copyBtn));
        }
        chatWindow.appendChild(msgDiv);
        chatWindow.scrollTop = chatWindow.scrollHeight;
    }

    function renderMinimalMetaHtml(meta, mName, latencyStr, fullText, timeStr = null) {
        const rawName = mName || (modelSelect ? modelSelect.value : '') || 'GAJE';
        const shortModel = rawName.replace('.gaje.flat', '').replace('.flat', '').replace('.gaje', '');
        const bit = (meta && meta.bit_depth) || 4;
        const ratio = (meta && meta.ratio) ? meta.ratio.toFixed(1) : '8.0';
        const saved = (meta && meta.saved) ? meta.saved.toFixed(1) : '87.5';
        const displayTime = timeStr || formatExactTime();
        
        let statsText = '';
        let statsTitle = '';
        if (meta && (meta.tokens_count != null || meta.generated_tokens != null)) {
            const totalTok = meta.tokens_count || 0;
            const pTok = meta.prompt_tokens != null ? meta.prompt_tokens : 0;
            const gTok = meta.generated_tokens != null ? meta.generated_tokens : totalTok;
            const tps = meta.tokens_sec ? ` · ${meta.tokens_sec} tok/s` : '';
            statsText = `${gTok} tok${tps}`;
            statsTitle = `Tokens: ${gTok} generados, ${pTok} prompt (${totalTok} total)${tps} | Cuantización: Q${bit}_0 (${ratio}x · ${saved}% ahorro RAM)`;
        } else if (fullText) {
            const estGen = Math.ceil(fullText.split(/\s+/).filter(Boolean).length * 1.3);
            statsText = `~${estGen} tok`;
            statsTitle = `Generación aproximada: ~${estGen} tokens`;
        }

        const islandHtml = (meta && meta.island) ? `
            <span class="meta-tag meta-island" title="Memoria de largo plazo .gmem: ${escapeHtml(meta.island.retrieval_ms)} ms (+${escapeHtml(meta.island.budget_tokens)} tokens inyectados)">
                🏝️ ${escapeHtml(meta.island.retrieval_ms)}ms
            </span>` : '';

        const quantumHtml = (meta && meta.quantum_embeddings) ? `
            <span class="meta-tag meta-quantum" title="Superposición Cuántica .qemb Activa: Descompresión O(m) en tiempo real con 91.1% ahorro de memoria RAM">
                ⚛️ .qemb
            </span>` : '';

        const gpuHtml = (meta && (meta.gpu_active || meta.gpu_info)) ? `
            <span class="meta-tag meta-gpu" title="Aceleración GPU Activa: Vulkan / AMD Radeon Compute">
                🎮 .gpu
            </span>` : '';

        const wasmHtml = (meta && (meta.is_wasm || meta.backend === 'WASM (Client-Side)')) ? `
            <span class="meta-tag meta-wasm" title="Motor WebAssembly en Navegador: Inferencia local Zero-Server" style="background: rgba(168, 85, 247, 0.15); border-color: rgba(168, 85, 247, 0.35); color: #c084fc;">
                ⚡ .wasm
            </span>` : '';

        return `
            <div class="message-meta">
                <span class="meta-tag meta-model" title="Modelo activo: ${escapeHtml(shortModel)} · Cuantización Q${bit}_0 (${ratio}x · ${saved}% ahorro RAM)">
                    🧬 ${escapeHtml(shortModel)}
                </span>
                ${statsText ? `<span class="meta-tag meta-stats" title="${escapeHtml(statsTitle)}">${escapeHtml(statsText)}</span>` : ''}
                ${wasmHtml}
                ${quantumHtml}
                ${gpuHtml}
                ${islandHtml}
                <span class="meta-tag meta-time" title="Hora de emisión: ${escapeHtml(displayTime)}${latencyStr ? ' | Latencia: ' + escapeHtml(latencyStr) : ''}">
                    <svg class="meta-icon" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <polyline points="12 6 12 12 16 14"></polyline>
                    </svg>
                    <span>${escapeHtml(displayTime)}</span>
                </span>
                ${latencyStr ? `
                <span class="meta-tag meta-latency" title="Tiempo de respuesta total: ${escapeHtml(latencyStr)}">
                    ⏱️ <span>${escapeHtml(latencyStr)}</span>
                </span>` : ''}
                <button class="meta-btn-copy" title="Copiar texto de esta respuesta" aria-label="Copiar texto de esta respuesta">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                    <span>Copiar</span>
                </button>
            </div>
        `;
    }

    function updateMetrics(metrics) {
        if (!metrics) return;
        const sizeLabel = metrics.bit_depth === 4 ? "Compressed:" : "DNA Size:";
        const metricsHtml = `
            <div class="metric-row"><span>Dims:</span> <span class="metric-val">${metrics.dims}</span></div>
            <div class="metric-row"><span>Original:</span> <span class="metric-val">${metrics.original_size}B</span></div>
            <div class="metric-row"><span>${sizeLabel}</span> <span class="metric-val">${metrics.dna_size}B (${metrics.bit_depth || 4}-bit)</span></div>
            <div class="metric-row"><span>Ratio:</span> <span class="metric-val">${(metrics.ratio || 8.0).toFixed(1)}x</span></div>
            <div class="metric-row"><span>Ahorro:</span> <span class="metric-val">${(metrics.saved || 87.5).toFixed(2)}%</span></div>
            <div class="progress-bar-container"><div class="progress-bar-fill" style="width: ${metrics.saved || 87.5}%"></div></div>
            <div class="metric-row"><span>Tokens Usados:</span> <span class="metric-val">${metrics.tokens_count || 0} tok (${metrics.prompt_tokens || 0}p + ${metrics.generated_tokens || 0}g)</span></div>
            <div class="metric-row"><span>Tiempo Resp:</span> <span class="metric-val">${formatLatency(metrics.latency_ms)}</span></div>
        `;

        if (metricsContent) {
            metricsContent.innerHTML = metricsHtml;
        }

        const modalMetrics = document.getElementById('modal-metrics-content');
        if (modalMetrics) {
            modalMetrics.innerHTML = metricsHtml;
        }

        if (metrics.sf_info) {
            const sf = document.getElementById('sf-val');
            if (sf) sf.innerText = metrics.sf_info;
            const mSf = document.getElementById('modal-sf-val');
            if (mSf) mSf.innerText = metrics.sf_info;
        }
        if (metrics.hd_info) {
            const hd = document.getElementById('hd-val');
            if (hd) hd.innerText = metrics.hd_info;
            const mHd = document.getElementById('modal-hd-val');
            if (mHd) mHd.innerText = metrics.hd_info;
        }
        if (metrics.latency_ms) {
            const latText = `${formatLatency(metrics.latency_ms)} (${metrics.tokens_sec || 0} tok/s)`;
            const lat = document.getElementById('latency-val');
            if (lat) lat.innerText = latText;
            const mLat = document.getElementById('modal-latency-val');
            if (mLat) mLat.innerText = latText;
        }
    }

    function updateDNA(strand) {
        if (dnaStrand) dnaStrand.innerHTML = '';
        const modalStrand = document.getElementById('modal-dna-strand');
        if (modalStrand) modalStrand.innerHTML = '';

        strand.split('').forEach(base => {
            if (dnaStrand) {
                const span = document.createElement('span');
                span.className = `dna-char-${base}`;
                span.innerText = base;
                dnaStrand.appendChild(span);
            }

            if (modalStrand) {
                const spanM = document.createElement('span');
                spanM.className = `dna-char-${base}`;
                spanM.innerText = base;
                modalStrand.appendChild(spanM);
            }
        });
    }

    // ===== WASM In-Browser Engine Worker =====
    let wasmWorker = null;
    let isWasmModelLoaded = false;
    let wasmActiveModelName = null;
    const engineModeSelect = document.getElementById('engine-mode-select');
    const wasmHeaderBadge = document.getElementById('wasm-header-badge');

    function initWasmWorker() {
        if (wasmWorker) return wasmWorker;
        wasmWorker = new Worker('static/js/wasm_worker.js', { type: 'module' });
        wasmWorker.postMessage({ action: 'init' });
        wasmWorker.onmessage = (e) => {
            const data = e.data;
            if (data.status === 'ready') {
                console.log('⚡ [GAJE-WASM] Web Worker listo para inferencia.');
            } else if (data.status === 'model_loaded') {
                console.log(`✅ [GAJE-WASM] Modelo ${data.modelName} cargado en ${data.loadTimeMs} ms`, data.info);
                isWasmModelLoaded = true;
                wasmActiveModelName = data.modelName;
                resetAutonomicCycle();
                startAutonomicTick();
                if (modelLoadBar) modelLoadBar.hidden = true;
                if (modelRam) modelRam.innerHTML = `<span class="ram-led active"></span><span>WASM ${data.loadTimeMs}ms</span>`;
                addMessage(`Modelo ${data.modelName} listo en WebAssembly (${data.loadTimeMs} ms).`, 'system');
            } else if (data.status === 'error') {
                console.error('🔥 [GAJE-WASM Error]:', data.error);
                if (modelLoadBar) modelLoadBar.hidden = true;
                addMessage(`Error WASM: ${data.error}`, 'system');
            }
        };
        return wasmWorker;
    }

    // ===== Ciclo Autonómico Periódico (Consolidación Automática en Background) =====
    // Dispara autonomic_sleep_cycle en el Worker sin intervención del usuario:
    //   1. Cada N interacciones de chat exitosas (ritmo de uso).
    //   2. Fallback temporal: si pasaron MAX_AUTONOMIC_INTERVAL_MS desde el último ciclo
    //      y hubo actividad nueva, se consolida en cuanto el navegador esté idle.
    // Usa requestIdleCallback para nunca competir con la UI; el Worker mantiene la
    // inferencia fuera del hilo principal.
    const AUTONOMIC_INTERACTIONS_LIMIT = 12;
    const AUTONOMIC_MAX_INTERVAL_MS = 5 * 60 * 1000;
    const AUTONOMIC_TICK_MS = 60 * 1000;
    let autonomicInteractions = 0;
    let lastAutonomicCycleAt = Date.now();
    let autonomicTickTimer = null;
    let autonomicInFlight = false;

    function scheduleIdleWork(fn, timeoutMs = 4000) {
        if (typeof requestIdleCallback === 'function') {
            requestIdleCallback(fn, { timeout: timeoutMs });
        } else {
            setTimeout(fn, Math.min(timeoutMs, 2000));
        }
    }

    function runAutonomicSleepCycle(reason) {
        const worker = initWasmWorker();
        if (!isWasmModelLoaded || autonomicInFlight || !wasmActiveModelName) return;
        autonomicInFlight = true;
        console.log(`💤 [GAJE-WASM] Ciclo autonómico automático (${reason})...`);

        const modelName = wasmActiveModelName;
        const onCycleDone = async (ev) => {
            worker.removeEventListener('message', onCycleDone);
            worker.removeEventListener('message', onCycleError);
            try {
                if (ev.data.status === 'sleep_cycle_completed') {
                    // Persistir la isla documental consolidada en IndexedDB
                    worker.postMessage({ action: 'export_memory', payload: { niche: 'documental' } });
                    const expHandler = async (exp) => {
                        if (exp.data.status === 'memory_exported' && window.GajeDB && exp.data.niche === 'documental') {
                            worker.removeEventListener('message', expHandler);
                            await window.GajeDB.saveMemoryIsland(modelName, exp.data.niche, exp.data.buffer);
                        }
                    };
                    worker.addEventListener('message', expHandler);

                    const s = ev.data.stats || {};
                    addMessage(`💤 Consolidación autonómica: ${s.episodic_transferred || 0} transferidos, ${s.duplicates_pruned || 0} podados.`, 'system');
                }
            } finally {
                autonomicInFlight = false;
                lastAutonomicCycleAt = Date.now();
                autonomicInteractions = 0;
            }
        };
        const onCycleError = (ev) => {
            if (ev.data.status !== 'error') return;
            worker.removeEventListener('message', onCycleDone);
            worker.removeEventListener('message', onCycleError);
            console.warn('🔥 [GAJE-WASM] Falló ciclo autonómico:', ev.data.error);
            autonomicInFlight = false;
            lastAutonomicCycleAt = Date.now();
            autonomicInteractions = 0;
        };

        worker.addEventListener('message', onCycleDone);
        worker.addEventListener('message', onCycleError);
        worker.postMessage({ action: 'sleep_cycle', payload: { dedupThreshold: 0.95 } });
    }

    function maybeRunAutonomicCycle(reason) {
        if (!isWasmModelLoaded || autonomicInFlight) return;
        const dueByUsage = autonomicInteractions >= AUTONOMIC_INTERACTIONS_LIMIT;
        const dueByTime = (Date.now() - lastAutonomicCycleAt) >= AUTONOMIC_MAX_INTERVAL_MS && autonomicInteractions > 0;
        if (dueByUsage || dueByTime) {
            scheduleIdleWork(() => runAutonomicSleepCycle(reason));
        }
    }

    function registerWasmInteraction() {
        autonomicInteractions += 1;
        maybeRunAutonomicCycle(`uso: ${autonomicInteractions} interacciones`);
    }

    function resetAutonomicCycle() {
        autonomicInteractions = 0;
        lastAutonomicCycleAt = Date.now();
    }

    function startAutonomicTick() {
        if (autonomicTickTimer) return;
        autonomicTickTimer = setInterval(() => maybeRunAutonomicCycle('temporal'), AUTONOMIC_TICK_MS);
    }

    function stopAutonomicTick() {
        if (autonomicTickTimer) {
            clearInterval(autonomicTickTimer);
            autonomicTickTimer = null;
        }
    }

    if (engineModeSelect) {
        engineModeSelect.addEventListener('change', (e) => {
            const mode = e.target.value;
            const gpuHeaderBadge = document.getElementById('gpu-header-badge');
            if (mode === 'wasm') {
                if (wasmHeaderBadge) wasmHeaderBadge.style.display = 'inline-flex';
                if (gpuHeaderBadge) gpuHeaderBadge.style.display = 'none';

                // En navegador WASM (32-bit), sugerir modelo nano / micro (<1GB)
                if (modelSelect && (modelSelect.value === 'qwen2_5_3b.flat' || modelSelect.value === 'deepseek_r1_1_5b.flat')) {
                    modelSelect.value = 'smollm2_135m.flat';
                    updateModelMeta();
                    addMessage('⚡ [WASM] Seleccionado SmolLM2 135M (optimizado para memoria del navegador).', 'system');
                }

                initWasmWorker();
                addMessage('Modo In-Browser WASM (Zero-Server) activado.', 'system');
            } else {
                if (wasmHeaderBadge) wasmHeaderBadge.style.display = 'none';
                stopAutonomicTick();
                if (envData && envData.gpu && gpuHeaderBadge) {
                    gpuHeaderBadge.style.display = 'inline-flex';
                }
                addMessage('Modo Servidor Nativo (AVX2/GPU) activado.', 'system');
            }
        });
    }

    // Soporte para carga de archivos .flat locales 100% Offline / Privada
    const btnLoadLocalFlat = document.getElementById('load-local-flat-btn');
    const inputLocalFlat = document.getElementById('local-flat-file-input');

    if (btnLoadLocalFlat && inputLocalFlat) {
        btnLoadLocalFlat.addEventListener('click', () => {
            inputLocalFlat.click();
        });

        inputLocalFlat.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            if (engineModeSelect) {
                engineModeSelect.value = 'wasm';
                engineModeSelect.dispatchEvent(new Event('change'));
            }

            const worker = initWasmWorker();
            if (modelLoadBar) modelLoadBar.hidden = false;
            addMessage(`📂 Cargando modelo local ${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} MB)...`, 'system');

            const reader = new FileReader();
            reader.onload = async (event) => {
                const buffer = event.target.result;
                const modelName = file.name;

                await new Promise((resolve, reject) => {
                    const handler = async (ev) => {
                        if (ev.data.status === 'model_loaded') {
                            worker.removeEventListener('message', handler);
                            
                            // Restaurar islas de memoria desde IndexedDB
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
        });
    }

    async function wasmChat(text, modelName) {
        const worker = initWasmWorker();
        const botMsg = createBotMessage(modelName);
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

        try {
            if (modelName === 'qwen2_5_3b.flat' || modelName.includes('3b')) {
                throw new Error(`El modelo [${modelName}] (2.25 GB) supera el límite de memoria de WebAssembly (32-bit). Para modelos de 3B, selecciona el modo "Servidor Nativo (AVX2/GPU)".`);
            }

            if (!isWasmModelLoaded || wasmActiveModelName !== modelName) {
                contentEl.textContent = `Descargando ${modelName} a memoria WebAssembly...`;
                if (modelLoadBar) modelLoadBar.hidden = false;
                
                // Intento de descarga desde el endpoint estático o de modelos
                let resp = await fetch(`/models/production/${modelName}`).catch(() => null);
                if (!resp || !resp.ok) {
                    resp = await fetch(`/models/${modelName}`).catch(() => null);
                }
                if (!resp || !resp.ok) {
                    throw new Error(`No se pudo descargar ${modelName} para el navegador. Selecciona un modelo accesible o usa el botón de carga local.`);
                }

                const buffer = await resp.arrayBuffer();
                contentEl.textContent = `Cargando pesos en WASM (${(buffer.byteLength / (1024 * 1024)).toFixed(1)} MB)...`;

                await new Promise((resolve, reject) => {
                    const handler = async (e) => {
                        if (e.data.status === 'model_loaded') {
                            worker.removeEventListener('message', handler);
                            // Restaurar islas de memoria desde IndexedDB
                            if (window.GajeDB) {
                                const docBuf = await window.GajeDB.loadMemoryIsland(modelName, 'documental');
                                if (docBuf) worker.postMessage({ action: 'import_memory', payload: { niche: 'documental', buffer: docBuf } });
                                const convBuf = await window.GajeDB.loadMemoryIsland(modelName, 'conversational');
                                if (convBuf) worker.postMessage({ action: 'import_memory', payload: { niche: 'conversational', buffer: convBuf } });
                            }
                            resolve();
                        } else if (e.data.status === 'error') {
                            worker.removeEventListener('message', handler);
                            reject(new Error(e.data.error));
                        }
                    };
                    worker.addEventListener('message', handler);
                    worker.postMessage({ action: 'load_model', payload: { buffer, modelName } }, [buffer]);
                });
            }

            contentEl.textContent = 'Pensando...';
            const t0 = performance.now();

            const responseData = await new Promise((resolve, reject) => {
                const handler = (e) => {
                    if (e.data.status === 'chat_response') {
                        worker.removeEventListener('message', handler);
                        resolve(e.data);
                    } else if (e.data.status === 'error') {
                        worker.removeEventListener('message', handler);
                        reject(new Error(e.data.error));
                    }
                };
                worker.addEventListener('message', handler);
                worker.postMessage({
                    action: 'chat',
                    payload: { prompt: text, maxTokens: 64, temperature: 0.7, repetitionPenalty: 1.1, injectRag: true }
                });
            });

            const responseText = responseData.response;
            const elapsed = Math.round(performance.now() - t0);
            contentEl.innerHTML = parseMarkdown(responseText);
            botMsg.classList.remove('streaming');
            statusAnchor.remove();

            // Exportar memoria conversacional a IndexedDB
            worker.postMessage({ action: 'export_memory', payload: { niche: 'conversational' } });
            const memExportHandler = async (ev) => {
                if (ev.data.status === 'memory_exported' && window.GajeDB) {
                    worker.removeEventListener('message', memExportHandler);
                    await window.GajeDB.saveMemoryIsland(modelName, ev.data.niche, ev.data.buffer);
                }
            };
            worker.addEventListener('message', memExportHandler);

            // Registrar interacción para el ciclo autonómico periódico
            registerWasmInteraction();

            const approxTokens = Math.max(1, Math.round(responseText.split(/\s+/).filter(Boolean).length * 1.3));
            const wasmMetrics = {
                latency_ms: elapsed,
                prompt_tokens: Math.round(text.length / 4),
                generated_tokens: approxTokens,
                tokens_count: approxTokens + Math.round(text.length / 4),
                tokens_sec: (approxTokens / (elapsed / 1000.0) || 1.0).toFixed(1),
                ratio: 8.0,
                saved: 87.5,
                dna_size: 576,
                original_size: 2304,
                bit_depth: 4,
                backend: 'WASM (Client-Side)',
                is_wasm: true,
                quantum_embeddings: false
            };

            addMetaTo(botMsg, elapsed, 'WASM', responseText, modelName, wasmMetrics);
            pushHistory({ role: 'assistant', content: responseText, model: modelName, metrics: wasmMetrics });
            updateMetrics(wasmMetrics);
            chatWindow.scrollTop = chatWindow.scrollHeight;
            return true;
        } catch (err) {
            if (modelLoadBar) modelLoadBar.hidden = true;
            botMsg.classList.remove('streaming');
            statusAnchor.remove();
            contentEl.innerHTML = `<span style="color: #fca5a5">Error WASM: ${err.message}</span>`;
            chatWindow.scrollTop = chatWindow.scrollHeight;
            return false;
        }
    }

    async function sendMessage() {
        const text = userInput.value.trim();
        const modelSelect = document.getElementById('model-select');
        const modelValue = modelSelect.value;
        const engineMode = document.getElementById('engine-mode-select')?.value || 'native';

        if (!text) return;
        if (!modelValue || modelValue === 'none' || modelValue === '') {
            addMessage('Por favor, selecciona un modelo válido.', 'bot');
            return;
        }

        addMessage(text, 'user');
        pushHistory({ role: 'user', content: text });
        userInput.value = '';
        userInput.disabled = true;
        sendBtn.disabled = true;

        // Vínculo contextual (Fase 1): resaltar el flujo de inferencia en el diagrama
        if (window.ArchView && window.ArchView.isLoaded()) {
            window.ArchView.setFlow('inference');
        }

        if (engineMode === 'wasm') {
            await wasmChat(text, modelValue);
            userInput.disabled = false;
            sendBtn.disabled = false;
            userInput.focus();
            return;
        }

        const ok = await streamChat(text, modelValue);
        if (!ok) {
            await fallbackChat(text, modelValue);
        }

        userInput.disabled = false;
        sendBtn.disabled = false;
        userInput.focus();
    }

    async function getRecentHistory(limit = 8) {
        if (!window.GajeDB) return [];
        try {
            const msgs = await window.GajeDB.getAllMessages();
            return (msgs || []).slice(-limit).map(e => ({ role: e.role, content: e.content }));
        } catch (e) {
            return [];
        }
    }

    // Fallback no-streaming con métricas (si el stream falla)
    async function fallbackChat(text, modelName) {
        try {
            const recentHistory = await getRecentHistory(8);
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: text, model: modelName, history: recentHistory })
            });
            const data = await response.json();
            if (data.error) {
                addMessage(`Error: ${data.error}`, 'bot', null, null, modelName);
            } else {
                addMessage(data.response, 'bot', data.metrics, null, modelName);
                pushHistory({ role: 'assistant', content: data.response, model: modelName });
                updateMetrics(data.metrics);
                updateDNA(data.dna);
            }
        } catch (err) {
            addMessage('Error de conexión con el núcleo GAJE.', 'bot', null, null, modelName);
            console.error(err);
        }
    }

    // ===== Streaming SSE (Fase 2.2) =====
    let abortController = null;

    async function streamChat(message, modelName) {
        const botMsg = createBotMessage(modelName);
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

        abortController = new AbortController();
        const stopBtn = document.getElementById('stop-btn');
        stopBtn.hidden = false;
        if (chatWindow) chatWindow.setAttribute('aria-busy', 'true');

        let fullText = '';
        let started = Date.now();
        let done = false;
        let latestMetrics = null;

        const finish = (aborted) => {
            if (done) return;
            done = true;
            abortController = null;
            stopBtn.hidden = true;
            if (chatWindow) chatWindow.setAttribute('aria-busy', 'false');
            botMsg.classList.remove('streaming');
            statusAnchor.remove(); // Elimina el indicador "Generando" de la UI
            const elapsed = Date.now() - started;
            if (aborted && fullText) {
                addMetaTo(botMsg, elapsed, '⏹️ detenido', fullText, modelName, latestMetrics);
            } else if (!aborted) {
                addMetaTo(botMsg, elapsed, '', fullText, modelName, latestMetrics);
            }
            if (fullText) pushHistory({ role: 'assistant', content: fullText, model: modelName, metrics: latestMetrics });
            chatWindow.scrollTop = chatWindow.scrollHeight;
        };

        const onStop = () => {
            if (abortController) abortController.abort();
        };
        stopBtn.onclick = onStop;

        const recentHistory = await getRecentHistory(8);

        return fetch('/api/chat/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: message, model: modelName, history: recentHistory }),
            signal: abortController.signal
        }).then(async (response) => {
            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                botMsg.remove();
                addMessage(`Error: ${data.error || 'Fallo en el stream'}`, 'bot');
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
                // parse SSE lines: data: ...
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
                                    if (parsed.dna) updateDNA(parsed.dna);
                                    updateMetrics(latestMetrics);
                                    continue;
                                }
                                if (parsed.error) {
                                    throw new Error(parsed.error);
                                }
                            }
                            fullText += (typeof parsed === 'string' ? parsed : '');
                            contentEl.innerHTML = parseMarkdown(fullText);
                            chatWindow.scrollTop = chatWindow.scrollHeight;
                        } catch (e) {
                            if (e.message) {
                                botMsg.remove();
                                addMessage(`Error: ${e.message}`, 'bot');
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
            addMessage('Error de conexión con el núcleo GAJE (streaming).', 'bot');
            finish(true);
            return false;
        });
    }

    function createBotMessage(modelName = null) {
        const msgDiv = document.createElement('div');
        msgDiv.className = 'message bot';
        const msgTime = formatExactTime();
        msgDiv.setAttribute('data-time', msgTime);
        const mName = modelName || modelSelect.value || 'gaje-model';
        msgDiv.setAttribute('data-model', mName);
        return msgDiv;
    }

    function addMetaTo(msgEl, elapsed, prefix = '', fullText = '', modelName = '', metrics = null) {
        const mName = modelName || msgEl.getAttribute('data-model') || '';
        const latencyText = formatLatency(metrics && metrics.latency_ms ? metrics.latency_ms : elapsed);
        const finalLatency = prefix ? `${latencyText} (${prefix})` : latencyText;
        const msgTime = msgEl.getAttribute('data-time') || formatExactTime();

        const tempContainer = document.createElement('div');
        tempContainer.innerHTML = renderMinimalMetaHtml(metrics, mName, finalLatency, fullText, msgTime);
        const meta = tempContainer.firstElementChild;

        const copyBtn = meta.querySelector('.meta-btn-copy, .meta-copy-btn');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                const textToCopy = fullText || msgEl.innerText;
                copyTextToClipboard(textToCopy, copyBtn);
            });
        }
        msgEl.appendChild(meta);
    }

    // ===== Historial y Persistencia (GajeHelixDB via window.GajeDB) =====
    function pushHistory(entry) {
        if (!entry.time) {
            entry.time = formatExactTime();
        }
        if (entry.role === 'assistant' && !entry.model) {
            entry.model = modelSelect ? modelSelect.value : 'GAJE';
        }
        if (window.GajeDB) {
            window.GajeDB.saveMessage(entry);
        }
    }

    function clearHistory() {
        if (window.GajeDB) {
            window.GajeDB.clearAllMessages();
        }
    }

    async function renderHistory() {
        if (!window.GajeDB) return;
        const arr = await window.GajeDB.getAllMessages();
        if (!arr || arr.length === 0) return;
        arr.forEach(entry => {
            if (entry.role === 'user') addMessage(entry.content, 'user', null, entry.time);
            else if (entry.role === 'assistant') addMessage(entry.content, 'bot', entry.meta || null, entry.time, entry.model);
            else if (entry.role === 'system') addMessage(entry.content, 'system', null, entry.time);
        });
        chatWindow.scrollTop = chatWindow.scrollHeight;
    }

    // ===== Telemetría & Modal HUD (Y2K + Apple HIG) =====
    function initTelemetryModal() {
        const modal = document.getElementById('metrics-monitor-modal');
        if (!modal) return;

        const openHeaderBtn = document.getElementById('y2k-open-monitor-btn');
        const openSidebarBtn = document.getElementById('sidebar-open-monitor-btn');

        async function updateStorageTabStats() {
            if (!window.GajeDB) return;
            const countEl = document.getElementById('modal-storage-msg-count');
            const usageEl = document.getElementById('modal-storage-usage-val');
            const quotaEl = document.getElementById('modal-storage-quota-val');

            const count = await window.GajeDB.getMessageCount();
            const est = await window.GajeDB.getStorageEstimate();

            if (countEl) countEl.innerText = `${count} mensajes`;
            if (usageEl) usageEl.innerText = est.usageFormatted;
            if (quotaEl) quotaEl.innerText = est.quotaFormatted !== 'N/A' ? `${est.quotaFormatted} (${est.percentUsed}% en uso)` : 'Ilimitada / No restringida';
        }

        async function updateEpochsTab() {
            const tableBody = document.getElementById('modal-epochs-table-body');
            const feedback = document.getElementById('epoch-action-feedback');
            if (!tableBody) return;

            const selectedModel = modelSelect ? modelSelect.value : 'qwen2_5_3b.flat';
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
                    if (isActive) {
                        tr.style.background = 'rgba(56, 189, 248, 0.08)';
                    }

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
                            updateEpochsTab();
                        } catch (err) {
                            if (feedback) feedback.innerText = `Error: ${err.message}`;
                        }
                    });
                });
            } catch (err) {
                tableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 0.8rem; color: #f87171;">Error cargando épocas: ${err.message}</td></tr>`;
            }
        }

        const btnSnapshot = document.getElementById('btn-epoch-snapshot');
        const btnSleep = document.getElementById('btn-epoch-sleep');
        const btnRefresh = document.getElementById('btn-epoch-refresh');
        const feedback = document.getElementById('epoch-action-feedback');

        if (btnRefresh) btnRefresh.addEventListener('click', updateEpochsTab);

        if (btnSnapshot) {
            btnSnapshot.addEventListener('click', async () => {
                const selectedModel = modelSelect ? modelSelect.value : 'qwen2_5_3b.flat';
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
                    updateEpochsTab();
                } catch (err) {
                    if (feedback) feedback.innerText = `Error: ${err.message}`;
                }
            });
        }

        if (btnSleep) {
            btnSleep.addEventListener('click', async () => {
                const selectedModel = modelSelect ? modelSelect.value : 'qwen2_5_3b.flat';
                const organism = selectedModel.replace('.flat', '').replace('.gaje', '');
                if (feedback) {
                    feedback.style.display = 'block';
                    feedback.innerText = '💤 Ejecutando Ciclo de Sueño: Consolidando y podando memoria volátil...';
                }
                try {
                    if (engineModeSelect && engineModeSelect.value === 'wasm') {
                        const worker = initWasmWorker();
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

                        // Exportar y persistir memoria documental en IndexedDB
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
                    updateEpochsTab();
                } catch (err) {
                    if (feedback) feedback.innerText = `Error: ${err.message}`;
                }
            });
        }

        function openModal() {
            updateStorageTabStats();
            updateEpochsTab();
            if (typeof modal.showModal === 'function') {
                modal.showModal();
            } else {
                modal.setAttribute('open', '');
            }
        }

        function closeModal() {
            if (typeof modal.close === 'function') {
                modal.close();
            } else {
                modal.removeAttribute('open');
            }
        }

        if (openHeaderBtn) openHeaderBtn.addEventListener('click', openModal);
        if (openSidebarBtn) openSidebarBtn.addEventListener('click', openModal);

        // Fallback para cerrar al hacer clic en el backdrop
        if (!('closedBy' in HTMLDialogElement.prototype)) {
            modal.addEventListener('click', (event) => {
                if (event.target !== modal) return;
                const rect = modal.getBoundingClientRect();
                const isDialogContent = (
                    rect.top <= event.clientY &&
                    event.clientY <= rect.top + rect.height &&
                    rect.left <= event.clientX &&
                    event.clientX <= rect.left + rect.width
                );
                if (!isDialogContent) {
                    closeModal();
                }
            });
        }

        // Botones de cierre (Traffic lights y footer)
        const closeDot = document.getElementById('modal-close-dot');
        const closeBtn = document.getElementById('modal-close-btn');
        if (closeDot) closeDot.addEventListener('click', closeModal);
        if (closeBtn) closeBtn.addEventListener('click', closeModal);

        // Controles de ventana macOS (Min / Max)
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

        // Apple HIG Segmented Bar (Tabs)
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
                if (targetId === 'tab-storage') {
                    updateStorageTabStats();
                }
                if (targetId === 'tab-island') {
                    updateEpochsTab();
                }
            });
        });

        // Suscribirse a eventos de cambio en la BD
        window.addEventListener('gaje:db:changed', () => {
            updateStorageTabStats();
        });

        // Botones de Soberanía de Datos (Backup, Import y Clear)
        const exportDbBtn = document.getElementById('modal-export-db-btn');
        if (exportDbBtn) {
            exportDbBtn.addEventListener('click', async () => {
                if (window.GajeDB) {
                    await window.GajeDB.exportFullDatabase();
                }
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
                            chatWindow.innerHTML = '';
                            await renderHistory();
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
                        chatWindow.innerHTML = '';
                        updateStorageTabStats();
                    }
                }
            });
        }
    }

    sendBtn.addEventListener('click', sendMessage);
    userInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });

    const exportLogBtn = document.getElementById('export-log-btn');
    if (exportLogBtn) {
        exportLogBtn.addEventListener('click', () => generateProjectLog(exportLogBtn));
    }

    const copyAllBtn = document.getElementById('copy-all-btn');
    if (copyAllBtn) {
        copyAllBtn.addEventListener('click', () => copyEntireChat(copyAllBtn));
    }

    initTelemetryModal();
    renderHistory();
});
